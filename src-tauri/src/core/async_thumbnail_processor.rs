//! NeoView - Async Thumbnail Processor
//! 使用 tokio 异步运行时极致优化缩略图生成速度

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::sync::{Semaphore, RwLock, mpsc, OwnedSemaphorePermit};
use tokio::task::JoinHandle;
use std::collections::HashMap;
use crate::core::thumbnail::ThumbnailManager;
use crate::core::image_cache::ImageCache;

/// 异步缩略图任务
pub struct AsyncThumbnailTask {
    pub path: PathBuf,
    pub is_folder: bool,
    pub priority: TaskPriority,
    pub response_tx: tokio::sync::oneshot::Sender<Result<String, String>>,
}

/// 任务取消令牌
pub struct CancellationToken {
    pub abort_handle: Option<JoinHandle<()>>,
}

impl CancellationToken {
    pub fn abort(&self) {
        if let Some(handle) = &self.abort_handle {
            handle.abort();
        }
    }
}

/// 任务优先级
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum TaskPriority {
    Immediate = 3,
    High = 2,
    Normal = 1,
}

/// 异步缩略图处理器
#[derive(Clone)]
pub struct AsyncThumbnailProcessor {
    /// 管理器实例
    manager: Arc<Mutex<Option<ThumbnailManager>>>,
    /// 内存缓存
    cache: Arc<Mutex<ImageCache>>,
    /// 本地文件信号量（控制并发数）
    local_semaphore: Arc<Semaphore>,
    /// 压缩文件信号量（控制并发数）
    archive_semaphore: Arc<Semaphore>,
    /// 压缩包扫描信号量（第一阶段：低并发）
    archive_scan_semaphore: Arc<Semaphore>,
    /// 压缩包解码信号量（第二阶段：高并发）
    archive_decode_semaphore: Arc<Semaphore>,
    /// 任务接收器
    task_rx: Arc<RwLock<mpsc::UnboundedReceiver<AsyncThumbnailTask>>>,
    /// 正在处理的任务
    processing_tasks: Arc<RwLock<HashMap<PathBuf, CancellationToken>>>,
    /// 错误统计
    error_counts: Arc<Mutex<HashMap<String, usize>>>,
}

impl AsyncThumbnailProcessor {
    /// 创建新的异步处理器
    pub fn new(
        manager: Arc<Mutex<Option<ThumbnailManager>>>,
        cache: Arc<Mutex<ImageCache>>,
        max_concurrent_local: usize,
        max_concurrent_archive: usize,
    ) -> (Self, mpsc::UnboundedSender<AsyncThumbnailTask>) {
        let (task_tx, task_rx) = mpsc::unbounded_channel();
        
        // 分阶段并发控制：扫描阶段低并发，解码阶段高并发
        let max_concurrent_scan = max_concurrent_archive / 4; // 扫描阶段使用1/4的并发数
        let max_concurrent_decode = max_concurrent_archive;   // 解码阶段使用全部并发数
        
        let processor = Self {
            manager,
            cache,
            local_semaphore: Arc::new(Semaphore::new(max_concurrent_local)),
            archive_semaphore: Arc::new(Semaphore::new(max_concurrent_archive)),
            archive_scan_semaphore: Arc::new(Semaphore::new(max_concurrent_scan)),
            archive_decode_semaphore: Arc::new(Semaphore::new(max_concurrent_decode)),
            task_rx: Arc::new(RwLock::new(task_rx)),
            processing_tasks: Arc::new(RwLock::new(HashMap::new())),
            error_counts: Arc::new(Mutex::new(HashMap::new())),
        };
        
        println!("🚀 异步处理器配置: 本地文件={}, 压缩包扫描={}, 压缩包解码={}", 
            max_concurrent_local, max_concurrent_scan, max_concurrent_decode);
        
        (processor, task_tx)
    }
    
    /// 启动异步处理器
    pub async fn start(&self) -> Result<(), String> {
        println!("🚀 启动异步缩略图处理器");
        
        // 根据CPU核心数启动处理器
        let num_processors = std::thread::available_parallelism()
            .map(|n| n.get() * 2) // 使用核心数的2倍
            .unwrap_or(8);
            
        for i in 0..num_processors {
            let processor = Arc::new(self.clone());
            
            tokio::spawn(async move {
                println!("🔧 异步处理器 {} 已启动", i);
                processor.process_tasks_loop(Arc::clone(&processor.task_rx)).await;
                println!("🔧 异步处理器 {} 已停止", i);
            });
        }
        
        Ok(())
    }
    
