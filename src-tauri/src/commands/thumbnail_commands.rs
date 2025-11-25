//! Thumbnail Commands
//! 缩略图相关的 Tauri 命令

use super::fs_commands::{CacheIndexState, FsState};
use super::task_queue_commands::BackgroundSchedulerState;
use crate::core::blob_registry::BlobRegistry;
use crate::core::cache_index_db::{CacheIndexDb, ThumbnailCacheUpsert};
use crate::core::fs_manager::{FsItem, FsManager};
use crate::core::thumbnail_db::ThumbnailDb;
use crate::core::thumbnail_generator::{ThumbnailGenerator, ThumbnailGeneratorConfig};
use crate::core::video_thumbnail::VideoThumbnailGenerator;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Manager, State};

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
    thumbnail_path: String,
    _root_path: String,
    size: u32,
) -> Result<(), String> {
    // 使用前端传入的缩略图根目录（前端已做路径规范化），并在此处再做一层兜底：
    // - 如果为空字符串
    // - 或者不是绝对路径
    // 则退回默认路径 D:\temp\neoview
    let raw = thumbnail_path.trim();
    let db_dir = if raw.is_empty() || !Path::new(raw).is_absolute() {
        PathBuf::from("D:\\temp\\neoview")
    } else {
        PathBuf::from(raw)
    };

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
    let cache_index = app.state::<CacheIndexState>();
    let scheduler = app.state::<BackgroundSchedulerState>();
    let generator = Arc::clone(&state.generator);
    let job_source = format!("file:{}", file_path);
    let path_for_job = file_path.clone();

    let thumbnail_data: Vec<u8> = scheduler
        .scheduler
        .enqueue_blocking(
            "thumbnail-generate",
            job_source,
            move || -> Result<Vec<u8>, String> {
                let generator = generator
                    .lock()
                    .map_err(|e| format!("获取缩略图生成器锁失败: {}", e))?;
                generator.generate_file_thumbnail(&path_for_job)
            },
        )
        .await?;

    // 注册到 BlobRegistry，返回 blob key（带路径信息）
    let blob_key = state.blob_registry.get_or_register(
        &thumbnail_data,
        "image/webp",
        Duration::from_secs(3600), // 1 小时 TTL
        Some(file_path.clone()),   // 传递路径用于日志
    );

    if let Err(err) = cache_index.db.upsert_thumbnail_entry(ThumbnailCacheUpsert {
        path_key: &file_path,
        category: &infer_category(&file_path, None),
        hash: None,
        size: Some(thumbnail_data.len() as i64),
        source: Some("generate_file_thumbnail_new"),
        blob_key: Some(&blob_key),
    }) {
        eprintln!("⚠️ 写入缩略图缓存索引失败: {}", err);
    }

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
    let cache_index = app.state::<CacheIndexState>();
    let scheduler = app.state::<BackgroundSchedulerState>();
    let generator = Arc::clone(&state.generator);
    println!("📸 开始生成压缩包缩略图: {}", archive_path);
    let path_for_job = archive_path.clone();

    let thumbnail_data = scheduler
        .scheduler
        .enqueue_blocking(
            "thumbnail-generate",
            format!("archive:{}", archive_path),
            move || -> Result<Vec<u8>, String> {
                let generator = generator
                    .lock()
                    .map_err(|e| format!("获取缩略图生成器锁失败: {}", e))?;
                generator.generate_archive_thumbnail(&path_for_job)
            },
        )
        .await?;

    println!(
        "✅ 压缩包缩略图生成成功: {} ({} bytes)",
        archive_path,
        thumbnail_data.len()
    );

    let blob_key = state.blob_registry.get_or_register(
        &thumbnail_data,
        "image/webp",
        Duration::from_secs(3600),  // 1 小时 TTL
        Some(archive_path.clone()), // 传递路径用于日志
    );

    if let Err(err) = cache_index.db.upsert_thumbnail_entry(ThumbnailCacheUpsert {
        path_key: &archive_path,
        category: &infer_category(&archive_path, None),
        hash: None,
        size: Some(thumbnail_data.len() as i64),
        source: Some("generate_archive_thumbnail_new"),
        blob_key: Some(&blob_key),
    }) {
        eprintln!("⚠️ 写入缩略图缓存索引失败: {}", err);
    }

    println!(
        "✅ generate_archive_thumbnail_new 完成: {} -> blob_key: {}",
        archive_path, blob_key
    );
    Ok(blob_key)
}

