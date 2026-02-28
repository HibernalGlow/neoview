//! 缩略图基准测试
//! 包含各种缩略图生成方法的测试函数

#![allow(
    clippy::similar_names,
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::uninlined_format_args,
    clippy::match_same_arms,
    clippy::redundant_closure
)]

use image::{DynamicImage, GenericImageView, ImageFormat};
use std::io::Cursor;

/// 使用 image crate 解码 + 缩放 + WebP 编码
pub fn generate_thumbnail_with_image_crate(image_data: &[u8]) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(image_data).map_err(|e| e.to_string())?;
    let (w, h) = img.dimensions();
    let max_size = 200u32;
    let scale = (max_size as f32 / w as f32).min(max_size as f32 / h as f32).min(1.0);
    let new_w = (w as f32 * scale) as u32;
    let new_h = (h as f32 * scale) as u32;
    let thumbnail = img.thumbnail(new_w, new_h);
    
    let mut output = Vec::new();
    thumbnail.write_to(&mut Cursor::new(&mut output), ImageFormat::WebP)
        .map_err(|e| format!("WebP 编码失败: {}", e))?;
    Ok(output)
}

/// 使用 WIC 解码 + 缩放 + WebP 编码（旧方法，先全尺寸解码再缩放）
#[cfg(target_os = "windows")]
pub fn generate_thumbnail_with_wic(image_data: &[u8]) -> Result<Vec<u8>, String> {
    use crate::core::wic_decoder::{decode_image_from_memory_with_wic, wic_result_to_dynamic_image};
    
    let result = decode_image_from_memory_with_wic(image_data)?;
    let img = wic_result_to_dynamic_image(result)?;
    
    let (w, h) = img.dimensions();
    let max_size = 200u32;
    let scale = (max_size as f32 / w as f32).min(max_size as f32 / h as f32).min(1.0);
    let new_w = (w as f32 * scale) as u32;
    let new_h = (h as f32 * scale) as u32;
    let thumbnail = img.thumbnail(new_w, new_h);
    
    let mut output = Vec::new();
    thumbnail.write_to(&mut Cursor::new(&mut output), ImageFormat::WebP)
        .map_err(|e| format!("WebP 编码失败: {}", e))?;
    Ok(output)
}

/// 使用 WIC 内置缩放 + WebP 编码（新方法，快速）
/// 避免解码到全分辨率，直接在 WIC 层面缩放
#[cfg(target_os = "windows")]
pub fn generate_thumbnail_with_wic_fast(image_data: &[u8]) -> Result<Vec<u8>, String> {
    use crate::core::wic_decoder::{decode_and_scale_with_wic, wic_result_to_dynamic_image};
    
    // 使用 WIC 内置缩放器直接输出小尺寸图像
    let result = decode_and_scale_with_wic(image_data, 200, 200)?;
    let img = wic_result_to_dynamic_image(result)?;
    
    let mut output = Vec::new();
    img.write_to(&mut Cursor::new(&mut output), ImageFormat::WebP)
        .map_err(|e| format!("WebP 编码失败: {}", e))?;
    Ok(output)
}

/// 使用 WIC 解码 + 缩放 + 指定格式编码
#[cfg(target_os = "windows")]
pub fn generate_thumbnail_with_format(image_data: &[u8], output_format: &str) -> Result<Vec<u8>, String> {
    use crate::core::wic_decoder::{decode_image_from_memory_with_wic, wic_result_to_dynamic_image};
    
    let result = decode_image_from_memory_with_wic(image_data)?;
    let img = wic_result_to_dynamic_image(result)?;
    
    let (w, h) = img.dimensions();
    let max_size = 200u32;
    let scale = (max_size as f32 / w as f32).min(max_size as f32 / h as f32).min(1.0);
    let new_w = (w as f32 * scale) as u32;
    let new_h = (h as f32 * scale) as u32;
    let thumbnail = img.thumbnail(new_w, new_h);
    
    let format = match output_format {
        "jpeg" | "jpg" => ImageFormat::Jpeg,
        "png" => ImageFormat::Png,
        "webp" => ImageFormat::WebP,
        "gif" => ImageFormat::Gif,
        _ => ImageFormat::WebP,
    };
    
    let mut output = Vec::new();
    thumbnail.write_to(&mut Cursor::new(&mut output), format)
        .map_err(|e| format!("{} 编码失败: {}", output_format.to_uppercase(), e))?;
    Ok(output)
}

/// 通用缩略图生成基准测试
#[allow(dead_code)]
pub fn generate_thumbnail_benchmark(image_data: &[u8], ext: &str) -> Result<Vec<u8>, String> {
    // 解码
    let img: DynamicImage = if ext == "jxl" {
        decode_jxl_for_benchmark(image_data)?
    } else if ext == "avif" {
        #[cfg(target_os = "windows")]
        {
            use crate::core::wic_decoder::{decode_image_from_memory_with_wic, wic_result_to_dynamic_image};
            decode_image_from_memory_with_wic(image_data)
                .and_then(|r| wic_result_to_dynamic_image(r))
                .or_else(|_| image::load_from_memory(image_data).map_err(|e| e.to_string()))?
        }
        #[cfg(not(target_os = "windows"))]
        {
            image::load_from_memory(image_data).map_err(|e| e.to_string())?
        }
    } else {
        image::load_from_memory(image_data).map_err(|e| e.to_string())?
    };
    
    // 缩放
    let (w, h) = img.dimensions();
    let max_size = 200u32;
    let scale = (max_size as f32 / w as f32).min(max_size as f32 / h as f32).min(1.0);
    let new_w = (w as f32 * scale) as u32;
    let new_h = (h as f32 * scale) as u32;
    let thumbnail = img.thumbnail(new_w, new_h);
    
    // 编码为 WebP
    let mut output = Vec::new();
    thumbnail.write_to(&mut Cursor::new(&mut output), ImageFormat::WebP)
        .map_err(|e| format!("WebP 编码失败: {}", e))?;
    
    Ok(output)
}

/// JXL 解码辅助函数
pub fn decode_jxl_for_benchmark(image_data: &[u8]) -> Result<image::DynamicImage, String> {
    use jxl_oxide::JxlImage;
    use std::io::Cursor;
    
    let mut reader = Cursor::new(image_data);
    let jxl_image = JxlImage::builder()
        .read(&mut reader)
        .map_err(|e| format!("JXL 解码失败: {}", e))?;
    
    let render = jxl_image.render_frame(0)
        .map_err(|e| format!("JXL 渲染失败: {}", e))?;
    
    let fb = render.image_all_channels();
    let width = fb.width() as u32;
    let height = fb.height() as u32;
    let channels = fb.channels();
    let float_buf = fb.buf();
    
    let rgba_data: Vec<u8> = float_buf
        .chunks(channels)
        .flat_map(|chunk| {
            vec![
                (chunk[0].clamp(0.0, 1.0) * 255.0) as u8,
                (chunk.get(1).copied().unwrap_or(chunk[0]).clamp(0.0, 1.0) * 255.0) as u8,
                (chunk.get(2).copied().unwrap_or(chunk[0]).clamp(0.0, 1.0) * 255.0) as u8,
                if channels > 3 { (chunk[3].clamp(0.0, 1.0) * 255.0) as u8 } else { 255 },
            ]
        })
        .collect();
    
    image::RgbaImage::from_raw(width, height, rgba_data)
        .map(image::DynamicImage::ImageRgba8)
        .ok_or_else(|| "创建图像失败".to_string())
}
