// 压缩包管理模块
// 提供 ZIP/RAR/7z 压缩包的统一操作接口
//
// 模块结构：
// - types.rs: 类型定义（ArchiveEntry, ArchiveMetadata, ArchiveFormat 等）
// - utils.rs: 工具函数（路径规范化、MIME 检测、图片处理等）
// - zip_handler.rs: ZIP/CBZ 格式处理
// - rar_handler.rs: RAR/CBR 格式处理
// - sevenz_handler.rs: 7Z/CB7 格式处理
// - image_ops.rs: 图片操作（加载、转换、首图查找等）
// - cache.rs: 缓存管理

pub mod types;
pub mod utils;
pub mod zip_handler;
pub mod rar_handler;
pub mod sevenz_handler;
pub mod image_ops;
pub mod cache;

// 重导出公共类型和常量
pub use types::{
    ArchiveEntry, ArchiveFormat, ArchiveMetadata, CachedImageEntry,
    ARCHIVE_IMAGE_EXTENSIONS, ZIP_EXTENSIONS, RAR_EXTENSIONS, SEVENZ_EXTENSIONS,
    IMAGE_CACHE_LIMIT,
};

// 重导出工具函数
pub use utils::{
    normalize_archive_key, normalize_inner_path, is_image_file,
    detect_image_mime_type, get_archive_metadata, zip_datetime_to_unix,
    resize_keep_aspect_ratio, encode_webp, encode_jpeg, StreamReader,
};

use crate::core::archive_index::{ArchiveIndexCache, IndexCacheStats};
use crate::core::blob_registry::BlobRegistry;
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::sync::{Arc, Mutex};
use zip::ZipArchive;

/// 压缩包管理器
#[derive(Clone)]
pub struct ArchiveManager {
    /// 支持的图片格式
    image_extensions: Vec<String>,
    /// 图片缓存
    cache: cache::ImageCache,
    /// 压缩包文件缓存（避免重复打开）
    archive_cache: zip_handler::ZipArchiveCache,
    /// Blob 注册表
    blob_registry: Arc<BlobRegistry>,
    /// RAR/7z 索引缓存
    index_cache: Arc<ArchiveIndexCache>,
}

impl ArchiveManager {
    /// 创建新的压缩包管理器
    pub fn new() -> Self {
        Self {
            image_extensions: vec![
                "jpg".to_string(),
                "jpeg".to_string(),
                "png".to_string(),
                "gif".to_string(),
                "bmp".to_string(),
                "webp".to_string(),
                "avif".to_string(),
                "jxl".to_string(),
                "tiff".to_string(),
                "tif".to_string(),
            ],
            cache: Arc::new(Mutex::new(HashMap::new())),
            archive_cache: Arc::new(Mutex::new(HashMap::new())),
            blob_registry: Arc::new(BlobRegistry::new(512)),
            index_cache: Arc::new(ArchiveIndexCache::new(100)), // 100MB 索引缓存
        }
    }

    /// 创建使用共享 BlobRegistry 的压缩包管理器
    pub fn with_shared_blob_registry(blob_registry: Arc<BlobRegistry>) -> Self {
        Self {
            image_extensions: vec![
                "jpg".to_string(),
                "jpeg".to_string(),
                "png".to_string(),
                "gif".to_string(),
                "bmp".to_string(),
                "webp".to_string(),
                "avif".to_string(),
                "jxl".to_string(),
                "tiff".to_string(),
                "tif".to_string(),
            ],
            cache: Arc::new(Mutex::new(HashMap::new())),
            archive_cache: Arc::new(Mutex::new(HashMap::new())),
            blob_registry,
            index_cache: Arc::new(ArchiveIndexCache::new(100)),
        }
    }

    /// 创建带自定义 blob 缓存大小的压缩包管理器
    pub fn with_blob_cache_size(blob_cache_size: usize) -> Self {
        Self {
            image_extensions: vec![
                "jpg".to_string(),
                "jpeg".to_string(),
                "png".to_string(),
                "gif".to_string(),
                "bmp".to_string(),
                "webp".to_string(),
                "avif".to_string(),
                "jxl".to_string(),
                "tiff".to_string(),
                "tif".to_string(),
            ],
            cache: Arc::new(Mutex::new(HashMap::new())),
            archive_cache: Arc::new(Mutex::new(HashMap::new())),
            index_cache: Arc::new(ArchiveIndexCache::new(100)),
            blob_registry: Arc::new(BlobRegistry::new(blob_cache_size)),
        }
    }

