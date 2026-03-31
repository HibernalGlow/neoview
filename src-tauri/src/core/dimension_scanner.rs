//! 页面尺寸扫描器
//! 
//! 异步扫描书籍中所有页面的尺寸，支持取消和缓存

use crate::core::archive::{is_image_file, ArchiveManager};
use crate::core::dimension_cache::DimensionCache;
use crate::core::wic_decoder::WicDecoder;
use crate::models::{BookType, Page};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

const CACHE_SAVE_DEBOUNCE_MS: u64 = 5_000;
const CACHE_FORCE_SAVE_ENTRY_COUNT: usize = 1_024;

/// 扫描结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub scanned_count: usize,
    pub cached_count: usize,
    pub failed_count: usize,
    pub duration_ms: u64,
}

/// 尺寸更新条目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DimensionUpdate {
    pub page_index: usize,
    pub width: u32,
    pub height: u32,
}

/// 扫描进度事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DimensionScanProgress {
    pub book_path: String,
    pub updates: Vec<DimensionUpdate>,
    pub progress: f32,
}

/// 扫描完成事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DimensionScanComplete {
    pub book_path: String,
    pub scanned_count: usize,
    pub cached_count: usize,
    pub failed_count: usize,
    pub duration_ms: u64,
}

/// 尺寸扫描任务页（轻量字段，避免复制完整 Page 结构）
#[derive(Debug, Clone)]
pub struct ScanPageTask {
    pub index: usize,
    pub stable_hash: String,
    pub modified: Option<i64>,
    pub path: String,
    pub inner_path: Option<String>,
    pub name: String,
}

impl From<&Page> for ScanPageTask {
    fn from(page: &Page) -> Self {
        Self {
            index: page.index,
            stable_hash: page.stable_hash.clone(),
            modified: page.modified,
            path: page.path.clone(),
            inner_path: page.inner_path.clone(),
            name: page.name.clone(),
        }
    }
}


/// 页面尺寸扫描器
pub struct DimensionScanner {
    /// 取消令牌
    cancel_token: Arc<AtomicBool>,
    /// 最近一次缓存持久化时间（Unix 毫秒）
    last_cache_save_ms: AtomicU64,
    /// 缓存引用
    cache: Arc<Mutex<DimensionCache>>,
    /// 共享压缩包管理器（内部已实现 Arc 引用和互斥锁）
    archive_manager: ArchiveManager,
}

impl DimensionScanner {
    /// 创建新的扫描器
    pub fn new(cache: Arc<Mutex<DimensionCache>>, archive_manager: ArchiveManager) -> Self {
        Self {
            cancel_token: Arc::new(AtomicBool::new(false)),
            last_cache_save_ms: AtomicU64::new(0),
            cache,
            archive_manager,
        }
    }

    /// 取消当前扫描
    pub fn cancel(&self) {
        self.cancel_token.store(true, Ordering::SeqCst);
    }

    /// 重置取消令牌（开始新扫描前调用）
    pub fn reset(&self) {
        self.cancel_token.store(false, Ordering::SeqCst);
    }

    /// 检查是否已取消
    fn is_cancelled(&self) -> bool {
        self.cancel_token.load(Ordering::SeqCst)
    }

    /// 快速获取图片尺寸（纯 Rust，不解码像素）
    fn get_image_dimensions_fast(data: &[u8]) -> Option<(u32, u32)> {
        if let Ok(format) = image::guess_format(data) {
            let reader = image::ImageReader::with_format(Cursor::new(data), format);
            if let Ok(dims) = reader.into_dimensions() {
                return Some(dims);
            }
        }
        None
    }

    /// 从文件路径快速获取图片尺寸（尽量只读取头部）
    fn get_image_dimensions_from_path_fast(path: &Path) -> Option<(u32, u32)> {
        let reader = image::ImageReader::open(path).ok()?.with_guessed_format().ok()?;
        reader.into_dimensions().ok()
    }

