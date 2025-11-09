//! NeoView - Image Loader
//! 图像加载和处理模块

use base64::{engine::general_purpose, Engine as _};
use std::fs;
use std::path::Path;
use std::io::Cursor;
use image::{GenericImageView, ImageFormat, imageops::FilterType};

pub struct ImageLoader {
    /// 缓存大小限制 (MB)
    cache_size_mb: usize,
}

impl ImageLoader {
    pub fn new(cache_size_mb: usize) -> Self {
        Self { cache_size_mb }
    }

    /// 加载图像文件为 base64
    pub fn load_image_as_base64(&self, path: &str) -> Result<String, String> {
        let path = Path::new(path);
        
        if !path.exists() {
            return Err(format!("Image file not found: {}", path.display()));
        }

        // 读取文件
        let image_data = fs::read(path)
            .map_err(|e| format!("Failed to read image file: {}", e))?;

        // 获取 MIME 类型
        let mime_type = self.detect_mime_type(path)?;

        // 转换为 base64
        let base64_data = general_purpose::STANDARD.encode(&image_data);

        // 返回 data URL
        Ok(format!("data:{};base64,{}", mime_type, base64_data))
    }

    /// 获取图像尺寸
    pub fn get_image_dimensions(&self, path: &str) -> Result<(u32, u32), String> {
        let path = Path::new(path);
        
        if !path.exists() {
            return Err(format!("Image file not found: {}", path.display()));
        }

        // TODO: 使用 image crate 获取实际尺寸
        // 目前返回默认值
        Ok((800, 600))
    }

    /// 生成缩略图
    pub fn generate_thumbnail(
        &self,
        path: &str,
        max_width: u32,
        max_height: u32,
    ) -> Result<String, String> {
        let path = Path::new(path);
        
        if !path.exists() {
            return Err(format!("Image file not found: {}", path.display()));
        }

        // 读取文件
        let image_data = fs::read(path)
            .map_err(|e| format!("Failed to read image file: {}", e))?;

        // 使用 image crate 加载和处理图像
        use image::ImageFormat;
        
        // 尝试从文件扩展名推断格式
        let format = path.extension()
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
                match image::load_from_memory_with_format(&image_data, f) {
                    Ok(img) => img,
                    Err(e) => {
                        // 如果指定格式失败，尝试自动检测
                        eprintln!("Warning: Failed to load with format {:?}: {}, trying auto-detect", f, e);
                        image::load_from_memory(&image_data)
                            .map_err(|e| format!("Failed to load image: {}", e))?
                    }
                }
            }
            None => {
                image::load_from_memory(&image_data)
                    .map_err(|e| format!("Failed to load image: {}", e))?
            }
        };

        // 计算缩略图尺寸（保持宽高比）
        let (original_width, original_height) = img.dimensions();
        let ratio = (max_width as f32 / original_width as f32)
            .min(max_height as f32 / original_height as f32)
            .min(1.0);
        
        let new_width = (original_width as f32 * ratio) as u32;
        let new_height = (original_height as f32 * ratio) as u32;

        // 调整图像大小
        let resized_img = img.resize(
            new_width,
            new_height,
            image::imageops::FilterType::Lanczos3,
        );

        // 转换为 RGB8 格式
        let rgb_img = resized_img.to_rgb8();

        // 编码为 JPEG 格式（质量 85%）
        let mut thumbnail_data = Vec::new();
        let mut cursor = Cursor::new(&mut thumbnail_data);
        
        // 使用动态图像直接编码
        let dynamic_img = image::DynamicImage::ImageRgb8(rgb_img);
        
        dynamic_img.write_to(&mut cursor, ImageFormat::Jpeg)
            .map_err(|e| format!("Failed to encode thumbnail: {}", e))?;

        // 转换为 base64
        let base64_data = general_purpose::STANDARD.encode(&thumbnail_data);

        // 返回 data URL
        Ok(format!("data:image/jpeg;base64,{}", base64_data))
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
        Self::new(512) // 默认 512MB 缓存
    }
}
