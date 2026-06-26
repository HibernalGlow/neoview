//! Thumbnail Service V3
//! 缩略图服务 V3 - 复刻 NeeView 架构
//!
//! 核心特点：
//! 1. 后端为主，前端只需通知可见区域 + 接收 blob
//! 2. 不阻塞前端文件夹浏览
//! 3. LRU 内存缓存 + SQLite 数据库缓存
//! 4. 多线程工作池并行生成

// 子模块声明
pub mod cache;
pub mod config;
pub mod db_index;
pub mod generators;
pub mod queue;
pub mod types;
pub mod worker;

// 重导出公共 API
pub use config::ThumbnailServiceConfig;
pub use types::{
    detect_file_type, is_archive_file, is_likely_folder, CacheStats, TaskLane,
    ThumbnailBatchReadyPayload, ThumbnailFileType, ThumbnailReadyPayload,
};

// 内部使用
use crate::core::request_dedup::RequestDeduplicator;
use crate::core::thumbnail_db::ThumbnailDb;
use crate::core::thumbnail_generator::ThumbnailGenerator;
use lru::LruCache;
use std::collections::{HashMap, HashSet};
use std::num::NonZeroUsize;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex, RwLock};
use std::thread::JoinHandle;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

use types::GenerateTask;

// 简化的日志宏（替代 tracing）
macro_rules! log_info {
    ($($arg:tt)*) => {
        println!("[INFO] {}", format!($($arg)*));
    };
}

macro_rules! log_debug {
    ($($arg:tt)*) => {
        if cfg!(debug_assertions) {
            println!("[DEBUG] {}", format!($($arg)*));
        }
    };
}

// 导出宏供子模块使用
pub(crate) use log_debug;
pub(crate) use log_info;

/// 缩略图服务 V3
pub struct ThumbnailServiceV3 {
    /// 配置
    config: ThumbnailServiceConfig,
    /// 内存缓存 (LRU)
    memory_cache: Arc<RwLock<LruCache<String, Arc<[u8]>>>>,
    /// 内存缓存大小（字节）
    memory_cache_bytes: Arc<AtomicUsize>,
    /// 数据库
    db: Arc<ThumbnailDb>,
    /// 缩略图生成器
    generator: Arc<ThumbnailGenerator>,
    /// 生成任务队列
    task_queue: Arc<(Mutex<queue::TaskQueueState>, Condvar)>,
    /// 当前目录
    current_dir: Arc<RwLock<String>>,
    /// 请求分代号（目录切换时递增，旧任务自动失效）
    request_epoch: Arc<AtomicU64>,
    /// 调度总开关（pause/resume）
    scheduler_paused: Arc<AtomicBool>,
    /// 是否正在运行
    running: Arc<AtomicBool>,
    /// 活跃工作线程数
    active_workers: Arc<AtomicUsize>,
    /// 各车道待处理队列计数（O(1) backlog）
    queued_visible: Arc<AtomicUsize>,
    queued_prefetch: Arc<AtomicUsize>,
    queued_background: Arc<AtomicUsize>,
    /// 各车道已处理任务计数
    processed_visible: Arc<AtomicUsize>,
    processed_prefetch: Arc<AtomicUsize>,
    processed_background: Arc<AtomicUsize>,
    /// 解码/编码阶段等待统计
    decode_wait_count: Arc<AtomicUsize>,
    decode_wait_ms: Arc<AtomicU64>,
    scale_wait_count: Arc<AtomicUsize>,
    scale_wait_ms: Arc<AtomicU64>,
    encode_wait_count: Arc<AtomicUsize>,
    encode_wait_ms: Arc<AtomicU64>,
    window_pruned_tasks: Arc<AtomicUsize>,
    cache_decay_evicted_entries: Arc<AtomicUsize>,
    cache_decay_evicted_bytes: Arc<AtomicU64>,
    io_prefetch_runs: Arc<AtomicUsize>,
    io_prefetch_files: Arc<AtomicUsize>,
    io_prefetch_ms: Arc<AtomicU64>,
    db_read_window: Arc<AtomicUsize>,
    db_read_last_ms: Arc<AtomicU64>,
    db_write_window: Arc<AtomicUsize>,
    db_write_last_ms: Arc<AtomicU64>,
    db_write_last_items: Arc<AtomicUsize>,
    /// 工作线程句柄
    workers: Arc<Mutex<Vec<JoinHandle<()>>>>,
    /// 数据库索引 (已有缩略图的路径集合)
    db_index: Arc<RwLock<HashSet<String>>>,
    /// 文件夹数据库索引
    folder_db_index: Arc<RwLock<HashSet<String>>>,
    /// 失败记录索引
    failed_index: Arc<RwLock<HashSet<String>>>,
    /// 保存队列（延迟批量保存到数据库）
    save_queue: Arc<Mutex<HashMap<String, (Arc<[u8]>, i64, i32, Instant)>>>,
    /// 最后一次保存队列刷新时间
    last_flush: Arc<Mutex<Instant>>,
    /// 批量保存阈值
    batch_save_threshold: usize,
    /// 请求去重器
    request_deduplicator: Arc<RequestDeduplicator>,
}

