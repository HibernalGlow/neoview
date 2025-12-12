//! NeoView - Directory Streaming Module
//! 参考 Spacedrive 的流式加载架构实现目录流式扫描
//!
//! 核心特性：
//! - 批量流式返回（每 15-50 项一批）
//! - 支持取消操作
//! - 进度报告
//! - 权限错误优雅处理

use crate::core::fs_manager::FsItem;
use dashmap::DashMap;
use jwalk::WalkDir;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::mpsc;

/// 默认批次大小（参考 Spacedrive 的 MAX_POLLS = 15）
pub const DEFAULT_BATCH_SIZE: usize = 15;
/// 最大批次大小
pub const MAX_BATCH_SIZE: usize = 50;
/// 最小批次大小
pub const MIN_BATCH_SIZE: usize = 10;

// ============================================================================
// 数据结构定义
// ============================================================================

/// 流式输出枚举 - 参考 Spacedrive 的 unsafe_streamed_query.rs
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "data")]
pub enum DirectoryStreamOutput {
    /// 数据批次
    Batch(DirectoryBatch),
    /// 进度更新
    Progress(StreamProgress),
    /// 错误信息（非致命，继续扫描）
    Error(StreamError),
    /// 完成信号
    Complete(StreamComplete),
}

/// 目录批次数据
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryBatch {
    /// 文件系统项列表
    pub items: Vec<FsItem>,
    /// 批次索引（从 0 开始）
    pub batch_index: usize,
}

/// 流进度信息
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamProgress {
    /// 已加载项数
    pub loaded: usize,
    /// 预估总数（如果可用）
    pub estimated_total: Option<usize>,
    /// 已用时间（毫秒）
    pub elapsed_ms: u64,
}

/// 流错误信息（非致命）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamError {
    /// 错误消息
    pub message: String,
    /// 受影响的路径
    pub path: Option<String>,
    /// 已跳过的条目数
    pub skipped_count: usize,
}

/// 流完成信号
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamComplete {
    /// 总项数
    pub total_items: usize,
    /// 跳过的项数
    pub skipped_items: usize,
    /// 总耗时（毫秒）
    pub elapsed_ms: u64,
    /// 是否来自缓存
    pub from_cache: bool,
}

/// 流配置选项
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StreamOptions {
    /// 批次大小（默认 15）
    pub batch_size: Option<usize>,
    /// 是否跳过隐藏文件
    pub skip_hidden: Option<bool>,
    /// 排序字段
    pub sort_by: Option<String>,
    /// 排序顺序
    pub sort_order: Option<String>,
}

// ============================================================================
// 流管理器
// ============================================================================

/// 流句柄 - 用于跟踪活动流
#[derive(Debug)]
pub struct StreamHandle {
    /// 流 ID
    pub id: String,
    /// 目录路径
    pub path: PathBuf,
    /// 取消标志
    pub cancelled: Arc<AtomicBool>,
    /// 开始时间
    pub started_at: Instant,
}

impl StreamHandle {
    /// 检查流是否已取消
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    /// 取消流
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }
}

/// 流管理器 - 管理所有活动流的生命周期
pub struct StreamManager {
    /// 活动流映射（stream_id -> StreamHandle）
    active_streams: DashMap<String, Arc<StreamHandle>>,
    /// 路径到流 ID 的映射（用于去重）
    path_to_stream: DashMap<String, String>,
    /// 流 ID 计数器
    counter: AtomicU64,
}

impl Default for StreamManager {
    fn default() -> Self {
        Self::new()
    }
}

impl StreamManager {
    /// 创建新的流管理器
    pub fn new() -> Self {
        Self {
            active_streams: DashMap::new(),
            path_to_stream: DashMap::new(),
            counter: AtomicU64::new(0),
        }
    }

