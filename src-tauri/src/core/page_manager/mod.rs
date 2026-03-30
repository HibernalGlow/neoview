//! NeoView - Page Content Manager
//! 参考 NeeView 的 BookMemoryService，实现后端主导的页面加载系统
//!
//! ## 核心职责
//!
//! 1. 管理当前书籍上下文
//! 2. 调度页面加载任务
//! 3. 管理内存缓存池
//! 4. 自动预加载邻近页面

mod book_context;
mod file_proxy;
mod memory_pool;

pub use book_context::{BookContext, BookInfo, BookType, PageContentType, PageInfo};
pub use file_proxy::{FileProxy, TempFileManager, TempFileStats};
pub use memory_pool::{CachedPage, MemoryPool, MemoryPoolStats, PageKey};

/// 缩略图就绪事件（通过 Tauri 事件推送到前端）
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailReadyEvent {
    /// 页面索引
    pub index: usize,
    /// 缩略图数据（data:image/webp;base64,...）
    pub data: String,
    /// 缩略图宽度
    pub width: u32,
    /// 缩略图高度
    pub height: u32,
}

/// 缩略图项
#[derive(Debug, Clone)]
pub struct ThumbnailItem {
    /// 缩略图数据（WebP 格式）
    pub data: Vec<u8>,
    /// 宽度
    pub width: u32,
    /// 高度
    pub height: u32,
}

use crate::core::archive::ArchiveManager;
use crate::core::job_engine::{Job, JobEngine, JobOutput, JobPriority, JobResult};
use crate::models::{BookInfo as ModelBookInfo, BookType as ModelBookType, Page as ModelPage};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::Mutex;

/// 预加载范围（前后各 N 页）
const PRELOAD_RANGE: usize = 5;
/// 默认缓存大小 (MB)
const DEFAULT_CACHE_SIZE_MB: usize = 512;

/// 从图片数据读取尺寸（使用 image crate）
fn get_image_dimensions(data: &[u8]) -> Option<(u32, u32)> {
    use image::ImageReader;
    use std::io::Cursor;

    ImageReader::new(Cursor::new(data))
        .with_guessed_format()
        .ok()
        .and_then(|reader| reader.into_dimensions().ok())
}

/// 页面管理器统计
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageManagerStats {
    /// 内存池统计
    pub memory: MemoryPoolStats,
    /// 当前书籍路径
    pub current_book: Option<String>,
    /// 当前页索引
    pub current_index: usize,
    /// 总页数
    pub total_pages: usize,
    /// 已缓存页面
    pub cached_pages: Vec<usize>,
}

/// 加载模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LoadMode {
    /// 内存模式 - 数据在内存中
    Memory,
    /// 临时文件模式 - 数据在临时文件中
    Tempfile,
}

/// 页面加载结果
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageLoadResult {
    /// 页面索引
    pub index: usize,
    /// 数据大小
    pub size: usize,
    /// MIME 类型
    pub mime_type: String,
    /// 是否缓存命中
    pub cache_hit: bool,
    /// 加载模式
    pub load_mode: LoadMode,
    /// 临时文件路径（仅 Tempfile 模式）
    pub temp_path: Option<String>,
    /// 图片宽度（如果是图片）
    pub width: Option<u32>,
    /// 图片高度（如果是图片）
    pub height: Option<u32>,
}

/// 页面内容管理器
pub struct PageContentManager {
    /// Job 引擎
    job_engine: Arc<JobEngine>,
    /// 内存池
    memory_pool: Arc<Mutex<MemoryPool>>,
    /// 压缩包管理器
    archive_manager: Arc<std::sync::Mutex<ArchiveManager>>,
    /// 临时文件管理器
    temp_manager: Arc<TempFileManager>,
    /// 当前书籍上下文
    current_book: Option<BookContext>,
    /// 缩略图缓存（书籍路径 -> 页索引 -> 缩略图数据）
    thumbnail_cache: std::collections::HashMap<usize, ThumbnailItem>,
    /// 当前缩略图缓存对应的书籍路径
    thumbnail_cache_book: Option<String>,
}

