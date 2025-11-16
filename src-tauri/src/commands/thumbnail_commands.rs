//! Thumbnail Commands
//! 缩略图相关的 Tauri 命令

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use crate::core::thumbnail_db::ThumbnailDb;
use crate::core::thumbnail_generator::{ThumbnailGenerator, ThumbnailGeneratorConfig};
use crate::core::blob_registry::BlobRegistry;

/// 缩略图管理器状态
pub struct ThumbnailState {
    pub db: Arc<ThumbnailDb>,
    pub generator: Arc<Mutex<ThumbnailGenerator>>,
    pub blob_registry: Arc<BlobRegistry>,
}

/// 初始化缩略图管理器
#[tauri::command]
pub async fn init_thumbnail_manager(
    app: tauri::AppHandle,
    _thumbnail_path: String,
    _root_path: String,
    size: u32,
) -> Result<(), String> {
    // 强制使用 D:\temp\neoview 作为数据库路径
    let db_dir = PathBuf::from("D:\\temp\\neoview");
    
    // 确保目录存在
    if let Err(e) = std::fs::create_dir_all(&db_dir) {
        eprintln!("⚠️ 创建数据库目录失败: {} - {}", db_dir.display(), e);
        return Err(format!("创建数据库目录失败: {}", e));
    }
    
    // 创建数据库路径
    let db_path = db_dir.join("thumbnails.db");
    
    // 输出数据库路径（用于调试）
    println!("📁 缩略图数据库路径: {}", db_path.display());
    
    // 创建数据库
    let db = Arc::new(ThumbnailDb::new(db_path));
    
    // 创建生成器配置（根据 CPU 核心数动态调整，提高两倍性能）
    let num_cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let thread_pool_size = (num_cores * 4).max(16).min(32); // 提高2倍：4倍核心数，最少16，最多32
    let archive_concurrency = (num_cores * 2).max(4).min(12); // 提高2倍：2倍核心数，最少4，最多12
    
    let config = ThumbnailGeneratorConfig {
        max_width: size,
        max_height: size,
        thread_pool_size,
        archive_concurrency,
    };
    
    // 创建生成器（已解耦，不依赖 ImageLoader 和 ArchiveManager）
    let generator = Arc::new(Mutex::new(ThumbnailGenerator::new(
        Arc::clone(&db),
        config,
    )));
    
    // 创建 BlobRegistry（用于管理 blob URL）
    let blob_registry = Arc::new(BlobRegistry::new(1000)); // 最多缓存 1000 个缩略图
    
    // 保存到应用状态
    app.manage(ThumbnailState { 
        db, 
        generator,
        blob_registry,
    });
    
    Ok(())
}

/// 生成文件缩略图（返回 blob key，同步保存到数据库）
#[tauri::command]
pub async fn generate_file_thumbnail_new(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<String, String> {
    // 检查是否为文件夹（文件夹不应该调用这个函数）
    if std::path::Path::new(&file_path).is_dir() {
        return Err("路径是文件夹，请使用文件夹缩略图逻辑".to_string());
    }
    
    let state = app.state::<ThumbnailState>();
    let generator = state.generator.lock().unwrap();
    
    // 生成缩略图（内部已同步保存到数据库）
    let thumbnail_data = match generator.generate_file_thumbnail(&file_path) {
        Ok(data) => data,
        Err(e) => {
            eprintln!("❌ 文件缩略图生成失败: {} - {}", file_path, e);
            return Err(e);
        }
    };
    
    // 注册到 BlobRegistry，返回 blob key（带路径信息）
    use std::time::Duration;
    let blob_key = state.blob_registry.get_or_register(
        &thumbnail_data,
        "image/webp",
        Duration::from_secs(3600), // 1 小时 TTL
        Some(file_path.clone()), // 传递路径用于日志
    );
    
    println!("✅ generate_file_thumbnail_new 完成: {} -> blob_key: {}", file_path, blob_key);
    Ok(blob_key)
}

/// 生成压缩包缩略图（返回 blob key）
#[tauri::command]
pub async fn generate_archive_thumbnail_new(
    app: tauri::AppHandle,
    archive_path: String,
) -> Result<String, String> {
    println!("🚀 generate_archive_thumbnail_new 被调用: {}", archive_path);
    let state = app.state::<ThumbnailState>();
    let generator = state.generator.lock().unwrap();
    
    // 生成缩略图
    println!("📸 开始生成压缩包缩略图: {}", archive_path);
    let thumbnail_data = match generator.generate_archive_thumbnail(&archive_path) {
        Ok(data) => {
            println!("✅ 压缩包缩略图生成成功: {} ({} bytes)", archive_path, data.len());
            data
        }
        Err(e) => {
            eprintln!("❌ 压缩包缩略图生成失败: {} - {}", archive_path, e);
            return Err(e);
        }
    };
    
    // 注册到 BlobRegistry，返回 blob key（带路径信息）
    use std::time::Duration;
    let blob_key = state.blob_registry.get_or_register(
        &thumbnail_data,
        "image/webp",
        Duration::from_secs(3600), // 1 小时 TTL
        Some(archive_path.clone()), // 传递路径用于日志
    );
    
    println!("✅ generate_archive_thumbnail_new 完成: {} -> blob_key: {}", archive_path, blob_key);
    Ok(blob_key)
}

/// 批量预加载缩略图（返回 blob keys）
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
    
    // 注册到 BlobRegistry，返回 blob keys
    use std::time::Duration;
    let mut blob_keys = Vec::new();
    for (path, result) in results {
        match result {
            Ok(data) => {
                let blob_key = state.blob_registry.get_or_register(
                    &data,
                    "image/webp",
                    Duration::from_secs(3600), // 1 小时 TTL
                    Some(path.clone()), // 传递路径用于日志
                );
                blob_keys.push((path, blob_key));
            }
            Err(e) => {
                eprintln!("生成缩略图失败 {}: {}", path, e);
            }
        }
    }
    
    Ok(blob_keys)
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

/// 加载缩略图（从数据库，返回 blob key）
#[tauri::command]
pub async fn load_thumbnail_from_db(
    app: tauri::AppHandle,
    path: String,
    size: i64,
    ghash: i32,
    category: Option<String>,
) -> Result<Option<String>, String> {
    let state = app.state::<ThumbnailState>();
    
    // 构建路径键
    let path_key = if path.contains("::") {
        path
    } else {
        path
    };
    
    match state.db.load_thumbnail_with_category(&path_key, size, ghash, category.as_deref()) {
        Ok(Some(data)) => {
            // 注册到 BlobRegistry，返回 blob key
            use std::time::Duration;
            let blob_key = state.blob_registry.get_or_register(
                &data,
                "image/webp",
                Duration::from_secs(3600), // 1 小时 TTL
                Some(path_key.clone()), // 传递路径用于日志
            );
            Ok(Some(blob_key))
        }
        Ok(None) => Ok(None),
        Err(e) => Err(format!("加载缩略图失败: {}", e)),
    }
}

/// 获取 blob 数据（用于创建前端 Blob URL）
#[tauri::command]
pub async fn get_thumbnail_blob_data(
    app: tauri::AppHandle,
    blob_key: String,
) -> Result<Option<Vec<u8>>, String> {
    let state = app.state::<ThumbnailState>();
    
    match state.blob_registry.fetch_bytes(&blob_key) {
        Some(data) => Ok(Some(data)),
        None => Ok(None),
    }
}

