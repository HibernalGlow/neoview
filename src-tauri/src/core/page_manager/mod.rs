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
mod memory_pool;

pub use book_context::{BookContext, BookInfo, BookType, PageInfo};
pub use memory_pool::{CachedPage, MemoryPool, MemoryPoolStats, PageKey};

use crate::core::archive::ArchiveManager;
use crate::core::job_engine::{Job, JobEngine, JobOutput, JobPriority, JobResult};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::Mutex;

/// 预加载范围（前后各 N 页）
const PRELOAD_RANGE: usize = 5;
/// 默认缓存大小 (MB)
const DEFAULT_CACHE_SIZE_MB: usize = 512;

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
}

/// 页面内容管理器
pub struct PageContentManager {
    /// Job 引擎
    job_engine: Arc<JobEngine>,
    /// 内存池
    memory_pool: Arc<Mutex<MemoryPool>>,
    /// 压缩包管理器
    archive_manager: Arc<std::sync::Mutex<ArchiveManager>>,
    /// 当前书籍上下文
    current_book: Option<BookContext>,
}

impl PageContentManager {
    /// 创建页面管理器
    pub fn new(
        job_engine: Arc<JobEngine>,
        archive_manager: Arc<std::sync::Mutex<ArchiveManager>>,
    ) -> Self {
        Self {
            job_engine,
            memory_pool: Arc::new(Mutex::new(MemoryPool::new(DEFAULT_CACHE_SIZE_MB))),
            archive_manager,
            current_book: None,
        }
    }

    /// 创建带自定义缓存大小的管理器
    pub fn with_cache_size(
        job_engine: Arc<JobEngine>,
        archive_manager: Arc<std::sync::Mutex<ArchiveManager>>,
        cache_size_mb: usize,
    ) -> Self {
        Self {
            job_engine,
            memory_pool: Arc::new(Mutex::new(MemoryPool::new(cache_size_mb))),
            archive_manager,
            current_book: None,
        }
    }

    /// 打开书籍
    pub async fn open_book(&mut self, path: &str) -> Result<BookInfo, String> {
        log::info!("📖 PageManager: 打开书籍 {}", path);

        // 清理旧书籍
        if let Some(ref old_book) = self.current_book {
            self.job_engine.cancel_book(&old_book.path).await;
            self.memory_pool.lock().await.clear_book(&old_book.path);
        }

        // 判断书籍类型
        let path_obj = Path::new(path);
        let book = if path_obj.is_dir() {
            // 文件夹
            let images = self.scan_directory(path)?;
            BookContext::from_directory(path, images)
        } else {
            // 压缩包
            let images = self.scan_archive(path)?;
            BookContext::from_archive(path, images)
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

        let mut images: Vec<String> = fs::read_dir(path)
            .map_err(|e| format!("读取目录失败: {}", e))?
            .filter_map(|entry| entry.ok())
            .filter(|entry| {
                entry.path().extension().map_or(false, |ext| {
                    let ext = ext.to_string_lossy().to_lowercase();
                    image_extensions.contains(&ext.as_str())
                })
            })
            .map(|entry| entry.path().to_string_lossy().to_string())
            .collect();

        images.sort();
        Ok(images)
    }

    /// 跳转到指定页面
    pub async fn goto_page(&mut self, index: usize) -> Result<(Vec<u8>, PageLoadResult), String> {
        let book = self
            .current_book
            .as_mut()
            .ok_or("没有打开的书籍")?;

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
                return Ok((
                    cached.data.clone(),
                    PageLoadResult {
                        index,
                        size: cached.size,
                        mime_type: cached.mime_type.clone(),
                        cache_hit: true,
                    },
                ));
            }
        }

        // 加载页面
        log::debug!("📥 PageManager: 加载 page {}", index);
        let (data, mime_type) = self.load_page_data(&book_path, book_type, &page_info).await?;
        let size = data.len();

        // 存入缓存
        {
            let mut pool = self.memory_pool.lock().await;
            pool.insert(key, data.clone(), mime_type.clone(), index, read_direction);
        }

        // 提交预加载任务
        self.submit_preload_jobs().await;

        Ok((
            data,
            PageLoadResult {
                index,
                size,
                mime_type,
                cache_hit: false,
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
                return Ok((
                    cached.data.clone(),
                    PageLoadResult {
                        index,
                        size: cached.size,
                        mime_type: cached.mime_type.clone(),
                        cache_hit: true,
                    },
                ));
            }
        }

        // 加载页面
        let (data, mime_type) = self.load_page_data(&book_path, book_type, &page_info).await?;
        let size = data.len();

        // 存入缓存
        {
            let mut pool = self.memory_pool.lock().await;
            pool.insert(key, data.clone(), mime_type.clone(), index, read_direction);
        }

        Ok((
            data,
            PageLoadResult {
                index,
                size,
                mime_type,
                cache_hit: false,
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
            BookType::Directory => {
                let data = std::fs::read(&page_info.inner_path)
                    .map_err(|e| format!("读取文件失败: {}", e))?;

                let mime_type = Self::detect_mime_type(&page_info.inner_path);
                Ok((data, mime_type))
            }
        }
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
                                let manager = archive_manager
                                    .lock()
                                    .map_err(|e| crate::core::job_engine::JobError::new(format!("锁失败: {}", e)))?;

                                let data = manager
                                    .load_image_from_archive_binary(
                                        Path::new(&book_path),
                                        &page_info.inner_path,
                                    )
                                    .map_err(|e| crate::core::job_engine::JobError::new(e))?;

                                let mime = Self::detect_mime_type(&page_info.inner_path);
                                (data, mime)
                            }
                            BookType::Directory => {
                                let data = std::fs::read(&page_info.inner_path)
                                    .map_err(|e| crate::core::job_engine::JobError::new(format!("读取失败: {}", e)))?;

                                let mime = Self::detect_mime_type(&page_info.inner_path);
                                (data, mime)
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
        }
        self.current_book = None;
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

    /// 清除所有缓存
    pub async fn clear_cache(&mut self) {
        self.memory_pool.lock().await.clear_all();
    }
}
