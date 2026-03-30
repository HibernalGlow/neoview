//! `NeoView` - Book Manager
//! 书籍管理核心模块

use crate::core::archive_index_cache::{is_image_file, ArchiveIndex, IndexCache, IndexEntry};
use crate::core::archive_preheat::PreheatSystem;
use crate::core::load_command_queue::{
    CommandQueue, LoadMetrics, LoadOptions, LoadResult, PerformanceMonitor,
};
use crate::core::path_utils::{build_path_key, calculate_path_hash};
use crate::core::video_exts;
use crate::models::{BookInfo, BookType, MediaPriorityMode, Page, PageSortMode};
use log::{debug, info};
use natural_sort_rs::natural_cmp;
use rand::seq::SliceRandom;
use rand::thread_rng;
use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

pub struct BookManager {
    current_book: Option<BookInfo>,
    /// 索引缓存
    index_cache: Arc<IndexCache>,
    /// 预热系统
    preheat_system: Arc<PreheatSystem>,
    /// 命令队列
    command_queue: Arc<CommandQueue>,
    /// 性能监控
    performance_monitor: Arc<PerformanceMonitor>,
}

impl BookManager {
    #[inline]
    fn ext_matches_any(ext: &str, candidates: &[&str]) -> bool {
        candidates
            .iter()
            .any(|candidate| ext.eq_ignore_ascii_case(candidate))
    }

    pub fn new() -> Self {
        Self::with_cache(Arc::new(IndexCache::default()))
    }

    /// 使用指定的索引缓存创建 BookManager
    pub fn with_cache(index_cache: Arc<IndexCache>) -> Self {
        Self {
            current_book: None,
            index_cache,
            preheat_system: Arc::new(PreheatSystem::default()),
            command_queue: Arc::new(CommandQueue::new()),
            performance_monitor: Arc::new(PerformanceMonitor::default()),
        }
    }

    /// 获取索引缓存
    pub fn index_cache(&self) -> &Arc<IndexCache> {
        &self.index_cache
    }

    /// 获取预热系统
    pub fn preheat_system(&self) -> &Arc<PreheatSystem> {
        &self.preheat_system
    }

    /// 获取命令队列
    pub fn command_queue(&self) -> &Arc<CommandQueue> {
        &self.command_queue
    }

    /// 获取性能监控
    pub fn performance_monitor(&self) -> &Arc<PerformanceMonitor> {
        &self.performance_monitor
    }

