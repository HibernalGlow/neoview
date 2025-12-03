//! 压缩包服务模块
//!
//! 整合页面缓存、预取器和 solid 压缩包解压器
//! 提供统一的高性能压缩包访问接口

use super::archive::ArchiveManager;
use super::archive_page_cache::{
    create_shared_cache, CacheStats, PageCacheKey, SharedPageCache,
};
use super::archive_prefetcher::{
    create_shared_prefetcher, PrefetchConfig, PrefetchState, PrefetchStats, SharedPrefetcher,
};
use super::solid_archive_extractor::{
    create_shared_extractor, PreExtractConfig, PreExtractState, SharedSolidExtractor,
    SolidArchiveExtractor,
};
use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

/// 压缩包服务配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveServiceConfig {
    /// 页面缓存最大内存（MB）
    pub cache_max_memory_mb: usize,
    /// 页面缓存最大条目数
    pub cache_max_entries: usize,
    /// 预取向前页数
    pub prefetch_ahead: usize,
    /// 预取向后页数
    pub prefetch_behind: usize,
    /// 是否启用预取
    pub prefetch_enabled: bool,
    /// 是否启用 solid 压缩包预解压
    pub solid_pre_extract_enabled: bool,
    /// solid 预解压内存限制（MB）
    pub solid_memory_limit_mb: usize,
}

impl Default for ArchiveServiceConfig {
    fn default() -> Self {
        Self {
            cache_max_memory_mb: 256,
            cache_max_entries: 100,
            prefetch_ahead: 3,
            prefetch_behind: 1,
            prefetch_enabled: true,
            solid_pre_extract_enabled: true,
            solid_memory_limit_mb: 512,
        }
    }
}

/// 压缩包服务状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveServiceStatus {
    /// 缓存统计
    pub cache_stats: CacheStatsDto,
    /// 预取状态
    pub prefetch_state: String,
    /// 预取统计
    pub prefetch_stats: PrefetchStatsDto,
    /// solid 解压状态
    pub solid_state: String,
    /// solid 解压进度
    pub solid_progress: (usize, usize),
    /// 当前打开的压缩包
    pub current_archive: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStatsDto {
    pub entry_count: usize,
    pub memory_used_mb: f64,
    pub max_memory_mb: usize,
    pub usage_percent: f64,
}

