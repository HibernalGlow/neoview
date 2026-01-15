//! NeoView - Directory Streaming Commands
//! 流式目录加载的 Tauri 命令
//!
//! 参考 Spacedrive 的流式加载架构实现

use crate::core::directory_stream::{
    DirectoryBatch, DirectoryScanner, DirectoryStreamOutput, StreamComplete, StreamError,
    StreamManagerState, StreamOptions, StreamProgress,
};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{ipc::Channel, State};
use tokio::sync::mpsc;

/// 流式浏览目录（Spacedrive 风格）
///
/// 使用 Tauri Channel 实现真正的流式数据推送
/// 前端可以通过 channel 接收批次数据
#[tauri::command]
pub async fn stream_directory_v2(
    path: String,
    options: Option<StreamOptions>,
    channel: Channel<DirectoryStreamOutput>,
    state: State<'_, StreamManagerState>,
) -> Result<String, String> {
    let path_buf = PathBuf::from(&path);

    // 验证路径
    if !path_buf.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    if !path_buf.is_dir() {
        return Err(format!("路径不是目录: {}", path));
    }

    // 创建流（支持去重）
    let (stream_id, handle, is_reused) = state.manager.create_stream(&path_buf);

    if is_reused {
        log::info!("复用已有流: {} for {}", stream_id, path);
        return Ok(stream_id);
    }

    log::info!("创建新流: {} for {}", stream_id, path);

    // 创建扫描器
    let options = options.unwrap_or_default();
    let scanner = DirectoryScanner::from_options(&options);

    // 创建内部 channel 用于接收扫描结果
    let (tx, mut rx) = mpsc::channel::<DirectoryStreamOutput>(32);

    // 启动扫描任务
    let scan_handle = Arc::clone(&handle);
    let scan_path = path_buf.clone();
    tokio::spawn(async move {
        scanner.scan_streaming(scan_path, scan_handle, tx).await;
    });

    // 启动转发任务：将内部 channel 的数据转发到 Tauri Channel
    let stream_id_clone = stream_id.clone();
    let manager = Arc::clone(&state.manager);
    tokio::spawn(async move {
        while let Some(output) = rx.recv().await {
            let is_complete = matches!(output, DirectoryStreamOutput::Complete(_));

            // 发送到前端
            if let Err(e) = channel.send(output) {
                log::error!("发送到 channel 失败: {}", e);
                break;
            }

            // 完成后清理
            if is_complete {
                manager.remove_stream(&stream_id_clone);
                break;
            }
        }
    });

    Ok(stream_id)
}

/// 取消目录流（V2 版本）
#[tauri::command]
pub async fn cancel_directory_stream_v2(
    stream_id: String,
    state: State<'_, StreamManagerState>,
) -> Result<bool, String> {
    let cancelled = state.manager.cancel_stream(&stream_id);
    if cancelled {
        log::info!("已取消流: {}", stream_id);
    }
    Ok(cancelled)
}

/// 取消指定路径的所有流
#[tauri::command]
pub async fn cancel_streams_for_path(
    path: String,
    state: State<'_, StreamManagerState>,
) -> Result<usize, String> {
    let path_buf = PathBuf::from(&path);
    let count = state.manager.cancel_streams_for_path(&path_buf);
    if count > 0 {
        log::info!("已取消 {} 个流 for {}", count, path);
    }
    Ok(count)
}

/// 获取活动流数量
#[tauri::command]
pub async fn get_active_stream_count(
    state: State<'_, StreamManagerState>,
) -> Result<usize, String> {
    Ok(state.manager.active_count())
}

// ============================================================================
// 流式搜索命令
// ============================================================================

use std::path::Path;

/// 流式搜索输出
#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", content = "data")]
pub enum SearchStreamOutput {
    /// 搜索结果批次
    Batch(DirectoryBatch),
    /// 进度更新
    Progress(StreamProgress),
    /// 错误信息
    Error(StreamError),
    /// 完成信号
    Complete(StreamComplete),
}