impl ThumbnailServiceV3 {
    /// 创建新的缩略图服务
    pub fn new(
        db: Arc<ThumbnailDb>,
        generator: Arc<ThumbnailGenerator>,
        config: ThumbnailServiceConfig,
    ) -> Self {
        let cache_size =
            NonZeroUsize::new(config.memory_cache_size).unwrap_or(NonZeroUsize::new(1024).unwrap());
        let db_read_window_init = config.db_read_batch_min.max(1);
        let db_write_window_init = config.db_write_batch_min.max(1);

        // 从数据库加载索引
        let (db_index, folder_db_index, failed_index) = db_index::load_indices_from_db(&db);
        log_info!(
            "📊 数据库索引加载完成: {} 个缩略图, {} 个文件夹, {} 个失败记录",
            db_index.len(),
            folder_db_index.len(),
            failed_index.len()
        );

        Self {
            config,
            memory_cache: Arc::new(RwLock::new(LruCache::new(cache_size))),
            memory_cache_bytes: Arc::new(AtomicUsize::new(0)),
            db,
            generator,
            task_queue: Arc::new((Mutex::new(queue::TaskQueueState::default()), Condvar::new())),
            current_dir: Arc::new(RwLock::new(String::new())),
            request_epoch: Arc::new(AtomicU64::new(1)),
            scheduler_paused: Arc::new(AtomicBool::new(false)),
            running: Arc::new(AtomicBool::new(false)),
            active_workers: Arc::new(AtomicUsize::new(0)),
            queued_visible: Arc::new(AtomicUsize::new(0)),
            queued_prefetch: Arc::new(AtomicUsize::new(0)),
            queued_background: Arc::new(AtomicUsize::new(0)),
            processed_visible: Arc::new(AtomicUsize::new(0)),
            processed_prefetch: Arc::new(AtomicUsize::new(0)),
            processed_background: Arc::new(AtomicUsize::new(0)),
            decode_wait_count: Arc::new(AtomicUsize::new(0)),
            decode_wait_ms: Arc::new(AtomicU64::new(0)),
            scale_wait_count: Arc::new(AtomicUsize::new(0)),
            scale_wait_ms: Arc::new(AtomicU64::new(0)),
            encode_wait_count: Arc::new(AtomicUsize::new(0)),
            encode_wait_ms: Arc::new(AtomicU64::new(0)),
            window_pruned_tasks: Arc::new(AtomicUsize::new(0)),
            cache_decay_evicted_entries: Arc::new(AtomicUsize::new(0)),
            cache_decay_evicted_bytes: Arc::new(AtomicU64::new(0)),
            io_prefetch_runs: Arc::new(AtomicUsize::new(0)),
            io_prefetch_files: Arc::new(AtomicUsize::new(0)),
            io_prefetch_ms: Arc::new(AtomicU64::new(0)),
            db_read_window: Arc::new(AtomicUsize::new(db_read_window_init)),
            db_read_last_ms: Arc::new(AtomicU64::new(0)),
            db_write_window: Arc::new(AtomicUsize::new(db_write_window_init)),
            db_write_last_ms: Arc::new(AtomicU64::new(0)),
            db_write_last_items: Arc::new(AtomicUsize::new(0)),
            workers: Arc::new(Mutex::new(Vec::new())),
            db_index: Arc::new(RwLock::new(db_index)),
            folder_db_index: Arc::new(RwLock::new(folder_db_index)),
            failed_index: Arc::new(RwLock::new(failed_index)),
            save_queue: Arc::new(Mutex::new(HashMap::new())),
            last_flush: Arc::new(Mutex::new(Instant::now())),
            batch_save_threshold: 50,
            request_deduplicator: Arc::new(RequestDeduplicator::new()),
        }
    }

