//! NeoView - Thumbnail Commands
//! 缩略图相关的 Tauri 命令

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::command;
use std::time::Duration;
use crate::core::thumbnail::ThumbnailManager;
use crate::core::fs_manager::FsItem;
use crate::core::image_cache::ImageCache;
use crate::core::archive::ArchiveManager;

// 简单的路径规范化，保持与 ThumbnailManager 中的 normalize_path_string 行为一致
fn normalize_path_string<S: AsRef<str>>(s: S) -> String {
    s.as_ref().replace('\\', "/")
}

/// 全局缩略图管理器
pub struct ThumbnailManagerState {
    pub manager: Arc<Mutex<Option<ThumbnailManager>>>,
    pub cache: Arc<Mutex<ImageCache>>,
    pub async_processor: Arc<Mutex<Option<crate::core::async_thumbnail_processor::AsyncThumbnailProcessor>>>,
    pub async_task_tx: Arc<Mutex<Option<tokio::sync::mpsc::UnboundedSender<crate::core::async_thumbnail_processor::AsyncThumbnailTask>>>>,
    pub blob_registry: Arc<crate::core::blob_registry::BlobRegistry>,
}

impl Default for ThumbnailManagerState {
    fn default() -> Self {
        Self {
            manager: Arc::new(Mutex::new(None)),
            cache: Arc::new(Mutex::new(ImageCache::new(1024))), // 1024MB 缓存
            async_processor: Arc::new(Mutex::new(None)),
            async_task_tx: Arc::new(Mutex::new(None)),
            blob_registry: Arc::new(crate::core::blob_registry::BlobRegistry::new(1024)),
        }
    }
}

/// 等待缩略图管理器初始化，最多等待 max_wait_ms 毫秒
async fn ensure_manager_ready(
    state: &tauri::State<'_, ThumbnailManagerState>,
    max_wait_ms: u64,
) -> Result<(), String> {
    let mut waited = 0u64;
    let step = 50u64; // 每次休眠 50ms

    loop {
        match state.manager.lock() {
            Ok(manager_guard) => {
                if manager_guard.is_some() {
                    return Ok(());
                }
            }
            Err(_) => return Err("无法获取缩略图管理器锁".to_string()),
        }

        if waited >= max_wait_ms {
            break;
        }

    std::thread::sleep(Duration::from_millis(step));
        waited += step;
    }

    Err("缩略图管理器未初始化".to_string())
}

