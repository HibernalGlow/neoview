//! Image Decoder Backends
//! 解码后端模块 - WIC、jxl-oxide、image crate

pub mod image_crate;
pub mod jxl;

#[cfg(target_os = "windows")]
pub mod wic;

pub use image_crate::ImageCrateDecoder;
pub use jxl::JxlDecoder;

#[cfg(target_os = "windows")]
pub use wic::WicDecoder;
