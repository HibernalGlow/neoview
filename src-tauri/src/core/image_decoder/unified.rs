//! Unified Decoder
//! 统一解码器 - 自动选择最优后端
//! Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 6.1, 6.2, 6.4

use crate::core::image_decoder::backends::{ImageCrateDecoder, JxlDecoder};
use crate::core::image_decoder::traits::ImageDecoder;
use crate::core::image_decoder::types::{DecodeBackend, DecodeError, DecodedImage};
use std::panic::{catch_unwind, AssertUnwindSafe};

#[cfg(target_os = "windows")]
use crate::core::image_decoder::backends::WicDecoder;

/// 统一解码器 - 自动选择最优后端
pub struct UnifiedDecoder {
    /// 格式提示（可选）
    format_hint: Option<String>,
}

impl UnifiedDecoder {
    pub fn new() -> Self {
        Self { format_hint: None }
    }

    /// 带格式提示创建
    pub fn with_format(format: &str) -> Self {
        Self {
            format_hint: Some(format.to_lowercase()),
        }
    }

    /// 选择最优后端
    /// Requirements 2.5: 返回给定格式和平台的最优 DecodeBackend
    pub fn select_backend(&self, format: Option<&str>) -> DecodeBackend {
        let ext = format
            .or(self.format_hint.as_deref())
            .map(|s| s.to_lowercase());

        match ext.as_deref() {
            // Requirements 2.2: JXL 格式使用 jxl-oxide 作为主后端
            Some("jxl") => DecodeBackend::JxlOxide,
            
            // Requirements 2.1: Windows 上优先使用 WIC
            #[cfg(target_os = "windows")]
            Some(ext) if WicDecoder::new().supports_format(ext) => DecodeBackend::Wic,
            
            // 其他情况使用 image crate
            _ => DecodeBackend::ImageCrate,
        }
    }

    /// Panic 安全解码
    /// Requirements 6.1, 6.2, 6.4: 使用 catch_unwind 捕获 panic
    pub fn decode_safe(&self, data: &[u8]) -> Result<DecodedImage, DecodeError> {
        let format = self.format_hint.clone();
        
        catch_unwind(AssertUnwindSafe(|| {
            self.decode_internal(data, format.as_deref())
        }))
        .map_err(|e| {
            let msg = if let Some(s) = e.downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = e.downcast_ref::<String>() {
                s.clone()
            } else {
                "未知 panic".to_string()
            };
            // Requirements 6.3: 记录 panic 信息
            eprintln!("⚠️ 解码时发生 panic: {msg}");
            DecodeError::Panic(msg)
        })?
    }

    /// 内部解码实现
    fn decode_internal(&self, data: &[u8], format: Option<&str>) -> Result<DecodedImage, DecodeError> {
        let backend = self.select_backend(format);

        match backend {
            DecodeBackend::JxlOxide => {
                let decoder = JxlDecoder::new();
                decoder.decode(data).or_else(|_| {
                    // Requirements 2.4: jxl-oxide 失败时尝试 WIC 回退 (Windows 24H2+)
                    #[cfg(target_os = "windows")]
                    {
                        WicDecoder::new().decode(data)
                    }
                    #[cfg(not(target_os = "windows"))]
                    {
                        Err(DecodeError::DecodeFailed {
                            backend: DecodeBackend::JxlOxide,
                            message: "JXL 解码失败".to_string(),
                        })
                    }
                })
            }
            #[cfg(target_os = "windows")]
            DecodeBackend::Wic => {
                let decoder = WicDecoder::new();
                decoder.decode(data).or_else(|_| {
                    // Requirements 2.3: WIC 失败时回退到 image crate
                    ImageCrateDecoder::new().decode(data)
                })
            }
            DecodeBackend::ImageCrate => {
                ImageCrateDecoder::new().decode(data)
            }
            #[cfg(not(target_os = "windows"))]
            DecodeBackend::Wic => {
                // 非 Windows 平台不支持 WIC
                ImageCrateDecoder::new().decode(data)
            }
        }
    }

    /// 内部解码并缩放实现
    fn decode_with_scale_internal(
        &self,
        data: &[u8],
        max_width: u32,
        max_height: u32,
        format: Option<&str>,
    ) -> Result<DecodedImage, DecodeError> {
        let backend = self.select_backend(format);

        match backend {
            DecodeBackend::JxlOxide => {
                let decoder = JxlDecoder::new();
                decoder.decode_with_scale(data, max_width, max_height).or_else(|_| {
                    #[cfg(target_os = "windows")]
                    {
                        WicDecoder::new().decode_with_scale(data, max_width, max_height)
                    }
                    #[cfg(not(target_os = "windows"))]
                    {
                        Err(DecodeError::DecodeFailed {
                            backend: DecodeBackend::JxlOxide,
                            message: "JXL 解码失败".to_string(),
                        })
                    }
                })
            }
            #[cfg(target_os = "windows")]
            DecodeBackend::Wic => {
                let decoder = WicDecoder::new();
                decoder.decode_with_scale(data, max_width, max_height).or_else(|_| {
                    ImageCrateDecoder::new().decode_with_scale(data, max_width, max_height)
                })
            }
            DecodeBackend::ImageCrate => {
                ImageCrateDecoder::new().decode_with_scale(data, max_width, max_height)
            }
            #[cfg(not(target_os = "windows"))]
            DecodeBackend::Wic => {
                ImageCrateDecoder::new().decode_with_scale(data, max_width, max_height)
            }
        }
    }
}

impl Default for UnifiedDecoder {
    fn default() -> Self {
        Self::new()
    }
}

impl ImageDecoder for UnifiedDecoder {
    fn decode(&self, data: &[u8]) -> Result<DecodedImage, DecodeError> {
        self.decode_safe(data)
    }

    fn decode_with_scale(
        &self,
        data: &[u8],
        max_width: u32,
        max_height: u32,
    ) -> Result<DecodedImage, DecodeError> {
        let format = self.format_hint.clone();
        
        catch_unwind(AssertUnwindSafe(|| {
            self.decode_with_scale_internal(data, max_width, max_height, format.as_deref())
        }))
        .map_err(|e| {
            let msg = if let Some(s) = e.downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = e.downcast_ref::<String>() {
                s.clone()
            } else {
                "未知 panic".to_string()
            };
            eprintln!("⚠️ 解码缩放时发生 panic: {msg}");
            DecodeError::Panic(msg)
        })?
    }

    fn get_dimensions(&self, data: &[u8]) -> Result<(u32, u32), DecodeError> {
        let backend = self.select_backend(self.format_hint.as_deref());

        match backend {
            DecodeBackend::JxlOxide => JxlDecoder::new().get_dimensions(data),
            #[cfg(target_os = "windows")]
            DecodeBackend::Wic => WicDecoder::new().get_dimensions(data),
            DecodeBackend::ImageCrate => ImageCrateDecoder::new().get_dimensions(data),
            #[cfg(not(target_os = "windows"))]
            DecodeBackend::Wic => ImageCrateDecoder::new().get_dimensions(data),
        }
    }

    fn supports_format(&self, extension: &str) -> bool {
        let ext = extension.to_lowercase();
        
        // JXL 支持
        if ext == "jxl" {
            return true;
        }
        
        // WIC 支持 (Windows)
        #[cfg(target_os = "windows")]
        if WicDecoder::new().supports_format(&ext) {
            return true;
        }
        
        // image crate 支持
        ImageCrateDecoder::new().supports_format(&ext)
    }

    fn name(&self) -> &'static str {
        "UnifiedDecoder"
    }
}