impl PageContentManager {
    /// 创建页面管理器
    pub fn new(
        job_engine: Arc<JobEngine>,
        archive_manager: Arc<std::sync::Mutex<ArchiveManager>>,
    ) -> Self {
        let temp_dir = std::env::temp_dir().join("neoview_pages");
        Self {
            job_engine,
            memory_pool: Arc::new(Mutex::new(MemoryPool::new(DEFAULT_CACHE_SIZE_MB))),
            archive_manager,
            temp_manager: Arc::new(TempFileManager::new(temp_dir)),
            current_book: None,
            thumbnail_cache: std::collections::HashMap::new(),
            thumbnail_cache_book: None,
        }
    }

    /// 创建带自定义缓存大小的管理器
    pub fn with_cache_size(
        job_engine: Arc<JobEngine>,
        archive_manager: Arc<std::sync::Mutex<ArchiveManager>>,
        cache_size_mb: usize,
    ) -> Self {
        let temp_dir = std::env::temp_dir().join("neoview_pages");
        Self {
            job_engine,
            memory_pool: Arc::new(Mutex::new(MemoryPool::new(cache_size_mb))),
            archive_manager,
            temp_manager: Arc::new(TempFileManager::new(temp_dir)),
            current_book: None,
            thumbnail_cache: std::collections::HashMap::new(),
            thumbnail_cache_book: None,
        }
    }

    /// 打开书籍
    pub async fn open_book(&mut self, path: &str) -> Result<BookInfo, String> {
        log::info!("📖 PageManager: 打开书籍 {}", path);

        // 同路径重复打开直接复用当前上下文，避免重复扫描。
        if let Some(current) = self.current_book.as_ref() {
            if current.path == path {
                return Ok(BookInfo::from(current));
            }
        }

        // 清理旧书籍
        if let Some(ref old_book) = self.current_book {
            self.job_engine.cancel_book(&old_book.path).await;
            self.memory_pool.lock().await.clear_book(&old_book.path);
        }

        // 判断书籍类型并创建 BookContext
        let path_obj = Path::new(path);
        let book = if path_obj.is_dir() {
            // 文件夹
            let images = self.scan_directory(path)?;
            BookContext::from_directory(path, images)
        } else if Self::is_epub_file(path) {
            // EPUB 电子书（必须在 archive 之前检查）
            log::info!("📚 PageManager: 检测到 EPUB 文件，开始扫描...");
            let images = Self::scan_epub(path).map_err(|e| {
                log::error!("📚 PageManager: EPUB 扫描失败: {}", e);
                e
            })?;
            log::info!(
                "📚 PageManager: EPUB 扫描完成，找到 {} 张图片",
                images.len()
            );
            BookContext::from_epub(path, images)
        } else if Self::is_archive_file(path) {
            // 压缩包
            let images = self.scan_archive(path)?;
            BookContext::from_archive(path, images)
        } else if Self::is_image_file(path) {
            // 单个图片文件
            BookContext::from_single_image(path)
        } else if Self::is_video_file(path) {
            // 单个视频文件
            BookContext::from_single_video(path)
        } else {
            return Err(format!("不支持的文件类型: {}", path));
        };

        log::info!(
            "📖 PageManager: 已加载 {} 页 (类型: {:?})",
            book.total_pages,
            book.book_type
        );

        let info = BookInfo::from(&book);
        self.current_book = Some(book);

        Ok(info)
    }

    /// 从 `BookManager` 的书籍信息同步上下文，避免重复扫描。
    pub async fn sync_from_model_book(&mut self, book: &ModelBookInfo) -> Result<BookInfo, String> {
        let same_path_target = self.current_book.as_ref().and_then(|current| {
            if current.path == book.path {
                Some(book.current_page.min(current.total_pages.saturating_sub(1)))
            } else {
                None
            }
        });

        if let Some(target_index) = same_path_target {
            if let Some(current_mut) = self.current_book.as_mut() {
                let _ = current_mut.goto(target_index);
                return Ok(BookInfo::from(&*current_mut));
            }
        }

        let old_path_to_cleanup = self
            .current_book
            .as_ref()
            .map(|current| current.path.clone());

        if let Some(old_path) = old_path_to_cleanup {
            self.job_engine.cancel_book(&old_path).await;
            self.memory_pool.lock().await.clear_book(&old_path);
        }

        let mut context = Self::build_context_from_model_book(book)?;
        let _ = context.goto(book.current_page.min(context.total_pages.saturating_sub(1)));
        let info = BookInfo::from(&context);
        self.current_book = Some(context);
        Ok(info)
    }

