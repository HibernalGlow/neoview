//! NeoView - PageFrame 模块
//! 参考 NeeView 的 PageFrame 三层架构
//!
//! ## 架构
//!
//! ```text
//! Page (物理页面)
//!   └── PageFrameElement (帧元素，可能是半页)
//!         └── PageFrame (显示帧，包含 1-2 个元素)
//! ```

mod position;
mod range;
mod page;
mod element;
mod frame;
mod builder;
mod calculator;
mod context;
mod error;

pub use position::PagePosition;
pub use range::PageRange;
pub use page::Page;
pub use element::{PageFrameElement, CropRect};
pub use frame::PageFrame;
pub use builder::PageFrameBuilder;
pub use calculator::{ContentSizeCalculator, StretchMode, AutoRotateType};
pub use context::PageFrameContext;
pub use error::{PageFrameError, PageFrameResult, PageFrameErrorInfo};

/// 页面模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PageMode {
    /// 单页模式
    Single,
    /// 双页模式
    Double,
}

impl Default for PageMode {
    fn default() -> Self {
        Self::Single
    }
}

/// 阅读顺序
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReadOrder {
    /// 从左到右
    #[serde(rename = "ltr")]
    LeftToRight,
    /// 从右到左
    #[serde(rename = "rtl")]
    RightToLeft,
}

impl Default for ReadOrder {
    fn default() -> Self {
        Self::LeftToRight
    }
}

impl ReadOrder {
    /// 获取方向值 (1=LTR, -1=RTL)
    pub fn direction(&self) -> i32 {
        match self {
            Self::LeftToRight => 1,
            Self::RightToLeft => -1,
        }
    }
}

/// 尺寸
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

impl Size {
    pub fn new(width: f64, height: f64) -> Self {
        Self { width, height }
    }

    pub fn zero() -> Self {
        Self { width: 0.0, height: 0.0 }
    }

    /// 是否为横向
    pub fn is_landscape(&self) -> bool {
        self.width > self.height
    }

    /// 宽高比
    pub fn aspect_ratio(&self) -> f64 {
        if self.height > 0.0 {
            self.width / self.height
        } else {
            1.0
        }
    }
}

impl Default for Size {
    fn default() -> Self {
        Self::zero()
    }
}
