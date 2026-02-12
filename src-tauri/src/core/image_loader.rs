//! `NeoView` - Image Loader
//! 图像加载和处理模块
//! 支持 memmap2 内存映射加载大图

use super::image_cache::ImageCache;
use super::image_decoder::{ImageDecoder, UnifiedDecoder};
use image::{GenericImageView, ImageFormat};
use memmap2::Mmap;
use std::fs::{self, File};
use std::io::Cursor;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use threadpool::ThreadPool;

/// 默认大文件阈值 (10MB)
const DEFAULT_LARGE_FILE_THRESHOLD: u64 = 10 * 1024 * 1024;

/// 图像数据源
#[derive(Debug)]
pub enum ImageDataSource {
    /// 内存中的数据
    Memory(Vec<u8>),
    /// 内存映射的数据
    Mmap(Mmap),
}

impl ImageDataSource {
    /// 获取数据切片
    pub fn as_slice(&self) -> &[u8] {
        match self {
            Self::Memory(data) => data,
            Self::Mmap(mmap) => mmap,
        }
    }

    /// 获取数据长度
    pub fn len(&self) -> usize {
        match self {
            Self::Memory(data) => data.len(),
            Self::Mmap(mmap) => mmap.len(),
        }
    }

    /// 检查是否为空
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[derive(Clone)]
pub struct ImageLoader {
    /// 图像缓存
    cache: Arc<ImageCache>,
    /// 线程池用于多线程解码
    pub thread_pool: Arc<ThreadPool>,
    /// 大文件阈值 (字节)，超过此值使用 mmap
    large_file_threshold: Arc<AtomicU64>,
}

impl ImageLoader {
    pub fn new(cache_size_mb: usize, num_threads: usize) -> Self {
        Self {
            cache: Arc::new(ImageCache::new(cache_size_mb)),
            thread_pool: Arc::new(ThreadPool::new(num_threads)),
            large_file_threshold: Arc::new(AtomicU64::new(DEFAULT_LARGE_FILE_THRESHOLD)),
        }
    }

    /// 更新缓存大小
    pub fn update_cache_size(&mut self, cache_size_mb: usize) {
        self.cache = Arc::new(ImageCache::new(cache_size_mb));
    }

    /// 更新线程数
    pub fn update_thread_count(&mut self, num_threads: usize) {
        self.thread_pool = Arc::new(ThreadPool::new(num_threads));
    }

    /// 设置大文件阈值 (MB)
    pub fn set_large_file_threshold(&self, threshold_mb: u64) {
        self.large_file_threshold
            .store(threshold_mb * 1024 * 1024, Ordering::Relaxed);
    }

    /// 获取大文件阈值 (字节)
    pub fn get_large_file_threshold(&self) -> u64 {
        self.large_file_threshold.load(Ordering::Relaxed)
    }

    /// 使用内存映射加载文件
    fn load_with_mmap(&self, path: &Path) -> Result<ImageDataSource, String> {
        let file = File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;

        // 安全地创建内存映射
        let mmap = unsafe { Mmap::map(&file) }.map_err(|e| format!("内存映射失败: {e}"))?;

        Ok(ImageDataSource::Mmap(mmap))
    }

    /// 传统方式加载文件
    fn load_traditional(&self, path: &Path) -> Result<ImageDataSource, String> {
        let data = fs::read(path).map_err(|e| format!("读取文件失败: {e}"))?;
        Ok(ImageDataSource::Memory(data))
    }

    /// 智能加载文件（根据大小自动选择加载方式）
    pub fn load_file_smart(&self, path: &Path) -> Result<ImageDataSource, String> {
        let metadata = fs::metadata(path).map_err(|e| format!("获取文件元数据失败: {e}"))?;

        let threshold = self.large_file_threshold.load(Ordering::Relaxed);

        if metadata.len() > threshold {
            // 大文件使用 mmap
            match self.load_with_mmap(path) {
                Ok(data) => {
                    log::debug!(
                        "使用 mmap 加载大文件: {} ({} bytes)",
                        path.display(),
                        metadata.len()
                    );
                    Ok(data)
                }
                Err(e) => {
                    // mmap 失败，回退到传统方式
                    log::warn!("mmap 加载失败，回退到传统方式: {e}");
                    self.load_traditional(path)
                }
            }
        } else {
            // 小文件使用传统方式
            self.load_traditional(path)
        }
    }