impl From<CacheStats> for CacheStatsDto {
    fn from(stats: CacheStats) -> Self {
        Self {
            entry_count: stats.entry_count,
            memory_used_mb: stats.memory_used as f64 / (1024.0 * 1024.0),
            max_memory_mb: stats.max_memory / (1024 * 1024),
            usage_percent: stats.memory_usage_percent(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrefetchStatsDto {
    pub total_requests: usize,
    pub cache_hits: usize,
    pub prefetch_count: usize,
    pub prefetch_mb: f64,
}

impl From<PrefetchStats> for PrefetchStatsDto {
    fn from(stats: PrefetchStats) -> Self {
        Self {
            total_requests: stats.total_requests,
            cache_hits: stats.cache_hits,
            prefetch_count: stats.prefetch_count,
            prefetch_mb: stats.prefetch_bytes as f64 / (1024.0 * 1024.0),
        }
    }
}

/// 压缩包服务
///
/// 提供高性能的压缩包图片加载
pub struct ArchiveService {
    /// 配置
    config: RwLock<ArchiveServiceConfig>,
    /// 底层压缩包管理器
    archive_manager: Arc<Mutex<ArchiveManager>>,
    /// 页面缓存
    page_cache: SharedPageCache,
    /// 预取器
    prefetcher: SharedPrefetcher,
    /// solid 解压器
    solid_extractor: SharedSolidExtractor,
    /// 当前打开的压缩包路径
    current_archive: RwLock<Option<PathBuf>>,
    /// 当前压缩包的所有页面
    current_pages: RwLock<Vec<(usize, String)>>,
    /// 当前页索引
    current_page_index: RwLock<usize>,
}

impl ArchiveService {
    /// 创建压缩包服务
    pub fn new(archive_manager: Arc<Mutex<ArchiveManager>>) -> Self {
        let config = ArchiveServiceConfig::default();
        Self::with_config(archive_manager, config)
    }

    /// 使用配置创建压缩包服务
    pub fn with_config(
        archive_manager: Arc<Mutex<ArchiveManager>>,
        config: ArchiveServiceConfig,
    ) -> Self {
        let page_cache = create_shared_cache(config.cache_max_memory_mb, config.cache_max_entries);
        let solid_extractor = create_shared_extractor(Arc::clone(&page_cache));

        // 创建提取器闭包
        let am = Arc::clone(&archive_manager);
        let extractor = move |path: &Path, inner: &str| -> Result<Vec<u8>, String> {
            let manager = am.lock().map_err(|e| format!("锁定失败: {}", e))?;
            manager.extract_file(path, inner)
        };

        let prefetcher = create_shared_prefetcher(Arc::clone(&page_cache), extractor);

        // 应用预取配置
        prefetcher.set_config(PrefetchConfig {
            ahead_count: config.prefetch_ahead,
            behind_count: config.prefetch_behind,
            enabled: config.prefetch_enabled,
            ..Default::default()
        });

        // 应用 solid 解压配置
        solid_extractor.set_config(PreExtractConfig {
            enabled: config.solid_pre_extract_enabled,
            memory_limit_mb: config.solid_memory_limit_mb,
            ..Default::default()
        });

        Self {
            config: RwLock::new(config),
            archive_manager,
            page_cache,
            prefetcher,
            solid_extractor,
            current_archive: RwLock::new(None),
            current_pages: RwLock::new(Vec::new()),
            current_page_index: RwLock::new(0),
        }
    }

    /// 更新配置
    pub fn update_config(&self, config: ArchiveServiceConfig) {
        // 更新预取配置
        self.prefetcher.set_config(PrefetchConfig {
            ahead_count: config.prefetch_ahead,
            behind_count: config.prefetch_behind,
            enabled: config.prefetch_enabled,
            ..Default::default()
        });

        // 更新 solid 解压配置
        self.solid_extractor.set_config(PreExtractConfig {
            enabled: config.solid_pre_extract_enabled,
            memory_limit_mb: config.solid_memory_limit_mb,
            ..Default::default()
        });

        if let Ok(mut cfg) = self.config.write() {
            *cfg = config;
        }
    }

    /// 获取配置
    pub fn get_config(&self) -> ArchiveServiceConfig {
        self.config.read().map(|c| c.clone()).unwrap_or_default()
    }

    /// 打开压缩包
    ///
    /// 初始化缓存和预解压（如果是 solid 压缩包）
    pub fn open_archive(&self, path: &Path, pages: Vec<(usize, String)>) -> Result<(), String> {
        info!("打开压缩包: {} ({} 页)", path.display(), pages.len());

        // 取消之前的操作
        self.prefetcher.cancel_current();
        self.solid_extractor.cancel();

        // 清除旧压缩包的缓存
        if let Ok(old_path) = self.current_archive.read() {
            if let Some(ref old) = *old_path {
                if old != path {
                    self.page_cache.remove_archive(&old.to_string_lossy());
                }
            }
        }

        // 更新当前状态
        if let Ok(mut current) = self.current_archive.write() {
            *current = Some(path.to_path_buf());
        }
        if let Ok(mut current_pages) = self.current_pages.write() {
            *current_pages = pages.clone();
        }
        if let Ok(mut idx) = self.current_page_index.write() {
            *idx = 0;
        }

        // 检查是否需要预解压
        if self.solid_extractor.should_pre_extract(path) {
            info!("检测到 solid 压缩包，启动预解压");
            // 只提取图片文件
            let image_pages: Vec<_> = pages
                .iter()
                .filter(|(_, p)| Self::is_image_file(p))
                .cloned()
                .collect();
            self.solid_extractor.start_pre_extract(path, image_pages);
        }

        Ok(())
    }

    /// 关闭压缩包
    pub fn close_archive(&self) {
        self.prefetcher.cancel_current();
        self.solid_extractor.cancel();

        if let Ok(path) = self.current_archive.read() {
            if let Some(ref p) = *path {
                self.page_cache.remove_archive(&p.to_string_lossy());
            }
        }

        if let Ok(mut current) = self.current_archive.write() {
            *current = None;
        }
        if let Ok(mut pages) = self.current_pages.write() {
            pages.clear();
        }
    }

    /// 加载图片（带缓存和预取）
    ///
    /// 这是主要的图片加载入口
    pub fn load_image(
        &self,
        archive_path: &Path,
        inner_path: &str,
        page_index: usize,
        direction: i32,
    ) -> Result<Vec<u8>, String> {
        let start = Instant::now();
        let archive_path_str = archive_path.to_string_lossy().to_string();
        let key = PageCacheKey::new(&archive_path_str, inner_path);

        // 1. 检查缓存
        if let Some(data) = self.page_cache.get(&key) {
            debug!(
                "缓存命中: {} ({}bytes, {}ms)",
                inner_path,
                data.len(),
                start.elapsed().as_millis()
            );
            
            // 触发预取
            self.trigger_prefetch(archive_path, page_index, direction);
            
            return Ok(data);
        }

        // 2. 检查是否正在预取
        if self.prefetcher.is_prefetching(inner_path) {
            debug!("等待预取完成: {}", inner_path);
            if self.prefetcher.wait_for_page(inner_path, Duration::from_secs(5)) {
                if let Some(data) = self.page_cache.get(&key) {
                    return Ok(data);
                }
            }
        }

        // 3. 检查 solid 解压状态
        let solid_state = self.solid_extractor.get_state();
        if solid_state == PreExtractState::Extracting {
            // 等待一小段时间看看是否能从缓存获取
            debug!("等待 solid 解压: {}", inner_path);
            std::thread::sleep(Duration::from_millis(100));
            if let Some(data) = self.page_cache.get(&key) {
                self.trigger_prefetch(archive_path, page_index, direction);
                return Ok(data);
            }
        }

        // 4. 直接提取
        debug!("直接提取: {}", inner_path);
        let manager = self
            .archive_manager
            .lock()
            .map_err(|e| format!("锁定失败: {}", e))?;
        let data = manager.extract_file(archive_path, inner_path)?;
        let size = data.len();

        // 存入缓存
        self.page_cache.insert(key, data.clone());

        info!(
            "图片加载完成: {} ({}bytes, {}ms)",
            inner_path,
            size,
            start.elapsed().as_millis()
        );

        // 触发预取
        drop(manager); // 释放锁
        self.trigger_prefetch(archive_path, page_index, direction);

        Ok(data)
    }

    /// 触发预取
    fn trigger_prefetch(&self, archive_path: &Path, page_index: usize, direction: i32) {
        // 更新当前页索引
        if let Ok(mut idx) = self.current_page_index.write() {
            *idx = page_index;
        }

        // 获取页面列表
        let pages = self
            .current_pages
            .read()
            .map(|p| p.clone())
            .unwrap_or_default();

        if pages.is_empty() {
            return;
        }

        // 请求预取
        self.prefetcher.request_prefetch(archive_path, page_index, direction, &pages);

        // 清理不需要的缓存
        let config = self.get_config();
        let keep_range = config.prefetch_ahead + config.prefetch_behind + 1;
        let start = page_index.saturating_sub(config.prefetch_behind);
        let end = (page_index + config.prefetch_ahead + 1).min(pages.len());
        let keep_indices: Vec<_> = (start..end).collect();
        
        self.page_cache.retain_range(
            &archive_path.to_string_lossy(),
            &keep_indices,
            &pages,
        );
    }

    /// 预加载指定范围的页面
    pub fn preload_range(
        &self,
        archive_path: &Path,
        start_index: usize,
        count: usize,
    ) -> Result<usize, String> {
        let pages = self
            .current_pages
            .read()
            .map(|p| p.clone())
            .unwrap_or_default();

        let end = (start_index + count).min(pages.len());
        let mut loaded = 0;

        let manager = self
            .archive_manager
            .lock()
            .map_err(|e| format!("锁定失败: {}", e))?;

        for idx in start_index..end {
            if let Some((_, inner_path)) = pages.get(idx) {
                let key = PageCacheKey::new(&archive_path.to_string_lossy(), inner_path);
                if !self.page_cache.contains(&key) {
                    if let Ok(data) = manager.extract_file(archive_path, inner_path) {
                        self.page_cache.insert(key, data);
                        loaded += 1;
                    }
                }
            }
        }

        Ok(loaded)
    }

    /// 获取服务状态
    pub fn get_status(&self) -> ArchiveServiceStatus {
        let cache_stats = self.page_cache.stats().into();
        let prefetch_state = format!("{:?}", self.prefetcher.get_state());
        let prefetch_stats = self.prefetcher.get_stats().into();
        let solid_state = format!("{:?}", self.solid_extractor.get_state());
        let solid_progress = self.solid_extractor.get_progress();
        let current_archive = self
            .current_archive
            .read()
            .ok()
            .and_then(|p| p.as_ref().map(|p| p.to_string_lossy().to_string()));

        ArchiveServiceStatus {
            cache_stats,
            prefetch_state,
            prefetch_stats,
            solid_state,
            solid_progress,
            current_archive,
        }
    }

    /// 清空缓存
    pub fn clear_cache(&self) {
        self.page_cache.clear();
        self.prefetcher.cancel_current();
        self.solid_extractor.cleanup();
    }

    /// 检查是否是图片文件
    fn is_image_file(path: &str) -> bool {
        let lower = path.to_lowercase();
        lower.ends_with(".jpg")
            || lower.ends_with(".jpeg")
            || lower.ends_with(".png")
            || lower.ends_with(".gif")
            || lower.ends_with(".bmp")
            || lower.ends_with(".webp")
            || lower.ends_with(".avif")
            || lower.ends_with(".jxl")
            || lower.ends_with(".tiff")
            || lower.ends_with(".tif")
    }

    /// 获取页面缓存引用（用于直接访问）
    pub fn page_cache(&self) -> &SharedPageCache {
        &self.page_cache
    }

    /// 获取预取器引用
    pub fn prefetcher(&self) -> &SharedPrefetcher {
        &self.prefetcher
    }

    /// 获取 solid 解压器引用
    pub fn solid_extractor(&self) -> &SharedSolidExtractor {
        &self.solid_extractor
    }

    /// 获取当前页面列表
    pub fn get_current_pages(&self) -> Vec<(usize, String)> {
        self.current_pages
            .read()
            .map(|p| p.clone())
            .unwrap_or_default()
    }
}

/// 共享压缩包服务
pub type SharedArchiveService = Arc<ArchiveService>;

/// 创建共享压缩包服务
pub fn create_shared_service(archive_manager: Arc<Mutex<ArchiveManager>>) -> SharedArchiveService {
    Arc::new(ArchiveService::new(archive_manager))
}

/// 使用配置创建共享压缩包服务
pub fn create_shared_service_with_config(
    archive_manager: Arc<Mutex<ArchiveManager>>,
    config: ArchiveServiceConfig,
) -> SharedArchiveService {
    Arc::new(ArchiveService::with_config(archive_manager, config))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_image_file() {
        assert!(ArchiveService::is_image_file("test.jpg"));
        assert!(ArchiveService::is_image_file("test.PNG"));
        assert!(ArchiveService::is_image_file("path/to/image.webp"));
        assert!(!ArchiveService::is_image_file("test.txt"));
        assert!(!ArchiveService::is_image_file("test.mp4"));
    }
}
