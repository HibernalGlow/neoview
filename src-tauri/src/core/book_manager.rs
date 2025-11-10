//! NeoView - Book Manager
//! 书籍管理核心模块

use crate::models::{BookInfo, BookType, Page};
use std::fs;
use std::path::{Path, PathBuf};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub struct BookManager {
    current_book: Option<BookInfo>,
    /// 预加载的页面缓存
    preload_cache: Arc<Mutex<HashMap<usize, String>>>,
    /// 预加载数量
    preload_size: usize,
}

impl BookManager {
    pub fn new() -> Self {
        Self {
            current_book: None,
            preload_cache: Arc::new(Mutex::new(HashMap::new())),
            preload_size: 3,
        }
    }

    /// 设置预加载数量
    pub fn set_preload_size(&mut self, size: usize) {
        self.preload_size = size;
    }

    /// 预加载页面
    pub fn preload_pages(&self, image_loader: &super::ImageLoader) {
        // 限制预加载数量，避免过度占用资源
        if self.preload_size > 20 {
            println!("Warning: Preload size {} is too large, limiting to 20", self.preload_size);
            return;
        }
        
        if let Some(book) = &self.current_book {
            let current_page = book.current_page;
            let total_pages = book.total_pages;
            
            // 计算需要预加载的页面范围
            let preload_count = std::cmp::min(self.preload_size, 20);
            let start = current_page.saturating_sub(1);
            let end = (current_page + preload_count).min(total_pages - 1);
            
            // 清理旧的预加载缓存
            if let Ok(mut cache) = self.preload_cache.lock() {
                cache.retain(|&page_idx, _| {
                    // 只保留当前页和前后1页
                    page_idx >= current_page.saturating_sub(1) && page_idx <= current_page + 1
                });
            }
            
            // 预加载新页面（限制并发数）
            for page_idx in start..=end {
                if page_idx == current_page {
                    continue; // 跳过当前页
                }
                
                if let Some(page) = book.pages.get(page_idx) {
                    let path = page.path.clone();
                    let cache_clone = Arc::clone(&self.preload_cache);
                    
                    // 检查是否已经在缓存中
                    if let Ok(cache) = self.preload_cache.lock() {
                        if cache.contains_key(&page_idx) {
                            continue;
                        }
                    }
                    
                    // 获取线程池引用
                    let thread_pool = Arc::clone(&image_loader.thread_pool);
                    let image_loader_ref = image_loader.clone();
                    
                    // 异步加载，避免阻塞
                    thread_pool.execute(move || {
                        if let Ok(image_data) = image_loader_ref.load_image_as_base64(&path) {
                            if let Ok(mut cache) = cache_clone.lock() {
                                cache.insert(page_idx, image_data);
                            }
                        }
                    });
                }
            }
        }
    }

    /// 获取预加载的页面
    pub fn get_preloaded_page(&self, page_index: usize) -> Option<String> {
        if let Ok(cache) = self.preload_cache.lock() {
            cache.get(&page_index).cloned()
        } else {
            None
        }
    }

    /// 打开书籍
    pub fn open_book(&mut self, path: &str) -> Result<BookInfo, String> {
        let path_buf = PathBuf::from(path);
        
        if !path_buf.exists() {
            return Err(format!("Path does not exist: {}", path));
        }

        let book_type = self.detect_book_type(&path_buf)?;
        let name = path_buf
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unknown")
            .to_string();

        let mut book = BookInfo::new(path.to_string(), name, book_type.clone());

        // 根据书籍类型加载页面
        match book_type {
            BookType::Folder => {
                self.load_folder_pages(&path_buf, &mut book)?;
            }
            BookType::Archive => {
                self.load_archive_pages(&path_buf, &mut book)?;
            }
            BookType::Pdf => {
                // TODO: 实现 PDF 支持
                return Err("PDF support not yet implemented".to_string());
            }
            BookType::Media => {
                // TODO: 实现媒体文件支持
                return Err("Media support not yet implemented".to_string());
            }
        }

        self.current_book = Some(book.clone());
        Ok(book)
    }

