//! 超分服务工作线程模块
//!
//! 包含工作线程启动逻辑、任务处理循环

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::commands::pyo3_upscale_commands::PyO3UpscalerState;
use crate::commands::upscale_service_commands::FrontendCondition;
use crate::core::upscale_settings::ConditionalUpscaleSettings;

use super::config::UpscaleServiceConfig;
use super::events::{UpscaleReadyPayload, UpscaleStatus};
use super::log_debug;
use super::queue::get_highest_priority_task;
use super::task_processor::process_task_v2;
use super::types::{CacheEntry, TaskPriority, UpscaleTask};

/// 启动工作线程
#[allow(clippy::too_many_arguments)]
pub fn start_workers(
    config: &UpscaleServiceConfig,
    app: AppHandle,
    running: Arc<AtomicBool>,
    enabled: Arc<AtomicBool>,
    task_queue: Arc<Mutex<VecDeque<UpscaleTask>>>,
    pending_set: Arc<RwLock<HashSet<(String, usize)>>>,
    current_book: Arc<RwLock<Option<String>>>,
    cache_map: Arc<RwLock<HashMap<(String, usize), CacheEntry>>>,
    cache_dir: std::path::PathBuf,
    processing_set: Arc<RwLock<HashSet<(String, usize)>>>,
    active_tasks: Arc<RwLock<HashMap<(String, usize), UpscaleTask>>>,
    cancelled_jobs: Arc<RwLock<HashSet<String>>>,
    skipped_pages: Arc<RwLock<HashSet<(String, usize)>>>,
    failed_pages: Arc<RwLock<HashSet<(String, usize)>>>,
    completed_count: Arc<AtomicUsize>,
    skipped_count: Arc<AtomicUsize>,
    failed_count: Arc<AtomicUsize>,
    queue_wait_sample_count: Arc<AtomicUsize>,
    queue_wait_total_ms: Arc<AtomicU64>,
    queue_wait_max_ms: Arc<AtomicU64>,
    py_state: Arc<PyO3UpscalerState>,
    condition_settings: Arc<RwLock<ConditionalUpscaleSettings>>,
    conditions_list: Arc<RwLock<Vec<FrontendCondition>>>,
) -> Vec<JoinHandle<()>> {
    let mut workers = Vec::new();

    for i in 0..config.worker_threads {
        let app = app.clone();
        let running = Arc::clone(&running);
        let enabled = Arc::clone(&enabled);
        let task_queue = Arc::clone(&task_queue);
        let pending_set = Arc::clone(&pending_set);
        let current_book = Arc::clone(&current_book);
        let cache_map = Arc::clone(&cache_map);
        let cache_dir = cache_dir.clone();
        let processing_set = Arc::clone(&processing_set);
        let active_tasks = Arc::clone(&active_tasks);
        let cancelled_jobs = Arc::clone(&cancelled_jobs);
        let skipped_pages = Arc::clone(&skipped_pages);
        let failed_pages = Arc::clone(&failed_pages);
        let completed_count = Arc::clone(&completed_count);
        let skipped_count = Arc::clone(&skipped_count);
        let failed_count = Arc::clone(&failed_count);
        let queue_wait_sample_count = Arc::clone(&queue_wait_sample_count);
        let queue_wait_total_ms = Arc::clone(&queue_wait_total_ms);
        let queue_wait_max_ms = Arc::clone(&queue_wait_max_ms);
        let py_state = Arc::clone(&py_state);
        let condition_settings = Arc::clone(&condition_settings);
        let conditions_list = Arc::clone(&conditions_list);
        let default_timeout = config.default_timeout;

        let handle = thread::spawn(move || {
            log_debug!("🔧 Worker {} started", i);
            worker_loop(
                i,
                running,
                enabled,
                task_queue,
                pending_set,
                current_book,
                cache_map,
                cache_dir,
                processing_set,
                active_tasks,
                cancelled_jobs,
                skipped_pages,
                failed_pages,
                completed_count,
                skipped_count,
                failed_count,
                queue_wait_sample_count,
                queue_wait_total_ms,
                queue_wait_max_ms,
                py_state,
                condition_settings,
                conditions_list,
                default_timeout,
                app,
            );
            log_debug!("🔧 Worker {} stopped", i);
        });

        workers.push(handle);
    }

    workers
}

