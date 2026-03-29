//! 文件系统缓存操作命令

use super::types::{
    BatchDirectorySnapshotResult, DirectoryPageOptions, DirectoryPageResult,
    DirectorySnapshotResponse, DirectoryStreamOptions, DirectoryStreamStartResult, FileInfo,
    StreamBatchResult,
};
use super::{CacheIndexState, DirectoryCacheState, FsState};
use crate::commands::task_queue_commands::BackgroundSchedulerState;
use crate::core::cache_index_db::{CacheGcResult, CacheIndexStats};
use crate::core::fs_manager::FsItem;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::UNIX_EPOCH;
use tauri::State;

// 全局流ID计数器
static STREAM_COUNTER: AtomicU64 = AtomicU64::new(0);

// 流状态管理
static STREAMS: LazyLock<Mutex<HashMap<String, DirectoryStream>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Debug)]
struct DirectoryStream {
    id: String,
    path: PathBuf,
    entries: Vec<PathBuf>,
    current_index: usize,
    batch_size: usize,
    total: usize,
}

fn directory_mtime(path: &Path) -> Option<u64> {
    let metadata = fs::metadata(path).ok()?;
    metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
}

/// 加载目录快照
#[tauri::command]
pub async fn load_directory_snapshot(
    path: String,
    state: State<'_, FsState>,
    cache_state: State<'_, DirectoryCacheState>,
    cache_index: State<'_, CacheIndexState>,
    scheduler: State<'_, BackgroundSchedulerState>,
) -> Result<DirectorySnapshotResponse, String> {
    let path_buf = PathBuf::from(&path);
    let mtime = directory_mtime(&path_buf);

    // 内存缓存
    {
        let mut cache = cache_state.cache.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(entry) = cache.get(&path, mtime) {
            println!(
                "📁 DirectorySnapshot 命中内存缓存: {} (entries={})",
                path,
                entry.items.len()
            );
            return Ok(DirectorySnapshotResponse {
                items: entry.items,
                mtime: entry.mtime,
                cached: true,
            });
        }
    }

    // SQLite 缓存
    if let Some(persisted_items) = cache_index.db.load_directory_snapshot(&path, mtime)? {
        {
            let mut cache = cache_state.cache.lock().unwrap_or_else(|e| e.into_inner());
            cache.insert(path.clone(), persisted_items.clone(), mtime);
        }
        return Ok(DirectorySnapshotResponse {
            items: persisted_items,
            mtime,
            cached: true,
        });
    }

    // 文件系统读取
    println!(
        "📁 DirectorySnapshot miss: {} -> 调度 filebrowser-directory-load",
        path
    );
    let fs_manager = Arc::clone(&state.fs_manager);
    let job_path = path.clone();
    let path_for_job = path_buf.clone();
    let items: Vec<FsItem> = scheduler
        .scheduler
        .enqueue_blocking(
            "filebrowser-directory-load",
            job_path,
            move || -> Result<Vec<FsItem>, String> { fs_manager.read_directory_with_stats(&path_for_job) },
        )
        .await?;

    {
        let mut cache = cache_state.cache.lock().unwrap_or_else(|e| e.into_inner());
        cache.insert(path.clone(), items.clone(), mtime);
    }
    cache_index
        .db
        .save_directory_snapshot(&path, mtime, &items)?;

    Ok(DirectorySnapshotResponse {
        items,
        mtime,
        cached: false,
    })
}