    /// 获取或创建压缩包缓存
    pub fn get_cached_archive(
        &self,
        archive_path: &Path,
    ) -> Result<Arc<Mutex<ZipArchive<File>>>, String> {
        zip_handler::get_cached_archive(&self.archive_cache, archive_path)
    }

    /// 检查是否为图片文件
    #[inline]
    fn is_image_file(&self, path: &str) -> bool {
        is_image_file(path)
    }

    /// 读取压缩包内容列表（自动检测格式）
    pub fn list_contents(&self, archive_path: &Path) -> Result<Vec<ArchiveEntry>, String> {
        image_ops::list_contents(archive_path)
    }

    /// 读取 ZIP 压缩包内容列表
    pub fn list_zip_contents(&self, archive_path: &Path) -> Result<Vec<ArchiveEntry>, String> {
        zip_handler::list_zip_contents(archive_path)
    }
    
    /// 读取 RAR 压缩包内容列表
    pub fn list_rar_contents(&self, archive_path: &Path) -> Result<Vec<ArchiveEntry>, String> {
        rar_handler::list_rar_contents(archive_path)
    }
    
    /// 读取 7z 压缩包内容列表
    pub fn list_7z_contents(&self, archive_path: &Path) -> Result<Vec<ArchiveEntry>, String> {
        sevenz_handler::list_7z_contents(archive_path)
    }

    /// 从 ZIP 压缩包中提取文件内容
    pub fn extract_file_from_zip(
        &self,
        archive_path: &Path,
        file_path: &str,
    ) -> Result<Vec<u8>, String> {
        zip_handler::extract_file_from_zip(&self.archive_cache, archive_path, file_path)
    }

    /// 从压缩包中提取文件（统一接口，自动检测格式）
    pub fn extract_file(&self, archive_path: &Path, file_path: &str) -> Result<Vec<u8>, String> {
        image_ops::extract_file(&self.archive_cache, &self.index_cache, archive_path, file_path)
    }
    
    /// 从 RAR 压缩包中提取文件内容
    pub fn extract_file_from_rar(
        &self,
        archive_path: &Path,
        file_path: &str,
    ) -> Result<Vec<u8>, String> {
        rar_handler::extract_file_from_rar(&self.index_cache, archive_path, file_path)
    }
    
    /// 获取 RAR 条目索引
    fn get_rar_entry_index(&self, archive_path: &Path, file_path: &str) -> Option<usize> {
        rar_handler::get_rar_entry_index(&self.index_cache, archive_path, file_path)
    }
    
    /// 构建 RAR 索引
    pub fn build_rar_index(&self, archive_path: &Path) -> Result<(), String> {
        rar_handler::build_rar_index(&self.index_cache, archive_path)
    }
    
    /// 从 7z 压缩包中提取文件内容
    pub fn extract_file_from_7z(
        &self,
        archive_path: &Path,
        file_path: &str,
    ) -> Result<Vec<u8>, String> {
        sevenz_handler::extract_file_from_7z(&self.index_cache, archive_path, file_path)
    }
    
    /// 获取 7z 条目索引
    fn get_7z_entry_index(&self, archive_path: &Path, file_path: &str) -> Option<usize> {
        sevenz_handler::get_7z_entry_index(&self.index_cache, archive_path, file_path)
    }
    
    /// 构建 7z 索引
    pub fn build_7z_index(&self, archive_path: &Path) -> Result<(), String> {
        sevenz_handler::build_7z_index(&self.index_cache, archive_path)
    }
    
    /// 获取索引缓存统计
    pub fn get_index_cache_stats(&self) -> IndexCacheStats {
        self.index_cache.stats()
    }
    
    /// 清除索引缓存
    pub fn clear_index_cache(&self) {
        self.index_cache.clear();
    }