    /// 启动工作线程
    pub fn start(&self, app: AppHandle) {
        if self.running.swap(true, Ordering::SeqCst) {
            return; // 已经在运行
        }

        let mut workers_guard = self.workers.lock().unwrap();

        // 启动工作线程
        let worker_handles = worker::start_workers(
            &self.config,
            Arc::clone(&self.running),
            Arc::clone(&self.task_queue),
            Arc::clone(&self.current_dir),
            Arc::clone(&self.request_epoch),
            Arc::clone(&self.scheduler_paused),
            Arc::clone(&self.active_workers),
            Arc::clone(&self.queued_visible),
            Arc::clone(&self.queued_prefetch),
            Arc::clone(&self.queued_background),
            Arc::clone(&self.processed_visible),
            Arc::clone(&self.processed_prefetch),
            Arc::clone(&self.processed_background),
            Arc::clone(&self.decode_wait_count),
            Arc::clone(&self.decode_wait_ms),
            Arc::clone(&self.scale_wait_count),
            Arc::clone(&self.scale_wait_ms),
            Arc::clone(&self.encode_wait_count),
            Arc::clone(&self.encode_wait_ms),
            Arc::clone(&self.memory_cache),
            Arc::clone(&self.memory_cache_bytes),
            Arc::clone(&self.db),
            Arc::clone(&self.generator),
            Arc::clone(&self.db_index),
            Arc::clone(&self.folder_db_index),
            Arc::clone(&self.failed_index),
            Arc::clone(&self.save_queue),
            Arc::clone(&self.request_deduplicator),
            app,
        );

        for handle in worker_handles {
            workers_guard.push(handle);
        }

        // 启动保存队列刷新线程
        let flush_handle = worker::start_flush_thread(
            Arc::clone(&self.running),
            Arc::clone(&self.save_queue),
            Arc::clone(&self.db),
            self.config.db_save_delay_ms,
            self.batch_save_threshold,
            self.config.db_write_batch_min,
            self.config.db_write_batch_max,
            self.config.db_batch_target_ms,
            Arc::clone(&self.db_write_window),
            Arc::clone(&self.db_write_last_ms),
            Arc::clone(&self.db_write_last_items),
        );
        workers_guard.push(flush_handle);

        log_info!(
            "✅ ThumbnailServiceV3 started with {} workers + 1 flush thread",
            self.config.worker_threads
        );
    }

    /// 停止工作线程
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        self.task_queue.1.notify_all();
        let mut workers = self.workers.lock().unwrap();
        for handle in workers.drain(..) {
            let _ = handle.join();
        }
        log_info!("🛑 ThumbnailServiceV3 stopped");
    }
}

impl ThumbnailServiceV3 {
    fn dec_counter(counter: &AtomicUsize) {
        let _ = counter.fetch_update(Ordering::Relaxed, Ordering::Relaxed, |v| {
            Some(v.saturating_sub(1))
        });
    }

