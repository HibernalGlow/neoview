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

use super::thumbnail_commands::ThumbnailState;
use crate::core::blob_registry::BlobRegistry;
use crate::core::thumbnail_db::ThumbnailDb;
use crate::core::thumbnail_generator::{ThumbnailGenerator, ThumbnailGeneratorConfig};
use crate::core::thumbnail_service_v3::{
    CacheStats, TaskLane, ThumbnailServiceConfig, ThumbnailServiceV3,
};
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
    let base_dir = if raw.is_empty() || !Path::new(raw).is_absolute() {
        app.path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::temp_dir().join("neoview"))
    } else {
        PathBuf::from(raw)
    };

    let db_dir = base_dir.join("thumbnails");

    // 确保目录存在
    if let Err(e) = std::fs::create_dir_all(&db_dir) {
        return Err(format!("创建数据库目录失败: {}", e));
    }

    let db_path = db_dir.join("thumbnails.db");
    log_info!("📁 ThumbnailServiceV3 数据库路径: {}", db_path.display());

    // 创建数据库
    let db = Arc::new(ThumbnailDb::new(db_path));

    // 创建生成器配置（线程数基于核心数动态调整）
    let cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let gen_config = ThumbnailGeneratorConfig {
        max_width: size,
        max_height: size,
        thread_pool_size: cores.clamp(4, 16),
        archive_concurrency: (cores / 2).max(2).min(8),
    };
    let generator = Arc::new(ThumbnailGenerator::new(Arc::clone(&db), gen_config));

    // 创建服务配置：使用默认（基于核心数的动态 LRU / 线程数）并覆盖尺寸
    let mut service_config = ThumbnailServiceConfig::default();
    service_config.thumbnail_size = size;

    // 创建服务
    let service = Arc::new(ThumbnailServiceV3::new(
        Arc::clone(&db),
        Arc::clone(&generator),
        service_config,
    ));

    // 启动工作线程
    service.start(app.clone());

    // 保存到应用状态
    app.manage(ThumbnailServiceV3State { service });

    // ThumbnailState 已在 lib.rs 启动时初始化，这里不再重复注册
    // 如果需要更新配置，可以通过其他方式实现

    log_info!("✅ ThumbnailServiceV3 初始化完成 (ThumbnailState 已在启动时初始化)");
    Ok(())
}

/// 请求可见区域缩略图（核心命令，不阻塞）
/// center_index: 可见区域中心索引，用于优先级排序（中心优先加载）
#[tauri::command]
pub async fn request_visible_thumbnails_v3(
    app: AppHandle,
    paths: Vec<String>,
    current_dir: String,
    center_index: Option<usize>,
    lane: Option<String>,
) -> Result<(), String> {
    // 安全获取 State（使用 try_state 避免 panic）
    let state = match app.try_state::<ThumbnailServiceV3State>() {
        Some(s) => s,
        None => {
            log_info!("⚠️ ThumbnailServiceV3 未初始化，跳过请求");
            return Ok(());
        }
    };
    let lane = match lane.as_deref() {
        Some("prefetch") => TaskLane::Prefetch,
        Some("background") => TaskLane::Background,
        _ => TaskLane::Visible,
    };

    // 不阻塞，直接返回，传递中心索引用于优先级排序
    state
        .service
        .request_visible_thumbnails(&app, paths, current_dir, center_index, lane);
    Ok(())
}

/// 取消指定目录的请求
#[tauri::command]
pub async fn cancel_thumbnail_requests_v3(app: AppHandle, dir: String) -> Result<(), String> {
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
        Ok(results
            .into_iter()
            .map(|(path, blob)| CachedThumbnailResult { path, blob })
            .collect())
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
    use std::collections::VecDeque;
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::time::Instant;

    let max_depth = depth.unwrap_or(1);
    let prefetch_started = Instant::now();

    fn prefetch_metadata_chunked(paths: &[PathBuf], chunk_size: usize, workers: usize) {
        if paths.is_empty() {
            return;
        }
        let shared = Arc::new(paths.to_vec());
        std::thread::scope(|scope| {
            for worker_id in 0..workers.max(1) {
                let shared_paths = Arc::clone(&shared);
                scope.spawn(move || {
                    let mut index = worker_id * chunk_size;
                    let stride = workers.max(1) * chunk_size;
                    while index < shared_paths.len() {
                        let end = (index + chunk_size).min(shared_paths.len());
                        for path in &shared_paths[index..end] {
                            let _ = std::fs::metadata(path);
                        }
                        index = index.saturating_add(stride);
                    }
                });
            }
        });
    }

    let mut paths = Vec::new();
    let mut queue: VecDeque<(PathBuf, u32)> = VecDeque::new();
    queue.push_back((PathBuf::from(&dir), 0));

    while let Some((current_dir, current_depth)) = queue.pop_front() {
        if current_depth > max_depth {
            continue;
        }

        let mut entries: Vec<_> = match std::fs::read_dir(&current_dir) {
            Ok(iter) => iter.flatten().collect(),
            Err(_) => continue,
        };

        entries.sort_by(|a, b| a.file_name().cmp(&b.file_name()));

        let mut files_in_dir = Vec::new();
        for entry in entries {
            let path = entry.path();
            paths.push(path.to_string_lossy().to_string());

            if path.is_file() {
                files_in_dir.push(path.clone());
            }

            if path.is_dir() && current_depth < max_depth {
                queue.push_back((path, current_depth + 1));
            }
        }

        // 小块并发预读元数据，预热目录级 I/O 缓存
        prefetch_metadata_chunked(&files_in_dir, 16, 3);
    }

    // 请求预加载（无中心索引，使用默认顺序）
    if let Some(state) = app.try_state::<ThumbnailServiceV3State>() {
        state
            .service
            .record_io_prefetch_stats(paths.len(), prefetch_started.elapsed().as_millis() as u64);
        state
            .service
            .request_visible_thumbnails(&app, paths, dir, None, TaskLane::Background);
    }

    Ok(())
}

