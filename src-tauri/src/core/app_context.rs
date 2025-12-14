//! `NeoView` - App Context
//! 统一状态管理上下文 - 集中管理所有核心状态

use super::archive::ArchiveManager;
use super::background_scheduler::BackgroundTaskScheduler;
use super::blob_registry::BlobRegistry;
use super::cache_index_db::CacheIndexDb;
use super::dimension_scanner::DimensionScannerState;
use super::directory_cache::DirectoryCache;
use super::fs_manager::FsManager;
use super::lru_image_cache::LruImageCache;
use super::page_manager::PageContentManager;
use super::thumbnail_db::ThumbnailDb;
use super::thumbnail_generator::{ThumbnailGenerator, ThumbnailGeneratorConfig};
use super::upscale::UpscaleManager;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

/// 应用配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// 图像缓存大小 (MB)
    pub cache_size_mb: usize,
    /// 内存压力阈值 (0-100)
    pub memory_pressure_threshold: u8,
    /// 大文件阈值 (MB)
    pub large_file_threshold_mb: u64,
    /// 是否启用缩略图压缩
    pub thumbnail_compression_enabled: bool,
    /// 目录缓存容量
    pub directory_cache_capacity: usize,
    /// 目录缓存 TTL (秒)
    pub directory_cache_ttl_secs: u64,
    /// 缩略图最大宽度
    pub thumbnail_max_width: u32,
    /// 缩略图最大高度
    pub thumbnail_max_height: u32,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            cache_size_mb: 256,
            memory_pressure_threshold: 20,
            large_file_threshold_mb: 10,
            thumbnail_compression_enabled: true,
            directory_cache_capacity: 512,
            directory_cache_ttl_secs: 120,
            thumbnail_max_width: 256,
            thumbnail_max_height: 256,
        }
    }
}

/// 应用上下文 - 统一状态管理
pub struct AppContext {
    /// 图像缓存 (LRU + 内存压力感知)
    pub image_cache: Arc<LruImageCache>,
    /// 文件系统管理器
    pub fs_manager: Arc<RwLock<FsManager>>,
    /// 压缩包管理器
    pub archive_manager: Arc<RwLock<ArchiveManager>>,
    /// 缩略图数据库
    pub thumbnail_db: Arc<ThumbnailDb>,
    /// 缩略图生成器
    pub thumbnail_generator: Arc<RwLock<ThumbnailGenerator>>,
    /// 目录缓存
    pub directory_cache: Arc<RwLock<DirectoryCache>>,
    /// 缓存索引数据库
    pub cache_index_db: Arc<CacheIndexDb>,
    /// 后台任务调度器
    pub background_scheduler: Arc<BackgroundTaskScheduler>,
    /// 超分管理器
    pub upscale_manager: Arc<RwLock<Option<UpscaleManager>>>,
    /// 尺寸扫描器
    pub dimension_scanner: Arc<DimensionScannerState>,
    /// Blob 注册表
    pub blob_registry: Arc<BlobRegistry>,
    /// 应用数据根目录
    pub app_data_root: PathBuf,
    /// 配置
    config: RwLock<AppConfig>,
}

impl AppContext {
    /// 创建应用上下文
    pub fn new(app_data_root: PathBuf, config: AppConfig) -> Self {
        let num_cores = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);

        // 初始化图像缓存
        let image_cache = Arc::new(LruImageCache::new(
            config.cache_size_mb,
            config.memory_pressure_threshold,
        ));

        // 初始化文件系统管理器
        let fs_manager = Arc::new(RwLock::new(FsManager::new()));
        let archive_manager = Arc::new(RwLock::new(ArchiveManager::new()));

        // 初始化目录缓存
        let directory_cache = Arc::new(RwLock::new(DirectoryCache::new(
            config.directory_cache_capacity,
            Duration::from_secs(config.directory_cache_ttl_secs),
        )));

        // 初始化缓存索引数据库
        let cache_index_db = Arc::new(CacheIndexDb::new_with_recovery(
            app_data_root.join("directory_cache.db"),
            Duration::from_secs(600),
            Duration::from_secs(7200),
        ));

        // 初始化后台任务调度器
        let scheduler_concurrency = (num_cores * 2).clamp(8, 32);
        let background_scheduler = Arc::new(BackgroundTaskScheduler::new(scheduler_concurrency, 128));

        // 初始化超分管理器
        let thumbnail_path = app_data_root.join("thumbnails");
        let upscale_manager = Arc::new(RwLock::new(Some(UpscaleManager::new(thumbnail_path))));