    /// 请求可见区域缩略图（核心方法，不阻塞）
    pub fn request_visible_thumbnails(
        &self,
        app: &AppHandle,
        paths: Vec<String>,
        current_dir: String,
        center_index: Option<usize>,
        lane: TaskLane,
    ) {
        let requested_paths: HashSet<String> = paths.iter().cloned().collect();
        let center = center_index.unwrap_or(paths.len() / 2);

        // 更新当前目录
        {
            if let Ok(mut dir) = self.current_dir.write() {
                if *dir != current_dir {
                    let next_epoch = self.request_epoch.fetch_add(1, Ordering::AcqRel) + 1;
                    log_debug!(
                        "📂 目录切换: {} -> {} (epoch={})",
                        *dir,
                        current_dir,
                        next_epoch
                    );
                    *dir = current_dir.clone();
                }
            }
        }

        if !requested_paths.is_empty() && !matches!(lane, TaskLane::Background) {
            let dropped = queue::prune_lane_directory_except(
                &self.task_queue,
                lane,
                &current_dir,
                &requested_paths,
            );
            let dropped_len = dropped.len();
            for task in dropped {
                match task.lane {
                    TaskLane::Visible => Self::dec_counter(&self.queued_visible),
                    TaskLane::Prefetch => Self::dec_counter(&self.queued_prefetch),
                    TaskLane::Background => Self::dec_counter(&self.queued_background),
                }
                self.request_deduplicator
                    .release_with_id(&task.dedup_key, task.dedup_request_id);
            }
            self.window_pruned_tasks
                .fetch_add(dropped_len, Ordering::Relaxed);
        }

        // 批量分类路径
        let mut cached_paths: Vec<String> = Vec::new();
        let mut db_paths: Vec<String> = Vec::new();
        let mut generate_paths: Vec<(String, ThumbnailFileType, usize, u64)> = Vec::new();

        // 批量预获取所有锁：整个循环共享，消除 2N 次 lock/unlock（N = 可见路径数）
        // 读锁并发安全：worker 写锁在任务完成时短暂获取，不会死锁
        let mem_guard = self.memory_cache.read().ok();
        let sq_guard = self.save_queue.lock().ok();
        let db_guard = self.db_index.read().ok();
        let folder_guard = self.folder_db_index.read().ok();
        let failed_guard = self.failed_index.read().ok();

        // 分类每个路径
        for (priority, path) in paths.into_iter().enumerate() {
            // 检查内存缓存（使用预获取的锁，避免每次循环重新获取）
            let in_mem = mem_guard
                .as_ref()
                .map(|c| c.peek(path.as_str()).is_some())
                .unwrap_or(false)
                || sq_guard
                    .as_ref()
                    .map(|q| q.contains_key(path.as_str()))
                    .unwrap_or(false);
            if in_mem {
                cached_paths.push(path);
                continue;
            }
            // 检查失败索引（&str 查询，HashSet<String> 支持 Borrow<str>）
            if let Some(ref failed) = failed_guard {
                if failed.contains(path.as_str()) {
                    continue;
                }
            }
            // 检查数据库索引
            let in_db = db_guard
                .as_ref()
                .map(|i| i.contains(path.as_str()))
                .unwrap_or(false);
            let in_folder = folder_guard
                .as_ref()
                .map(|i| i.contains(path.as_str()))
                .unwrap_or(false);

            if in_db || in_folder {
                db_paths.push(path);
            } else {
                let file_type = detect_file_type(path.as_str());
                if let Some(request_id) = self.request_deduplicator.try_acquire(path.as_str()) {
                    generate_paths.push((path, file_type, priority, request_id));
                }
            }
        }

        // 显式释放所有锁，避免后续 load_from_db_async / enqueue_tasks 死锁
        drop(mem_guard);
        drop(sq_guard);
        drop(db_guard);
        drop(folder_guard);
        drop(failed_guard);

        // 1. 立即批量发送内存缓存命中的（仅发 path，前端通过协议 URL 取数据）
        if !cached_paths.is_empty() {
            let payload = ThumbnailBatchReadyPayload {
                items: cached_paths
                    .into_iter()
                    .map(|path| ThumbnailReadyPayload { path })
                    .collect(),
            };
            let _ = app.emit("thumbnail-batch-ready", payload);
        }

        // 2. 批量从数据库加载
        if !db_paths.is_empty() {
            self.load_from_db_async(app.clone(), db_paths);
        }

        // 3. 入队生成任务
        if !generate_paths.is_empty() {
            let epoch = self.request_epoch.load(Ordering::Acquire);
            queue::enqueue_tasks(
                &self.task_queue,
                generate_paths,
                &current_dir,
                center,
                epoch,
                lane,
                &self.queued_visible,
                &self.queued_prefetch,
                &self.queued_background,
            );
        }

        // 内存压力检查
        static REQ_COUNT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        if REQ_COUNT.fetch_add(1, Ordering::Relaxed) % 100 == 0 {
            self.two_phase_cache_cleanup(256 * 1024 * 1024);
        }
    }

