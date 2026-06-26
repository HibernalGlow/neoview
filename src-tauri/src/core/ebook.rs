//! NeoView - 电子书处理模块
//!
//! 支持格式：
//! - EPUB: 使用 epub crate 解析，提取内部图片
//! - PDF: 前端使用 pdf.js 渲染（后端只提取文件路径）

use epub::doc::EpubDoc;
use std::path::Path;

/// 电子书管理器
pub struct EbookManager;

/// 电子书资源信息
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EbookResource {
    /// 资源路径
    pub path: String,
    /// MIME 类型
    pub mime_type: String,
    /// 是否是图片
    pub is_image: bool,
}

/// 电子书信息
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EbookInfo {
    /// 文件路径
    pub path: String,
    /// 格式类型
    pub format: String,
    /// 标题
    pub title: Option<String>,
    /// 作者
    pub author: Option<String>,
    /// 图片资源列表
    pub images: Vec<EbookResource>,
    /// 总图片数
    pub image_count: usize,
}

/// 支持的电子书扩展名
pub const EPUB_EXTENSIONS: &[&str] = &["epub"];
pub const PDF_EXTENSIONS: &[&str] = &["pdf"];

impl EbookManager {
    /// 检查是否是 EPUB 格式
    pub fn is_epub(path: &str) -> bool {
        let ext = Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        EPUB_EXTENSIONS.contains(&ext.as_str())
    }

    /// 检查是否是 PDF 格式
    pub fn is_pdf(path: &str) -> bool {
        let ext = Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        PDF_EXTENSIONS.contains(&ext.as_str())
    }

    /// 打开 EPUB 并获取信息
    pub fn open_epub(path: &str) -> Result<EbookInfo, String> {
        let doc = EpubDoc::new(path).map_err(|e| format!("打开 EPUB 失败: {}", e))?;

        // epub crate 的 mdata 返回 Option<&MetadataItem>，需要转换为 String
        let title = doc.mdata("title").map(|m| m.value.clone());
        let author = doc.mdata("creator").map(|m| m.value.clone());

        // 收集所有图片资源
        // ResourceItem 是结构体，包含 path 和 mime 字段
        let mut images = Vec::new();
        for (_id, resource) in doc.resources.iter() {
            if resource.mime.starts_with("image/") {
                images.push(EbookResource {
                    path: resource.path.to_string_lossy().to_string(),
                    mime_type: resource.mime.clone(),
                    is_image: true,
                });
            }
        }

        // 按路径排序
        images.sort_by(|a, b| a.path.cmp(&b.path));
        let image_count = images.len();

        log::info!(
            "📚 EbookManager: 打开 EPUB {} - {} 张图片",
            path,
            image_count
        );

        Ok(EbookInfo {
            path: path.to_string(),
            format: "epub".to_string(),
            title,
            author,
            images,
            image_count,
        })
    }

    /// 从 EPUB 获取图片数据
    pub fn get_epub_image(path: &str, resource_path: &str) -> Result<(Vec<u8>, String), String> {
        let mut doc = EpubDoc::new(path).map_err(|e| format!("打开 EPUB 失败: {}", e))?;

        // 查找资源的 MIME 类型
        let mime = doc
            .resources
            .iter()
            .find(|(_, resource)| resource.path.to_string_lossy() == resource_path)
            .map(|(_, resource)| resource.mime.clone())
            .unwrap_or_else(|| "application/octet-stream".to_string());

        // 获取资源数据
        let data = doc
            .get_resource_by_path(resource_path)
            .ok_or_else(|| format!("找不到资源: {}", resource_path))?;

        Ok((data, mime))
    }

    /// 列出 EPUB 中的所有图片路径
    pub fn list_epub_images(path: &str) -> Result<Vec<String>, String> {
        let doc = EpubDoc::new(path).map_err(|e| format!("打开 EPUB 失败: {}", e))?;

        let mut images: Vec<String> = doc
            .resources
            .iter()
            .filter(|(_, resource)| resource.mime.starts_with("image/"))
            .map(|(_, resource)| resource.path.to_string_lossy().to_string())
            .collect();

        images.sort();
        Ok(images)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_epub() {
        assert!(EbookManager::is_epub("test.epub"));
        assert!(EbookManager::is_epub("test.EPUB"));
        assert!(!EbookManager::is_epub("test.pdf"));
    }

    #[test]
    fn test_is_pdf() {
        assert!(EbookManager::is_pdf("test.pdf"));
        assert!(EbookManager::is_pdf("test.PDF"));
        assert!(!EbookManager::is_pdf("test.epub"));
    }
}
