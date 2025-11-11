//! NeoView - Thumbnail Commands
//! 缩略图相关的 Tauri 命令

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::command;
use crate::core::thumbnail::ThumbnailManager;
use crate::core::fs_manager::FsItem;
use crate::core::image_cache::ImageCache;

/// 全局缩略图管理器
pub struct ThumbnailManagerState {
    pub manager: Arc<Mutex<Option<ThumbnailManager>>>,
    pub cache: Arc<Mutex<ImageCache>>,
}

impl Default for ThumbnailManagerState {
    fn default() -> Self {
        Self {
            manager: Arc::new(Mutex::new(None)),
            cache: Arc::new(Mutex::new(ImageCache::new(512))), // 512MB 缓存
        }
    }
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

    Ok(())
}

/// 生成文件缩略图
#[command]
pub async fn generate_file_thumbnail_new(
    file_path: String,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<String, String> {
    println!("🔄 开始生成缩略图: {}", file_path);
    let path = PathBuf::from(file_path);
    
    // 检查缩略图管理器是否已初始化
    if let Ok(manager_guard) = state.manager.lock() {
        if manager_guard.is_none() {
            println!("❌ 缩略图管理器未初始化");
            return Err("缩略图管理器未初始化".to_string());
        }
    } else {
        println!("❌ 无法获取缩略图管理器锁");
        return Err("无法获取缩略图管理器".to_string());
    }
    
    // 首先检查缓存
    let cache_key = path.to_string_lossy().to_string();
    if let Ok(cache) = state.cache.lock() {
        if let Some(cached_url) = cache.get(&cache_key) {
            // 验证文件URL是否仍然有效
            if cached_url.starts_with("file://") {
                if cache.validate_file_url(&cache_key) {
                    // 检查数据库中是否有记录
                    if let Ok(manager_guard) = state.manager.lock() {
                        if let Some(ref manager) = *manager_guard {
                            if let Ok(Some(_)) = manager.get_thumbnail_info(&path) {
                                println!("✅ 使用缓存的缩略图: {}", cached_url);
                                return Ok(cached_url);
                            }
                        }
                    }
                }
            } else {
                println!("✅ 使用缓存的缩略图: {}", cached_url);
                return Ok(cached_url);
            }
        }
    }

    // 生成新缩略图
    if let Ok(manager_guard) = state.manager.lock() {
        if let Some(ref manager) = *manager_guard {
            println!("📸 正在生成新的缩略图...");
            let thumbnail_url = manager.generate_thumbnail(&path)
                .map_err(|e| {
                    println!("❌ 生成缩略图失败: {}", e);
                    format!("生成缩略图失败: {}", e)
                })?;
            
            println!("✅ 缩略图生成成功: {}", thumbnail_url);
            
            // 添加到缓存
            if let Ok(cache) = state.cache.lock() {
                cache.set(cache_key, thumbnail_url.clone());
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
    if let Ok(manager_guard) = state.manager.lock() {
        if manager_guard.is_none() {
            println!("❌ 缩略图管理器未初始化");
            return Err("缩略图管理器未初始化".to_string());
        }
    } else {
        println!("❌ 无法获取缩略图管理器锁");
        return Err("无法获取缩略图管理器".to_string());
    }
    
    // 首先检查缓存
    let cache_key = format!("folder:{}", path.to_string_lossy());
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
                cache.set(cache_key, thumbnail_url.clone());
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
        
        // 检查缓存
        let cache_key = path.to_string_lossy().to_string();
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
                                cache.set(cache_key, thumbnail_url.clone());
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