    /// 检测书籍类型
    fn detect_book_type(&self, path: &Path) -> Result<BookType, String> {
        if path.is_dir() {
            return Ok(BookType::Folder);
        }

        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            match ext.to_lowercase().as_str() {
                "zip" | "rar" | "7z" | "cbz" | "cbr" => Ok(BookType::Archive),
                "pdf" => Ok(BookType::Pdf),
                _ => Err(format!("Unsupported file type: {}", ext)),
            }
        } else {
            Err("Cannot determine file type".to_string())
        }
    }

    /// 加载文件夹中的图片页面
    fn load_folder_pages(&self, path: &Path, book: &mut BookInfo) -> Result<(), String> {
        let mut entries = Vec::new();

        let read_dir = fs::read_dir(path)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in read_dir {
            if let Ok(entry) = entry {
                let path = entry.path();
                if self.is_image_file(&path) {
                    if let Ok(metadata) = entry.metadata() {
                        entries.push((path, metadata.len()));
                    }
                }
            }
        }

        // 按文件名排序
        entries.sort_by(|a, b| a.0.file_name().cmp(&b.0.file_name()));

        // 创建页面列表
        for (index, (path, size)) in entries.iter().enumerate() {
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown")
                .to_string();
            
            let path_str = path.to_string_lossy().to_string();
            
            let page = Page::new(index, path_str, name, *size);
            book.pages.push(page);
        }

        book.total_pages = book.pages.len();
        Ok(())
    }

    /// 加载压缩包中的图片页面
    fn load_archive_pages(&self, path: &Path, book: &mut BookInfo) -> Result<(), String> {
        use crate::core::archive::ArchiveManager;
        
        let archive_manager = ArchiveManager::new();
        let items = archive_manager.list_zip_contents(path)?;
        
        // 过滤出图片文件并按名称排序
        let mut image_items: Vec<_> = items.into_iter()
            .filter(|item| !item.is_dir && self.is_image_file(&PathBuf::from(&item.name)))
            .collect();
        
        image_items.sort_by(|a, b| a.name.cmp(&b.name));
        
        // 创建页面列表
        for (index, item) in image_items.iter().enumerate() {
            // 对于压缩包,path 使用压缩包内的文件路径
            let page = Page::new(index, item.path.clone(), item.name.clone(), item.size);
            book.pages.push(page);
        }
        
        book.total_pages = book.pages.len();
        Ok(())
    }

    /// 检查是否是图片文件
    fn is_image_file(&self, path: &Path) -> bool {
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            matches!(
                ext.to_lowercase().as_str(),
                "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "avif" | "jxl" | "tiff" | "tif"
            )
        } else {
            false
        }
    }

    /// 获取当前书籍
    pub fn get_current_book(&self) -> Option<&BookInfo> {
        self.current_book.as_ref()
    }

    /// 导航到指定页面
    pub fn navigate_to_page(&mut self, page_index: usize) -> Result<(), String> {
        if let Some(book) = &mut self.current_book {
            if page_index < book.total_pages {
                book.current_page = page_index;
                Ok(())
            } else {
                Err(format!(
                    "Page index {} out of range (total: {})",
                    page_index, book.total_pages
                ))
            }
        } else {
            Err("No book is currently open".to_string())
        }
    }

    /// 下一页
    pub fn next_page(&mut self) -> Result<usize, String> {
        if let Some(book) = &mut self.current_book {
            if book.current_page < book.total_pages - 1 {
                book.current_page += 1;
                Ok(book.current_page)
            } else {
                Err("Already at last page".to_string())
            }
        } else {
            Err("No book is currently open".to_string())
        }
    }

    /// 上一页
    pub fn previous_page(&mut self) -> Result<usize, String> {
        if let Some(book) = &mut self.current_book {
            if book.current_page > 0 {
                book.current_page -= 1;
                Ok(book.current_page)
            } else {
                Err("Already at first page".to_string())
            }
        } else {
            Err("No book is currently open".to_string())
        }
    }

    /// 根据图片路径导航到对应页面
    pub fn navigate_to_image(&mut self, image_path: &str) -> Result<usize, String> {
        if let Some(book) = &mut self.current_book {
            // 查找匹配的页面
            for (index, page) in book.pages.iter().enumerate() {
                // 对于压缩包，page.path 是相对路径
                // 对于文件夹，page.path 是绝对路径
                if page.path == image_path || 
                   (book.book_type == BookType::Archive && page.path.contains(image_path)) ||
                   (book.book_type == BookType::Folder && PathBuf::from(&page.path) == PathBuf::from(image_path)) {
                    book.current_page = index;
                    return Ok(index);
                }
            }
            Err(format!("Image not found in book: {}", image_path))
        } else {
            Err("No book is currently open".to_string())
        }
    }

    /// 关闭当前书籍
    pub fn close_book(&mut self) {
        self.current_book = None;
    }
}

impl Default for BookManager {
    fn default() -> Self {
        Self::new()
    }
}
