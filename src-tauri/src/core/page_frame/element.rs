//! PageFrameElement - 页面帧元素
//! 表示页面在帧中的表示，可能是完整页面或分割后的半页

use super::{Page, PageRange, Size};
use serde::{Deserialize, Serialize};

/// 裁剪区域
/// 
/// 用于分割页面时指定显示区域
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CropRect {
    /// X 坐标（0-1 归一化）
    pub x: f64,
    /// Y 坐标（0-1 归一化）
    pub y: f64,
    /// 宽度（0-1 归一化）
    pub width: f64,
    /// 高度（0-1 归一化）
    pub height: f64,
}

impl CropRect {
    /// 创建新裁剪区域
    pub fn new(x: f64, y: f64, width: f64, height: f64) -> Self {
        Self { x, y, width, height }
    }

    /// 完整区域（无裁剪）
    pub fn full() -> Self {
        Self { x: 0.0, y: 0.0, width: 1.0, height: 1.0 }
    }

    /// 左半区域
    pub fn left_half() -> Self {
        Self { x: 0.0, y: 0.0, width: 0.5, height: 1.0 }
    }

    /// 右半区域
    pub fn right_half() -> Self {
        Self { x: 0.5, y: 0.0, width: 0.5, height: 1.0 }
    }

    /// 是否为完整区域
    pub fn is_full(&self) -> bool {
        (self.x - 0.0).abs() < 0.001
            && (self.y - 0.0).abs() < 0.001
            && (self.width - 1.0).abs() < 0.001
            && (self.height - 1.0).abs() < 0.001
    }

    /// 转换为 CSS clip-path 值
    /// 
    /// 返回 inset(top right bottom left) 格式
    pub fn to_css_clip_path(&self) -> String {
        let top = self.y * 100.0;
        let right = (1.0 - self.x - self.width) * 100.0;
        let bottom = (1.0 - self.y - self.height) * 100.0;
        let left = self.x * 100.0;
        format!("inset({top:.1}% {right:.1}% {bottom:.1}% {left:.1}%)")
    }
}

impl Default for CropRect {
    fn default() -> Self {
        Self::full()
    }
}

/// 页面帧元素
/// 
/// 表示页面在帧中的表示，可能是完整页面或分割后的半页
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageFrameElement {
    /// 引用的页面
    pub page: Page,
    /// 页面范围
    pub page_range: PageRange,
    /// 是否为占位元素（空白页）
    pub is_dummy: bool,
    /// 裁剪区域（分割页面时使用）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crop_rect: Option<CropRect>,
    /// 缩放比例（用于双页模式下高度对齐）
    #[serde(default = "default_scale")]
    pub scale: f64,
}

fn default_scale() -> f64 {
    1.0
}

impl PageFrameElement {
    /// 创建完整页面元素
    pub fn full(page: Page, page_range: PageRange) -> Self {
        Self {
            page,
            page_range,
            is_dummy: false,
            crop_rect: None,
            scale: 1.0,
        }
    }

    /// 创建左半页元素
    pub fn left_half(page: Page, page_range: PageRange) -> Self {
        Self {
            page,
            page_range,
            is_dummy: false,
            crop_rect: Some(CropRect::left_half()),
            scale: 1.0,
        }
    }

    /// 创建右半页元素
    pub fn right_half(page: Page, page_range: PageRange) -> Self {
        Self {
            page,
            page_range,
            is_dummy: false,
            crop_rect: Some(CropRect::right_half()),
            scale: 1.0,
        }
    }

    /// 创建占位元素（空白页）
    pub fn dummy(page_range: PageRange) -> Self {
        Self {
            page: Page::default(),
            page_range,
            is_dummy: true,
            crop_rect: None,
            scale: 1.0,
        }
    }

    /// 是否为横向页面
    pub fn is_landscape(&self) -> bool {
        self.page.is_landscape()
    }

    /// 是否为竖向页面
    pub fn is_portrait(&self) -> bool {
        self.page.is_portrait()
    }

    /// 获取显示宽度（考虑裁剪和缩放）
    pub fn width(&self) -> f64 {
        let base_width = self.page.width as f64;
        let crop_factor = self.crop_rect.map(|c| c.width).unwrap_or(1.0);
        base_width * crop_factor * self.scale
    }

    /// 获取显示高度（考虑裁剪和缩放）
    pub fn height(&self) -> f64 {
        let base_height = self.page.height as f64;
        let crop_factor = self.crop_rect.map(|c| c.height).unwrap_or(1.0);
        base_height * crop_factor * self.scale
    }

    /// 获取显示尺寸
    pub fn size(&self) -> Size {
        Size::new(self.width(), self.height())
    }

    /// 获取原始尺寸（不考虑缩放）
    pub fn raw_size(&self) -> Size {
        let base_width = self.page.width as f64;
        let base_height = self.page.height as f64;
        let crop_width = self.crop_rect.map(|c| c.width).unwrap_or(1.0);
        let crop_height = self.crop_rect.map(|c| c.height).unwrap_or(1.0);
        Size::new(base_width * crop_width, base_height * crop_height)
    }

    /// 设置缩放比例
    pub fn with_scale(mut self, scale: f64) -> Self {
        self.scale = scale;
        self
    }

    /// 获取页面索引
    pub fn page_index(&self) -> usize {
        self.page.index
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::page_frame::PagePosition;

    #[test]
    fn test_crop_rect() {
        let left = CropRect::left_half();
        assert!((left.x - 0.0).abs() < 0.001);
        assert!((left.width - 0.5).abs() < 0.001);

        let right = CropRect::right_half();
        assert!((right.x - 0.5).abs() < 0.001);
        assert!((right.width - 0.5).abs() < 0.001);
    }

    #[test]
    fn test_element_size() {
        let page = Page::new(0, "".into(), "".into(), "".into(), 0, 2000, 1000);
        let range = PageRange::full_page(0);

        // 完整页面
        let full = PageFrameElement::full(page.clone(), range);
        assert!((full.width() - 2000.0).abs() < 0.001);
        assert!((full.height() - 1000.0).abs() < 0.001);

        // 左半页
        let left = PageFrameElement::left_half(page.clone(), PageRange::left_half(0));
        assert!((left.width() - 1000.0).abs() < 0.001);
        assert!((left.height() - 1000.0).abs() < 0.001);
    }

    #[test]
    fn test_css_clip_path() {
        let left = CropRect::left_half();
        let clip = left.to_css_clip_path();
        assert!(clip.contains("inset"));
        assert!(clip.contains("50.0%")); // right = 50%
    }
}
