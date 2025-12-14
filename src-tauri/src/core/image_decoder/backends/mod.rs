//! Image Decoder Backends
//! 解码后端模块 - WIC、jxl-oxide、image crate

pub mod jxl;
pub mod image_crate;

#[cfg(target_os = "windows")]
pub mod wic;

pub use jxl::JxlDecoder;
pub use image_crate::ImageCrateDecoder;

#[cfg(target_os = "windows")]
pub use wic::WicDecoder;
