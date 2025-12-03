//! 压缩包服务命令
//!
//! 提供前端调用的压缩包优化服务命令

use crate::core::archive_service::{
    ArchiveServiceConfig, ArchiveServiceStatus, SharedArchiveService,
};
use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::task::spawn_blocking;

/// 压缩包服务状态
pub struct ArchiveServiceState {
    pub service: SharedArchiveService,
}

/// 页面信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageInfo {
    pub index: usize,
    pub inner_path: String,
}

/// 打开压缩包（初始化缓存和预解压）
#[tauri::command]
pub async fn archive_service_open(
    archive_path: String,
    pages: Vec<PageInfo>,
    state: State<'_, ArchiveServiceState>,
) -> Result<(), String> {
    info!(
        "📦 archive_service_open: {} ({} pages)",
        archive_path,
        pages.len()
    );

    let path = PathBuf::from(&archive_path);
    let page_tuples: Vec<_> = pages.into_iter().map(|p| (p.index, p.inner_path)).collect();
    let service = Arc::clone(&state.service);

    spawn_blocking(move || service.open_archive(&path, page_tuples))
        .await
        .map_err(|e| format!("任务执行失败: {}", e))?
}

/// 关闭压缩包
#[tauri::command]
pub async fn archive_service_close(state: State<'_, ArchiveServiceState>) -> Result<(), String> {
    info!("📦 archive_service_close");
    state.service.close_archive();
    Ok(())
}

/// 加载图片（带缓存和预取）
#[tauri::command]
pub async fn archive_service_load_image(
    archive_path: String,
    inner_path: String,
    page_index: usize,
    direction: i32,
    state: State<'_, ArchiveServiceState>,
) -> Result<Vec<u8>, String> {
    let path = PathBuf::from(&archive_path);
    let service = Arc::clone(&state.service);
    let inner = inner_path.clone();

    let result = spawn_blocking(move || {
        service.load_image(&path, &inner, page_index, direction)
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?;

    match &result {
        Ok(data) => {
            info!(
                "📦 archive_service_load_image success: {} ({} bytes)",
                inner_path,
                data.len()
            );
        }
        Err(e) => {
            warn!("📦 archive_service_load_image failed: {} - {}", inner_path, e);
        }
    }

    result
}

/// 预加载指定范围的页面
#[tauri::command]
pub async fn archive_service_preload_range(
    archive_path: String,
    start_index: usize,
    count: usize,
    state: State<'_, ArchiveServiceState>,
) -> Result<usize, String> {
    info!(
        "📦 archive_service_preload_range: {} start={} count={}",
        archive_path, start_index, count
    );

    let path = PathBuf::from(&archive_path);
    let service = Arc::clone(&state.service);

    spawn_blocking(move || service.preload_range(&path, start_index, count))
        .await
        .map_err(|e| format!("任务执行失败: {}", e))?
}

/// 获取服务状态
#[tauri::command]
pub async fn archive_service_get_status(
    state: State<'_, ArchiveServiceState>,
) -> Result<ArchiveServiceStatus, String> {
    Ok(state.service.get_status())
}

/// 更新配置
#[tauri::command]
pub async fn archive_service_update_config(
    config: ArchiveServiceConfig,
    state: State<'_, ArchiveServiceState>,
) -> Result<(), String> {
    info!("📦 archive_service_update_config: {:?}", config);
    state.service.update_config(config);
    Ok(())
}

/// 获取配置
#[tauri::command]
pub async fn archive_service_get_config(
    state: State<'_, ArchiveServiceState>,
) -> Result<ArchiveServiceConfig, String> {
    Ok(state.service.get_config())
}

/// 清空缓存
#[tauri::command]
pub async fn archive_service_clear_cache(
    state: State<'_, ArchiveServiceState>,
) -> Result<(), String> {
    info!("📦 archive_service_clear_cache");
    state.service.clear_cache();
    Ok(())
}

/// 通知翻页（触发预取）
#[tauri::command]
pub async fn archive_service_notify_page_change(
    archive_path: String,
    page_index: usize,
    direction: i32,
    state: State<'_, ArchiveServiceState>,
) -> Result<(), String> {
    let path = PathBuf::from(&archive_path);
    let service = Arc::clone(&state.service);

    // 在后台触发预取，不阻塞
    tokio::spawn(async move {
        // 获取当前页面列表
        let pages = service.get_current_pages();

        if !pages.is_empty() {
            service
                .prefetcher()
                .request_prefetch(&path, page_index, direction, &pages);
        }
    });

    Ok(())
}

/// 取消当前预取
#[tauri::command]
pub async fn archive_service_cancel_prefetch(
    state: State<'_, ArchiveServiceState>,
) -> Result<(), String> {
    state.service.prefetcher().cancel_current();
    Ok(())
}

/// 检查页面是否已缓存
#[tauri::command]
pub async fn archive_service_is_cached(
    archive_path: String,
    inner_path: String,
    state: State<'_, ArchiveServiceState>,
) -> Result<bool, String> {
    use crate::core::archive_page_cache::PageCacheKey;
    let key = PageCacheKey::new(&archive_path, &inner_path);
    Ok(state.service.page_cache().contains(&key))
}

/// 批量检查页面缓存状态
#[tauri::command]
pub async fn archive_service_check_cache_batch(
    archive_path: String,
    inner_paths: Vec<String>,
    state: State<'_, ArchiveServiceState>,
) -> Result<Vec<bool>, String> {
    use crate::core::archive_page_cache::PageCacheKey;
    let cache = state.service.page_cache();
    let results: Vec<bool> = inner_paths
        .iter()
        .map(|p| {
            let key = PageCacheKey::new(&archive_path, p);
            cache.contains(&key)
        })
        .collect();
    Ok(results)
}
