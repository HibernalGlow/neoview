//! 图片加载模式模块
//! 支持 Raw（原始字节）和 Bitmap（像素数据）两种模式

use serde::{Deserialize, Serialize};
use std::path::Path;

#[cfg(target_os = "windows")]
use crate::core::wic_decoder::{decode_image_from_memory_with_wic, wic_result_to_dynamic_image};

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

/// 使用 WIC 解码为 Bitmap
#[cfg(target_os = "windows")]
fn decode_to_bitmap(data: &[u8]) -> Result<ImageLoadResult, String> {
    let wic_result = decode_image_from_memory_with_wic(data)?;
    
    // WIC 返回 BGRA，转换为 RGBA
    let mut rgba = wic_result.pixels;
    for chunk in rgba.chunks_exact_mut(4) {
        chunk.swap(0, 2); // B <-> R
    }
    
    Ok(ImageLoadResult::Bitmap {
        data: rgba,
        width: wic_result.width,
        height: wic_result.height,
    })
}

#[cfg(not(target_os = "windows"))]
fn decode_to_bitmap(data: &[u8]) -> Result<ImageLoadResult, String> {
    use image::GenericImageView;
    
    let img = image::load_from_memory(data)
        .map_err(|e| format!("解码失败: {}", e))?;
    
    let (width, height) = img.dimensions();
    let rgba = img.to_rgba8().into_raw();
    
    Ok(ImageLoadResult::Bitmap {
        data: rgba,
        width,
        height,
    })
}

/// 带缩放的 Bitmap 加载（用于大图优化）
#[cfg(target_os = "windows")]
pub fn load_image_bitmap_scaled(
    data: &[u8],
    max_width: u32,
    max_height: u32,
) -> Result<ImageLoadResult, String> {
    use crate::core::wic_decoder::decode_and_scale_with_wic;
    
    let wic_result = decode_and_scale_with_wic(data, max_width, max_height)?;
    
    // BGRA -> RGBA
    let mut rgba = wic_result.pixels;
    for chunk in rgba.chunks_exact_mut(4) {
        chunk.swap(0, 2);
    }
    
    Ok(ImageLoadResult::Bitmap {
        data: rgba,
        width: wic_result.width,
        height: wic_result.height,
    })
}

#[cfg(not(target_os = "windows"))]
pub fn load_image_bitmap_scaled(
    data: &[u8],
    max_width: u32,
    max_height: u32,
) -> Result<ImageLoadResult, String> {
    use image::GenericImageView;
    
    let img = image::load_from_memory(data)
        .map_err(|e| format!("解码失败: {}", e))?;
    
    let (orig_w, orig_h) = img.dimensions();
    let scale = (max_width as f32 / orig_w as f32)
        .min(max_height as f32 / orig_h as f32)
        .min(1.0);
    
    let new_w = (orig_w as f32 * scale) as u32;
    let new_h = (orig_h as f32 * scale) as u32;
    
    let resized = img.thumbnail(new_w, new_h);
    let rgba = resized.to_rgba8().into_raw();
    
    Ok(ImageLoadResult::Bitmap {
        data: rgba,
        width: new_w,
        height: new_h,
    })
}
