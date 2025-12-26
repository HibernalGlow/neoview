//! 缩略图生成命令
//! 包含文件、压缩包、视频缩略图生成功能

use super::super::fs_commands::CacheIndexState;
use super::super::task_queue_commands::BackgroundSchedulerState;
use super::{infer_category, ThumbnailState};
use crate::core::cache_index_db::ThumbnailCacheUpsert;
use crate::core::video_exts;
use crate::core::video_thumbnail::VideoThumbnailGenerator;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::Manager;

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

    let state = app
        .try_state::<ThumbnailState>()
        .ok_or_else(|| "缩略图服务未初始化，请先调用 init_thumbnail_manager".to_string())?;
    let cache_index = app
        .try_state::<CacheIndexState>()
        .ok_or_else(|| "缓存索引服务未初始化".to_string())?;
    let scheduler = app
        .try_state::<BackgroundSchedulerState>()
        .ok_or_else(|| "后台调度器未初始化".to_string())?;
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
    let state = app
        .try_state::<ThumbnailState>()
        .ok_or_else(|| "缩略图服务未初始化，请先调用 init_thumbnail_manager".to_string())?;
    let cache_index = app
        .try_state::<CacheIndexState>()
        .ok_or_else(|| "缓存索引服务未初始化".to_string())?;
    let scheduler = app
        .try_state::<BackgroundSchedulerState>()
        .ok_or_else(|| "后台调度器未初始化".to_string())?;
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

    let state = app
        .try_state::<ThumbnailState>()
        .ok_or_else(|| "缩略图服务未初始化，请先调用 init_thumbnail_manager".to_string())?;
    let cache_index = app
        .try_state::<CacheIndexState>()
        .ok_or_else(|| "缓存索引服务未初始化".to_string())?;
    let scheduler = app
        .try_state::<BackgroundSchedulerState>()
        .ok_or_else(|| "后台调度器未初始化".to_string())?;
    let job_source = format!("video:{}", video_path);
    let time = time_seconds.unwrap_or(10.0);

    // 检查是否为视频文件
    let path = Path::new(&video_path);
    if !video_exts::is_video_path(path) {
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

/// 保存文件夹缩略图（前端主动调用）
#[tauri::command]
pub async fn save_folder_thumbnail(
    app: tauri::AppHandle,
    folder_path: String,
    thumbnail_data: Vec<u8>,
) -> Result<String, String> {
    let state = app.state::<ThumbnailState>();
    let cache_index = app.state::<CacheIndexState>();

    // 注册到 BlobRegistry
    let blob_key = state.blob_registry.get_or_register(
        &thumbnail_data,
        "image/webp",
        Duration::from_secs(3600), // 1小时 TTL
        Some(folder_path.clone()),
    );

    // 保存到数据库（参数顺序：key, size, ghash, data, category）
    state
        .db
        .save_thumbnail_with_category(
            &folder_path,
            0, // size 不使用
            0, // ghash 不使用
            &thumbnail_data,
            Some("folder"),
        )
        .map_err(|e| format!("保存文件夹缩略图失败: {}", e))?;

    // 写入缓存索引
    if let Err(err) = cache_index.db.upsert_thumbnail_entry(ThumbnailCacheUpsert {
        path_key: &folder_path,
        category: "folder",
        hash: None,
        size: Some(thumbnail_data.len() as i64),
        source: Some("save_folder_thumbnail"),
        blob_key: Some(&blob_key),
    }) {
        eprintln!("⚠️ 写入文件夹缩略图缓存索引失败: {}", err);
    }

    Ok(blob_key)
}
