//! NeoView - File System Commands
//! 文件系统操作相关的 Tauri 命令

use super::task_queue_commands::BackgroundSchedulerState;
use crate::core::cache_index_db::{CacheGcResult, CacheIndexDb, CacheIndexStats};
use crate::core::directory_cache::DirectoryCache;
use crate::core::fs_manager::FsItem;
use crate::core::{ArchiveManager, FsManager};
use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::Mutex;
use std::time::SystemTime;
use std::time::UNIX_EPOCH;
use tauri::async_runtime::spawn_blocking;
use tauri::State;

/// 文件系统状态
pub struct FsState {
    pub fs_manager: Arc<Mutex<FsManager>>,
    pub archive_manager: Arc<Mutex<ArchiveManager>>,
}

/// 目录缓存状态（内存 LRU）
pub struct DirectoryCacheState {
    pub cache: Mutex<DirectoryCache>,
}

/// 缓存索引状态（SQLite）
pub struct CacheIndexState {
    pub db: Arc<CacheIndexDb>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: Option<u64>,
    pub modified: Option<String>,
}

#[tauri::command]
pub async fn read_directory(
    path: String,
    excluded_paths: Option<Vec<String>>,
) -> Result<Vec<FileInfo>, String> {
    let path = Path::new(&path);
    let excluded = excluded_paths.unwrap_or_default();

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }

    let mut entries = Vec::new();

    let read_dir = fs::read_dir(path).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in read_dir {
        // 优雅处理权限错误
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                log::debug!("跳过无法读取的条目: {}", e);
                continue;
            }
        };
        
        let entry_path = entry.path();
        let path_str = entry_path.to_string_lossy().to_string();
        
        // 检查是否在排除列表中（规范化路径进行比较）
        let normalized_path = path_str.replace('/', "\\");
        let is_excluded = excluded.iter().any(|ex| {
            let normalized_ex = ex.replace('/', "\\");
            normalized_path == normalized_ex 
                || normalized_path.starts_with(&format!("{}\\", normalized_ex))
        });
        
        if is_excluded {
            continue;
        }
        
        // 优雅处理元数据获取失败
        let metadata = match entry.metadata() {
            Ok(m) => Some(m),
            Err(e) => {
                log::debug!("跳过无法获取元数据的条目 {:?}: {}", entry_path, e);
                continue;
            }
        };

        let file_info = FileInfo {
            name: entry_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown")
                .to_string(),
            path: path_str,
            is_directory: entry_path.is_dir(),
            size: metadata.as_ref().map(|m| m.len()),
            modified: metadata
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs().to_string()),
        };

        entries.push(file_info);
    }

    // 按名称排序，目录在前
    entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    Ok(entries)
}

#[tauri::command]
pub async fn get_file_info(path: String) -> Result<FileInfo, String> {
    let path = Path::new(&path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    let metadata = fs::metadata(path).map_err(|e| format!("Failed to get file metadata: {}", e))?;

    Ok(FileInfo {
        name: path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unknown")
            .to_string(),
        path: path.to_string_lossy().to_string(),
        is_directory: path.is_dir(),
        size: Some(metadata.len()),
        modified: metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs().to_string()),
    })
}

#[tauri::command]
pub async fn path_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

/// 读取文本文件内容
#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    let path = Path::new(&path);
    
    if !path.exists() {
        return Err(format!("文件不存在: {}", path.display()));
    }
    
    fs::read_to_string(path).map_err(|e| format!("读取文件失败: {}", e))
}

/// 浏览目录内容（使用新的 FsManager）
#[tauri::command]
pub async fn browse_directory(
    path: String,
    state: State<'_, FsState>,
) -> Result<Vec<crate::core::fs_manager::FsItem>, String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path = PathBuf::from(path);
    fs_manager.read_directory(&path)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectorySnapshotResponse {
    pub items: Vec<FsItem>,
    pub mtime: Option<u64>,
    pub cached: bool,
}

