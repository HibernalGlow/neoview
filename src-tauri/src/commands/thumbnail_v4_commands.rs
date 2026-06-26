//! 统一缩略图 V4 命令
//!
//! 替代旧的两套缩略图系统（文件浏览 + 阅读页底栏）

use crate::core::thumbnail_service_v4::types::*;
use crate::core::thumbnail_service_v4::UnifiedThumbnailService;
use std::sync::{Arc, LazyLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{RwLock, Semaphore};

const MAX_THUMB_V4_WORKERS: usize = 6;
const WORKER_IDLE_GRACE_ROUNDS: usize = 3;
const WORKER_IDLE_GRACE_MS: u64 = 25;

static THUMB_V4_WORKER_SEMAPHORE: LazyLock<Arc<Semaphore>> =
    LazyLock::new(|| Arc::new(Semaphore::new(MAX_THUMB_V4_WORKERS)));

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
    log::debug!(
        "🖼️ [ThumbV4] request: {} items, lane={}",
        params.items.len(),
        params.lane
    );
    let service = Arc::clone(&state.service);
    tauri::async_runtime::spawn(async move {
        {
            let service_guard = service.read().await;
            service_guard.request_thumbnails(params).await;
        }
        spawn_thumbnail_workers(app, service);
    });
    Ok(())
}

fn spawn_thumbnail_workers(app: AppHandle, service: Arc<RwLock<UnifiedThumbnailService>>) {
    for _ in 0..MAX_THUMB_V4_WORKERS {
        let Ok(permit) = THUMB_V4_WORKER_SEMAPHORE.clone().try_acquire_owned() else {
            break;
        };

        let app = app.clone();
        let service = Arc::clone(&service);
        tauri::async_runtime::spawn(async move {
            let _permit = permit;
            let mut idle_rounds = 0;

            loop {
                let ready_items = {
                    let service_guard = service.read().await;
                    service_guard.process_next_queued().await
                };

                match ready_items {
                    Some(items) => {
                        idle_rounds = 0;
                        if items.is_empty() {
                            continue;
                        }
                        if app
                            .emit("thumbnail-batch-ready", ThumbnailBatchReadyEvent { items })
                            .is_err()
                        {
                            break;
                        }
                    }
                    None => {
                        if idle_rounds >= WORKER_IDLE_GRACE_ROUNDS {
                            break;
                        }
                        idle_rounds += 1;
                        tokio::time::sleep(Duration::from_millis(WORKER_IDLE_GRACE_MS)).await;
                    }
                }
            }
        });
    }
}

/// 取消上下文
#[tauri::command]
pub async fn thumb_v4_cancel_context(
    context_id: String,
    generation: u32,
    state: State<'_, ThumbnailV4State>,
) -> Result<(), String> {
    log::debug!("🖼️ [ThumbV4] cancel_context: {}", context_id);
    let service = state.service.read().await;
    service.cancel_context(&context_id, generation).await;
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
pub async fn thumb_v4_queue_status(state: State<'_, ThumbnailV4State>) -> Result<usize, String> {
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
