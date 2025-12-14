//! Image Decoder Pipeline Module
//! 统一图像解码管道 - 整合 WIC、image crate、jxl-oxide 等多个解码后端

mod types;
mod traits;
mod scaler;
mod unified;
pub mod backends;

pub use types::{DecodeBackend, DecodeError, DecodedImage, DecodeOptions};
pub use traits::ImageDecoder;
pub use unified::UnifiedDecoder;
pub use scaler::{scale_image, calculate_scaled_dimensions};