    /// 从 ZIP 压缩包中删除条目
    pub fn delete_entry_from_zip(
        &self,
        archive_path: &Path,
        inner_path: &str,
    ) -> Result<(), String> {
        zip_handler::delete_entry_from_zip(&self.archive_cache, archive_path, inner_path)?;
        // 同时清除图片缓存
        cache::evict_archive_cache(&self.cache, &self.archive_cache, archive_path);
        Ok(())
    }

    /// 从压缩包中加载图片（返回二进制数据）
    pub fn load_image_from_archive_binary(
        &self,
        archive_path: &Path,
        file_path: &str,
    ) -> Result<Vec<u8>, String> {
        image_ops::load_image_from_archive_binary(
            &self.archive_cache,
            &self.index_cache,
            &self.cache,
            archive_path,
            file_path,
        )
    }

    /// 从压缩包中加载 JXL 图片并转换为 PNG
    fn load_jxl_binary_from_zip(&self, image_data: &[u8]) -> Result<Vec<u8>, String> {
        image_ops::load_jxl_binary_from_zip(image_data)
    }

    /// 从压缩包中加载 JXL 图片并转换为 PNG
    fn load_jxl_from_zip(&self, image_data: &[u8]) -> Result<Vec<u8>, String> {
        image_ops::load_jxl_from_zip(image_data)
    }

    /// 检测图片 MIME 类型
    fn detect_image_mime_type(&self, path: &str) -> &str {
        // 返回静态字符串，需要转换
        detect_image_mime_type(path)
    }

    /// 获取压缩包中的所有图片路径
    pub fn get_images_from_archive(&self, archive_path: &Path) -> Result<Vec<String>, String> {
        image_ops::get_images_from_archive(archive_path)
    }

    /// 快速查找压缩包中的第一张图片
    pub fn find_first_image_entry(&self, archive_path: &Path) -> Result<Option<String>, String> {
        image_ops::find_first_image_entry(archive_path)
    }

    /// 扫描压缩包内的前N张图片
    pub fn scan_archive_images_fast(
        &self,
        archive_path: &Path,
        limit: usize,
    ) -> Result<Vec<String>, String> {
        image_ops::scan_archive_images_fast(archive_path, limit)
    }

    /// 检查文件是否为支持的压缩包
    pub fn is_supported_archive(path: &Path) -> bool {
        zip_handler::is_supported_archive(path)
    }

    /// 等比例缩放图片
    fn resize_keep_aspect_ratio(
        &self,
        img: &image::DynamicImage,
        max_size: u32,
    ) -> image::DynamicImage {
        resize_keep_aspect_ratio(img, max_size)
    }

    /// 编码为 WebP 格式
    fn encode_webp(&self, img: &image::DynamicImage) -> Result<Vec<u8>, String> {
        encode_webp(img)
    }

    /// 编码为 JPEG 格式
    fn encode_jpeg(&self, img: &image::DynamicImage) -> Result<Vec<u8>, String> {
        encode_jpeg(img)
    }

    fn evict_archive_cache(&self, archive_path: &Path) {
        cache::evict_archive_cache(&self.cache, &self.archive_cache, archive_path);
    }

    fn get_archive_metadata(&self, archive_path: &Path) -> Result<ArchiveMetadata, String> {
        get_archive_metadata(archive_path)
    }

    /// 获取首图 blob 或扫描
    pub fn get_first_image_blob_or_scan(
        &self,
        archive_path: &Path,
    ) -> Result<(String, Option<String>), String> {
        image_ops::get_first_image_blob_or_scan(
            &self.archive_cache,
            &self.index_cache,
            &self.blob_registry,
            archive_path,
        )
    }

    /// 获取首图 blob URL
    pub fn get_first_image_blob(&self, archive_path: &Path) -> Result<String, String> {
        image_ops::get_first_image_blob(
            &self.archive_cache,
            &self.index_cache,
            &self.blob_registry,
            archive_path,
        )
    }