    /// 异步从数据库加载缩略图
    fn load_from_db_async(&self, app: AppHandle, db_paths: Vec<String>) {
        let db = Arc::clone(&self.db);
        let memory_cache = Arc::clone(&self.memory_cache);
        let memory_cache_bytes = Arc::clone(&self.memory_cache_bytes);
        let db_read_window_stats = Arc::clone(&self.db_read_window);
        let db_read_last_ms_stats = Arc::clone(&self.db_read_last_ms);
        let read_min = self.config.db_read_batch_min.max(1);
        let read_max = self.config.db_read_batch_max.max(read_min);
        let target_ms = self.config.db_batch_target_ms.max(4);

        tokio::spawn(async move {
            let mut read_window = db_read_window_stats
                .load(Ordering::Relaxed)
                .clamp(read_min, read_max);

            let mut offset = 0usize;
            while offset < db_paths.len() {
                let end = (offset + read_window).min(db_paths.len());
                let chunk_started = Instant::now();
                let chunk_paths = &db_paths[offset..end];

                let mut folder_keys: Vec<String> = Vec::new();
                let mut file_keys: Vec<String> = Vec::new();
                for path in chunk_paths {
                    if is_likely_folder(path) {
                        folder_keys.push(path.clone());
                    } else {
                        file_keys.push(path.clone());
                    }
                }

                let mut folder_primary = db
                    .batch_load_thumbnails_by_keys_and_category(&folder_keys, "folder")
                    .unwrap_or_default();
                let folder_missing: Vec<String> = folder_keys
                    .iter()
                    .filter(|k| !folder_primary.contains_key(k.as_str()))
                    .cloned()
                    .collect();
                let mut folder_secondary = db
                    .batch_load_thumbnails_by_keys_and_category(&folder_missing, "file")
                    .unwrap_or_default();

                let mut file_primary = db
                    .batch_load_thumbnails_by_keys_and_category(&file_keys, "file")
                    .unwrap_or_default();
                let file_missing: Vec<String> = file_keys
                    .iter()
                    .filter(|k| !file_primary.contains_key(k.as_str()))
                    .cloned()
                    .collect();
                let mut file_secondary = db
                    .batch_load_thumbnails_by_keys_and_category(&file_missing, "folder")
                    .unwrap_or_default();

                let mut loaded: Vec<(String, Arc<[u8]>)> = Vec::with_capacity(chunk_paths.len());
                let mut touched_keys: Vec<String> = Vec::new();
                for path in chunk_paths {
                    let loaded_blob = if is_likely_folder(path) {
                        folder_primary
                            .remove(path)
                            .or_else(|| folder_secondary.remove(path))
                    } else {
                        file_primary
                            .remove(path)
                            .or_else(|| file_secondary.remove(path))
                    };

                    if let Some(blob) = loaded_blob {
                        touched_keys.push(path.clone());
                        loaded.push((path.clone(), Arc::<[u8]>::from(blob)));
                    }
                }

                if !touched_keys.is_empty() {
                    let _ = db.batch_update_access_time(&touched_keys);
                }

                if !loaded.is_empty() {
                    let mut payloads: Vec<ThumbnailReadyPayload> = Vec::with_capacity(loaded.len());
                    if let Ok(mut c) = memory_cache.write() {
                        for (path, blob) in loaded {
                            memory_cache_bytes.fetch_add(blob.len(), Ordering::SeqCst);
                            payloads.push(ThumbnailReadyPayload { path: path.clone() });
                            c.put(path, blob);
                        }
                    }

                    let emit_batch_size = read_window.clamp(8, 64);
                    for batch in payloads.chunks(emit_batch_size) {
                        let payload = ThumbnailBatchReadyPayload {
                            items: batch
                                .iter()
                                .map(|p| ThumbnailReadyPayload {
                                    path: p.path.clone(),
                                })
                                .collect(),
                        };
                        let _ = app.emit("thumbnail-batch-ready", payload);
                    }
                }

                let elapsed_ms = chunk_started.elapsed().as_millis() as u64;
                db_read_last_ms_stats.store(elapsed_ms, Ordering::Relaxed);

                if elapsed_ms > target_ms && read_window > read_min {
                    read_window = read_window.saturating_sub(4).max(read_min);
                } else if elapsed_ms < target_ms / 2
                    && chunk_paths.len() == read_window
                    && read_window < read_max
                {
                    read_window = (read_window + 4).min(read_max);
                }

                db_read_window_stats.store(read_window, Ordering::Relaxed);
                offset = end;
            }
        });
    }

    /// 取消指定目录的请求
    pub fn cancel_requests(&self, dir: &str) {
        let removed_tasks = queue::clear_directory_tasks(&self.task_queue, dir);
        for task in removed_tasks.iter() {
            match task.lane {
                TaskLane::Visible => Self::dec_counter(&self.queued_visible),
                TaskLane::Prefetch => Self::dec_counter(&self.queued_prefetch),
                TaskLane::Background => Self::dec_counter(&self.queued_background),
            }
            self.request_deduplicator
                .release_with_id(&task.dedup_key, task.dedup_request_id);
        }
        log_debug!("🚫 取消 {} 个任务 (目录: {})", removed_tasks.len(), dir);
    }

    /// 从内存缓存获取
    fn get_from_memory_cache(&self, path: &str) -> Option<Arc<[u8]>> {
        cache::get_from_memory_cache(&self.memory_cache, &self.save_queue, path)
    }

    /// 检查内存缓存是否存在
    fn has_in_memory_cache(&self, path: &str) -> bool {
        cache::has_in_memory_cache(&self.memory_cache, &self.save_queue, path)
    }

    /// 从内存缓存 peek（读锁，不更新 LRU 顺序）—— 用于协议处理器
    fn peek_from_memory_cache(&self, path: &str) -> Option<Arc<[u8]>> {
        cache::peek_from_memory_cache(&self.memory_cache, &self.save_queue, path)
    }

