//! NeoView - Archive Viewer Commands
//! 压缩包查看器相关的 Tauri 命令

use std::path::PathBuf;
use tauri::command;
use crate::core::archive_viewer::{ArchiveViewer, ArchiveViewerState};
use crate::core::archive_cache::ArchiveImageCache;

/// 初始化压缩包查看器
#[command]
pub async fn init_archive_viewer(
    cache_path: String,
    max_entries: Option<usize>,
    state: tauri::State<'_, ArchiveViewerState>,
) -> Result<(), String> {
    let cache_path = PathBuf::from(cache_path);
    let max_entries = max_entries.unwrap_or(500); // 默认500条

    let cache = ArchiveImageCache::new(cache_path, max_entries)
        .map_err(|e| format!("初始化压缩包缓存失败: {}", e))?;

    let viewer = ArchiveViewer::new(cache);

    if let Ok(mut viewer_guard) = state.viewer.lock() {
        *viewer_guard = Some(viewer);
    }

    Ok(())
}

/// 获取缓存统计信息
#[command]
pub async fn get_archive_cache_stats(
    state: tauri::State<'_, ArchiveViewerState>,
) -> Result<crate::core::archive_cache::CacheStats, String> {
    if let Ok(viewer_guard) = state.viewer.lock() {
        if let Some(ref viewer) = *viewer_guard {
            let cache = viewer.cache.lock()
                .map_err(|e| format!("获取缓存锁失败: {}", e))?;
            cache.get_stats()
        } else {
            Err("查看器未初始化".to_string())
        }
    } else {
        Err("无法获取查看器锁".to_string())
    }
}

/// 清空压缩包缓存
#[command]
pub async fn clear_archive_cache(
    state: tauri::State<'_, ArchiveViewerState>,
) -> Result<usize, String> {
    if let Ok(mut viewer_guard) = state.viewer.lock() {
        if let Some(ref mut viewer) = *viewer_guard {
            let mut cache = viewer.cache.lock()
                .map_err(|e| format!("获取缓存锁失败: {}", e))?;
            cache.clear_cache()
        } else {
            Err("查看器未初始化".to_string())
        }
    } else {
        Err("无法获取查看器锁".to_string())
    }
}

/// 设置最大缓存条目数
#[command]
pub async fn set_archive_cache_max_entries(
    max_entries: usize,
    state: tauri::State<'_, ArchiveViewerState>,
) -> Result<(), String> {
    if let Ok(mut viewer_guard) = state.viewer.lock() {
        if let Some(ref mut viewer) = *viewer_guard {
            let mut cache = viewer.cache.lock()
                .map_err(|e| format!("获取缓存锁失败: {}", e))?;
            cache.set_max_entries(max_entries);
            Ok(())
        } else {
            Err("查看器未初始化".to_string())
        }
    } else {
        Err("无法获取查看器锁".to_string())
    }
}

// 导出命令
pub use crate::core::archive_viewer::{
    archive_viewer_open,
    archive_viewer_goto,
    archive_viewer_get_current,
    archive_viewer_get_image,
    archive_viewer_get_thumbnail,
    archive_viewer_get_all_thumbnails,
    archive_viewer_super_resolve,
    archive_viewer_get_state,
};

