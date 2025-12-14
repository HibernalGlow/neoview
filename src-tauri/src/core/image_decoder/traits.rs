//! Image Decoder Trait
//! 统一图像解码器 trait 定义

use crate::core::image_decoder::types::{DecodeError, DecodedImage};

/// 统一图像解码器 trait
/// Requirements 1.1, 1.2, 1.3, 1.4
pub trait ImageDecoder: Send + Sync {
    /// 解码图像数据
    /// Requirements 1.1: 接受图像数据字节，返回 DecodedImage 结果
    fn decode(&self, data: &[u8]) -> Result<DecodedImage, DecodeError>;

    /// 解码并缩放图像
    /// Requirements 1.2: 接受图像数据字节和目标尺寸，返回缩放后的 DecodedImage
    fn decode_with_scale(
        &self,
        data: &[u8],
        max_width: u32,
        max_height: u32,
    ) -> Result<DecodedImage, DecodeError>;

    /// 仅获取图像尺寸（不完整解码）
    /// Requirements 1.3: 返回图像尺寸而不进行完整解码
    fn get_dimensions(&self, data: &[u8]) -> Result<(u32, u32), DecodeError>;

    /// 检查是否支持指定格式
    /// Requirements 1.4: 检查给定格式扩展名是否支持
    fn supports_format(&self, extension: &str) -> bool;

    /// 获取解码器名称
    fn name(&self) -> &'static str;
}
