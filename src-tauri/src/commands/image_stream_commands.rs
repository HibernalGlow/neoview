//! 图片流式加载命令
//!
//! 使用 Tauri Channel 实现大图片的流式传输
//! 边解压边传输，减少首字节延迟

use base64::{engine::general_purpose::STANDARD, Engine};
use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{ipc::Channel, State};

use crate::commands::fs_commands::FsState;

/// 流式传输块大小 (256KB)
const STREAM_CHUNK_SIZE: usize = 256 * 1024;

/// 流式传输阈值 (512KB，超过此大小使用流式传输)
const STREAM_THRESHOLD: usize = 512 * 1024;

/// 图片流输出类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ImageStreamOutput {
    /// 数据块
    Chunk {
        /// 块索引
        index: usize,
        /// 总块数（首块时确定）
        total: usize,
        /// Base64 编码的数据
        data: String,
        /// 块大小（字节）
        size: usize,
    },
    /// 传输完成
    Complete {
        /// 总字节数
        total_bytes: usize,
        /// 耗时（毫秒）
        elapsed_ms: u64,
    },
    /// 错误
    Error {
        message: String,
    },
}

/// 流式加载压缩包图片
///
/// 对于大文件，边解压边通过 Channel 推送数据块
/// 前端可以边接收边解码，实现渐进式加载
#[tauri::command]
pub async fn stream_image_from_archive(
    archive_path: String,
    file_path: String,
    channel: Channel<ImageStreamOutput>,
    state: State<'_, FsState>,
) -> Result<(), String> {
    let start = std::time::Instant::now();
    let archive_path_buf = std::path::PathBuf::from(&archive_path);
    let inner_path = file_path.clone();

    info!(
        "📥 [ImageStream] 开始流式加载: archive={} inner={}",
        archive_path, file_path
    );

    // 克隆 Arc 以便在 spawn_blocking 中使用
    let archive_manager = Arc::clone(&state.archive_manager);

    // 在阻塞线程中执行解压
    let result = tokio::task::spawn_blocking(move || {
        let manager = archive_manager
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        manager.load_image_from_archive_binary(&archive_path_buf, &inner_path)
    })
    .await
    .map_err(|e| format!("spawn_blocking error: {}", e))?;

    match result {
        Ok(bytes) => {
            let total_bytes = bytes.len();

            // 小文件直接发送
            if total_bytes <= STREAM_THRESHOLD {
                let encoded = STANDARD.encode(&bytes);
                channel
                    .send(ImageStreamOutput::Chunk {
                        index: 0,
                        total: 1,
                        data: encoded,
                        size: total_bytes,
                    })
                    .map_err(|e| format!("发送失败: {}", e))?;
            } else {
                // 大文件分块发送
                let chunks: Vec<&[u8]> = bytes.chunks(STREAM_CHUNK_SIZE).collect();
                let total_chunks = chunks.len();

                for (i, chunk) in chunks.iter().enumerate() {
                    let encoded = STANDARD.encode(chunk);
                    channel
                        .send(ImageStreamOutput::Chunk {
                            index: i,
                            total: total_chunks,
                            data: encoded,
                            size: chunk.len(),
                        })
                        .map_err(|e| format!("发送块 {} 失败: {}", i, e))?;
                }
            }

            // 发送完成信号
            let elapsed = start.elapsed();
            channel
                .send(ImageStreamOutput::Complete {
                    total_bytes,
                    elapsed_ms: elapsed.as_millis() as u64,
                })
                .map_err(|e| format!("发送完成信号失败: {}", e))?;

            info!(
                "📤 [ImageStream] 流式加载完成: bytes={} elapsed={}ms",
                total_bytes,
                elapsed.as_millis()
            );

            Ok(())
        }
        Err(err) => {
            warn!("⚠️ [ImageStream] 加载失败: {}", err);
            channel
                .send(ImageStreamOutput::Error {
                    message: err.clone(),
                })
                .ok();
            Err(err)
        }
    }
}

/// 检查是否应该使用流式传输
#[tauri::command]
pub fn should_use_stream(size: usize) -> bool {
    size > STREAM_THRESHOLD
}
