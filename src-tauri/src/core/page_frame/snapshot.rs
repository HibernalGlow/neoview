//! FrameSnapshot - 后端输出给前端的最小阅读协议
//! 
//! 前端拿到 FrameSnapshot 后可以直接渲染，不再自己推导 second page / split / wide page 逻辑

use serde::{Deserialize, Serialize};
use super::{CropRect, ReadOrder};

/// 帧快照 - 后端输出给前端的完整帧描述
/// 
/// 前端拿到后直接渲染，不再自己做 frame 组合
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameSnapshot {
    /// 书籍路径
    pub book_path: String,
    /// 当前页索引（物理页）
    pub page_index: usize,
    /// 帧 ID（用于动画过渡判断）
    pub frame_id: String,
    /// 布局类型
    pub layout: FrameLayoutType,
    /// 帧中的图片列表（已按显示顺序排列，RTL 已处理）
    pub images: Vec<FrameImageInfo>,
    /// 翻页步长（下一帧跳多少物理页）
    pub step: usize,
    /// 是否可以前进
    pub can_next: bool,
    /// 是否可以后退
    pub can_prev: bool,
    /// 帧是否就绪（图片资源已可用）
    pub ready: bool,
    /// 阅读方向
    pub direction: ReadOrder,
}

/// 帧布局类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FrameLayoutType {
    /// 单页
    Single,
    /// 双页
    Double,
    /// 全景
    Panorama,
    /// 视频
    Video,
}

/// 帧中的图片信息
/// 
/// 包含前端渲染所需的全部信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameImageInfo {
    /// 物理页面索引
    pub page_index: usize,
    /// 图片 URL（neoview:// 协议）
    pub url: String,
    /// 图片宽度（原始）
    pub width: u32,
    /// 图片高度（原始）
    pub height: u32,
    /// 裁剪区域（分割页面时使用，归一化坐标 0-1）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crop_rect: Option<CropRect>,
    /// 分割半边（兼容旧前端，优先使用 crop_rect）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub split_half: Option<SplitHalf>,
    /// 内容缩放比例（双页对齐时使用）
    #[serde(default = "default_scale")]
    pub scale: f64,
    /// 是否为占位元素
    #[serde(default)]
    pub is_dummy: bool,
    /// 旋转角度（度）
    #[serde(default)]
    pub rotation: f64,
}

/// 分割半边
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SplitHalf {
    Left,
    Right,
}

fn default_scale() -> f64 {
    1.0
}

impl FrameSnapshot {
    /// 创建空帧（关闭 viewer 时使用）
    pub fn empty() -> Self {
        Self {
            book_path: String::new(),
            page_index: 0,
            frame_id: String::new(),
            layout: FrameLayoutType::Single,
            images: Vec::new(),
            step: 1,
            can_next: false,
            can_prev: false,
            ready: false,
            direction: ReadOrder::LeftToRight,
        }
    }

    /// 是否为空帧
    pub fn is_empty(&self) -> bool {
        self.images.is_empty() || self.frame_id.is_empty()
    }
}

/// Reader window - multiple frames around a center page
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderWindow {
    /// Center page index
    pub center_page: usize,
    /// Frames in the window (center + surrounding for panorama)
    pub frames: Vec<FrameSnapshot>,
    /// Pages to preload ahead
    pub preload_ahead: Vec<usize>,
    /// Pages to preload behind
    pub preload_behind: Vec<usize>,
}
