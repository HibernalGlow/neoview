//! Thumbnail Commands
//! 缩略图相关的 Tauri 命令

use crate::core::blob_registry::BlobRegistry;
use crate::core::thumbnail_db::ThumbnailDb;
use crate::core::thumbnail_generator::{ThumbnailGenerator, ThumbnailGeneratorConfig};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::Manager;

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
    let generator = Arc::new(Mutex::new(ThumbnailGenerator::new(Arc::clone(&db), config)));

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
        Some(file_path.clone()),   // 传递路径用于日志
    );

    println!(
        "✅ generate_file_thumbnail_new 完成: {} -> blob_key: {}",
        file_path, blob_key
    );
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
            println!(
                "✅ 压缩包缩略图生成成功: {} ({} bytes)",
                archive_path,
                data.len()
            );
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
        Duration::from_secs(3600),  // 1 小时 TTL
        Some(archive_path.clone()), // 传递路径用于日志
    );

    println!(
        "✅ generate_archive_thumbnail_new 完成: {} -> blob_key: {}",
        archive_path, blob_key
    );
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
                    Some(path.clone()),        // 传递路径用于日志
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

/// 检查缩略图是否存在（仅 key + category，减少计算）
#[tauri::command]
pub async fn has_thumbnail_by_key_category(
    app: tauri::AppHandle,
    path: String,
    category: String,
) -> Result<bool, String> {
    let state = app.state::<ThumbnailState>();

    // 构建路径键
    let path_key = if path.contains("::") { path } else { path };

    state
        .db
        .has_thumbnail_by_key_and_category(&path_key, &category)
        .map_err(|e| format!("检查缩略图失败: {}", e))
}

/// 检查缩略图是否存在（保留以兼容旧代码）
#[tauri::command]
pub async fn has_thumbnail(
    app: tauri::AppHandle,
    path: String,
    _size: i64,  // 不再使用
    _ghash: i32, // 不再使用
) -> Result<bool, String> {
    let state = app.state::<ThumbnailState>();

    // 构建路径键
    let path_key = if path.contains("::") {
        path.clone()
    } else {
        path.clone()
    };

    // 自动判断类别
    let category = if !path_key.contains("::") && !path_key.contains(".") {
        "folder"
    } else {
        "file"
    };

    state
        .db
        .has_thumbnail_by_key_and_category(&path_key, category)
        .map_err(|e| format!("检查缩略图失败: {}", e))
}

/// 加载缩略图（从数据库，返回 blob key）
/// 默认只使用 key 和 category 查询，减少计算
#[tauri::command]
pub async fn load_thumbnail_from_db(
    app: tauri::AppHandle,
    path: String,
    _size: i64,  // 保留参数以兼容，但不使用
    _ghash: i32, // 保留参数以兼容，但不使用
    category: Option<String>,
) -> Result<Option<String>, String> {
    let state = app.state::<ThumbnailState>();

    // 构建路径键
    let path_key = if path.contains("::") {
        path.clone()
    } else {
        path.clone()
    };

    // 确定类别（如果没有指定，根据路径判断）
    let cat = category.unwrap_or_else(|| {
        if !path_key.contains("::") && !path_key.contains(".") {
            "folder".to_string()
        } else {
            "file".to_string()
        }
    });

    // 默认只使用 key + category 查询（减少计算）
    match state.db.load_thumbnail_by_key_and_category(&path_key, &cat) {
        Ok(Some(data)) => {
            // 注册到 BlobRegistry，返回 blob key
            use std::time::Duration;
            let blob_key = state.blob_registry.get_or_register(
                &data,
                "image/webp",
                Duration::from_secs(3600), // 1 小时 TTL
                Some(path_key.clone()),    // 传递路径用于日志
            );
            Ok(Some(blob_key))
        }
        Ok(None) => {
            // 如果是文件夹且没有记录，尝试查找路径下最早的文件记录
            if cat == "folder" {
                match state.db.find_earliest_thumbnail_in_path(&path_key) {
                    Ok(Some((child_key, child_data))) => {
                        // 找到子文件的缩略图，复制给文件夹
                        println!(
                            "🔍 文件夹无记录，找到子文件缩略图: {} -> {}",
                            child_key, path_key
                        );

                        // 保存到文件夹
                        let folder_size = 0; // 文件夹使用固定 size
                        let folder_ghash = 0; // 文件夹使用固定 ghash（因为不再使用）
                        match state.db.save_thumbnail_with_category(
                            &path_key,
                            folder_size,
                            folder_ghash,
                            &child_data,
                            Some("folder"),
                        ) {
                            Ok(_) => {
                                println!("✅ 已将子文件缩略图绑定到文件夹: {}", path_key);
                                // 注册并返回
                                use std::time::Duration;
                                let blob_key = state.blob_registry.get_or_register(
                                    &child_data,
                                    "image/webp",
                                    Duration::from_secs(3600),
                                    Some(path_key.clone()),
                                );
                                Ok(Some(blob_key))
                            }
                            Err(e) => {
                                eprintln!("❌ 保存文件夹缩略图失败: {} - {}", path_key, e);
                                Ok(None)
                            }
                        }
                    }
                    Ok(None) => Ok(None),
                    Err(e) => {
                        eprintln!("⚠️ 查找路径下缩略图失败: {} - {}", path_key, e);
                        Ok(None)
                    }
                }
            } else {
                Ok(None)
            }
        }
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

fn infer_category(path: &str, explicit: Option<String>) -> String {
    if let Some(cat) = explicit {
        return cat;
    }
    if !path.contains("::") && !path.contains('.') {
        "folder".to_string()
    } else {
        "file".to_string()
    }
}

#[derive(Debug, Deserialize)]
pub struct ThumbnailIndexRequest {
    pub path: String,
    pub category: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailIndexResult {
    pub path: String,
    pub exists: bool,
}

/// 批量预加载缩略图索引（后台线程）
#[tauri::command]
pub async fn preload_thumbnail_index(
    app: tauri::AppHandle,
    entries: Vec<ThumbnailIndexRequest>,
) -> Result<Vec<ThumbnailIndexResult>, String> {
    let state = app.state::<ThumbnailState>();
    let db = Arc::clone(&state.db);

    let requests: Vec<(String, String)> = entries
        .into_iter()
        .map(|entry| {
            let category = infer_category(&entry.path, entry.category);
            (entry.path, category)
        })
        .collect();

    let handle = tauri::async_runtime::spawn_blocking(
        move || -> Result<Vec<ThumbnailIndexResult>, String> {
            let mut responses = Vec::with_capacity(requests.len());
            for (path, category) in requests {
                let exists = db
                    .has_thumbnail_by_key_and_category(&path, &category)
                    .map_err(|e| format!("检查缩略图失败: {}", e))?;
                responses.push(ThumbnailIndexResult { path, exists });
            }
            Ok(responses)
        },
    );

    handle
        .await
        .map_err(|e| format!("缩略图索引预加载任务失败: {}", e))?
}
