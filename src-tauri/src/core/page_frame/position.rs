//! PagePosition - 页面位置
//! 支持分割页面的位置表示

use serde::{Deserialize, Serialize};

/// 页面位置
/// 
/// 表示一个页面的位置，支持分割页面
/// - index: 物理页面索引
/// - part: 分割部分 (0=左/完整, 1=右)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PagePosition {
    /// 物理页面索引
    pub index: usize,
    /// 分割部分 (0=左/完整, 1=右)
    pub part: u8,
}

impl PagePosition {
    /// 创建新位置
    pub fn new(index: usize, part: u8) -> Self {
        Self { index, part: part.min(1) }
    }

    /// 创建完整页面位置
    pub fn full(index: usize) -> Self {
        Self { index, part: 0 }
    }

    /// 创建左半页位置
    pub fn left(index: usize) -> Self {
        Self { index, part: 0 }
    }

    /// 创建右半页位置
    pub fn right(index: usize) -> Self {
        Self { index, part: 1 }
    }

    /// 是否为左半页
    pub fn is_left(&self) -> bool {
        self.part == 0
    }

    /// 是否为右半页
    pub fn is_right(&self) -> bool {
        self.part == 1
    }

    /// 获取下一个位置
    /// 
    /// 如果当前是左半页，返回右半页
    /// 如果当前是右半页或完整页，返回下一页的左半页
    pub fn next(&self, is_split: bool) -> Self {
        if is_split && self.part == 0 {
            Self { index: self.index, part: 1 }
        } else {
            Self { index: self.index + 1, part: 0 }
        }
    }

    /// 获取上一个位置
    /// 
    /// 如果当前是右半页，返回左半页
    /// 如果当前是左半页或完整页，返回上一页的右半页（如果分割）或完整页
    pub fn prev(&self, is_split: bool, prev_is_split: bool) -> Option<Self> {
        if is_split && self.part == 1 {
            Some(Self { index: self.index, part: 0 })
        } else if self.index > 0 {
            Some(Self { 
                index: self.index - 1, 
                part: if prev_is_split { 1 } else { 0 }
            })
        } else {
            None
        }
    }

    /// 转换为虚拟索引
    /// 
    /// 虚拟索引 = index * 2 + part
    pub fn to_virtual_index(&self) -> usize {
        self.index * 2 + self.part as usize
    }

    /// 从虚拟索引创建
    pub fn from_virtual_index(virtual_index: usize) -> Self {
        Self {
            index: virtual_index / 2,
            part: (virtual_index % 2) as u8,
        }
    }
}

impl Default for PagePosition {
    fn default() -> Self {
        Self::full(0)
    }
}

impl PartialOrd for PagePosition {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for PagePosition {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        match self.index.cmp(&other.index) {
            std::cmp::Ordering::Equal => self.part.cmp(&other.part),
            other => other,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_position_creation() {
        let pos = PagePosition::new(5, 0);
        assert_eq!(pos.index, 5);
        assert_eq!(pos.part, 0);
        assert!(pos.is_left());
        assert!(!pos.is_right());
    }

    #[test]
    fn test_position_next() {
        let pos = PagePosition::left(3);
        
        // 分割页面：左 -> 右
        let next = pos.next(true);
        assert_eq!(next.index, 3);
        assert_eq!(next.part, 1);
        
        // 分割页面：右 -> 下一页左
        let next2 = next.next(true);
        assert_eq!(next2.index, 4);
        assert_eq!(next2.part, 0);
        
        // 非分割页面：直接下一页
        let next3 = pos.next(false);
        assert_eq!(next3.index, 4);
        assert_eq!(next3.part, 0);
    }

    #[test]
    fn test_virtual_index() {
        let pos = PagePosition::new(5, 1);
        assert_eq!(pos.to_virtual_index(), 11);
        
        let pos2 = PagePosition::from_virtual_index(11);
        assert_eq!(pos2.index, 5);
        assert_eq!(pos2.part, 1);
    }
}
