//! JXL Decoder Backend
//! 使用 jxl-oxide 解码 JPEG XL 图像
//! Requirements 4.1, 4.2, 4.3, 4.4, 4.5

use crate::core::image_decoder::traits::ImageDecoder;
use crate::core::image_decoder::types::{DecodeBackend, DecodeError, DecodedImage};
use crate::core::image_decoder::scaler::scale_image;
use jxl_oxide::JxlImage;
use std::io::Cursor;

/// JXL 解码器
/// Requirements 4.1: 单一 JxlDecoder 实现处理所有 JXL 解码
pub struct JxlDecoder;

impl JxlDecoder {
    pub fn new() -> Self {
        Self
    }

    /// 内部解码实现
    fn decode_internal(data: &[u8]) -> Result<DecodedImage, DecodeError> {
        let mut reader = Cursor::new(data);
        let jxl_image = JxlImage::builder()
            .read(&mut reader)
            .map_err(|e| DecodeError::DecodeFailed {
                backend: DecodeBackend::JxlOxide,
                message: format!("JXL 解析失败: {e}"),
            })?;

        // Requirements 4.4: 处理动画 JXL，仅解码第一帧
        let render = jxl_image
            .render_frame(0)
            .map_err(|e| DecodeError::DecodeFailed {
                backend: DecodeBackend::JxlOxide,
                message: format!("JXL 渲染失败: {e}"),
            })?;

        let fb = render.image_all_channels();
        let width = fb.width() as u32;
        let height = fb.height() as u32;
        let channels = fb.channels();
        let float_buf = fb.buf();

        // Requirements 4.2, 4.3: 支持 grayscale/RGB/RGBA，转换 float (0.0-1.0) 到 u8 (0-255)
        let pixels = match channels {
            1 => {
                // Grayscale → RGBA
                float_buf
                    .iter()
                    .flat_map(|&v| {
                        let gray = (v.clamp(0.0, 1.0) * 255.0) as u8;
                        [gray, gray, gray, 255]
                    })
                    .collect()
            }
            3 => {
                // RGB → RGBA
                float_buf
                    .chunks(3)
                    .flat_map(|chunk| {
                        [
                            (chunk[0].clamp(0.0, 1.0) * 255.0) as u8,
                            (chunk[1].clamp(0.0, 1.0) * 255.0) as u8,
                            (chunk[2].clamp(0.0, 1.0) * 255.0) as u8,
                            255,
                        ]
                    })
                    .collect()
            }
            4 => {
                // RGBA
                float_buf
                    .chunks(4)
                    .flat_map(|chunk| {
                        [
                            (chunk[0].clamp(0.0, 1.0) * 255.0) as u8,
                            (chunk[1].clamp(0.0, 1.0) * 255.0) as u8,
                            (chunk[2].clamp(0.0, 1.0) * 255.0) as u8,
                            (chunk[3].clamp(0.0, 1.0) * 255.0) as u8,
                        ]
                    })
                    .collect()
            }
            _ => {
                // Requirements 4.5: 不支持的通道数返回描述性错误
                return Err(DecodeError::DecodeFailed {
                    backend: DecodeBackend::JxlOxide,
                    message: format!("不支持的通道数: {channels}"),
                });
            }
        };

        Ok(DecodedImage::new(width, height, pixels, DecodeBackend::JxlOxide))
    }
}

impl Default for JxlDecoder {
    fn default() -> Self {
        Self::new()
    }
}

impl ImageDecoder for JxlDecoder {
    fn decode(&self, data: &[u8]) -> Result<DecodedImage, DecodeError> {
        Self::decode_internal(data)
    }

    fn decode_with_scale(
        &self,
        data: &[u8],
        max_width: u32,
        max_height: u32,
    ) -> Result<DecodedImage, DecodeError> {
        let img = self.decode(data)?;
        scale_image(img, max_width, max_height)
    }

    fn get_dimensions(&self, data: &[u8]) -> Result<(u32, u32), DecodeError> {
        let mut reader = Cursor::new(data);
        let jxl_image = JxlImage::builder()
            .read(&mut reader)
            .map_err(|e| DecodeError::DimensionError(format!("JXL 解析失败: {e}")))?;

        let header = jxl_image.image_header();
        let width = header.size.width;
        let height = header.size.height;
        Ok((width, height))
    }

    fn supports_format(&self, extension: &str) -> bool {
        matches!(extension.to_lowercase().as_str(), "jxl")
    }

    fn name(&self) -> &'static str {
        "JxlDecoder"
    }
}
