//! Thumbnail Commands
//! 缩略图相关的 Tauri 命令

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{State, Manager};
use serde::{Deserialize, Serialize};
use crate::core::thumbnail_db::ThumbnailDb;
use crate::core::thumbnail_generator::{ThumbnailGenerator, ThumbnailGeneratorConfig};
use crate::core::{ImageLoader, ArchiveManager};

/// 缩略图管理器状态
pub struct ThumbnailState {
    pub db: Arc<ThumbnailDb>,
    pub generator: Arc<Mutex<ThumbnailGenerator>>,
}

/// 初始化缩略图管理器
#[tauri::command]
pub async fn init_thumbnail_manager(
    app: tauri::AppHandle,
    thumbnail_path: String,
    root_path: String,
    size: u32,
) -> Result<(), String> {
    // 创建数据库路径
    let db_path = PathBuf::from(&thumbnail_path).join("thumbnails.db");
    
    // 创建数据库
    let db = Arc::new(ThumbnailDb::new(db_path));
    
    // 创建图像加载器和压缩包管理器
    let image_loader = Arc::new(ImageLoader::new(512, 6));
    let archive_manager = Arc::new(ArchiveManager::new());
    
    // 创建生成器配置
    let config = ThumbnailGeneratorConfig {
        max_width: size,
        max_height: size,
        thread_pool_size: 6,
        archive_concurrency: 3,
    };
    
    // 创建生成器
    let generator = Arc::new(Mutex::new(ThumbnailGenerator::new(
        Arc::clone(&db),
        image_loader,
        archive_manager,
        config,
    )));
    
    // 保存到应用状态
    app.manage(ThumbnailState { db, generator });
    
    Ok(())
}

/// 生成文件缩略图
#[tauri::command]
pub async fn generate_file_thumbnail_new(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<String, String> {
    let state = app.state::<ThumbnailState>();
    let generator = state.generator.lock().unwrap();
    
    // 生成缩略图
    let thumbnail_data = generator.generate_file_thumbnail(&file_path)?;
    
    // 转换为 base64 data URL
    let base64 = base64::encode(&thumbnail_data);
    Ok(format!("data:image/webp;base64,{}", base64))
}

/// 生成压缩包缩略图
#[tauri::command]
pub async fn generate_archive_thumbnail_new(
    app: tauri::AppHandle,
    archive_path: String,
) -> Result<String, String> {
    let state = app.state::<ThumbnailState>();
    let generator = state.generator.lock().unwrap();
    
    // 生成缩略图
    let thumbnail_data = generator.generate_archive_thumbnail(&archive_path)?;
    
    // 转换为 base64 data URL
    let base64 = base64::encode(&thumbnail_data);
    Ok(format!("data:image/webp;base64,{}", base64))
}

/// 批量预加载缩略图
#[tauri::command]
pub async fn batch_preload_thumbnails(
    app: tauri::AppHandle,
    paths: Vec<String>,
    is_archive: bool,
) -> Result<Vec<(String, String)>, String> {
    let state = app.state::<ThumbnailState>();
    let generator = state.generator.lock().unwrap();
    
    // 批量生成缩略图
    let results = generator.batch_generate_thumbnails(paths, is_archive);
    
    // 转换为 base64 data URLs
    let mut data_urls = Vec::new();
    for (path, result) in results {
        match result {
            Ok(data) => {
                let base64 = base64::encode(&data);
                data_urls.push((path, format!("data:image/webp;base64,{}", base64)));
            }
            Err(e) => {
                eprintln!("生成缩略图失败 {}: {}", path, e);
            }
        }
    }
    
    Ok(data_urls)
}

/// 检查缩略图是否存在
#[tauri::command]
pub async fn has_thumbnail(
    app: tauri::AppHandle,
    path: String,
    size: i64,
    ghash: i32,
) -> Result<bool, String> {
    let state = app.state::<ThumbnailState>();
    
    // 构建路径键
    let path_key = if path.contains("::") {
        path
    } else {
        path
    };
    
    state.db.has_thumbnail(&path_key, size, ghash)
        .map_err(|e| format!("检查缩略图失败: {}", e))
}

/// 加载缩略图（从数据库）
#[tauri::command]
pub async fn load_thumbnail_from_db(
    app: tauri::AppHandle,
    path: String,
    size: i64,
    ghash: i32,
) -> Result<Option<String>, String> {
    let state = app.state::<ThumbnailState>();
    
    // 构建路径键
    let path_key = if path.contains("::") {
        path
    } else {
        path
    };
    
    match state.db.load_thumbnail(&path_key, size, ghash) {
        Ok(Some(data)) => {
            let base64 = base64::encode(&data);
            Ok(Some(format!("data:image/webp;base64,{}", base64)))
        }
        Ok(None) => Ok(None),
        Err(e) => Err(format!("加载缩略图失败: {}", e)),
    }
}

