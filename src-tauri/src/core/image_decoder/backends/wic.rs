//! WIC Decoder Backend (Windows)
//! 使用 Windows Imaging Component 解码图像
//! Requirements 2.1, 3.1

use crate::core::image_decoder::traits::ImageDecoder;
use crate::core::image_decoder::types::{DecodeBackend, DecodeError, DecodedImage};
use windows::{
    core::Interface,
    Win32::{
        Graphics::Imaging::{
            CLSID_WICImagingFactory, IWICBitmapDecoder, IWICBitmapFrameDecode,
            IWICBitmapScaler, IWICFormatConverter, IWICImagingFactory, IWICStream,
            WICBitmapDitherTypeNone, WICBitmapInterpolationModeFant,
            WICBitmapPaletteTypeCustom, WICDecodeMetadataCacheOnDemand,
            GUID_WICPixelFormat32bppBGRA,
        },
        System::Com::{CoCreateInstance, CoInitializeEx, IStream, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED},
    },
};

/// WIC 解码器 (Windows 专用)
/// Requirements 2.1: Windows 上优先使用 WIC 进行硬件加速
pub struct WicDecoder;

impl WicDecoder {
    pub fn new() -> Self {
        Self
    }

    /// 从内存解码图像
    fn decode_from_memory(data: &[u8]) -> Result<DecodedImage, DecodeError> {
        unsafe {
            // 初始化 COM
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

            // 创建 WIC 工厂
            let factory: IWICImagingFactory = CoCreateInstance(
                &CLSID_WICImagingFactory,
                None,
                CLSCTX_INPROC_SERVER,
            )
            .map_err(|e| DecodeError::DecodeFailed {
                backend: DecodeBackend::Wic,
                message: format!("创建 WIC 工厂失败: {e:?}"),
            })?;

            // 创建 WIC 流
            let stream: IWICStream = factory
                .CreateStream()
                .map_err(|e| DecodeError::DecodeFailed {
                    backend: DecodeBackend::Wic,
                    message: format!("创建流失败: {e:?}"),
                })?;

            // 从内存初始化流
            stream
                .InitializeFromMemory(data)
                .map_err(|e| DecodeError::DecodeFailed {
                    backend: DecodeBackend::Wic,
                    message: format!("初始化流失败: {e:?}"),
                })?;

            // 转换为 IStream
            let istream: IStream = stream.cast().map_err(|e| DecodeError::DecodeFailed {
                backend: DecodeBackend::Wic,
                message: format!("转换流失败: {e:?}"),
            })?;

            // 创建解码器
            let decoder: IWICBitmapDecoder = factory
                .CreateDecoderFromStream(&istream, std::ptr::null(), WICDecodeMetadataCacheOnDemand)
                .map_err(|e| DecodeError::DecodeFailed {
                    backend: DecodeBackend::Wic,
                    message: format!("创建解码器失败: {e:?}"),
                })?;

            // 获取第一帧
            let frame: IWICBitmapFrameDecode = decoder.GetFrame(0).map_err(|e| DecodeError::DecodeFailed {
                backend: DecodeBackend::Wic,
                message: format!("获取帧失败: {e:?}"),
            })?;

            // 获取尺寸
            let mut width = 0u32;
            let mut height = 0u32;
            frame
                .GetSize(&raw mut width, &raw mut height)
                .map_err(|e| DecodeError::DecodeFailed {
                    backend: DecodeBackend::Wic,
                    message: format!("获取尺寸失败: {e:?}"),
                })?;

            // 创建格式转换器（转为 BGRA）
            let converter: IWICFormatConverter = factory
                .CreateFormatConverter()
                .map_err(|e| DecodeError::DecodeFailed {
                    backend: DecodeBackend::Wic,
                    message: format!("创建格式转换器失败: {e:?}"),
                })?;

            converter
                .Initialize(
                    &frame,
                    &GUID_WICPixelFormat32bppBGRA,
                    WICBitmapDitherTypeNone,
                    None,
                    0.0,
                    WICBitmapPaletteTypeCustom,
                )
                .map_err(|e| DecodeError::DecodeFailed {
                    backend: DecodeBackend::Wic,
                    message: format!("初始化格式转换器失败: {e:?}"),
                })?;

            // 分配像素缓冲区
            let stride = width * 4;
            let buffer_size = (stride * height) as usize;
            let mut pixels = vec![0u8; buffer_size];

            // 复制像素数据
            converter
                .CopyPixels(std::ptr::null(), stride, &mut pixels)
                .map_err(|e| DecodeError::DecodeFailed {
                    backend: DecodeBackend::Wic,
                    message: format!("复制像素失败: {e:?}"),
                })?;

            // BGRA → RGBA
            Ok(DecodedImage::from_bgra(width, height, pixels, DecodeBackend::Wic))
        }
    }