/// 生成视频缩略图（返回 blob key，同步保存到数据库）
#[tauri::command]
pub async fn generate_video_thumbnail_new(
    app: tauri::AppHandle,
    video_path: String,
    time_seconds: Option<f64>,
) -> Result<String, String> {
    use image::ImageFormat;
    use std::path::Path;

    let state = app.state::<ThumbnailState>();
    let cache_index = app.state::<CacheIndexState>();
    let scheduler = app.state::<BackgroundSchedulerState>();
    let job_source = format!("video:{}", video_path);
    let time = time_seconds.unwrap_or(10.0);

    // 检查是否为视频文件
    let path = Path::new(&video_path);
    if !VideoThumbnailGenerator::is_video_file(path) {
        return Err("路径不是视频文件".to_string());
    }

    // 检查 FFmpeg 是否可用
    if !VideoThumbnailGenerator::is_ffmpeg_available() {
        return Err("FFmpeg 不可用，请安装 FFmpeg".to_string());
    }

    let video_path_for_job = video_path.clone();
    let path_for_job = PathBuf::from(&video_path_for_job);
    let thumbnail_data: Vec<u8> = scheduler
        .scheduler
        .enqueue_blocking(
            "thumbnail-generate",
            job_source,
            move || -> Result<Vec<u8>, String> {
                // 提取视频帧
                let frame = VideoThumbnailGenerator::extract_frame(&path_for_job, time)
                    .map_err(|e| format!("提取视频帧失败: {}", e))?;

                // 将图片编码为 PNG 字节数组
                let mut buffer = Vec::new();
                {
                    let mut cursor = std::io::Cursor::new(&mut buffer);
                    frame
                        .write_to(&mut cursor, ImageFormat::Png)
                        .map_err(|e| format!("编码图片失败: {}", e))?;
                }

                Ok(buffer)
            },
        )
        .await?;

    // 保存到数据库（异步后台任务）
    let db = Arc::clone(&state.db);
    let video_path_clone = video_path.clone();
    let thumb_data_clone = thumbnail_data.clone();

    tauri::async_runtime::spawn_blocking(move || {
        // 获取文件大小
        let size = std::fs::metadata(&video_path_clone)
            .map(|m| m.len() as i64)
            .unwrap_or(0);

        // 生成哈希
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        video_path_clone.hash(&mut hasher);
        size.hash(&mut hasher);
        let ghash = hasher.finish() as i32;

        // 保存
        if let Err(e) = db.save_thumbnail_with_category(
            &video_path_clone,
            size,
            ghash,
            &thumb_data_clone,
            Some("file"),
        ) {
            eprintln!(
                "❌ 保存视频缩略图到数据库失败: {} - {}",
                video_path_clone, e
            );
        } else if cfg!(debug_assertions) {
            println!("✅ 视频缩略图已保存到数据库: {}", video_path_clone);
        }
    });

    // 注册到 BlobRegistry，返回 blob key
    let blob_key = state.blob_registry.get_or_register(
        &thumbnail_data,
        "image/png",
        Duration::from_secs(3600), // 1 小时 TTL
        Some(video_path.clone()),
    );

    // 写入缓存索引
    if let Err(err) = cache_index.db.upsert_thumbnail_entry(ThumbnailCacheUpsert {
        path_key: &video_path,
        category: "file",
        hash: None,
        size: Some(thumbnail_data.len() as i64),
        source: Some("generate_video_thumbnail_new"),
        blob_key: Some(&blob_key),
    }) {
        eprintln!("⚠️ 写入视频缩略图缓存索引失败: {}", err);
    }

    println!(
        "✅ generate_video_thumbnail_new 完成: {} -> blob_key: {}",
        video_path, blob_key
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
    let cache_index = app.state::<CacheIndexState>();
    let scheduler = app.state::<BackgroundSchedulerState>();
    let generator = Arc::clone(&state.generator);
    let batch_paths = paths.clone();

    let results: HashMap<String, Result<Vec<u8>, String>> = scheduler
        .scheduler
        .enqueue_blocking(
            "thumbnail-generate",
            format!(
                "batch:{}:{}",
                if is_archive { "archive" } else { "file" },
                batch_paths.len()
            ),
            move || -> Result<HashMap<String, Result<Vec<u8>, String>>, String> {
                let generator = generator
                    .lock()
                    .map_err(|e| format!("获取缩略图生成器锁失败: {}", e))?;
                Ok(generator.batch_generate_thumbnails(batch_paths, is_archive))
            },
        )
        .await?;

    let mut blob_keys = Vec::new();
    for (path, result) in results {
        match result {
            Ok(data) => {
                let blob_key = state.blob_registry.get_or_register(
                    &data,
                    "image/webp",
                    Duration::from_secs(3600),
                    Some(path.clone()),
                );
                if let Err(err) = cache_index.db.upsert_thumbnail_entry(ThumbnailCacheUpsert {
                    path_key: &path,
                    category: &infer_category(&path, None),
                    hash: None,
                    size: Some(data.len() as i64),
                    source: Some("batch_preload_thumbnails"),
                    blob_key: Some(&blob_key),
                }) {
                    eprintln!("⚠️ 写入缩略图缓存索引失败: {}", err);
                }
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
    let cache_index = app.state::<CacheIndexState>();

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
            let blob_key = state.blob_registry.get_or_register(
                &data,
                "image/webp",
                Duration::from_secs(3600), // 1 小时 TTL
                Some(path_key.clone()),    // 传递路径用于日志
            );
            if let Err(err) = cache_index.db.upsert_thumbnail_entry(ThumbnailCacheUpsert {
                path_key: &path_key,
                category: &cat,
                hash: None,
                size: Some(data.len() as i64),
                source: Some("load_thumbnail_from_db"),
                blob_key: Some(&blob_key),
            }) {
                eprintln!("⚠️ 写入缩略图缓存索引失败: {}", err);
            }
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
                                let blob_key = state.blob_registry.get_or_register(
                                    &child_data,
                                    "image/webp",
                                    Duration::from_secs(3600),
                                    Some(path_key.clone()),
                                );
                                if let Err(err) =
                                    cache_index.db.upsert_thumbnail_entry(ThumbnailCacheUpsert {
                                        path_key: &path_key,
                                        category: "folder",
                                        hash: None,
                                        size: Some(child_data.len() as i64),
                                        source: Some("load_thumbnail_from_db/folder_bind"),
                                        blob_key: Some(&blob_key),
                                    })
                                {
                                    eprintln!("⚠️ 写入缩略图缓存索引失败: {}", err);
                                }
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

/// 批量从数据库加载缩略图（返回路径和 blob key 的映射）
#[tauri::command]
pub async fn batch_load_thumbnails_from_db(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<Vec<(String, String)>, String> {
    let state = app.state::<ThumbnailState>();
    let cache_index = app.state::<CacheIndexState>();

    let mut results = Vec::new();

    for path in paths {
        // 构建路径键
        let path_key = path.clone();

        // 确定类别（根据路径判断）
        let cat = if !path_key.contains("::") && !path_key.contains(".") {
            "folder"
        } else {
            "file"
        };

        // 尝试从数据库加载
        match state.db.load_thumbnail_by_key_and_category(&path_key, cat) {
            Ok(Some(data)) => {
                // 注册到 BlobRegistry，返回 blob key
                let blob_key = state.blob_registry.get_or_register(
                    &data,
                    "image/webp",
                    Duration::from_secs(3600),
                    Some(path_key.clone()),
                );
                if let Err(err) = cache_index.db.upsert_thumbnail_entry(ThumbnailCacheUpsert {
                    path_key: &path_key,
                    category: cat,
                    hash: None,
                    size: Some(data.len() as i64),
                    source: Some("batch_load_thumbnails_from_db"),
                    blob_key: Some(&blob_key),
                }) {
                    eprintln!("⚠️ 写入缩略图缓存索引失败: {}", err);
                }
                results.push((path, blob_key));
            }
            Ok(None) => {
                // 如果是文件夹且没有记录，尝试查找子文件
                if cat == "folder" {
                    if let Ok(Some((_, child_data))) =
                        state.db.find_earliest_thumbnail_in_path(&path_key)
                    {
                        // 保存到文件夹
                        if state
                            .db
                            .save_thumbnail_with_category(
                                &path_key,
                                0,
                                0,
                                &child_data,
                                Some("folder"),
                            )
                            .is_ok()
                        {
                            let blob_key = state.blob_registry.get_or_register(
                                &child_data,
                                "image/webp",
                                Duration::from_secs(3600),
                                Some(path_key.clone()),
                            );
                            if let Err(err) =
                                cache_index.db.upsert_thumbnail_entry(ThumbnailCacheUpsert {
                                    path_key: &path_key,
                                    category: "folder",
                                    hash: None,
                                    size: Some(child_data.len() as i64),
                                    source: Some("batch_load_thumbnails_from_db/folder_bind"),
                                    blob_key: Some(&blob_key),
                                })
                            {
                                eprintln!("⚠️ 写入缩略图缓存索引失败: {}", err);
                            }
                            results.push((path, blob_key));
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("❌ 批量加载缩略图失败 {}: {}", path, e);
            }
        }
    }

    Ok(results)
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderScanResult {
    pub folder: String,
    pub matched_path: Option<String>,
    pub matched_type: Option<String>,
    pub generated: bool,
    pub message: Option<String>,
}

#[derive(Clone, Copy)]
enum FolderMatchKind {
    Image,
    Archive,
}

/// 批量预加载缩略图索引（后台线程）
#[tauri::command]
pub async fn preload_thumbnail_index(
    app: tauri::AppHandle,
    entries: Vec<ThumbnailIndexRequest>,
) -> Result<Vec<ThumbnailIndexResult>, String> {
    let state = app.state::<ThumbnailState>();
    let cache_index = app.state::<CacheIndexState>();
    let thumb_db = Arc::clone(&state.db);
    let cache_db = Arc::clone(&cache_index.db);

    #[derive(Clone)]
    struct IndexPayload {
        path: String,
        path_key: String,
        category: String,
    }

    let payloads: Vec<IndexPayload> = entries
        .into_iter()
        .map(|entry| {
            let category = infer_category(&entry.path, entry.category);
            let original_path = entry.path;
            IndexPayload {
                path: original_path.clone(),
                path_key: original_path,
                category,
            }
        })
        .collect();

    let handle = tauri::async_runtime::spawn_blocking(move || {
        let lookup_pairs: Vec<(String, String)> = payloads
            .iter()
            .map(|p| (p.path_key.clone(), p.category.clone()))
            .collect();

        let cached = cache_db.lookup_thumbnail_entries(&lookup_pairs)?;
        let mut hit_set = HashSet::new();
        for entry in cached {
            hit_set.insert((entry.path_key, entry.category));
        }

        let mut responses = Vec::with_capacity(payloads.len());
        for payload in payloads {
            if hit_set.contains(&(payload.path_key.clone(), payload.category.clone())) {
                responses.push(ThumbnailIndexResult {
                    path: payload.path.clone(),
                    exists: true,
                });
                continue;
            }

            let exists = thumb_db
                .has_thumbnail_by_key_and_category(&payload.path_key, &payload.category)
                .map_err(|e| format!("检查缩略图失败: {}", e))?;

            if exists {
                let _ = cache_db.upsert_thumbnail_entry(ThumbnailCacheUpsert {
                    path_key: &payload.path_key,
                    category: &payload.category,
                    hash: None,
                    size: None,
                    source: Some("preload_thumbnail_index/backfill"),
                    blob_key: None,
                });
            }

            responses.push(ThumbnailIndexResult {
                path: payload.path,
                exists,
            });
        }

        Ok::<_, String>(responses)
    });

    handle
        .await
        .map_err(|e| format!("缩略图索引预加载任务失败: {}", e))?
}

/// 在 Rust 调度器中扫描文件夹并绑定缩略图
#[tauri::command]
pub async fn scan_folder_thumbnails(
    folders: Vec<String>,
    fs_state: State<'_, FsState>,
    thumb_state: State<'_, ThumbnailState>,
    cache_index: State<'_, CacheIndexState>,
    scheduler: State<'_, BackgroundSchedulerState>,
) -> Result<Vec<FolderScanResult>, String> {
    if folders.is_empty() {
        return Ok(Vec::new());
    }

    let fs_manager = Arc::clone(&fs_state.fs_manager);
    let generator: Arc<Mutex<ThumbnailGenerator>> = Arc::clone(&thumb_state.generator);
    let thumb_db: Arc<ThumbnailDb> = Arc::clone(&thumb_state.db);
    let cache_db: Arc<CacheIndexDb> = Arc::clone(&cache_index.db);

    let mut results = Vec::with_capacity(folders.len());

    for folder in folders {
        let fs_manager = Arc::clone(&fs_manager);
        let generator = Arc::clone(&generator);
        let thumb_db = Arc::clone(&thumb_db);
        let cache_db = Arc::clone(&cache_db);
        let folder_path = folder.clone();

        let result: FolderScanResult = scheduler
            .scheduler
            .enqueue_blocking(
                "filebrowser-folder-scan",
                folder_path.clone(),
                move || -> Result<FolderScanResult, String> {
                    match find_candidate_for_folder(&fs_manager, &folder_path)? {
                        None => Ok(FolderScanResult {
                            folder: folder_path,
                            matched_path: None,
                            matched_type: None,
                            generated: false,
                            message: Some("未找到图片或压缩包".to_string()),
                        }),
                        Some((target_path, match_kind)) => {
                            let thumbnail_data = {
                                let guard = generator
                                    .lock()
                                    .map_err(|e| format!("获取缩略图生成器锁失败: {}", e))?;
                                match match_kind {
                                    FolderMatchKind::Image => {
                                        guard.generate_file_thumbnail(&target_path)
                                    }
                                    FolderMatchKind::Archive => {
                                        guard.generate_archive_thumbnail(&target_path)
                                    }
                                }
                            }?;

                            // 将结果写入 folder 记录
                            if let Err(err) = thumb_db.save_thumbnail_with_category(
                                &folder_path,
                                0,
                                0,
                                &thumbnail_data,
                                Some("folder"),
                            ) {
                                eprintln!("⚠️ 保存文件夹缩略图失败: {} - {}", folder_path, err);
                            }

                            let _ = cache_db.upsert_thumbnail_entry(ThumbnailCacheUpsert {
                                path_key: &folder_path,
                                category: "folder",
                                hash: None,
                                size: Some(thumbnail_data.len() as i64),
                                source: Some("scan_folder_thumbnails"),
                                blob_key: None,
                            });

                            Ok(FolderScanResult {
                                folder: folder_path,
                                matched_path: Some(target_path),
                                matched_type: Some(match_kind.to_string()),
                                generated: true,
                                message: None,
                            })
                        }
                    }
                },
            )
            .await?;

        results.push(result);
    }

    Ok(results)
}

impl FolderMatchKind {
    fn as_str(&self) -> &'static str {
        match self {
            FolderMatchKind::Image => "image",
            FolderMatchKind::Archive => "archive",
        }
    }
}

impl ToString for FolderMatchKind {
    fn to_string(&self) -> String {
        self.as_str().to_string()
    }
}

fn find_candidate_for_folder(
    fs_manager: &Arc<Mutex<FsManager>>,
    folder_path: &str,
) -> Result<Option<(String, FolderMatchKind)>, String> {
    let mut queue = vec![(folder_path.to_string(), 0usize)];

    while let Some((current_path, depth)) = queue.pop() {
        let items = read_directory_items(fs_manager, &current_path)?;

        if let Some(image) = items.iter().find(|item| !item.is_dir && item.is_image) {
            return Ok(Some((image.path.clone(), FolderMatchKind::Image)));
        }

        if let Some(archive) = items
            .iter()
            .find(|item| !item.is_dir && is_archive_path(&item.path))
        {
            return Ok(Some((archive.path.clone(), FolderMatchKind::Archive)));
        }

        if depth == 0 {
            if let Some(subfolder) = items.iter().find(|item| item.is_dir) {
                queue.push((subfolder.path.clone(), depth + 1));
            }
        }
    }

    Ok(None)
}

fn read_directory_items(
    fs_manager: &Arc<Mutex<FsManager>>,
    path: &str,
) -> Result<Vec<FsItem>, String> {
    let path_buf = PathBuf::from(path);
    let manager = fs_manager
        .lock()
        .map_err(|e| format!("获取 FsManager 锁失败: {}", e))?;
    manager.read_directory(&path_buf)
}

fn is_archive_path(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            matches!(
                ext.to_lowercase().as_str(),
                "zip" | "cbz" | "rar" | "cbr" | "7z" | "cb7"
            )
        })
        .unwrap_or(false)
}