/// 工作线程主循环
#[allow(clippy::too_many_arguments)]
fn worker_loop(
    worker_id: usize,
    running: Arc<AtomicBool>,
    enabled: Arc<AtomicBool>,
    task_queue: Arc<Mutex<VecDeque<UpscaleTask>>>,
    pending_set: Arc<RwLock<HashSet<(String, usize)>>>,
    current_book: Arc<RwLock<Option<String>>>,
    cache_map: Arc<RwLock<HashMap<(String, usize), CacheEntry>>>,
    cache_dir: std::path::PathBuf,
    processing_set: Arc<RwLock<HashSet<(String, usize)>>>,
    active_tasks: Arc<RwLock<HashMap<(String, usize), UpscaleTask>>>,
    cancelled_jobs: Arc<RwLock<HashSet<String>>>,
    skipped_pages: Arc<RwLock<HashSet<(String, usize)>>>,
    failed_pages: Arc<RwLock<HashSet<(String, usize)>>>,
    completed_count: Arc<AtomicUsize>,
    skipped_count: Arc<AtomicUsize>,
    failed_count: Arc<AtomicUsize>,
    queue_wait_sample_count: Arc<AtomicUsize>,
    queue_wait_total_ms: Arc<AtomicU64>,
    queue_wait_max_ms: Arc<AtomicU64>,
    py_state: Arc<PyO3UpscalerState>,
    condition_settings: Arc<RwLock<ConditionalUpscaleSettings>>,
    conditions_list: Arc<RwLock<Vec<FrontendCondition>>>,
    default_timeout: f64,
    app: AppHandle,
) {
    let _ = worker_id; // 避免未使用警告

    while running.load(Ordering::SeqCst) {
        // 如果未启用超分，休眠
        if !enabled.load(Ordering::SeqCst) {
            thread::sleep(Duration::from_millis(100));
            continue;
        }

        // 获取任务
        let task = get_highest_priority_task(&task_queue);

        if let Some(task) = task {
            if let Ok(mut set) = pending_set.write() {
                set.remove(&(task.book_path.clone(), task.page_index));
            }

            let queue_wait_ms = task.submitted_at.elapsed().as_millis() as u64;
            queue_wait_sample_count.fetch_add(1, Ordering::SeqCst);
            queue_wait_total_ms.fetch_add(queue_wait_ms, Ordering::SeqCst);
            let mut observed_max = queue_wait_max_ms.load(Ordering::SeqCst);
            while queue_wait_ms > observed_max {
                match queue_wait_max_ms.compare_exchange(
                    observed_max,
                    queue_wait_ms,
                    Ordering::SeqCst,
                    Ordering::SeqCst,
                ) {
                    Ok(_) => break,
                    Err(actual) => observed_max = actual,
                }
            }

            // 检查是否应该取消（书籍已切换）
            let current = current_book
                .read()
                .ok()
                .and_then(|g| g.clone())
                .unwrap_or_default();
            if !task.book_path.is_empty() && task.book_path != current {
                log_debug!("⏭️ 跳过非当前书籍任务: {}", task.book_path);
                continue;
            }

            // 标记为正在处理
            if let Ok(mut set) = processing_set.write() {
                set.insert((task.book_path.clone(), task.page_index));
            }
            if let Ok(mut tasks) = active_tasks.write() {
                tasks.insert((task.book_path.clone(), task.page_index), task.clone());
            }

            // 发送 processing 状态事件到前端
            let processing_payload = UpscaleReadyPayload {
                book_path: task.book_path.clone(),
                page_index: task.page_index,
                image_hash: task.image_hash.clone(),
                status: UpscaleStatus::Processing,
                cache_path: None,
                error: None,
                original_size: None,
                upscaled_size: None,
                is_preload: task.score.priority != TaskPriority::Current,
                model_name: None,
                scale: None,
            };
            let _ = app.emit("upscale-ready", processing_payload);
            log_debug!("📤 发送处理中事件: page {}", task.page_index);

            // 处理任务
            let result = process_task_v2(
                &py_state,
                &condition_settings,
                &conditions_list,
                &cache_dir,
                &cache_map,
                &task,
                &cancelled_jobs,
                default_timeout,
            );

            // 移除处理中标记
            if let Ok(mut set) = processing_set.write() {
                set.remove(&(task.book_path.clone(), task.page_index));
            }
            if let Ok(mut tasks) = active_tasks.write() {
                tasks.remove(&(task.book_path.clone(), task.page_index));
            }
            if let Ok(mut jobs) = cancelled_jobs.write() {
                jobs.remove(&task.job_key);
            }

            // 打印处理结果
            match &result {
                Ok(payload) => {
                    log_debug!(
                        "✅ 任务处理完成: page {} status={:?}",
                        task.page_index,
                        payload.status
                    );
                }
                Err(e) => {
                    log_debug!("❌ 任务处理失败: page {} error={}", task.page_index, e);
                }
            }

            // 处理结果并发送事件
            handle_task_result(
                result,
                &task,
                &completed_count,
                &skipped_count,
                &failed_count,
                &skipped_pages,
                &failed_pages,
                &app,
            );
        } else {
            // 队列为空，短暂休眠
            thread::sleep(Duration::from_millis(20));
        }
    }
}

