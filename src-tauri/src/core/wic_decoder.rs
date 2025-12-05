//! WIC (Windows Imaging Component) 图像解码器
//! 使用 Windows 原生 API 解码图像，支持 AVIF、JXL、WebP 等格式（需安装对应编解码器）
//! 
//! 注意：编码功能已移除，因为 PyO3 超分器直接返回 WebP 格式

#[cfg(target_os = "windows")]
use windows::{
    core::PCWSTR,
    Win32::{
        Foundation::GENERIC_READ,
        Graphics::Imaging::{
            CLSID_WICImagingFactory, IWICBitmapDecoder, IWICBitmapFrameDecode,
            IWICFormatConverter, IWICImagingFactory, IWICBitmapScaler,
            WICDecodeMetadataCacheOnDemand, WICBitmapDitherTypeNone,
            WICBitmapPaletteTypeCustom, GUID_WICPixelFormat32bppBGRA,
            WICBitmapInterpolationModeFant,
        },
        System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED},
    },
};

#[cfg(target_os = "windows")]
use std::ffi::OsStr;
#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;
#[cfg(target_os = "windows")]
use std::path::Path;

/// WIC 解码结果
pub struct WicDecodeResult {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>, // BGRA 格式
}

/// 使用 WIC 解码图像文件
#[cfg(target_os = "windows")]
pub fn decode_image_with_wic(file_path: &Path) -> Result<WicDecodeResult, String> {
    unsafe {
        // 初始化 COM
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        // 创建 WIC 工厂
        let factory: IWICImagingFactory = CoCreateInstance(
            &CLSID_WICImagingFactory,
            None,
            CLSCTX_INPROC_SERVER,
        )
        .map_err(|e| format!("创建 WIC 工厂失败: {:?}", e))?;

        // 将路径转换为宽字符
        let wide_path: Vec<u16> = OsStr::new(file_path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        // 创建解码器
        let decoder: IWICBitmapDecoder = factory
            .CreateDecoderFromFilename(
                PCWSTR(wide_path.as_ptr()),
                None,
                GENERIC_READ,
                WICDecodeMetadataCacheOnDemand,
            )
            .map_err(|e| format!("创建解码器失败: {:?}", e))?;

        // 获取第一帧
        let frame: IWICBitmapFrameDecode = decoder
            .GetFrame(0)
            .map_err(|e| format!("获取帧失败: {:?}", e))?;

        // 获取尺寸
        let mut width = 0u32;
        let mut height = 0u32;
        frame
            .GetSize(&mut width, &mut height)
            .map_err(|e| format!("获取尺寸失败: {:?}", e))?;

        // 创建格式转换器（转为 BGRA）
        let converter: IWICFormatConverter = factory
            .CreateFormatConverter()
            .map_err(|e| format!("创建格式转换器失败: {:?}", e))?;

        converter
            .Initialize(
                &frame,
                &GUID_WICPixelFormat32bppBGRA,
                WICBitmapDitherTypeNone,
                None,
                0.0,
                WICBitmapPaletteTypeCustom,
            )
            .map_err(|e| format!("初始化格式转换器失败: {:?}", e))?;

        // 分配像素缓冲区
        let stride = width * 4;
        let buffer_size = (stride * height) as usize;
        let mut pixels = vec![0u8; buffer_size];

        // 复制像素数据
        converter
            .CopyPixels(
                std::ptr::null(),
                stride,
                &mut pixels,
            )
            .map_err(|e| format!("复制像素失败: {:?}", e))?;

        Ok(WicDecodeResult {
            width,
            height,
            pixels,
        })
    }
}

/// 使用 WIC 从内存解码图像
#[cfg(target_os = "windows")]
pub fn decode_image_from_memory_with_wic(data: &[u8]) -> Result<WicDecodeResult, String> {
    use windows::Win32::Graphics::Imaging::IWICStream;
    use windows::Win32::System::Com::IStream;
    use windows::core::Interface;

    unsafe {
        // 初始化 COM
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        // 创建 WIC 工厂
        let factory: IWICImagingFactory = CoCreateInstance(
            &CLSID_WICImagingFactory,
            None,
            CLSCTX_INPROC_SERVER,
        )
        .map_err(|e| format!("创建 WIC 工厂失败: {:?}", e))?;

        // 创建 WIC 流
        let stream: IWICStream = factory
            .CreateStream()
            .map_err(|e| format!("创建流失败: {:?}", e))?;

        // 从内存初始化流
        stream
            .InitializeFromMemory(data)
            .map_err(|e| format!("初始化流失败: {:?}", e))?;

        // 转换为 IStream
        let istream: IStream = stream.cast()
            .map_err(|e| format!("转换流失败: {:?}", e))?;

        // 创建解码器
        let decoder: IWICBitmapDecoder = factory
            .CreateDecoderFromStream(
                &istream,
                std::ptr::null(),
                WICDecodeMetadataCacheOnDemand,
            )
            .map_err(|e| format!("创建解码器失败: {:?}", e))?;

        // 获取第一帧
        let frame: IWICBitmapFrameDecode = decoder
            .GetFrame(0)
            .map_err(|e| format!("获取帧失败: {:?}", e))?;

        // 获取尺寸
        let mut width = 0u32;
        let mut height = 0u32;
        frame
            .GetSize(&mut width, &mut height)
            .map_err(|e| format!("获取尺寸失败: {:?}", e))?;

        // 创建格式转换器（转为 BGRA）
        let converter: IWICFormatConverter = factory
            .CreateFormatConverter()
            .map_err(|e| format!("创建格式转换器失败: {:?}", e))?;

        converter
            .Initialize(
                &frame,
                &GUID_WICPixelFormat32bppBGRA,
                WICBitmapDitherTypeNone,
                None,
                0.0,
                WICBitmapPaletteTypeCustom,
            )
            .map_err(|e| format!("初始化格式转换器失败: {:?}", e))?;

        // 分配像素缓冲区
        let stride = width * 4;
        let buffer_size = (stride * height) as usize;
        let mut pixels = vec![0u8; buffer_size];

        // 复制像素数据
        converter
            .CopyPixels(
                std::ptr::null(),
                stride,
                &mut pixels,
            )
            .map_err(|e| format!("复制像素失败: {:?}", e))?;

        Ok(WicDecodeResult {
            width,
            height,
            pixels,
        })
    }
}

/// 使用 WIC 从内存解码图像并缩放到指定大小（高性能版本）
/// 使用 WIC 内置缩放器，避免解码到全分辨率再缩放
#[cfg(target_os = "windows")]
pub fn decode_and_scale_with_wic(data: &[u8], max_width: u32, max_height: u32) -> Result<WicDecodeResult, String> {
    use windows::Win32::Graphics::Imaging::IWICStream;
    use windows::Win32::System::Com::IStream;
    use windows::core::Interface;

    unsafe {
        // 初始化 COM
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        // 创建 WIC 工厂
        let factory: IWICImagingFactory = CoCreateInstance(
            &CLSID_WICImagingFactory,
            None,
            CLSCTX_INPROC_SERVER,
        )
        .map_err(|e| format!("创建 WIC 工厂失败: {:?}", e))?;

        // 创建 WIC 流
        let stream: IWICStream = factory
            .CreateStream()
            .map_err(|e| format!("创建流失败: {:?}", e))?;

        // 从内存初始化流
        stream
            .InitializeFromMemory(data)
            .map_err(|e| format!("初始化流失败: {:?}", e))?;

        // 转换为 IStream
        let istream: IStream = stream.cast()
            .map_err(|e| format!("转换流失败: {:?}", e))?;

        // 创建解码器
        let decoder: IWICBitmapDecoder = factory
            .CreateDecoderFromStream(
                &istream,
                std::ptr::null(),
                WICDecodeMetadataCacheOnDemand,
            )
            .map_err(|e| format!("创建解码器失败: {:?}", e))?;

        // 获取第一帧
        let frame: IWICBitmapFrameDecode = decoder
            .GetFrame(0)
            .map_err(|e| format!("获取帧失败: {:?}", e))?;

        // 获取原始尺寸
        let mut orig_width = 0u32;
        let mut orig_height = 0u32;
        frame
            .GetSize(&mut orig_width, &mut orig_height)
            .map_err(|e| format!("获取尺寸失败: {:?}", e))?;

        // 计算缩放后的尺寸（保持宽高比）
        let scale = (max_width as f32 / orig_width as f32)
            .min(max_height as f32 / orig_height as f32)
            .min(1.0);
        let new_width = ((orig_width as f32 * scale) as u32).max(1);
        let new_height = ((orig_height as f32 * scale) as u32).max(1);

        // 创建缩放器
        let scaler: IWICBitmapScaler = factory
            .CreateBitmapScaler()
            .map_err(|e| format!("创建缩放器失败: {:?}", e))?;

        // 初始化缩放器（使用 Fant 插值，快速且质量较好）
        scaler
            .Initialize(&frame, new_width, new_height, WICBitmapInterpolationModeFant)
            .map_err(|e| format!("初始化缩放器失败: {:?}", e))?;

        // 创建格式转换器（转为 BGRA）
        let converter: IWICFormatConverter = factory
            .CreateFormatConverter()
            .map_err(|e| format!("创建格式转换器失败: {:?}", e))?;

        converter
            .Initialize(
                &scaler,
                &GUID_WICPixelFormat32bppBGRA,
                WICBitmapDitherTypeNone,
                None,
                0.0,
                WICBitmapPaletteTypeCustom,
            )
            .map_err(|e| format!("初始化格式转换器失败: {:?}", e))?;

        // 分配像素缓冲区
        let stride = new_width * 4;
        let buffer_size = (stride * new_height) as usize;
        let mut pixels = vec![0u8; buffer_size];

        // 复制像素数据
        converter
            .CopyPixels(
                std::ptr::null(),
                stride,
                &mut pixels,
            )
            .map_err(|e| format!("复制像素失败: {:?}", e))?;

        Ok(WicDecodeResult {
            width: new_width,
            height: new_height,
            pixels,
        })
    }
}

#[cfg(not(target_os = "windows"))]
pub fn decode_and_scale_with_wic(_data: &[u8], _max_width: u32, _max_height: u32) -> Result<WicDecodeResult, String> {
    Err("WIC 仅在 Windows 上可用".to_string())
}

/// 将 BGRA 像素转换为 DynamicImage
#[cfg(target_os = "windows")]
pub fn wic_result_to_dynamic_image(result: WicDecodeResult) -> Result<image::DynamicImage, String> {
    // BGRA -> RGBA
    let mut rgba_pixels = result.pixels;
    for chunk in rgba_pixels.chunks_exact_mut(4) {
        chunk.swap(0, 2); // B <-> R
    }

    image::RgbaImage::from_raw(result.width, result.height, rgba_pixels)
        .map(image::DynamicImage::ImageRgba8)
        .ok_or_else(|| "无法创建图像".to_string())
}

/// 检查 WIC 是否支持指定格式
#[cfg(target_os = "windows")]
pub fn wic_supports_format(extension: &str) -> bool {
    // WIC 原生支持的格式
    let native_formats = ["jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "ico", "wdp", "hdp"];
    
    // 需要安装扩展的格式
    let extension_formats = ["avif", "heic", "heif", "webp", "jxl"];
    
    let ext = extension.to_lowercase();
    native_formats.contains(&ext.as_str()) || extension_formats.contains(&ext.as_str())
}

// 非 Windows 平台的存根实现
#[cfg(not(target_os = "windows"))]
pub fn decode_image_with_wic(_file_path: &std::path::Path) -> Result<WicDecodeResult, String> {
    Err("WIC 仅在 Windows 上可用".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn decode_image_from_memory_with_wic(_data: &[u8]) -> Result<WicDecodeResult, String> {
    Err("WIC 仅在 Windows 上可用".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn wic_result_to_dynamic_image(_result: WicDecodeResult) -> Result<image::DynamicImage, String> {
    Err("WIC 仅在 Windows 上可用".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn wic_supports_format(_extension: &str) -> bool {
    false
}

// ============================================================================
// WicDecoder 结构体 - 提供更方便的 API
// ============================================================================

/// WIC 解码器封装
pub struct WicDecoder;

impl WicDecoder {
    /// 获取图片尺寸（不解码像素数据，更轻量）
    #[cfg(target_os = "windows")]
    pub fn get_image_dimensions(file_path: &std::path::Path) -> Result<(u32, u32), String> {
        unsafe {
            // 初始化 COM
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

            // 创建 WIC 工厂
            let factory: IWICImagingFactory = CoCreateInstance(
                &CLSID_WICImagingFactory,
                None,
                CLSCTX_INPROC_SERVER,
            )
            .map_err(|e| format!("创建 WIC 工厂失败: {:?}", e))?;

            // 将路径转换为宽字符
            let wide_path: Vec<u16> = OsStr::new(file_path)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();

            // 创建解码器
            let decoder: IWICBitmapDecoder = factory
                .CreateDecoderFromFilename(
                    PCWSTR(wide_path.as_ptr()),
                    None,
                    GENERIC_READ,
                    WICDecodeMetadataCacheOnDemand,
                )
                .map_err(|e| format!("创建解码器失败: {:?}", e))?;

            // 获取第一帧
            let frame: IWICBitmapFrameDecode = decoder
                .GetFrame(0)
                .map_err(|e| format!("获取帧失败: {:?}", e))?;

            // 获取尺寸
            let mut width = 0u32;
            let mut height = 0u32;
            frame
                .GetSize(&mut width, &mut height)
                .map_err(|e| format!("获取尺寸失败: {:?}", e))?;

            Ok((width, height))
        }
    }

    /// 获取图片尺寸（从内存数据）
    #[cfg(target_os = "windows")]
    pub fn get_image_dimensions_from_memory(data: &[u8]) -> Result<(u32, u32), String> {
        use windows::Win32::Graphics::Imaging::IWICStream;
        use windows::Win32::System::Com::IStream;
        use windows::core::Interface;

        unsafe {
            // 初始化 COM
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

            // 创建 WIC 工厂
            let factory: IWICImagingFactory = CoCreateInstance(
                &CLSID_WICImagingFactory,
                None,
                CLSCTX_INPROC_SERVER,
            )
            .map_err(|e| format!("创建 WIC 工厂失败: {:?}", e))?;

            // 创建 WIC 流
            let stream: IWICStream = factory
                .CreateStream()
                .map_err(|e| format!("创建流失败: {:?}", e))?;

            // 从内存初始化流
            stream
                .InitializeFromMemory(data)
                .map_err(|e| format!("初始化流失败: {:?}", e))?;

            // 转换为 IStream
            let istream: IStream = stream.cast()
                .map_err(|e| format!("转换流失败: {:?}", e))?;

            // 创建解码器
            let decoder: IWICBitmapDecoder = factory
                .CreateDecoderFromStream(
                    &istream,
                    std::ptr::null(),
                    WICDecodeMetadataCacheOnDemand,
                )
                .map_err(|e| format!("创建解码器失败: {:?}", e))?;

            // 获取第一帧
            let frame: IWICBitmapFrameDecode = decoder
                .GetFrame(0)
                .map_err(|e| format!("获取帧失败: {:?}", e))?;

            // 获取尺寸
            let mut width = 0u32;
            let mut height = 0u32;
            frame
                .GetSize(&mut width, &mut height)
                .map_err(|e| format!("获取尺寸失败: {:?}", e))?;

            Ok((width, height))
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn get_image_dimensions(_file_path: &std::path::Path) -> Result<(u32, u32), String> {
        // 非 Windows 平台回退到 image crate
        use image::GenericImageView;
        let img = image::open(_file_path)
            .map_err(|e| format!("打开图片失败: {}", e))?;
        Ok(img.dimensions())
    }

    #[cfg(not(target_os = "windows"))]
    pub fn get_image_dimensions_from_memory(data: &[u8]) -> Result<(u32, u32), String> {
        use image::GenericImageView;
        let img = image::load_from_memory(data)
            .map_err(|e| format!("加载图片失败: {}", e))?;
        Ok(img.dimensions())
    }

    // 注意：编码功能已移除
    // PyO3 超分器直接返回 WebP 格式，不需要额外编码
}
