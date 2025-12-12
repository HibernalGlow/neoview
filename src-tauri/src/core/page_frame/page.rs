//! Page - 物理页面实体
//! 表示一个实际的图片文件

use super::Size;
use serde::{Deserialize, Serialize};

/// 物理页面
/// 
/// 表示一个实际的图片文件，包含路径、尺寸等元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    /// 页面索引
    pub index: usize,
    /// 文件路径（压缩包路径或文件夹路径）
    pub path: String,
    /// 内部路径（压缩包内的路径，文件夹时为完整路径）
    pub inner_path: String,
    /// 文件名
    pub name: String,
    /// 文件大小（字节）
    pub size: u64,
    /// 图片宽度
    pub width: u32,
    /// 图片高度
    pub height: u32,
    /// 宽高比
    pub aspect_ratio: f64,
}

impl Page {
    /// 创建新页面
    pub fn new(
        index: usize,
        path: String,
        inner_path: String,
        name: String,
        size: u64,
        width: u32,
        height: u32,
    ) -> Self {
        let aspect_ratio = if height > 0 {
            width as f64 / height as f64
        } else {
            1.0
        };

        Self {
            index,
            path,
            inner_path,
            name,
            size,
            width,
            height,
            aspect_ratio,
        }
    }

    /// 创建占位页面（尺寸未知）
    pub fn placeholder(index: usize, path: String, inner_path: String, name: String) -> Self {
        Self {
            index,
            path,
            inner_path,
            name,
            size: 0,
            width: 0,
            height: 0,
            aspect_ratio: 1.0,
        }
    }

    /// 是否为横向页面
    pub fn is_landscape(&self) -> bool {
        self.width > self.height
    }

    /// 是否为竖向页面
    pub fn is_portrait(&self) -> bool {
        self.height >= self.width
    }

    /// 获取尺寸
    pub fn size_struct(&self) -> Size {
        Size::new(self.width as f64, self.height as f64)
    }

    /// 是否有有效尺寸
    pub fn has_valid_size(&self) -> bool {
        self.width > 0 && self.height > 0
    }

    /// 更新尺寸
    pub fn update_size(&mut self, width: u32, height: u32) {
        self.width = width;
        self.height = height;
        self.aspect_ratio = if height > 0 {
            width as f64 / height as f64
        } else {
            1.0
        };
    }

    /// 检查是否应该分割（根据宽高比阈值）
    /// 
    /// 当宽高比大于阈值时，认为是横向页面，可以分割
    pub fn should_split(&self, divide_page_rate: f64) -> bool {
        self.aspect_ratio > divide_page_rate
    }
}

impl Default for Page {
    fn default() -> Self {
        Self {
            index: 0,
            path: String::new(),
            inner_path: String::new(),
            name: String::new(),
            size: 0,
            width: 0,
            height: 0,
            aspect_ratio: 1.0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_page_creation() {
        let page = Page::new(
            0,
            "test.zip".to_string(),
            "001.jpg".to_string(),
            "001.jpg".to_string(),
            1024,
            800,
            600,
        );

        assert_eq!(page.index, 0);
        assert!(page.is_landscape());
        assert!(!page.is_portrait());
        assert!((page.aspect_ratio - 800.0 / 600.0).abs() < 0.001);
    }

    #[test]
    fn test_should_split() {
        // 横向页面 (1.5:1)
        let landscape = Page::new(0, "".into(), "".into(), "".into(), 0, 1500, 1000);
        assert!(landscape.should_split(1.0));
        assert!(landscape.should_split(1.2));
        assert!(!landscape.should_split(1.6));

        // 竖向页面 (0.67:1)
        let portrait = Page::new(0, "".into(), "".into(), "".into(), 0, 1000, 1500);
        assert!(!portrait.should_split(1.0));
    }
}
