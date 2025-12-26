//! 超分服务事件类型模块
//! 
//! 包含 UpscaleStatus, UpscaleReadyPayload, UpscaleServiceStats 等事件相关类型

use serde::{Deserialize, Serialize};

/// 超分任务状态
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum UpscaleStatus {
    /// 等待中
    Pending,
    /// 条件检查中
    Checking,
    /// 正在处理
    Processing,
    /// 已完成
    Completed,
    /// 已跳过（不满足条件）
    Skipped,
    /// 失败
    Failed,
    /// 已取消
    Cancelled,
}

/// 超分结果事件（只返回缓存路径，不返回 Blob）
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpscaleReadyPayload {
    /// 书籍路径
    pub book_path: String,
    /// 页面索引
    pub page_index: usize,
    /// 图片哈希
    pub image_hash: String,
    /// 状态
    pub status: UpscaleStatus,
    /// 缓存文件路径（前端用 convertFileSrc 转 URL）
    pub cache_path: Option<String>,
    /// 错误信息
    pub error: Option<String>,
    /// 原始图片尺寸
    pub original_size: Option<(u32, u32)>,
    /// 超分后尺寸
    pub upscaled_size: Option<(u32, u32)>,
    /// 是否来自预加载
    pub is_preload: bool,
}

/// 服务统计
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpscaleServiceStats {
    pub memory_cache_count: usize,
    pub memory_cache_bytes: usize,
    pub pending_tasks: usize,
    pub processing_tasks: usize,
    pub completed_count: usize,
    pub skipped_count: usize,
    pub failed_count: usize,
    pub is_enabled: bool,
}
