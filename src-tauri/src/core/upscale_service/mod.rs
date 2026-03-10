//! NeoView - Upscale Service V2
//! 超分服务 - 参考 ThumbnailServiceV3 架构设计
//!
//! 核心特点：
//! 1. 后端为主，前端只需发送请求 + 接收事件
//! 2. 使用 WIC 读取图片（支持 AVIF/JXL），输出 WebP 缓存文件
//! 3. 超分结果保存到本地，前端用 convertFileSrc 转 URL
//! 4. 条件检查完全在后端
//! 5. 超分图作为普通图进入 imagePool，复用缩放/视图功能
//!
//! 模块结构：
//! - config.rs: 服务配置
//! - types.rs: 核心类型定义
//! - events.rs: 事件类型
//! - worker.rs: 工作线程
//! - task_processor.rs: 任务处理逻辑
//! - queue.rs: 任务队列管理
//! - conditions.rs: 条件匹配
//! - cache.rs: 缓存管理

pub mod config;
pub mod types;
pub mod events;
pub mod worker;
pub mod task_processor;
pub mod queue;
pub mod conditions;
pub mod cache;

// 重导出公共 API
pub use config::UpscaleServiceConfig;
pub use types::{TaskPriority, TaskScore, UpscaleTask, CacheEntry};
pub use events::{UpscaleStatus, UpscaleReadyPayload, UpscaleServiceStats};

use crate::commands::pyo3_upscale_commands::PyO3UpscalerState;
use crate::core::pyo3_upscaler::UpscaleModel;
use crate::core::upscale_settings::ConditionalUpscaleSettings;
use crate::core::upscale_service::task_processor::get_regex_cache_stats;
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread::JoinHandle;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

// ============================================================================
// 日志宏（供子模块使用）
// ============================================================================

macro_rules! log_info {
    ($($arg:tt)*) => {
        println!("[UpscaleService INFO] {}", format!($($arg)*));
    };
}

macro_rules! log_debug {
    ($($arg:tt)*) => {
        if cfg!(debug_assertions) {
            println!("[UpscaleService DEBUG] {}", format!($($arg)*));
        }
    };
}

// 导出宏供子模块使用
pub(crate) use log_info;
pub(crate) use log_debug;

// ============================================================================
// 服务实现
// ============================================================================

/// 超分服务（V2：文件缓存，不使用内存缓存）
pub struct UpscaleService {
    /// 配置
    config: UpscaleServiceConfig,

    /// PyO3 超分器状态
    py_state: Arc<PyO3UpscalerState>,

    /// 缓存目录
    cache_dir: PathBuf,

    /// 是否启用超分
    enabled: Arc<AtomicBool>,

    /// 是否正在运行
    running: Arc<AtomicBool>,

    /// 当前书籍路径
    current_book: Arc<RwLock<Option<String>>>,

    /// 当前页面索引
    current_page: Arc<AtomicUsize>,

    /// 缓存路径映射：(book_path, page_index) -> cache_path
    cache_map: Arc<RwLock<HashMap<(String, usize), CacheEntry>>>,

    /// 任务队列
    task_queue: Arc<Mutex<VecDeque<UpscaleTask>>>,

    /// 待处理任务索引（用于 O(1) 去重）
    pending_set: Arc<RwLock<HashSet<(String, usize)>>>,

    /// 正在处理的任务集合：(book_path, page_index)
    processing_set: Arc<RwLock<HashSet<(String, usize)>>>,

    /// 正在执行的任务详情，用于主动取消底层 sr_vulkan 任务
    active_tasks: Arc<RwLock<HashMap<(String, usize), UpscaleTask>>>,

    /// 已请求取消的 job_key，供解码/超分流程主动中断
    cancelled_jobs: Arc<RwLock<HashSet<String>>>,

    /// 已跳过的页面（不满足条件）
    skipped_pages: Arc<RwLock<HashSet<(String, usize)>>>,

