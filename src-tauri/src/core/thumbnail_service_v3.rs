//! Thumbnail Service V3
//! 缩略图服务 V3 - 复刻 NeeView 架构
//! 
//! 核心特点：
//! 1. 后端为主，前端只需通知可见区域 + 接收 blob
//! 2. 不阻塞前端文件夹浏览
//! 3. LRU 内存缓存 + SQLite 数据库缓存
//! 4. 8 线程工作池并行生成

use crate::core::thumbnail_db::ThumbnailDb;
use crate::core::thumbnail_generator::ThumbnailGenerator;
use lru::LruCache;
use serde::Serialize;
use std::collections::VecDeque;
use std::num::NonZeroUsize;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

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

/// 配置参数
#[derive(Clone)]
pub struct ThumbnailServiceConfig {
    /// 文件夹搜索深度
    pub folder_search_depth: u32,
    /// LRU 内存缓存大小
    pub memory_cache_size: usize,
    /// 后台工作线程数
    pub worker_threads: usize,
    /// 缩略图尺寸
    pub thumbnail_size: u32,
    /// 数据库延迟保存时间 (毫秒)
    pub db_save_delay_ms: u64,
}

impl Default for ThumbnailServiceConfig {
    fn default() -> Self {
        Self {
            folder_search_depth: 2,
            memory_cache_size: 1024,
            worker_threads: 8,
            thumbnail_size: 256,
            db_save_delay_ms: 2000,
        }
    }
}

/// 生成任务
#[derive(Clone)]
struct GenerateTask {
    path: String,
    directory: String,
    is_folder: bool,
    priority: usize,
}

/// 缩略图就绪事件 payload
#[derive(Clone, Serialize)]
pub struct ThumbnailReadyPayload {
    pub path: String,
    pub blob: Vec<u8>,
}

/// 缓存统计
#[derive(Clone, Serialize)]
pub struct CacheStats {
    pub memory_count: usize,
    pub memory_bytes: usize,
    pub database_count: i64,
    pub database_bytes: i64,
    pub queue_length: usize,
    pub active_workers: usize,
}

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
    generator: Arc<Mutex<ThumbnailGenerator>>,
    
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
    /// 启动时加载，用于快速判断是否需要生成
    db_index: Arc<RwLock<std::collections::HashSet<String>>>,
    
    /// 失败记录索引 (避免重复尝试生成失败的缩略图)
    failed_index: Arc<RwLock<std::collections::HashSet<String>>>,
}

