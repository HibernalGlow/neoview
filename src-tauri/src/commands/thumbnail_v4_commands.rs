//! 统一缩略图 V4 命令
//!
//! 替代旧的两套缩略图系统（文件浏览 + 阅读页底栏）

use tauri::{AppHandle, Emitter, State};
use crate::core::thumbnail_service_v4::types::*;
use crate::core::thumbnail_service_v4::UnifiedThumbnailService;
use std::sync::Arc;
use tokio::sync::RwLock;

/// V4 服务状态
pub struct ThumbnailV4State {
    pub service: Arc<RwLock<UnifiedThumbnailService>>,
}

/// 请求缩略图
#[tauri::command]
pub async fn thumb_v4_request(
    params: RequestThumbnailsParams,
    app: AppHandle,
    state: State<'_, ThumbnailV4State>,
) -> Result<(), String> {
    log::debug!("🖼️ [ThumbV4] request: {} items, lane={}", params.items.len(), params.lane);
    let service = Arc::clone(&state.service);
    tauri::async_runtime::spawn(async move {
        let lane = params.lane;
        let chunk_size = request_chunk_size(lane);
        for chunk in params.items.chunks(chunk_size) {
            let items = {
                let service = service.read().await;
                service.generate_thumbnails(chunk.to_vec(), lane).await
            };

            if items.is_empty() {
                continue;
            }

            if let Err(err) = app.emit("thumbnail-batch-ready", ThumbnailBatchReadyEvent { items }) {
                log::warn!("🖼️ [ThumbV4] emit thumbnail-batch-ready failed: {}", err);
                break;
            }
        }
    });
    Ok(())
}

fn request_chunk_size(lane: ThumbnailLane) -> usize {
    match lane {
        ThumbnailLane::Visible | ThumbnailLane::ReaderVisible => 16,
        ThumbnailLane::Prefetch => 16,
        ThumbnailLane::Background => 8,
    }
}

/// 取消上下文
#[tauri::command]
pub async fn thumb_v4_cancel_context(
    context_id: String,
    state: State<'_, ThumbnailV4State>,
) -> Result<(), String> {
    log::debug!("🖼️ [ThumbV4] cancel_context: {}", context_id);
    let service = state.service.read().await;
    service.cancel_context(&context_id).await;
    Ok(())
}

/// 获取缩略图协议 URL
#[tauri::command]
pub async fn thumb_v4_get_url(
    key: String,
    version: u32,
    state: State<'_, ThumbnailV4State>,
) -> Result<String, String> {
    let service = state.service.read().await;
    Ok(service.get_protocol_url(&key, version))
}

/// 获取队列状态
#[tauri::command]
pub async fn thumb_v4_queue_status(
    state: State<'_, ThumbnailV4State>,
) -> Result<usize, String> {
    let service = state.service.read().await;
    Ok(service.queue_len().await)
}

/// 获取命令列表
pub fn get_thumbnail_v4_commands() -> Vec<&'static str> {
    vec![
        "thumb_v4_request",
        "thumb_v4_cancel_context",
        "thumb_v4_get_url",
        "thumb_v4_queue_status",
    ]
}
