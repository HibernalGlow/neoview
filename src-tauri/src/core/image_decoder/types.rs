//! Image Decoder Types
//! 解码器类型定义 - DecodeBackend, DecodedImage, DecodeError, DecodeOptions

use image::{DynamicImage, ImageFormat, RgbaImage};
use std::io::Cursor;
use thiserror::Error;

/// 解码后端类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DecodeBackend {
    /// Windows Imaging Component (硬件加速)
    Wic,
    /// jxl-oxide (JPEG XL 专用)
    JxlOxide,
    /// image crate (通用回退)
    ImageCrate,
}

impl std::fmt::Display for DecodeBackend {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DecodeBackend::Wic => write!(f, "WIC"),
            DecodeBackend::JxlOxide => write!(f, "jxl-oxide"),
            DecodeBackend::ImageCrate => write!(f, "image-crate"),
        }
    }
}

/// 解码选项配置
#[derive(Debug, Clone)]
pub struct DecodeOptions {
    /// 目标最大宽度（可选）
    pub max_width: Option<u32>,
    /// 目标最大高度（可选）
    pub max_height: Option<u32>,
    /// WebP 编码质量 (0-100)
    pub webp_quality: u8,
}

impl Default for DecodeOptions {
    fn default() -> Self {
        Self {
            max_width: None,
            max_height: None,
            webp_quality: 85,
        }
    }
}

impl DecodeOptions {
    /// 创建带缩放的选项
    pub fn with_scale(max_width: u32, max_height: u32) -> Self {
        Self {
            max_width: Some(max_width),
            max_height: Some(max_height),
            ..Default::default()
        }
    }
}

/// 解码错误类型
#[derive(Debug, Error)]
pub enum DecodeError {
    #[error("不支持的格式: {format}")]
    UnsupportedFormat { format: String },

    #[error("解码失败 ({backend}): {message}")]
    DecodeFailed { backend: DecodeBackend, message: String },

    #[error("获取尺寸失败: {0}")]
    DimensionError(String),

    #[error("缩放失败: {0}")]
    ScaleError(String),

    #[error("编码失败: {0}")]
    EncodeError(String),

    #[error("解码时发生 panic: {0}")]
    Panic(String),

    #[error("IO 错误: {0}")]
    IoError(String),
}

impl From<std::io::Error> for DecodeError {
    fn from(e: std::io::Error) -> Self {
        DecodeError::IoError(e.to_string())
    }
}

/// 解码后的图像数据
#[derive(Debug, Clone)]
pub struct DecodedImage {
    /// 图像宽度
    pub width: u32,
    /// 图像高度
    pub height: u32,
    /// RGBA 像素数据
    pub pixels: Vec<u8>,
    /// 使用的解码后端
    pub backend: DecodeBackend,
}


impl DecodedImage {
    /// 创建新的 DecodedImage（RGBA 格式）
    pub fn new(width: u32, height: u32, pixels: Vec<u8>, backend: DecodeBackend) -> Self {
        Self { width, height, pixels, backend }
    }

    /// 从 BGRA 数据创建（自动转换为 RGBA）
    /// Requirements 5.5: BGRA → RGBA 转换
    pub fn from_bgra(width: u32, height: u32, mut bgra: Vec<u8>, backend: DecodeBackend) -> Self {
        // BGRA → RGBA: 交换 B 和 R 通道
        for chunk in bgra.chunks_exact_mut(4) {
            chunk.swap(0, 2); // B <-> R
        }
        Self { width, height, pixels: bgra, backend }
    }

    /// 转换为 `image::DynamicImage`
    /// Requirements 5.2
    pub fn to_dynamic_image(&self) -> Result<DynamicImage, DecodeError> {
        RgbaImage::from_raw(self.width, self.height, self.pixels.clone())
            .map(DynamicImage::ImageRgba8)
            .ok_or_else(|| DecodeError::EncodeError("无法创建 DynamicImage".to_string()))
    }

    /// 编码为 WebP
    /// Requirements 5.3
    pub fn to_webp(&self, quality: u8) -> Result<Vec<u8>, DecodeError> {
        let img = self.to_dynamic_image()?;
        let mut output = Vec::new();
        
        // 使用 image crate 的 WebP 编码器
        let encoder = image::codecs::webp::WebPEncoder::new_lossless(&mut output);
        
        // 如果质量 < 100，使用有损编码
        if quality < 100 {
            let mut output = Vec::new();
            img.write_to(&mut Cursor::new(&mut output), ImageFormat::WebP)
                .map_err(|e| DecodeError::EncodeError(format!("WebP 编码失败: {e}")))?;
            return Ok(output);
        }
        
        // 无损编码
        encoder.encode(
            &self.pixels,
            self.width,
            self.height,
            image::ExtendedColorType::Rgba8,
        ).map_err(|e| DecodeError::EncodeError(format!("WebP 编码失败: {e}")))?;
        
        Ok(output)
    }

    /// 编码为 PNG（无损）
    /// Requirements 5.4
    pub fn to_png(&self) -> Result<Vec<u8>, DecodeError> {
        let img = self.to_dynamic_image()?;
        let mut output = Vec::new();
        img.write_to(&mut Cursor::new(&mut output), ImageFormat::Png)
            .map_err(|e| DecodeError::EncodeError(format!("PNG 编码失败: {e}")))?;
        Ok(output)
    }

    /// 验证像素数据长度是否正确
    pub fn is_valid(&self) -> bool {
        self.pixels.len() == (self.width as usize * self.height as usize * 4)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bgra_to_rgba_conversion() {
        // BGRA: Blue=255, Green=128, Red=64, Alpha=255
        let bgra = vec![255, 128, 64, 255];
        let img = DecodedImage::from_bgra(1, 1, bgra, DecodeBackend::Wic);
        
        // RGBA: Red=64, Green=128, Blue=255, Alpha=255
        assert_eq!(img.pixels, vec![64, 128, 255, 255]);
    }

    #[test]
    fn test_decoded_image_validity() {
        let pixels = vec![0u8; 4 * 10 * 10]; // 10x10 RGBA
        let img = DecodedImage::new(10, 10, pixels, DecodeBackend::ImageCrate);
        assert!(img.is_valid());

        let invalid_pixels = vec![0u8; 100]; // 不正确的长度
        let invalid_img = DecodedImage::new(10, 10, invalid_pixels, DecodeBackend::ImageCrate);
        assert!(!invalid_img.is_valid());
    }
}
