//! PageFrame - 页面帧
//! 当前显示的内容单位，可包含 1-2 个 PageFrameElement

use super::{PageFrameElement, PageRange, ReadOrder, Size, WidePageStretch, WidePageScaleCalculator};
use serde::{Deserialize, Serialize};

/// 页面帧
/// 
/// 当前显示的内容单位，可包含 1-2 个 PageFrameElement
/// 在双页模式下，两个竖向页面会组成一个帧
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageFrame {
    /// 帧内的元素列表
    pub elements: Vec<PageFrameElement>,
    /// 帧覆盖的页面范围
    pub frame_range: PageRange,
    /// 阅读方向 (1=LTR, -1=RTL)
    pub direction: i32,
    /// 自动旋转角度
    pub angle: f64,
    /// 拉伸缩放
    pub scale: f64,
    /// 最终显示尺寸
    pub size: Size,
}

impl PageFrame {
    /// 创建单页帧
    pub fn single(element: PageFrameElement, direction: i32) -> Self {
        let size = element.size();
        let frame_range = element.page_range;

        Self {
            elements: vec![element],
            frame_range,
            direction,
            angle: 0.0,
            scale: 1.0,
            size,
        }
    }

    /// 创建双页帧
    /// 
    /// 两个元素会根据阅读方向排列
    pub fn double(e1: PageFrameElement, e2: PageFrameElement, direction: i32) -> Self {
        // 合并范围
        let frame_range = PageRange::merge([e1.page_range, e2.page_range])
            .unwrap_or(e1.page_range);

        // 计算总尺寸（两页并排）
        let width = e1.width() + e2.width();
        let height = e1.height().max(e2.height());
        let size = Size::new(width, height);

        // 根据方向排列元素
        let elements = if direction < 0 {
            // RTL: 右边的页面在左边显示
            vec![e2, e1]
        } else {
            // LTR: 左边的页面在左边显示
            vec![e1, e2]
        };

        Self {
            elements,
            frame_range,
            direction,
            angle: 0.0,
            scale: 1.0,
            size,
        }
    }

    /// 创建带对齐的双页帧
    /// 
    /// 根据 `WidePageStretch` 模式缩放两个元素
    pub fn double_aligned(
        mut e1: PageFrameElement, 
        mut e2: PageFrameElement, 
        direction: i32,
        stretch_mode: WidePageStretch,
    ) -> Self {
        // 使用 `WidePageScaleCalculator` 计算各元素的缩放比例
        let sizes = vec![e1.raw_size(), e2.raw_size()];
        let scales = WidePageScaleCalculator::calculate(&sizes, stretch_mode);
        
        if scales.len() >= 2 {
            e1.scale = scales[0];
            e2.scale = scales[1];
        }

        Self::double(e1, e2, direction)
    }
    
    /// 创建带高度对齐的双页帧（便捷方法）
    /// 
    /// 等同于 `double_aligned` 使用 `UniformHeight` 模式
    pub fn double_height_aligned(e1: PageFrameElement, e2: PageFrameElement, direction: i32) -> Self {
        Self::double_aligned(e1, e2, direction, WidePageStretch::UniformHeight)
    }

    /// 是否为单页帧
    pub fn is_single(&self) -> bool {
        self.elements.len() == 1
    }

    /// 是否为双页帧
    pub fn is_double(&self) -> bool {
        self.elements.len() == 2
    }

    /// 是否包含指定页面位置
    pub fn contains(&self, position: super::PagePosition) -> bool {
        self.frame_range.contains(position)
    }

    /// 是否包含指定页面索引
    pub fn contains_index(&self, index: usize) -> bool {
        self.frame_range.contains_index(index)
    }

    /// 获取按方向排序的元素
    /// 
    /// 返回的元素顺序与显示顺序一致
    pub fn get_directed_elements(&self) -> impl Iterator<Item = &PageFrameElement> {
        self.elements.iter()
    }

    /// 获取第一个元素
    pub fn first_element(&self) -> Option<&PageFrameElement> {
        self.elements.first()
    }

    /// 获取第二个元素
    pub fn second_element(&self) -> Option<&PageFrameElement> {
        self.elements.get(1)
    }

    /// 获取起始页面索引
    pub fn start_index(&self) -> usize {
        self.frame_range.start_index()
    }

    /// 获取结束页面索引
    pub fn end_index(&self) -> usize {
        self.frame_range.end_index()
    }

    /// 获取帧内的所有页面索引
    pub fn page_indices(&self) -> Vec<usize> {
        self.elements
            .iter()
            .filter(|e| !e.is_dummy)
            .map(|e| e.page_index())
            .collect()
    }

    /// 设置旋转角度
    pub fn with_angle(mut self, angle: f64) -> Self {
        self.angle = angle;
        self
    }

    /// 设置缩放
    pub fn with_scale(mut self, scale: f64) -> Self {
        self.scale = scale;
        self
    }

    /// 设置尺寸
    pub fn with_size(mut self, size: Size) -> Self {
        self.size = size;
        self
    }

    /// 获取帧的宽高比
    pub fn aspect_ratio(&self) -> f64 {
        self.size.aspect_ratio()
    }

    /// 是否为横向帧
    pub fn is_landscape(&self) -> bool {
        self.size.is_landscape()
    }
}

impl Default for PageFrame {
    fn default() -> Self {
        Self {
            elements: Vec::new(),
            frame_range: PageRange::default(),
            direction: 1,
            angle: 0.0,
            scale: 1.0,
            size: Size::zero(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::page_frame::{Page, PagePosition};

    fn create_test_page(index: usize, width: u32, height: u32) -> Page {
        Page::new(index, "".into(), "".into(), format!("{index}.jpg"), 0, width, height)
    }

    #[test]
    fn test_single_frame() {
        let page = create_test_page(0, 800, 1200);
        let element = PageFrameElement::full(page, PageRange::full_page(0));
        let frame = PageFrame::single(element, 1);

        assert!(frame.is_single());
        assert!(!frame.is_double());
        assert!(frame.contains_index(0));
        assert!(!frame.contains_index(1));
    }

    #[test]
    fn test_double_frame() {
        let page1 = create_test_page(0, 800, 1200);
        let page2 = create_test_page(1, 800, 1200);
        let e1 = PageFrameElement::full(page1, PageRange::full_page(0));
        let e2 = PageFrameElement::full(page2, PageRange::full_page(1));
        
        let frame = PageFrame::double(e1, e2, 1);

        assert!(frame.is_double());
        assert!(frame.contains_index(0));
        assert!(frame.contains_index(1));
        assert!(!frame.contains_index(2));
        
        // 检查尺寸
        assert!((frame.size.width - 1600.0).abs() < 0.001);
        assert!((frame.size.height - 1200.0).abs() < 0.001);
    }

    #[test]
    fn test_rtl_direction() {
        let page1 = create_test_page(0, 800, 1200);
        let page2 = create_test_page(1, 800, 1200);
        let e1 = PageFrameElement::full(page1, PageRange::full_page(0));
        let e2 = PageFrameElement::full(page2, PageRange::full_page(1));
        
        // RTL 模式
        let frame = PageFrame::double(e1, e2, -1);
        
        // 第一个元素应该是 page2（索引 1）
        assert_eq!(frame.elements[0].page_index(), 1);
        assert_eq!(frame.elements[1].page_index(), 0);
    }
}