    /// 从内存解码并缩放图像
    /// Requirements 3.1: 使用 WIC IWICBitmapScaler 进行硬件加速缩放
    fn decode_and_scale(data: &[u8], max_width: u32, max_height: u32) -> Result<DecodedImage, DecodeError> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

            let factory: IWICImagingFactory = CoCreateInstance(
                &CLSID_WICImagingFactory,
                None,
                CLSCTX_INPROC_SERVER,
            )
            .map_err(|e| DecodeError::DecodeFailed {
                backend: DecodeBackend::Wic,
                message: format!("创建 WIC 工厂失败: {e:?}"),
            })?;

            let stream: IWICStream = factory.CreateStream().map_err(|e| DecodeError::DecodeFailed {
                backend: DecodeBackend::Wic,
                message: format!("创建流失败: {e:?}"),
            })?;

            stream.InitializeFromMemory(data).map_err(|e| DecodeError::DecodeFailed {
                backend: DecodeBackend::Wic,
                message: format!("初始化流失败: {e:?}"),
            })?;

            let istream: IStream = stream.cast().map_err(|e| DecodeError::DecodeFailed {
                backend: DecodeBackend::Wic,
                message: format!("转换流失败: {e:?}"),
            })?;

            let decoder: IWICBitmapDecoder = factory
                .CreateDecoderFromStream(&istream, std::ptr::null(), WICDecodeMetadataCacheOnDemand)
                .map_err(|e| DecodeError::DecodeFailed {
                    backend: DecodeBackend::Wic,
                    message: format!("创建解码器失败: {e:?}"),
                })?;

            let frame: IWICBitmapFrameDecode = decoder.GetFrame(0).map_err(|e| DecodeError::DecodeFailed {
                backend: DecodeBackend::Wic,
                message: format!("获取帧失败: {e:?}"),
            })?;

            let mut orig_width = 0u32;
            let mut orig_height = 0u32;
            frame
                .GetSize(&raw mut orig_width, &raw mut orig_height)
                .map_err(|e| DecodeError::DecodeFailed {
                    backend: DecodeBackend::Wic,
                    message: format!("获取尺寸失败: {e:?}"),
                })?;

            // 计算缩放后的尺寸（保持宽高比，不放大）
            let scale = (max_width as f64 / orig_width as f64)
                .min(max_height as f64 / orig_height as f64)
                .min(1.0);
            
            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            let new_width = ((orig_width as f64 * scale) as u32).max(1);
            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            let new_height = ((orig_height as f64 * scale) as u32).max(1);

            // 如果不需要缩放，直接解码
            if new_width == orig_width && new_height == orig_height {
                return Self::decode_from_memory(data);
            }

            // 创建缩放器
            let scaler: IWICBitmapScaler = factory.CreateBitmapScaler().map_err(|e| DecodeError::ScaleError(format!("创建缩放器失败: {e:?}")))?;