    /// 打开书籍
    pub fn open_book(&mut self, path: &str) -> Result<BookInfo, String> {
        let path_buf = PathBuf::from(path);

        if !path_buf.exists() {
            return Err(format!("Path does not exist: {}", path));
        }

        if let Some(current) = self.current_book.as_ref() {
            if Self::is_same_book_path(&current.path, path) {
                debug!("📖 BookManager: 重复打开同一路径，复用现有书籍上下文");
                return Ok(current.clone());
            }
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
            if Self::ext_matches_any(ext, &["zip", "rar", "7z", "cbz", "cbr"]) {
                return Ok(BookType::Archive);
            }

            if ext.eq_ignore_ascii_case("epub") {
                return Ok(BookType::Epub);
            }

            if ext.eq_ignore_ascii_case("pdf") {
                return Ok(BookType::Pdf);
            }

            // 常见视频扩展名，作为 Media 类型处理
            if video_exts::is_video_extension(ext) {
                return Ok(BookType::Media);
            }

            Err(format!("Unsupported file type: {}", ext))
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

        // 按文件名自然排序
        entries.sort_by(|a, b| {
            let a_name =
                a.1.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
            let b_name =
                b.1.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
            natural_cmp::<str, _>(&a_name, &b_name)
        });

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

    /// 加载压缩包中的图片页面（使用索引缓存）
    fn load_archive_pages(&self, path: &Path, book: &mut BookInfo) -> Result<(), String> {
        let start = Instant::now();

        // 尝试从缓存获取索引
        let index = if let Some(cached) = self.index_cache.get(path) {
            debug!("📦 使用缓存索引: {}", path.display());
            cached
        } else {
            // 缓存未命中，构建新索引
            debug!("📦 构建新索引: {}", path.display());
            let index = self.build_archive_index(path)?;
            self.index_cache.put(path, index)
        };

        let index_time = start.elapsed().as_millis() as u64;
        debug!("📦 索引加载耗时: {}ms", index_time);

        // 从索引构建页面列表
        let mut page_items: Vec<&IndexEntry> = index
            .entries
            .iter()
            .filter(|e| e.is_image || e.is_video)
            .collect();

        // 使用自然排序
        page_items.sort_by(|a, b| natural_cmp::<str, _>(&a.name, &b.name));

        // 创建页面列表
        for (idx, item) in page_items.iter().enumerate() {
            let path_key =
                build_path_key(&book.path, &item.path, &book.book_type, Some(&item.name));
            let stable_hash = calculate_path_hash(&path_key);

            let page = Page::new(idx, item.path.clone(), item.name.clone(), item.size)
                .with_stable_hash(stable_hash)
                .with_inner_path(Some(item.name.clone()))
                .with_entry_index(item.entry_index)
                .with_modified(item.modified);
            book.pages.push(page);
        }

        book.total_pages = book.pages.len();

        // 触发预热
        self.preheat_system.trigger(path);

        Ok(())
    }

    /// 构建压缩包索引
    fn build_archive_index(&self, path: &Path) -> Result<ArchiveIndex, String> {
        use crate::core::archive::ArchiveManager;

        let archive_manager = ArchiveManager::new();
        let items = archive_manager.list_contents(path)?;

        // 获取文件信息
        let metadata = fs::metadata(path).map_err(|e| format!("获取文件信息失败: {e}"))?;
        let mtime = metadata
            .modified()
            .map_err(|e| format!("获取修改时间失败: {e}"))?
            .duration_since(UNIX_EPOCH)
            .map_err(|e| format!("时间转换失败: {e}"))?
            .as_secs() as i64;
        let size = metadata.len();

        let mut index = ArchiveIndex::new(path.to_string_lossy().to_string(), mtime, size);

        for item in items {
            if item.is_dir {
                continue;
            }
            index.add_entry(IndexEntry {
                path: item.path.clone(),
                name: item.name.clone(),
                size: item.size,
                entry_index: item.entry_index,
                is_image: item.is_image,
                is_video: item.is_video,
                modified: item.modified,
            });
        }

        Ok(index)
    }

    /// 异步打开书籍（支持取消）
    pub fn open_book_async(
        &mut self,
        path: &str,
        options: LoadOptions,
    ) -> Result<BookInfo, String> {
        let start = Instant::now();
        let path_buf = PathBuf::from(path);

        // 提交命令到队列
        let command = self.command_queue.submit(path_buf.clone(), options.clone());

        // 检查是否已取消
        if command.is_cancelled() {
            return Err("加载已取消".to_string());
        }

        // 执行加载
        let result = self.open_book(path);

        // 记录性能指标
        let total_ms = start.elapsed().as_millis() as u64;
        let page_count = result.as_ref().map(|b| b.total_pages).unwrap_or(0);

        let metrics = LoadMetrics {
            index_load_ms: 0, // TODO: 细分计时
            first_page_ms: 0,
            full_list_ms: total_ms,
            total_ms,
            page_count,
            cache_hit: self.index_cache.get(&path_buf).is_some(),
        };
        self.performance_monitor.record(metrics);

        // 完成命令
        let load_result = LoadResult {
            command_id: command.id,
            success: result.is_ok(),
            error: result.as_ref().err().cloned(),
            duration_ms: total_ms,
            page_count,
        };
        self.command_queue.complete(load_result);

        result
    }

    /// 静态图片检查（不需要 self）
    fn is_image_file_static(&self, name: &str) -> bool {
        is_image_file(name)
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

            // EPUB 内的图片，使用 epub_path:inner_path 作为唯一 path
            let unique_path = format!("{}:{}", path_str, inner_path);
            let page = Page::new(index, unique_path, name.clone(), 0)
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
            Self::ext_matches_any(
                ext,
                &[
                    "jpg", "jpeg", "png", "gif", "bmp", "webp", "avif", "jxl", "tiff", "tif",
                ],
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

    /// 设置当前书籍的媒体类型优先模式
    pub fn set_media_priority_mode(&mut self, mode: MediaPriorityMode) -> Result<BookInfo, String> {
        if let Some(book) = &mut self.current_book {
            if book.media_priority_mode != mode {
                book.media_priority_mode = mode;
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

            // 应用媒体类型优先排序（稳定排序，保持原有顺序）
            match book.media_priority_mode {
                MediaPriorityMode::VideoFirst => {
                    book.pages.sort_by(|a, b| {
                        let a_is_video = Self::is_video_page(a);
                        let b_is_video = Self::is_video_page(b);
                        match (a_is_video, b_is_video) {
                            (true, false) => Ordering::Less,
                            (false, true) => Ordering::Greater,
                            _ => Ordering::Equal,
                        }
                    });
                }
                MediaPriorityMode::ImageFirst => {
                    book.pages.sort_by(|a, b| {
                        let a_is_video = Self::is_video_page(a);
                        let b_is_video = Self::is_video_page(b);
                        match (a_is_video, b_is_video) {
                            (true, false) => Ordering::Greater,
                            (false, true) => Ordering::Less,
                            _ => Ordering::Equal,
                        }
                    });
                }
                MediaPriorityMode::None => {}
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

    /// 判断页面是否为视频文件
    fn is_video_page(page: &Page) -> bool {
        let path = std::path::Path::new(&page.name);
        video_exts::is_video_path(path)
    }

    /// 自然排序比较（数字感知）
    /// 使用 natural-sort-rs 库
    fn cmp_insensitive(a: &str, b: &str) -> Ordering {
        natural_cmp::<str, _>(a, b)
    }

    fn system_time_to_unix(time: SystemTime) -> Option<i64> {
        time.duration_since(UNIX_EPOCH)
            .ok()
            .map(|d| d.as_secs() as i64)
    }

    fn is_same_book_path(existing_path: &str, requested_path: &str) -> bool {
        if cfg!(windows) {
            let normalized_existing = existing_path.replace('/', "\\");
            let normalized_requested = requested_path.replace('/', "\\");
            normalized_existing.eq_ignore_ascii_case(&normalized_requested)
        } else {
            existing_path == requested_path
        }
    }
}

impl Default for BookManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::BookManager;
    use std::fs;

    #[test]
    fn open_book_same_path_reuses_existing_context() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        fs::write(temp_dir.path().join("001.jpg"), b"a").expect("write image 1");
        fs::write(temp_dir.path().join("002.jpg"), b"b").expect("write image 2");

        let path = temp_dir.path().to_string_lossy().to_string();
        let mut manager = BookManager::new();

        let first = manager.open_book(&path).expect("first open");
        assert_eq!(first.total_pages, 2);

        manager.navigate_to_page(1).expect("goto page 1");

        let second = manager.open_book(&path).expect("second open");
        assert_eq!(second.current_page, 1);

        let current = manager.get_current_book().expect("current book");
        assert_eq!(current.current_page, 1);
    }

    #[cfg(windows)]
    #[test]
    fn open_book_same_path_with_mixed_separators_reuses_context() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        fs::write(temp_dir.path().join("001.jpg"), b"a").expect("write image 1");
        fs::write(temp_dir.path().join("002.jpg"), b"b").expect("write image 2");

        let canonical_path = temp_dir.path().to_string_lossy().to_string();
        let slash_variant = canonical_path.replace('\\', "/");
        let mut manager = BookManager::new();

        manager.open_book(&canonical_path).expect("first open");
        manager.navigate_to_page(1).expect("goto page 1");

        let second = manager.open_book(&slash_variant).expect("second open mixed separators");
        assert_eq!(second.current_page, 1);
    }
}