    /// 加载图像文件为二进制数据 (带缓存)
    pub fn load_image_as_binary(&self, path: &str) -> Result<Vec<u8>, String> {
        let path_obj = Path::new(path);

        if !path_obj.exists() {
            return Err(format!("Image file not found: {}", path_obj.display()));
        }

        // 读取文件
        let image_data =
            fs::read(path_obj).map_err(|e| format!("Failed to read image file: {}", e))?;

        // 如果是压缩包或文件系统的 JXL 文件，现在可以直接返回原始二进制数据
        // 因为我们已经启用了 WebView2 的原生 JXL 支持

        // 直接返回原始二进制数据
        Ok(image_data)
    }

    /// 清除缓存
    pub fn clear_cache(&self) {
        self.cache.clear();
    }

    /// 获取缓存统计
    pub fn cache_stats(&self) -> (usize, usize, usize) {
        self.cache.stats()
    }

    /// 获取图像尺寸
    pub fn get_image_dimensions(&self, path: &str) -> Result<(u32, u32), String> {
        let path = Path::new(path);

        if !path.exists() {
            return Err(format!("Image file not found: {}", path.display()));
        }

        // 读取文件
        let image_data = fs::read(path).map_err(|e| format!("Failed to read image file: {}", e))?;

        // 检查是否为 JXL 文件
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            let ext_lower = ext.to_lowercase();
            if ext_lower == "jxl" {
                // 如果是 JXL，我们仍然可以尝试获取尺寸，或者让 image crate 尝试
                // 注意：image crate 0.25+ 可能支持 JXL 嗅探，但如果不支持，我们回退到 unified decoder
                match self.decode_image_unified(&image_data, &ext_lower) {
                    Ok(image) => return Ok(image.dimensions()),
                    Err(e) => {
                        log::warn!("JXL dimensions detection via unified decoder failed: {e}")
                    }
                }
            }
        }

        // 尝试从文件扩展名推断格式
        let format = path
            .extension()
            .and_then(|ext| ext.to_str())
            .and_then(|ext| match ext.to_lowercase().as_str() {
                "jpg" | "jpeg" => Some(ImageFormat::Jpeg),
                "png" => Some(ImageFormat::Png),
                "gif" => Some(ImageFormat::Gif),
                "bmp" => Some(ImageFormat::Bmp),
                "webp" => Some(ImageFormat::WebP),
                "avif" => Some(ImageFormat::Avif),
                "tiff" | "tif" => Some(ImageFormat::Tiff),
                _ => None,
            });

        // 尝试加载图像获取尺寸
        let img = match format {
            Some(f) => {
                // 强制使用指定格式加载
                image::load_from_memory_with_format(&image_data, f)
                    .map_err(|e| format!("获取图片尺寸失败: {} (format: {:?})", e, f))?
            }
            None => {
                // 没有识别到格式,尝试自动检测
                image::load_from_memory(&image_data)
                    .map_err(|e| format!("获取图片尺寸失败: {}", e))?
            }
        };

        Ok(img.dimensions())
    }

    /// 生成缩略图
    pub fn generate_thumbnail(
        &self,
        path: &str,
        max_width: u32,
        max_height: u32,
    ) -> Result<Vec<u8>, String> {
        let path = Path::new(path);

        if !path.exists() {
            return Err(format!("Image file not found: {}", path.display()));
        }

        // 读取文件
        let image_data = fs::read(path).map_err(|e| format!("Failed to read image file: {}", e))?;

        // 检查是否为 JXL 文件
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            let ext_lower = ext.to_lowercase();
            if ext_lower == "jxl" {
                let img = self.decode_image_unified(&image_data, &ext_lower)?;
                return self.create_thumbnail_from_image(img, max_width, max_height);
            }
        }

        // 使用 image crate 加载和处理图像
        use image::ImageFormat;

        // 尝试从文件扩展名推断格式
        let format = path
            .extension()
            .and_then(|ext| ext.to_str())
            .and_then(|ext| match ext.to_lowercase().as_str() {
                "jpg" | "jpeg" => Some(ImageFormat::Jpeg),
                "png" => Some(ImageFormat::Png),
                "gif" => Some(ImageFormat::Gif),
                "bmp" => Some(ImageFormat::Bmp),
                "webp" => Some(ImageFormat::WebP),
                "avif" => Some(ImageFormat::Avif),
                "tiff" | "tif" => Some(ImageFormat::Tiff),
                _ => None,
            });

