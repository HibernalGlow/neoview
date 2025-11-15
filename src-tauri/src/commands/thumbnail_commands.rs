//! NeoView - Thumbnail Commands
//! 缩略图相关的 Tauri 命令

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::command;
use std::time::Duration;
use crate::core::thumbnail::ThumbnailManager;
use crate::core::thumbnail_queue::ThumbnailQueue;
use crate::core::fs_manager::FsItem;
use crate::core::image_cache::ImageCache;

// 简单的路径规范化，保持与 ThumbnailManager 中的 normalize_path_string 行为一致
fn normalize_path_string<S: AsRef<str>>(s: S) -> String {
    s.as_ref().replace('\\', "/")
}

/// 全局缩略图管理器
pub struct ThumbnailManagerState {
    pub manager: Arc<Mutex<Option<ThumbnailManager>>>,
    pub cache: Arc<Mutex<ImageCache>>,
    pub queue: Arc<Mutex<Option<Arc<ThumbnailQueue>>>>,
}

impl Default for ThumbnailManagerState {
    fn default() -> Self {
        Self {
            manager: Arc::new(Mutex::new(None)),
            cache: Arc::new(Mutex::new(ImageCache::new(1024))), // 1024MB 缓存
            queue: Arc::new(Mutex::new(None)),
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

    // 启动后台优先队列（去重 + worker pool）
    if let Ok(mut queue_guard) = state.queue.lock() {
        // 超激进优化：使用所有可用核心的 2 倍，最多 64 个 worker，最少 12 个
        let num_workers = std::thread::available_parallelism()
            .map(|n| ((n.get() as f64 * 2.0) as usize).min(64).max(12))
            .unwrap_or(24);
        println!("🔧 启动缩略图队列，worker 数量: {} (超激进模式 - 动态调整)", num_workers);
        let q = ThumbnailQueue::start(state.manager.clone(), state.cache.clone(), num_workers);
        println!("✅ 缩略图队列已启动，所有 {} 个 worker 已就绪", num_workers);
        *queue_guard = Some(q);
    }

    Ok(())
}

/// 生成文件缩略图 - 异步显示版本
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

    // 生成新缩略图 - 使用后台优先队列
    if let Ok(qguard) = state.queue.lock() {
        if let Some(ref q) = *qguard {
            println!("📥 将文件缩略图任务入队（普通）: {}", path.display());
            match q.enqueue(path.clone(), false, false) {
                Ok(url) => {
                    println!("✅ 文件缩略图生成成功(队列): {}", url);
                    if let Ok(cache) = state.cache.lock() {
                        cache.set(cache_key.clone(), url.clone());
                    }
                    return Ok(url);
                }
                Err(e) => {
                    println!("⚠️ 队列生成失败，降级到即时生成: {}", e);
                }
            }
        }
    }

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

    // 生成新缩略图
    // 首选使用后台优先队列（若存在）入队处理并等待结果（去重/优先）
    if let Ok(qguard) = state.queue.lock() {
        if let Some(ref q) = *qguard {
            println!("📥 将文件夹缩略图任务入队（优先）: {}", path.display());
            match q.enqueue(path.clone(), true, true) {
                Ok(url) => {
                    println!("✅ 文件夹缩略图生成成功(队列): {}", url);
                    // 添加到缓存
                    if let Ok(cache) = state.cache.lock() {
                        cache.set(cache_key.clone(), url.clone());
                    }
                    return Ok(url);
                }
                Err(e) => {
                    println!("⚠️ 队列生成失败，降级到即时生成: {}", e);
                    // 继续到后续的即时生成分支
                }
            }
        }
    }

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

/// 生成压缩包缩略图（优化版本）
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
    
    // 构建压缩包专用key并记录日志
    let _archive_key = match crate::core::thumbnail::build_archive_key(&path) {
        Ok(key) => {
            println!("🔑 [Rust] 压缩包Key: {} -> {}", archive_path, key);
            key
        }
        Err(e) => {
            println!("❌ [Rust] 构建压缩包Key失败: {}", e);
            return Err(e);
        }
    };
    
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
    
    println!("🔍 [Rust] 缓存未命中，开始生成压缩包缩略图");
    
    // 使用新的多线程压缩包缩略图生成方法
    if let Ok(manager_guard) = state.manager.lock() {
        if let Some(ref manager) = *manager_guard {
            println!("📦 [Rust] 正在生成压缩包缩略图（多线程）...");
            match manager.ensure_archive_thumbnail(&path) {
                Ok(thumbnail_url) => {
                    println!("✅ [Rust] 压缩包缩略图生成成功: {} -> {}", archive_path, thumbnail_url);
                    
                    // 添加到缓存
                    if let Ok(cache) = state.cache.lock() {
                        cache.set(cache_key.clone(), thumbnail_url.clone());
                        println!("💾 [Rust] 压缩包缩略图已添加到缓存: {}", cache_key);
                    }
                    
                    return Ok(thumbnail_url);
                }
                Err(e) => {
                    println!("❌ [Rust] 压缩包缩略图生成失败: {}", e);
                    return Err(format!("生成压缩包缩略图失败: {}", e));
                }
            }
        }
    }
    
    Err("缩略图管理器未初始化".to_string())
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

/// 批量入队当前目录的所有文件为最高优先级
/// 用于快速加载当前浏览目录的缩略图
#[command]
pub async fn enqueue_dir_files_highest_priority(
    dir_path: String,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<usize, String> {
    use crate::core::fs_manager::FsManager;
    
    let path = PathBuf::from(&dir_path);
    let fs_manager = FsManager::new();
    
    // 获取目录内容
    let items = fs_manager.read_directory(&path)
        .map_err(|e| format!("列出目录失败: {}", e))?;
    
    // 获取队列
    let queue_guard = state.queue.lock()
        .map_err(|_| "无法获取队列锁".to_string())?;
    
    if let Some(ref q) = *queue_guard {
        let mut enqueued_count = 0;
        
        // 为每个文件入队为最高优先级
        for item in items {
            if !item.is_dir {  // 只入队文件，不入队文件夹
                let file_path = path.join(&item.name);
                // 使用 enqueue 方法，第三个参数表示最高优先级
                match q.enqueue(file_path.to_path_buf(), false, true) {
                    Ok(_) => enqueued_count += 1,
                    Err(e) => println!("⚠️ 入队失败 {}: {}", file_path.display(), e),
                }
            }
        }
        
        println!("⚡ 已将 {} 个文件入队为最高优先级", enqueued_count);
        Ok(enqueued_count)
    } else {
        Err("缩略图队列未初始化".to_string())
    }
}