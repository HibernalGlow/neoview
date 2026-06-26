//! 缩略图检索命令
//! 包含缩略图存在性检查和加载功能

use super::super::fs_commands::CacheIndexState;
use super::ThumbnailState;
use crate::core::cache_index_db::ThumbnailCacheUpsert;
use std::time::Duration;
use tauri::Manager;

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

/// 加载缩略图并返回 emm_json（一次查询同时返回两者）
#[tauri::command]
pub async fn load_thumbnail_with_emm_json(
    app: tauri::AppHandle,
    path: String,
    category: Option<String>,
) -> Result<Option<(String, Option<String>)>, String> {
    let state = app.state::<ThumbnailState>();

    let cat = category.unwrap_or_else(|| {
        if !path.contains("::") && !path.contains(".") {
            "folder".to_string()
        } else {
            "file".to_string()
        }
    });

    match state.db.load_thumbnail_with_emm_json(&path, &cat) {
        Ok(Some((data, emm_json))) => {
            // 注册到 BlobRegistry，返回 blob key 和 emm_json
            let blob_key = state.blob_registry.get_or_register(
                &data,
                "image/webp",
                Duration::from_secs(3600),
                Some(path.clone()),
            );
            Ok(Some((blob_key, emm_json)))
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

/// 获取文件夹多图预览候选图片路径。实际缩略图生成交给 V4 统一缩略图服务。
#[tauri::command]
pub async fn get_folder_preview_image_paths(
    folder_path: String,
    count: Option<usize>,
) -> Result<Vec<String>, String> {
    use crate::core::thumbnail_service_v3::generators::get_folder_preview_images;

    let max_count = count.unwrap_or(4).clamp(1, 16);
    tauri::async_runtime::spawn_blocking(move || get_folder_preview_images(&folder_path, max_count))
        .await
        .map_err(|e| format!("获取文件夹预览图片路径失败: {}", e))?
}

/// 获取文件夹预览图（多图预览）
/// 返回前 N 张图片的缩略图 blob keys
/// count == 1 时优先返回封面；count > 1 时返回多张图片（封面作为第一张）
#[tauri::command]
pub async fn get_folder_preview_candidates_v2(
    folder_path: String,
    count: Option<usize>,
    max_depth: Option<u32>,
    max_visited_dirs: Option<usize>,
    max_entries_per_dir: Option<usize>,
    budget_ms: Option<u64>,
) -> Result<Vec<crate::core::thumbnail_service_v3::generators::FolderPreviewCandidate>, String> {
    use crate::core::thumbnail_service_v3::generators::{
        get_folder_preview_candidates_v2 as scan_folder_preview_candidates_v2,
    };

    let max_count = count.unwrap_or(4).clamp(1, 16);
    let max_depth = max_depth.unwrap_or(8).clamp(1, 16);
    let max_visited_dirs = max_visited_dirs.unwrap_or(96).clamp(1, 512);
    let max_entries_per_dir = max_entries_per_dir.unwrap_or(768).clamp(32, 4096);
    let budget_ms = budget_ms.unwrap_or(120).clamp(20, 500);

    tauri::async_runtime::spawn_blocking(move || {
        scan_folder_preview_candidates_v2(
            &folder_path,
            max_count,
            max_depth,
            max_visited_dirs,
            max_entries_per_dir,
            budget_ms,
        )
    })
    .await
    .map_err(|e| format!("鑾峰彇鏂囦欢澶归瑙堝€欓€夊け璐? {}", e))?
}

#[tauri::command]
pub async fn get_folder_preview_thumbnails(
    app: tauri::AppHandle,
    folder_path: String,
    count: Option<usize>,
) -> Result<Vec<String>, String> {
    use crate::core::thumbnail_service_v3::generators::get_folder_preview_images;
    use std::time::Duration;

    let state = app.state::<ThumbnailState>();
    let max_count = count.unwrap_or(4).clamp(1, 16);

    // 获取文件夹中的前 N 张图片路径
    let image_paths = get_folder_preview_images(&folder_path, max_count)?;

    if image_paths.is_empty() {
        return Ok(vec![]);
    }

    let mut blob_keys = Vec::with_capacity(image_paths.len());

    for path in image_paths {
        // 先尝试从数据库加载
        let path_key = path.clone();

        match state
            .db
            .load_thumbnail_by_key_and_category(&path_key, "file")
        {
            Ok(Some(data)) => {
                // 注册到 BlobRegistry
                let blob_key = state.blob_registry.get_or_register(
                    &data,
                    "image/webp",
                    Duration::from_secs(3600),
                    Some(path.clone()),
                );
                blob_keys.push(blob_key);
            }
            _ => {
                // 数据库没有缓存，需要生成
                match state.generator.generate_file_thumbnail(&path) {
                    Ok(data) => {
                        if !data.is_empty() {
                            // 保存到数据库
                            let _ = state.db.save_thumbnail_with_category(
                                &path_key,
                                0,
                                0,
                                &data,
                                Some("file"),
                            );

                            // 注册到 BlobRegistry
                            let blob_key = state.blob_registry.get_or_register(
                                &data,
                                "image/webp",
                                Duration::from_secs(3600),
                                Some(path.clone()),
                            );
                            blob_keys.push(blob_key);
                        }
                    }
                    Err(e) => {
                        println!("⚠️ 生成预览图失败: {} - {}", path, e);
                    }
                }
            }
        }
    }

    Ok(blob_keys)
}
