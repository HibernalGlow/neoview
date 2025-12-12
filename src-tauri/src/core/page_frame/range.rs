//! PageRange - 页面范围
//! 表示一个页面帧覆盖的范围

use super::position::PagePosition;
use serde::{Deserialize, Serialize};

/// 页面范围
/// 
/// 表示一个页面帧覆盖的范围，从 min 到 max
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageRange {
    /// 最小位置
    pub min: PagePosition,
    /// 最大位置
    pub max: PagePosition,
}

impl PageRange {
    /// 创建新范围
    pub fn new(min: PagePosition, max: PagePosition) -> Self {
        Self { min, max }
    }

    /// 创建单页范围
    pub fn single(position: PagePosition) -> Self {
        Self { min: position, max: position }
    }

    /// 创建完整单页范围
    pub fn full_page(index: usize) -> Self {
        Self {
            min: PagePosition::left(index),
            max: PagePosition::right(index),
        }
    }

    /// 创建半页范围（左半）
    pub fn left_half(index: usize) -> Self {
        Self::single(PagePosition::left(index))
    }

    /// 创建半页范围（右半）
    pub fn right_half(index: usize) -> Self {
        Self::single(PagePosition::right(index))
    }

    /// 是否为单页（只包含一个物理页面）
    pub fn is_one_page(&self) -> bool {
        self.min.index == self.max.index
    }

    /// 是否为空范围
    pub fn is_empty(&self) -> bool {
        self.min > self.max
    }

    /// 获取范围内的物理页面数
    pub fn page_count(&self) -> usize {
        if self.is_empty() {
            0
        } else {
            self.max.index - self.min.index + 1
        }
    }

    /// 获取范围内的虚拟页面数（考虑分割）
    pub fn virtual_count(&self) -> usize {
        if self.is_empty() {
            0
        } else {
            self.max.to_virtual_index() - self.min.to_virtual_index() + 1
        }
    }

    /// 是否包含指定位置
    pub fn contains(&self, position: PagePosition) -> bool {
        position >= self.min && position <= self.max
    }

    /// 是否包含指定页面索引
    pub fn contains_index(&self, index: usize) -> bool {
        index >= self.min.index && index <= self.max.index
    }

    /// 获取下一个位置（范围之后）
    pub fn next(&self) -> PagePosition {
        self.max.next(false)
    }

    /// 获取上一个位置（范围之前）
    pub fn prev(&self) -> Option<PagePosition> {
        self.min.prev(false, false)
    }

    /// 合并多个范围
    pub fn merge(ranges: impl IntoIterator<Item = PageRange>) -> Option<Self> {
        let mut min: Option<PagePosition> = None;
        let mut max: Option<PagePosition> = None;

        for range in ranges {
            if range.is_empty() {
                continue;
            }

            min = Some(match min {
                Some(m) if m < range.min => m,
                _ => range.min,
            });

            max = Some(match max {
                Some(m) if m > range.max => m,
                _ => range.max,
            });
        }

        match (min, max) {
            (Some(min), Some(max)) => Some(Self { min, max }),
            _ => None,
        }
    }

    /// 扩展范围以包含指定位置
    pub fn extend(&mut self, position: PagePosition) {
        if position < self.min {
            self.min = position;
        }
        if position > self.max {
            self.max = position;
        }
    }

    /// 获取起始物理页面索引
    pub fn start_index(&self) -> usize {
        self.min.index
    }

    /// 获取结束物理页面索引
    pub fn end_index(&self) -> usize {
        self.max.index
    }
}

impl Default for PageRange {
    fn default() -> Self {
        Self::single(PagePosition::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_range_creation() {
        let range = PageRange::full_page(5);
        assert_eq!(range.min.index, 5);
        assert_eq!(range.min.part, 0);
        assert_eq!(range.max.index, 5);
        assert_eq!(range.max.part, 1);
        assert!(range.is_one_page());
    }

    #[test]
    fn test_range_contains() {
        let range = PageRange::new(
            PagePosition::new(2, 0),
            PagePosition::new(4, 1),
        );

        assert!(range.contains(PagePosition::new(3, 0)));
        assert!(range.contains(PagePosition::new(2, 0)));
        assert!(range.contains(PagePosition::new(4, 1)));
        assert!(!range.contains(PagePosition::new(1, 1)));
        assert!(!range.contains(PagePosition::new(5, 0)));
    }

    #[test]
    fn test_range_merge() {
        let r1 = PageRange::full_page(2);
        let r2 = PageRange::full_page(4);
        
        let merged = PageRange::merge([r1, r2]).unwrap();
        assert_eq!(merged.min.index, 2);
        assert_eq!(merged.max.index, 4);
    }

    #[test]
    fn test_virtual_count() {
        // 单个完整页面 = 2 个虚拟页
        let range = PageRange::full_page(5);
        assert_eq!(range.virtual_count(), 2);

        // 单个半页 = 1 个虚拟页
        let half = PageRange::left_half(5);
        assert_eq!(half.virtual_count(), 1);
    }
}