    /// 两阶段缓存清理
    pub fn two_phase_cache_cleanup(&self, max_bytes: usize) {
        let stats = cache::two_phase_cache_cleanup(
            &self.memory_cache,
            &self.memory_cache_bytes,
            &self.config,
            max_bytes,
        );
        if stats.evicted_entries > 0 {
            self.cache_decay_evicted_entries
                .fetch_add(stats.evicted_entries, Ordering::Relaxed);
            self.cache_decay_evicted_bytes
                .fetch_add(stats.evicted_bytes, Ordering::Relaxed);
        }
    }

    pub fn record_io_prefetch_stats(&self, files: usize, elapsed_ms: u64) {
        self.io_prefetch_runs.fetch_add(1, Ordering::Relaxed);
        self.io_prefetch_files.fetch_add(files, Ordering::Relaxed);
        self.io_prefetch_ms.fetch_add(elapsed_ms, Ordering::Relaxed);
    }
}

impl ThumbnailServiceV3 {
    /// 单个缩略图查找：内存缓存优先，回落到 DB。由内建协议的 /thumb/{key} 端点调用。
    /// 使用 peek（读锁）而非 get（写锁）：并发 <img> 请求不争抢写锁
    pub fn lookup_thumbnail(&self, key: &str) -> Option<Arc<[u8]>> {
        // 1. 内存缓存（读锁 peek，不更新 LRU 顺序——避免 50+ 并发图片请求争抢写锁）
        if let Some(blob) = self.peek_from_memory_cache(key) {
            return Some(blob);
        }
        // 2. 回落到数据库（无 syscall：用启发式优先类别，再回退另一类别）
        let likely_folder = is_likely_folder(key);
        let (primary, secondary) = if likely_folder {
            ("folder", "file")
        } else {
            ("file", "folder")
        };

        if let Ok(Some(blob)) = self.db.load_thumbnail_by_key_and_category(key, primary) {
            let blob = Arc::<[u8]>::from(blob);
            if let Ok(mut c) = self.memory_cache.write() {
                if c.peek(key).is_none() {
                    self.memory_cache_bytes
                        .fetch_add(blob.len(), Ordering::SeqCst);
                    c.put(key.to_string(), blob.clone());
                }
            }
            return Some(blob);
        }
        if let Ok(Some(blob)) = self.db.load_thumbnail_by_key_and_category(key, secondary) {
            let blob = Arc::<[u8]>::from(blob);
            if let Ok(mut c) = self.memory_cache.write() {
                if c.peek(key).is_none() {
                    self.memory_cache_bytes
                        .fetch_add(blob.len(), Ordering::SeqCst);
                    c.put(key.to_string(), blob.clone());
                }
            }
            return Some(blob);
        }
        None
    }

    /// 直接从缓存获取（同步）
    pub fn get_cached_thumbnails(&self, paths: Vec<String>) -> Vec<(String, Option<Vec<u8>>)> {
        let mut results: Vec<(String, Option<Arc<[u8]>>)> = Vec::with_capacity(paths.len());
        let mut db_loaded_for_cache: Vec<(String, Arc<[u8]>)> = Vec::new();
        for path in paths {
            let blob = self.get_from_memory_cache(&path);
            if blob.is_some() {
                results.push((path, blob));
                continue;
            }
            let likely_folder = is_likely_folder(&path);
            let (primary, secondary) = if likely_folder {
                ("folder", "file")
            } else {
                ("file", "folder")
            };

            let loaded = self
                .db
                .load_thumbnail_by_key_and_category(&path, primary)
                .ok()
                .flatten()
                .or_else(|| {
                    self.db
                        .load_thumbnail_by_key_and_category(&path, secondary)
                        .ok()
                        .flatten()
                });

            if let Some(blob) = loaded {
                let blob = Arc::<[u8]>::from(blob);
                db_loaded_for_cache.push((path.clone(), blob.clone()));
                results.push((path, Some(blob)));
            } else {
                results.push((path, None));
            }
        }

        if !db_loaded_for_cache.is_empty() {
            if let Ok(mut c) = self.memory_cache.write() {
                for (path, blob) in db_loaded_for_cache {
                    if c.peek(path.as_str()).is_none() {
                        self.memory_cache_bytes
                            .fetch_add(blob.len(), Ordering::SeqCst);
                        c.put(path, blob);
                    }
                }
            }
        }

        results
            .into_iter()
            .map(|(path, blob)| (path, blob.map(|b| b.as_ref().to_vec())))
            .collect()
    }