    /// 创建新流，返回流 ID 和取消标志
    /// 如果同一路径已有活动流，返回现有流（去重）
    pub fn create_stream(&self, path: &Path) -> (String, Arc<StreamHandle>, bool) {
        let path_str = path.to_string_lossy().to_string();

        // 检查是否已有同路径的流（去重）
        if let Some(existing_id) = self.path_to_stream.get(&path_str) {
            if let Some(handle) = self.active_streams.get(existing_id.value()) {
                if !handle.is_cancelled() {
                    return (existing_id.clone(), Arc::clone(&handle), true);
                }
            }
        }

        // 创建新流
        let stream_id = format!("stream_{}", self.counter.fetch_add(1, Ordering::SeqCst));
        let handle = Arc::new(StreamHandle {
            id: stream_id.clone(),
            path: path.to_path_buf(),
            cancelled: Arc::new(AtomicBool::new(false)),
            started_at: Instant::now(),
        });

        self.active_streams.insert(stream_id.clone(), Arc::clone(&handle));
        self.path_to_stream.insert(path_str, stream_id.clone());

        (stream_id, handle, false)
    }

    /// 取消指定流
    pub fn cancel_stream(&self, stream_id: &str) -> bool {
        if let Some(handle) = self.active_streams.get(stream_id) {
            handle.cancel();
            true
        } else {
            false
        }
    }

    /// 取消指定路径的所有流
    pub fn cancel_streams_for_path(&self, path: &Path) -> usize {
        let path_str = path.to_string_lossy().to_string();
        let mut cancelled = 0;

        if let Some((_, stream_id)) = self.path_to_stream.remove(&path_str) {
            if let Some(handle) = self.active_streams.get(&stream_id) {
                handle.cancel();
                cancelled += 1;
            }
        }

        cancelled
    }

    /// 移除已完成的流
    pub fn remove_stream(&self, stream_id: &str) {
        if let Some((_, handle)) = self.active_streams.remove(stream_id) {
            let path_str = handle.path.to_string_lossy().to_string();
            self.path_to_stream.remove(&path_str);
        }
    }

    /// 获取活动流数量
    pub fn active_count(&self) -> usize {
        self.active_streams.len()
    }
}

// ============================================================================
// 目录扫描器
// ============================================================================

/// 目录扫描器 - 执行实际的目录扫描
pub struct DirectoryScanner {
    /// 批次大小
    batch_size: usize,
    /// 是否跳过隐藏文件
    skip_hidden: bool,
}

impl Default for DirectoryScanner {
    fn default() -> Self {
        Self::new(DEFAULT_BATCH_SIZE, true)
    }
}

impl DirectoryScanner {
    /// 创建新的扫描器
    pub fn new(batch_size: usize, skip_hidden: bool) -> Self {
        let batch_size = batch_size.clamp(MIN_BATCH_SIZE, MAX_BATCH_SIZE);
        Self {
            batch_size,
            skip_hidden,
        }
    }

    /// 从选项创建扫描器
    pub fn from_options(options: &StreamOptions) -> Self {
        Self::new(
            options.batch_size.unwrap_or(DEFAULT_BATCH_SIZE),
            options.skip_hidden.unwrap_or(true),
        )
    }

    /// 流式扫描目录
    /// 返回一个 channel receiver，调用者可以异步接收批次
    pub async fn scan_streaming(
        &self,
        path: PathBuf,
        handle: Arc<StreamHandle>,
        tx: mpsc::Sender<DirectoryStreamOutput>,
    ) {
        let batch_size = self.batch_size;
        let skip_hidden = self.skip_hidden;
        let start_time = Instant::now();

        // 在阻塞线程中执行扫描
        let result = tokio::task::spawn_blocking(move || {
            Self::scan_blocking(path, batch_size, skip_hidden, handle, tx, start_time)
        })
        .await;

        if let Err(e) = result {
            log::error!("Directory scan task failed: {}", e);
        }
    }