/// 初始化缩略图管理器
#[command]
pub async fn init_thumbnail_manager(
    thumbnail_path: String,
    root_path: String,
    size: Option<u32>,
    app: tauri::AppHandle,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<(), String> {
    let thumbnail_path = PathBuf::from(thumbnail_path);
    let root_path = PathBuf::from(root_path);
    let size = size.unwrap_or(256); // 默认 256px

    let manager = ThumbnailManager::new(thumbnail_path, root_path, size)
        .map_err(|e| format!("初始化缩略图管理器失败: {}", e))?;

    // 预加载缩略图到内存缓存
    if let Ok(cache) = state.cache.lock() {
        match manager.preload_thumbnails_to_cache(&cache) {
            Ok(count) => println!("✅ 预加载了 {} 个缩略图到内存缓存", count),
            Err(e) => println!("⚠️ 预加载缩略图失败: {}", e),
        }
    }

    if let Ok(mut manager_guard) = state.manager.lock() {
        *manager_guard = Some(manager);
    }

    // 旧队列已移除，现在完全使用异步处理器
    
    // 启动异步处理器（tokio多线程极致优化）
    {
        use crate::core::async_thumbnail_processor::AsyncThumbnailProcessor;
        
        // 极致的并发数：本地文件32个，压缩文件16个
        let max_concurrent_local = 32;
        let max_concurrent_archive = 16;
        
        let (processor, task_tx) = AsyncThumbnailProcessor::new(
            state.manager.clone(),
            state.cache.clone(),
            max_concurrent_local,
            max_concurrent_archive,
        );
        
        // 启动异步处理器
        if let Err(e) = processor.start().await {
            println!("❌ 启动异步处理器失败: {}", e);
        } else {
            println!("🚀 异步处理器已启动 (本地: {}, 压缩: {})", max_concurrent_local, max_concurrent_archive);
            
            // 保存处理器和发送器
            if let Ok(mut proc_guard) = state.async_processor.lock() {
                *proc_guard = Some(processor.clone());
                // 设置 AppHandle 用于发送事件
                processor.set_app_handle(app);
            }
            if let Ok(mut tx_guard) = state.async_task_tx.lock() {
                *tx_guard = Some(task_tx);
            }
        }
    }

    Ok(())
}

/// 生成文件缩略图 - tokio异步极致优化版本
/// 使用tokio异步运行时，实现最高并发性能
#[command]
pub async fn generate_file_thumbnail_async(
    file_path: String,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<String, String> {
    use crate::core::async_thumbnail_processor::{AsyncThumbnailTask, TaskPriority};
    use tokio::sync::oneshot;
    
    println!("⚡ 异步生成缩略图: {}", file_path);
    let path = PathBuf::from(file_path);
    
    // 等待管理器初始化（最多 5 秒）
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        println!("❌ {}", e);
        return Err(e);
    }
    
    // 首先检查缓存
    let cache_key = normalize_path_string(path.to_string_lossy());
    if let Ok(cache) = state.cache.lock() {
        if let Some(cached_url) = cache.get(&cache_key) {
            println!("✅ 使用缓存的缩略图: {}", cached_url);
            return Ok(cached_url);
        }
    }
    
    // 检查是否为压缩文件
    let _is_archive = path.extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .map(|s| matches!(s.as_str(), "zip" | "rar" | "7z" | "cbz" | "cbr" | "cb7"))
        .unwrap_or(false);
    
    // 确定优先级
    let priority = TaskPriority::High; // 默认高优先级
    
    // 创建响应通道
    let (response_tx, response_rx) = oneshot::channel();
    
    // 创建异步任务
    let task = AsyncThumbnailTask {
        path: path.clone(),
        is_folder: false,
        priority,
        source_id: path.parent()
            .and_then(|p| p.to_str())
            .unwrap_or("")
            .to_string(),
        response_tx,
    };
    
    // 发送任务到异步处理器
    if let Ok(tx_guard) = state.async_task_tx.lock() {
        if let Some(ref tx) = *tx_guard {
            if let Err(_) = tx.send(task) {
                println!("❌ 发送任务到异步处理器失败");
                return Err("发送任务失败".to_string());
            }
        } else {
            println!("❌ 异步处理器未初始化");
            return Err("异步处理器未初始化".to_string());
        }
    } else {
        return Err("获取任务发送器失败".to_string());
    }
    
    // 等待结果
    match response_rx.await {
        Ok(Ok(url)) => {
            println!("✅ 异步缩略图生成成功: {} -> {}", path.display(), url);
            Ok(url)
        }
        Ok(Err(e)) => {
            println!("❌ 异步缩略图生成失败: {}", e);
            Err(e)
        }
        Err(e) => {
            println!("❌ 等待结果失败: {}", e);
            return Err("等待结果失败".to_string());
        }
    }
}

/// 生成文件缩略图 - 异步显示版本（保留兼容性）
/// 返回立即显示的 blob URL，后台异步保存到本地
#[command]
pub async fn generate_file_thumbnail_new(
    file_path: String,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<String, String> {
    println!("🔄 开始生成缩略图: {}", file_path);
    let path = PathBuf::from(file_path);
    
    // 等待管理器初始化（最多 5 秒）
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        println!("❌ {}", e);
        return Err(e);
    }
    
    // 首先检查缓存（使用规范化路径以匹配 preload 注册的 key）
    let cache_key = normalize_path_string(path.to_string_lossy());
    if let Ok(cache) = state.cache.lock() {
        if let Some(cached_url) = cache.get(&cache_key) {
            println!("✅ 使用缓存的缩略图: {}", cached_url);
            return Ok(cached_url);
        }
    }

    // 队列已移除，直接使用即时生成

    // 回退：即时生成（无队列或队列失败）
    if let Ok(manager_guard) = state.manager.lock() {
        if let Some(ref manager) = *manager_guard {
            println!("📸 正在生成新的缩略图...");
            let thumbnail_url = manager.generate_thumbnail(&path)
                .map_err(|e| {
                    println!("❌ 生成缩略图失败: {}", e);
                    format!("生成缩略图失败: {}", e)
                })?;
            
            println!("✅ 缩略图生成成功: {}", thumbnail_url);
            
            if let Ok(cache) = state.cache.lock() {
                cache.set(cache_key.clone(), thumbnail_url.clone());
                println!("💾 缩略图已添加到缓存");
            }
            
            return Ok(thumbnail_url);
        }
    }

    Err("缩略图管理器未初始化".to_string())
}

/// 取消指定路径的缩略图生成任务
#[command]
pub async fn cancel_thumbnail_task(
    path: String,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<bool, String> {
    let path = PathBuf::from(path);
    
    // 获取处理器的克隆，避免跨await持有锁
    let processor = {
        let guard = state.async_processor.lock()
            .map_err(|_| "无法获取处理器锁".to_string())?;
        match (*guard).clone() {
            Some(p) => p,
            None => return Err("异步处理器未初始化".to_string()),
        }
    };
    
    let cancelled = processor.cancel(&path).await;
    Ok(cancelled)
}

/// 取消指定目录下的所有缩略图生成任务
#[command]
pub async fn cancel_folder_tasks(
    dir_path: String,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<usize, String> {
    let dir_path = PathBuf::from(dir_path);
    
    // 获取处理器的克隆，避免跨await持有锁
    let processor = {
        let guard = state.async_processor.lock()
            .map_err(|_| "无法获取处理器锁".to_string())?;
        match (*guard).clone() {
            Some(p) => p,
            None => return Err("异步处理器未初始化".to_string()),
        }
    };
    
    let cancelled = processor.cancel_by_prefix(&dir_path).await;
    Ok(cancelled)
}

/// 获取错误统计信息
#[command]
pub async fn get_thumbnail_error_stats(
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<std::collections::HashMap<String, usize>, String> {
    // 获取处理器的克隆，避免跨await持有锁
    let processor = {
        let guard = state.async_processor.lock()
            .map_err(|_| "无法获取处理器锁".to_string())?;
        match (*guard).clone() {
            Some(p) => p,
            None => return Err("异步处理器未初始化".to_string()),
        }
    };
    
    let stats = processor.get_error_stats().await;
    Ok(stats)
}

/// 获取处理器性能指标
#[command]
pub async fn get_thumbnail_metrics(
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<serde_json::Value, String> {
    // 获取处理器的克隆，避免跨await持有锁
    let processor = {
        let guard = state.async_processor.lock()
            .map_err(|_| "无法获取处理器锁".to_string())?;
        match (*guard).clone() {
            Some(p) => p,
            None => return Err("异步处理器未初始化".to_string()),
        }
    };
    
    let metrics = processor.get_metrics().await;
    
    // 转换为JSON
    let json_metrics = serde_json::json!({
        "running_scan": metrics.running_scan,
        "running_extract": metrics.running_extract,
        "running_local": metrics.running_local,
        "scan_queue_length": metrics.scan_queue_length,
        "extract_queue_length": metrics.extract_queue_length,
        "recent_durations": metrics.recent_durations.iter().cloned().collect::<Vec<_>>(),
        "error_counts": metrics.error_counts,
        "decode_errors": metrics.decode_errors,
        "oom_errors": metrics.oom_errors
    });
    
    Ok(json_metrics)
}

/// 生成文件夹缩略图
#[command]
pub async fn generate_folder_thumbnail(
    folder_path: String,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<String, String> {
    println!("🔄 开始生成文件夹缩略图: {}", folder_path);
    let path = PathBuf::from(folder_path);
    
    // 检查缩略图管理器是否已初始化
    
    // 等待管理器初始化（最多 5 秒）
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        println!("❌ {}", e);
        return Err(e);
    }
    
    // 首先检查缓存（使用规范化路径，以匹配 preload 注册的 key）
    let cache_key = format!("folder:{}", normalize_path_string(path.to_string_lossy()));
    if let Ok(cache) = state.cache.lock() {
        if let Some(cached_url) = cache.get(&cache_key) {
            // 验证文件URL是否仍然有效
            if cached_url.starts_with("file://") {
                if cache.validate_file_url(&cache_key) {
                    println!("✅ 使用缓存的文件夹缩略图: {}", cached_url);
                    return Ok(cached_url);
                }
            } else {
                println!("✅ 使用缓存的文件夹缩略图: {}", cached_url);
                return Ok(cached_url);
            }
        }
    }

    // 队列已移除，直接使用即时生成

    // 回退：即时生成（无队列或队列失败）
    if let Ok(manager_guard) = state.manager.lock() {
        if let Some(ref manager) = *manager_guard {
            println!("📁 正在生成新的文件夹缩略图...");
            
            // 获取相对路径
            let relative_path = manager.get_relative_path(&path)
                .map_err(|e| {
                    println!("❌ 获取相对路径失败: {}", e);
                    format!("获取相对路径失败: {}", e)
                })?;
            
            // 获取源文件修改时间
            let source_meta = std::fs::metadata(&path)
                .map_err(|e| {
                    println!("❌ 获取文件夹元数据失败: {}", e);
                    format!("获取文件夹元数据失败: {}", e)
                })?;
            let source_modified = source_meta.modified()
                .map_err(|e| {
                    println!("❌ 获取修改时间失败: {}", e);
                    format!("获取修改时间失败: {}", e)
                })?
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| {
                    println!("❌ 时间转换失败: {}", e);
                    format!("时间转换失败: {}", e)
                })?
                .as_secs() as i64;
            
            // 生成文件夹缩略图
            let thumbnail_url = manager.generate_and_save_thumbnail(&path, &relative_path, source_modified, true)
                .map_err(|e| {
                    println!("❌ 生成文件夹缩略图失败: {}", e);
                    format!("生成文件夹缩略图失败: {}", e)
                })?;
            
            println!("✅ 文件夹缩略图生成成功: {}", thumbnail_url);
            
            // 添加到缓存
            if let Ok(cache) = state.cache.lock() {
                cache.set(cache_key.clone(), thumbnail_url.clone());
                println!("💾 文件夹缩略图已添加到缓存");
            }
            
            return Ok(thumbnail_url);
        }
    }

    Err("缩略图管理器未初始化".to_string())
}

/// 获取路径下的所有缩略图
#[command]
pub async fn get_thumbnails_for_path(
    path: String,
    _state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<Vec<FsItem>, String> {
    use crate::core::fs_manager::FsManager;
    
    let path = PathBuf::from(path);
    let fs_manager = FsManager::new();
    
    // 获取目录内容
    let items = fs_manager.read_directory(&path)
        .map_err(|e| format!("列出目录失败: {}", e))?;
    
    // 过滤出图片文件和文件夹
    let filtered_items: Vec<FsItem> = items
        .into_iter()
        .filter(|item| item.is_image || item.is_dir)
        .collect();
    
    Ok(filtered_items)
}

/// 获取缩略图URL（不生成新的）
#[command]
pub async fn get_thumbnail_url(
    file_path: String,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<Option<String>, String> {
    let path = PathBuf::from(file_path);
    
    if let Ok(manager_guard) = state.manager.lock() {
        if let Some(ref manager) = *manager_guard {
            match manager.get_thumbnail_info(&path) {
                Ok(Some(info)) => Ok(Some(info.url)),
                _ => Ok(None),
            }
        } else {
            Ok(None)
        }
    } else {
        Ok(None)
    }
}

/// 获取缩略图文件内容（返回 base64）
#[command]
pub async fn get_thumbnail_data(
    file_path: String,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<String, String> {
    use base64::Engine;
    println!("🔍 获取缩略图数据: {}", file_path);
    let path = PathBuf::from(file_path);
    
    if let Ok(manager_guard) = state.manager.lock() {
        if let Some(ref manager) = *manager_guard {
            // 使用 ThumbnailManager 的公共方法获取缩略图信息
            match manager.get_thumbnail_info(&path) {
                Ok(Some(info)) => {
                    println!("✅ 找到缩略图信息: {}x{}", info.width, info.height);
                    
                    // 读取缩略图文件
                    let thumbnail_path = info.url.strip_prefix("file://")
                        .unwrap_or(&info.url);
                    
                    let thumbnail_data = std::fs::read(thumbnail_path)
                        .map_err(|e| format!("读取缩略图文件失败: {}", e))?;
                    
                    // 转换为 base64
                    let base64_data = base64::engine::general_purpose::STANDARD.encode(&thumbnail_data);
                    let data_url = format!("data:image/webp;base64,{}", base64_data);
                    
                    Ok(data_url)
                },
                Ok(None) => {
                    println!("⚠️ 未找到缩略图信息");
                    Err("未找到缩略图".to_string())
                },
                Err(e) => {
                    println!("❌ 获取缩略图信息失败: {}", e);
                    Err(e)
                }
            }
        } else {
            println!("❌ 缩略图管理器未初始化");
            Err("缩略图管理器未初始化".to_string())
        }
    } else {
        println!("❌ 无法获取缩略图管理器锁");
        Err("无法获取缩略图管理器".to_string())
    }
}

/// 获取缩略图信息（包括尺寸）
#[command]
pub async fn get_thumbnail_info(
    file_path: String,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<Option<serde_json::Value>, String> {
    println!("🔍 获取缩略图信息: {}", file_path);
    let path = PathBuf::from(file_path);
    
    if let Ok(manager_guard) = state.manager.lock() {
        if let Some(ref manager) = *manager_guard {
            // 使用 ThumbnailManager 的公共方法
            match manager.get_thumbnail_info(&path) {
                Ok(Some(info)) => {
                    println!("✅ 找到缩略图信息: {}x{}", info.width, info.height);
                    let json_info = serde_json::json!({
                        "url": info.url,
                        "width": info.width,
                        "height": info.height,
                        "file_size": info.file_size,
                        "created_at": info.created_at,
                        "is_folder": info.is_folder
                    });
                    Ok(Some(json_info))
                },
                Ok(None) => {
                    println!("⚠️ 未找到缩略图信息");
                    Ok(None)
                },
                Err(e) => {
                    println!("❌ 获取缩略图信息失败: {}", e);
                    Err(e)
                }
            }
        } else {
            println!("❌ 缩略图管理器未初始化");
            Ok(None)
        }
    } else {
        println!("❌ 无法获取缩略图管理器锁");
        Ok(None)
    }
}

/// 清理过期缩略图
#[command]
pub async fn cleanup_thumbnails(
    days: Option<u32>,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<usize, String> {
    let days = days.unwrap_or(30); // 默认30天
    
    if let Ok(manager_guard) = state.manager.lock() {
        if let Some(ref manager) = *manager_guard {
            let removed_count = manager.cleanup_expired(days)
                .map_err(|e| format!("清理缩略图失败: {}", e))?;
            
            // 清理内存缓存中的无效URL
            if let Ok(cache) = state.cache.lock() {
                cache.validate_all_file_urls();
            }
            
            return Ok(removed_count);
        }
    }

    Err("缩略图管理器未初始化".to_string())
}

/// 获取缩略图统计信息
#[command]
pub async fn get_thumbnail_stats(
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<crate::core::thumbnail_db::ThumbnailStats, String> {
    if let Ok(manager_guard) = state.manager.lock() {
        if let Some(ref manager) = *manager_guard {
            return manager.get_cache_stats()
                .map_err(|e| format!("获取统计信息失败: {}", e));
        }
    }

    Err("缩略图管理器未初始化".to_string())
}

/// 清空所有缩略图
#[command]
pub async fn clear_all_thumbnails(
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<usize, String> {
    if let Ok(manager_guard) = state.manager.lock() {
        if let Some(ref manager) = *manager_guard {
            let removed_count = manager.clear_all_cache()
                .map_err(|e| format!("清空缩略图失败: {}", e))?;
            
            // 清空内存缓存
            if let Ok(cache) = state.cache.lock() {
                cache.clear();
            }
            
            return Ok(removed_count);
        }
    }

    Err("缩略图管理器未初始化".to_string())
}

/// 预加载缩略图
#[command]
pub async fn preload_thumbnails(
    paths: Vec<String>,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<Vec<String>, String> {
    let mut success_paths = Vec::new();
    let mut failed_paths = Vec::new();
    
    for path_str in &paths {
        let path = PathBuf::from(path_str);
        
    // 检查缓存（使用规范化路径以匹配 preload 注册的 key）
    let cache_key = normalize_path_string(path.to_string_lossy());
        let mut should_generate = true;
        
        if let Ok(cache) = state.cache.lock() {
            if let Some(cached_url) = cache.get(&cache_key) {
                if cached_url.starts_with("file://") {
                    if cache.validate_file_url(&cache_key) {
                        success_paths.push(cached_url);
                        should_generate = false;
                    }
                } else {
                    success_paths.push(cached_url);
                    should_generate = false;
                }
            }
        }
        
        // 生成缩略图
        if should_generate {
            if let Ok(manager_guard) = state.manager.lock() {
                if let Some(ref manager) = *manager_guard {
                    match manager.generate_thumbnail(&path) {
                        Ok(thumbnail_url) => {
                            if let Ok(cache) = state.cache.lock() {
                                cache.set(cache_key.clone(), thumbnail_url.clone());
                            }
                            success_paths.push(thumbnail_url);
                        }
                        Err(e) => {
                            failed_paths.push(format!("{}: {}", path_str, e));
                        }
                    }
                }
            }
        }
    }
    
    if failed_paths.is_empty() {
        Ok(success_paths)
    } else {
        Err(format!("部分缩略图生成失败: {}", failed_paths.join("; ")))
    }
}

/// 生成压缩包缩略图（统一管线版本）
#[command]
pub async fn generate_archive_thumbnail_root(
    archive_path: String,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<String, String> {
    println!("🔄 [Rust] 开始生成压缩包缩略图: {}", archive_path);
    let path = PathBuf::from(&archive_path);
    
    // 等待管理器初始化（最多 5 秒）
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        println!("❌ [Rust] {}", e);
        return Err(e);
    }
    
    // 首先检查缓存（使用压缩包专用key）
    let cache_key = normalize_path_string(path.to_string_lossy());
    if let Ok(cache) = state.cache.lock() {
        if let Some(cached_url) = cache.get(&cache_key) {
            if cached_url.starts_with("file://") {
                if cache.validate_file_url(&cache_key) {
                    println!("✅ [Rust] 压缩包缩略图缓存命中: {} -> {}", archive_path, cached_url);
                    return Ok(cached_url);
                }
            } else {
                println!("✅ [Rust] 压缩包缩略图缓存命中: {} -> {}", archive_path, cached_url);
                return Ok(cached_url);
            }
        }
    }
    
    // 检查数据库中是否已有缩略图
    if let Ok(manager_guard) = state.manager.lock() {
        if let Some(ref manager) = *manager_guard {
            if let Ok(Some(url)) = manager.get_archive_thumbnail_url(&path) {
                println!("✅ [Rust] 数据库中找到缩略图: {} -> {}", archive_path, url);
                
                // 添加到缓存
                if let Ok(cache) = state.cache.lock() {
                    cache.set(cache_key.clone(), url.clone());
                    println!("💾 [Rust] 缩略图已添加到缓存: {}", cache_key);
                }
                
                return Ok(url);
            }
        }
    }
    
    // 提交任务到异步处理器
    println!("📤 [Rust] 提交压缩包缩略图任务到异步处理器: {}", archive_path);
    
    // 获取异步处理器
    let processor = {
        let guard = state.async_processor.lock()
            .map_err(|_| "无法获取处理器锁".to_string())?;
        match (*guard).clone() {
            Some(p) => p,
            None => return Err("异步处理器未初始化".to_string()),
        }
    };
    
    // 提交扫描任务
    if let Err(e) = processor.submit_scan_task(path.clone(), None).await {
        println!("❌ [Rust] 提交扫描任务失败: {}", e);
        return Err(format!("提交扫描任务失败: {}", e));
    }
    
    println!("✅ [Rust] 任务已提交，返回处理中标识");
    Ok("thumbnail://pending".to_string())
}

/// 生成压缩包内特定页面的缩略图
#[command]
pub async fn generate_archive_thumbnail_inner(
    archive_path: String,
    inner_path: String,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<String, String> {
    println!("🔄 [Rust] 开始生成压缩包内页缩略图: {} :: {}", archive_path, inner_path);
    let archive_path = PathBuf::from(&archive_path);
    
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        return Err(e);
    }
    
    // 构建内部页面的专用key
    let _archive_key = match crate::core::thumbnail::build_archive_key(&archive_path) {
        Ok(key) => key,
        Err(e) => {
            println!("❌ [Rust] 构建压缩包Key失败: {}", e);
            return Err(e);
        }
    };
    let inner_key = format!("{}::{}", 
        normalize_path_string(archive_path.to_string_lossy()),
        normalize_path_string(&inner_path)
    );
    
    println!("🔑 [Rust] 内部页Key: {}", inner_key);
    
    // 检查缓存
    if let Ok(cache) = state.cache.lock() {
        if let Some(cached_url) = cache.get(&inner_key) {
            if cached_url.starts_with("file://") {
                if cache.validate_file_url(&inner_key) {
                    println!("✅ [Rust] 内部页缩略图缓存命中: {} -> {}", inner_key, cached_url);
                    return Ok(cached_url);
                }
            } else {
                println!("✅ [Rust] 内部页缩略图缓存命中: {} -> {}", inner_key, cached_url);
                return Ok(cached_url);
            }
        }
    }
    
    println!("🔍 [Rust] 缓存未命中，开始生成内部页缩略图");
    
    // 生成内部页缩略图
    if let Ok(manager_guard) = state.manager.lock() {
        if let Some(ref manager) = *manager_guard {
            use crate::core::archive::ArchiveManager;
            let _archive_manager = ArchiveManager::new();
            
            // 流式提取并解码
            match manager.extract_image_from_archive_stream(&archive_path, &inner_path) {
                Ok((img, _)) => {
                    println!("✅ [Rust] 成功提取图片: {}", inner_path);
                    
                    // 获取相对路径
                    let relative_path = match manager.get_relative_path(&archive_path) {
                        Ok(p) => p,
                        Err(e) => {
                            println!("❌ [Rust] 获取相对路径失败: {}", e);
                            return Err(format!("获取相对路径失败: {}", e));
                        }
                    };
                    
                    // 保存缩略图
                    match manager.save_thumbnail_for_archive(&img, &archive_path, &relative_path, &inner_path) {
                        Ok(thumbnail_url) => {
                            println!("✅ [Rust] 内部页缩略图生成成功: {} -> {}", inner_key, thumbnail_url);
                            
                            // 添加到缓存
                            if let Ok(cache) = state.cache.lock() {
                                cache.set(inner_key.clone(), thumbnail_url.clone());
                                println!("💾 [Rust] 内部页缩略图已添加到缓存: {}", inner_key);
                            }
                            
                            return Ok(thumbnail_url);
                        }
                        Err(e) => {
                            println!("❌ [Rust] 保存内部页缩略图失败: {}", e);
                            return Err(format!("保存内部页缩略图失败: {}", e));
                        }
                    }
                }
                Err(e) => {
                    println!("❌ [Rust] 提取内部页失败: {}", e);
                    return Err(format!("提取内部页失败: {}", e));
                }
            }
        }
    }
    
    Err("缩略图管理器未初始化".to_string())
}

/// 调试 AVIF 支持：尝试使用 image crate 的 AVIF 加载、通用加载，并返回详细诊断信息
#[command]
pub async fn debug_avif(
    file_path: String,
) -> Result<String, String> {
    use std::fs;
    use image::ImageFormat;

    let mut report = Vec::new();

    report.push(format!("Debug AVIF for path: {}", file_path));

    // 读取文件
    let data = match fs::read(&file_path) {
        Ok(d) => d,
        Err(e) => return Err(format!("无法读取文件: {}", e)),
    };

    // 1) 尝试使用明确的 AVIF 格式加载
    match image::load_from_memory_with_format(&data, ImageFormat::Avif) {
        Ok(_) => report.push("image::load_from_memory_with_format(ImageFormat::Avif) => OK".to_string()),
        Err(e) => report.push(format!("image::load_from_memory_with_format(ImageFormat::Avif) => ERR: {}", e)),
    }

    // 2) 尝试通用加载
    match image::load_from_memory(&data) {
        Ok(_) => report.push("image::load_from_memory => OK".to_string()),
        Err(e) => report.push(format!("image::load_from_memory => ERR: {}", e)),
    }

    // 3) 检查当前工作目录下的 Cargo.toml（用于确认 image crate features）
    match std::env::current_dir() {
        Ok(dir) => {
            let cargo_toml = dir.join("Cargo.toml");
            if cargo_toml.exists() {
                if let Ok(t) = fs::read_to_string(cargo_toml) {
                    // 只取前 2000 字符避免超大输出
                    let snippet: String = t.chars().take(2000).collect();
                    report.push(format!("Cargo.toml (snippet):\n{}", snippet));
                } else {
                    report.push("无法读取 Cargo.toml 内容".to_string());
                }
            } else {
                report.push("当前目录下未找到 Cargo.toml (可能运行在已打包环境)".to_string());
            }
        }
        Err(e) => report.push(format!("无法获取当前工作目录: {}", e)),
    }

    Ok(report.join("\n"))
}



/// 快速获取首图 blob URL（带缓存）
/// 返回可立即显示的 blob URL，同时触发后台缩略图生成
#[command]
pub async fn get_archive_first_image_blob(
    archive_path: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<String, String> {
    println!("⚡ [Rust] 获取压缩包首图 blob: {}", archive_path);
    let path = PathBuf::from(&archive_path);
    
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        return Err(e);
    }
    
    // 使用 ArchiveManager 获取首图 blob
    use crate::core::archive::ArchiveManager;
    let archive_manager = ArchiveManager::new();
    let (blob_url, inner_path_opt) = match archive_manager.get_first_image_blob_or_scan(&path) {
        Ok(result) => result,
        Err(e) => {
            println!("❌ [Rust] 首图 blob 获取失败: {}", e);
            return Err(e);
        }
    };
    
    // 如果有内部路径且有异步处理器，提交提取任务
    if let (Some(inner_path), Some(processor)) = (inner_path_opt, {
        let guard = state.async_processor.lock().unwrap();
        (*guard).clone()
    }) {
        use crate::core::async_thumbnail_processor::ExtractTask;
        
        // 创建提取任务
        let (extract_tx, _extract_rx) = tokio::sync::oneshot::channel();
        let extract_task = ExtractTask {
            archive_path: path.clone(),
            inner_path: inner_path.clone(),
            source_id: path.parent()
                .and_then(|p| p.to_str())
                .unwrap_or("")
                .to_string(),
            response_tx: extract_tx,
        };
        
        // 提交到提取队列（前台优先级）
        if let Err(e) = processor.submit_extract_task(extract_task).await {
            println!("⚠️ [Rust] 提交提取任务失败: {}", e);
        } else {
            println!("⚡ [Rust] 提交提取任务成功: {} :: {}", archive_path, inner_path);
        }
    }
    
    // 发射首图就绪事件
    if let Err(e) = app_handle.emit_all("thumbnail:firstImageReady", 
        serde_json::json!({
            "archivePath": archive_path,
            "blob": blob_url.clone()
        })
    ) {
        println!("⚠️ [Rust] 发射 thumbnail:firstImageReady 事件失败: {}", e);
    } else {
        println!("🎯 [Rust] 已发射 thumbnail:firstImageReady 事件: {} -> {}", archive_path, blob_url);
    }
    
    println!("✅ [Rust] 首图 blob 获取成功: {}", archive_path);
    Ok(blob_url)
}

/// 返回原图的二进制数据
#[command]
pub async fn get_archive_first_image_quick(
    archive_path: String,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<Vec<u8>, String> {
    let start_time = std::time::Instant::now();
    let thread_id = format!("{:?}", std::thread::current().id());
    println!(
        "⚡ [Rust] 快速获取压缩包首张图片: {} (thread={})",
        archive_path, thread_id
    );
    let path = PathBuf::from(&archive_path);

    // 等待管理器初始化
    let ensure_start = std::time::Instant::now();
    println!("🕒 [Rust] ensure_manager_ready 开始: {}", archive_path);
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        println!(
            "🕒 [Rust] ensure_manager_ready 失败 (耗时 {:?}): {}",
            ensure_start.elapsed(), e
        );
        return Err(e);
    }
    println!(
        "🕒 [Rust] ensure_manager_ready 完成 (耗时 {:?})",
        ensure_start.elapsed()
    );

    // 首先查询首图索引表
    let archive_key = archive_path.replace('\\', "/");
    // 创建一个新的 ThumbnailManager 实例来避免借用问题
    let manager_build_start = std::time::Instant::now();
    println!("🧩 [Rust] 构建临时 ThumbnailManager 实例");
    let manager = {
        let manager_guard = state.manager.lock()
            .map_err(|_| "无法获取缩略图管理器".to_string())?;
        match manager_guard.as_ref() {
            Some(m) => {
                // 获取必要的参数来创建新实例
                let thumbnail_root = m.thumbnail_root().clone();
                let root_dir = m.root_dir().clone();
                let size = m.size();
                ThumbnailManager::new(thumbnail_root, root_dir, size)
                    .map_err(|e| format!("创建管理器失败: {}", e))?
            }
            None => return Err("缩略图管理器未初始化".to_string()),
        }
    };
    println!(
        "🧩 [Rust] 临时 ThumbnailManager 构建完成，耗时 {:?}",
        manager_build_start.elapsed()
    );

    // 检查文件是否过期
    fn is_stale(file_path: &PathBuf, cached_mtime: i64) -> bool {
        if let Ok(metadata) = std::fs::metadata(file_path) {
            if let Ok(modified) = metadata.modified() {
                if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                    let current_mtime = duration.as_secs() as i64;
                    return current_mtime > cached_mtime;
                }
            }
        }
        true // 无法获取文件时间，认为已过期
    }

    let db_lookup_start = std::time::Instant::now();
    println!("🔎 [Rust] 查询首图索引: {}", archive_key);
    let db_lookup = manager.db.get_archive_first_image(&archive_key);
    println!(
        "🔎 [Rust] 首图索引查询完成，耗时 {:?}",
        db_lookup_start.elapsed()
    );

    match db_lookup {
        Ok(Some((inner_path, cached_mtime))) => {
            // 检查缓存是否过期
            if is_stale(&path, cached_mtime) {
                println!(
                    "🕐 [Rust] 首图索引过期: {} (cached_mtime={}, file_mtime>cached)",
                    archive_path, cached_mtime
                );
                return get_archive_first_image_fallback(&path, manager).await;
            }

            println!("🎯 [Rust] 首图索引命中: {} -> {}", archive_path, inner_path);

            // 直接提取已知的图片
            use crate::core::archive::ArchiveManager;
            let archive_manager = ArchiveManager::new();
            let extract_start = std::time::Instant::now();
            println!(
                "🗜️ [Rust] 从索引路径提取图片: {} :: {}",
                archive_path, inner_path
            );
            match archive_manager.extract_file(&path, &inner_path) {
                Ok(image_data) => {
                    println!(
                        "✅ [Rust] 快速获取成功: {} bytes (提取耗时 {:?}, 总耗时 {:?})",
                        image_data.len(),
                        extract_start.elapsed(),
                        start_time.elapsed()
                    );

                    // 如果有异步处理器，直接提交Stage②任务（跳过扫描）
                    let processor_opt = {
                        let guard = state.async_processor.lock()
                            .map_err(|_| "无法获取异步处理器".to_string())?;
                        (*guard).clone()
                    };

                    if let Some(processor) = processor_opt {
                        use crate::core::async_thumbnail_processor::ExtractTask;
                        use tokio::sync::oneshot;

                        // 直接创建提取任务（跳过Stage①扫描）
                        let (extract_tx, _extract_rx) = oneshot::channel();
                        let archive_path_buf = PathBuf::from(&archive_path);
                        let extract_task = ExtractTask {
                            archive_path: archive_path_buf.clone(),
                            inner_path: inner_path.clone(),
                            source_id: archive_path_buf.parent()
                                .and_then(|p| p.to_str())
                                .unwrap_or("")
                                .to_string(),
                            response_tx: extract_tx,
                        };

                        // 提交到提取队列（Stage②）
                        if let Err(e) = processor.submit_extract_task(extract_task).await {
                            println!("⚠️ [Rust] 提交提取任务失败: {}", e);
                        } else {
                            println!("⚡ [Rust] 跳过扫描，直接进入Stage②: {} :: {}", archive_path, inner_path);
                        }
                    }

                    Ok(image_data)
                }
                Err(e) => {
                    println!(
                        "❌ [Rust] 根据索引提取失败 (耗时 {:?}): {}",
                        extract_start.elapsed(),
                        e
                    );

                    // 索引可能已过期，回退到扫描
                    get_archive_first_image_fallback(&path, manager).await
                }
            }
        }
        Ok(None) => {
            println!("🔍 [Rust] 首图索引未命中，准备扫描: {}", archive_path);

            // 如果有异步处理器，使用扫描任务
            let processor_opt = {
                let guard = state.async_processor.lock()
                    .map_err(|_| "无法获取异步处理器".to_string())?;
                (*guard).clone()
            };

            if let Some(processor) = processor_opt {
                use crate::core::async_thumbnail_processor::{ScanResult};
                use tokio::sync::oneshot;

                let (tx, rx) = oneshot::channel();
                let scan_submit_start = std::time::Instant::now();
                if let Err(_) = processor.submit_scan_task(path.clone(), Some(tx)).await {
                    println!("❌ [Rust] 提交扫描任务失败 (耗时 {:?})", scan_submit_start.elapsed());
                    return get_archive_first_image_fallback(&path, manager).await;
                }
                println!(
                    "🛰️ [Rust] 扫描任务提交成功，耗时 {:?}" ,
                    scan_submit_start.elapsed()
                );

                let wait_start = std::time::Instant::now();
                match rx.await {
                    Ok(ScanResult::Found(inner_path)) => {
                        println!(
                            "✅ [Rust] 扫描成功: {} -> {} (等待 {:?})",
                            archive_path,
                            inner_path,
                            wait_start.elapsed()
                        );
                        let archive_manager = ArchiveManager::new();
                        let extract_start = std::time::Instant::now();
                        match archive_manager.extract_file(&path, &inner_path) {
                            Ok(image_data) => {
                                println!(
                                    "✅ [Rust] 扫描结果提取成功: {} bytes (耗时 {:?})",
                                    image_data.len(),
                                    extract_start.elapsed()
                                );
                                Ok(image_data)
                            }
                            Err(e) => {
                                println!(
                                    "❌ [Rust] 扫描结果提取失败 (耗时 {:?}): {}",
                                    extract_start.elapsed(),
                                    e
                                );
                                Err(format!("提取图片失败: {}", e))
                            }
                        }
                    }
                    Ok(ScanResult::NotFound) => {
                        println!(
                            "❌ [Rust] 扫描结果: 未找到图片 (等待 {:?})",
                            wait_start.elapsed()
                        );
                        Err("压缩包中没有图片".to_string())
                    }
                    Ok(ScanResult::Error(e)) => {
                        println!(
                            "❌ [Rust] 扫描任务返回错误 (等待 {:?}): {}",
                            wait_start.elapsed(),
                            e
                        );
                        Err(e)
                    }
                    Err(_) => {
                        println!(
                            "❌ [Rust] 等待扫描结果失败 (耗时 {:?})",
                            wait_start.elapsed()
                        );
                        Err("等待扫描结果失败".to_string())
                    }
                }
            } else {
                println!("🪫 [Rust] 异步处理器未就绪，回退到同步扫描");
                get_archive_first_image_fallback(&path, manager).await
            }
        }
        Err(e) => {
            println!(
                "❌ [Rust] 查询首图索引失败 (耗时 {:?}): {}",
                db_lookup_start.elapsed(),
                e
            );
            get_archive_first_image_fallback(&path, manager).await
        }
    }
}

/// 首图获取回退方案（扫描压缩包）
async fn get_archive_first_image_fallback(path: &PathBuf, manager: crate::core::thumbnail::ThumbnailManager) -> Result<Vec<u8>, String> {
    let start_time = std::time::Instant::now();
    println!(
        "🔄 [Rust] 使用回退方案扫描压缩包: {}",
        path.display()
    );

    // 快速提取压缩包内的第一张图片
    let extract_start = std::time::Instant::now();
    match manager.extract_first_image_from_archive(path) {
        Ok(image_data) => {
            println!(
                "✅ [Rust] 回退扫描成功: {} bytes (扫描耗时 {:?}, 总耗时 {:?})",
                image_data.len(),
                extract_start.elapsed(),
                start_time.elapsed()
            );
            Ok(image_data)
        }
        Err(e) => {
            println!(
                "❌ [Rust] 回退扫描失败 (扫描耗时 {:?}, 总耗时 {:?}): {}",
                extract_start.elapsed(),
                start_time.elapsed(),
                e
            );
            Err(e)
        }
    }
}

#[command]
pub async fn generate_archive_thumbnail_async(
    archive_path: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<String, String> {
    println!("🔄 [Rust] 后台异步生成压缩包缩略图: {}", archive_path);
    let path = PathBuf::from(&archive_path);
    
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        return Err(e);
    }
    
    // 检查缓存
    let cache_key = normalize_path_string(path.to_string_lossy());
    if let Ok(cache) = state.cache.lock() {
        if let Some(cached_url) = cache.get(&cache_key) {
            println!("✅ [Rust] 异步生成: 缓存命中 {}", cache_key);
            return Ok(cached_url);
        }
    }
    
    // 直接在后台生成缩略图
    let path_clone = path.clone();
    let cache_clone = state.cache.clone();
    let manager_clone = state.manager.clone();
    
    // 在后台线程中处理
    tokio::spawn(async move {
        // 获取管理器的路径信息
        let (thumbnail_root, root_dir, size) = {
            let guard = manager_clone.lock().unwrap();
            if let Some(ref manager) = *guard {
                (manager.thumbnail_root().clone(), manager.root_dir().clone(), manager.size())
            } else {
                println!("❌ [Rust] 管理器未初始化");
                return;
            }
        };
        
        // 创建新的管理器实例
        let manager = match ThumbnailManager::new(thumbnail_root, root_dir, size) {
            Ok(m) => m,
            Err(e) => {
                println!("❌ [Rust] 创建管理器失败: {}", e);
                return;
            }
        };
        
        // 使用快速扫描找到首图
        match manager.scan_archive_images_fast(&path_clone) {
            Ok(first_images) => {
                if !first_images.is_empty() {
                    let first_image_path = &first_images[0];
                    
                    // 流式提取并生成缩略图
                    match manager.extract_image_from_archive_stream(&path_clone, first_image_path) {
                        Ok((img, _)) => {
                            println!("✅ [Rust] 成功提取图片: {}", first_image_path);
                            
                            // 获取相对路径
                            let relative_path = match manager.get_relative_path(&path_clone) {
                                Ok(p) => p,
                                Err(e) => {
                                    println!("❌ [Rust] 获取相对路径失败: {}", e);
                                    return;
                                }
                            };
                            
                            // 保存缩略图
                            match manager.save_thumbnail_for_archive(&img, &path_clone, &relative_path, first_image_path) {
                                Ok(thumbnail_url) => {
                                    println!("✅ [Rust] 后台缩略图生成完成: {}", thumbnail_url);
                                    
                                    // 添加到缓存
                                    if let Ok(cache) = cache_clone.lock() {
                                        let cache_key = normalize_path_string(path_clone.to_string_lossy());
                                        cache.set(cache_key.clone(), thumbnail_url.clone());
                                        println!("💾 [Rust] 异步生成完成并缓存: {}", cache_key);
                                    }
                                    
                                    // 发射缩略图更新事件
                                    if let Err(e) = app_handle.emit_all("thumbnail:updated", 
                                        serde_json::json!({
                                            "archivePath": archive_path,
                                            "webpUrl": thumbnail_url,
                                            "blobUrl": null // 这里没有之前的 blob，因为是通过异步命令触发的
                                        })
                                    ) {
                                        println!("⚠️ [Rust] 发射 thumbnail:updated 事件失败: {}", e);
                                    } else {
                                        println!("🎯 [Rust] 已发射 thumbnail:updated 事件: {} -> {}", archive_path, thumbnail_url);
                                    }
                                }
                                Err(e) => {
                                    println!("❌ [Rust] 保存缩略图失败: {}", e);
                                }
                            }
                        }
                        Err(e) => {
                            println!("❌ [Rust] 提取图片失败: {}", e);
                        }
                    }
                }
            }
            Err(e) => {
                println!("❌ [Rust] 扫描压缩包失败: {}", e);
            }
        }
    });
    
    println!("⚡ [Rust] 异步生成已启动，立即返回");
    Ok("generating".to_string()) // 返回特殊值表示正在生成
}

/// 提交压缩包预取任务
/// 在后台预扫描压缩包，为后续缩略图生成做准备
#[command]
pub async fn enqueue_archive_preload(
    archive_path: String,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<&'static str, String> {
    println!("📤 [Rust] 提交压缩包预取任务: {}", archive_path);
    let path = PathBuf::from(&archive_path);
    
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        return Err(e);
    }
    
    // 获取异步处理器
    let processor = {
        let guard = state.async_processor.lock()
            .map_err(|_| "无法获取处理器锁".to_string())?;
        match (*guard).clone() {
            Some(p) => p,
            None => return Err("异步处理器未初始化".to_string()),
        }
    };
    
    // 提交预取任务
    use crate::core::async_thumbnail_processor::TaskPriority;
    if let Err(e) = processor.submit_preload_task(path, TaskPriority::Normal).await {
        println!("❌ [Rust] 提交预取任务失败: {}", e);
        return Err(format!("提交预取任务失败: {}", e));
    }
    
    println!("✅ [Rust] 预取任务已提交");
    Ok("preload_submitted")
}

/// 获取 blob 内容
#[command]
pub async fn get_blob_content(
    blob_key: String,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<Vec<u8>, String> {
    println!("🔍 [Rust] 获取 blob 内容: {}", blob_key);
    
    // 从 BlobRegistry 获取内容
    let data = state.blob_registry.fetch_bytes(&blob_key)
        .ok_or_else(|| format!("Blob 不存在: {}", blob_key))?;
    
    println!("✅ [Rust] blob 内容获取成功: {} bytes", data.len());
    Ok(data)
}

/// 释放 blob 引用
#[command]
pub async fn release_blob(
    blob_key: String,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<bool, String> {
    println!("🗑️ [Rust] 释放 blob: {}", blob_key);
    
    let released = state.blob_registry.release(&blob_key);
    println!("✅ [Rust] blob 释放完成: {}", blob_key);
    Ok(released)
}

/// 清理过期 blob
#[command]
pub async fn cleanup_expired_blobs(
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<usize, String> {
    println!("🧹 [Rust] 清理过期 blob");
    
    let removed = state.blob_registry.sweep_expired();
    println!("✅ [Rust] 清理完成: {} 个 blob", removed);
    Ok(removed)
}

/// 获取 blob 统计信息
#[command]
pub async fn get_blob_stats(
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<crate::core::blob_registry::BlobStats, String> {
    let stats = state.blob_registry.get_stats();
    Ok(stats)
}

/// 设置前台源目录
/// 用于优先处理当前可见目录的缩略图任务
#[command]
pub async fn set_foreground_source(
    source_id: String,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<(), String> {
    println!("🎯 [Rust] 设置前台源: {}", source_id);
    
    // 获取处理器的克隆，避免跨await持有锁
    let processor = {
        let guard = state.async_processor.lock()
            .map_err(|_| "无法获取处理器锁".to_string())?;
        match (*guard).clone() {
            Some(p) => p,
            None => return Err("异步处理器未初始化".to_string()),
        }
    };
    
    processor.set_foreground_source(source_id).await;
    Ok(())
}