    /// 异步处理任务循环
    async fn process_tasks_loop(
        &self,
        task_rx: Arc<RwLock<mpsc::UnboundedReceiver<AsyncThumbnailTask>>>,
    ) {
        loop {
            // 获取下一个任务
            let task = {
                let mut rx = task_rx.write().await;
                match rx.recv().await {
                    Some(task) => task,
                    None => {
                        println!("📭 任务通道已关闭，处理器退出");
                        break;
                    }
                }
            };
            
            // 检查是否已经在处理中
            {
                let processing = self.processing_tasks.read().await;
                if processing.contains_key(&task.path) {
                    println!("⚠️ 任务已在处理中: {}", task.path.display());
                    continue;
                }
            }
            
            // 克隆必要的数据
            let path = task.path.clone();
            let path_for_spawn = path.clone();
            let is_folder = task.is_folder;
            let response_tx = task.response_tx;
            let manager_clone = Arc::clone(&self.manager);
            let cache_clone = Arc::clone(&self.cache);
            let processing_tasks_clone = Arc::clone(&self.processing_tasks);
            let error_counts_clone = Arc::clone(&self.error_counts);
            
            // 根据文件类型选择信号量并获取许可
            let permit: OwnedSemaphorePermit = if Self::is_archive_file_static(&task.path) {
                // 对于压缩包，使用分阶段并发控制
                self.archive_scan_semaphore.clone().acquire_owned().await
            } else {
                self.local_semaphore.clone().acquire_owned().await
            }.map_err(|e| format!("获取信号量失败: {}", e))
            .unwrap();
            
            // 对于压缩包，需要额外的解码信号量
            let is_archive = Self::is_archive_file_static(&task.path);
            let archive_decode_semaphore = if is_archive {
                Some(Arc::clone(&self.archive_decode_semaphore))
            } else {
                None
            };
            
            // 启动异步任务
            let handle = tokio::spawn(async move {
                // 确保在任务完成时释放许可
                let _permit = permit;
                
                let result = if is_archive {
                    // 压缩包使用分阶段处理
                    Self::generate_archive_thumbnail_staged(
                        manager_clone, 
                        cache_clone, 
                        &path_for_spawn, 
                        archive_decode_semaphore.unwrap()
                    ).await
                } else {
                    // 普通文件使用标准处理
                    Self::generate_thumbnail_async(
                        manager_clone, 
                        cache_clone, 
                        &path_for_spawn, 
                        is_folder
                    ).await
                };
                
                // 记录错误统计
                if let Err(ref e) = result {
                    if let Ok(mut counts) = error_counts_clone.lock() {
                        *counts.entry(e.to_string()).or_insert(0) += 1;
                    }
                }
                
                // 发送结果
                if let Err(_) = response_tx.send(result.clone()) {
                    println!("⚠️ 发送结果失败: {}", path_for_spawn.display());
                }
                
                // 从处理中列表移除
                processing_tasks_clone.write().await.remove(&path_for_spawn);
                
                match result {
                    Ok(url) => println!("✅ 异步生成完成: {} -> {}", path_for_spawn.display(), url),
                    Err(e) => println!("❌ 异步生成失败: {} -> {}", path_for_spawn.display(), e),
                }
            });
            
            // 添加到处理中列表
            let cancellation_token = CancellationToken {
                abort_handle: Some(handle),
            };
            self.processing_tasks.write().await.insert(path, cancellation_token);
        }
    }
    
    /// 分阶段生成压缩包缩略图
    /// 第一阶段：低并发扫描，第二阶段：高并发解码
    async fn generate_archive_thumbnail_staged(
        manager: Arc<Mutex<Option<ThumbnailManager>>>,
        cache: Arc<Mutex<ImageCache>>,
        path: &PathBuf,
        decode_semaphore: Arc<Semaphore>,
    ) -> Result<String, String> {
        println!("🔍 [Rust] 第一阶段：扫描压缩包 {}", path.display());
        
        // 第一阶段：扫描压缩包，获取首图信息
        let (first_image_path, image_data) = {
            let manager_clone = Arc::clone(&manager);
            let path_clone = path.clone();
            
            tokio::task::spawn_blocking(move || {
                let manager_guard = manager_clone.lock()
                    .map_err(|e| format!("获取管理器锁失败: {}", e))?;
                
                let manager = manager_guard.as_ref()
                    .ok_or("缩略图管理器未初始化")?;
                
                // 快速扫描首图
                let first_images = manager.scan_archive_images_fast(&path_clone)
                    .map_err(|e| format!("扫描压缩包失败: {}", e))?;
                
                if first_images.is_empty() {
                    return Err("压缩包内未找到图片".to_string());
                }
                
                let first_image_path = first_images[0].clone();
                
                // 提取首图数据
                use crate::core::archive::ArchiveManager;
                let archive_manager = ArchiveManager::new();
                let image_data = archive_manager.extract_file(&path_clone, &first_image_path)
                    .map_err(|e| format!("提取首图失败: {}", e))?;
                
                Ok((first_image_path, image_data))
            }).await.map_err(|e| format!("第一阶段任务执行失败: {}", e))??
        };
        
        println!("🔍 [Rust] 第一阶段完成，找到首图: {}", first_image_path);
        
        // 释放扫描许可（在 _permit 被释放时自动完成）
        
        // 第二阶段：获取解码许可并处理图片
        println!("🔧 [Rust] 第二阶段：解码图片 {}", first_image_path);
        let decode_permit = decode_semaphore.acquire_owned().await
            .map_err(|e| format!("获取解码许可失败: {}", e))?;
        
        let manager_clone = Arc::clone(&manager);
        let path_clone = path.clone();
        let cache_clone = Arc::clone(&cache);
        let first_image_path_clone = first_image_path.clone();
        
        tokio::task::spawn_blocking(move || {
            // 确保在任务完成时释放解码许可
            let _decode_permit = decode_permit;
            
            // 获取管理器
            let manager_guard = manager_clone.lock()
                .map_err(|e| format!("获取管理器锁失败: {}", e))?;
            
            let manager = manager_guard.as_ref()
                .ok_or("缩略图管理器未初始化")?;
            
            // 获取相对路径
            let relative_path = manager.get_relative_path(&path_clone)
                .map_err(|e| format!("获取相对路径失败: {}", e))?;
            
            // 使用解码前限缩尺寸功能
            let max_side = 2048u32;
            let img = manager.decode_and_downscale(&image_data, Path::new(&first_image_path_clone), max_side)
                .map_err(|e| format!("解码图片失败: {}", e))?;
            
            // 保存缩略图
            let thumbnail_url = manager.save_thumbnail_for_archive(
                &img, 
                &path_clone, 
                &relative_path, 
                &first_image_path_clone
            )?;
            
            // 添加到缓存
            if let Ok(cache) = cache_clone.lock() {
                let cache_key = path_clone.to_string_lossy().replace('\\', "/");
                cache.set(cache_key, thumbnail_url.clone());
            }
            
            Ok(thumbnail_url)
        }).await.map_err(|e| format!("第二阶段任务执行失败: {}", e))?
    }