/// 流式搜索目录
///
/// 边搜索边返回结果，首批结果 200ms 内显示
#[tauri::command]
pub async fn stream_search_v2(
    path: String,
    query: String,
    options: Option<StreamOptions>,
    channel: Channel<SearchStreamOutput>,
    state: State<'_, StreamManagerState>,
) -> Result<String, String> {
    use crate::core::fs_manager::FsItem;
    use jwalk::WalkDir;
    use std::time::Instant;

    let path_buf = PathBuf::from(&path);

    // 验证路径
    if !path_buf.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    if !path_buf.is_dir() {
        return Err(format!("路径不是目录: {}", path));
    }

    // 创建流
    let (stream_id, handle, is_reused) = state.manager.create_stream(&path_buf);

    if is_reused {
        log::info!("复用已有搜索流: {} for {}", stream_id, path);
        return Ok(stream_id);
    }

    log::info!("创建搜索流: {} for {} query={}", stream_id, path, query);

    let options = options.unwrap_or_default();
    let batch_size = options.batch_size.unwrap_or(15).clamp(10, 50);
    let skip_hidden = options.skip_hidden.unwrap_or(true);
    let query_lower = query.to_lowercase();

    // 启动搜索任务
    let manager = Arc::clone(&state.manager);
    let stream_id_clone = stream_id.clone();

    tokio::spawn(async move {
        let start_time = Instant::now();
        let mut batch: Vec<FsItem> = Vec::with_capacity(batch_size);
        let mut batch_index = 0usize;
        let mut total_found = 0usize;
        let mut total_scanned = 0usize;
        let mut skipped_count = 0usize;

        // 使用 jwalk 递归搜索
        let walker = WalkDir::new(&path_buf).skip_hidden(skip_hidden).into_iter();

        for entry_result in walker {
            // 检查取消
            if handle.is_cancelled() {
                log::info!("搜索流 {} 已取消", stream_id_clone);
                break;
            }

            total_scanned += 1;

            match entry_result {
                Ok(entry) => {
                    let entry_path = entry.path();
                    let name = entry.file_name().to_string_lossy().to_lowercase();

                    // 检查是否匹配
                    if name.contains(&query_lower) {
                        let metadata = match entry.metadata() {
                            Ok(m) => m,
                            Err(_) => {
                                skipped_count += 1;
                                continue;
                            }
                        };

                        let item = FsItem {
                            path: entry_path.to_string_lossy().to_string(),
                            name: entry.file_name().to_string_lossy().to_string(),
                            is_dir: metadata.is_dir(),
                            is_image: is_image_file(&entry_path),
                            size: metadata.len(),
                            modified: metadata
                                .modified()
                                .ok()
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| d.as_secs()),
                            created: metadata
                                .created()
                                .ok()
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| d.as_secs()),
                            folder_count: None,
                            image_count: None,
                            archive_count: None,
                            video_count: None,
                            target_path: None,
                        };

                        batch.push(item);
                        total_found += 1;

                        // 达到批次大小，发送批次
                        if batch.len() >= batch_size {
                            let batch_data = DirectoryBatch {
                                items: std::mem::take(&mut batch),
                                batch_index,
                            };
                            batch_index += 1;

                            if channel.send(SearchStreamOutput::Batch(batch_data)).is_err() {
                                break;
                            }

                            // 发送进度
                            let progress = StreamProgress {
                                loaded: total_found,
                                estimated_total: None,
                                elapsed_ms: start_time.elapsed().as_millis() as u64,
                            };
                            let _ = channel.send(SearchStreamOutput::Progress(progress));
                        }
                    }
                }
                Err(e) => {
                    skipped_count += 1;
                    log::debug!("搜索跳过: {}", e);
                }
            }

            // 每扫描 100 项让出 CPU
            if total_scanned % 100 == 0 {
                tokio::task::yield_now().await;
            }
        }

        // 发送剩余批次
        if !batch.is_empty() && !handle.is_cancelled() {
            let batch_data = DirectoryBatch {
                items: batch,
                batch_index,
            };
            let _ = channel.send(SearchStreamOutput::Batch(batch_data));
        }

        // 发送完成信号
        if !handle.is_cancelled() {
            let complete = StreamComplete {
                total_items: total_found,
                skipped_items: skipped_count,
                elapsed_ms: start_time.elapsed().as_millis() as u64,
                from_cache: false,
            };
            let _ = channel.send(SearchStreamOutput::Complete(complete));
        }

        // 清理流
        manager.remove_stream(&stream_id_clone);
    });

    Ok(stream_id)
}

/// 检查是否为图片文件
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
