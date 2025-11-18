//! Comparison Commands
//! 比较模式相关的 Tauri 命令

use super::task_queue_commands::BackgroundSchedulerState;
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonPrepareRequest {
    /// 图片二进制数据
    pub image_data: Vec<u8>,
    /// MIME 类型（例如 "image/jpeg", "image/png"）
    pub mime_type: String,
    /// 可选的页面索引（用于日志）
    pub page_index: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonPrepareResponse {
    /// 生成的 DataURL
    pub data_url: String,
}

/// 准备比较模式预览（将 Blob 转换为 DataURL）
/// 通过 Rust 调度器执行，避免阻塞主线程
#[tauri::command]
pub async fn prepare_comparison_preview(
    request: ComparisonPrepareRequest,
    scheduler: State<'_, BackgroundSchedulerState>,
) -> Result<ComparisonPrepareResponse, String> {
    let job_source = format!(
        "comparison-viewer:page-{}",
        request.page_index.unwrap_or(0)
    );
    let image_data = request.image_data.clone();
    let mime_type = request.mime_type.clone();

    let data_url = scheduler
        .scheduler
        .enqueue_blocking("comparison-prepare", job_source, move || {
            // 将二进制数据编码为 base64
            let base64_data = general_purpose::STANDARD.encode(&image_data);
            // 构造 DataURL
            let data_url = format!("data:{};base64,{}", mime_type, base64_data);
            Ok::<String, String>(data_url)
        })
        .await?;

    Ok(ComparisonPrepareResponse { data_url })
}