    /// 获取缓存统计
    pub fn get_cache_stats(&self) -> CacheStats {
        let memory_count = self.memory_cache.read().map(|c| c.len()).unwrap_or(0);
        let memory_bytes = self.memory_cache_bytes.load(Ordering::SeqCst);
        let queue_visible = self.queued_visible.load(Ordering::Relaxed);
        let queue_prefetch = self.queued_prefetch.load(Ordering::Relaxed);
        let queue_background = self.queued_background.load(Ordering::Relaxed);
        let queue_length = queue_visible + queue_prefetch + queue_background;
        let active_workers = self.active_workers.load(Ordering::SeqCst);
        let processed_visible = self.processed_visible.load(Ordering::Relaxed);
        let processed_prefetch = self.processed_prefetch.load(Ordering::Relaxed);
        let processed_background = self.processed_background.load(Ordering::Relaxed);
        let decode_wait_count = self.decode_wait_count.load(Ordering::Relaxed);
        let decode_wait_ms = self.decode_wait_ms.load(Ordering::Relaxed);
        let scale_wait_count = self.scale_wait_count.load(Ordering::Relaxed);
        let scale_wait_ms = self.scale_wait_ms.load(Ordering::Relaxed);
        let encode_wait_count = self.encode_wait_count.load(Ordering::Relaxed);
        let encode_wait_ms = self.encode_wait_ms.load(Ordering::Relaxed);
        let window_pruned_tasks = self.window_pruned_tasks.load(Ordering::Relaxed);
        let cache_decay_evicted_entries = self.cache_decay_evicted_entries.load(Ordering::Relaxed);
        let cache_decay_evicted_bytes = self.cache_decay_evicted_bytes.load(Ordering::Relaxed);
        let io_prefetch_runs = self.io_prefetch_runs.load(Ordering::Relaxed);
        let io_prefetch_files = self.io_prefetch_files.load(Ordering::Relaxed);
        let io_prefetch_ms = self.io_prefetch_ms.load(Ordering::Relaxed);
        let db_read_window = self.db_read_window.load(Ordering::Relaxed);
        let db_read_last_ms = self.db_read_last_ms.load(Ordering::Relaxed);
        let db_write_window = self.db_write_window.load(Ordering::Relaxed);
        let db_write_last_ms = self.db_write_last_ms.load(Ordering::Relaxed);
        let db_write_last_items = self.db_write_last_items.load(Ordering::Relaxed);
        let (database_count, database_bytes) = self
            .db
            .get_maintenance_stats()
            .map(|(total, _, _)| (total as i64, 0i64))
            .unwrap_or((0, 0));
        CacheStats {
            memory_count,
            memory_bytes,
            database_count,
            database_bytes,
            queue_length,
            queue_visible,
            queue_prefetch,
            queue_background,
            active_workers,
            processed_visible,
            processed_prefetch,
            processed_background,
            decode_wait_count,
            decode_wait_ms,
            scale_wait_count,
            scale_wait_ms,
            encode_wait_count,
            encode_wait_ms,
            window_pruned_tasks,
            cache_decay_evicted_entries,
            cache_decay_evicted_bytes,
            io_prefetch_runs,
            io_prefetch_files,
            io_prefetch_ms,
            db_read_window,
            db_read_last_ms,
            db_write_window,
            db_write_last_ms,
            db_write_last_items,
        }
    }

    /// 清除缓存
    pub fn clear_cache(&self, scope: &str) {
        match scope {
            "memory" => {
                if let Ok(mut c) = self.memory_cache.write() {
                    c.clear();
                    self.memory_cache_bytes.store(0, Ordering::SeqCst);
                }
                log_info!("🧹 内存缓存已清除");
            }
            "database" => {
                log_info!("🧹 数据库缓存清除待实现");
            }
            _ => {
                if let Ok(mut c) = self.memory_cache.write() {
                    c.clear();
                    self.memory_cache_bytes.store(0, Ordering::SeqCst);
                }
                log_info!("🧹 内存缓存已清除");
            }
        }
    }

    // ============== 数据库维护方法 ==============

    /// 获取数据库详细统计
    pub fn get_db_stats(&self) -> Result<(usize, usize, i64), String> {
        self.db
            .get_detailed_stats()
            .map_err(|e| format!("获取统计失败: {}", e))
    }

    /// 获取失败黑名单数量（内存 + DB）
    pub fn get_failed_count(&self) -> Result<(usize, usize), String> {
        let memory_count = self.failed_index.read().map(|idx| idx.len()).unwrap_or(0);
        let db_count = self
            .db
            .get_failed_count()
            .map_err(|e| format!("获取失败记录数量失败: {}", e))?;
        Ok((memory_count, db_count))
    }