    /// 异步生成缩略图
    async fn generate_thumbnail_async(
        manager: Arc<Mutex<Option<ThumbnailManager>>>,
        cache: Arc<Mutex<ImageCache>>,
        path: &PathBuf,
        is_folder: bool,
    ) -> Result<String, String> {
        // 在tokio线程池中执行CPU密集型任务
        let manager_clone = manager.clone();
        let path_clone = path.clone();
        let cache_clone = cache.clone();
        
        tokio::task::spawn_blocking(move || {
            // 获取管理器
            let manager_guard = manager_clone.lock()
                .map_err(|e| format!("获取管理器锁失败: {}", e))?;
            
            let manager = manager_guard.as_ref()
                .ok_or("缩略图管理器未初始化")?;
            
            // 获取相对路径
            let relative_path = manager.get_relative_path(&path_clone)
                .map_err(|e| format!("获取相对路径失败: {}", e))?;
            
            // 获取文件元数据
            let meta = std::fs::metadata(&path_clone)
                .map_err(|e| format!("读取文件元数据失败: {}", e))?;
            let source_modified = meta.modified()
                .map_err(|e| format!("获取修改时间失败: {}", e))?
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| format!("时间转换失败: {}", e))?
                .as_secs() as i64;
            
            // 生成缩略图
            let thumbnail_path = manager.generate_and_save_thumbnail(
                &path_clone, 
                &relative_path, 
                source_modified, 
                is_folder
            )?;
            
            // 添加到缓存
            if let Ok(cache) = cache_clone.lock() {
                let cache_key = path_clone.to_string_lossy().replace('\\', "/");
                cache.set(cache_key, thumbnail_path.clone());
            }
            
            Ok(thumbnail_path)
        }).await.map_err(|e| format!("任务执行失败: {}", e))?
    }
    
    /// 检查是否为压缩文件
    fn is_archive_file_static(path: &PathBuf) -> bool {
        if let Some(ext) = path.extension() {
            let ext = ext.to_string_lossy().to_lowercase();
            matches!(ext.as_str(), "zip" | "rar" | "7z" | "cbz" | "cbr" | "cb7")
        } else {
            false
        }
    }
    
    /// 取消指定路径的任务
    pub async fn cancel(&self, path: &PathBuf) -> bool {
        if let Some(token) = self.processing_tasks.write().await.remove(path) {
            token.abort();
            println!("🚫 已取消任务: {}", path.display());
            true
        } else {
            false
        }
    }
    
    /// 取消指定目录下的所有任务
    pub async fn cancel_by_prefix(&self, dir_path: &PathBuf) -> usize {
        let mut cancelled = 0;
        let mut tasks_to_cancel = Vec::new();
        
        // 收集需要取消的任务
        for (path, _token) in self.processing_tasks.read().await.iter() {
            if path.starts_with(dir_path) {
                tasks_to_cancel.push(path.clone());
            }
        }
        
        // 取消任务
        for path in tasks_to_cancel {
            if self.cancel(&path).await {
                cancelled += 1;
            }
        }
        
        if cancelled > 0 {
            println!("🚫 已取消目录 {} 下的 {} 个任务", dir_path.display(), cancelled);
        }
        
        cancelled
    }
    
    /// 获取错误统计
    pub async fn get_error_stats(&self) -> HashMap<String, usize> {
        if let Ok(counts) = self.error_counts.lock() {
            counts.clone()
        } else {
            HashMap::new()
        }
    }
}

