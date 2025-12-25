//! 流式压缩包扫描
//!
//! 支持增量返回条目，让 UI 可以先响应
//! 参考 OpenComic 的异步列表扫描

use crate::core::archive_manager::{open_archive, ArchiveEntry};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

/// 流式扫描进度事件
#[derive(Clone, Serialize, Deserialize)]
pub struct StreamingScanProgress {
    /// 压缩包路径
    pub path: String,
    /// 当前已扫描的条目数
    pub scanned_count: usize,
    /// 预估总条目数（可能不准确）
    pub estimated_total: Option<usize>,
    /// 当前批次的条目
    pub entries: Vec<StreamingEntry>,
    /// 是否完成
    pub completed: bool,
    /// 错误信息
    pub error: Option<String>,
}

/// 流式条目信息
#[derive(Clone, Serialize, Deserialize)]
pub struct StreamingEntry {
    /// 条目名称
    pub name: String,
    /// 是否为目录
    pub is_directory: bool,
    /// 解压后大小
    pub size: Option<u64>,
    /// 索引
    pub index: usize,
    /// 是否为图片
    pub is_image: bool,
}

impl From<&ArchiveEntry> for StreamingEntry {
    fn from(entry: &ArchiveEntry) -> Self {
        Self {
            name: entry.name.clone(),
            is_directory: entry.is_directory,
            size: entry.uncompressed_size,
            index: entry.index,
            is_image: entry.is_image(),
        }
    }
}

/// 流式扫描器
pub struct StreamingScanner {
    /// 取消标志
    cancelled: Arc<AtomicBool>,
    /// 批次大小（每批发送多少条目）
    batch_size: usize,
}

impl Default for StreamingScanner {
    fn default() -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
            batch_size: 50, // 每 50 个条目发送一次
        }
    }
}

impl StreamingScanner {
    pub fn new(batch_size: usize) -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
            batch_size,
        }
    }

    /// 取消扫描
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    /// 重置取消标志
    pub fn reset(&self) {
        self.cancelled.store(false, Ordering::SeqCst);
    }

    /// 检查是否已取消
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    /// 流式扫描压缩包
    ///
    /// 通过 Tauri 事件增量返回条目，让 UI 可以先显示部分内容
    pub fn scan_archive_streaming(
        &self,
        path: &Path,
        app_handle: &AppHandle,
    ) -> Result<Vec<ArchiveEntry>, String> {
        let path_str = path.to_string_lossy().to_string();

        // 打开压缩包
        let mut handler = open_archive(path)?;

        // 获取所有条目
        let entries = handler.list_entries()?;
        let total = entries.len();

        // 分批发送
        let mut batch = Vec::with_capacity(self.batch_size);
        let mut scanned = 0;

        for entry in &entries {
            // 检查取消
            if self.is_cancelled() {
                // 发送取消事件
                let _ = app_handle.emit(
                    "archive-scan-progress",
                    StreamingScanProgress {
                        path: path_str.clone(),
                        scanned_count: scanned,
                        estimated_total: Some(total),
                        entries: vec![],
                        completed: false,
                        error: Some("扫描已取消".to_string()),
                    },
                );
                return Err("扫描已取消".to_string());
            }

            batch.push(StreamingEntry::from(entry));
            scanned += 1;

            // 达到批次大小，发送事件
            if batch.len() >= self.batch_size {
                let _ = app_handle.emit(
                    "archive-scan-progress",
                    StreamingScanProgress {
                        path: path_str.clone(),
                        scanned_count: scanned,
                        estimated_total: Some(total),
                        entries: batch.clone(),
                        completed: false,
                        error: None,
                    },
                );
                batch.clear();
            }
        }

        // 发送剩余条目和完成事件
        let _ = app_handle.emit(
            "archive-scan-progress",
            StreamingScanProgress {
                path: path_str,
                scanned_count: scanned,
                estimated_total: Some(total),
                entries: batch,
                completed: true,
                error: None,
            },
        );

        Ok(entries)
    }

    /// 快速扫描：只返回前 N 个图片条目
    ///
    /// 用于快速显示首页，后台继续扫描剩余
    pub fn scan_first_images(
        &self,
        path: &Path,
        count: usize,
    ) -> Result<Vec<ArchiveEntry>, String> {
        let mut handler = open_archive(path)?;
        let entries = handler.list_entries()?;

        let images: Vec<ArchiveEntry> = entries
            .into_iter()
            .filter(|e| !e.is_directory && e.is_image())
            .take(count)
            .collect();

        Ok(images)
    }
}

/// 流式打开书籍的结果
#[derive(Clone, Serialize, Deserialize)]
pub struct StreamingOpenResult {
    /// 书籍路径
    pub path: String,
    /// 书籍名称
    pub name: String,
    /// 书籍类型
    pub book_type: String,
    /// 首批页面（用于快速显示）
    pub initial_pages: Vec<StreamingEntry>,
    /// 是否还有更多页面
    pub has_more: bool,
    /// 预估总页数
    pub estimated_total: Option<usize>,
}
