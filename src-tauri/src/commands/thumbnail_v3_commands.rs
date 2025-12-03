//! Thumbnail V3 Commands
//! 缩略图服务 V3 的 Tauri 命令
//! 
//! 核心命令：
//! 1. request_visible_thumbnails - 请求可见区域缩略图
//! 2. cancel_thumbnail_requests - 取消指定目录的请求
//! 3. get_cached_thumbnails - 直接从缓存获取
//! 
//! 辅助命令：
//! 4. preload_directory_thumbnails - 预加载目录
//! 5. clear_thumbnail_cache - 清除缓存
//! 6. get_thumbnail_cache_stats - 获取缓存统计

use crate::core::thumbnail_service_v3::{CacheStats, ThumbnailServiceV3, ThumbnailServiceConfig};
use crate::core::thumbnail_db::ThumbnailDb;
use crate::core::thumbnail_generator::{ThumbnailGenerator, ThumbnailGeneratorConfig};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};

// 简化的日志宏
macro_rules! log_info {
    ($($arg:tt)*) => {
        println!("[INFO] {}", format!($($arg)*));
    };
}

/// ThumbnailServiceV3 状态
pub struct ThumbnailServiceV3State {
    pub service: Arc<ThumbnailServiceV3>,
}

/// 初始化 ThumbnailServiceV3
#[tauri::command]
pub async fn init_thumbnail_service_v3(
    app: AppHandle,
    thumbnail_path: String,
    size: u32,
) -> Result<(), String> {
    use std::path::{Path, PathBuf};
    
    // 路径处理
    let raw = thumbnail_path.trim();
    let db_dir = if raw.is_empty() || !Path::new(raw).is_absolute() {
        PathBuf::from("D:\\temp\\neoview")
    } else {
        PathBuf::from(raw)
    };
    
    // 确保目录存在
    if let Err(e) = std::fs::create_dir_all(&db_dir) {
        return Err(format!("创建数据库目录失败: {}", e));
    }
    
    let db_path = db_dir.join("thumbnails.db");
    log_info!("📁 ThumbnailServiceV3 数据库路径: {}", db_path.display());
    
    // 创建数据库
    let db = Arc::new(ThumbnailDb::new(db_path));
    
    // 创建生成器配置
    let gen_config = ThumbnailGeneratorConfig {
        max_width: size,
        max_height: size,
        thread_pool_size: 8,
        archive_concurrency: 4,
    };
    let generator = Arc::new(Mutex::new(ThumbnailGenerator::new(Arc::clone(&db), gen_config)));
    
    // 创建服务配置
    let service_config = ThumbnailServiceConfig {
        folder_search_depth: 2,
        memory_cache_size: 1024,
        worker_threads: 8,
        thumbnail_size: size,
        db_save_delay_ms: 2000,
    };
    
    // 创建服务
    let service = Arc::new(ThumbnailServiceV3::new(db, generator, service_config));
    
    // 启动工作线程
    service.start(app.clone());
    
    // 保存到应用状态
    app.manage(ThumbnailServiceV3State { service });
    
    log_info!("✅ ThumbnailServiceV3 初始化完成");
    Ok(())
}

/// 请求可见区域缩略图（核心命令，不阻塞）
#[tauri::command]
pub async fn request_visible_thumbnails_v3(
    app: AppHandle,
    state: State<'_, ThumbnailServiceV3State>,
    paths: Vec<String>,
    current_dir: String,
) -> Result<(), String> {
    // 不阻塞，直接返回
    state.service.request_visible_thumbnails(&app, paths, current_dir);
    Ok(())
}

/// 取消指定目录的请求
#[tauri::command]
pub async fn cancel_thumbnail_requests_v3(
    state: State<'_, ThumbnailServiceV3State>,
    dir: String,
) -> Result<(), String> {
    state.service.cancel_requests(&dir);
    Ok(())
}

/// 缓存的缩略图结果
#[derive(Serialize)]
pub struct CachedThumbnailResult {
    pub path: String,
    pub blob: Option<Vec<u8>>,
}

/// 直接从缓存获取（同步）
#[tauri::command]
pub async fn get_cached_thumbnails_v3(
    state: State<'_, ThumbnailServiceV3State>,
    paths: Vec<String>,
) -> Result<Vec<CachedThumbnailResult>, String> {
    let results = state.service.get_cached_thumbnails(paths);
    Ok(results.into_iter().map(|(path, blob)| CachedThumbnailResult { path, blob }).collect())
}

/// 预加载目录（后台预热）
#[tauri::command]
pub async fn preload_directory_thumbnails_v3(
    app: AppHandle,
    state: State<'_, ThumbnailServiceV3State>,
    dir: String,
    depth: Option<u32>,
) -> Result<(), String> {
    use std::path::Path;
    
    let max_depth = depth.unwrap_or(1);
    
    // 收集目录下的所有文件
    fn collect_paths(dir: &str, depth: u32, max_depth: u32, paths: &mut Vec<String>) {
        if depth > max_depth {
            return;
        }
        
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                paths.push(path.to_string_lossy().to_string());
                
                if path.is_dir() && depth < max_depth {
                    collect_paths(&path.to_string_lossy(), depth + 1, max_depth, paths);
                }
            }
        }
    }
    
    let mut paths = Vec::new();
    collect_paths(&dir, 0, max_depth, &mut paths);
    
    // 请求预加载
    state.service.request_visible_thumbnails(&app, paths, dir);
    
    Ok(())
}

/// 清除缓存
#[tauri::command]
pub async fn clear_thumbnail_cache_v3(
    state: State<'_, ThumbnailServiceV3State>,
    scope: String,
) -> Result<(), String> {
    state.service.clear_cache(&scope);
    Ok(())
}

/// 获取缓存统计
#[tauri::command]
pub async fn get_thumbnail_cache_stats_v3(
    state: State<'_, ThumbnailServiceV3State>,
) -> Result<CacheStats, String> {
    Ok(state.service.get_cache_stats())
}