    /// 失败的页面
    failed_pages: Arc<RwLock<HashSet<(String, usize)>>>,

    /// 统计计数
    completed_count: Arc<AtomicUsize>,
    skipped_count: Arc<AtomicUsize>,
    failed_count: Arc<AtomicUsize>,
    dedupe_request_count: Arc<AtomicUsize>,
    dedupe_hit_count: Arc<AtomicUsize>,
    queue_wait_sample_count: Arc<AtomicUsize>,
    queue_wait_total_ms: Arc<AtomicU64>,
    queue_wait_max_ms: Arc<AtomicU64>,

    /// 工作线程句柄
    workers: Arc<Mutex<Vec<JoinHandle<()>>>>,

    /// 条件设置缓存
    condition_settings: Arc<RwLock<ConditionalUpscaleSettings>>,
    
    /// 条件列表（从前端同步）
    conditions_list: Arc<RwLock<Vec<crate::commands::upscale_service_commands::FrontendCondition>>>,

    /// App Handle
    app_handle: Option<AppHandle>,
}

impl UpscaleService {
    /// 创建新的超分服务
    pub fn new(py_state: Arc<PyO3UpscalerState>, config: UpscaleServiceConfig, cache_dir: PathBuf) -> Self {
        // 确保缓存目录存在
        if let Err(e) = fs::create_dir_all(&cache_dir) {
            log_info!("⚠️ 创建缓存目录失败: {}", e);
        }

        Self {
            config,
            py_state,
            cache_dir,
            enabled: Arc::new(AtomicBool::new(false)),
            running: Arc::new(AtomicBool::new(false)),
            current_book: Arc::new(RwLock::new(None)),
            current_page: Arc::new(AtomicUsize::new(0)),
            cache_map: Arc::new(RwLock::new(HashMap::new())),
            task_queue: Arc::new(Mutex::new(VecDeque::new())),
            pending_set: Arc::new(RwLock::new(HashSet::new())),
            processing_set: Arc::new(RwLock::new(HashSet::new())),
            active_tasks: Arc::new(RwLock::new(HashMap::new())),
            cancelled_jobs: Arc::new(RwLock::new(HashSet::new())),
            skipped_pages: Arc::new(RwLock::new(HashSet::new())),
            failed_pages: Arc::new(RwLock::new(HashSet::new())),
            completed_count: Arc::new(AtomicUsize::new(0)),
            skipped_count: Arc::new(AtomicUsize::new(0)),
            failed_count: Arc::new(AtomicUsize::new(0)),
            dedupe_request_count: Arc::new(AtomicUsize::new(0)),
            dedupe_hit_count: Arc::new(AtomicUsize::new(0)),
            queue_wait_sample_count: Arc::new(AtomicUsize::new(0)),
            queue_wait_total_ms: Arc::new(AtomicU64::new(0)),
            queue_wait_max_ms: Arc::new(AtomicU64::new(0)),
            workers: Arc::new(Mutex::new(Vec::new())),
            condition_settings: Arc::new(RwLock::new(ConditionalUpscaleSettings::default())),
            conditions_list: Arc::new(RwLock::new(Vec::new())),
            app_handle: None,
        }
    }

    /// 启动服务
    pub fn start(&mut self, app: AppHandle) {
        if self.running.swap(true, Ordering::SeqCst) {
            return; // 已经在运行
        }

        self.app_handle = Some(app.clone());

        let new_workers = worker::start_workers(
            &self.config,
            app,
            Arc::clone(&self.running),
            Arc::clone(&self.enabled),
            Arc::clone(&self.task_queue),
            Arc::clone(&self.pending_set),
            Arc::clone(&self.current_book),
            Arc::clone(&self.cache_map),
            self.cache_dir.clone(),
            Arc::clone(&self.processing_set),
            Arc::clone(&self.active_tasks),
            Arc::clone(&self.cancelled_jobs),
            Arc::clone(&self.skipped_pages),
            Arc::clone(&self.failed_pages),
            Arc::clone(&self.completed_count),
            Arc::clone(&self.skipped_count),
            Arc::clone(&self.failed_count),
            Arc::clone(&self.queue_wait_sample_count),
            Arc::clone(&self.queue_wait_total_ms),
            Arc::clone(&self.queue_wait_max_ms),
            Arc::clone(&self.py_state),
            Arc::clone(&self.condition_settings),
            Arc::clone(&self.conditions_list),
        );

        if let Ok(mut workers) = self.workers.lock() {
            *workers = new_workers;
        }

        log_info!(
            "✅ UpscaleService started with {} workers",
            self.config.worker_threads
        );
    }