    #[inline]
    fn unix_ms_now() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .ok()
            .and_then(|duration| u64::try_from(duration.as_millis()).ok())
            .unwrap_or(0)
    }

    fn should_persist_cache_now(&self, new_entries: usize) -> bool {
        if new_entries == 0 {
            return false;
        }

        let now = Self::unix_ms_now();
        let last = self.last_cache_save_ms.load(Ordering::Relaxed);
        let force_flush = new_entries >= CACHE_FORCE_SAVE_ENTRY_COUNT;
        let debounce_elapsed = now.saturating_sub(last) >= CACHE_SAVE_DEBOUNCE_MS;

        if force_flush || debounce_elapsed {
            self.last_cache_save_ms.store(now, Ordering::Relaxed);
            return true;
        }

        false
    }

    /// 扫描书籍中所有页面的尺寸
    pub fn scan_book(
        &self,
        book_path: &str,
        book_type: &BookType,
        pages: &[ScanPageTask],
        app_handle: Option<&AppHandle>,
    ) -> ScanResult {
        let start = Instant::now();
        let total = pages.len();
        
        let mut scanned_count = 0usize;
        let mut cached_count = 0usize;
        let mut failed_count = 0usize;
        let mut pending_updates: Vec<DimensionUpdate> = Vec::new();
        let mut cache_entries: Vec<(String, u32, u32, Option<i64>)> = Vec::new();

        // 批量预取缓存命中，避免逐页加锁。
        let cached_dimensions = {
            let cache = self.cache.lock().unwrap();
            pages
                .iter()
                .map(|page| cache.get(&page.stable_hash, page.modified))
                .collect::<Vec<_>>()
        };

        log::info!("🔍 DimensionScanner: 开始扫描 {total} 页, book_type={book_type:?}");

        for (idx, (page, cached)) in pages.iter().zip(cached_dimensions.into_iter()).enumerate() {
            // 检查取消
            if self.is_cancelled() {
                log::info!("⏹️ DimensionScanner: 扫描被取消，已完成 {idx}/{total}");
                break;
            }

            if let Some((width, height)) = cached {
                cached_count += 1;
                pending_updates.push(DimensionUpdate {
                    page_index: page.index,
                    width,
                    height,
                });
            } else {
                // 需要扫描
                match self.scan_page_dimensions(page, book_type, book_path) {
                    Some((width, height)) => {
                        scanned_count += 1;
                        pending_updates.push(DimensionUpdate {
                            page_index: page.index,
                            width,
                            height,
                        });
                        cache_entries.push((
                            page.stable_hash.clone(),
                            width,
                            height,
                            page.modified,
                        ));
                    }
                    None => {
                        failed_count += 1;
                    }
                }
            }

            // 每 20 个页面或最后一个页面时发送进度
            if pending_updates.len() >= 20 || idx == total - 1 {
                let updates = std::mem::take(&mut pending_updates);
                if let Some(handle) = app_handle {
                    let completed = u64::try_from(idx + 1).unwrap_or(u64::MAX);
                    let total_count = u64::try_from(total).unwrap_or(u64::MAX).max(1);
                    #[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation)]
                    let progress = (completed as f64 / total_count as f64) as f32;
                    let event = DimensionScanProgress {
                        book_path: book_path.to_string(),
                        updates,
                        progress,
                    };
                    let _ = handle.emit("dimension-scan-progress", &event);
                }
            }

            // 稍微让出 CPU，避免完全打满 IO 和 CPU 导致加载第一张图卡顿
            if idx % 10 == 0 {
                std::thread::yield_now();
            }
        }

        // 批量更新缓存
        let cache_entries_len = cache_entries.len();
        if cache_entries_len > 0 {
            let should_persist_now = self.should_persist_cache_now(cache_entries_len);
            let mut cache = self.cache.lock().expect("Failed to lock dimension cache");
            cache.set_batch(cache_entries);
            if should_persist_now {
                let _ = cache.save();
            }
        }

        let duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX);

        // 发送完成事件
        if let Some(handle) = app_handle {
            let event = DimensionScanComplete {
                book_path: book_path.to_string(),
                scanned_count,
                cached_count,
                failed_count,
                duration_ms,
            };
            let _ = handle.emit("dimension-scan-complete", &event);
        }

        log::info!(
            "✅ DimensionScanner: 完成扫描 scanned={scanned_count}, cached={cached_count}, failed={failed_count}, duration={duration_ms}ms"
        );

        ScanResult {
            scanned_count,
            cached_count,
            failed_count,
            duration_ms,
        }
    }


    /// 扫描单个页面的尺寸
    fn scan_page_dimensions(
        &self,
        page: &ScanPageTask,
        book_type: &BookType,
        book_path: &str,
    ) -> Option<(u32, u32)> {
        match book_type {
            BookType::Folder | BookType::Media => {
                if !is_image_file(&page.path) {
                    return None;
                }

                // 文件夹类型：直接读取文件
                let path = Path::new(&page.path);

                // 优先使用按路径的轻量尺寸提取（避免整文件读入内存）
                if let Some(dims) = Self::get_image_dimensions_from_path_fast(path) {
                    return Some(dims);
                }

                // 回退到 WIC
                match WicDecoder::get_image_dimensions(path) {
                    Ok((w, h)) => Some((w, h)),
                    Err(e) => {
                        log::debug!("⚠️ 扫描尺寸失败 [{}]: {}", page.name, e);
                        None
                    }
                }
            }
            BookType::Archive => {
                // 压缩包类型：使用共享管理器（内含缓存机制）
                let inner_path = page.inner_path.as_ref().unwrap_or(&page.path);
                
                match self.archive_manager.load_image_from_archive_binary(
                    Path::new(book_path),
                    inner_path,
                ) {
                    Ok(data) => {
                        // 优先使用快速提取
                        if let Some(dims) = Self::get_image_dimensions_fast(&data) {
                            return Some(dims);
                        }
                        
                        // 回退到 WIC
                        match WicDecoder::get_image_dimensions_from_memory(&data) {
                            Ok((w, h)) => Some((w, h)),
                            Err(e) => {
                                log::debug!("⚠️ 解析尺寸失败 [{}]: {}", page.name, e);
                                None
                            }
                        }
                    }
                    Err(e) => {
                        log::debug!("⚠️ 提取文件失败 [{}]: {}", page.name, e);
                        None
                    }
                }
            }
            BookType::Epub => {
                // EPUB 类型：使用 EbookManager 提取
                use crate::core::ebook::EbookManager;
                
                let inner_path = page.inner_path.as_ref().unwrap_or(&page.path);
                match EbookManager::get_epub_image(book_path, inner_path) {
                    Ok((data, _mime)) => {
                        // 优先使用快速提取
                        if let Some(dims) = Self::get_image_dimensions_fast(&data) {
                            return Some(dims);
                        }

                        match WicDecoder::get_image_dimensions_from_memory(&data) {
                            Ok((w, h)) => Some((w, h)),
                            Err(e) => {
                                log::debug!("⚠️ 解析 EPUB 图片尺寸失败 [{}]: {}", page.name, e);
                                None
                            }
                        }
                    }
                    Err(e) => {
                        log::debug!("⚠️ 提取 EPUB 图片失败 [{}]: {}", page.name, e);
                        None
                    }
                }
            }
            BookType::Pdf => {
                // PDF 暂不支持
                None
            }
        }
    }
}

/// 全局扫描器状态
pub struct DimensionScannerState {
    pub scanner: Arc<DimensionScanner>,
    /// 扫描串行化锁：确保同一时刻只有一个扫描任务运行
    pub scan_guard: Arc<Mutex<()>>,
    pub cache: Arc<Mutex<DimensionCache>>,
}

impl DimensionScannerState {
    pub fn new(cache_path: std::path::PathBuf, archive_manager: ArchiveManager) -> Self {
        let cache = Arc::new(Mutex::new(DimensionCache::new(cache_path)));
        let scanner = Arc::new(DimensionScanner::new(cache.clone(), archive_manager));
        let scan_guard = Arc::new(Mutex::new(()));
        Self {
            scanner,
            scan_guard,
            cache,
        }
    }
}