/// 清除缓存
#[tauri::command]
pub async fn clear_thumbnail_cache_v3(app: AppHandle, scope: String) -> Result<(), String> {
    if let Some(state) = app.try_state::<ThumbnailServiceV3State>() {
        state.service.clear_cache(&scope);
    }
    Ok(())
}

/// 获取缓存统计
#[tauri::command]
pub async fn get_thumbnail_cache_stats_v3(app: AppHandle) -> Result<CacheStats, String> {
    if let Some(state) = app.try_state::<ThumbnailServiceV3State>() {
        Ok(state.service.get_cache_stats())
    } else {
        Ok(CacheStats {
            memory_count: 0,
            memory_bytes: 0,
            database_count: 0,
            database_bytes: 0,
            queue_length: 0,
            queue_visible: 0,
            queue_prefetch: 0,
            queue_background: 0,
            active_workers: 0,
            processed_visible: 0,
            processed_prefetch: 0,
            processed_background: 0,
            decode_wait_count: 0,
            decode_wait_ms: 0,
            scale_wait_count: 0,
            scale_wait_ms: 0,
            encode_wait_count: 0,
            encode_wait_ms: 0,
            window_pruned_tasks: 0,
            cache_decay_evicted_entries: 0,
            cache_decay_evicted_bytes: 0,
            io_prefetch_runs: 0,
            io_prefetch_files: 0,
            io_prefetch_ms: 0,
            db_read_window: 0,
            db_read_last_ms: 0,
            db_write_window: 0,
            db_write_last_ms: 0,
            db_write_last_items: 0,
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
    pub failed_memory: usize,
    pub failed_db: usize,
}

/// 获取数据库维护统计
#[tauri::command]
pub async fn get_thumbnail_db_stats_v3(app: AppHandle) -> Result<MaintenanceStats, String> {
    if let Some(state) = app.try_state::<ThumbnailServiceV3State>() {
        let (total, folders, size) = state.service.get_db_stats()?;
        let (failed_memory, failed_db) = state.service.get_failed_count()?;

        Ok(MaintenanceStats {
            total_entries: total,
            folder_entries: folders,
            db_size_bytes: size,
            db_size_mb: size as f64 / 1024.0 / 1024.0,
            failed_memory,
            failed_db,
        })
    } else {
        Err("缩略图服务未初始化".to_string())
    }
}

/// 清理无效路径（文件不存在）
#[tauri::command]
pub async fn cleanup_invalid_paths_v3(app: AppHandle) -> Result<usize, String> {
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
pub async fn vacuum_thumbnail_db_v3(app: AppHandle) -> Result<(), String> {
    if let Some(state) = app.try_state::<ThumbnailServiceV3State>() {
        state.service.vacuum_db()
    } else {
        Err("缩略图服务未初始化".to_string())
    }
}

/// 清除失败黑名单（内存索引 + 数据库记录）
/// 清除后，之前失败的缩略图将在下次请求时重新尝试生成
#[tauri::command]
pub async fn clear_failed_thumbnails_v3(app: AppHandle) -> Result<usize, String> {
    if let Some(state) = app.try_state::<ThumbnailServiceV3State>() {
        state.service.clear_failed_index()
    } else {
        Err("缩略图服务未初始化".to_string())
    }
}

/// 获取失败黑名单数量
#[tauri::command]
pub async fn get_failed_count_v3(app: AppHandle) -> Result<(usize, usize), String> {
    if let Some(state) = app.try_state::<ThumbnailServiceV3State>() {
        state.service.get_failed_count()
    } else {
        Ok((0, 0))
    }
}

/// 重载单个缩略图（删除缓存并请求重新生成）
#[tauri::command]
pub async fn reload_thumbnail_v3(
    app: AppHandle,
    path: String,
    current_dir: Option<String>,
) -> Result<(), String> {
    if let Some(state) = app.try_state::<ThumbnailServiceV3State>() {
        // 1. 删除内存缓存和数据库记录
        state.service.remove_thumbnail(&path)?;
        log_info!("🔄 Removed thumbnail cache for: {}", path);

        // 2. 立即触发重新生成（使用提供的当前目录或空字符串）
        let dir = current_dir.unwrap_or_default();
        state.service.regenerate_thumbnail(&app, &path, &dir);

        Ok(())
    } else {
        Err("缩略图服务未初始化".to_string())
    }
}
