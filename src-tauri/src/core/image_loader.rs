//! `NeoView` - Image Loader
//! 图像加载和处理模块

use super::image_cache::ImageCache;
use super::image_decoder::{UnifiedDecoder, ImageDecoder};
use image::{GenericImageView, ImageFormat};
use std::fs;
use std::io::Cursor;
use std::path::Path;
use std::sync::Arc;
use threadpool::ThreadPool;

#[derive(Clone)]
pub struct ImageLoader {
    /// 图像缓存
    cache: Arc<ImageCache>,
    /// 线程池用于多线程解码
    pub thread_pool: Arc<ThreadPool>,
}

impl ImageLoader {
    pub fn new(cache_size_mb: usize, num_threads: usize) -> Self {
        Self {
            cache: Arc::new(ImageCache::new(cache_size_mb)),
            thread_pool: Arc::new(ThreadPool::new(num_threads)),
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

    /// 加载图像文件为二进制数据 (带缓存)
    pub fn load_image_as_binary(&self, path: &str) -> Result<Vec<u8>, String> {
        let path_obj = Path::new(path);

        if !path_obj.exists() {
            return Err(format!("Image file not found: {}", path_obj.display()));
        }

        // 读取文件
        let image_data =
            fs::read(path_obj).map_err(|e| format!("Failed to read image file: {}", e))?;

        // 检查是否为 JXL 文件 - 需要解码为 PNG
        if let Some(ext) = path_obj.extension().and_then(|e| e.to_str()) {
            let ext_lower = ext.to_lowercase();
            if ext_lower == "jxl" {
                // JXL 解码图像（浏览器不原生支持，需要转换）
                let img = self.decode_image_unified(&image_data, &ext_lower)?;

                // 编码为 PNG
                let mut png_data = Vec::new();
                img.write_to(&mut Cursor::new(&mut png_data), ImageFormat::Png)
                    .map_err(|e| format!("Failed to encode PNG: {e}"))?;

                return Ok(png_data);
            }
        }

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
                let image = self.decode_image_unified(&image_data, &ext_lower)?;
                return Ok(image.dimensions());
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
    fn decode_image_unified(&self, image_data: &[u8], ext: &str) -> Result<image::DynamicImage, String> {
        let decoder = UnifiedDecoder::with_format(ext);
        let decoded = decoder.decode(image_data)
            .map_err(|e| format!("解码失败: {e}"))?;
        decoded.to_dynamic_image()
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
