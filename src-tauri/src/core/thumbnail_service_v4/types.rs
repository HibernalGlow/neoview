//! 统一缩略图类型定义

use serde::{Deserialize, Serialize};
use std::fmt;

/// 缩略图来源类型
#[derive(Debug, Clone, Hash, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ThumbnailSource {
    /// 文件系统中的独立图片文件
    #[serde(rename_all = "camelCase")]
    File {
        path: String,
        file_size: u64,
        modified: u64,
    },
    /// 压缩包内的条目
    #[serde(rename_all = "camelCase")]
    ArchiveEntry {
        archive_path: String,
        inner_path: String,
        entry_index: usize,
        file_size: u64,
    },
    /// 文件夹封面（使用代表图的缩略图）
    #[serde(rename_all = "camelCase")]
    DirectoryCover {
        dir_path: String,
        /// 代表图路径
        representative: String,
        file_size: u64,
        modified: u64,
    },
    /// 书籍页面（阅读器底栏用）
    #[serde(rename_all = "camelCase")]
    BookPage {
        book_path: String,
        page_index: usize,
        /// 页面路径（可能是文件路径或压缩包内路径）
        page_path: String,
        file_size: u64,
    },
}

/// 缩略图请求优先级通道
#[derive(Debug, Clone, Copy, Hash, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ThumbnailLane {
    /// 文件浏览当前 viewport，最高优先级
    Visible,
    /// 阅读器底栏当前可见页
    ReaderVisible,
    /// 当前 viewport 前后 1-2 屏
    Prefetch,
    /// 整目录/整本书 warmup，只在队列空闲时跑
    Background,
}

impl Default for ThumbnailLane {
    fn default() -> Self {
        Self::Visible
    }
}

/// 缩略图请求项
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailRequest {
    /// 唯一标识（由前端生成，用于匹配响应）
    pub key: String,
    /// 来源
    pub source: ThumbnailSource,
    /// 最大尺寸
    pub max_size: u32,
}

/// 缩略图就绪事件项
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailReadyItem {
    /// 缓存键
    pub key: String,
    /// URL 版本号（用于 bust 浏览器缓存）
    pub url_version: u32,
    /// 缩略图宽度
    pub width: u32,
    /// 缩略图高度
    pub height: u32,
}

/// 批量就绪事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailBatchReadyEvent {
    pub items: Vec<ThumbnailReadyItem>,
}

/// 请求参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestThumbnailsParams {
    /// 请求项列表
    pub items: Vec<ThumbnailRequest>,
    /// 上下文 ID（用于取消）
    pub context_id: String,
    /// 优先级通道
    pub lane: ThumbnailLane,
    /// 中心索引（用于排序）
    pub center_index: Option<usize>,
    /// 世代号（旧世代的未开始任务会被丢弃）
    pub generation: u32,
}

impl ThumbnailSource {
    /// 获取文件路径（用于后端定位资源）
    pub fn primary_path(&self) -> &str {
        match self {
            Self::File { path, .. } => path,
            Self::ArchiveEntry { archive_path, .. } => archive_path,
            Self::DirectoryCover { dir_path, .. } => dir_path,
            Self::BookPage { book_path, .. } => book_path,
        }
    }

    /// 是否来自压缩包
    pub fn is_archive(&self) -> bool {
        matches!(self, Self::ArchiveEntry { .. })
    }
}

impl fmt::Display for ThumbnailLane {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Visible => write!(f, "visible"),
            Self::ReaderVisible => write!(f, "reader-visible"),
            Self::Prefetch => write!(f, "prefetch"),
            Self::Background => write!(f, "background"),
        }
    }
}
