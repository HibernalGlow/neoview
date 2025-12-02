//! 基准测试命令
//! 用于测试不同图像解码方法的性能

use std::path::PathBuf;
use std::time::Instant;
use tauri::command;
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct BenchmarkResult {
    pub method: String,
    pub format: String,
    pub duration_ms: f64,
    pub success: bool,
    pub error: Option<String>,
    pub image_size: Option<(u32, u32)>,
    pub output_size: Option<usize>,  // 输出文件大小（字节）
}

#[derive(Serialize)]
pub struct BenchmarkReport {
    pub file_path: String,
    pub file_size: u64,
    pub results: Vec<BenchmarkResult>,
}

/// 运行图像解码基准测试
#[command]
pub async fn run_image_benchmark(file_path: String) -> Result<BenchmarkReport, String> {
    use std::fs;
    use image::{DynamicImage, GenericImageView};
    
    let path = PathBuf::from(&file_path);
    let file_size = fs::metadata(&path)
        .map(|m| m.len())
        .unwrap_or(0);
    
    let ext = path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    
    let image_data = fs::read(&path)
        .map_err(|e| format!("读取文件失败: {}", e))?;
    
    let mut results = Vec::new();
    
    // 1. 测试 image crate
    {
        let start = Instant::now();
        let result = image::load_from_memory(&image_data);
        let duration = start.elapsed().as_secs_f64() * 1000.0;
        
        results.push(BenchmarkResult {
            method: "image crate".to_string(),
            format: ext.clone(),
            duration_ms: duration,
            success: result.is_ok(),
            error: result.as_ref().err().map(|e| e.to_string()),
            image_size: result.ok().map(|img| img.dimensions()),
            output_size: None,
        });
    }
    
    // 2. 测试 WIC (仅 Windows)
    #[cfg(target_os = "windows")]
    {
        use crate::core::wic_decoder::{decode_image_from_memory_with_wic, wic_result_to_dynamic_image};
        
        let start = Instant::now();
        let result = decode_image_from_memory_with_wic(&image_data)
            .and_then(|r| wic_result_to_dynamic_image(r));
        let duration = start.elapsed().as_secs_f64() * 1000.0;
        
        results.push(BenchmarkResult {
            method: "WIC (Windows)".to_string(),
            format: ext.clone(),
            duration_ms: duration,
            success: result.is_ok(),
            error: result.as_ref().err().cloned(),
            image_size: result.ok().map(|img| img.dimensions()),
            output_size: None,
        });
    }
    
    // 3. 测试 jxl-oxide (仅 JXL)
    if ext == "jxl" {
        use jxl_oxide::JxlImage;
        use std::io::Cursor;
        
        let start = Instant::now();
        let result = (|| -> Result<(u32, u32), String> {
            let mut reader = Cursor::new(&image_data);
            let jxl_image = JxlImage::builder()
                .read(&mut reader)
                .map_err(|e| format!("JXL 解码失败: {}", e))?;
            
            let render = jxl_image.render_frame(0)
                .map_err(|e| format!("JXL 渲染失败: {}", e))?;
            
            let fb = render.image_all_channels();
            Ok((fb.width() as u32, fb.height() as u32))
        })();
        let duration = start.elapsed().as_secs_f64() * 1000.0;
        
        results.push(BenchmarkResult {
            method: "jxl-oxide".to_string(),
            format: ext.clone(),
            duration_ms: duration,
            success: result.is_ok(),
            error: result.as_ref().err().cloned(),
            image_size: result.ok(),
            output_size: None,
        });
    }
    
    // 4. 测试完整缩略图流程（image crate 解码 + 缩放 + WebP 编码）
    {
        let start = Instant::now();
        let result = generate_thumbnail_with_image_crate(&image_data);
        let duration = start.elapsed().as_secs_f64() * 1000.0;
        
        let output_size = result.as_ref().ok().map(|v| v.len());
        results.push(BenchmarkResult {
            method: "thumbnail/image→webp".to_string(),
            format: ext.clone(),
            duration_ms: duration,
            success: result.is_ok(),
            error: result.as_ref().err().cloned(),
            image_size: None,
            output_size,
        });
    }
    
    // 5. 测试完整缩略图流程（WIC 解码 + 缩放 + WebP 编码）
    #[cfg(target_os = "windows")]
    {
        let start = Instant::now();
        let result = generate_thumbnail_with_wic(&image_data);
        let duration = start.elapsed().as_secs_f64() * 1000.0;
        
        let output_size = result.as_ref().ok().map(|v| v.len());
        results.push(BenchmarkResult {
            method: "thumbnail/WIC→webp".to_string(),
            format: ext.clone(),
            duration_ms: duration,
            success: result.is_ok(),
            error: result.as_ref().err().cloned(),
            image_size: None,
            output_size,
        });
    }
    
    // 6. 测试不同输出格式（WIC 解码 + 不同编码格式）
    #[cfg(target_os = "windows")]
    {
        // JPG 输出
        let start = Instant::now();
        let result = generate_thumbnail_with_format(&image_data, "jpeg");
        let duration = start.elapsed().as_secs_f64() * 1000.0;
        let output_size = result.as_ref().ok().map(|v| v.len());
        results.push(BenchmarkResult {
            method: "thumbnail/WIC→jpg".to_string(),
            format: ext.clone(),
            duration_ms: duration,
            success: result.is_ok(),
            error: result.as_ref().err().cloned(),
            image_size: None,
            output_size,
        });
        
        // PNG 输出
        let start = Instant::now();
        let result = generate_thumbnail_with_format(&image_data, "png");
        let duration = start.elapsed().as_secs_f64() * 1000.0;
        let output_size = result.as_ref().ok().map(|v| v.len());
        results.push(BenchmarkResult {
            method: "thumbnail/WIC→png".to_string(),
            format: ext.clone(),
            duration_ms: duration,
            success: result.is_ok(),
            error: result.as_ref().err().cloned(),
            image_size: None,
            output_size,
        });
    }
    
    Ok(BenchmarkReport {
        file_path,
        file_size,
        results,
    })
}

