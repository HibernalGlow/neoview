//! 页面尺寸扫描器
//! 
//! 异步扫描书籍中所有页面的尺寸，支持取消和缓存

use crate::core::archive::ArchiveManager;
use crate::core::dimension_cache::DimensionCache;
use crate::core::wic_decoder::WicDecoder;
use crate::models::{BookType, Page};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

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


/// 页面尺寸扫描器
pub struct DimensionScanner {
    /// 取消令牌
    cancel_token: Arc<AtomicBool>,
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
            let reader = image::ImageReader::with_format(std::io::Cursor::new(data), format);
            if let Ok(dims) = reader.into_dimensions() {
                return Some(dims);
            }
        }
        None
    }

    /// 扫描书籍中所有页面的尺寸
    pub fn scan_book(
        &self,
        book_path: &str,
        book_type: &BookType,
        pages: &[Page],
        app_handle: Option<&AppHandle>,
    ) -> ScanResult {
        let start = Instant::now();
        let total = pages.len();
        
        let mut scanned_count = 0usize;
        let mut cached_count = 0usize;
        let mut failed_count = 0usize;
        let mut pending_updates: Vec<DimensionUpdate> = Vec::new();
        let mut cache_entries: Vec<(String, u32, u32, Option<i64>)> = Vec::new();

        log::info!("🔍 DimensionScanner: 开始扫描 {} 页, book_type={:?}", total, book_type);

        for (idx, page) in pages.iter().enumerate() {
            // 检查取消
            if self.is_cancelled() {
                log::info!("⏹️ DimensionScanner: 扫描被取消，已完成 {}/{}", idx, total);
                break;
            }

            // 先检查缓存
            let cached = {
                let cache = self.cache.lock().unwrap();
                cache.get(&page.stable_hash, page.modified)
            };

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
                if let Some(handle) = app_handle {
                    let progress = (idx + 1) as f32 / total as f32;
                    let event = DimensionScanProgress {
                        book_path: book_path.to_string(),
                        updates: pending_updates.clone(),
                        progress,
                    };
                    let _ = handle.emit("dimension-scan-progress", &event);
                }
                pending_updates.clear();
            }

            // 稍微让出 CPU，避免完全打满 IO 和 CPU 导致加载第一张图卡顿
            if idx % 10 == 0 {
                std::thread::yield_now();
            }
        }

        // 批量更新缓存
        if !cache_entries.is_empty() {
            let mut cache = self.cache.lock().expect("Failed to lock dimension cache");
            cache.set_batch(cache_entries);
            let _ = cache.save();
        }

        let duration_ms = start.elapsed().as_millis() as u64;

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
            "✅ DimensionScanner: 完成扫描 scanned={}, cached={}, failed={}, duration={}ms",
            scanned_count, cached_count, failed_count, duration_ms
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
        page: &Page,
        book_type: &BookType,
        book_path: &str,
    ) -> Option<(u32, u32)> {
        match book_type {
            BookType::Folder | BookType::Media => {
                // 文件夹类型：直接读取文件
                let path = Path::new(&page.path);
                
                // 优先使用快速提取
                if let Ok(data) = std::fs::read(path) {
                    if let Some(dims) = Self::get_image_dimensions_fast(&data) {
                        return Some(dims);
                    }
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
    pub scanner: Arc<Mutex<DimensionScanner>>,
    pub cache: Arc<Mutex<DimensionCache>>,
}

impl DimensionScannerState {
    pub fn new(cache_path: std::path::PathBuf, archive_manager: ArchiveManager) -> Self {
        let cache = Arc::new(Mutex::new(DimensionCache::new(cache_path)));
        let scanner = Arc::new(Mutex::new(DimensionScanner::new(cache.clone(), archive_manager)));
        Self { scanner, cache }
    }
}


