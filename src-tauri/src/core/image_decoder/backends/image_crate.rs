//! Image Crate Decoder Backend
//! 使用 image crate 作为通用解码后端
//! Requirements 2.3

use crate::core::image_decoder::traits::ImageDecoder;
use crate::core::image_decoder::types::{DecodeBackend, DecodeError, DecodedImage};
use image::{DynamicImage, GenericImageView};

/// Image Crate 解码器（通用回退）
/// Requirements 2.3: WIC 解码失败时回退到 image crate
pub struct ImageCrateDecoder;

impl ImageCrateDecoder {
    pub fn new() -> Self {
        Self
    }

    /// 从内存解码图像
    fn decode_internal(data: &[u8]) -> Result<DecodedImage, DecodeError> {
        let img = image::load_from_memory(data).map_err(|e| DecodeError::DecodeFailed {
            backend: DecodeBackend::ImageCrate,
            message: format!("图像解码失败: {e}"),
        })?;

        Self::dynamic_image_to_decoded(img)
    }

    /// 将 DynamicImage 转换为 DecodedImage
    fn dynamic_image_to_decoded(img: DynamicImage) -> Result<DecodedImage, DecodeError> {
        let (width, height) = img.dimensions();
        let rgba = img.to_rgba8();
        let pixels = rgba.into_raw();

        Ok(DecodedImage::new(width, height, pixels, DecodeBackend::ImageCrate))
    }

    /// 解码并缩放
    fn decode_and_scale(data: &[u8], max_width: u32, max_height: u32) -> Result<DecodedImage, DecodeError> {
        let img = image::load_from_memory(data).map_err(|e| DecodeError::DecodeFailed {
            backend: DecodeBackend::ImageCrate,
            message: format!("图像解码失败: {e}"),
        })?;

        let (orig_width, orig_height) = img.dimensions();

        // 计算缩放比例（保持宽高比，不放大）
        let scale = (max_width as f64 / orig_width as f64)
            .min(max_height as f64 / orig_height as f64)
            .min(1.0);

        // 如果不需要缩放
        if scale >= 1.0 {
            return Self::dynamic_image_to_decoded(img);
        }

        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let new_width = ((orig_width as f64 * scale) as u32).max(1);
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let new_height = ((orig_height as f64 * scale) as u32).max(1);

        // 使用 thumbnail 方法缩放（保持宽高比）
        let thumbnail = img.thumbnail(new_width, new_height);
        Self::dynamic_image_to_decoded(thumbnail)
    }
}

impl Default for ImageCrateDecoder {
    fn default() -> Self {
        Self::new()
    }
}

impl ImageDecoder for ImageCrateDecoder {
    fn decode(&self, data: &[u8]) -> Result<DecodedImage, DecodeError> {
        Self::decode_internal(data)
    }

    fn decode_with_scale(
        &self,
        data: &[u8],
        max_width: u32,
        max_height: u32,
    ) -> Result<DecodedImage, DecodeError> {
        Self::decode_and_scale(data, max_width, max_height)
    }

    fn get_dimensions(&self, data: &[u8]) -> Result<(u32, u32), DecodeError> {
        let img = image::load_from_memory(data).map_err(|e| {
            DecodeError::DimensionError(format!("图像解码失败: {e}"))
        })?;
        Ok(img.dimensions())
    }

    fn supports_format(&self, extension: &str) -> bool {
        // image crate 支持的格式
        let supported = [
            "png", "jpg", "jpeg", "gif", "bmp", "ico", "tiff", "tif",
            "webp", "avif", "pnm", "dds", "tga", "farbfeld", "qoi",
        ];
        supported.contains(&extension.to_lowercase().as_str())
    }

    fn name(&self) -> &'static str {
        "ImageCrateDecoder"
    }
}
