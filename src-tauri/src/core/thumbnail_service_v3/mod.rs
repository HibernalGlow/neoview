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
    detect_file_type, is_archive_file, is_likely_folder, CacheStats, ThumbnailBatchReadyPayload,
    ThumbnailFileType, ThumbnailReadyPayload,
};

// 内部使用
use crate::core::thumbnail_db::ThumbnailDb;
use crate::core::thumbnail_generator::ThumbnailGenerator;
use crate::core::request_dedup::RequestDeduplicator;
use lru::LruCache;
use std::collections::{HashMap, HashSet, VecDeque};
use std::num::NonZeroUsize;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};
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
    memory_cache: Arc<RwLock<LruCache<String, Vec<u8>>>>,
    /// 内存缓存大小（字节）
    memory_cache_bytes: Arc<AtomicUsize>,
    /// 数据库
    db: Arc<ThumbnailDb>,
    /// 缩略图生成器
    generator: Arc<ThumbnailGenerator>,
    /// 生成任务队列
    task_queue: Arc<Mutex<VecDeque<GenerateTask>>>,
    /// 当前目录
    current_dir: Arc<RwLock<String>>,
    /// 是否正在运行
    running: Arc<AtomicBool>,
    /// 活跃工作线程数
    active_workers: Arc<AtomicUsize>,
    /// 工作线程句柄
    workers: Arc<Mutex<Vec<JoinHandle<()>>>>,
    /// 数据库索引 (已有缩略图的路径集合)
    db_index: Arc<RwLock<HashSet<String>>>,
    /// 文件夹数据库索引
    folder_db_index: Arc<RwLock<HashSet<String>>>,
    /// 失败记录索引
    failed_index: Arc<RwLock<HashSet<String>>>,
    /// 保存队列（延迟批量保存到数据库）
    save_queue: Arc<Mutex<HashMap<String, (Vec<u8>, i64, i32, Instant)>>>,
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
            task_queue: Arc::new(Mutex::new(VecDeque::new())),
            current_dir: Arc::new(RwLock::new(String::new())),
            running: Arc::new(AtomicBool::new(false)),
            active_workers: Arc::new(AtomicUsize::new(0)),
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
            Arc::clone(&self.active_workers),
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
        let mut workers = self.workers.lock().unwrap();
        for handle in workers.drain(..) {
            let _ = handle.join();
        }
        log_info!("🛑 ThumbnailServiceV3 stopped");
    }
}