            // 初始化缩放器（使用 Fant 插值）
            scaler
                .Initialize(&frame, new_width, new_height, WICBitmapInterpolationModeFant)
                .map_err(|e| DecodeError::ScaleError(format!("初始化缩放器失败: {e:?}")))?;

            // 创建格式转换器
            let converter: IWICFormatConverter = factory.CreateFormatConverter().map_err(|e| DecodeError::DecodeFailed {
                backend: DecodeBackend::Wic,
                message: format!("创建格式转换器失败: {e:?}"),
            })?;

            converter
                .Initialize(
                    &scaler,
                    &GUID_WICPixelFormat32bppBGRA,
                    WICBitmapDitherTypeNone,
                    None,
                    0.0,
                    WICBitmapPaletteTypeCustom,
                )
                .map_err(|e| DecodeError::DecodeFailed {
                    backend: DecodeBackend::Wic,
                    message: format!("初始化格式转换器失败: {e:?}"),
                })?;

            let stride = new_width * 4;
            let buffer_size = (stride * new_height) as usize;
            let mut pixels = vec![0u8; buffer_size];

            converter
                .CopyPixels(std::ptr::null(), stride, &mut pixels)
                .map_err(|e| DecodeError::DecodeFailed {
                    backend: DecodeBackend::Wic,
                    message: format!("复制像素失败: {e:?}"),
                })?;

            Ok(DecodedImage::from_bgra(new_width, new_height, pixels, DecodeBackend::Wic))
        }
    }

    /// 获取图像尺寸（不解码像素）
    fn get_dimensions_internal(data: &[u8]) -> Result<(u32, u32), DecodeError> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

            let factory: IWICImagingFactory = CoCreateInstance(
                &CLSID_WICImagingFactory,
                None,
                CLSCTX_INPROC_SERVER,
            )
            .map_err(|e| DecodeError::DimensionError(format!("创建 WIC 工厂失败: {e:?}")))?;

            let stream: IWICStream = factory
                .CreateStream()
                .map_err(|e| DecodeError::DimensionError(format!("创建流失败: {e:?}")))?;

            stream
                .InitializeFromMemory(data)
                .map_err(|e| DecodeError::DimensionError(format!("初始化流失败: {e:?}")))?;

            let istream: IStream = stream
                .cast()
                .map_err(|e| DecodeError::DimensionError(format!("转换流失败: {e:?}")))?;

            let decoder: IWICBitmapDecoder = factory
                .CreateDecoderFromStream(&istream, std::ptr::null(), WICDecodeMetadataCacheOnDemand)
                .map_err(|e| DecodeError::DimensionError(format!("创建解码器失败: {e:?}")))?;

            let frame: IWICBitmapFrameDecode = decoder
                .GetFrame(0)
                .map_err(|e| DecodeError::DimensionError(format!("获取帧失败: {e:?}")))?;

            let mut width = 0u32;
            let mut height = 0u32;
            frame
                .GetSize(&raw mut width, &raw mut height)
                .map_err(|e| DecodeError::DimensionError(format!("获取尺寸失败: {e:?}")))?;

            Ok((width, height))
        }
    }
}

impl Default for WicDecoder {
    fn default() -> Self {
        Self::new()
    }
}

impl ImageDecoder for WicDecoder {
    fn decode(&self, data: &[u8]) -> Result<DecodedImage, DecodeError> {
        Self::decode_from_memory(data)
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
        Self::get_dimensions_internal(data)
    }

    fn supports_format(&self, extension: &str) -> bool {
        // WIC 原生支持的格式
        let native_formats = ["jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "ico", "wdp", "hdp"];
        // 需要安装扩展的格式
        let extension_formats = ["avif", "heic", "heif", "webp", "jxl"];
        
        let ext = extension.to_lowercase();
        native_formats.contains(&ext.as_str()) || extension_formats.contains(&ext.as_str())
    }

    fn name(&self) -> &'static str {
        "WicDecoder"
    }
}
