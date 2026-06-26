//! Image Decoder Pipeline Module
//! 统一图像解码管道 - 整合 WIC、image crate、jxl-oxide 等多个解码后端

pub mod backends;
mod scaler;
mod traits;
mod types;
mod unified;

pub use scaler::{calculate_scaled_dimensions, scale_image};
pub use traits::ImageDecoder;
pub use types::{DecodeBackend, DecodeError, DecodeOptions, DecodedImage};
pub use unified::UnifiedDecoder;