        // 初始化尺寸扫描器
        let dimension_cache_path = app_data_root.join("dimension_cache.json");
        let dimension_scanner = Arc::new(DimensionScannerState::new(dimension_cache_path));

        // 初始化缩略图数据库和生成器
        let thumbnail_db_path = app_data_root.join("thumbnails.db");
        let thumbnail_db = Arc::new(ThumbnailDb::new(thumbnail_db_path));

        let thumb_thread_pool_size = (num_cores * 4).clamp(16, 32);
        let thumb_archive_concurrency = (num_cores * 2).clamp(4, 12);
        let thumb_config = ThumbnailGeneratorConfig {
            max_width: config.thumbnail_max_width,
            max_height: config.thumbnail_max_height,
            thread_pool_size: thumb_thread_pool_size,
            archive_concurrency: thumb_archive_concurrency,
        };
        let thumbnail_generator = Arc::new(RwLock::new(
            ThumbnailGenerator::new(Arc::clone(&thumbnail_db), thumb_config),
        ));

        // 初始化 Blob 注册表
        let blob_registry = Arc::new(BlobRegistry::new(1000));

        Self {
            image_cache,
            fs_manager,
            archive_manager,
            thumbnail_db,
            thumbnail_generator,
            directory_cache,
            cache_index_db,
            background_scheduler,
            upscale_manager,
            dimension_scanner,
            blob_registry,
            app_data_root,
            config: RwLock::new(config),
        }
    }

    /// 获取所有管理的状态名称
    pub fn list_managed_states(&self) -> Vec<&'static str> {
        vec![
            "image_cache",
            "fs_manager",
            "archive_manager",
            "thumbnail_db",
            "thumbnail_generator",
            "directory_cache",
            "cache_index_db",
            "background_scheduler",
            "upscale_manager",
            "dimension_scanner",
            "blob_registry",
        ]
    }

    /// 获取当前配置
    pub fn get_config(&self) -> AppConfig {
        self.config.read().clone()
    }

    /// 更新配置
    pub fn update_config(&self, config: AppConfig) {
        // 更新图像缓存设置
        self.image_cache.set_max_size(config.cache_size_mb);
        self.image_cache.set_memory_pressure_threshold(config.memory_pressure_threshold);

        // 保存配置
        *self.config.write() = config;
    }

    /// 序列化配置为 JSON
    pub fn serialize_config(&self) -> Result<String, serde_json::Error> {
        let config = self.config.read();
        serde_json::to_string_pretty(&*config)
    }

    /// 从 JSON 反序列化配置
    pub fn deserialize_config(json: &str) -> Result<AppConfig, serde_json::Error> {
        serde_json::from_str(json)
    }

    /// 检查内存压力并执行淘汰
    pub fn check_memory_pressure(&self) -> bool {
        self.image_cache.check_memory_pressure()
    }

    /// 获取缓存统计
    pub fn get_cache_stats(&self) -> super::lru_image_cache::CacheStats {
        self.image_cache.stats()
    }

    /// 清理所有缓存
    pub fn clear_all_caches(&self) {
        self.image_cache.clear();
        self.directory_cache.write().clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_app_context_creation() {
        let temp_dir = tempdir().unwrap();
        let config = AppConfig::default();
        let ctx = AppContext::new(temp_dir.path().to_path_buf(), config);

        let states = ctx.list_managed_states();
        assert!(states.contains(&"image_cache"));
        assert!(states.contains(&"fs_manager"));
        assert!(states.contains(&"thumbnail_db"));
    }

    #[test]
    fn test_config_serialization() {
        let config = AppConfig {
            cache_size_mb: 512,
            memory_pressure_threshold: 25,
            large_file_threshold_mb: 20,
            thumbnail_compression_enabled: true,
            directory_cache_capacity: 1024,
            directory_cache_ttl_secs: 300,
            thumbnail_max_width: 512,
            thumbnail_max_height: 512,
        };

        let json = serde_json::to_string(&config).unwrap();
        let deserialized: AppConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(config.cache_size_mb, deserialized.cache_size_mb);
        assert_eq!(config.memory_pressure_threshold, deserialized.memory_pressure_threshold);
        assert_eq!(config.large_file_threshold_mb, deserialized.large_file_threshold_mb);
    }

    #[test]
    fn test_list_managed_states() {
        let temp_dir = tempdir().unwrap();
        let ctx = AppContext::new(temp_dir.path().to_path_buf(), AppConfig::default());

        let states = ctx.list_managed_states();
        assert_eq!(states.len(), 11);
    }
}