    fn build_context_from_model_book(book: &ModelBookInfo) -> Result<BookContext, String> {
        let book_type = Self::map_model_book_type(book)?;
        let mut pages = Vec::with_capacity(book.pages.len());

        for (index, page) in book.pages.iter().enumerate() {
            pages.push(PageInfo {
                index,
                inner_path: Self::resolve_inner_path(book_type, &book.path, page),
                name: page.name.clone(),
                size: Some(page.size),
                content_type: Self::resolve_content_type(page),
                width: page.width,
                height: page.height,
            });
        }

        let total_pages = pages.len();
        Ok(BookContext {
            path: book.path.clone(),
            book_type,
            pages,
            total_pages,
            current_index: 0,
            read_direction: 1,
        })
    }

    fn map_model_book_type(book: &ModelBookInfo) -> Result<BookType, String> {
        let mapped = match book.book_type {
            ModelBookType::Archive => BookType::Archive,
            ModelBookType::Folder => BookType::Directory,
            ModelBookType::Epub => BookType::Epub,
            ModelBookType::Media => {
                if let Some(page) = book.pages.first() {
                    let content_type = Self::resolve_content_type(page);
                    if content_type == PageContentType::Video {
                        BookType::SingleVideo
                    } else {
                        BookType::SingleImage
                    }
                } else {
                    BookType::SingleVideo
                }
            }
            ModelBookType::Pdf => {
                return Err("PageManager 暂不支持 PDF 同步".to_string());
            }
        };

        Ok(mapped)
    }

    fn resolve_content_type(page: &ModelPage) -> PageContentType {
        if let Some(inner_path) = page.inner_path.as_deref() {
            let detected = PageContentType::from_path(inner_path);
            if detected != PageContentType::Unknown {
                return detected;
            }
        }

        let detected = PageContentType::from_path(&page.path);
        if detected != PageContentType::Unknown {
            return detected;
        }

        PageContentType::from_path(&page.name)
    }

