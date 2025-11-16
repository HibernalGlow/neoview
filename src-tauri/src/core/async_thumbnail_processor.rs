//! NeoView - Async Thumbnail Processor
//! 使用 tokio 异步运行时极致优化缩略图生成速度

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, atomic::{AtomicUsize, Ordering}};
use tokio::sync::{Semaphore, RwLock, mpsc, OwnedSemaphorePermit};
use tokio::task::JoinHandle;
use std::collections::{HashMap, VecDeque};
use std::time::{Instant, Duration};
use crate::core::thumbnail::ThumbnailManager;
use crate::core::image_cache::ImageCache;
use tauri::Emitter;

/// 调节参数
struct ProcessorAdjustment {
    p95_duration: u64,
    scan_current: usize,
    extract_current: usize,
    scan_adjustment: i32,
    extract_adjustment: i32,
}

/// 并发限制配置
struct ConcurrencyLimits {
    scan_min: usize,
    scan_max: usize,
    extract_min: usize,
    extract_max: usize,
}

/// 异步缩略图任务
pub struct AsyncThumbnailTask {
    pub path: PathBuf,
    pub is_folder: bool,
    pub priority: TaskPriority,
    pub source_id: String,
    pub response_tx: tokio::sync::oneshot::Sender<Result<String, String>>,
}

/// 扫描任务（第一阶段）
pub struct ScanTask {
    pub archive_path: PathBuf,
    pub source_id: String,
    pub response_tx: Option<tokio::sync::oneshot::Sender<ScanResult>>,
}

/// 提取任务（第二阶段）
pub struct ExtractTask {
    pub archive_path: PathBuf,
    pub inner_path: String,
    pub source_id: String,
    pub response_tx: tokio::sync::oneshot::Sender<Result<String, String>>,
}

/// 扫描结果
#[derive(Debug, Clone)]
pub enum ScanResult {
    Found(String),    // 找到首图，返回内部路径
    NotFound,         // 未找到图片
    Error(String),    // 扫描出错
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
    /// 当前并发限制
    current_scan_limit: Arc<AtomicUsize>,
    current_extract_limit: Arc<AtomicUsize>,
    /// 并发限制配置
    concurrency_limits: Arc<ConcurrencyLimits>,
    /// 上次调节时间
    last_adjustment_time: Arc<Mutex<Option<Instant>>>,
    /// 前台源目录
    foreground_source: Arc<Mutex<Option<String>>>,
    /// 任务接收器
    task_rx: Arc<RwLock<mpsc::UnboundedReceiver<AsyncThumbnailTask>>>,
    /// 扫描任务发送器和接收器
    scan_tx: mpsc::UnboundedSender<ScanTask>,
    scan_rx: Arc<RwLock<mpsc::UnboundedReceiver<ScanTask>>>,
    /// 提取任务发送器和接收器
    extract_tx: mpsc::UnboundedSender<ExtractTask>,
    extract_rx: Arc<RwLock<mpsc::UnboundedReceiver<ExtractTask>>>,
    /// 首图缓存（archive_path -> inner_path）
    first_image_cache: Arc<RwLock<HashMap<PathBuf, String>>>,
    /// 正在处理的任务
    processing_tasks: Arc<RwLock<HashMap<PathBuf, CancellationToken>>>,
    /// 扫描队列中的任务路径（用于取消）
    scan_queue_paths: Arc<RwLock<Vec<PathBuf>>>,
    /// 提取队列中的任务路径（用于取消）
    extract_queue_paths: Arc<RwLock<Vec<PathBuf>>>,
    /// 错误统计
    error_counts: Arc<Mutex<HashMap<String, usize>>>,
    /// 性能监控
    metrics: Arc<Mutex<ProcessorMetrics>>,
    /// 应用句柄（用于发送事件）
    app_handle: Arc<Mutex<Option<tauri::AppHandle>>>,
}