impl ThumbnailServiceV3 {
    /// 请求可见区域缩略图（核心方法，不阻塞）
    pub fn request_visible_thumbnails(
        &self,
        app: &AppHandle,
        paths: Vec<String>,
        current_dir: String,
        center_index: Option<usize>,
    ) {
        let center = center_index.unwrap_or(paths.len() / 2);

        // 更新当前目录
        {
            if let Ok(mut dir) = self.current_dir.write() {
                if *dir != current_dir {
                    if let Ok(mut q) = self.task_queue.lock() {
                        let old_tasks: Vec<GenerateTask> = q.drain(..).collect();
                        let old_len = old_tasks.len();
                        for task in old_tasks {
                            self.request_deduplicator
                                .release_with_id(&task.dedup_key, task.dedup_request_id);
                        }
                        log_debug!(
                            "📂 目录切换: {} -> {} (清空 {} 个任务)",
                            *dir,
                            current_dir,
                            old_len
                        );
                    }
                    *dir = current_dir.clone();
                }
            }
        }

        // 批量分类路径
        let mut cached_paths: Vec<(String, Vec<u8>)> = Vec::new();
        let mut db_paths: Vec<String> = Vec::new();
        let mut generate_paths: Vec<(String, ThumbnailFileType, usize, u64)> = Vec::new();

        // 读取索引快照
        let (db_idx_snap, folder_idx_snap, failed_snap) = {
            let db_idx = self.db_index.read().ok().map(|g| g.clone());
            let folder_idx = self.folder_db_index.read().ok().map(|g| g.clone());
            let failed = self.failed_index.read().ok().map(|g| g.clone());
            (db_idx, folder_idx, failed)
        };

        // 分类每个路径
        for (priority, path) in paths.iter().enumerate() {
            // 检查内存缓存
            if self.has_in_memory_cache(path) {
                if let Some(blob) = self.get_from_memory_cache(path) {
                    cached_paths.push((path.clone(), blob));
                    continue;
                }
            }
            // 检查失败索引
            if let Some(ref failed) = failed_snap {
                if failed.contains(path) {
                    continue;
                }
            }
            // 检查数据库索引
            let in_db = db_idx_snap
                .as_ref()
                .map(|i| i.contains(path))
                .unwrap_or(false);
            let in_folder = folder_idx_snap
                .as_ref()
                .map(|i| i.contains(path))
                .unwrap_or(false);

            if in_db || in_folder {
                db_paths.push(path.clone());
            } else {
                let file_type = detect_file_type(path);
                if let Some(request_id) = self.request_deduplicator.try_acquire(path) {
                    generate_paths.push((path.clone(), file_type, priority, request_id));
                }
            }
        }

        // 1. 立即发送内存缓存命中的
        for (path, blob) in cached_paths {
            let _ = app.emit("thumbnail-ready", ThumbnailReadyPayload { path, blob });
        }

        // 2. 批量从数据库加载
        if !db_paths.is_empty() {
            self.load_from_db_async(app.clone(), db_paths);
        }

        // 3. 入队生成任务
        if !generate_paths.is_empty() {
            queue::enqueue_tasks(&self.task_queue, generate_paths, &current_dir, center);
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

        tokio::spawn(async move {
            const DB_EVENT_BATCH_SIZE: usize = 24;
            let mut batch_payloads: Vec<ThumbnailReadyPayload> = Vec::with_capacity(DB_EVENT_BATCH_SIZE);

            for path in db_paths.iter() {
                let category = if std::path::Path::new(path).is_dir() || !path.contains('.') {
                    "folder"
                } else {
                    "file"
                };
                if let Ok(Some(blob)) = db.load_thumbnail_by_key_and_category(path, category) {
                    if let Ok(mut c) = memory_cache.write() {
                        memory_cache_bytes.fetch_add(blob.len(), Ordering::SeqCst);
                        c.put(path.clone(), blob.clone());
                    }
                    batch_payloads.push(ThumbnailReadyPayload {
                        path: path.clone(),
                        blob,
                    });

                    if batch_payloads.len() >= DB_EVENT_BATCH_SIZE {
                        let payload = ThumbnailBatchReadyPayload {
                            items: std::mem::take(&mut batch_payloads),
                        };
                        let _ = app.emit("thumbnail-batch-ready", payload);
                    }
                    let _ = db.update_access_time(path);
                }
            }

            if !batch_payloads.is_empty() {
                let payload = ThumbnailBatchReadyPayload {
                    items: batch_payloads,
                };
                let _ = app.emit("thumbnail-batch-ready", payload);
            }
        });
    }

    /// 取消指定目录的请求
    pub fn cancel_requests(&self, dir: &str) {
        let removed_tasks = queue::clear_directory_tasks(&self.task_queue, dir);
        for task in removed_tasks.iter() {
            self.request_deduplicator
                .release_with_id(&task.dedup_key, task.dedup_request_id);
        }
        log_debug!("🚫 取消 {} 个任务 (目录: {})", removed_tasks.len(), dir);
    }

    /// 从内存缓存获取
    fn get_from_memory_cache(&self, path: &str) -> Option<Vec<u8>> {
        cache::get_from_memory_cache(&self.memory_cache, &self.save_queue, path)
    }

    /// 检查内存缓存是否存在
    fn has_in_memory_cache(&self, path: &str) -> bool {
        cache::has_in_memory_cache(&self.memory_cache, &self.save_queue, path)
    }

    /// 两阶段缓存清理
    pub fn two_phase_cache_cleanup(&self, max_bytes: usize) {
        cache::two_phase_cache_cleanup(
            &self.memory_cache,
            &self.memory_cache_bytes,
            &self.config,
            max_bytes,
        );
    }
}

impl ThumbnailServiceV3 {
    /// 直接从缓存获取（同步）
    pub fn get_cached_thumbnails(&self, paths: Vec<String>) -> Vec<(String, Option<Vec<u8>>)> {
        let mut results = Vec::with_capacity(paths.len());
        for path in paths {
            let blob = self.get_from_memory_cache(&path);
            if blob.is_some() {
                results.push((path, blob));
                continue;
            }
            let category = if std::path::Path::new(&path).is_dir() {
                "folder"
            } else {
                "file"
            };
            match self.db.load_thumbnail_by_key_and_category(&path, category) {
                Ok(Some(blob)) => {
                    if let Ok(mut c) = self.memory_cache.write() {
                        self.memory_cache_bytes
                            .fetch_add(blob.len(), Ordering::SeqCst);
                        c.put(path.clone(), blob.clone());
                    }
                    results.push((path, Some(blob)));
                }
                _ => results.push((path, None)),
            }
        }
        results
    }

    /// 获取缓存统计
    pub fn get_cache_stats(&self) -> CacheStats {
        let memory_count = self.memory_cache.read().map(|c| c.len()).unwrap_or(0);
        let memory_bytes = self.memory_cache_bytes.load(Ordering::SeqCst);
        let queue_length = queue::queue_len(&self.task_queue);
        let active_workers = self.active_workers.load(Ordering::SeqCst);
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
            active_workers,
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
            file_type,
            center_distance: 0,
            original_index: 0,
        };
        if let Ok(mut q) = self.task_queue.lock() {
            let mut dropped_tasks = Vec::new();
            let mut kept = VecDeque::with_capacity(q.len());
            while let Some(existing) = q.pop_front() {
                if existing.path == path {
                    dropped_tasks.push(existing);
                } else {
                    kept.push_back(existing);
                }
            }
            *q = kept;
            for dropped in dropped_tasks {
                self.request_deduplicator
                    .release_with_id(&dropped.dedup_key, dropped.dedup_request_id);
            }
            q.push_front(task);
            log_info!("🔄 强制重新生成缩略图: {}", path);
        }

        let _ = app;
    }

    /// 检查内存压力
    pub fn check_memory_pressure(&self, max_bytes: usize) {
        cache::check_memory_pressure(&self.memory_cache, &self.memory_cache_bytes, max_bytes);
    }
}

impl Drop for ThumbnailServiceV3 {
    fn drop(&mut self) {
        self.stop();
    }
}
