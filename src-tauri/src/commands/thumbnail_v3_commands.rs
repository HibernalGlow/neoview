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
use crate::core::blob_registry::BlobRegistry;
use super::thumbnail_commands::ThumbnailState;
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
    let service = Arc::new(ThumbnailServiceV3::new(Arc::clone(&db), Arc::clone(&generator), service_config));
    
    // 启动工作线程
    service.start(app.clone());
    
    // 保存到应用状态
    app.manage(ThumbnailServiceV3State { service });
    
    // 同时初始化 ThumbnailState（供 rating 命令使用）
    // 创建 BlobRegistry（用于管理 blob URL）
    let blob_registry = Arc::new(BlobRegistry::new(1000)); // 最多缓存 1000 个缩略图
    
    app.manage(ThumbnailState {
        db,
        generator,
        blob_registry,
    });
    
    log_info!("✅ ThumbnailServiceV3 + ThumbnailState 初始化完成");
    Ok(())
}

/// 请求可见区域缩略图（核心命令，不阻塞）
#[tauri::command]
pub async fn request_visible_thumbnails_v3(
    app: AppHandle,
    paths: Vec<String>,
    current_dir: String,
) -> Result<(), String> {
    // 安全获取 State（使用 try_state 避免 panic）
    let state = match app.try_state::<ThumbnailServiceV3State>() {
        Some(s) => s,
        None => {
            log_info!("⚠️ ThumbnailServiceV3 未初始化，跳过请求");
            return Ok(());
        }
    };
    // 不阻塞，直接返回
    state.service.request_visible_thumbnails(&app, paths, current_dir);
    Ok(())
}

/// 取消指定目录的请求
#[tauri::command]
pub async fn cancel_thumbnail_requests_v3(
    app: AppHandle,
    dir: String,
) -> Result<(), String> {
    if let Some(state) = app.try_state::<ThumbnailServiceV3State>() {
        state.service.cancel_requests(&dir);
    }
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
    app: AppHandle,
    paths: Vec<String>,
) -> Result<Vec<CachedThumbnailResult>, String> {
    if let Some(state) = app.try_state::<ThumbnailServiceV3State>() {
        let results = state.service.get_cached_thumbnails(paths);
        Ok(results.into_iter().map(|(path, blob)| CachedThumbnailResult { path, blob }).collect())
    } else {
        Ok(vec![])
    }
}

/// 预加载目录（后台预热）
#[tauri::command]
pub async fn preload_directory_thumbnails_v3(
    app: AppHandle,
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
    if let Some(state) = app.try_state::<ThumbnailServiceV3State>() {
        state.service.request_visible_thumbnails(&app, paths, dir);
    }
    
    Ok(())
}

/// 清除缓存
#[tauri::command]
pub async fn clear_thumbnail_cache_v3(
    app: AppHandle,
    scope: String,
) -> Result<(), String> {
    if let Some(state) = app.try_state::<ThumbnailServiceV3State>() {
        state.service.clear_cache(&scope);
    }
    Ok(())
}

/// 获取缓存统计
#[tauri::command]
pub async fn get_thumbnail_cache_stats_v3(
    app: AppHandle,
) -> Result<CacheStats, String> {
    if let Some(state) = app.try_state::<ThumbnailServiceV3State>() {
        Ok(state.service.get_cache_stats())
    } else {
        Ok(CacheStats {
            memory_count: 0,
            memory_bytes: 0,
            database_count: 0,
            database_bytes: 0,
            queue_length: 0,
            active_workers: 0,
        })
    }
}

// ============== 数据库维护命令 ==============

/// 数据库维护统计
#[derive(Clone, serde::Serialize)]
pub struct MaintenanceStats {
    pub total_entries: usize,
    pub folder_entries: usize,
    pub db_size_bytes: i64,
    pub db_size_mb: f64,
}

/// 获取数据库维护统计
#[tauri::command]
pub async fn get_thumbnail_db_stats_v3(
    app: AppHandle,
) -> Result<MaintenanceStats, String> {
    if let Some(state) = app.try_state::<ThumbnailServiceV3State>() {
        let (total, folders, size) = state.service.get_db_stats()?;
        
        Ok(MaintenanceStats {
            total_entries: total,
            folder_entries: folders,
            db_size_bytes: size,
            db_size_mb: size as f64 / 1024.0 / 1024.0,
        })
    } else {
        Err("缩略图服务未初始化".to_string())
    }
}

/// 清理无效路径（文件不存在）
#[tauri::command]
pub async fn cleanup_invalid_paths_v3(
    app: AppHandle,
) -> Result<usize, String> {
    if let Some(state) = app.try_state::<ThumbnailServiceV3State>() {
        state.service.cleanup_invalid_paths()
    } else {
        Err("缩略图服务未初始化".to_string())
    }
}

/// 清理过期条目
/// days: 过期天数
/// exclude_folders: 是否排除文件夹（保留文件夹缩略图）
#[tauri::command]
pub async fn cleanup_expired_entries_v3(
    app: AppHandle,
    days: i64,
    exclude_folders: bool,
) -> Result<usize, String> {
    if let Some(state) = app.try_state::<ThumbnailServiceV3State>() {
        state.service.cleanup_expired_entries(days, exclude_folders)
    } else {
        Err("缩略图服务未初始化".to_string())
    }
}

/// 清理指定路径前缀下的缩略图
#[tauri::command]
pub async fn cleanup_by_path_prefix_v3(
    app: AppHandle,
    path_prefix: String,
) -> Result<usize, String> {
    if let Some(state) = app.try_state::<ThumbnailServiceV3State>() {
        state.service.cleanup_by_path_prefix(&path_prefix)
    } else {
        Err("缩略图服务未初始化".to_string())
    }
}

/// 执行数据库压缩（VACUUM）
#[tauri::command]
pub async fn vacuum_thumbnail_db_v3(
    app: AppHandle,
) -> Result<(), String> {
    if let Some(state) = app.try_state::<ThumbnailServiceV3State>() {
        state.service.vacuum_db()
    } else {
        Err("缩略图服务未初始化".to_string())
    }
}