        // 尝试加载图像
        let img = match format {
            Some(f) => {
                // 强制使用指定格式加载,不回退到自动检测
                image::load_from_memory_with_format(&image_data, f)
                    .map_err(|e| format!("加载图片失败: {} (format: {:?})", e, f))?
            }
            None => {
                // 没有识别到格式,尝试自动检测
                image::load_from_memory(&image_data).map_err(|e| format!("加载图片失败: {}", e))?
            }
        };

        self.create_thumbnail_from_image(img, max_width, max_height)
    }

    /// 使用 UnifiedDecoder 解码图像
    fn decode_image_unified(
        &self,
        image_data: &[u8],
        ext: &str,
    ) -> Result<image::DynamicImage, String> {
        let decoder = UnifiedDecoder::with_format(ext);
        let decoded = decoder
            .decode(image_data)
            .map_err(|e| format!("解码失败: {e}"))?;
        decoded
            .to_dynamic_image()
            .map_err(|e| format!("转换失败: {e}"))
    }

    /// 从已解码的图像创建缩略图
    fn create_thumbnail_from_image(
        &self,
        img: image::DynamicImage,
        max_width: u32,
        max_height: u32,
    ) -> Result<Vec<u8>, String> {
        // 计算缩略图尺寸（保持宽高比）
        let (original_width, original_height) = img.dimensions();
        let ratio = (max_width as f32 / original_width as f32)
            .min(max_height as f32 / original_height as f32)
            .min(1.0);

        let new_width = (original_width as f32 * ratio) as u32;
        let new_height = (original_height as f32 * ratio) as u32;

        // 调整图像大小
        let resized_img = img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3);

        // 转换为 RGB8 格式
        let rgb_img = resized_img.to_rgb8();

        // 编码为 JPEG 格式（质量 85%）
        let mut thumbnail_data = Vec::new();
        let mut cursor = Cursor::new(&mut thumbnail_data);

        // 使用动态图像直接编码
        let dynamic_img = image::DynamicImage::ImageRgb8(rgb_img);

        dynamic_img
            .write_to(&mut cursor, ImageFormat::Jpeg)
            .map_err(|e| format!("Failed to encode thumbnail: {}", e))?;

        // 返回二进制数据
        Ok(thumbnail_data)
    }

    /// 检测 MIME 类型
    fn detect_mime_type(&self, path: &Path) -> Result<String, String> {
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            let mime = match ext.to_lowercase().as_str() {
                "jpg" | "jpeg" => "image/jpeg",
                "png" => "image/png",
                "gif" => "image/gif",
                "bmp" => "image/bmp",
                "webp" => "image/webp",
                "avif" => "image/avif",
                "jxl" => "image/jxl",
                "tiff" | "tif" => "image/tiff",
                _ => "application/octet-stream",
            };
            Ok(mime.to_string())
        } else {
            Err("Cannot determine file type".to_string())
        }
    }
}

impl Default for ImageLoader {
    fn default() -> Self {
        Self::new(512, 4) // 默认 512MB 缓存，4个线程
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_large_file_threshold() {
        let loader = ImageLoader::default();

        // 默认阈值
        assert_eq!(
            loader.get_large_file_threshold(),
            DEFAULT_LARGE_FILE_THRESHOLD
        );

        // 更新阈值
        loader.set_large_file_threshold(20);
        assert_eq!(loader.get_large_file_threshold(), 20 * 1024 * 1024);
    }

    #[test]
    fn test_load_small_file() {
        let loader = ImageLoader::default();

        // 创建小文件
        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(b"small test data").unwrap();

        let result = loader.load_file_smart(temp_file.path());
        assert!(result.is_ok());

        let data = result.unwrap();
        assert!(!data.is_empty());
        assert!(matches!(data, ImageDataSource::Memory(_)));
    }

    #[test]
    fn test_image_data_source() {
        let data = vec![1, 2, 3, 4, 5];
        let source = ImageDataSource::Memory(data.clone());

        assert_eq!(source.len(), 5);
        assert!(!source.is_empty());
        assert_eq!(source.as_slice(), &data[..]);
    }
}