/// 处理器性能指标
#[derive(Debug, Default)]
pub struct ProcessorMetrics {
    /// 扫描任务数量
    pub running_scan: usize,
    /// 提取任务数量
    pub running_extract: usize,
    /// 扫描队列长度
    pub scan_queue_length: usize,
    /// 提取队列长度
    pub extract_queue_length: usize,
    /// 本地任务数量
    pub running_local: usize,
    /// 最近任务耗时（毫秒）
    pub recent_durations: VecDeque<u64>,
    /// 错误计数
    pub error_counts: HashMap<String, usize>,
    /// 当前扫描并发限制
    pub current_scan_limit: usize,
    /// 当前提取并发限制
    pub current_extract_limit: usize,
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
        let (scan_tx, scan_rx) = mpsc::unbounded_channel();
        let (extract_tx, extract_rx) = mpsc::unbounded_channel();
        
        // 分阶段并发控制：扫描阶段低并发，解码阶段高并发
        let scan_max = 16;  // 扫描上限 16
        let extract_max = 64;  // 解码上限 64
        let scan_min = scan_max / 4;  // 扫描下限 4
        let extract_min = extract_max / 4;  // 解码下限 16
        let max_concurrent_scan = scan_min;  // 初始扫描并发数
        let max_concurrent_decode = extract_min;  // 初始解码并发数
        
        let concurrency_limits = Arc::new(ConcurrencyLimits {
            scan_min,
            scan_max,
            extract_min,
            extract_max,
        });
        
        let current_scan_limit = Arc::new(AtomicUsize::new(scan_min));
        let current_extract_limit = Arc::new(AtomicUsize::new(extract_min));
        
        let processor = Self {
            manager,
            cache,
            local_semaphore: Arc::new(Semaphore::new(max_concurrent_local)),
            archive_semaphore: Arc::new(Semaphore::new(max_concurrent_archive)),
            archive_scan_semaphore: Arc::new(Semaphore::new(max_concurrent_scan)),
            archive_decode_semaphore: Arc::new(Semaphore::new(max_concurrent_decode)),
            current_scan_limit: Arc::clone(&current_scan_limit),
            current_extract_limit: Arc::clone(&current_extract_limit),
            concurrency_limits,
            last_adjustment_time: Arc::new(Mutex::new(None)),
            foreground_source: Arc::new(Mutex::new(None)),
            task_rx: Arc::new(RwLock::new(task_rx)),
            scan_tx,
            scan_rx: Arc::new(RwLock::new(scan_rx)),
            extract_tx,
            extract_rx: Arc::new(RwLock::new(extract_rx)),
            first_image_cache: Arc::new(RwLock::new(HashMap::new())),
            processing_tasks: Arc::new(RwLock::new(HashMap::new())),
            scan_queue_paths: Arc::new(RwLock::new(Vec::new())),
            extract_queue_paths: Arc::new(RwLock::new(Vec::new())),
            error_counts: Arc::new(Mutex::new(HashMap::new())),
            metrics: Arc::new(Mutex::new(ProcessorMetrics::default())),
            app_handle: Arc::new(Mutex::new(None)),
        };
        
        println!("🚀 异步处理器配置: 本地文件={}, 压缩包扫描={}, 压缩包解码={}", 
            max_concurrent_local, max_concurrent_scan, max_concurrent_decode);
        