/// 批量并发加载多个目录快照
#[tauri::command]
pub async fn batch_load_directory_snapshots(
    paths: Vec<String>,
    state: State<'_, FsState>,
    cache_state: State<'_, DirectoryCacheState>,
    cache_index: State<'_, CacheIndexState>,
    scheduler: State<'_, BackgroundSchedulerState>,
) -> Result<Vec<BatchDirectorySnapshotResult>, String> {
    use futures::future::join_all;

    let fs_manager = Arc::clone(&state.fs_manager);
    let cache_index_db = Arc::clone(&cache_index.db);
    let _ = &scheduler;

    let mut results: Vec<BatchDirectorySnapshotResult> = Vec::with_capacity(paths.len());
    let mut pending_loads: Vec<(usize, String, PathBuf, Option<u64>)> = Vec::new();

    for (idx, path) in paths.iter().enumerate() {
        let path_buf = PathBuf::from(path);
        let mtime = directory_mtime(&path_buf);

        // 1. 检查内存缓存
        {
            let mut cache = cache_state.cache.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(entry) = cache.get(path, mtime) {
                results.push(BatchDirectorySnapshotResult {
                    path: path.clone(),
                    snapshot: Some(DirectorySnapshotResponse {
                        items: entry.items,
                        mtime: entry.mtime,
                        cached: true,
                    }),
                    error: None,
                });
                continue;
            }
        }

        // 2. 检查 SQLite 缓存
        match cache_index_db.load_directory_snapshot(path, mtime) {
            Ok(Some(persisted_items)) => {
                {
                    let mut cache = cache_state.cache.lock().unwrap_or_else(|e| e.into_inner());
                    cache.insert(path.clone(), persisted_items.clone(), mtime);
                }
                results.push(BatchDirectorySnapshotResult {
                    path: path.clone(),
                    snapshot: Some(DirectorySnapshotResponse {
                        items: persisted_items,
                        mtime,
                        cached: true,
                    }),
                    error: None,
                });
                continue;
            }
            Ok(None) => {
                pending_loads.push((idx, path.clone(), path_buf, mtime));
                results.push(BatchDirectorySnapshotResult {
                    path: path.clone(),
                    snapshot: None,
                    error: None,
                });
            }
            Err(e) => {
                results.push(BatchDirectorySnapshotResult {
                    path: path.clone(),
                    snapshot: None,
                    error: Some(e),
                });
            }
        }
    }

    if pending_loads.is_empty() {
        return Ok(results);
    }

    println!(
        "📁 BatchDirectorySnapshot: {} miss, {} 命中缓存 -> 并发加载",
        pending_loads.len(),
        paths.len() - pending_loads.len()
    );

    // 3. 并发加载所有 miss 的目录
    let futures: Vec<_> = pending_loads
        .into_iter()
        .map(|(idx, path, path_buf, mtime)| {
            let fs_manager = Arc::clone(&fs_manager);
            let cache_index_db = Arc::clone(&cache_index_db);
            let cache_state_inner = cache_state.inner();

            async move {
                let load_result = tauri::async_runtime::spawn_blocking(move || {
                    fs_manager.read_directory(&path_buf)
                })
                .await;

                let result = match load_result {
                    Ok(Ok(items)) => {
                        {
                            let mut cache = cache_state_inner
                                .cache
                                .lock()
                                .unwrap_or_else(|e| e.into_inner());
                            cache.insert(path.clone(), items.clone(), mtime);
                        }
                        let _ = cache_index_db.save_directory_snapshot(&path, mtime, &items);

                        BatchDirectorySnapshotResult {
                            path,
                            snapshot: Some(DirectorySnapshotResponse {
                                items,
                                mtime,
                                cached: false,
                            }),
                            error: None,
                        }
                    }
                    Ok(Err(e)) => BatchDirectorySnapshotResult {
                        path,
                        snapshot: None,
                        error: Some(e),
                    },
                    Err(e) => BatchDirectorySnapshotResult {
                        path,
                        snapshot: None,
                        error: Some(format!("spawn_blocking error: {}", e)),
                    },
                };
                (idx, result)
            }
        })
        .collect();

    let loaded: Vec<(usize, BatchDirectorySnapshotResult)> = join_all(futures).await;

    for (idx, result) in loaded {
        results[idx] = result;
    }

    Ok(results)
}

/// 分页浏览目录
#[tauri::command]
pub async fn browse_directory_page(
    path: String,
    state: State<'_, FsState>,
    options: Option<DirectoryPageOptions>,
) -> Result<DirectoryPageResult, String> {
    let options = options.unwrap_or_default();
    let path = Path::new(&path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }

    let mut entries: Vec<PathBuf> = std::fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect();

    sort_entries(&mut entries, &options.sort_by, &options.sort_order);

    let total = entries.len();
    let offset = options.offset.unwrap_or(0);
    let limit = options.limit.unwrap_or(100);

    let page_entries: Vec<PathBuf> = entries.into_iter().skip(offset).take(limit).collect();
    let fs_manager = &state.fs_manager;
    let mut items = Vec::new();
    for entry_path in page_entries {
        if let Ok(item) = fs_manager.read_item_with_stats(&entry_path) {
            items.push(item);
        }
    }

    let has_more = offset + items.len() < total;
    let next_offset = if has_more {
        Some(offset + items.len())
    } else {
        None
    };

    Ok(DirectoryPageResult {
        items,
        total,
        has_more,
        next_offset,
    })
}

/// 启动目录流
#[tauri::command]
pub async fn start_directory_stream(
    path: String,
    state: State<'_, FsState>,
    options: Option<DirectoryStreamOptions>,
) -> Result<DirectoryStreamStartResult, String> {
    let options = options.unwrap_or_default();
    let path = Path::new(&path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }

    let mut entries: Vec<PathBuf> = std::fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect();

    sort_entries(&mut entries, &options.sort_by, &options.sort_order);

    let total = entries.len();
    let batch_size = options.batch_size.unwrap_or(50);
    let stream_id = format!("stream_{}", STREAM_COUNTER.fetch_add(1, Ordering::SeqCst));

    let initial_batch: Vec<PathBuf> = entries.iter().take(batch_size).cloned().collect();

    let mut initial_items = Vec::new();
    {
        let fs_manager = &state.fs_manager;
        for entry_path in initial_batch {
            if let Ok(item) = fs_manager.read_item_with_stats(&entry_path) {
                initial_items.push(item);
            }
        }
    }

    let has_more = batch_size < total;

    let stream = DirectoryStream {
        id: stream_id.clone(),
        path: path.to_path_buf(),
        entries,
        current_index: batch_size,
        batch_size,
        total,
    };

    let mut streams = STREAMS.lock().unwrap();
    streams.insert(stream_id.clone(), stream);

    Ok(DirectoryStreamStartResult {
        stream_id,
        initial_batch: initial_items,
        total,
        has_more,
    })
}

