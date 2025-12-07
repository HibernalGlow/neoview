//! NeoView - Book Context
//! 书籍上下文，管理当前打开书籍的状态

use serde::{Deserialize, Serialize};
use std::path::Path;

/// 页面内容类型（参考 NeeView PageContent）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PageContentType {
    /// 普通图片
    Image,
    /// 视频
    Video,
    /// 动图 (GIF/APNG/WebP动画)
    Animated,
    /// 嵌套压缩包
    Archive,
    /// 电子书 (PDF/EPUB/XPS 等，用 MuPDF 渲染)
    Ebook,
    /// 未知类型（不支持的文件）
    Unknown,
}

impl PageContentType {
    /// 从文件扩展名推断内容类型
    /// 
    /// 参考 NeeView 支持的格式
    pub fn from_extension(ext: &str) -> Self {
        let ext = ext.to_lowercase();
        match ext.as_str() {
            // 视频 (NeeView: MediaArchiveConfig)
            "mp4" | "mkv" | "webm" | "avi" | "mov" | "wmv" | "asf" | "flv" | "m4v" | "ts" => Self::Video,
            
            // 动图
            "gif" => Self::Animated,
            
            // 压缩包 (NeeView: ZipArchiveConfig + SevenZipArchiveConfig)
            "zip" | "rar" | "7z" | "cbz" | "cbr" | "cb7" | "lzh" | "tar" | "gz" | "bz2" | "xz" => Self::Archive,
            
            // 电子书 (MuPDF 支持的格式)
            "pdf" | "epub" | "xps" | "fb2" | "mobi" => Self::Ebook,
            
            // 普通图片 (NeeView: PictureFileExtensionTools + WIC)
            "jpg" | "jpeg" | "jpe" | "jfif" | "exif" |  // JPEG
            "png" | "apng" |                              // PNG
            "bmp" | "dib" | "rle" |                       // BMP
            "tiff" | "tif" |                              // TIFF
            "ico" | "icon" |                              // ICO
            "webp" |                                      // WebP
            "avif" |                                      // AVIF
            "jxl" |                                       // JPEG XL
            "svg" |                                       // SVG
            "wdp" | "jxr" |                               // JPEG XR
            "dds" |                                       // DirectDraw Surface
            "heic" | "heif" |                             // HEIF
            "psd" |                                       // Photoshop
            "raw" | "cr2" | "nef" | "arw" | "dng"         // RAW
            => Self::Image,
            
            _ => Self::Unknown,
        }
    }

    /// 是否是浏览器可以直接显示的类型
    pub fn is_browser_displayable(&self) -> bool {
        matches!(self, Self::Image | Self::Video | Self::Animated)
    }

    /// 是否需要提取到临时文件
    pub fn needs_temp_file(&self) -> bool {
        matches!(self, Self::Video)
    }
    
    /// 是否是嵌套压缩包（需要递归展开）
    pub fn is_nested_archive(&self) -> bool {
        matches!(self, Self::Archive)
    }

    /// 是否是电子书（用 MuPDF 渲染）
    pub fn is_ebook(&self) -> bool {
        matches!(self, Self::Ebook)
    }

    /// 从文件路径推断内容类型
    pub fn from_path(path: &str) -> Self {
        Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .map(Self::from_extension)
            .unwrap_or(Self::Unknown)
    }
}

/// 页面信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    /// 页面索引
    pub index: usize,
    /// 内部路径（压缩包内的路径）
    pub inner_path: String,
    /// 文件名
    pub name: String,
    /// 文件大小（如果已知）
    pub size: Option<u64>,
    /// 内容类型
    pub content_type: PageContentType,
    /// 图片宽度（使用 WIC 预读取）
    pub width: Option<u32>,
    /// 图片高度（使用 WIC 预读取）
    pub height: Option<u32>,
}

/// 书籍类型（参考 NeeView）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BookType {
    /// 压缩包（ZIP/RAR/7z）
    Archive,
    /// 文件夹
    Directory,
    /// 单个图片文件
    SingleImage,
    /// 单个视频文件
    SingleVideo,
    /// 播放列表
    Playlist,
    /// EPUB 电子书
    Epub,
}