    fn resolve_inner_path(book_type: BookType, book_path: &str, page: &ModelPage) -> String {
        match book_type {
            BookType::Archive => page
                .inner_path
                .clone()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| page.path.clone()),
            BookType::Epub => page
                .inner_path
                .clone()
                .filter(|s| !s.is_empty())
                .or_else(|| {
                    page.path
                        .strip_prefix(book_path)
                        .and_then(|rest| rest.strip_prefix(':'))
                        .map(ToString::to_string)
                })
                .unwrap_or_else(|| page.path.clone()),
            BookType::Directory | BookType::SingleImage | BookType::SingleVideo | BookType::Playlist => {
                page.path.clone()
            }
        }
    }

    /// 检查是否为压缩包文件
    fn is_archive_file(path: &str) -> bool {
        let ext = Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        matches!(ext.as_str(), "zip" | "rar" | "7z" | "cbz" | "cbr")
    }

    /// 检查是否为图片文件
    fn is_image_file(path: &str) -> bool {
        let ext = Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        matches!(
            ext.as_str(),
            "jpg" | "jpeg" | "png" | "gif" | "webp" | "avif" | "jxl" | "bmp"
        )
    }

    /// 检查是否为视频文件
    fn is_video_file(path: &str) -> bool {
        let ext = Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        matches!(ext.as_str(), "mp4" | "mkv" | "webm" | "avi" | "mov" | "wmv")
    }

    /// 检查是否为 EPUB 文件
    fn is_epub_file(path: &str) -> bool {
        let ext = Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        ext == "epub"
    }

    /// 扫描 EPUB 中的图片
    fn scan_epub(path: &str) -> Result<Vec<String>, String> {
        use crate::core::ebook::EbookManager;
        EbookManager::list_epub_images(path)
    }

    /// 扫描压缩包
    fn scan_archive(&self, path: &str) -> Result<Vec<String>, String> {
        let manager = self
            .archive_manager
            .lock()
            .map_err(|e| format!("获取压缩包管理器锁失败: {}", e))?;

        manager.get_images_from_archive(Path::new(path))
    }

    /// 扫描文件夹
    fn scan_directory(&self, path: &str) -> Result<Vec<String>, String> {
        use std::fs;

        let image_extensions = ["jpg", "jpeg", "png", "gif", "webp", "avif", "jxl", "bmp"];
        let video_extensions = [
            "mp4", "mkv", "webm", "avi", "mov", "wmv", "asf", "flv", "m4v", "ts",
        ];

        let mut files: Vec<String> = fs::read_dir(path)
            .map_err(|e| format!("读取目录失败: {}", e))?
            .filter_map(|entry| entry.ok())
            .filter(|entry| {
                entry.path().extension().map_or(false, |ext| {
                    let ext = ext.to_string_lossy().to_lowercase();
                    image_extensions.contains(&ext.as_str())
                        || video_extensions.contains(&ext.as_str())
                })
            })
            .map(|entry| entry.path().to_string_lossy().to_string())
            .collect();

        files.sort();
        Ok(files)
    }

    /// 跳转到指定页面
    pub async fn goto_page(&mut self, index: usize) -> Result<(Vec<u8>, PageLoadResult), String> {
        let book = self.current_book.as_mut().ok_or("没有打开的书籍")?;

        if !book.goto(index) {
            return Err(format!("页面索引越界: {} / {}", index, book.total_pages));
        }

        let page_info = book.current_page().cloned().ok_or("页面信息不存在")?;
        let book_path = book.path.clone();
        let book_type = book.book_type;
        let read_direction = book.read_direction;

        // 检查缓存
        let key = PageKey::new(&book_path, index);
        {
            let mut pool = self.memory_pool.lock().await;
            if let Some(cached) = pool.get(&key) {
                log::debug!("🎯 PageManager: 缓存命中 page {}", index);
                // 从缓存数据读取尺寸
                let dims = get_image_dimensions(&cached.data);
                return Ok((
                    cached.data.clone(),
                    PageLoadResult {
                        index,
                        size: cached.size,
                        mime_type: cached.mime_type.clone(),
                        cache_hit: true,
                        load_mode: LoadMode::Memory,
                        temp_path: None,
                        width: dims.map(|(w, _)| w),
                        height: dims.map(|(_, h)| h),
                    },
                ));
            }
        }

        // 加载页面
        log::debug!("📥 PageManager: 加载 page {}", index);
        let (data, mime_type) = self
            .load_page_data(&book_path, book_type, &page_info)
            .await?;
        let size = data.len();

        // 存入缓存
        {
            let mut pool = self.memory_pool.lock().await;
            pool.insert(key, data.clone(), mime_type.clone(), index, read_direction);
        }

        // 先返回数据，预加载任务会在后续异步执行
        // 注意：不在这里调用 submit_preload_jobs，避免阻塞当前请求
        // 预加载任务由前端在适当时机触发，或使用定时器

        // 读取图片尺寸
        let dims = get_image_dimensions(&data);

        Ok((
            data,
            PageLoadResult {
                index,
                size,
                mime_type,
                cache_hit: false,
                load_mode: LoadMode::Memory,
                temp_path: None,
                width: dims.map(|(w, _)| w),
                height: dims.map(|(_, h)| h),
            },
        ))
    }

    /// 获取页面数据（可能从缓存）
    pub async fn get_page(&mut self, index: usize) -> Result<(Vec<u8>, PageLoadResult), String> {
        let book = self.current_book.as_ref().ok_or("没有打开的书籍")?;

        let page_info = book.get_page(index).cloned().ok_or("页面信息不存在")?;
        let book_path = book.path.clone();
        let book_type = book.book_type;
        let read_direction = book.read_direction;

        // 检查缓存
        let key = PageKey::new(&book_path, index);
        {
            let mut pool = self.memory_pool.lock().await;
            if let Some(cached) = pool.get(&key) {
                // 从缓存数据读取尺寸
                let dims = get_image_dimensions(&cached.data);
                return Ok((
                    cached.data.clone(),
                    PageLoadResult {
                        index,
                        size: cached.size,
                        mime_type: cached.mime_type.clone(),
                        cache_hit: true,
                        load_mode: LoadMode::Memory,
                        temp_path: None,
                        width: dims.map(|(w, _)| w),
                        height: dims.map(|(_, h)| h),
                    },
                ));
            }
        }

        // 加载页面
        let (data, mime_type) = self
            .load_page_data(&book_path, book_type, &page_info)
            .await?;
        let size = data.len();

        // 存入缓存
        {
            let mut pool = self.memory_pool.lock().await;
            pool.insert(key, data.clone(), mime_type.clone(), index, read_direction);
        }

        // 读取图片尺寸
        let dims = get_image_dimensions(&data);

        Ok((
            data,
            PageLoadResult {
                index,
                size,
                mime_type,
                cache_hit: false,
                load_mode: LoadMode::Memory,
                temp_path: None,
                width: dims.map(|(w, _)| w),
                height: dims.map(|(_, h)| h),
            },
        ))
    }

    /// 加载页面数据
    async fn load_page_data(
        &self,
        book_path: &str,
        book_type: BookType,
        page_info: &PageInfo,
    ) -> Result<(Vec<u8>, String), String> {
        // 检查是否是不支持的文件类型
        match page_info.content_type {
            PageContentType::Unknown => {
                return Err(format!("不支持的文件类型: {}", page_info.inner_path));
            }
            PageContentType::Archive => {
                return Err(format!("嵌套压缩包暂不支持: {}", page_info.inner_path));
            }
            _ => {}
        }

        match book_type {
            BookType::Archive => {
                let manager = self
                    .archive_manager
                    .lock()
                    .map_err(|e| format!("获取压缩包管理器锁失败: {}", e))?;

                let data = manager
                    .load_image_from_archive_binary(Path::new(book_path), &page_info.inner_path)?;

                let mime_type = Self::detect_mime_type(&page_info.inner_path);
                Ok((data, mime_type))
            }
            BookType::Directory | BookType::SingleImage => {
                // 文件夹内的图片或单个图片文件
                let data = std::fs::read(&page_info.inner_path)
                    .map_err(|e| format!("读取文件失败: {}", e))?;

                let mime_type = Self::detect_mime_type(&page_info.inner_path);
                Ok((data, mime_type))
            }
            BookType::SingleVideo => {
                // 单个视频文件 - 不读取到内存，返回错误让前端使用 convertFileSrc
                // 视频应该直接通过文件路径访问，不通过 IPC 传输
                Err(format!(
                    "视频文件不通过 IPC 加载，请使用 get_file_path 获取路径: {}",
                    page_info.inner_path
                ))
            }
            BookType::Epub => {
                // EPUB 电子书 - 从 EPUB 中提取图片
                use crate::core::ebook::EbookManager;
                let (data, mime_type) =
                    EbookManager::get_epub_image(book_path, &page_info.inner_path)?;
                Ok((data, mime_type))
            }
            BookType::Playlist => {
                // 播放列表暂不支持
                Err("播放列表暂不支持".to_string())
            }
        }
    }

    /// 检测视频 MIME 类型
    fn detect_video_mime(path: &str) -> String {
        let ext = Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        match ext.as_str() {
            "mp4" => "video/mp4",
            "webm" => "video/webm",
            "mkv" => "video/x-matroska",
            "avi" => "video/x-msvideo",
            "mov" => "video/quicktime",
            "wmv" => "video/x-ms-wmv",
            _ => "video/mp4",
        }
        .to_string()
    }

    /// 触发预加载（公开方法，由前端调用）
    pub async fn trigger_preload(&self) {
        self.submit_preload_jobs().await;
    }

    /// 提交预加载任务
    async fn submit_preload_jobs(&self) {
        let Some(ref book) = self.current_book else {
            return;
        };

        let preload_indices = book.preload_range(PRELOAD_RANGE);
        let book_path = book.path.clone();
        let book_type = book.book_type;

        // 过滤已缓存的页面
        let indices_to_load: Vec<usize> = {
            let pool = self.memory_pool.lock().await;
            preload_indices
                .into_iter()
                .filter(|&idx| !pool.contains(&PageKey::new(&book_path, idx)))
                .collect()
        };

        if indices_to_load.is_empty() {
            return;
        }

        log::debug!(
            "⚡ PageManager: 预加载 {} 页: {:?}",
            indices_to_load.len(),
            indices_to_load
        );

        // 创建预加载任务
        let jobs: Vec<Job> = indices_to_load
            .iter()
            .filter_map(|&idx| {
                let page_info = book.get_page(idx)?.clone();
                let book_path_for_job = book_path.clone();
                let book_path_for_closure = book_path.clone();
                let archive_manager = Arc::clone(&self.archive_manager);
                let memory_pool = Arc::clone(&self.memory_pool);
                let current_index = book.current_index;
                let read_direction = book.read_direction;

                Some(Job::page_load(
                    &book_path_for_job,
                    idx,
                    JobPriority::Preload,
                    move |token| async move {
                        let book_path = book_path_for_closure;
                        if token.is_cancelled() {
                            return Err(crate::core::job_engine::JobError::cancelled());
                        }

                        // 加载数据
                        let (data, mime_type) = match book_type {
                            BookType::Archive => {
                                let manager = archive_manager.lock().map_err(|e| {
                                    crate::core::job_engine::JobError::new(format!("锁失败: {}", e))
                                })?;

                                let data = manager
                                    .load_image_from_archive_binary(
                                        Path::new(&book_path),
                                        &page_info.inner_path,
                                    )
                                    .map_err(|e| crate::core::job_engine::JobError::new(e))?;

                                let mime = Self::detect_mime_type(&page_info.inner_path);
                                (data, mime)
                            }
                            BookType::Directory | BookType::SingleImage => {
                                let data = std::fs::read(&page_info.inner_path).map_err(|e| {
                                    crate::core::job_engine::JobError::new(format!(
                                        "读取失败: {}",
                                        e
                                    ))
                                })?;

                                let mime = Self::detect_mime_type(&page_info.inner_path);
                                (data, mime)
                            }
                            BookType::SingleVideo => {
                                // 视频文件不预加载到内存，跳过
                                return Err(crate::core::job_engine::JobError::new("视频不预加载"));
                            }
                            BookType::Epub => {
                                // EPUB 图片
                                use crate::core::ebook::EbookManager;
                                let (data, mime) =
                                    EbookManager::get_epub_image(&book_path, &page_info.inner_path)
                                        .map_err(|e| crate::core::job_engine::JobError::new(e))?;
                                (data, mime)
                            }
                            BookType::Playlist => {
                                // 播放列表暂不支持
                                return Err(crate::core::job_engine::JobError::new(
                                    "播放列表不支持",
                                ));
                            }
                        };

                        // 存入缓存
                        {
                            let mut pool = memory_pool.lock().await;
                            pool.insert(
                                PageKey::new(&book_path, idx),
                                data.clone(),
                                mime_type.clone(),
                                current_index,
                                read_direction,
                            );
                        }

                        Ok(JobOutput::PageLoaded {
                            book_path,
                            page_index: idx,
                            data,
                            mime_type,
                        })
                    },
                ))
            })
            .collect();

        if !jobs.is_empty() {
            self.job_engine.submit_batch(jobs).await;
        }
    }

    /// 检测 MIME 类型
    fn detect_mime_type(path: &str) -> String {
        let ext = Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        match ext.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "avif" => "image/avif",
            "jxl" => "image/jxl",
            "bmp" => "image/bmp",
            "svg" => "image/svg+xml",
            "ico" => "image/x-icon",
            "tiff" | "tif" => "image/tiff",
            _ => "application/octet-stream",
        }
        .to_string()
    }

    /// 关闭当前书籍
    pub async fn close_book(&mut self) {
        if let Some(ref book) = self.current_book {
            log::info!("📖 PageManager: 关闭书籍 {}", book.path);
            self.job_engine.cancel_book(&book.path).await;
            self.memory_pool.lock().await.clear_book(&book.path);
            // 清理临时文件
            self.temp_manager.cleanup_book(&book.path);
        }
        self.current_book = None;
    }

    /// 获取需要临时文件的页面路径（视频/PDF）
    ///
    /// 对于压缩包内的视频和 PDF，需要先提取到临时文件才能播放/显示
    pub async fn get_file_path(&self, index: usize) -> Result<String, String> {
        let book = self.current_book.as_ref().ok_or("没有打开的书籍")?;
        let page = book.get_page(index).ok_or("页面不存在")?;

        // 检查是否需要临时文件
        if !page.content_type.needs_temp_file() {
            return Err(format!("此文件类型不需要临时文件: {:?}", page.content_type));
        }

        let book_path = &book.path;
        let book_type = book.book_type;

        // 对于单个视频文件，直接返回路径
        if book_type == BookType::SingleVideo {
            return Ok(page.inner_path.clone());
        }

        // 对于文件夹，直接返回路径
        if book_type == BookType::Directory {
            return Ok(page.inner_path.clone());
        }

        // 对于压缩包内的文件，检查缓存或提取
        if let Some(temp_path) = self.temp_manager.get_cached(book_path, &page.inner_path) {
            return Ok(temp_path.to_string_lossy().to_string());
        }

        // 从压缩包提取
        let data = {
            let manager = self
                .archive_manager
                .lock()
                .map_err(|e| format!("获取压缩包管理器锁失败: {}", e))?;
            manager.load_image_from_archive_binary(Path::new(book_path), &page.inner_path)?
        };

        // 保存到临时文件
        let temp_path = self
            .temp_manager
            .get_or_create(book_path, &page.inner_path, &data)?;

        log::info!(
            "📁 PageManager: 提取到临时文件 {} -> {}",
            page.inner_path,
            temp_path.display()
        );

        Ok(temp_path.to_string_lossy().to_string())
    }

    /// 获取视频文件路径（自动提取到临时文件）
    ///
    /// 兼容旧接口，内部调用 get_file_path
    pub async fn get_video_path(&self, index: usize) -> Result<String, String> {
        let book = self.current_book.as_ref().ok_or("没有打开的书籍")?;
        let page = book.get_page(index).ok_or("页面不存在")?;

        // 检查是否是视频
        if page.content_type != PageContentType::Video {
            return Err("不是视频文件".to_string());
        }

        self.get_file_path(index).await
    }

    /// 获取临时文件统计
    pub fn temp_stats(&self) -> TempFileStats {
        self.temp_manager.stats()
    }

    /// 获取大文件阈值（MB）
    pub fn get_large_file_threshold_mb(&self) -> usize {
        self.temp_manager.get_large_file_threshold() / 1024 / 1024
    }

    /// 设置大文件阈值（MB）
    pub fn set_large_file_threshold_mb(&self, threshold_mb: usize) {
        self.temp_manager
            .set_large_file_threshold(threshold_mb * 1024 * 1024);
    }

    /// 获取统计信息
    pub async fn stats(&self) -> PageManagerStats {
        let pool = self.memory_pool.lock().await;
        let memory = pool.stats();

        let (current_book, current_index, total_pages, cached_pages) =
            if let Some(ref book) = self.current_book {
                (
                    Some(book.path.clone()),
                    book.current_index,
                    book.total_pages,
                    pool.cached_pages(&book.path),
                )
            } else {
                (None, 0, 0, vec![])
            };

        PageManagerStats {
            memory,
            current_book,
            current_index,
            total_pages,
            cached_pages,
        }
    }

    /// 获取当前书籍信息
    pub fn current_book_info(&self) -> Option<BookInfo> {
        self.current_book.as_ref().map(BookInfo::from)
    }

    /// 获取页面信息
    pub fn get_page_info(&self, index: usize) -> Option<PageInfo> {
        self.current_book
            .as_ref()
            .and_then(|book| book.get_page(index).cloned())
    }

    /// 【性能优化】检查页面是否在缓存中
    ///
    /// 轻量级方法，只检查不加载数据
    /// 前端可用于智能预加载决策
    pub fn is_page_cached(&self, index: usize) -> bool {
        let Some(ref book) = self.current_book else {
            return false;
        };
        let key = PageKey::new(&book.path, index);
        // 使用 try_lock 避免阻塞（如果锁被占用返回 false）
        self.memory_pool
            .try_lock()
            .map(|pool| pool.contains(&key))
            .unwrap_or(false)
    }

    /// 清除所有缓存
    pub async fn clear_cache(&mut self) {
        self.memory_pool.lock().await.clear_all();
    }

    /// 生成页面缩略图
    ///
    /// 从页面数据生成 WebP 格式的缩略图
    pub async fn generate_page_thumbnail(
        &self,
        index: usize,
        max_size: u32,
    ) -> Result<ThumbnailItem, String> {
        let total_start = std::time::Instant::now();

        let book = self.current_book.as_ref().ok_or("没有打开的书籍")?;
        let page_info = book.get_page(index).ok_or("页面不存在")?;
        let book_path = &book.path;
        let book_type = book.book_type;

        // 加载页面数据
        let load_start = std::time::Instant::now();
        let (data, _mime_type) = self.load_page_data(book_path, book_type, page_info).await?;
        let load_elapsed = load_start.elapsed();

        // 使用 image crate 生成缩略图
        let gen_start = std::time::Instant::now();
        let result = Self::generate_thumbnail_from_data(&data, max_size);
        let gen_elapsed = gen_start.elapsed();

        let total_elapsed = total_start.elapsed();

        // 只在耗时超过 100ms 时打印详细日志
        if total_elapsed.as_millis() > 100 {
            log::info!(
                "🖼️ [Thumbnail] page={} total={}ms (load={}ms, gen={}ms) data_size={}KB",
                index,
                total_elapsed.as_millis(),
                load_elapsed.as_millis(),
                gen_elapsed.as_millis(),
                data.len() / 1024
            );
        }

        result
    }

    /// 从图片数据生成缩略图
    /// 优先使用 WIC（支持 AVIF/HEIC/JXL），失败时回退到 image crate
    fn generate_thumbnail_from_data(data: &[u8], max_size: u32) -> Result<ThumbnailItem, String> {
        let start = std::time::Instant::now();

        // Windows: 优先使用 WIC 内置缩放（支持 AVIF/HEIC/JXL 等）
        #[cfg(target_os = "windows")]
        {
            use crate::core::wic_decoder::{
                decode_and_scale_with_wic, wic_result_to_dynamic_image,
            };
            use image::ImageFormat;
            use std::io::Cursor;

            let wic_start = std::time::Instant::now();
            if let Ok(result) = decode_and_scale_with_wic(data, max_size, max_size) {
                let wic_decode_elapsed = wic_start.elapsed();

                let convert_start = std::time::Instant::now();
                if let Ok(img) = wic_result_to_dynamic_image(result) {
                    let convert_elapsed = convert_start.elapsed();

                    let width = img.width();
                    let height = img.height();

                    let encode_start = std::time::Instant::now();
                    let mut buffer = Vec::new();
                    if img
                        .write_to(&mut Cursor::new(&mut buffer), ImageFormat::WebP)
                        .is_ok()
                    {
                        let encode_elapsed = encode_start.elapsed();
                        let total_elapsed = start.elapsed();

                        // 只在耗时超过 50ms 时打印详细日志
                        if total_elapsed.as_millis() > 50 {
                            log::debug!(
                                "🖼️ [ThumbnailGen] WIC total={}ms (decode={}ms, convert={}ms, encode={}ms) size={}x{}",
                                total_elapsed.as_millis(),
                                wic_decode_elapsed.as_millis(),
                                convert_elapsed.as_millis(),
                                encode_elapsed.as_millis(),
                                width, height
                            );
                        }

                        return Ok(ThumbnailItem {
                            data: buffer,
                            width,
                            height,
                        });
                    }
                }
            }
        }

        // 回退到 image crate
        use image::ImageReader;
        use std::io::Cursor;

        let decode_start = std::time::Instant::now();
        let img = ImageReader::new(Cursor::new(data))
            .with_guessed_format()
            .map_err(|e| format!("无法识别图片格式: {}", e))?
            .decode()
            .map_err(|e| format!("解码图片失败: {}", e))?;
        let decode_elapsed = decode_start.elapsed();

        let (orig_width, orig_height) = (img.width(), img.height());
        let scale = (max_size as f32 / orig_width.max(orig_height) as f32).min(1.0);
        let new_width = (orig_width as f32 * scale) as u32;
        let new_height = (orig_height as f32 * scale) as u32;

        let resize_start = std::time::Instant::now();
        let thumbnail = img.thumbnail(new_width, new_height);
        let resize_elapsed = resize_start.elapsed();

        let encode_start = std::time::Instant::now();
        let mut buffer = Vec::new();
        {
            use image::codecs::webp::WebPEncoder;
            use image::ImageEncoder;
            let encoder = WebPEncoder::new_lossless(&mut buffer);
            encoder
                .write_image(
                    thumbnail.as_bytes(),
                    thumbnail.width(),
                    thumbnail.height(),
                    thumbnail.color().into(),
                )
                .map_err(|e| format!("编码 WebP 失败: {}", e))?;
        }
        let encode_elapsed = encode_start.elapsed();

        let total_elapsed = start.elapsed();

        // 只在耗时超过 50ms 时打印详细日志
        if total_elapsed.as_millis() > 50 {
            log::debug!(
                "🖼️ [ThumbnailGen] ImageCrate total={}ms (decode={}ms, resize={}ms, encode={}ms) {}x{} -> {}x{}",
                total_elapsed.as_millis(),
                decode_elapsed.as_millis(),
                resize_elapsed.as_millis(),
                encode_elapsed.as_millis(),
                orig_width, orig_height,
                thumbnail.width(), thumbnail.height()
            );
        }

        Ok(ThumbnailItem {
            data: buffer,
            width: thumbnail.width(),
            height: thumbnail.height(),
        })
    }

    /// 获取总页数
    pub fn total_pages(&self) -> usize {
        self.current_book
            .as_ref()
            .map(|b| b.total_pages)
            .unwrap_or(0)
    }

    /// 获取 ArchiveManager 的克隆（用于并行处理）
    pub fn get_archive_manager_clone(&self) -> Option<ArchiveManager> {
        self.archive_manager.lock().ok().map(|guard| guard.clone())
    }
}
