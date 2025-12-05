//! WIC (Windows Imaging Component) 图像解码器和编码器
//! 使用 Windows 原生 API 解码/编码图像，支持 AVIF、JXL、WebP 等格式（需安装对应编解码器）

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
            WICBitmapInterpolationModeFant, IWICBitmapEncoder, IWICBitmapFrameEncode,
            GUID_ContainerFormatWebp, GUID_ContainerFormatPng,
            WICBitmapEncoderNoCache,
        },
        System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED},
        Storage::{CreateStreamOnHGlobal, STGC_DEFAULT},
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

    /// 将 BGRA 像素数据编码为 WebP 并保存到文件
    #[cfg(target_os = "windows")]
    pub fn encode_to_webp_file(
        pixels: &[u8],
        width: u32,
        height: u32,
        output_path: &std::path::Path,
    ) -> Result<(), String> {
        use windows::Win32::Graphics::Imaging::IWICStream;
        use windows::Win32::System::Com::STGM_WRITE;
        use windows::Win32::System::Com::STGM_CREATE;

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

            // 将路径转换为宽字符
            let wide_path: Vec<u16> = OsStr::new(output_path)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();

            // 从文件初始化流（写入模式）
            stream
                .InitializeFromFilename(PCWSTR(wide_path.as_ptr()), STGM_WRITE.0 | STGM_CREATE.0)
                .map_err(|e| format!("初始化流失败: {:?}", e))?;

            // 尝试创建 WebP 编码器，失败则回退到 PNG
            let encoder_result: Result<IWICBitmapEncoder, _> = factory.CreateEncoder(
                &GUID_ContainerFormatWebp,
                std::ptr::null(),
            );

            let encoder = match encoder_result {
                Ok(enc) => enc,
                Err(_) => {
                    // WebP 编码器不可用，回退到 PNG
                    println!("⚠️ WebP 编码器不可用，回退到 PNG");
                    factory
                        .CreateEncoder(&GUID_ContainerFormatPng, std::ptr::null())
                        .map_err(|e| format!("创建 PNG 编码器失败: {:?}", e))?
                }
            };

            // 初始化编码器
            encoder
                .Initialize(&stream, WICBitmapEncoderNoCache)
                .map_err(|e| format!("初始化编码器失败: {:?}", e))?;

            // 创建帧
            let mut frame: Option<IWICBitmapFrameEncode> = None;
            let mut props = None;
            encoder
                .CreateNewFrame(&mut frame, &mut props)
                .map_err(|e| format!("创建帧失败: {:?}", e))?;

            let frame = frame.ok_or("帧创建失败")?;

            // 初始化帧
            frame
                .Initialize(props.as_ref())
                .map_err(|e| format!("初始化帧失败: {:?}", e))?;

            // 设置尺寸
            frame
                .SetSize(width, height)
                .map_err(|e| format!("设置尺寸失败: {:?}", e))?;

            // 设置像素格式
            let mut pixel_format = GUID_WICPixelFormat32bppBGRA;
            frame
                .SetPixelFormat(&mut pixel_format)
                .map_err(|e| format!("设置像素格式失败: {:?}", e))?;

            // 写入像素数据
            let stride = width * 4;
            frame
                .WritePixels(height, stride, pixels)
                .map_err(|e| format!("写入像素失败: {:?}", e))?;

            // 提交帧
            frame
                .Commit()
                .map_err(|e| format!("提交帧失败: {:?}", e))?;

            // 提交编码器
            encoder
                .Commit()
                .map_err(|e| format!("提交编码器失败: {:?}", e))?;

            Ok(())
        }
    }

    /// 将 BGRA 像素数据编码为 WebP 字节
    #[cfg(target_os = "windows")]
    pub fn encode_to_webp_bytes(
        pixels: &[u8],
        width: u32,
        height: u32,
    ) -> Result<Vec<u8>, String> {
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

            // 创建内存流
            let memory_stream: IStream = CreateStreamOnHGlobal(None, true)
                .map_err(|e| format!("创建内存流失败: {:?}", e))?;

            // 尝试创建 WebP 编码器，失败则回退到 PNG
            let encoder_result: Result<IWICBitmapEncoder, _> = factory.CreateEncoder(
                &GUID_ContainerFormatWebp,
                std::ptr::null(),
            );

            let encoder = match encoder_result {
                Ok(enc) => enc,
                Err(_) => {
                    // WebP 编码器不可用，回退到 PNG
                    factory
                        .CreateEncoder(&GUID_ContainerFormatPng, std::ptr::null())
                        .map_err(|e| format!("创建 PNG 编码器失败: {:?}", e))?
                }
            };

            // 初始化编码器
            encoder
                .Initialize(&memory_stream, WICBitmapEncoderNoCache)
                .map_err(|e| format!("初始化编码器失败: {:?}", e))?;

            // 创建帧
            let mut frame: Option<IWICBitmapFrameEncode> = None;
            let mut props = None;
            encoder
                .CreateNewFrame(&mut frame, &mut props)
                .map_err(|e| format!("创建帧失败: {:?}", e))?;

            let frame = frame.ok_or("帧创建失败")?;

            // 初始化帧
            frame
                .Initialize(props.as_ref())
                .map_err(|e| format!("初始化帧失败: {:?}", e))?;

            // 设置尺寸
            frame
                .SetSize(width, height)
                .map_err(|e| format!("设置尺寸失败: {:?}", e))?;

            // 设置像素格式
            let mut pixel_format = GUID_WICPixelFormat32bppBGRA;
            frame
                .SetPixelFormat(&mut pixel_format)
                .map_err(|e| format!("设置像素格式失败: {:?}", e))?;

            // 写入像素数据
            let stride = width * 4;
            frame
                .WritePixels(height, stride, pixels)
                .map_err(|e| format!("写入像素失败: {:?}", e))?;

            // 提交帧
            frame
                .Commit()
                .map_err(|e| format!("提交帧失败: {:?}", e))?;

            // 提交编码器
            encoder
                .Commit()
                .map_err(|e| format!("提交编码器失败: {:?}", e))?;

            // 获取流大小
            use windows::Win32::System::Com::{STREAM_SEEK_END, STREAM_SEEK_SET};
            let mut size = 0u64;
            memory_stream
                .Seek(0, STREAM_SEEK_END, Some(&mut size))
                .map_err(|e| format!("获取流大小失败: {:?}", e))?;

            // 回到开头
            memory_stream
                .Seek(0, STREAM_SEEK_SET, None)
                .map_err(|e| format!("重置流位置失败: {:?}", e))?;

            // 读取数据
            let mut buffer = vec![0u8; size as usize];
            let mut bytes_read = 0u32;
            memory_stream
                .Read(
                    buffer.as_mut_ptr() as *mut _,
                    size as u32,
                    Some(&mut bytes_read),
                )
                .map_err(|e| format!("读取流数据失败: {:?}", e))?;

            buffer.truncate(bytes_read as usize);
            Ok(buffer)
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn encode_to_webp_file(
        pixels: &[u8],
        width: u32,
        height: u32,
        output_path: &std::path::Path,
    ) -> Result<(), String> {
        // 非 Windows 使用 image crate
        use image::{ImageBuffer, Rgba};

        // BGRA -> RGBA
        let mut rgba_pixels = pixels.to_vec();
        for chunk in rgba_pixels.chunks_exact_mut(4) {
            chunk.swap(0, 2);
        }

        let img: ImageBuffer<Rgba<u8>, _> =
            ImageBuffer::from_raw(width, height, rgba_pixels)
                .ok_or("创建图像失败")?;

        img.save(output_path)
            .map_err(|e| format!("保存图片失败: {}", e))
    }

    #[cfg(not(target_os = "windows"))]
    pub fn encode_to_webp_bytes(
        pixels: &[u8],
        width: u32,
        height: u32,
    ) -> Result<Vec<u8>, String> {
        use image::{ImageBuffer, Rgba, ImageOutputFormat};
        use std::io::Cursor;

        // BGRA -> RGBA
        let mut rgba_pixels = pixels.to_vec();
        for chunk in rgba_pixels.chunks_exact_mut(4) {
            chunk.swap(0, 2);
        }

        let img: ImageBuffer<Rgba<u8>, _> =
            ImageBuffer::from_raw(width, height, rgba_pixels)
                .ok_or("创建图像失败")?;

        let mut buffer = Cursor::new(Vec::new());
        img.write_to(&mut buffer, ImageOutputFormat::Png)
            .map_err(|e| format!("编码失败: {}", e))?;

        Ok(buffer.into_inner())
    }
}
