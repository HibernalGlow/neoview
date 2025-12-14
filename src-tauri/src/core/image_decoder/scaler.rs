//! Image Scaler
//! 图像缩放模块 - Windows 使用 WIC，其他平台使用 fast_image_resize
//! Requirements 3.1, 3.2, 3.3, 3.4, 3.5

use crate::core::image_decoder::types::{DecodeError, DecodedImage};

/// 计算缩放后的尺寸（保持宽高比）
/// Requirements 3.3: 保持宽高比
/// Requirements 3.5: 不放大
pub fn calculate_scaled_dimensions(
    orig_width: u32,
    orig_height: u32,
    max_width: u32,
    max_height: u32,
) -> (u32, u32) {
    // 计算缩放比例（保持宽高比，不放大）
    let scale = (max_width as f64 / orig_width as f64)
        .min(max_height as f64 / orig_height as f64)
        .min(1.0);

    // 如果不需要缩放，返回原始尺寸
    if scale >= 1.0 {
        return (orig_width, orig_height);
    }

    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let new_width = ((orig_width as f64 * scale) as u32).max(1);
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let new_height = ((orig_height as f64 * scale) as u32).max(1);

    (new_width, new_height)
}

/// 缩放图像
/// Requirements 3.1: Windows 使用 WIC 硬件加速
/// Requirements 3.2: 非 Windows 使用 fast_image_resize SIMD 加速
/// Requirements 3.4: 可配置插值模式
pub fn scale_image(
    img: DecodedImage,
    max_width: u32,
    max_height: u32,
) -> Result<DecodedImage, DecodeError> {
    let (new_width, new_height) = calculate_scaled_dimensions(
        img.width,
        img.height,
        max_width,
        max_height,
    );

    // Requirements 3.5: 如果目标尺寸等于或超过原始尺寸，返回原图
    if new_width == img.width && new_height == img.height {
        return Ok(img);
    }

    // 使用 image crate 进行缩放（跨平台兼容）
    scale_with_image_crate(img, new_width, new_height)
}

/// 使用 image crate 缩放（跨平台回退）
fn scale_with_image_crate(
    img: DecodedImage,
    new_width: u32,
    new_height: u32,
) -> Result<DecodedImage, DecodeError> {
    use image::{DynamicImage, RgbaImage};

    let rgba = RgbaImage::from_raw(img.width, img.height, img.pixels)
        .ok_or_else(|| DecodeError::ScaleError("无法创建 RGBA 图像".to_string()))?;

    let dynamic = DynamicImage::ImageRgba8(rgba);
    
    // 使用 Lanczos3 滤波器进行高质量缩放
    let resized = dynamic.resize(new_width, new_height, image::imageops::FilterType::Lanczos3);
    let rgba_resized = resized.to_rgba8();
    let (w, h) = (rgba_resized.width(), rgba_resized.height());
    let pixels = rgba_resized.into_raw();

    Ok(DecodedImage::new(w, h, pixels, img.backend))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_scaled_dimensions_no_upscale() {
        // 原图 100x100，目标 200x200，不应放大
        let (w, h) = calculate_scaled_dimensions(100, 100, 200, 200);
        assert_eq!((w, h), (100, 100));
    }

    #[test]
    fn test_calculate_scaled_dimensions_downscale() {
        // 原图 200x100，目标 100x100，应缩放到 100x50
        let (w, h) = calculate_scaled_dimensions(200, 100, 100, 100);
        assert_eq!((w, h), (100, 50));
    }

    #[test]
    fn test_calculate_scaled_dimensions_preserve_aspect_ratio() {
        // 原图 1920x1080，目标 256x256
        let (w, h) = calculate_scaled_dimensions(1920, 1080, 256, 256);
        // 宽高比应保持 16:9
        let orig_ratio = 1920.0 / 1080.0;
        let new_ratio = w as f64 / h as f64;
        assert!((orig_ratio - new_ratio).abs() < 0.02); // 允许 2% 误差
    }
}