fn generate_thumbnail_benchmark(image_data: &[u8], ext: &str) -> Result<Vec<u8>, String> {
    use image::{DynamicImage, GenericImageView, ImageFormat};
    use std::io::Cursor;
    
    // 解码
    let img: DynamicImage = if ext == "jxl" {
        decode_jxl_for_benchmark(image_data)?
    } else if ext == "avif" {
        #[cfg(target_os = "windows")]
        {
            use crate::core::wic_decoder::{decode_image_from_memory_with_wic, wic_result_to_dynamic_image};
            decode_image_from_memory_with_wic(image_data)
                .and_then(|r| wic_result_to_dynamic_image(r))
                .or_else(|_| image::load_from_memory(image_data).map_err(|e| e.to_string()))?
        }
        #[cfg(not(target_os = "windows"))]
        {
            image::load_from_memory(image_data).map_err(|e| e.to_string())?
        }
    } else {
        image::load_from_memory(image_data).map_err(|e| e.to_string())?
    };
    
    // 缩放
    let (w, h) = img.dimensions();
    let max_size = 200u32;
    let scale = (max_size as f32 / w as f32).min(max_size as f32 / h as f32).min(1.0);
    let new_w = (w as f32 * scale) as u32;
    let new_h = (h as f32 * scale) as u32;
    let thumbnail = img.thumbnail(new_w, new_h);
    
    // 编码为 WebP
    let mut output = Vec::new();
    thumbnail.write_to(&mut Cursor::new(&mut output), ImageFormat::WebP)
        .map_err(|e| format!("WebP 编码失败: {}", e))?;
    
    Ok(output)
}

/// 使用 image crate 解码 + 缩放 + WebP 编码
fn generate_thumbnail_with_image_crate(image_data: &[u8]) -> Result<Vec<u8>, String> {
    use image::{GenericImageView, ImageFormat};
    use std::io::Cursor;
    
    let img = image::load_from_memory(image_data).map_err(|e| e.to_string())?;
    let (w, h) = img.dimensions();
    let max_size = 200u32;
    let scale = (max_size as f32 / w as f32).min(max_size as f32 / h as f32).min(1.0);
    let new_w = (w as f32 * scale) as u32;
    let new_h = (h as f32 * scale) as u32;
    let thumbnail = img.thumbnail(new_w, new_h);
    
    let mut output = Vec::new();
    thumbnail.write_to(&mut Cursor::new(&mut output), ImageFormat::WebP)
        .map_err(|e| format!("WebP 编码失败: {}", e))?;
    Ok(output)
}