    /// 阻塞式扫描（在 spawn_blocking 中执行）
    fn scan_blocking(
        path: PathBuf,
        batch_size: usize,
        skip_hidden: bool,
        handle: Arc<StreamHandle>,
        tx: mpsc::Sender<DirectoryStreamOutput>,
        start_time: Instant,
    ) {
        let mut batch: Vec<FsItem> = Vec::with_capacity(batch_size);
        let mut batch_index = 0usize;
        let mut total_loaded = 0usize;
        let mut skipped_count = 0usize;

        // 使用 jwalk 并行遍历（深度 1，只扫描直接子项）
        let walker = WalkDir::new(&path)
            .min_depth(1)
            .max_depth(1)
            .skip_hidden(skip_hidden);

        for entry_result in walker {
            // 检查取消
            if handle.is_cancelled() {
                log::info!("Stream {} cancelled", handle.id);
                break;
            }

            match entry_result {
                Ok(entry) => {
                    let entry_path = entry.path();

                    // 获取元数据
                    let metadata = match entry.metadata() {
                        Ok(m) => m,
                        Err(e) => {
                            log::debug!("跳过无法获取元数据的条目 {:?}: {}", entry_path, e);
                            skipped_count += 1;
                            continue;
                        }
                    };

                    // 构建 FsItem
                    let item = Self::build_fs_item(&entry_path, &metadata);
                    batch.push(item);
                    total_loaded += 1;

                    // 达到批次大小，发送批次
                    if batch.len() >= batch_size {
                        let batch_data = DirectoryBatch {
                            items: std::mem::take(&mut batch),
                            batch_index,
                        };
                        batch_index += 1;

                        if tx.blocking_send(DirectoryStreamOutput::Batch(batch_data)).is_err() {
                            log::debug!("Stream receiver dropped");
                            return;
                        }

                        // 发送进度
                        let progress = StreamProgress {
                            loaded: total_loaded,
                            estimated_total: None,
                            elapsed_ms: start_time.elapsed().as_millis() as u64,
                        };
                        let _ = tx.blocking_send(DirectoryStreamOutput::Progress(progress));

                        // 让出 CPU（参考 Spacedrive 的防饥饿设计）
                        std::thread::yield_now();
                    }
                }
                Err(e) => {
                    log::debug!("扫描条目错误: {}", e);
                    skipped_count += 1;

                    // 发送非致命错误
                    let error = StreamError {
                        message: e.to_string(),
                        path: None,
                        skipped_count,
                    };
                    let _ = tx.blocking_send(DirectoryStreamOutput::Error(error));
                }
            }
        }

        // 发送剩余批次
        if !batch.is_empty() && !handle.is_cancelled() {
            let batch_data = DirectoryBatch {
                items: batch,
                batch_index,
            };
            let _ = tx.blocking_send(DirectoryStreamOutput::Batch(batch_data));
        }

        // 发送完成信号
        if !handle.is_cancelled() {
            let complete = StreamComplete {
                total_items: total_loaded,
                skipped_items: skipped_count,
                elapsed_ms: start_time.elapsed().as_millis() as u64,
                from_cache: false,
            };
            let _ = tx.blocking_send(DirectoryStreamOutput::Complete(complete));
        }
    }

    /// 构建 FsItem
    fn build_fs_item(path: &Path, metadata: &std::fs::Metadata) -> FsItem {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let is_dir = metadata.is_dir();
        let is_image = if !is_dir {
            Self::is_image_file(path)
        } else {
            false
        };

        let size = metadata.len();
        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs());
        let created = metadata
            .created()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs());

        FsItem {
            path: path.to_string_lossy().to_string(),
            name,
            is_dir,
            is_image,
            size,
            modified,
            created,
            folder_count: None,
            image_count: None,
            archive_count: None,
            video_count: None,
        }
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

    /// 检查是否为压缩包文件
    fn is_archive_file(path: &Path) -> bool {
        if let Some(ext) = path.extension() {
            let ext = ext.to_string_lossy().to_lowercase();
            matches!(ext.as_str(), "zip" | "cbz" | "rar" | "cbr" | "7z" | "cb7")
        } else {
            false
        }
    }
}

// ============================================================================
// Tauri 状态
// ============================================================================

/// 流管理器状态（用于 Tauri State）
pub struct StreamManagerState {
    pub manager: Arc<StreamManager>,
}

impl Default for StreamManagerState {
    fn default() -> Self {
        Self {
            manager: Arc::new(StreamManager::new()),
        }
    }
}