impl ThumbnailServiceV3 {
    /// 创建新的缩略图服务
    pub fn new(
        db: Arc<ThumbnailDb>,
        generator: Arc<Mutex<ThumbnailGenerator>>,
        config: ThumbnailServiceConfig,
    ) -> Self {
        let cache_size = NonZeroUsize::new(config.memory_cache_size).unwrap_or(NonZeroUsize::new(1024).unwrap());
        
        // 从数据库加载索引
        let (db_index, failed_index) = Self::load_indices_from_db(&db);
        log_info!("📊 数据库索引加载完成: {} 个缩略图, {} 个失败记录", db_index.len(), failed_index.len());
        
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
            failed_index: Arc::new(RwLock::new(failed_index)),
        }
    }
    
    /// 从数据库加载索引
    fn load_indices_from_db(db: &Arc<ThumbnailDb>) -> (std::collections::HashSet<String>, std::collections::HashSet<String>) {
        let mut db_index = std::collections::HashSet::new();
        let mut failed_index = std::collections::HashSet::new();
        
        // 加载成功的缩略图路径
        if let Ok(paths) = db.get_all_thumbnail_keys() {
            for path in paths {
                db_index.insert(path);
            }
        }
        
        // 加载失败记录
        if let Ok(paths) = db.get_all_failed_keys() {
            for path in paths {
                failed_index.insert(path);
            }
        }
        
        (db_index, failed_index)
    }
    
    /// 启动工作线程
    pub fn start(&self, app: AppHandle) {
        if self.running.swap(true, Ordering::SeqCst) {
            return; // 已经在运行
        }
        
        let mut workers = self.workers.lock().unwrap();
        
        for i in 0..self.config.worker_threads {
            let app = app.clone();
            let task_queue = Arc::clone(&self.task_queue);
            let current_dir = Arc::clone(&self.current_dir);
            let running = Arc::clone(&self.running);
            let active_workers = Arc::clone(&self.active_workers);
            let memory_cache: Arc<RwLock<LruCache<String, Vec<u8>>>> = Arc::clone(&self.memory_cache);
            let memory_cache_bytes: Arc<AtomicUsize> = Arc::clone(&self.memory_cache_bytes);
            let db = Arc::clone(&self.db);
            let generator = Arc::clone(&self.generator);
            let folder_depth = self.config.folder_search_depth;
            let db_index = Arc::clone(&self.db_index);
            let failed_index = Arc::clone(&self.failed_index);
            
            let handle = thread::spawn(move || {
                log_debug!("🔧 Worker {} started", i);
                
                while running.load(Ordering::SeqCst) {
                    // 获取任务
                    let task = {
                        let mut queue = task_queue.lock().unwrap();
                        queue.pop_front()
                    };
                    
                    if let Some(task) = task {
                        // 检查是否应该取消（目录已切换）
                        let current = current_dir.read().unwrap().clone();
                        if !task.directory.is_empty() && task.directory != current {
                            log_debug!("⏭️ 跳过非当前目录任务: {}", task.path);
                            continue;
                        }
                        
                        active_workers.fetch_add(1, Ordering::SeqCst);
                        
                        // 生成缩略图
                        let result = if task.is_folder {
                            Self::generate_folder_thumbnail_static(
                                &generator,
                                &db,
                                &task.path,
                                folder_depth,
                            )
                        } else {
                            Self::generate_file_thumbnail_static(&generator, &task.path)
                        };
                        
                        match result {
                            Ok(blob) => {
                                // 更新内存缓存
                                {
                                    let mut cache = memory_cache.write().unwrap();
                                    let blob_size = blob.len();
                                    cache.put(task.path.clone(), blob.clone());
                                    memory_cache_bytes.fetch_add(blob_size, Ordering::SeqCst);
                                }
                                
                                // 更新数据库索引
                                {
                                    let mut index = db_index.write().unwrap();
                                    index.insert(task.path.clone());
                                }
                                
                                // 发送到前端（不阻塞）
                                let _ = app.emit("thumbnail-ready", ThumbnailReadyPayload {
                                    path: task.path.clone(),
                                    blob,
                                });
                            }
                            Err(e) => {
                                log_debug!("⚠️ 生成缩略图失败: {} - {}", task.path, e);
                                // 更新失败索引（避免重复尝试）
                                {
                                    let mut index = failed_index.write().unwrap();
                                    index.insert(task.path.clone());
                                }
                            }
                        }
                        
                        active_workers.fetch_sub(1, Ordering::SeqCst);
                    } else {
                        // 队列为空，短暂休眠
                        thread::sleep(Duration::from_millis(10));
                    }
                }
                
                log_debug!("🔧 Worker {} stopped", i);
            });
            
            workers.push(handle);
        }
        
        log_info!("✅ ThumbnailServiceV3 started with {} workers", self.config.worker_threads);
    }
    
    /// 停止工作线程
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        
        // 等待工作线程结束
        let mut workers = self.workers.lock().unwrap();
        for handle in workers.drain(..) {
            let _ = handle.join();
        }
        
        log_info!("🛑 ThumbnailServiceV3 stopped");
    }
    
    /// 请求可见区域缩略图（核心方法，不阻塞）
    pub fn request_visible_thumbnails(
        &self,
        app: &AppHandle,
        paths: Vec<String>,
        current_dir: String,
    ) {
        // 更新当前目录
        {
            let mut dir = self.current_dir.write().unwrap();
            if *dir != current_dir {
                // 目录切换，清空队列
                let mut queue = self.task_queue.lock().unwrap();
                let old_len = queue.len();
                queue.clear();
                log_debug!("📂 目录切换: {} -> {} (清空 {} 个任务)", *dir, current_dir, old_len);
                *dir = current_dir.clone();
            }
        }
        
        // 处理每个路径
        for (priority, path) in paths.iter().enumerate() {
            // 1. 检查内存缓存
            if let Some(blob) = self.get_from_memory_cache(path) {
                // 直接发送到前端
                let _ = app.emit("thumbnail-ready", ThumbnailReadyPayload {
                    path: path.clone(),
                    blob,
                });
                continue;
            }
            
            // 2. 检查失败索引（O(1) 查找，避免重复尝试失败的缩略图）
            {
                let failed_index = self.failed_index.read().unwrap();
                if failed_index.contains(path) {
                    continue; // 跳过已知失败的路径
                }
            }
            
            // 3. 检查数据库索引（O(1) 查找）
            let in_db_index = {
                let db_index = self.db_index.read().unwrap();
                db_index.contains(path)
            };
            
            if in_db_index {
                // 在索引中，异步从数据库加载
                let db = Arc::clone(&self.db);
                let app = app.clone();
                let path = path.clone();
                let memory_cache: Arc<RwLock<LruCache<String, Vec<u8>>>> = Arc::clone(&self.memory_cache);
                let memory_cache_bytes: Arc<AtomicUsize> = Arc::clone(&self.memory_cache_bytes);
                
                tokio::spawn(async move {
                    let category = if std::path::Path::new(&path).is_dir() { "folder" } else { "file" };
                    if let Ok(Some(blob)) = db.load_thumbnail_by_key_and_category(&path, category) {
                        // 更新内存缓存
                        {
                            let mut cache = memory_cache.write().unwrap();
                            let blob_size = blob.len();
                            cache.put(path.clone(), blob.clone());
                            memory_cache_bytes.fetch_add(blob_size, Ordering::SeqCst);
                        }
                        
                        // 发送到前端
                        let _ = app.emit("thumbnail-ready", ThumbnailReadyPayload {
                            path: path.clone(),
                            blob,
                        });
                    }
                });
            } else {
                // 不在索引中，入队生成任务
                let is_folder = Path::new(path).is_dir();
                let mut queue = self.task_queue.lock().unwrap();
                queue.push_back(GenerateTask {
                    path: path.clone(),
                    directory: current_dir.clone(),
                    is_folder,
                    priority,
                });
            }
        }
    }
    
    /// 取消指定目录的请求
    pub fn cancel_requests(&self, dir: &str) {
        let mut queue = self.task_queue.lock().unwrap();
        let before = queue.len();
        queue.retain(|task| task.directory != dir);
        let after = queue.len();
        log_debug!("🚫 取消 {} 个任务 (目录: {})", before - after, dir);
    }
    
    /// 从内存缓存获取
    fn get_from_memory_cache(&self, path: &str) -> Option<Vec<u8>> {
        let mut cache = self.memory_cache.write().unwrap();
        cache.get(path).cloned()
    }
    
    /// 直接从缓存获取（同步）
    pub fn get_cached_thumbnails(&self, paths: Vec<String>) -> Vec<(String, Option<Vec<u8>>)> {
        let mut results = Vec::with_capacity(paths.len());
        
        for path in paths {
            // 先检查内存缓存
            let blob = self.get_from_memory_cache(&path);
            if blob.is_some() {
                results.push((path, blob));
                continue;
            }
            
            // 再检查数据库缓存
            let category = if std::path::Path::new(&path).is_dir() { "folder" } else { "file" };
            match self.db.load_thumbnail_by_key_and_category(&path, category) {
                Ok(Some(blob)) => {
                    // 更新内存缓存
                    {
                        let mut cache = self.memory_cache.write().unwrap();
                        let blob_size = blob.len();
                        cache.put(path.clone(), blob.clone());
                        self.memory_cache_bytes.fetch_add(blob_size, Ordering::SeqCst);
                    }
                    results.push((path, Some(blob)));
                }
                _ => {
                    results.push((path, None));
                }
            }
        }
        
        results
    }
    
    /// 获取缓存统计
    pub fn get_cache_stats(&self) -> CacheStats {
        let memory_count = self.memory_cache.read().unwrap().len();
        let memory_bytes = self.memory_cache_bytes.load(Ordering::SeqCst);
        let queue_length = self.task_queue.lock().unwrap().len();
        let active_workers = self.active_workers.load(Ordering::SeqCst);
        
        // 从数据库获取统计
        let (database_count, database_bytes) = self.db.get_maintenance_stats()
            .map(|(total, _, _)| (total as i64, 0i64)) // 简化，只返回条目数
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
                let mut cache = self.memory_cache.write().unwrap();
                cache.clear();
                self.memory_cache_bytes.store(0, Ordering::SeqCst);
                log_info!("🧹 内存缓存已清除");
            }
            "database" => {
                // 数据库清除：删除所有记录
                // TODO: 添加 ThumbnailDb::clear_all() 方法
                log_info!("🧹 数据库缓存清除待实现（需要手动删除数据库文件）");
            }
            "all" | _ => {
                // 清除内存缓存
                {
                    let mut cache = self.memory_cache.write().unwrap();
                    cache.clear();
                    self.memory_cache_bytes.store(0, Ordering::SeqCst);
                }
                log_info!("🧹 内存缓存已清除");
            }
        }
    }
    
    /// 生成文件缩略图（静态方法，用于工作线程）
    fn generate_file_thumbnail_static(
        generator: &Arc<Mutex<ThumbnailGenerator>>,
        path: &str,
    ) -> Result<Vec<u8>, String> {
        let gen = generator.lock().map_err(|e| format!("获取生成器锁失败: {}", e))?;
        gen.generate_file_thumbnail(path)
    }
    
    /// 生成文件夹缩略图（复刻 NeeView 策略）
    fn generate_folder_thumbnail_static(
        generator: &Arc<Mutex<ThumbnailGenerator>>,
        db: &Arc<ThumbnailDb>,
        folder_path: &str,
        max_depth: u32,
    ) -> Result<Vec<u8>, String> {
        // 1. 先尝试从数据库加载（可能已有缓存）
        if let Ok(Some(blob)) = db.load_thumbnail_by_key_and_category(folder_path, "folder") {
            return Ok(blob);
        }
        
        // 2. 查找封面图片
        if let Some(cover) = Self::find_cover_image(folder_path)? {
            let gen = generator.lock().map_err(|e| format!("获取生成器锁失败: {}", e))?;
            let blob = gen.generate_file_thumbnail(&cover)?;
            
            // 保存到数据库
            let _ = db.save_thumbnail_with_category(folder_path, 0, 0, &blob, Some("folder"));
            
            return Ok(blob);
        }
        
        // 3. 递归查找第一张图片/压缩包
        if let Some(first) = Self::find_first_image_recursive(folder_path, max_depth)? {
            // 判断是压缩包还是图片
            let is_archive = first.ends_with(".zip") || first.ends_with(".cbz") 
                || first.ends_with(".rar") || first.ends_with(".cbr")
                || first.ends_with(".7z") || first.ends_with(".cb7");
            
            let gen = generator.lock().map_err(|e| format!("获取生成器锁失败: {}", e))?;
            
            let blob = if is_archive {
                // 压缩包需要提取第一张图
                gen.generate_archive_thumbnail(&first)?
            } else {
                gen.generate_file_thumbnail(&first)?
            };
            
            // 保存到数据库
            let _ = db.save_thumbnail_with_category(folder_path, 0, 0, &blob, Some("folder"));
            
            return Ok(blob);
        }
        
        // 4. 没有找到图片，记录失败并返回错误
        // 这样下次不会重复尝试
        let _ = db.save_failed_thumbnail(
            folder_path,
            "no_image",
            0,
            Some("文件夹中没有找到图片")
        );
        Err("文件夹中没有找到图片".to_string())
    }
    
    /// 查找封面图片（cover.*, folder.*, thumb.*）
    fn find_cover_image(folder: &str) -> Result<Option<String>, String> {
        let patterns = ["cover", "folder", "thumb"];
        let image_exts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif", "jxl"];
        
        // 优雅处理权限错误
        let entries = match std::fs::read_dir(folder) {
            Ok(e) => e,
            Err(e) => {
                log_debug!("⚠️ 无法读取目录 (可能权限不足): {} - {}", folder, e);
                return Ok(None); // 返回空结果而不是错误
            }
        };
        
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            
            for pattern in &patterns {
                if name.starts_with(pattern) {
                    // 检查是否是图片
                    if let Some(ext) = Path::new(&name).extension() {
                        let ext = ext.to_string_lossy().to_lowercase();
                        if image_exts.contains(&ext.as_str()) {
                            return Ok(Some(entry.path().to_string_lossy().to_string()));
                        }
                    }
                }
            }
        }
        
        Ok(None)
    }
    
    /// 递归查找第一张图片/压缩包
    fn find_first_image_recursive(folder: &str, depth: u32) -> Result<Option<String>, String> {
        if depth == 0 {
            return Ok(None);
        }
        
        let image_exts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif", "jxl"];
        let archive_exts = ["zip", "cbz", "rar", "cbr", "7z", "cb7"];
        
        // 优雅处理权限错误
        let entries = match std::fs::read_dir(folder) {
            Ok(e) => e,
            Err(e) => {
                log_debug!("⚠️ 无法读取目录 (可能权限不足): {} - {}", folder, e);
                return Ok(None); // 返回空结果而不是错误
            }
        };
        
        // 收集所有条目并排序
        let mut sorted_entries: Vec<_> = entries.flatten().collect();
        sorted_entries.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
        
        for entry in sorted_entries {
            let path = entry.path();
            
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    let ext = ext.to_string_lossy().to_lowercase();
                    if image_exts.contains(&ext.as_str()) || archive_exts.contains(&ext.as_str()) {
                        return Ok(Some(path.to_string_lossy().to_string()));
                    }
                }
            } else if path.is_dir() {
                // 递归子目录
                if let Ok(Some(found)) = Self::find_first_image_recursive(
                    &path.to_string_lossy(),
                    depth - 1,
                ) {
                    return Ok(Some(found));
                }
            }
        }
        
        Ok(None)
    }
}

impl Drop for ThumbnailServiceV3 {
    fn drop(&mut self) {
        self.stop();
    }
}
