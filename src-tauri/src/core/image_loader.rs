//! NeoView - Image Loader
//! 图像加载和处理模块

use base64::{engine::general_purpose, Engine as _};
use std::fs;
use std::path::Path;

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
        _max_width: u32,
        _max_height: u32,
    ) -> Result<String, String> {
        // TODO: 实现缩略图生成
        // 目前返回完整图像
        self.load_image_as_base64(path)
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