/// 获取流的下一批数据
#[tauri::command]
pub async fn get_next_stream_batch(
    stream_id: String,
    state: State<'_, FsState>,
) -> Result<StreamBatchResult, String> {
    let mut streams = STREAMS.lock().unwrap();

    if let Some(stream) = streams.get_mut(&stream_id) {
        if stream.current_index >= stream.entries.len() {
            return Ok(StreamBatchResult {
                items: vec![],
                has_more: false,
            });
        }

        let next_index = (stream.current_index + stream.batch_size).min(stream.entries.len());
        let batch: Vec<PathBuf> = stream.entries[stream.current_index..next_index]
            .iter()
            .cloned()
            .collect();

        stream.current_index = next_index;
        let has_more = stream.current_index < stream.entries.len();

        let mut items = Vec::new();
        {
            let fs_manager = &state.fs_manager;
            for entry_path in batch {
                if let Ok(item) = fs_manager.read_item_with_stats(&entry_path) {
                    items.push(item);
                }
            }
        }

        Ok(StreamBatchResult { items, has_more })
    } else {
        Err(format!("Stream not found: {}", stream_id))
    }
}

/// 取消目录流
#[tauri::command]
pub async fn cancel_directory_stream(stream_id: String) -> Result<(), String> {
    let mut streams = STREAMS.lock().unwrap();
    if streams.remove(&stream_id).is_some() {
        Ok(())
    } else {
        Err(format!("Stream not found: {}", stream_id))
    }
}

/// 缓存索引统计
#[tauri::command]
pub async fn cache_index_stats(
    cache_index: State<'_, CacheIndexState>,
) -> Result<CacheIndexStats, String> {
    cache_index.db.stats()
}

/// 触发缓存 GC
#[tauri::command]
pub async fn cache_index_gc(
    cache_index: State<'_, CacheIndexState>,
) -> Result<CacheGcResult, String> {
    cache_index.db.run_gc()
}

/// 将缓存 GC 提交到后台调度器
#[tauri::command]
pub async fn enqueue_cache_maintenance(
    cache_index: State<'_, CacheIndexState>,
    scheduler: State<'_, BackgroundSchedulerState>,
) -> Result<CacheGcResult, String> {
    let db = Arc::clone(&cache_index.db);
    scheduler
        .scheduler
        .enqueue_blocking(
            "cache-maintenance",
            "cache_index_gc",
            move || -> Result<CacheGcResult, String> { db.run_gc().map_err(|e| e) },
        )
        .await
}

// 辅助函数

fn sort_entries(entries: &mut Vec<PathBuf>, sort_by: &Option<String>, sort_order: &Option<String>) {
    let sort_by = sort_by.as_ref().map(|s| s.as_str()).unwrap_or("name");
    let sort_ascending = sort_order.as_ref().map(|s| s.as_str()).unwrap_or("asc") == "asc";

    entries.sort_by(|a, b| {
        let a_name = a.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let b_name = b.file_name().and_then(|n| n.to_str()).unwrap_or("");

        let comparison = match sort_by {
            "name" => a_name.cmp(&b_name),
            "size" => {
                let a_size = a.metadata().ok().map(|m| m.len()).unwrap_or(0);
                let b_size = b.metadata().ok().map(|m| m.len()).unwrap_or(0);
                a_size.cmp(&b_size)
            }
            "modified" => {
                let a_modified = a.metadata().ok().and_then(|m| m.modified().ok());
                let b_modified = b.metadata().ok().and_then(|m| m.modified().ok());
                a_modified.cmp(&b_modified)
            }
            _ => a_name.cmp(&b_name),
        };

        if sort_ascending {
            comparison
        } else {
            comparison.reverse()
        }
    });
}

fn convert_paths_to_file_info(paths: Vec<PathBuf>) -> Result<Vec<FileInfo>, String> {
    let mut items = Vec::new();

    for path in paths {
        let metadata = std::fs::metadata(&path)
            .map_err(|e| format!("Failed to read metadata for {}: {}", path.display(), e))?;

        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let size = if metadata.is_file() {
            Some(metadata.len())
        } else {
            None
        };

        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.elapsed().ok())
            .map(|duration| {
                let secs = duration.as_secs();
                format!("{} seconds ago", secs)
            });

        items.push(FileInfo {
            name,
            path: path.to_string_lossy().to_string(),
            is_directory: metadata.is_dir(),
            size,
            modified,
        });
    }

    Ok(items)
}