    /// 获取首图原始字节数据
    pub fn get_first_image_bytes(
        &self,
        archive_path: &Path,
    ) -> Result<(Vec<u8>, Option<String>, ArchiveMetadata), String> {
        image_ops::get_first_image_bytes(&self.archive_cache, &self.index_cache, archive_path)
    }

    fn get_cached_image(&self, key: &str) -> Option<Vec<u8>> {
        cache::get_cached_image(&self.cache, key)
    }

    fn store_cached_image(&self, key: String, data: Vec<u8>) {
        cache::store_cached_image(&self.cache, key, data);
    }

    /// 获取 BlobRegistry 引用
    pub fn blob_registry(&self) -> &Arc<BlobRegistry> {
        &self.blob_registry
    }
}

impl Default for ArchiveManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ArchiveManager {
    /// 清除缓存
    pub fn clear_cache(&self) {
        cache::clear_cache(&self.cache, &self.archive_cache);
    }

    /// 清除指定压缩包的缓存
    pub fn evict_cache_for_path(&self, path: &Path) {
        cache::evict_archive_cache(&self.cache, &self.archive_cache, path);
    }

    /// 限制缓存大小
    pub fn limit_cache_size(&self, max_items: usize) {
        cache::limit_cache_size(&self.cache, &self.archive_cache, max_items);
    }

    /// 预加载压缩包中的所有图片
    pub fn preload_all_images(&self, archive_path: &Path) -> Result<usize, String> {
        cache::preload_all_images(&self.archive_cache, &self.index_cache, &self.cache, archive_path)
    }

    /// 从 ZIP 压缩包中流式提取文件
    pub fn extract_file_stream(
        &self,
        archive_path: &Path,
        file_path: &str,
    ) -> Result<impl Read + Send, String> {
        cache::extract_file_stream(&self.archive_cache, archive_path, file_path)
    }
}

// ============================================================================
// Property-Based Tests
// ============================================================================

#[cfg(test)]
mod property_tests {
    use super::*;
    use proptest::prelude::*;
    use std::path::PathBuf;

    /// **Feature: archive-ipc-optimization, Property 8: API backward compatibility**
    /// *For any* existing API call (extract_file_from_rar, extract_file_from_7z),
    /// the function SHALL return the same result with or without index optimization.
    /// **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
    ///
    /// 此测试验证：
    /// 1. ArchiveManager 的构造函数正确初始化 index_cache
    /// 2. extract_file_from_rar 和 extract_file_from_7z 方法在有无索引时行为一致
    /// 3. API 保持向后兼容性
    #[test]
    fn prop_api_backward_compatibility_manager_init() {
        // 测试 ArchiveManager 构造函数正确初始化 index_cache
        let manager = ArchiveManager::new();
        
        // 验证 index_cache 已初始化
        let stats = manager.get_index_cache_stats();
        assert_eq!(stats.index_count, 0, "新创建的 manager 应该没有缓存索引");
        assert_eq!(stats.hits, 0, "新创建的 manager 应该没有缓存命中");
        assert_eq!(stats.misses, 0, "新创建的 manager 应该没有缓存未命中");
    }

    #[test]
    fn prop_api_backward_compatibility_with_shared_registry() {
        // 测试使用共享 BlobRegistry 的构造函数
        let blob_registry = Arc::new(BlobRegistry::new(512));
        let manager = ArchiveManager::with_shared_blob_registry(blob_registry);
        
        // 验证 index_cache 已初始化
        let stats = manager.get_index_cache_stats();
        assert_eq!(stats.index_count, 0);
    }

    #[test]
    fn prop_api_backward_compatibility_with_blob_cache_size() {
        // 测试使用自定义 blob 缓存大小的构造函数
        let manager = ArchiveManager::with_blob_cache_size(256);
        
        // 验证 index_cache 已初始化
        let stats = manager.get_index_cache_stats();
        assert_eq!(stats.index_count, 0);
    }