        (processor, task_tx)
    }
    
    /// 启动异步处理器
    pub async fn start(&self) -> Result<(), String> {
        println!("🚀 启动异步缩略图处理器");
        
        // 启动自适应控制循环
        self.start_adaptive_control_loop().await?;
        
        // 启动扫描循环（多个工作线程）
        let scan_workers = 2; // 扫描是IO密集型，不需要太多线程
        for i in 0..scan_workers {
            let processor = Arc::new(self.clone());
            
            tokio::spawn(async move {
                println!("🔍 扫描处理器 {} 已启动", i);
                processor.run_scan_loop().await;
                println!("🔍 扫描处理器 {} 已停止", i);
            });
        }
        
        // 启动提取循环（多个工作线程）
        let extract_workers = std::thread::available_parallelism()
            .map(|n| n.get()) // 使用CPU核心数
            .unwrap_or(4);
            
        for i in 0..extract_workers {
            let processor = Arc::new(self.clone());
            
            tokio::spawn(async move {
                println!("🔧 提取处理器 {} 已启动", i);
                processor.run_extract_loop().await;
                println!("🔧 提取处理器 {} 已停止", i);
            });
        }
        
        // 启动普通任务循环（本地文件、文件夹等）
        let normal_workers = 2;
        for i in 0..normal_workers {
            let processor = Arc::new(self.clone());
            
            tokio::spawn(async move {
                println!("📁 普通处理器 {} 已启动", i);
                processor.process_tasks_loop(Arc::clone(&processor.task_rx)).await;
                println!("📁 普通处理器 {} 已停止", i);
            });
        }
        
        Ok(())
    }
    
    /// 启动自适应控制循环
    async fn start_adaptive_control_loop(&self) -> Result<(), String> {
        let processor = Arc::new(self.clone());
        
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
            
            loop {
                interval.tick().await;
                processor.adjust_concurrency().await;
            }
        });
        
        Ok(())
    }
    
    /// 自适应调节并发数
    async fn adjust_concurrency(&self) {
        // 检查冷却时间
        {
            let mut last_time = self.last_adjustment_time.lock().unwrap();
            if let Some(last) = *last_time {
                if last.elapsed() < Duration::from_secs(5) {
                    return; // 还在冷却期内
                }
            }
        }
        
        // 计算95%分位数耗时和当前并发数
        let (p95_duration, scan_current, extract_current, running_scan, running_extract, durations_len) = {
            let metrics_guard = self.metrics.lock().unwrap();
            
            // 计算95%分位数耗时
            let p95_duration = if !metrics_guard.recent_durations.is_empty() {
                let mut durations: Vec<u64> = metrics_guard.recent_durations.iter().cloned().collect();
                durations.sort_unstable();
                let index = (durations.len() as f64 * 0.95) as usize;
                durations.get(index).copied().unwrap_or(0)
            } else {
                0
            };
            
            // 获取当前并发限制
            let scan_current = self.current_scan_limit.load(Ordering::Relaxed);
            let extract_current = self.current_extract_limit.load(Ordering::Relaxed);
            
            (p95_duration, scan_current, extract_current, 
             metrics_guard.running_scan, metrics_guard.running_extract,
             metrics_guard.recent_durations.len())
        };
        
        // 需要足够的历史数据才能调节
        if durations_len < 20 {
            return;
        }
        
        // 优化的调节策略 - 对称区间和更保守的调节
        let scan_adjustment = if p95_duration > 600 {
            -2  // 耗时过长，减少2个
        } else if p95_duration > 350 {
            -1  // 耗时偏长，减少1个
        } else if p95_duration < 180 && (running_scan == scan_current) {
            0   // 很快但已达上限，不再增加
        } else if p95_duration < 180 {
            1   // 很快且未达上限，增加1个
        } else {
            0   // 保持不变
        };
        
        let extract_adjustment = if p95_duration > 600 {
            -2  // 耗时过长，减少2个
        } else if p95_duration > 350 {
            -1  // 耗时偏长，减少1个
        } else if p95_duration < 180 && (running_extract == extract_current) {
            0   // 很快但已达上限，不再增加
        } else if p95_duration < 180 {
            1   // 很快且未达上限，增加1个
        } else {
            0   // 保持不变
        };
        
        // 应用调节
        let scan_changed = if scan_adjustment != 0 {
            self.adjust_concurrency_with_limits("scan", scan_adjustment).await
        } else {
            false
        };
        
        let extract_changed = if extract_adjustment != 0 {
            self.adjust_concurrency_with_limits("extract", extract_adjustment).await
        } else {
            false
        };
        
        // 记录调节日志
        if scan_changed || extract_changed {
            let new_scan = self.current_scan_limit.load(Ordering::Relaxed);
            let new_extract = self.current_extract_limit.load(Ordering::Relaxed);
            println!("🎛️ [Rust] 自适应调节: p95={}ms scan={}->{} extract={}->{}", 
                p95_duration, scan_current, new_scan, extract_current, new_extract);
            
            // 更新冷却时间
            *self.last_adjustment_time.lock().unwrap() = Some(Instant::now());
        }
    }
    
    /// 带限制的并发调节
    async fn adjust_concurrency_with_limits(&self, name: &str, adjustment: i32) -> bool {
        let (current, min, max, semaphore) = match name {
            "scan" => {
                let current = self.current_scan_limit.load(Ordering::Relaxed);
                let min = self.concurrency_limits.scan_min;
                let max = self.concurrency_limits.scan_max;
                (current, min, max, &self.archive_scan_semaphore)
            }
            "extract" => {
                let current = self.current_extract_limit.load(Ordering::Relaxed);
                let min = self.concurrency_limits.extract_min;
                let max = self.concurrency_limits.extract_max;
                (current, min, max, &self.archive_decode_semaphore)
            }
            _ => return false,
        };
        
        let new_limit = if adjustment > 0 {
            // 增加并发，但不能超过最大值
            (current + adjustment as usize).min(max)
        } else {
            // 减少并发，但不能低于最小值
            (current.saturating_sub(adjustment.abs() as usize)).max(min)
        };
        
        // 如果没有变化，直接返回
        if new_limit == current {
            return false;
        }
        
        // 计算需要调整的数量
        let diff = if new_limit > current {
            new_limit - current
        } else {
            current - new_limit
        };
        
        if new_limit > current {
            // 增加并发：添加许可
            semaphore.add_permits(diff);
        } else {
            // 减少并发：获取许可但不释放
            let _permits = semaphore.acquire_many(diff as u32).await;
        }
        
        // 更新当前限制
        match name {
            "scan" => self.current_scan_limit.store(new_limit, Ordering::Relaxed),
            "extract" => self.current_extract_limit.store(new_limit, Ordering::Relaxed),
            _ => {}
        }
        
        true
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
            let processing_tasks_clone: Arc<RwLock<HashMap<PathBuf, CancellationToken>>> = Arc::clone(&self.processing_tasks);
            let error_counts_clone: Arc<Mutex<HashMap<String, usize>>> = Arc::clone(&self.error_counts);
            
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
            let _archive_decode_semaphore = if is_archive {
                Some(Arc::clone(&self.archive_decode_semaphore))
            } else {
                None
            };
            
            // 启动异步任务
            let processor_clone = self.clone();
            let handle = tokio::spawn(async move {
                // 确保在任务完成时释放许可
                let _permit = permit;
                
                let result = if is_archive {
                    // 压缩包使用两阶段处理：只提交扫描任务
                    // 提交扫描任务
                    if let Err(e) = processor_clone.submit_scan_task(path_for_spawn.clone(), None).await {
                        Err(format!("提交扫描任务失败: {}", e))
                    } else {
                        // 扫描任务已提交，返回成功
                        Ok("scan_submitted".to_string())
                    }
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
    /// 第二阶段：高并发解码（已知inner_path）
    async fn generate_archive_thumbnail_staged(
        manager: Arc<Mutex<Option<ThumbnailManager>>>,
        cache: Arc<Mutex<ImageCache>>,
        path: &PathBuf,
        inner_path: &str,
    ) -> Result<String, String> {
        println!("🔧 [Rust] 第二阶段：解码图片 {} :: {}", path.display(), inner_path);
        
        // 提取首图数据
        let image_data: Vec<u8> = {
            let manager_clone = Arc::clone(&manager);
            let path_clone = path.clone();
            let inner_path_clone = inner_path.to_string();
            
            tokio::task::spawn_blocking(move || {
                let manager_guard = manager_clone.lock()
                    .map_err(|e| format!("获取管理器锁失败: {}", e))?;
                
                let _manager = manager_guard.as_ref()
                    .ok_or("缩略图管理器未初始化")?;
                
                // 提取图片数据
                use crate::core::archive::ArchiveManager;
                let archive_manager = ArchiveManager::new();
                let image_data = archive_manager.extract_file(&path_clone, &inner_path_clone)
                    .map_err(|e| format!("提取图片失败: {}", e))?;
                
                Ok::<Vec<u8>, String>(image_data)
            }).await.map_err(|e| format!("提取图片失败: {}", e))??
        };
        
        let manager_clone = Arc::clone(&manager);
        let path_clone = path.clone();
        let cache_clone = Arc::clone(&cache);
        let inner_path_clone = inner_path.to_string();
        
        tokio::task::spawn_blocking(move || {
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
            let img = manager.decode_and_downscale(&image_data, Path::new(&inner_path_clone), max_side)
                .map_err(|e| format!("解码图片失败: {}", e))?;
            
            // 保存缩略图
            let thumbnail_url = manager.save_thumbnail_for_archive(
                &img, 
                &path_clone, 
                &relative_path, 
                &inner_path_clone
            )?;
            
            // 添加到缓存
            if let Ok(cache) = cache_clone.lock() {
                let cache_key = path_clone.to_string_lossy().replace('\\', "/");
                cache.set(cache_key, thumbnail_url.clone());
            }
            
            Ok(thumbnail_url)
        }).await.map_err(|e| format!("解码任务执行失败: {}", e))?
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
        
        // 将目录路径转换为字符串用于比较
        let dir_path_str = dir_path.to_string_lossy();
        
        // 收集需要取消的任务（基于source_id）
        for (path, _token) in self.processing_tasks.read().await.iter() {
            // 从文件路径推断source_id（父目录）
            if let Some(parent) = path.parent() {
                let parent_str = parent.to_string_lossy();
                if parent_str == dir_path_str {
                    tasks_to_cancel.push(path.clone());
                }
            }
        }
        
        // 取消任务
        for path in tasks_to_cancel {
            if self.cancel(&path).await {
                cancelled += 1;
            }
        }
        
        // 清理扫描队列（基于路径前缀）
        {
            let mut scan_queue = self.scan_queue_paths.write().await;
            let initial_len = scan_queue.len();
            scan_queue.retain(|path| !path.starts_with(dir_path));
            cancelled += initial_len - scan_queue.len();
        }
        
        // 清理提取队列（基于路径前缀）
        {
            let mut extract_queue = self.extract_queue_paths.write().await;
            let initial_len = extract_queue.len();
            extract_queue.retain(|path| !path.starts_with(dir_path));
            cancelled += initial_len - extract_queue.len();
        }
        
        if cancelled > 0 {
            println!("🚫 已取消目录 {} 下的 {} 个任务（含队列）", dir_path.display(), cancelled);
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
    
    /// 运行扫描循环（第一阶段）
    async fn run_scan_loop(&self) {
        loop {
            // 获取下一个扫描任务
            let task = {
                let mut rx = self.scan_rx.write().await;
                match rx.recv().await {
                    Some(task) => task,
                    None => {
                        println!("📭 扫描任务通道已关闭，处理器退出");
                        break;
                    }
                }
            };
            
            // 更新指标
                {
                    let scan_queue_length = self.scan_rx.read().await.len() + 1;
                    let mut metrics = self.metrics.lock().unwrap();
                    metrics.scan_queue_length = scan_queue_length;
                    metrics.running_scan += 1;
                }
                
                // 从队列跟踪中移除
                {
                    let mut queue_paths = self.scan_queue_paths.write().await;
                    if let Some(pos) = queue_paths.iter().position(|p| p == &task.archive_path) {
                        queue_paths.remove(pos);
                    }
                }
            
            // 获取扫描许可
            let permit = match self.archive_scan_semaphore.clone().acquire_owned().await {
                Ok(permit) => permit,
                Err(e) => {
                    println!("❌ 获取扫描许可失败: {}", e);
                    continue;
                }
            };
            
            let archive_path = task.archive_path.clone();
            let source_id = task.source_id.clone();
            let response_tx = task.response_tx;
            let extract_tx = self.extract_tx.clone();
            let first_image_cache: Arc<RwLock<HashMap<PathBuf, String>>> = Arc::clone(&self.first_image_cache);
            let extract_queue_paths: Arc<RwLock<Vec<PathBuf>>> = Arc::clone(&self.extract_queue_paths);
            let manager_clone: Arc<Mutex<Option<ThumbnailManager>>> = Arc::clone(&self.manager);
            let metrics_clone: Arc<Mutex<ProcessorMetrics>> = Arc::clone(&self.metrics);
            let processor_clone = self.clone();
            
            // 启动扫描任务
            tokio::spawn(async move {
                let start_time = std::time::Instant::now();
                
                // 克隆需要在闭包中使用的数据
                let archive_path_for_blocking = archive_path.clone();
                let manager_clone_for_blocking = Arc::clone(&manager_clone);
                
                // 在 spawn_blocking 中执行同步操作
                let scan_result = tokio::task::spawn_blocking(move || {
                    // 获取管理器
                    let manager_guard = manager_clone_for_blocking.lock()
                        .map_err(|e| format!("获取管理器锁失败: {}", e))?;
                    
                    let manager = manager_guard.as_ref()
                .ok_or("缩略图管理器未初始化")?;
                    
                    // 扫描首图
                    let first_images = manager.scan_archive_images_fast(&archive_path_for_blocking)?;
                    if first_images.is_empty() {
                        return Err("压缩包内未找到图片".to_string());
                    }
                    
                    let first_image_path = first_images[0].clone();
                    
                    // 获取文件修改时间
                    let mtime = std::fs::metadata(&archive_path_for_blocking)
                        .and_then(|m| m.modified())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).map_err(|_| std::io::Error::new(std::io::ErrorKind::Other, "time conversion failed")))
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0);
                    
                    Ok((first_image_path, mtime))
                }).await;
                
                let result = match scan_result {
                    Ok(Ok((first_image_path, mtime))) => {
                        // 保存到首图缓存
                        first_image_cache.write().await.insert(archive_path.clone(), first_image_path.clone());
                        
                        // 保存到数据库索引
                        let manager_guard = manager_clone.lock();
                        if let Ok(manager_guard) = manager_guard {
                            if let Some(manager) = manager_guard.as_ref() {
                                let archive_key = archive_path.to_string_lossy().replace('\\', "/");
                                let _ = manager.db.upsert_archive_first_image(
                                    &archive_key, 
                                    &first_image_path, 
                                    mtime
                                );
                            }
                        }
                        
                        Ok(first_image_path)
                    }
                    Ok(Err(e)) => Err(e),
                    Err(e) => Err(format!("任务执行失败: {}", e)),
                };
                
                let duration = start_time.elapsed().as_millis() as u64;
                let _permit = permit; // 释放许可
                
                // 更新指标
                {
                    let mut metrics = metrics_clone.lock().unwrap();
                    metrics.running_scan = metrics.running_scan.saturating_sub(1);
                    metrics.scan_queue_length = metrics.scan_queue_length.saturating_sub(1);
                    metrics.recent_durations.push_back(duration);
                    if metrics.recent_durations.len() > 100 {
                        metrics.recent_durations.pop_front();
                    }
                }
                
                match result {
                    Ok(inner_path) => {
                        println!("✅ 扫描完成: {} -> {}", archive_path.display(), inner_path);
                        
                        // 发送提取任务到第二阶段
                        let (extract_response_tx, _extract_response_rx) = tokio::sync::oneshot::channel();
                        let extract_task = ExtractTask {
                            archive_path: archive_path.clone(),
                            inner_path: inner_path.clone(),
                            source_id: source_id.clone(),
                            response_tx: extract_response_tx,
                        };
                        
                        // 添加到提取队列跟踪
                        extract_queue_paths.write().await.push(archive_path.clone());
                        
                        let _ = extract_tx.send(extract_task);
                        
                        // 通知调用者
                        if let Some(tx) = response_tx {
                            let _ = tx.send(ScanResult::Found(inner_path));
                        }
                    }
                    Err(e) => {
                        println!("❌ 扫描失败: {} -> {}", archive_path.display(), e);
                        if let Some(tx) = response_tx {
                            let _ = tx.send(ScanResult::Error(e));
                        }
                    }
                    
                }
            });
        }
    }
    
    /// 运行提取循环（第二阶段）
    async fn run_extract_loop(&self) {
        loop {
            // 获取下一个提取任务
            let task = {
                let mut rx = self.extract_rx.write().await;
                match rx.recv().await {
                    Some(task) => task,
                    None => {
                        println!("📭 提取任务通道已关闭，处理器退出");
                        break;
                    }
                }
            };
            
            // 更新指标
            {
                let extract_queue_length = self.extract_rx.read().await.len() + 1;
                let mut metrics = self.metrics.lock().unwrap();
                metrics.extract_queue_length = extract_queue_length;
                metrics.running_extract += 1;
            }
            
            // 从队列跟踪中移除
            {
                let mut queue_paths = self.extract_queue_paths.write().await;
                if let Some(pos) = queue_paths.iter().position(|p| p == &task.archive_path) {
                    queue_paths.remove(pos);
                }
            }
            
            // 获取提取许可
            let permit = match self.archive_decode_semaphore.clone().acquire_owned().await {
                Ok(permit) => permit,
                Err(e) => {
                    println!("❌ 获取提取许可失败: {}", e);
                    continue;
                }
            };
            
            let archive_path = task.archive_path.clone();
            let inner_path = task.inner_path.clone();
            let source_id = task.source_id.clone();
            let response_tx = task.response_tx;
            let manager_clone = Arc::clone(&self.manager);
            let cache_clone = Arc::clone(&self.cache);
            let metrics_clone: Arc<Mutex<ProcessorMetrics>> = Arc::clone(&self.metrics);
            let error_counts_clone: Arc<Mutex<HashMap<String, usize>>> = Arc::clone(&self.error_counts);
            let app_handle: Arc<Mutex<Option<tauri::AppHandle>>> = Arc::clone(&self.app_handle);
            let processor_clone = self.clone();
            
            // 启动提取任务
            tokio::spawn(async move {
                let start_time = std::time::Instant::now();
                let result = Self::generate_archive_thumbnail_staged(
                    manager_clone,
                    cache_clone,
                    &archive_path,
                    &inner_path,
                ).await;
                
                let duration = start_time.elapsed().as_millis() as u64;
                let _permit = permit; // 释放许可
                
                // 更新指标
                {
                    let mut metrics = metrics_clone.lock().unwrap();
                    metrics.running_extract = metrics.running_extract.saturating_sub(1);
                    metrics.extract_queue_length = metrics.extract_queue_length.saturating_sub(1);
                    metrics.recent_durations.push_back(duration);
                    if metrics.recent_durations.len() > 100 {
                        metrics.recent_durations.pop_front();
                    }
                }
                
                // 记录错误统计
                if let Err(ref e) = result {
                    if let Ok(mut counts) = error_counts_clone.lock() {
                        *counts.entry(e.to_string()).or_insert(0) += 1;
                    }
                }
                
                // 发送结果
                if let Err(_) = response_tx.send(result.clone()) {
                    println!("⚠️ 发送提取结果失败: {}", archive_path.display());
                }
                
                match result {
                    Ok(url) => {
                        println!("✅ 提取完成: {} -> {}", archive_path.display(), url);
                        
                        // 发送事件通知前端
                        if let Ok(handle_guard) = app_handle.lock() {
                            if let Some(app) = handle_guard.as_ref() {
                                let _ = app.emit("thumbnail-ready", serde_json::json!({
                                    "path": archive_path.to_string_lossy(),
                                    "url": url
                                }));
                            }
                        }
                    }
                    Err(e) => println!("❌ 提取失败: {} -> {}", archive_path.display(), e),
                }
            });
        }
    }
    
    /// 获取处理器指标
    pub async fn get_metrics(&self) -> ProcessorMetrics {
        if let Ok(metrics) = self.metrics.lock() {
            let current_scan_limit = self.current_scan_limit.load(Ordering::Relaxed);
            let current_extract_limit = self.current_extract_limit.load(Ordering::Relaxed);
            
            ProcessorMetrics {
                scan_queue_length: self.scan_rx.read().await.len(),
                extract_queue_length: self.extract_rx.read().await.len(),
                running_scan: metrics.running_scan,
                running_extract: metrics.running_extract,
                running_local: metrics.running_local,
                recent_durations: metrics.recent_durations.clone(),
                error_counts: metrics.error_counts.clone(),
                current_scan_limit,
                current_extract_limit,
            }
        } else {
            let default = ProcessorMetrics::default();
            ProcessorMetrics {
                current_scan_limit: self.current_scan_limit.load(Ordering::Relaxed),
                current_extract_limit: self.current_extract_limit.load(Ordering::Relaxed),
                ..default
            }
        }
    }
    
    /// 提交扫描任务
    pub async fn submit_scan_task(&self, archive_path: PathBuf, response_tx: Option<tokio::sync::oneshot::Sender<ScanResult>>) -> Result<(), String> {
        // 从路径提取source_id（父目录）
        let source_id = archive_path.parent()
            .and_then(|p| p.to_str())
            .unwrap_or("")
            .to_string();
        
        // 添加到队列跟踪
        self.scan_queue_paths.write().await.push(archive_path.clone());
        
        let task = ScanTask {
            archive_path,
            source_id,
            response_tx,
        };
        
        self.scan_tx.send(task)
            .map_err(|e| format!("提交扫描任务失败: {}", e))?;
        
        Ok(())
    }
    
    /// 提交提取任务（Stage②）
    pub async fn submit_extract_task(&self, task: ExtractTask) -> Result<(), String> {
        // 添加到队列跟踪
        self.extract_queue_paths.write().await.push(task.archive_path.clone());
        
        self.extract_tx.send(task)
            .map_err(|e| format!("提交提取任务失败: {}", e))?;
        
        Ok(())
    }
    
    /// 设置应用句柄（用于发送事件）
    pub fn set_app_handle(&self, app_handle: tauri::AppHandle) {
        if let Ok(mut handle) = self.app_handle.lock() {
            *handle = Some(app_handle);
        }
    }
    
    /// 设置前台源目录
    pub async fn set_foreground_source(&self, source_id: String) {
        if let Ok(mut foreground) = self.foreground_source.lock() {
            *foreground = Some(source_id.clone());
            println!("🎯 [Rust] 前台源已设置为: {}", source_id);
        }
    }
    
    /// 检查任务是否为前台任务
    async fn is_foreground_task(&self, source_id: &str) -> bool {
        if let Ok(foreground) = self.foreground_source.lock() {
            if let Some(ref fg) = *foreground {
                return source_id == fg;
            }
        }
        false
    }
}