/// 处理任务结果并发送事件
fn handle_task_result(
    result: Result<UpscaleReadyPayload, String>,
    task: &UpscaleTask,
    completed_count: &Arc<AtomicUsize>,
    skipped_count: &Arc<AtomicUsize>,
    failed_count: &Arc<AtomicUsize>,
    skipped_pages: &Arc<RwLock<HashSet<(String, usize)>>>,
    failed_pages: &Arc<RwLock<HashSet<(String, usize)>>>,
    app: &AppHandle,
) {
    match result {
        Ok(payload) => {
            match payload.status {
                UpscaleStatus::Completed => {
                    completed_count.fetch_add(1, Ordering::SeqCst);
                    log_debug!("📤 发送完成事件: page {}", task.page_index);
                }
                UpscaleStatus::Skipped => {
                    skipped_count.fetch_add(1, Ordering::SeqCst);
                    if let Ok(mut set) = skipped_pages.write() {
                        set.insert((task.book_path.clone(), task.page_index));
                    }
                    log_debug!(
                        "📤 发送跳过事件: page {} reason={:?}",
                        task.page_index,
                        payload.error
                    );
                }
                UpscaleStatus::Failed => {
                    failed_count.fetch_add(1, Ordering::SeqCst);
                    if let Ok(mut set) = failed_pages.write() {
                        set.insert((task.book_path.clone(), task.page_index));
                    }
                    log_debug!(
                        "📤 发送失败事件: page {} error={:?}",
                        task.page_index,
                        payload.error
                    );
                }
                _ => {}
            }
            let _ = app.emit("upscale-ready", payload);
        }
        Err(e) => {
            let cancelled = is_cancelled_error(&e);
            if !cancelled {
                failed_count.fetch_add(1, Ordering::SeqCst);
                if let Ok(mut set) = failed_pages.write() {
                    set.insert((task.book_path.clone(), task.page_index));
                }
            }

            log_debug!(
                "📤 发送{}事件: page {} error={}",
                if cancelled { "取消" } else { "错误" },
                task.page_index,
                e
            );
            let payload = UpscaleReadyPayload {
                book_path: task.book_path.clone(),
                page_index: task.page_index,
                image_hash: task.image_hash.clone(),
                status: if cancelled {
                    UpscaleStatus::Cancelled
                } else {
                    UpscaleStatus::Failed
                },
                cache_path: None,
                error: Some(e),
                original_size: None,
                upscaled_size: None,
                is_preload: task.score.priority != TaskPriority::Current,
                model_name: None,
                scale: None,
            };
            let _ = app.emit("upscale-ready", payload);
        }
    }
}

fn is_cancelled_error(error: &str) -> bool {
    error.contains("取消")
}