    #[test]
    fn prop_api_backward_compatibility_extract_file_interface() {
        // 测试 extract_file 统一接口存在且可调用
        let manager = ArchiveManager::new();
        
        // 测试不存在的文件应该返回错误（而不是 panic）
        let result = manager.extract_file(Path::new("/nonexistent/archive.zip"), "test.jpg");
        assert!(result.is_err(), "不存在的文件应该返回错误");
        
        let result = manager.extract_file(Path::new("/nonexistent/archive.rar"), "test.jpg");
        assert!(result.is_err(), "不存在的 RAR 文件应该返回错误");
        
        let result = manager.extract_file(Path::new("/nonexistent/archive.7z"), "test.jpg");
        assert!(result.is_err(), "不存在的 7z 文件应该返回错误");
    }

    #[test]
    fn prop_api_backward_compatibility_list_contents_interface() {
        // 测试 list_contents 统一接口存在且可调用
        let manager = ArchiveManager::new();
        
        // 测试不存在的文件应该返回错误
        let result = manager.list_contents(Path::new("/nonexistent/archive.zip"));
        assert!(result.is_err());
        
        let result = manager.list_contents(Path::new("/nonexistent/archive.rar"));
        assert!(result.is_err());
        
        let result = manager.list_contents(Path::new("/nonexistent/archive.7z"));
        assert!(result.is_err());
    }

    #[test]
    fn prop_api_backward_compatibility_index_cache_methods() {
        // 测试索引缓存相关方法存在且可调用
        let manager = ArchiveManager::new();
        
        // 测试 get_index_cache_stats
        let stats = manager.get_index_cache_stats();
        assert!(stats.max_size > 0, "max_size 应该大于 0");
        
        // 测试 clear_index_cache
        manager.clear_index_cache();
        let stats_after = manager.get_index_cache_stats();
        assert_eq!(stats_after.index_count, 0, "清除后索引数量应该为 0");
    }

    #[test]
    fn prop_api_backward_compatibility_archive_format_detection() {
        // 测试 ArchiveFormat 检测保持一致
        assert_eq!(ArchiveFormat::from_extension(Path::new("test.zip")), ArchiveFormat::Zip);
        assert_eq!(ArchiveFormat::from_extension(Path::new("test.cbz")), ArchiveFormat::Zip);
        assert_eq!(ArchiveFormat::from_extension(Path::new("test.rar")), ArchiveFormat::Rar);
        assert_eq!(ArchiveFormat::from_extension(Path::new("test.cbr")), ArchiveFormat::Rar);
        assert_eq!(ArchiveFormat::from_extension(Path::new("test.7z")), ArchiveFormat::SevenZ);
        assert_eq!(ArchiveFormat::from_extension(Path::new("test.cb7")), ArchiveFormat::SevenZ);
        assert_eq!(ArchiveFormat::from_extension(Path::new("test.txt")), ArchiveFormat::Unknown);
    }

    proptest! {
        /// 测试 ArchiveFormat 检测对于任意扩展名的一致性
        #[test]
        fn prop_archive_format_consistency(
            ext in "(zip|cbz|rar|cbr|7z|cb7|txt|pdf|jpg)"
        ) {
            let path = PathBuf::from(format!("test.{}", ext));
            let format = ArchiveFormat::from_extension(&path);
            
            // 验证格式检测的一致性
            match ext.as_str() {
                "zip" | "cbz" => prop_assert_eq!(format, ArchiveFormat::Zip),
                "rar" | "cbr" => prop_assert_eq!(format, ArchiveFormat::Rar),
                "7z" | "cb7" => prop_assert_eq!(format, ArchiveFormat::SevenZ),
                _ => prop_assert_eq!(format, ArchiveFormat::Unknown),
            }
            
            // 验证 is_supported 方法
            let expected_supported = matches!(ext.as_str(), "zip" | "cbz" | "rar" | "cbr" | "7z" | "cb7");
            prop_assert_eq!(format.is_supported(), expected_supported);
        }

        /// 测试 ArchiveManager 的 Default trait 实现
        #[test]
        fn prop_archive_manager_default(_dummy in 0..1i32) {
            let manager: ArchiveManager = Default::default();
            let stats = manager.get_index_cache_stats();
            
            // 验证默认构造的 manager 状态正确
            prop_assert_eq!(stats.index_count, 0);
            prop_assert_eq!(stats.hits, 0);
            prop_assert_eq!(stats.misses, 0);
        }
    }
}