    /// 停止服务
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);

        // 等待工作线程结束
        let mut workers = self.workers.lock().unwrap();
        for handle in workers.drain(..) {
            let _ = handle.join();
        }

        log_info!("🛑 UpscaleService stopped");
    }

    /// 启用/禁用超分
    pub fn set_enabled(&self, enabled: bool) {
        let was_enabled = self.enabled.swap(enabled, Ordering::SeqCst);

        if was_enabled && !enabled {
            // 从启用变为禁用：清空队列
            let cleared = queue::clear_queue(&self.task_queue);
            log_info!("🚫 超分已禁用，清空 {} 个待处理任务", cleared);

            if let Ok(mut set) = self.pending_set.write() {
                set.clear();
            }

            let cancelled = self.cancel_active_tasks(|_, _| true);
            if cancelled > 0 {
                log_info!("🚫 超分已禁用，取消 {} 个正在执行的任务", cancelled);
            }
        } else if !was_enabled && enabled {
            log_info!("✅ 超分已启用");
        }
    }

    /// 检查是否启用
    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::SeqCst)
    }

    /// 更新条件设置
    pub fn update_condition_settings(&self, settings: ConditionalUpscaleSettings) {
        conditions::update_condition_settings(&self.condition_settings, settings);
    }
    
    /// 同步条件配置（从前端接收完整的条件列表）
    pub fn sync_conditions(
        &self, 
        enabled: bool, 
        conds: Vec<crate::commands::upscale_service_commands::FrontendCondition>
    ) {
        conditions::sync_conditions(
            &self.condition_settings,
            &self.conditions_list,
            enabled,
            conds,
        );
    }
    
    /// 根据图片尺寸匹配条件，返回模型配置
    pub fn match_condition(&self, width: u32, height: u32) -> Option<UpscaleModel> {
        conditions::match_condition(
            &self.condition_settings,
            &self.conditions_list,
            width,
            height,
        )
    }

    /// 设置当前书籍
    pub fn set_current_book(&self, book_path: Option<String>) {
        if let Ok(mut current) = self.current_book.write() {
            let old_book = current.clone();

            // 书籍切换时清理
            if old_book.as_ref() != book_path.as_ref() {
                // 清空队列中属于旧书籍的任务
                if let Some(ref old) = old_book {
                    self.cancel_book(old);
                }

                // 清空状态
                if let Ok(mut set) = self.skipped_pages.write() {
                    set.clear();
                }
                if let Ok(mut set) = self.failed_pages.write() {
                    set.clear();
                }
            }

            *current = book_path;
        }
    }

    /// 设置当前页面（触发预超分池更新）
    pub fn set_current_page(&self, page_index: usize) {
        let old_page = self.current_page.swap(page_index, Ordering::SeqCst);

        if old_page == page_index {
            return;
        }

        queue::replan_queue_for_jump(
            &self.task_queue,
            self.config.preload_range,
            old_page,
            page_index,
        );
        self.rebuild_pending_set_from_queue();

        let current_book = self.current_book
            .read()
            .ok()
            .and_then(|guard| guard.clone());
        if let Some(book_path) = current_book {
            let active_end = page_index + self.config.preload_range;
            let cancelled = self.cancel_active_tasks(|_, task| {
                task.book_path == book_path
                    && (task.page_index < page_index || task.page_index > active_end)
            });

            if cancelled > 0 {
                log_debug!(
                    "🔄 页面切换到 {}，取消 {} 个活动窗口外任务",
                    page_index,
                    cancelled
                );
            }
        }
    }

    fn rebuild_pending_set_from_queue(&self) {
        let pending_keys: HashSet<(String, usize)> = if let Ok(queue) = self.task_queue.lock() {
            queue
                .iter()
                .map(|task| (task.book_path.clone(), task.page_index))
                .collect()
        } else {
            HashSet::new()
        };

        if let Ok(mut set) = self.pending_set.write() {
            *set = pending_keys;
        }
    }

    fn cancel_active_tasks<F>(&self, mut predicate: F) -> usize
    where
        F: FnMut(&(String, usize), &UpscaleTask) -> bool,
    {
        let tasks_to_cancel: Vec<UpscaleTask> = self
            .active_tasks
            .read()
            .ok()
            .map(|tasks| {
                tasks
                    .iter()
                    .filter(|(key, task)| predicate(key, task))
                    .map(|(_, task)| task.clone())
                    .collect()
            })
            .unwrap_or_default();

        if tasks_to_cancel.is_empty() {
            return 0;
        }

        let manager = self
            .py_state
            .manager
            .lock()
            .ok()
            .and_then(|guard| guard.clone());

        if let Ok(mut cancelled_jobs) = self.cancelled_jobs.write() {
            for task in &tasks_to_cancel {
                cancelled_jobs.insert(task.job_key.clone());
            }
        }

        for task in &tasks_to_cancel {
            if let Some(manager) = manager.as_ref() {
                if let Err(err) = manager.cancel_job(&task.job_key) {
                    log_debug!(
                        "⚠️ 取消活动任务失败: page {} job={} err={}",
                        task.page_index,
                        task.job_key,
                        err
                    );
                }
            }
        }

        tasks_to_cancel.len()
    }

    /// 检查缓存是否存在且有效
    fn check_cache(&self, book_path: &str, image_path: &str, model: &UpscaleModel) -> Option<PathBuf> {
        cache::check_cache(&self.cache_dir, book_path, image_path, model)
    }

    /// 请求超分（核心方法）
    pub fn request_upscale(&self, task: UpscaleTask) -> Result<(), String> {
        if !self.enabled.load(Ordering::SeqCst) {
            return Err("超分未启用".to_string());
        }

        self.dedupe_request_count.fetch_add(1, Ordering::SeqCst);

        let key = (task.book_path.clone(), task.page_index);

        // 先检查内存映射缓存，避免重复走磁盘校验
        if let Ok(cache) = self.cache_map.read() {
            if let Some(entry) = cache.get(&key) {
                let cache_path = PathBuf::from(&entry.cache_path);
                if cache_path.exists() {
                    log_debug!("📦 内存缓存命中 page {}", task.page_index);
                    if let Some(ref app) = self.app_handle {
                        let payload = UpscaleReadyPayload {
                            book_path: task.book_path.clone(),
                            page_index: task.page_index,
                            image_hash: task.image_hash.clone(),
                            status: UpscaleStatus::Completed,
                            cache_path: Some(entry.cache_path.clone()),
                            error: None,
                            original_size: Some(entry.original_size),
                            upscaled_size: Some(entry.upscaled_size),
                            is_preload: task.score.priority != TaskPriority::Current,
                            model_name: if task.model.model_name.is_empty() {
                                None
                            } else {
                                Some(task.model.model_name.clone())
                            },
                            scale: Some(task.model.scale),
                        };
                        let _ = app.emit("upscale-ready", payload);
                    }
                    return Ok(());
                }
            }
        }

        // 检查文件缓存是否存在
        if let Some(cache_path) = self.check_cache(&task.book_path, &task.image_path, &task.model) {
            log_debug!("📦 文件缓存命中 page {}", task.page_index);
            // 直接发送缓存路径
            if let Some(ref app) = self.app_handle {
                let payload = UpscaleReadyPayload {
                    book_path: task.book_path.clone(),
                    page_index: task.page_index,
                    image_hash: task.image_hash.clone(),
                    status: UpscaleStatus::Completed,
                    cache_path: Some(cache_path.to_string_lossy().to_string()),
                    error: None,
                    original_size: None,
                    upscaled_size: None,
                    is_preload: task.score.priority != TaskPriority::Current,
                    // 缓存命中时使用任务中的模型信息
                    model_name: if task.model.model_name.is_empty() { None } else { Some(task.model.model_name.clone()) },
                    scale: Some(task.model.scale),
                };
                let _ = app.emit("upscale-ready", payload);
            }
            return Ok(());
        }

        // 检查是否已跳过
        if let Ok(set) = self.skipped_pages.read() {
            if set.contains(&key) {
                log_debug!("⏭️ 已跳过 page {}", task.page_index);
                return Ok(());
            }
        }

        // 检查是否正在处理
        if let Ok(set) = self.processing_set.read() {
            if set.contains(&key) {
                self.dedupe_hit_count.fetch_add(1, Ordering::SeqCst);
                log_debug!("⏳ 正在处理 page {}", task.page_index);
                return Ok(());
            }
        }

        // 检查是否已在待处理集合中（O(1)）
        if let Ok(set) = self.pending_set.read() {
            if set.contains(&key) {
                self.dedupe_hit_count.fetch_add(1, Ordering::SeqCst);
                if queue::reprioritize_existing_task(&self.task_queue, task.clone()) {
                    log_debug!("⬆️ 提升队列优先级 page {}", task.page_index);
                    return Ok(());
                }
            }
        }

        // 加入队列索引
        if let Ok(mut set) = self.pending_set.write() {
            set.insert(key);
        }

        // 加入队列
        queue::add_task_to_queue(&self.task_queue, task);

        Ok(())
    }

    /// 请求预超分范围（只加载后方页 + 当前页，前方页不加载）
    pub fn request_preload_range(
        &self,
        book_path: &str,
        center_index: usize,
        total_pages: usize,
        image_paths: &[(usize, String, String)], // (page_index, image_path, hash)
        model: &UpscaleModel,
    ) {
        if !self.enabled.load(Ordering::SeqCst) {
            return;
        }

        let range = self.config.preload_range;
        let end = (center_index + range + 1).min(total_pages);

        // 收集需要加载的任务，按优先级排序
        let mut tasks_to_add: Vec<UpscaleTask> = Vec::new();

        for (page_index, image_path, hash) in image_paths.iter() {
            // 跳过前方页（已翻过的）
            if *page_index < center_index {
                continue;
            }
            // 跳过超出范围的
            if *page_index >= end {
                continue;
            }

            let score = UpscaleTask::calculate_score(*page_index, center_index);

            let task = UpscaleTask {
                book_path: book_path.to_string(),
                page_index: *page_index,
                image_path: image_path.clone(),
                is_archive: false,
                archive_path: None,
                image_hash: hash.clone(),
                job_key: UpscaleTask::build_job_key(book_path, *page_index),
                score,
                model: model.clone(),
                allow_cache: true,
                submitted_at: Instant::now(),
            };

            tasks_to_add.push(task);
        }

        tasks_to_add.sort_by(|a, b| a.score.cmp(&b.score));

        // 依次添加到队列
        for task in tasks_to_add {
            let _ = self.request_upscale(task);
        }

        log_debug!(
            "📋 预超分请求: 当前页 {} + 后方 {} 页",
            center_index,
            range.min(total_pages.saturating_sub(center_index + 1))
        );
    }

    /// 取消指定页面的任务
    pub fn cancel_page(&self, book_path: &str, page_index: usize) {
        queue::cancel_page_task(&self.task_queue, book_path, page_index);
        if let Ok(mut set) = self.pending_set.write() {
            set.remove(&(book_path.to_string(), page_index));
        }
        self.cancel_active_tasks(|_, task| task.book_path == book_path && task.page_index == page_index);
    }

    /// 取消指定书籍的所有任务
    pub fn cancel_book(&self, book_path: &str) {
        queue::cancel_book_tasks(&self.task_queue, book_path);
        if let Ok(mut set) = self.pending_set.write() {
            set.retain(|(bp, _)| bp != book_path);
        }
        self.cancel_active_tasks(|_, task| task.book_path == book_path);
    }

    /// 清除缓存
    pub fn clear_cache(&self, book_path: Option<&str>) {
        cache::clear_cache(&self.cache_map, book_path);
    }

    /// 获取统计信息
    pub fn get_stats(&self) -> UpscaleServiceStats {
        let cache_count = self.cache_map.read().ok().map(|c| c.len()).unwrap_or(0);
        let pending_tasks = self.pending_set.read().ok().map(|s| s.len()).unwrap_or(0);
        let processing_tasks = self.processing_set.read().ok().map(|s| s.len()).unwrap_or(0);
        let queue_wait_sample_count = self.queue_wait_sample_count.load(Ordering::SeqCst);
        let queue_wait_total_ms = self.queue_wait_total_ms.load(Ordering::SeqCst);
        let queue_wait_max_ms = self.queue_wait_max_ms.load(Ordering::SeqCst);
        let dedupe_request_count = self.dedupe_request_count.load(Ordering::SeqCst);
        let dedupe_hit_count = self.dedupe_hit_count.load(Ordering::SeqCst);
        let (regex_cache_hit_count, regex_cache_miss_count) = get_regex_cache_stats();

        let queue_wait_avg_ms = if queue_wait_sample_count > 0 {
            queue_wait_total_ms as f64 / queue_wait_sample_count as f64
        } else {
            0.0
        };

        let dedupe_hit_rate = if dedupe_request_count > 0 {
            dedupe_hit_count as f64 / dedupe_request_count as f64
        } else {
            0.0
        };

        let regex_total = regex_cache_hit_count + regex_cache_miss_count;
        let regex_cache_hit_rate = if regex_total > 0 {
            regex_cache_hit_count as f64 / regex_total as f64
        } else {
            0.0
        };

        UpscaleServiceStats {
            memory_cache_count: cache_count,
            memory_cache_bytes: 0,
            pending_tasks,
            processing_tasks,
            completed_count: self.completed_count.load(Ordering::SeqCst),
            skipped_count: self.skipped_count.load(Ordering::SeqCst),
            failed_count: self.failed_count.load(Ordering::SeqCst),
            queue_wait_sample_count,
            queue_wait_avg_ms,
            queue_wait_max_ms,
            dedupe_request_count,
            dedupe_hit_count,
            dedupe_hit_rate,
            regex_cache_hit_count,
            regex_cache_miss_count,
            regex_cache_hit_rate,
            is_enabled: self.enabled.load(Ordering::SeqCst),
        }
    }

    /// 获取页面状态
    pub fn get_page_status(&self, book_path: &str, page_index: usize) -> UpscaleStatus {
        let key = (book_path.to_string(), page_index);

        // 检查缓存映射
        if let Ok(cache) = self.cache_map.read() {
            if cache.contains_key(&key) {
                return UpscaleStatus::Completed;
            }
        }

        // 检查跳过
        if let Ok(set) = self.skipped_pages.read() {
            if set.contains(&key) {
                return UpscaleStatus::Skipped;
            }
        }

        // 检查失败
        if let Ok(set) = self.failed_pages.read() {
            if set.contains(&key) {
                return UpscaleStatus::Failed;
            }
        }

        // 检查正在处理
        if let Ok(set) = self.processing_set.read() {
            if set.contains(&key) {
                return UpscaleStatus::Processing;
            }
        }

        // 检查待处理集合（O(1)）
        if let Ok(set) = self.pending_set.read() {
            if set.contains(&key) {
                return UpscaleStatus::Pending;
            }
        }

        UpscaleStatus::Pending
    }
}