fn directory_mtime(path: &Path) -> Option<u64> {
    let metadata = fs::metadata(path).ok()?;
    metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
}

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
        // 使用 unwrap_or_else 恢复被污染的锁
        let mut cache = cache_state
            .cache
            .lock()
            .unwrap_or_else(|e| e.into_inner());
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
        // println!(
        //     "📁 DirectorySnapshot 命中 SQLite 缓存: {} (entries={})",
        //     path,
        //     persisted_items.len()
        // );
        {
            // 使用 unwrap_or_else 恢复被污染的锁
            let mut cache = cache_state
                .cache
                .lock()
                .unwrap_or_else(|e| e.into_inner());
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
            move || -> Result<Vec<FsItem>, String> {
                // 使用 unwrap_or_else 恢复被污染的锁
                let fs_manager = fs_manager
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                fs_manager.read_directory(&path_for_job)
            },
        )
        .await?;

    {
        // 使用 unwrap_or_else 恢复被污染的锁
        let mut cache = cache_state
            .cache
            .lock()
            .unwrap_or_else(|e| e.into_inner());
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
/// 使用 tokio::spawn 并发执行，避免串行阻塞
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDirectorySnapshotResult {
    pub path: String,
    pub snapshot: Option<DirectorySnapshotResponse>,
    pub error: Option<String>,
}

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
    // scheduler 参数保留用于未来扩展
    let _ = &scheduler;

    // 收集需要从文件系统加载的路径（缓存 miss）
    let mut results: Vec<BatchDirectorySnapshotResult> = Vec::with_capacity(paths.len());
    let mut pending_loads: Vec<(usize, String, PathBuf, Option<u64>)> = Vec::new();

    for (idx, path) in paths.iter().enumerate() {
        let path_buf = PathBuf::from(path);
        let mtime = directory_mtime(&path_buf);

        // 1. 检查内存缓存
        {
            let mut cache = cache_state
                .cache
                .lock()
                .unwrap_or_else(|e| e.into_inner());
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
                // 回填内存缓存
                {
                    let mut cache = cache_state
                        .cache
                        .lock()
                        .unwrap_or_else(|e| e.into_inner());
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
                // 需要从文件系统加载
                pending_loads.push((idx, path.clone(), path_buf, mtime));
                // 占位
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
            let cache_state_inner = cache_state.inner().clone();

            async move {
                // 使用 spawn_blocking 避免阻塞 tokio 线程
                let load_result = tauri::async_runtime::spawn_blocking(move || {
                    let fs = fs_manager.lock().unwrap_or_else(|e| e.into_inner());
                    fs.read_directory(&path_buf)
                })
                .await;

                let result = match load_result {
                    Ok(Ok(items)) => {
                        // 回填缓存
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

    // 并发执行所有加载任务
    let loaded: Vec<(usize, BatchDirectorySnapshotResult)> = join_all(futures).await;

    // 合并结果
    for (idx, result) in loaded {
        results[idx] = result;
    }

    Ok(results)
}

/// 获取目录中的所有图片
#[tauri::command]
pub async fn get_images_in_directory(
    path: String,
    recursive: bool,
    state: State<'_, FsState>,
) -> Result<Vec<String>, String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path = PathBuf::from(path);
    let images = fs_manager.get_images_in_directory(&path, recursive)?;

    Ok(images
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

/// 获取单个文件/文件夹的元数据（包含创建/修改时间）
#[tauri::command]
pub async fn get_file_metadata(
    path: String,
    state: State<'_, FsState>,
) -> Result<crate::core::fs_manager::FsItem, String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path = PathBuf::from(path);
    fs_manager.get_file_metadata(&path)
}

/// 创建目录
#[tauri::command]
pub async fn create_directory(path: String, state: State<'_, FsState>) -> Result<(), String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path = PathBuf::from(path);
    fs_manager.create_directory(&path)
}

/// 删除文件或目录
#[tauri::command]
pub async fn delete_path(path: String, state: State<'_, FsState>) -> Result<(), String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path = PathBuf::from(path);
    fs_manager.delete(&path)
}

/// 重命名文件或目录
#[tauri::command]
pub async fn rename_path(
    from: String,
    to: String,
    state: State<'_, FsState>,
) -> Result<(), String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let from_path = PathBuf::from(from);
    let to_path = PathBuf::from(to);
    fs_manager.rename(&from_path, &to_path)
}

/// 移动到回收站
#[tauri::command]
pub async fn move_to_trash(path: String, state: State<'_, FsState>) -> Result<(), String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path = PathBuf::from(path);
    fs_manager.move_to_trash(&path)
}

// ===== 压缩包相关命令 =====

/// 列出压缩包内容
#[tauri::command]
pub async fn list_archive_contents(
    archive_path: String,
    state: State<'_, FsState>,
) -> Result<Vec<crate::core::archive::ArchiveEntry>, String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let archive_manager = state
        .archive_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path = PathBuf::from(archive_path);
    // 使用 list_contents 自动检测格式（支持 ZIP/RAR/7z）
    archive_manager.list_contents(&path)
}

/// 删除压缩包中的指定条目
#[tauri::command]
pub async fn delete_archive_entry(
    archive_path: String,
    inner_path: String,
    state: State<'_, FsState>,
) -> Result<(), String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let archive_manager = state
        .archive_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path = PathBuf::from(&archive_path);
    archive_manager.delete_entry_from_zip(&path, &inner_path)
}

/// 【优化】从压缩包加载图片 - 使用 Response 直接传输二进制
/// 避免 Vec<u8> -> JSON Array 的序列化开销
#[tauri::command]
pub async fn load_image_from_archive_binary(
    archive_path: String,
    file_path: String,
    trace_id: Option<String>,
    page_index: Option<i32>,
    state: State<'_, FsState>,
) -> Result<tauri::ipc::Response, String> {
    let trace_id = trace_id.unwrap_or_else(|| {
        let millis = SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or_default();
        format!("rust-archive-bin-{}-{}", page_index.unwrap_or(-1), millis)
    });

    info!(
        "📥 [ImagePipeline:{}] load_image_from_archive_binary request archive={} inner={} page_index={:?}",
        trace_id, archive_path, file_path, page_index
    );

    let archive_manager = Arc::clone(&state.archive_manager);
    let archive_path_buf = PathBuf::from(&archive_path);
    let inner_path = file_path.clone();
    let result = spawn_blocking(move || {
        // 使用 unwrap_or_else 恢复被污染的锁
        let manager = archive_manager
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        manager.load_image_from_archive_binary(&archive_path_buf, &inner_path)
    })
    .await
    .map_err(|e| format!("load_image_from_archive_binary join error: {}", e))?;

    match &result {
        Ok(bytes) => {
            info!(
                "📤 [ImagePipeline:{}] load_image_from_archive_binary success bytes={}",
                trace_id,
                bytes.len()
            );
            // 使用 Response 直接传输二进制数据，避免 JSON 序列化
            Ok(tauri::ipc::Response::new(bytes.clone()))
        },
        Err(err) => {
            warn!(
                "⚠️ [ImagePipeline:{}] load_image_from_archive_binary failed: {}",
                trace_id, err
            );
            Err(err.clone())
        }
    }
}

/// 从压缩包加载图片 (兼容旧版)
#[tauri::command]
pub async fn load_image_from_archive(
    archive_path: String,
    file_path: String,
    trace_id: Option<String>,
    page_index: Option<i32>,
    state: State<'_, FsState>,
) -> Result<Vec<u8>, String> {
    let trace_id = trace_id.unwrap_or_else(|| {
        let millis = SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or_default();
        format!("rust-archive-{}-{}", page_index.unwrap_or(-1), millis)
    });

    info!(
        "📥 [ImagePipeline:{}] load_image_from_archive request archive={} inner={} page_index={:?}",
        trace_id, archive_path, file_path, page_index
    );

    let archive_manager = Arc::clone(&state.archive_manager);
    let archive_path_buf = PathBuf::from(&archive_path);
    let inner_path = file_path.clone();
    let result = spawn_blocking(move || {
        // 使用 unwrap_or_else 恢复被污染的锁
        let manager = archive_manager
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        manager.load_image_from_archive_binary(&archive_path_buf, &inner_path)
    })
    .await
    .map_err(|e| format!("load_image_from_archive join error: {}", e))?;

    match &result {
        Ok(bytes) => info!(
            "📤 [ImagePipeline:{}] load_image_from_archive success bytes={}",
            trace_id,
            bytes.len()
        ),
        Err(err) => warn!(
            "⚠️ [ImagePipeline:{}] load_image_from_archive failed: {}",
            trace_id, err
        ),
    }

    result
}

/// 【优化】从压缩包解压图片到临时文件，返回临时文件路径
/// 前端可以使用 convertFileSrc 直接访问，绕过 IPC 序列化
#[tauri::command]
pub async fn extract_image_to_temp(
    archive_path: String,
    file_path: String,
    trace_id: Option<String>,
    page_index: Option<i32>,
    state: State<'_, FsState>,
) -> Result<String, String> {
    let trace_id = trace_id.unwrap_or_else(|| {
        let millis = SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or_default();
        format!("rust-extract-{}-{}", page_index.unwrap_or(-1), millis)
    });

    info!(
        "📥 [ImagePipeline:{}] extract_image_to_temp request archive={} inner={} page_index={:?}",
        trace_id, archive_path, file_path, page_index
    );

    let archive_manager = Arc::clone(&state.archive_manager);
    let archive_path_buf = PathBuf::from(&archive_path);
    let inner_path = file_path.clone();
    
    let result = spawn_blocking(move || {
        // 使用 unwrap_or_else 恢复被污染的锁
        let manager = archive_manager
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        
        // 读取图片数据（支持 ZIP/RAR/7z）
        let bytes = manager.load_image_from_archive_binary(&archive_path_buf, &inner_path)?;
        
        // 获取文件扩展名
        let ext = Path::new(&inner_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("jpg");
        
        // 创建临时文件
        let temp_dir = std::env::temp_dir().join("neoview_cache");
        std::fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;
        
        // 使用 hash 作为文件名，避免重复解压
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        archive_path_buf.hash(&mut hasher);
        inner_path.hash(&mut hasher);
        let hash = hasher.finish();
        
        let temp_path = temp_dir.join(format!("{:x}.{}", hash, ext));
        
        // 如果文件已存在，直接返回路径
        if temp_path.exists() {
            return Ok(temp_path.to_string_lossy().to_string());
        }
        
        // 写入临时文件
        std::fs::write(&temp_path, &bytes).map_err(|e| format!("写入临时文件失败: {}", e))?;
        
        Ok(temp_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("extract_image_to_temp join error: {}", e))?;

    match &result {
        Ok(path) => info!(
            "📤 [ImagePipeline:{}] extract_image_to_temp success path={}",
            trace_id, path
        ),
        Err(err) => warn!(
            "⚠️ [ImagePipeline:{}] extract_image_to_temp failed: {}",
            trace_id, err
        ),
    }

    result
}

/// 获取压缩包中的所有图片
#[tauri::command]
pub async fn get_images_from_archive(
    archive_path: String,
    state: State<'_, FsState>,
) -> Result<Vec<String>, String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let archive_manager = state
        .archive_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path = PathBuf::from(archive_path);
    // 使用 get_images_from_archive 支持 ZIP/RAR/7z
    archive_manager.get_images_from_archive(&path)
}

/// 【优化】批量预解压压缩包中的图片到临时目录
/// 返回临时目录路径，前端可以直接用 convertFileSrc 访问
#[tauri::command]
pub async fn batch_extract_archive(
    archive_path: String,
    state: State<'_, FsState>,
) -> Result<String, String> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let archive_path_buf = PathBuf::from(&archive_path);
    
    // 计算压缩包的 hash 作为临时目录名
    let mut hasher = DefaultHasher::new();
    archive_path_buf.hash(&mut hasher);
    let hash = hasher.finish();
    
    let temp_dir = std::env::temp_dir()
        .join("neoview_cache")
        .join(format!("{:x}", hash));
    
    // 如果目录已存在且有内容，直接返回
    if temp_dir.exists() {
        let count = std::fs::read_dir(&temp_dir)
            .map(|d| d.count())
            .unwrap_or(0);
        if count > 0 {
            info!("📦 使用已解压的缓存目录: {:?} ({} files)", temp_dir, count);
            return Ok(temp_dir.to_string_lossy().to_string());
        }
    }
    
    info!("📦 开始批量解压: {:?} -> {:?}", archive_path_buf, temp_dir);
    
    let archive_manager = Arc::clone(&state.archive_manager);
    
    let result = spawn_blocking(move || {
        // 使用 unwrap_or_else 恢复被污染的锁
        let manager = archive_manager
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        
        // 获取所有图片（支持 ZIP/RAR/7z）
        let images = manager.get_images_from_archive(&archive_path_buf)?;
        
        // 创建临时目录
        std::fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;
        
        // 解压所有图片
        for (index, inner_path) in images.iter().enumerate() {
            let bytes = manager.load_image_from_archive_binary(&archive_path_buf, inner_path)?;
            
            // 使用索引作为文件名，保持顺序
            let ext = Path::new(inner_path)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("jpg");
            let temp_file = temp_dir.join(format!("{:05}.{}", index, ext));
            
            std::fs::write(&temp_file, &bytes).map_err(|e| format!("写入临时文件失败: {}", e))?;
        }
        
        info!("✅ 批量解压完成: {} files", images.len());
        Ok(temp_dir.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("batch_extract_archive join error: {}", e))?;
    
    result
}

/// 检查是否为支持的压缩包
#[tauri::command]
pub async fn is_supported_archive(path: String) -> Result<bool, String> {
    let path = PathBuf::from(path);
    Ok(crate::core::archive::ArchiveManager::is_supported_archive(
        &path,
    ))
}

/// 批量扫描压缩包内容
/// 通过 Rust 调度器执行，避免阻塞主线程
#[tauri::command]
pub async fn batch_scan_archives(
    archive_paths: Vec<String>,
    state: State<'_, FsState>,
    scheduler: State<'_, BackgroundSchedulerState>,
) -> Result<Vec<ArchiveScanResult>, String> {
    let archive_manager = Arc::clone(&state.archive_manager);
    let paths: Vec<PathBuf> = archive_paths.iter().map(PathBuf::from).collect();

    let results: Vec<ArchiveScanResult> = scheduler
        .scheduler
        .enqueue_blocking(
            "archive-batch-scan",
            "filebrowser",
            move || -> Result<Vec<ArchiveScanResult>, String> {
                let mut results = Vec::with_capacity(paths.len());
                // 使用 unwrap_or_else 恢复被污染的锁
                let manager = archive_manager
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());

                for path in paths {
                    let archive_path_str = path.to_string_lossy().to_string();
                    // 使用 list_contents 自动检测格式（支持 ZIP/RAR/7z）
                    match manager.list_contents(&path) {
                        Ok(entries) => {
                            results.push(ArchiveScanResult {
                                archive_path: archive_path_str,
                                entries,
                                error: None,
                            });
                        }
                        Err(e) => {
                            results.push(ArchiveScanResult {
                                archive_path: archive_path_str,
                                entries: Vec::new(),
                                error: Some(e),
                            });
                        }
                    }
                }

                Ok(results)
            },
        )
        .await?;

    Ok(results)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveScanResult {
    pub archive_path: String,
    pub entries: Vec<crate::core::archive::ArchiveEntry>,
    pub error: Option<String>,
}

/// 【优化】并行预加载多个页面到缓存
/// 使用 rayon 并行解压，提升预加载速度
#[tauri::command]
pub async fn preload_archive_pages(
    archive_path: String,
    page_paths: Vec<String>,
    state: State<'_, FsState>,
) -> Result<PreloadResult, String> {
    use rayon::prelude::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    
    let archive_manager = Arc::clone(&state.archive_manager);
    let archive_path_buf = PathBuf::from(&archive_path);
    let page_count = page_paths.len();
    
    info!(
        "📦 [Preload] 开始并行预加载 {} 个页面: {}",
        page_count,
        archive_path
    );
    
    let start_time = std::time::Instant::now();
    
    let result = spawn_blocking(move || {
        // 使用 unwrap_or_else 恢复被污染的锁
        let manager = archive_manager
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        
        let success_count = AtomicUsize::new(0);
        let total_bytes = AtomicUsize::new(0);
        
        // 使用 rayon 并行解压
        let errors: Vec<String> = page_paths
            .par_iter()
            .filter_map(|page_path| {
                match manager.load_image_from_archive_binary(&archive_path_buf, page_path) {
                    Ok(bytes) => {
                        success_count.fetch_add(1, Ordering::Relaxed);
                        total_bytes.fetch_add(bytes.len(), Ordering::Relaxed);
                        None
                    }
                    Err(e) => Some(format!("{}: {}", page_path, e)),
                }
            })
            .collect();
        
        Ok(PreloadResult {
            total: page_count,
            success: success_count.load(Ordering::Relaxed),
            failed: errors.len(),
            total_bytes: total_bytes.load(Ordering::Relaxed),
            errors: if errors.is_empty() { None } else { Some(errors) },
        })
    })
    .await
    .map_err(|e| format!("preload_archive_pages join error: {}", e))?;
    
    let elapsed = start_time.elapsed();
    
    match &result {
        Ok(r) => info!(
            "✅ [Preload] 完成: {}/{} 成功, {} bytes, {:.1}ms",
            r.success, r.total, r.total_bytes, elapsed.as_secs_f64() * 1000.0
        ),
        Err(e) => warn!("⚠️ [Preload] 失败: {}", e),
    }
    
    result
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreloadResult {
    pub total: usize,
    pub success: usize,
    pub failed: usize,
    pub total_bytes: usize,
    pub errors: Option<Vec<String>>,
}

// ===== 文件操作命令 =====

/// 复制文件或文件夹
#[tauri::command]
pub async fn copy_path(from: String, to: String, state: State<'_, FsState>) -> Result<(), String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let from_path = PathBuf::from(from);
    let to_path = PathBuf::from(to);
    fs_manager.copy(&from_path, &to_path)
}

/// 移动文件或文件夹
#[tauri::command]
pub async fn move_path(from: String, to: String, state: State<'_, FsState>) -> Result<(), String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let from_path = PathBuf::from(from);
    let to_path = PathBuf::from(to);
    fs_manager.move_item(&from_path, &to_path)
}

/// 在系统默认程序中打开文件
#[tauri::command]
pub async fn open_with_system(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    Ok(())
}

/// 在文件管理器中显示文件
#[tauri::command]
pub async fn show_in_file_manager(path: String) -> Result<(), String> {
    log::info!("show_in_file_manager called with path: {}", path);
    
    let path = PathBuf::from(&path);
    
    // 检查路径是否存在
    if !path.exists() {
        log::warn!("Path does not exist: {}", path.display());
        return Err(format!("Path does not exist: {}", path.display()));
    }

    #[cfg(target_os = "windows")]
    {
        // canonicalize 会添加 \\?\ 前缀，explorer 不支持，需要移除
        let canonical_path = path.canonicalize()
            .map_err(|e| format!("Failed to canonicalize path: {}", e))?;
        let path_str = canonical_path.to_string_lossy();
        
        // 移除 Windows 扩展路径前缀 \\?\
        let clean_path = if path_str.starts_with(r"\\?\") {
            &path_str[4..]
        } else {
            &path_str
        };
        
        log::info!("Clean path for explorer: {}", clean_path);
        
        // GitButler 方式: /select, 和路径作为两个独立参数
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(clean_path)
            .status()
            .map_err(|e| format!("Failed to show in file manager: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(path.to_string_lossy().as_ref())
            .spawn()
            .map_err(|e| format!("Failed to show in file manager: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        // 对于 Linux，尝试打开包含文件的目录
        let parent = path
            .parent()
            .ok_or_else(|| "Cannot get parent directory".to_string())?;

        std::process::Command::new("xdg-open")
            .arg(parent.to_string_lossy().as_ref())
            .spawn()
            .map_err(|e| format!("Failed to show in file manager: {}", e))?;
    }

    Ok(())
}

/// 搜索文件（使用后端实现，不再依赖 fd CLI）
#[tauri::command]
pub async fn search_files(
    path: String,
    query: String,
    options: Option<SearchOptions>,
    state: State<'_, FsState>,
) -> Result<Vec<crate::core::fs_manager::FsItem>, String> {
    let search_options = options.unwrap_or_default();

    // 使用 unwrap_or_else 恢复被污染的锁
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path_buf = PathBuf::from(path);

    // 转换 SearchOptions 类型
    let fs_search_options = crate::core::fs_manager::SearchOptions {
        include_subfolders: search_options.include_subfolders,
        max_results: search_options.max_results,
        search_in_path: search_options.search_in_path,
    };

    // 使用 fs_manager 的 search_files 方法（支持索引和递归搜索）
    fs_manager.search_files(&path_buf, &query, &fs_search_options)
}

/// 检查文件是否为图片
fn is_image_file(path: &Path) -> bool {
    if let Some(ext) = path.extension() {
        let ext = ext.to_string_lossy().to_lowercase();
        matches!(
            ext.as_str(),
            "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "avif" | "jxl" | "tiff" | "tif"
        )
    } else {
        false
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    pub include_subfolders: Option<bool>,
    pub max_results: Option<usize>,
    pub search_in_path: Option<bool>, // 是否在完整路径中搜索（而不仅仅是文件名）
}

/// 初始化文件索引
#[tauri::command]
pub async fn initialize_file_index(state: State<'_, FsState>) -> Result<(), String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    fs_manager.initialize_indexer()
}

/// 构建文件索引
#[tauri::command]
pub async fn build_file_index(
    path: String,
    recursive: bool,
    state: State<'_, FsState>,
) -> Result<(), String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path = PathBuf::from(path);
    fs_manager.build_index(&path, recursive)
}

/// 获取索引统计信息
#[tauri::command]
pub async fn get_index_stats(
    state: State<'_, FsState>,
) -> Result<crate::core::file_indexer::IndexStats, String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    fs_manager.get_index_stats()
}

/// 清除文件索引
#[tauri::command]
pub async fn clear_file_index(state: State<'_, FsState>) -> Result<(), String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    fs_manager.clear_index()
}

/// 在索引中搜索文件
#[tauri::command]
pub async fn search_in_index(
    query: String,
    max_results: Option<usize>,
    options: Option<IndexSearchOptions>,
    state: State<'_, FsState>,
) -> Result<Vec<crate::core::fs_manager::FsItem>, String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let max_results = max_results.unwrap_or(100);
    let search_options = options.map(|o| crate::core::file_indexer::SearchOptions {
        include_subfolders: o.include_subfolders.unwrap_or(true),
        images_only: o.images_only.unwrap_or(false),
        folders_only: o.folders_only.unwrap_or(false),
        min_size: o.min_size,
        max_size: o.max_size,
        modified_after: o.modified_after,
        modified_before: o.modified_before,
    });

    fs_manager.search_in_index(&query, max_results, search_options.as_ref())
}

/// 获取索引中的路径列表
#[tauri::command]
pub async fn get_indexed_paths(
    path: Option<String>,
    recursive: Option<bool>,
    state: State<'_, FsState>,
) -> Result<Vec<String>, String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let recursive = recursive.unwrap_or(false);

    fs_manager.get_indexed_paths(path.as_deref(), recursive)
}

/// 检查路径是否已被索引
#[tauri::command]
pub async fn is_path_indexed(path: String, state: State<'_, FsState>) -> Result<bool, String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    fs_manager.is_path_indexed(&path)
}

/// 获取索引进度
#[tauri::command]
pub async fn get_index_progress(
    state: State<'_, FsState>,
) -> Result<crate::core::file_indexer::IndexProgress, String> {
    // 使用 unwrap_or_else 恢复被污染的锁
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    fs_manager.get_index_progress()
}

/// 索引搜索选项
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexSearchOptions {
    pub include_subfolders: Option<bool>,
    pub images_only: Option<bool>,
    pub folders_only: Option<bool>,
    pub min_size: Option<u64>,
    pub max_size: Option<u64>,
    pub modified_after: Option<u64>,
    pub modified_before: Option<u64>,
}

/// 获取未索引的文件和文件夹
#[tauri::command]
pub async fn get_unindexed_files(
    root_path: String,
    state: State<'_, FsState>,
) -> Result<UnindexedFilesResult, String> {
    println!("🔍 开始扫描未索引文件: {}", root_path);

    // 使用 unwrap_or_else 恢复被污染的锁
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let root_path = PathBuf::from(root_path);

    // 检查根路径是否存在
    if !root_path.exists() {
        return Err(format!("根路径不存在: {}", root_path.display()));
    }

    println!("📁 根路径存在，开始扫描...");

    // 获取所有文件和文件夹
    let mut files = Vec::new();
    let mut folders = Vec::new();
    let mut archives = Vec::new();

    // 递归扫描目录
    scan_directory(
        &root_path,
        &mut files,
        &mut folders,
        &mut archives,
        &fs_manager,
    )?;

    println!(
        "📊 扫描完成: 找到 {} 个文件, {} 个文件夹",
        files.len(),
        folders.len()
    );

    // 过滤掉已索引的项目（只获取未索引的）
    let mut unindexed_files = Vec::new();
    let mut unindexed_folders = Vec::new();
    let mut unindexed_archives = Vec::new();

    for file in files {
        let path_str = file.to_string_lossy();
        match fs_manager.is_path_indexed(&path_str) {
            Ok(is_indexed) => {
                if !is_indexed {
                    unindexed_files.push(path_str.to_string());
                }
            }
            Err(e) => {
                println!("⚠️ 检查索引状态失败 {}: {}", path_str, e);
                // 如果检查失败，假设未索引
                unindexed_files.push(path_str.to_string());
            }
        }
    }

    for folder in folders {
        let path_str = folder.to_string_lossy();
        match fs_manager.is_path_indexed(&path_str) {
            Ok(is_indexed) => {
                if !is_indexed {
                    unindexed_folders.push(path_str.to_string());
                }
            }
            Err(e) => {
                println!("⚠️ 检查索引状态失败 {}: {}", path_str, e);
                // 如果检查失败，假设未索引
                unindexed_folders.push(path_str.to_string());
            }
        }
    }

    for archive in archives {
        let path_str = archive.to_string_lossy();
        match fs_manager.is_path_indexed(&path_str) {
            Ok(is_indexed) => {
                if !is_indexed {
                    unindexed_archives.push(path_str.to_string());
                }
            }
            Err(e) => {
                println!("⚠️ 检查索引状态失败 {}: {}", path_str, e);
                unindexed_archives.push(path_str.to_string());
            }
        }
    }

    println!(
        "✅ 过滤完成: 未索引文件 {} 个, 未索引文件夹 {} 个, 未索引压缩包 {} 个",
        unindexed_files.len(),
        unindexed_folders.len(),
        unindexed_archives.len()
    );

    Ok(UnindexedFilesResult {
        files: unindexed_files,
        folders: unindexed_folders,
        archives: unindexed_archives,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnindexedFilesResult {
    pub files: Vec<String>,
    pub folders: Vec<String>,
    pub archives: Vec<String>,
}

fn scan_directory(
    dir: &Path,
    files: &mut Vec<PathBuf>,
    folders: &mut Vec<PathBuf>,
    archives: &mut Vec<PathBuf>,
    fs_manager: &FsManager,
) -> Result<(), String> {
    let dir_name = dir.file_name().and_then(|n| n.to_str()).unwrap_or("未知");

    println!("📂 扫描目录: {}", dir.display());

    let entries =
        std::fs::read_dir(dir).map_err(|e| format!("读取目录失败 {}: {}", dir.display(), e))?;

    let mut file_count = 0;
    let mut folder_count = 0;
    let mut archive_count = 0;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
        let path = entry.path();

        // 跳过隐藏文件和系统目录
        if let Some(name) = path.file_name() {
            let name_str = name.to_string_lossy();
            if name_str.starts_with('.')
                || name_str == "$RECYCLE.BIN"
                || name_str == "System Volume Information"
            {
                continue;
            }
        }

        if path.is_dir() {
            // 添加文件夹
            folders.push(path.clone());
            folder_count += 1;

            // 递归扫描子目录
            scan_directory(&path, files, folders, archives, fs_manager)?;
        } else if path.is_file() {
            // 检查是否为图片文件或压缩包
            if is_image_file(&path) {
                files.push(path);
                file_count += 1;
            } else if is_archive_file(&path) {
                archives.push(path);
                archive_count += 1;
            }
        }
    }

    if file_count > 0 || folder_count > 0 || archive_count > 0 {
        println!(
            "  📊 {} - 文件: {}, 文件夹: {}, 压缩包: {}",
            dir_name, file_count, folder_count, archive_count
        );
    }

    Ok(())
}

fn is_archive_file(path: &Path) -> bool {
    if let Some(ext) = path.extension() {
        let ext = ext.to_string_lossy().to_lowercase();
        matches!(ext.as_str(), "zip" | "cbz" | "rar" | "cbr" | "7z" | "cb7")
    } else {
        false
    }
}

// ===== 分页和流式浏览相关 =====

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::LazyLock;

// 全局流ID计数器
static STREAM_COUNTER: AtomicU64 = AtomicU64::new(0);

// 流状态管理
static STREAMS: LazyLock<Mutex<HashMap<String, DirectoryStream>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Debug)]
struct DirectoryStream {
    id: String,
    path: PathBuf,
    entries: Vec<PathBuf>, // 改为存储PathBuf而不是DirEntry
    current_index: usize,
    batch_size: usize,
    total: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryPageResult {
    pub items: Vec<FileInfo>,
    pub total: usize,
    pub has_more: bool,
    pub next_offset: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryStreamStartResult {
    pub stream_id: String,
    pub initial_batch: Vec<FileInfo>,
    pub total: usize,
    pub has_more: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamBatchResult {
    pub items: Vec<FileInfo>,
    pub has_more: bool,
}

/// 分页浏览目录
#[tauri::command]
pub async fn browse_directory_page(
    path: String,
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

    // 读取所有目录条目
    let mut entries: Vec<PathBuf> = std::fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect();

    // 应用排序
    sort_entries(&mut entries, &options.sort_by, &options.sort_order);

    let total = entries.len();
    let offset = options.offset.unwrap_or(0);
    let limit = options.limit.unwrap_or(100);

    // 获取分页数据
    let page_entries: Vec<PathBuf> = entries.into_iter().skip(offset).take(limit).collect();

    // 转换为FileInfo
    let items = convert_paths_to_file_info(page_entries)?;

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

    // 读取所有目录条目
    let mut entries: Vec<PathBuf> = std::fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect();

    // 应用排序
    sort_entries(&mut entries, &options.sort_by, &options.sort_order);

    let total = entries.len();
    let batch_size = options.batch_size.unwrap_or(50);
    let stream_id = format!("stream_{}", STREAM_COUNTER.fetch_add(1, Ordering::SeqCst));

    // 获取初始批次
    let initial_batch: Vec<PathBuf> = entries.iter().take(batch_size).cloned().collect();

    let initial_items = convert_paths_to_file_info(initial_batch)?;
    let has_more = batch_size < total;

    // 创建流状态
    let stream = DirectoryStream {
        id: stream_id.clone(),
        path: path.to_path_buf(),
        entries,
        current_index: batch_size,
        batch_size,
        total,
    };

    // 存储流状态
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
pub async fn get_next_stream_batch(stream_id: String) -> Result<StreamBatchResult, String> {
    let mut streams = STREAMS.lock().unwrap();

    if let Some(stream) = streams.get_mut(&stream_id) {
        if stream.current_index >= stream.entries.len() {
            // 没有更多数据
            return Ok(StreamBatchResult {
                items: vec![],
                has_more: false,
            });
        }

        // 获取下一批
        let next_index = (stream.current_index + stream.batch_size).min(stream.entries.len());
        let batch: Vec<PathBuf> = stream.entries[stream.current_index..next_index]
            .iter()
            .cloned()
            .collect();

        stream.current_index = next_index;
        let has_more = stream.current_index < stream.entries.len();

        let items = convert_paths_to_file_info(batch)?;

        Ok(StreamBatchResult { items, has_more })
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

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryPageOptions {
    pub offset: Option<usize>,
    pub limit: Option<usize>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryStreamOptions {
    pub batch_size: Option<usize>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

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
