//! 超分服务工作线程模块
//!
//! 包含工作线程启动逻辑、任务处理循环

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
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
    current_book: Arc<RwLock<Option<String>>>,
    cache_map: Arc<RwLock<HashMap<(String, usize), CacheEntry>>>,
    cache_dir: std::path::PathBuf,
    processing_set: Arc<RwLock<HashSet<(String, usize)>>>,
    skipped_pages: Arc<RwLock<HashSet<(String, usize)>>>,
    failed_pages: Arc<RwLock<HashSet<(String, usize)>>>,
    completed_count: Arc<AtomicUsize>,
    skipped_count: Arc<AtomicUsize>,
    failed_count: Arc<AtomicUsize>,
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
        let current_book = Arc::clone(&current_book);
        let cache_map = Arc::clone(&cache_map);
        let cache_dir = cache_dir.clone();
        let processing_set = Arc::clone(&processing_set);
        let skipped_pages = Arc::clone(&skipped_pages);
        let failed_pages = Arc::clone(&failed_pages);
        let completed_count = Arc::clone(&completed_count);
        let skipped_count = Arc::clone(&skipped_count);
        let failed_count = Arc::clone(&failed_count);
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
                current_book,
                cache_map,
                cache_dir,
                processing_set,
                skipped_pages,
                failed_pages,
                completed_count,
                skipped_count,
                failed_count,
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
    current_book: Arc<RwLock<Option<String>>>,
    cache_map: Arc<RwLock<HashMap<(String, usize), CacheEntry>>>,
    cache_dir: std::path::PathBuf,
    processing_set: Arc<RwLock<HashSet<(String, usize)>>>,
    skipped_pages: Arc<RwLock<HashSet<(String, usize)>>>,
    failed_pages: Arc<RwLock<HashSet<(String, usize)>>>,
    completed_count: Arc<AtomicUsize>,
    skipped_count: Arc<AtomicUsize>,
    failed_count: Arc<AtomicUsize>,
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
                default_timeout,
            );

            // 移除处理中标记
            if let Ok(mut set) = processing_set.write() {
                set.remove(&(task.book_path.clone(), task.page_index));
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
            failed_count.fetch_add(1, Ordering::SeqCst);
            if let Ok(mut set) = failed_pages.write() {
                set.insert((task.book_path.clone(), task.page_index));
            }

            log_debug!("📤 发送错误事件: page {} error={}", task.page_index, e);
            let payload = UpscaleReadyPayload {
                book_path: task.book_path.clone(),
                page_index: task.page_index,
                image_hash: task.image_hash.clone(),
                status: UpscaleStatus::Failed,
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
