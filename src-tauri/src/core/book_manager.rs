//! NeoView - Book Manager
//! 书籍管理核心模块

use crate::core::path_utils::{build_path_key, calculate_path_hash};
use crate::core::video_exts;
use crate::models::{BookInfo, BookType, Page, PageSortMode};
use rand::seq::SliceRandom;
use rand::thread_rng;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct BookManager {
    current_book: Option<BookInfo>,
    /// 预加载的页面缓存
    preload_cache: Arc<Mutex<HashMap<usize, Vec<u8>>>>,
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
            println!(
                "Warning: Preload size {} is too large, limiting to 20",
                self.preload_size
            );
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
                        if let Ok(image_data) = image_loader_ref.load_image_as_binary(&path) {
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
    pub fn get_preloaded_page(&self, page_index: usize) -> Option<Vec<u8>> {
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
            BookType::Epub => {
                // EPUB 电子书：提取内部图片
                self.load_epub_pages(&path_buf, &mut book)?;
            }
            BookType::Pdf => {
                // TODO: 实现 PDF 支持
                return Err("PDF support not yet implemented".to_string());
            }
            BookType::Media => {
                // 单文件媒体类型（视频等）：构造仅包含一个页面的 Book
                self.load_media_pages(&path_buf, &mut book)?;
            }
        }

        Self::apply_page_sort(&mut book, true);
        self.current_book = Some(book.clone());
        Ok(book)
    }

    /// 检测书籍类型
    fn detect_book_type(&self, path: &Path) -> Result<BookType, String> {
        if path.is_dir() {
            return Ok(BookType::Folder);
        }

        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            let lower = ext.to_lowercase();
            match lower.as_str() {
                "zip" | "rar" | "7z" | "cbz" | "cbr" => Ok(BookType::Archive),
                "epub" => Ok(BookType::Epub),
                "pdf" => Ok(BookType::Pdf),
                // 常见视频扩展名，作为 Media 类型处理
                _ if video_exts::is_video_extension(&lower) => Ok(BookType::Media),
                _ => Err(format!("Unsupported file type: {}", ext)),
            }
        } else {
            Err("Cannot determine file type".to_string())
        }
    }

    /// 加载文件夹中的图片页面
    fn load_folder_pages(&self, path: &Path, book: &mut BookInfo) -> Result<(), String> {
        let mut entries: Vec<(usize, PathBuf, u64, Option<i64>)> = Vec::new();
        let mut entry_counter = 0usize;

        let read_dir =
            fs::read_dir(path).map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in read_dir {
            if let Ok(entry) = entry {
                let path = entry.path();
                // 文件夹书籍支持图片和视频作为页面
                if self.is_image_file(&path) || self.is_video_file(&path) {
                    if let Ok(metadata) = entry.metadata() {
                        let modified = metadata.modified().ok().and_then(Self::system_time_to_unix);
                        entries.push((entry_counter, path, metadata.len(), modified));
                        entry_counter += 1;
                    }
                }
            }
        }

        // 按文件名排序
        entries.sort_by(|a, b| a.1.file_name().cmp(&b.1.file_name()));

        // 创建页面列表
        for (index, (entry_index, path, size, modified)) in entries.into_iter().enumerate() {
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown")
                .to_string();

            let path_str = path.to_string_lossy().to_string();

            // 为文件夹类型计算 stable_hash
            let path_key = build_path_key(&book.path, &path_str, &book.book_type, None);
            let stable_hash = calculate_path_hash(&path_key);

            let page = Page::new(index, path_str, name, size)
                .with_stable_hash(stable_hash)
                .with_entry_index(entry_index)
                .with_modified(modified);
            book.pages.push(page);
        }

        book.total_pages = book.pages.len();
        Ok(())
    }

    /// 加载单文件媒体页面（视频等）
    fn load_media_pages(&self, path: &Path, book: &mut BookInfo) -> Result<(), String> {
        let metadata =
            fs::metadata(path).map_err(|e| format!("Failed to read media file metadata: {}", e))?;

        let size = metadata.len();
        let modified = metadata.modified().ok().and_then(Self::system_time_to_unix);
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unknown")
            .to_string();

        let path_str = path.to_string_lossy().to_string();

        // 为媒体类型计算 stable_hash
        let path_key = build_path_key(&book.path, &path_str, &book.book_type, None);
        let stable_hash = calculate_path_hash(&path_key);

        let page = Page::new(0, path_str, name, size)
            .with_stable_hash(stable_hash)
            .with_modified(modified);
        book.pages.push(page);
        book.total_pages = 1;
        Ok(())
    }

    /// 加载压缩包中的图片页面
    fn load_archive_pages(&self, path: &Path, book: &mut BookInfo) -> Result<(), String> {
        use crate::core::archive::ArchiveManager;

        let archive_manager = ArchiveManager::new();
        // 使用 list_contents 自动检测格式（支持 ZIP/RAR/7z）
        let items = archive_manager.list_contents(path)?;

        // 过滤出图片/视频文件并按名称排序
        let mut page_items: Vec<_> = items
            .into_iter()
            .filter(|item| {
                if item.is_dir {
                    return false;
                }
                let path = PathBuf::from(&item.name);
                self.is_image_file(&path) || self.is_video_file(&path)
            })
            .collect();

        page_items.sort_by(|a, b| a.name.cmp(&b.name));

        // 创建页面列表
        for (index, item) in page_items.iter().enumerate() {
            // 对于压缩包，计算 stable_hash
            let path_key =
                build_path_key(&book.path, &item.path, &book.book_type, Some(&item.name));
            let stable_hash = calculate_path_hash(&path_key);

            // 对于压缩包,path 使用压缩包内的文件路径
            let page = Page::new(index, item.path.clone(), item.name.clone(), item.size)
                .with_stable_hash(stable_hash)
                .with_inner_path(Some(item.name.clone()))
                .with_entry_index(item.entry_index)
                .with_modified(item.modified);
            book.pages.push(page);
        }

        book.total_pages = book.pages.len();
        Ok(())
    }

    /// 加载 EPUB 电子书中的图片页面
    fn load_epub_pages(&self, path: &Path, book: &mut BookInfo) -> Result<(), String> {
        use crate::core::ebook::EbookManager;
        
        let path_str = path.to_string_lossy();
        let image_paths = EbookManager::list_epub_images(&path_str)?;
        
        log::info!("📚 BookManager: 从 EPUB 加载 {} 张图片", image_paths.len());
        
        for (index, inner_path) in image_paths.into_iter().enumerate() {
            let name = Path::new(&inner_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&inner_path)
                .to_string();
            
            let stable_hash = calculate_path_hash(&format!("{}:{}", path_str, inner_path));
            
            // EPUB 内的图片，path 存储 EPUB 路径，inner_path 存储内部路径
            let page = Page::new(index, path_str.to_string(), name.clone(), 0)
                .with_stable_hash(stable_hash)
                .with_inner_path(Some(inner_path))
                .with_entry_index(index);
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

    /// 检查是否是视频文件（用于将视频作为页面纳入 Folder/Archive 书籍）
    fn is_video_file(&self, path: &Path) -> bool {
        video_exts::is_video_path(path)
    }

    /// 获取当前书籍
    pub fn get_current_book(&self) -> Option<&BookInfo> {
        self.current_book.as_ref()
    }

    /// 设置当前书籍的排序模式
    pub fn set_sort_mode(&mut self, sort_mode: PageSortMode) -> Result<BookInfo, String> {
        if let Some(book) = &mut self.current_book {
            if book.sort_mode != sort_mode {
                book.sort_mode = sort_mode;
                Self::apply_page_sort(book, false);
            }
            Ok(book.clone())
        } else {
            Err("No book is currently open".to_string())
        }
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
                if page.path == image_path
                    || (book.book_type == BookType::Archive && page.path.contains(image_path))
                    || (book.book_type == BookType::Folder
                        && PathBuf::from(&page.path) == PathBuf::from(image_path))
                {
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

    fn apply_page_sort(book: &mut BookInfo, initial_load: bool) {
        if book.pages.is_empty() {
            return;
        }

        let sort_mode = book.sort_mode.clone();
        let current_hash = book
            .pages
            .get(book.current_page)
            .map(|page| page.stable_hash.clone());

        let skip_sort = initial_load && matches!(sort_mode, PageSortMode::FileName);

        if !skip_sort {
            match sort_mode {
                PageSortMode::FileName => book.pages.sort_by(Self::cmp_name_asc),
                PageSortMode::FileNameDescending => book.pages.sort_by(Self::cmp_name_desc),
                PageSortMode::FileSize => book.pages.sort_by(Self::cmp_size_asc),
                PageSortMode::FileSizeDescending => book.pages.sort_by(Self::cmp_size_desc),
                PageSortMode::TimeStamp => book.pages.sort_by(Self::cmp_timestamp_asc),
                PageSortMode::TimeStampDescending => book.pages.sort_by(Self::cmp_timestamp_desc),
                PageSortMode::Random => {
                    let mut rng = thread_rng();
                    book.pages.shuffle(&mut rng);
                }
                PageSortMode::Entry => book.pages.sort_by(Self::cmp_entry_asc),
                PageSortMode::EntryDescending => book.pages.sort_by(Self::cmp_entry_desc),
            }
        }

        let mut new_current = book.current_page.min(book.pages.len() - 1);
        if let Some(ref hash) = current_hash {
            if let Some(idx) = book.pages.iter().position(|p| &p.stable_hash == hash) {
                new_current = idx;
            }
        }

        for (idx, page) in book.pages.iter_mut().enumerate() {
            page.index = idx;
        }

        book.current_page = new_current;
        book.total_pages = book.pages.len();
    }

    fn cmp_name_asc(a: &Page, b: &Page) -> Ordering {
        Self::cmp_insensitive(&a.name, &b.name).then_with(|| a.entry_index.cmp(&b.entry_index))
    }

    fn cmp_name_desc(a: &Page, b: &Page) -> Ordering {
        Self::cmp_name_asc(b, a)
    }

    fn cmp_size_asc(a: &Page, b: &Page) -> Ordering {
        a.size
            .cmp(&b.size)
            .then_with(|| Self::cmp_insensitive(&a.name, &b.name))
            .then_with(|| a.entry_index.cmp(&b.entry_index))
    }

    fn cmp_size_desc(a: &Page, b: &Page) -> Ordering {
        Self::cmp_size_asc(b, a)
    }

    fn cmp_timestamp_asc(a: &Page, b: &Page) -> Ordering {
        let a_ts = a.modified.unwrap_or(i64::MIN);
        let b_ts = b.modified.unwrap_or(i64::MIN);
        a_ts.cmp(&b_ts)
            .then_with(|| Self::cmp_insensitive(&a.name, &b.name))
            .then_with(|| a.entry_index.cmp(&b.entry_index))
    }

    fn cmp_timestamp_desc(a: &Page, b: &Page) -> Ordering {
        Self::cmp_timestamp_asc(b, a)
    }

    fn cmp_entry_asc(a: &Page, b: &Page) -> Ordering {
        a.entry_index
            .cmp(&b.entry_index)
            .then_with(|| Self::cmp_insensitive(&a.name, &b.name))
    }

    fn cmp_entry_desc(a: &Page, b: &Page) -> Ordering {
        Self::cmp_entry_asc(b, a)
    }

    fn cmp_insensitive(a: &str, b: &str) -> Ordering {
        let al = a.to_lowercase();
        let bl = b.to_lowercase();
        al.cmp(&bl).then_with(|| a.cmp(b))
    }

    fn system_time_to_unix(time: SystemTime) -> Option<i64> {
        time.duration_since(UNIX_EPOCH)
            .ok()
            .map(|d| d.as_secs() as i64)
    }
}

impl Default for BookManager {
    fn default() -> Self {
        Self::new()
    }
}
