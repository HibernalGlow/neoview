//! NeoView - Upscale Service Commands
//! 超分服务 Tauri 命令

use crate::commands::pyo3_upscale_commands::PyO3UpscalerState;
use crate::core::pyo3_upscaler::UpscaleModel;
use crate::core::upscale_service::{
    TaskPriority, UpscaleService, UpscaleServiceConfig, UpscaleServiceStats, UpscaleTask,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

// ============================================================================
// State
// ============================================================================

/// 超分服务状态
pub struct UpscaleServiceState {
    pub service: Arc<Mutex<Option<UpscaleService>>>,
}

impl Default for UpscaleServiceState {
    fn default() -> Self {
        Self {
            service: Arc::new(Mutex::new(None)),
        }
    }
}

// ============================================================================
// Request Types
// ============================================================================

/// 超分请求
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpscaleRequest {
    pub book_path: String,
    pub page_index: usize,
    pub image_path: String,
    pub image_hash: String,
    #[serde(default)]
    pub priority: String,
    #[serde(default)]
    pub model_name: Option<String>,
    #[serde(default)]
    pub scale: Option<i32>,
    #[serde(default)]
    pub tile_size: Option<i32>,
    #[serde(default)]
    pub noise_level: Option<i32>,
}

/// 预加载请求
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreloadRangeRequest {
    pub book_path: String,
    pub center_index: usize,
    pub total_pages: usize,
    pub image_infos: Vec<ImageInfo>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    pub page_index: usize,
    pub image_path: String,
    pub hash: String,
}

// ============================================================================
// Commands
// ============================================================================

/// 初始化超分服务
#[tauri::command]
pub async fn upscale_service_init(
    app: AppHandle,
    state: State<'_, UpscaleServiceState>,
    pyo3_state: State<'_, PyO3UpscalerState>,
) -> Result<(), String> {
    let mut guard = state.service.lock().await;

    if guard.is_some() {
        return Ok(());
    }

    // 获取缓存目录
    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?
        .join("upscale_cache");

    let config = UpscaleServiceConfig::default();
    let py_state = Arc::new(pyo3_state.inner().clone());
    let mut service = UpscaleService::new(py_state, config, cache_dir);
    service.start(app);

    *guard = Some(service);

    log::info!("✅ UpscaleService 初始化完成");
    Ok(())
}

/// 启用/禁用超分
#[tauri::command]
pub async fn upscale_service_set_enabled(
    state: State<'_, UpscaleServiceState>,
    enabled: bool,
) -> Result<(), String> {
    let guard = state.service.lock().await;
    let service = guard.as_ref().ok_or("UpscaleService 未初始化")?;
    service.set_enabled(enabled);
    Ok(())
}

/// 检查是否启用
#[tauri::command]
pub async fn upscale_service_is_enabled(
    state: State<'_, UpscaleServiceState>,
) -> Result<bool, String> {
    let guard = state.service.lock().await;
    let service = guard.as_ref().ok_or("UpscaleService 未初始化")?;
    Ok(service.is_enabled())
}

/// 设置当前书籍
#[tauri::command]
pub async fn upscale_service_set_current_book(
    state: State<'_, UpscaleServiceState>,
    book_path: Option<String>,
) -> Result<(), String> {
    let guard = state.service.lock().await;
    let service = guard.as_ref().ok_or("UpscaleService 未初始化")?;
    service.set_current_book(book_path);
    Ok(())
}

/// 设置当前页面
#[tauri::command]
pub async fn upscale_service_set_current_page(
    state: State<'_, UpscaleServiceState>,
    page_index: usize,
) -> Result<(), String> {
    let guard = state.service.lock().await;
    let service = guard.as_ref().ok_or("UpscaleService 未初始化")?;
    service.set_current_page(page_index);
    Ok(())
}

/// 请求超分
#[tauri::command]
pub async fn upscale_service_request(
    state: State<'_, UpscaleServiceState>,
    request: UpscaleRequest,
) -> Result<(), String> {
    let guard = state.service.lock().await;
    let service = guard.as_ref().ok_or("UpscaleService 未初始化")?;

    let priority = match request.priority.as_str() {
        "current" => TaskPriority::Current,
        "preload" => TaskPriority::Preload,
        _ => TaskPriority::Background,
    };

    let model = UpscaleModel {
        model_id: 0, // 会在执行时解析
        model_name: request.model_name.unwrap_or_else(|| "cunet".to_string()),
        scale: request.scale.unwrap_or(2),
        tile_size: request.tile_size.unwrap_or(0),
        noise_level: request.noise_level.unwrap_or(0),
    };

    let task = UpscaleTask {
        book_path: request.book_path,
        page_index: request.page_index,
        image_path: request.image_path,
        is_archive: false,
        archive_path: None,
        image_hash: request.image_hash,
        priority,
        model,
        allow_cache: true,
        submitted_at: std::time::Instant::now(),
    };

    service.request_upscale(task)
}

/// 请求预加载范围
#[tauri::command]
pub async fn upscale_service_request_preload_range(
    state: State<'_, UpscaleServiceState>,
    request: PreloadRangeRequest,
) -> Result<(), String> {
    let guard = state.service.lock().await;
    let service = guard.as_ref().ok_or("UpscaleService 未初始化")?;

    let image_paths: Vec<(usize, String, String)> = request
        .image_infos
        .into_iter()
        .map(|info| (info.page_index, info.image_path, info.hash))
        .collect();

    let model = UpscaleModel::default();

    service.request_preload_range(
        &request.book_path,
        request.center_index,
        request.total_pages,
        &image_paths,
        &model,
    );

    Ok(())
}

/// 取消指定页面的超分
#[tauri::command]
pub async fn upscale_service_cancel_page(
    state: State<'_, UpscaleServiceState>,
    book_path: String,
    page_index: usize,
) -> Result<(), String> {
    let guard = state.service.lock().await;
    let service = guard.as_ref().ok_or("UpscaleService 未初始化")?;
    service.cancel_page(&book_path, page_index);
    Ok(())
}

/// 取消指定书籍的所有超分
#[tauri::command]
pub async fn upscale_service_cancel_book(
    state: State<'_, UpscaleServiceState>,
    book_path: String,
) -> Result<(), String> {
    let guard = state.service.lock().await;
    let service = guard.as_ref().ok_or("UpscaleService 未初始化")?;
    service.cancel_book(&book_path);
    Ok(())
}

/// 清除缓存
#[tauri::command]
pub async fn upscale_service_clear_cache(
    state: State<'_, UpscaleServiceState>,
    book_path: Option<String>,
) -> Result<(), String> {
    let guard = state.service.lock().await;
    let service = guard.as_ref().ok_or("UpscaleService 未初始化")?;
    service.clear_cache(book_path.as_deref());
    Ok(())
}

/// 获取统计信息
#[tauri::command]
pub async fn upscale_service_get_stats(
    state: State<'_, UpscaleServiceState>,
) -> Result<UpscaleServiceStats, String> {
    let guard = state.service.lock().await;
    let service = guard.as_ref().ok_or("UpscaleService 未初始化")?;
    Ok(service.get_stats())
}

/// 更新条件设置
#[tauri::command]
pub async fn upscale_service_update_conditions(
    state: State<'_, UpscaleServiceState>,
    enabled: bool,
    min_width: u32,
    min_height: u32,
    max_width: u32,
    max_height: u32,
) -> Result<(), String> {
    use crate::core::upscale_settings::ConditionalUpscaleSettings;

    let guard = state.service.lock().await;
    let service = guard.as_ref().ok_or("UpscaleService 未初始化")?;

    let settings = ConditionalUpscaleSettings {
        enabled,
        min_width,
        min_height,
        max_width,
        max_height,
        aspect_ratio_condition: None,
    };

    service.update_condition_settings(settings);
    Ok(())
}

/// 停止服务
#[tauri::command]
pub async fn upscale_service_stop(
    state: State<'_, UpscaleServiceState>,
) -> Result<(), String> {
    let guard = state.service.lock().await;
    if let Some(service) = guard.as_ref() {
        service.stop();
    }
    Ok(())
}
