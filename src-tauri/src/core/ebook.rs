//! NeoView - 电子书处理模块
//!
//! 支持 PDF、EPUB、XPS 等电子书格式
//! 
//! TODO: 集成 MuPDF 或使用前端 pdf.js
//! 当前为 stub 实现，返回不支持错误

use std::path::Path;

/// 电子书管理器
pub struct EbookManager;

/// 电子书页面信息
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EbookPageInfo {
    /// 页码 (0-indexed)
    pub index: usize,
    /// 页面宽度
    pub width: f32,
    /// 页面高度
    pub height: f32,
}

/// 电子书信息
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EbookInfo {
    /// 文件路径
    pub path: String,
    /// 总页数
    pub page_count: usize,
    /// 标题
    pub title: Option<String>,
    /// 作者
    pub author: Option<String>,
    /// 页面列表
    pub pages: Vec<EbookPageInfo>,
}

/// 支持的电子书扩展名
pub const EBOOK_EXTENSIONS: &[&str] = &["pdf", "epub", "xps", "fb2", "mobi"];

impl EbookManager {
    /// 检查是否是支持的电子书格式
    pub fn is_supported(path: &str) -> bool {
        let ext = Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        EBOOK_EXTENSIONS.contains(&ext.as_str())
    }

    /// 打开电子书并获取信息
    /// 
    /// TODO: 需要集成 MuPDF 或其他 PDF 库
    pub fn open(_path: &str) -> Result<EbookInfo, String> {
        Err("电子书支持尚未实现，请使用外部阅读器打开".to_string())
    }

    /// 渲染指定页面为 PNG 图片数据
    /// 
    /// TODO: 需要集成 MuPDF 或其他 PDF 库
    pub fn render_page(_path: &str, _page_index: usize, _scale: f32) -> Result<Vec<u8>, String> {
        Err("电子书渲染尚未实现".to_string())
    }

    /// 渲染页面到指定尺寸
    pub fn render_page_fit(
        path: &str,
        page_index: usize,
        max_width: u32,
        max_height: u32,
    ) -> Result<Vec<u8>, String> {
        // 计算默认缩放比例
        let scale = (max_width.min(max_height) as f32 / 800.0).min(4.0);
        Self::render_page(path, page_index, scale)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_supported() {
        assert!(EbookManager::is_supported("test.pdf"));
        assert!(EbookManager::is_supported("test.epub"));
        assert!(EbookManager::is_supported("test.PDF"));
        assert!(!EbookManager::is_supported("test.jpg"));
    }
}