    /// 清除失败黑名单（内存索引 + 数据库记录）
    pub fn clear_failed_index(&self) -> Result<usize, String> {
        // 1. 清除内存中的失败索引
        let memory_cleared = if let Ok(mut idx) = self.failed_index.write() {
            let count = idx.len();
            idx.clear();
            count
        } else {
            0
        };
        // 2. 清除数据库中的失败记录
        let db_cleared = self
            .db
            .clear_all_failed_thumbnails()
            .map_err(|e| format!("清除数据库失败记录失败: {}", e))?;
        log_info!(
            "🧹 已清除失败黑名单: 内存 {} 条, 数据库 {} 条",
            memory_cleared,
            db_cleared
        );
        Ok(memory_cleared + db_cleared)
    }

    /// 清理无效路径
    pub fn cleanup_invalid_paths(&self) -> Result<usize, String> {
        self.db
            .cleanup_invalid_paths()
            .map_err(|e| format!("清理失败: {}", e))
    }

    /// 清理过期条目
    pub fn cleanup_expired_entries(
        &self,
        days: i64,
        exclude_folders: bool,
    ) -> Result<usize, String> {
        self.db
            .cleanup_expired_entries(days, exclude_folders)
            .map_err(|e| format!("清理失败: {}", e))
    }

    /// 清理指定路径前缀
    pub fn cleanup_by_path_prefix(&self, path_prefix: &str) -> Result<usize, String> {
        self.db
            .cleanup_by_path_prefix(path_prefix)
            .map_err(|e| format!("清理失败: {}", e))
    }

    /// 执行数据库压缩
    pub fn vacuum_db(&self) -> Result<(), String> {
        self.db.vacuum().map_err(|e| format!("压缩失败: {}", e))
    }

    /// 删除单个缩略图缓存
    pub fn remove_thumbnail(&self, path: &str) -> Result<(), String> {
        // 从内存缓存删除
        if let Ok(mut c) = self.memory_cache.write() {
            if let Some(blob) = c.pop(path) {
                self.memory_cache_bytes
                    .fetch_sub(blob.len(), Ordering::SeqCst);
            }
        }
        // 从保存队列删除
        if let Ok(mut q) = self.save_queue.lock() {
            q.remove(path);
        }
        // 从索引删除
        if let Ok(mut i) = self.db_index.write() {
            i.remove(path);
        }
        if let Ok(mut i) = self.folder_db_index.write() {
            i.remove(path);
        }
        if let Ok(mut i) = self.failed_index.write() {
            i.remove(path);
        }
        // 从数据库删除
        self.db
            .delete_thumbnail(path)
            .map_err(|e| format!("删除失败: {}", e))
    }

    /// 强制重新生成缩略图
    pub fn regenerate_thumbnail(&self, app: &AppHandle, path: &str, current_dir: &str) {
        let Some(request_id) = self.request_deduplicator.try_acquire(path) else {
            log_debug!("🔄 跳过重复重建请求: {}", path);
            return;
        };

        let file_type = detect_file_type(path);
        let task = GenerateTask {
            dedup_key: path.to_string(),
            dedup_request_id: request_id,
            path: path.to_string(),
            directory: current_dir.to_string(),
            request_epoch: self.request_epoch.load(Ordering::Acquire),
            lane: TaskLane::Visible,
            file_type,
            center_distance: 0,
            original_index: 0,
        };
        let dropped_tasks = queue::replace_path_with_task(&self.task_queue, path, task);
        for dropped in dropped_tasks {
            match dropped.lane {
                TaskLane::Visible => Self::dec_counter(&self.queued_visible),
                TaskLane::Prefetch => Self::dec_counter(&self.queued_prefetch),
                TaskLane::Background => Self::dec_counter(&self.queued_background),
            }
            self.request_deduplicator
                .release_with_id(&dropped.dedup_key, dropped.dedup_request_id);
        }
        self.queued_visible.fetch_add(1, Ordering::Relaxed);
        log_info!("🔄 强制重新生成缩略图: {}", path);

        let _ = app;
    }

    /// 检查内存压力
    pub fn check_memory_pressure(&self, max_bytes: usize) {
        cache::check_memory_pressure(&self.memory_cache, &self.memory_cache_bytes, max_bytes);
    }

    /// 暂停调度：worker 不消费任务，但保持线程存活
    pub fn pause_scheduler(&self) {
        self.scheduler_paused.store(true, Ordering::Release);
    }

    /// 恢复调度并唤醒 worker
    pub fn resume_scheduler(&self) {
        self.scheduler_paused.store(false, Ordering::Release);
        self.task_queue.1.notify_all();
    }
}

impl Drop for ThumbnailServiceV3 {
    fn drop(&mut self) {
        self.stop();
    }
}
