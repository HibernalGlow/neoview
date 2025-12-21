//! 图片流式加载命令
//!
//! 使用 Tauri Channel 实现大图片的流式传输
//! 边解压边传输，真正的流式读取

use base64::{engine::general_purpose::STANDARD, Engine};
use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{ipc::Channel, State};
use tokio::sync::mpsc;

use crate::commands::fs_commands::FsState;
use crate::core::archive::ArchiveFormat;

/// 流式传输块大小 (64KB，更小的块减少首字节延迟)
const STREAM_CHUNK_SIZE: usize = 64 * 1024;

/// 图片流输出类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ImageStreamOutput {
    /// 数据块
    Chunk {
        /// 块索引
        index: usize,
        /// Base64 编码的数据
        data: String,
        /// 块大小（字节）
        size: usize,
        /// 预估总大小（如果已知）
        estimated_total: Option<usize>,
    },
    /// 传输完成
    Complete {
        /// 总字节数
        total_bytes: usize,
        /// 总块数
        total_chunks: usize,
        /// 耗时（毫秒）
        elapsed_ms: u64,
    },
    /// 错误
    Error {
        message: String,
    },
}

/// 流式加载压缩包图片（真正的流式读取）
///
/// 边解压边通过 Channel 推送数据块
/// 前端可以边接收边解码，实现渐进式加载
#[tauri::command]
pub async fn stream_image_from_archive(
    archive_path: String,
    file_path: String,
    channel: Channel<ImageStreamOutput>,
    state: State<'_, FsState>,
) -> Result<(), String> {
    let start = std::time::Instant::now();
    let archive_path_buf = PathBuf::from(&archive_path);
    let inner_path = file_path.clone();

    info!(
        "📥 [ImageStream] 开始流式加载: archive={} inner={}",
        archive_path, file_path
    );

    // 检测压缩包格式
    let format = ArchiveFormat::from_extension(&archive_path_buf);
    
    // 只有 ZIP 支持真正的流式读取
    // RAR 和 7z 需要完整解压后再分块发送
    if format != ArchiveFormat::Zip {
        return stream_non_zip_archive(
            archive_path_buf,
            inner_path,
            channel,
            state,
            start,
        ).await;
    }

    // ZIP: 真正的流式读取
    let archive_manager = Arc::clone(&state.archive_manager);
    
    // 创建内部 channel 用于从阻塞线程发送数据
    let (tx, mut rx) = mpsc::channel::<ImageStreamOutput>(16);
    
    // 在阻塞线程中执行流式解压
    let archive_path_clone = archive_path_buf.clone();
    let inner_path_clone = inner_path.clone();
    tokio::task::spawn_blocking(move || {
        let result = stream_zip_file(
            &archive_manager,
            &archive_path_clone,
            &inner_path_clone,
            tx.clone(),
            start,
        );
        
        if let Err(e) = result {
            let _ = tx.blocking_send(ImageStreamOutput::Error {
                message: e,
            });
        }
    });

    // 转发数据到 Tauri Channel
    while let Some(output) = rx.recv().await {
        let is_done = matches!(output, ImageStreamOutput::Complete { .. } | ImageStreamOutput::Error { .. });
        
        if let Err(e) = channel.send(output) {
            warn!("⚠️ [ImageStream] 发送到 channel 失败: {}", e);
            break;
        }
        
        if is_done {
            break;
        }
    }

    Ok(())
}

/// ZIP 文件流式读取（边解压边发送）
fn stream_zip_file(
    archive_manager: &Arc<std::sync::Mutex<crate::core::ArchiveManager>>,
    archive_path: &PathBuf,
    file_path: &str,
    tx: mpsc::Sender<ImageStreamOutput>,
    start: std::time::Instant,
) -> Result<(), String> {
    let manager = archive_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    
    // 获取缓存的压缩包实例
    let cached_archive = manager.get_cached_archive(archive_path)?;
    let mut archive = cached_archive.lock().unwrap();
    
    // 获取文件
    let mut zip_file = archive
        .by_name(file_path)
        .map_err(|e| format!("在压缩包中找不到文件: {}", e))?;
    
    // 获取预估大小（解压后大小）
    let estimated_total = Some(zip_file.size() as usize);
    
    info!(
        "📦 [ImageStream] ZIP 流式读取开始: file={} estimated_size={:?}",
        file_path, estimated_total
    );
    
    // 流式读取并发送
    let mut buffer = vec![0u8; STREAM_CHUNK_SIZE];
    let mut chunk_index = 0;
    let mut total_bytes = 0;
    
    loop {
        let bytes_read = zip_file
            .read(&mut buffer)
            .map_err(|e| format!("读取文件失败: {}", e))?;
        
        if bytes_read == 0 {
            break; // EOF
        }
        
        total_bytes += bytes_read;
        
        // Base64 编码并发送
        let encoded = STANDARD.encode(&buffer[..bytes_read]);
        let output = ImageStreamOutput::Chunk {
            index: chunk_index,
            data: encoded,
            size: bytes_read,
            estimated_total,
        };
        
        if tx.blocking_send(output).is_err() {
            warn!("⚠️ [ImageStream] 接收端已关闭");
            return Ok(());
        }
        
        chunk_index += 1;
    }
    
    // 发送完成信号
    let elapsed = start.elapsed();
    let _ = tx.blocking_send(ImageStreamOutput::Complete {
        total_bytes,
        total_chunks: chunk_index,
        elapsed_ms: elapsed.as_millis() as u64,
    });
    
    info!(
        "📤 [ImageStream] ZIP 流式读取完成: bytes={} chunks={} elapsed={}ms",
        total_bytes, chunk_index, elapsed.as_millis()
    );
    
    Ok(())
}

/// 非 ZIP 格式的流式传输（先解压再分块发送）
async fn stream_non_zip_archive(
    archive_path: PathBuf,
    file_path: String,
    channel: Channel<ImageStreamOutput>,
    state: State<'_, FsState>,
    start: std::time::Instant,
) -> Result<(), String> {
    let archive_manager = Arc::clone(&state.archive_manager);
    
    // 在阻塞线程中完整解压
    let result = tokio::task::spawn_blocking(move || {
        let manager = archive_manager
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        manager.load_image_from_archive_binary(&archive_path, &file_path)
    })
    .await
    .map_err(|e| format!("spawn_blocking error: {}", e))?;
    
    match result {
        Ok(bytes) => {
            let total_bytes = bytes.len();
            let chunks: Vec<&[u8]> = bytes.chunks(STREAM_CHUNK_SIZE).collect();
            let total_chunks = chunks.len();
            
            for (i, chunk) in chunks.iter().enumerate() {
                let encoded = STANDARD.encode(chunk);
                channel
                    .send(ImageStreamOutput::Chunk {
                        index: i,
                        data: encoded,
                        size: chunk.len(),
                        estimated_total: Some(total_bytes),
                    })
                    .map_err(|e| format!("发送块 {} 失败: {}", i, e))?;
            }
            
            let elapsed = start.elapsed();
            channel
                .send(ImageStreamOutput::Complete {
                    total_bytes,
                    total_chunks,
                    elapsed_ms: elapsed.as_millis() as u64,
                })
                .map_err(|e| format!("发送完成信号失败: {}", e))?;
            
            Ok(())
        }
        Err(err) => {
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
    size > STREAM_CHUNK_SIZE * 2 // 超过 128KB 使用流式
}