/// 书籍上下文
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookContext {
    /// 书籍路径
    pub path: String,
    /// 书籍类型
    pub book_type: BookType,
    /// 页面列表
    pub pages: Vec<PageInfo>,
    /// 总页数
    pub total_pages: usize,
    /// 当前页索引
    pub current_index: usize,
    /// 阅读方向 (1=向前, -1=向后)
    pub read_direction: i32,
}

impl BookContext {
    /// 从压缩包创建
    pub fn from_archive(path: &str, page_paths: Vec<String>) -> Self {
        let mut nested_archives: Vec<String> = Vec::new();
        
        let pages: Vec<PageInfo> = page_paths
            .into_iter()
            .enumerate()
            .map(|(index, inner_path)| {
                let name = Path::new(&inner_path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(&inner_path)
                    .to_string();

                let content_type = PageContentType::from_path(&inner_path);
                
                // 检测嵌套压缩包
                if content_type == PageContentType::Archive {
                    nested_archives.push(inner_path.clone());
                }

                PageInfo {
                    index,
                    content_type,
                    inner_path,
                    name,
                    size: None,
                    width: None,
                    height: None,
                }
            })
            .collect();

        // 记录嵌套压缩包日志
        if !nested_archives.is_empty() {
            log::warn!(
                "📦 BookContext: 检测到 {} 个嵌套压缩包（暂不支持展开）: {:?}",
                nested_archives.len(),
                nested_archives
            );
        }

        let total_pages = pages.len();

        Self {
            path: path.to_string(),
            book_type: BookType::Archive,
            pages,
            total_pages,
            current_index: 0,
            read_direction: 1,
        }
    }

    /// 从 EPUB 电子书创建
    pub fn from_epub(path: &str, image_paths: Vec<String>) -> Self {
        let pages: Vec<PageInfo> = image_paths
            .into_iter()
            .enumerate()
            .map(|(index, inner_path)| {
                let name = Path::new(&inner_path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(&inner_path)
                    .to_string();

                PageInfo {
                    index,
                    content_type: PageContentType::Image, // EPUB 内的图片
                    inner_path,
                    name,
                    size: None,
                    width: None,
                    height: None,
                }
            })
            .collect();

        let total_pages = pages.len();

        log::info!(
            "📚 BookContext: 创建 EPUB 书籍 {} - {} 页",
            path,
            total_pages
        );

        Self {
            path: path.to_string(),
            book_type: BookType::Epub,
            pages,
            total_pages,
            current_index: 0,
            read_direction: 1,
        }
    }

    /// 从文件夹创建
    pub fn from_directory(path: &str, image_paths: Vec<String>) -> Self {
        let pages: Vec<PageInfo> = image_paths
            .into_iter()
            .enumerate()
            .map(|(index, full_path)| {
                let name = Path::new(&full_path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(&full_path)
                    .to_string();

                PageInfo {
                    index,
                    content_type: PageContentType::from_path(&full_path),
                    inner_path: full_path,
                    name,
                    size: None,
                    width: None,
                    height: None,
                }
            })
            .collect();

        let total_pages = pages.len();

        Self {
            path: path.to_string(),
            book_type: BookType::Directory,
            pages,
            total_pages,
            current_index: 0,
            read_direction: 1,
        }
    }

    /// 从单个图片文件创建（只有一页）
    pub fn from_single_image(path: &str) -> Self {
        let name = Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(path)
            .to_string();

        let page = PageInfo {
            index: 0,
            content_type: PageContentType::Image,
            inner_path: path.to_string(),
            name,
            size: None,
            width: None,
            height: None,
        };

        Self {
            path: path.to_string(),
            book_type: BookType::SingleImage,
            pages: vec![page],
            total_pages: 1,
            current_index: 0,
            read_direction: 1,
        }
    }

    /// 从单个视频文件创建（只有一页）
    pub fn from_single_video(path: &str) -> Self {
        let name = Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(path)
            .to_string();

        let page = PageInfo {
            index: 0,
            content_type: PageContentType::Video,
            inner_path: path.to_string(),
            name,
            size: None,
            width: None,
            height: None,
        };

        Self {
            path: path.to_string(),
            book_type: BookType::SingleVideo,
            pages: vec![page],
            total_pages: 1,
            current_index: 0,
            read_direction: 1,
        }
    }

    /// 跳转到指定页
    pub fn goto(&mut self, index: usize) -> bool {
        if index < self.total_pages {
            // 更新阅读方向
            if index != self.current_index {
                self.read_direction = if index > self.current_index { 1 } else { -1 };
            }
            self.current_index = index;
            true
        } else {
            false
        }
    }

    /// 获取当前页信息
    pub fn current_page(&self) -> Option<&PageInfo> {
        self.pages.get(self.current_index)
    }

    /// 获取指定页信息
    pub fn get_page(&self, index: usize) -> Option<&PageInfo> {
        self.pages.get(index)
    }

    /// 获取需要预加载的页面索引
    pub fn preload_range(&self, range: usize) -> Vec<usize> {
        let mut indices = Vec::new();

        // 向前预加载
        for i in 1..=range {
            let idx = self.current_index.saturating_add(i);
            if idx < self.total_pages {
                indices.push(idx);
            }
        }

        // 向后预加载
        for i in 1..=range {
            if self.current_index >= i {
                indices.push(self.current_index - i);
            }
        }

        indices
    }

    /// 是否为第一页
    pub fn is_first_page(&self) -> bool {
        self.current_index == 0
    }

    /// 是否为最后一页
    pub fn is_last_page(&self) -> bool {
        self.current_index + 1 >= self.total_pages
    }

    /// 下一页
    pub fn next(&mut self) -> bool {
        if self.current_index + 1 < self.total_pages {
            self.current_index += 1;
            self.read_direction = 1;
            true
        } else {
            false
        }
    }

    /// 上一页
    pub fn prev(&mut self) -> bool {
        if self.current_index > 0 {
            self.current_index -= 1;
            self.read_direction = -1;
            true
        } else {
            false
        }
    }
}

/// 简化的书籍信息（用于前端）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookInfo {
    pub path: String,
    pub book_type: BookType,
    pub total_pages: usize,
    pub current_index: usize,
}

impl From<&BookContext> for BookInfo {
    fn from(ctx: &BookContext) -> Self {
        Self {
            path: ctx.path.clone(),
            book_type: ctx.book_type,
            total_pages: ctx.total_pages,
            current_index: ctx.current_index,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_archive() {
        let pages = vec![
            "001.jpg".to_string(),
            "002.jpg".to_string(),
            "003.jpg".to_string(),
        ];

        let ctx = BookContext::from_archive("test.zip", pages);

        assert_eq!(ctx.total_pages, 3);
        assert_eq!(ctx.current_index, 0);
        assert_eq!(ctx.pages[0].name, "001.jpg");
    }

    #[test]
    fn test_navigation() {
        let pages = vec!["1.jpg".to_string(), "2.jpg".to_string(), "3.jpg".to_string()];
        let mut ctx = BookContext::from_archive("test.zip", pages);

        assert!(ctx.next());
        assert_eq!(ctx.current_index, 1);
        assert_eq!(ctx.read_direction, 1);

        assert!(ctx.prev());
        assert_eq!(ctx.current_index, 0);
        assert_eq!(ctx.read_direction, -1);

        assert!(!ctx.prev()); // 不能再往前
    }

    #[test]
    fn test_preload_range() {
        let pages: Vec<String> = (0..20).map(|i| format!("{}.jpg", i)).collect();
        let mut ctx = BookContext::from_archive("test.zip", pages);

        ctx.goto(10);
        let preload = ctx.preload_range(3);

        // 应该包含 11, 12, 13, 9, 8, 7
        assert!(preload.contains(&11));
        assert!(preload.contains(&12));
        assert!(preload.contains(&13));
        assert!(preload.contains(&9));
        assert!(preload.contains(&8));
        assert!(preload.contains(&7));
    }
}
