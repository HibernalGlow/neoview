//! 图片加载模式模块
//! 支持 Raw（原始字节）和 Bitmap（像素数据）两种模式

use crate::core::image_decoder::{UnifiedDecoder, ImageDecoder};
use serde::{Deserialize, Serialize};

/// 图片加载模式
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum ImageLoadMode {
    /// 原始字节模式：直接传输文件原始数据
    Raw,
    /// Bitmap 模式：WIC 解码后传输 RGBA 像素
    Bitmap,
    /// 自动模式：根据格式自动选择
    Auto,
}

impl Default for ImageLoadMode {
    fn default() -> Self {
        Self::Auto
    }
}

/// 图片加载结果
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum ImageLoadResult {
    /// 原始字节数据
    Raw {
        data: Vec<u8>,
        format: String,
    },
    /// Bitmap 像素数据 (RGBA)
    Bitmap {
        data: Vec<u8>,
        width: u32,
        height: u32,
    },
}

impl ImageLoadResult {
    /// 获取数据大小
    pub fn data_size(&self) -> usize {
        match self {
            Self::Raw { data, .. } => data.len(),
            Self::Bitmap { data, .. } => data.len(),
        }
    }
}

/// 需要后端解码的格式
const BACKEND_DECODE_FORMATS: &[&str] = &["avif", "jxl", "heic", "heif"];

/// 检查是否需要后端解码
pub fn needs_backend_decode(format: &str) -> bool {
    BACKEND_DECODE_FORMATS.contains(&format.to_lowercase().as_str())
}

/// 统一图片加载函数
pub fn load_image_unified(
    data: Vec<u8>,
    format: &str,
    mode: ImageLoadMode,
) -> Result<ImageLoadResult, String> {
    let format_lower = format.to_lowercase();
    
    // 确定实际使用的模式
    let effective_mode = match mode {
        ImageLoadMode::Auto => {
            if needs_backend_decode(&format_lower) {
                ImageLoadMode::Bitmap
            } else {
                ImageLoadMode::Raw
            }
        }
        other => other,
    };
    
    match effective_mode {
        ImageLoadMode::Raw => {
            Ok(ImageLoadResult::Raw {
                data,
                format: format_lower,
            })
        }
        ImageLoadMode::Bitmap => {
            decode_to_bitmap(&data)
        }
        ImageLoadMode::Auto => unreachable!(),
    }
}

/// 使用 UnifiedDecoder 解码为 Bitmap
fn decode_to_bitmap(data: &[u8]) -> Result<ImageLoadResult, String> {
    let decoder = UnifiedDecoder::new();
    let decoded = decoder.decode(data)
        .map_err(|e| format!("解码失败: {e}"))?;
    
    Ok(ImageLoadResult::Bitmap {
        data: decoded.pixels,
        width: decoded.width,
        height: decoded.height,
    })
}

/// 带缩放的 Bitmap 加载（用于大图优化）
pub fn load_image_bitmap_scaled(
    data: &[u8],
    max_width: u32,
    max_height: u32,
) -> Result<ImageLoadResult, String> {
    let decoder = UnifiedDecoder::new();
    let decoded = decoder.decode_with_scale(data, max_width, max_height)
        .map_err(|e| format!("解码缩放失败: {e}"))?;
    
    Ok(ImageLoadResult::Bitmap {
        data: decoded.pixels,
        width: decoded.width,
        height: decoded.height,
    })
}
