//! 批量缩略图操作命令
//! 包含批量预加载、批量加载、索引预加载、文件夹扫描等功能

use super::super::fs_commands::{CacheIndexState, FsState};
use super::super::task_queue_commands::BackgroundSchedulerState;
use super::types::{
    FolderMatchKind, FolderScanResult, ThumbnailIndexRequest, ThumbnailIndexResult,
};
use super::{infer_category, ThumbnailState};
use crate::core::cache_index_db::{CacheIndexDb, ThumbnailCacheUpsert};
use crate::core::fs_manager::{FsItem, FsManager};
use crate::core::thumbnail_db::ThumbnailDb;
use crate::core::thumbnail_generator::ThumbnailGenerator;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Manager, State};

/// 批量预加载缩略图（返回 blob keys）
#[tauri::command]
pub async fn batch_preload_thumbnails(
    app: tauri::AppHandle,
    paths: Vec<String>,
    is_archive: bool,
) -> Result<Vec<(String, String)>, String> {
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
    let generator = Arc::clone(&thumb_state.generator);
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
                                match match_kind {
                                    FolderMatchKind::Image => {
                                        generator.generate_file_thumbnail(&target_path)
                                    }
                                    FolderMatchKind::Archive => {
                                        generator.generate_archive_thumbnail(&target_path)
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

// ==================== 辅助函数 ====================

/// 在文件夹中查找候选文件（图片或压缩包）
pub fn find_candidate_for_folder(
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

/// 读取目录内容
pub fn read_directory_items(
    fs_manager: &Arc<Mutex<FsManager>>,
    path: &str,
) -> Result<Vec<FsItem>, String> {
    let path_buf = PathBuf::from(path);
    let manager = fs_manager
        .lock()
        .map_err(|e| format!("获取 FsManager 锁失败: {}", e))?;
    manager.read_directory(&path_buf)
}

/// 检查路径是否为压缩包
pub fn is_archive_path(path: &str) -> bool {
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