/// 使用 WIC 解码 + 缩放 + WebP 编码
#[cfg(target_os = "windows")]
fn generate_thumbnail_with_wic(image_data: &[u8]) -> Result<Vec<u8>, String> {
    use crate::core::wic_decoder::{decode_image_from_memory_with_wic, wic_result_to_dynamic_image};
    use image::{GenericImageView, ImageFormat};
    use std::io::Cursor;
    
    let result = decode_image_from_memory_with_wic(image_data)?;
    let img = wic_result_to_dynamic_image(result)?;
    
    let (w, h) = img.dimensions();
    let max_size = 200u32;
    let scale = (max_size as f32 / w as f32).min(max_size as f32 / h as f32).min(1.0);
    let new_w = (w as f32 * scale) as u32;
    let new_h = (h as f32 * scale) as u32;
    let thumbnail = img.thumbnail(new_w, new_h);
    
    let mut output = Vec::new();
    thumbnail.write_to(&mut Cursor::new(&mut output), ImageFormat::WebP)
        .map_err(|e| format!("WebP 编码失败: {}", e))?;
    Ok(output)
}

/// 使用 WIC 解码 + 缩放 + 指定格式编码
#[cfg(target_os = "windows")]
fn generate_thumbnail_with_format(image_data: &[u8], output_format: &str) -> Result<Vec<u8>, String> {
    use crate::core::wic_decoder::{decode_image_from_memory_with_wic, wic_result_to_dynamic_image};
    use image::{GenericImageView, ImageFormat};
    use std::io::Cursor;
    
    let result = decode_image_from_memory_with_wic(image_data)?;
    let img = wic_result_to_dynamic_image(result)?;
    
    let (w, h) = img.dimensions();
    let max_size = 200u32;
    let scale = (max_size as f32 / w as f32).min(max_size as f32 / h as f32).min(1.0);
    let new_w = (w as f32 * scale) as u32;
    let new_h = (h as f32 * scale) as u32;
    let thumbnail = img.thumbnail(new_w, new_h);
    
    let format = match output_format {
        "jpeg" | "jpg" => ImageFormat::Jpeg,
        "png" => ImageFormat::Png,
        "webp" => ImageFormat::WebP,
        "gif" => ImageFormat::Gif,
        _ => ImageFormat::WebP,
    };
    
    let mut output = Vec::new();
    thumbnail.write_to(&mut Cursor::new(&mut output), format)
        .map_err(|e| format!("{} 编码失败: {}", output_format.to_uppercase(), e))?;
    Ok(output)
}

fn decode_jxl_for_benchmark(image_data: &[u8]) -> Result<image::DynamicImage, String> {
    use jxl_oxide::JxlImage;
    use std::io::Cursor;
    
    let mut reader = Cursor::new(image_data);
    let jxl_image = JxlImage::builder()
        .read(&mut reader)
        .map_err(|e| format!("JXL 解码失败: {}", e))?;
    
    let render = jxl_image.render_frame(0)
        .map_err(|e| format!("JXL 渲染失败: {}", e))?;
    
    let fb = render.image_all_channels();
    let width = fb.width() as u32;
    let height = fb.height() as u32;
    let channels = fb.channels();
    let float_buf = fb.buf();
    
    let rgba_data: Vec<u8> = float_buf
        .chunks(channels)
        .flat_map(|chunk| {
            vec![
                (chunk[0].clamp(0.0, 1.0) * 255.0) as u8,
                (chunk.get(1).copied().unwrap_or(chunk[0]).clamp(0.0, 1.0) * 255.0) as u8,
                (chunk.get(2).copied().unwrap_or(chunk[0]).clamp(0.0, 1.0) * 255.0) as u8,
                if channels > 3 { (chunk[3].clamp(0.0, 1.0) * 255.0) as u8 } else { 255 },
            ]
        })
        .collect();
    
    image::RgbaImage::from_raw(width, height, rgba_data)
        .map(image::DynamicImage::ImageRgba8)
        .ok_or_else(|| "创建图像失败".to_string())
}

/// 批量测试多个文件
#[command]
pub async fn run_batch_benchmark(file_paths: Vec<String>) -> Result<Vec<BenchmarkReport>, String> {
    let mut reports = Vec::new();
    
    for path in file_paths {
        match run_image_benchmark(path).await {
            Ok(report) => reports.push(report),
            Err(e) => eprintln!("基准测试失败: {}", e),
        }
    }
    
    Ok(reports)
}
