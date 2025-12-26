//! 图像基准测试命令
//! 包含图像解码和加载模式测试的 Tauri 命令

use std::path::PathBuf;
use std::time::Instant;
use tauri::command;

use super::types::{BenchmarkResult, BenchmarkReport, LoadModeTestResult, BitmapLoadResult};
use super::thumbnail_benchmark::generate_thumbnail_with_image_crate;

#[cfg(target_os = "windows")]
use super::thumbnail_benchmark::{generate_thumbnail_with_wic, generate_thumbnail_with_format};

/// 运行图像解码基准测试
#[command]
pub async fn run_image_benchmark(file_path: String) -> Result<BenchmarkReport, String> {
    use std::fs;
    use image::GenericImageView;
    
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

/// 测试图片加载模式对比
#[command]
pub async fn test_load_modes(file_path: String) -> Result<Vec<LoadModeTestResult>, String> {
    use std::fs;
    use crate::core::image_loader_mode::{ImageLoadMode, ImageLoadResult, load_image_unified};
    
    let path = PathBuf::from(&file_path);
    let format = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    
    let data = fs::read(&path).map_err(|e| format!("读取文件失败: {}", e))?;
    let input_size = data.len();
    
    let mut results = Vec::new();
    
    // 测试 Raw 模式
    {
        let start = Instant::now();
        let result = load_image_unified(data.clone(), &format, ImageLoadMode::Raw);
        let decode_ms = start.elapsed().as_secs_f64() * 1000.0;
        
        match result {
            Ok(ImageLoadResult::Raw { data: out_data, .. }) => {
                results.push(LoadModeTestResult {
                    mode: "Raw".to_string(),
                    format: format.clone(),
                    input_size,
                    output_size: out_data.len(),
                    decode_ms,
                    width: None,
                    height: None,
                    success: true,
                    error: None,
                });
            }
            Ok(ImageLoadResult::Bitmap { .. }) => {
                results.push(LoadModeTestResult {
                    mode: "Raw".to_string(),
                    format: format.clone(),
                    input_size,
                    output_size: 0,
                    decode_ms,
                    width: None,
                    height: None,
                    success: false,
                    error: Some("意外返回 Bitmap".to_string()),
                });
            }
            Err(e) => {
                results.push(LoadModeTestResult {
                    mode: "Raw".to_string(),
                    format: format.clone(),
                    input_size,
                    output_size: 0,
                    decode_ms,
                    width: None,
                    height: None,
                    success: false,
                    error: Some(e),
                });
            }
        }
    }
    
    // 测试 Bitmap 模式
    {
        let start = Instant::now();
        let result = load_image_unified(data.clone(), &format, ImageLoadMode::Bitmap);
        let decode_ms = start.elapsed().as_secs_f64() * 1000.0;
        
        match result {
            Ok(ImageLoadResult::Bitmap { data: out_data, width, height }) => {
                results.push(LoadModeTestResult {
                    mode: "Bitmap".to_string(),
                    format: format.clone(),
                    input_size,
                    output_size: out_data.len(),
                    decode_ms,
                    width: Some(width),
                    height: Some(height),
                    success: true,
                    error: None,
                });
            }
            Ok(ImageLoadResult::Raw { .. }) => {
                results.push(LoadModeTestResult {
                    mode: "Bitmap".to_string(),
                    format: format.clone(),
                    input_size,
                    output_size: 0,
                    decode_ms,
                    width: None,
                    height: None,
                    success: false,
                    error: Some("意外返回 Raw".to_string()),
                });
            }
            Err(e) => {
                results.push(LoadModeTestResult {
                    mode: "Bitmap".to_string(),
                    format: format.clone(),
                    input_size,
                    output_size: 0,
                    decode_ms,
                    width: None,
                    height: None,
                    success: false,
                    error: Some(e),
                });
            }
        }
    }
    
    // 测试 Bitmap 缩放模式 (模拟屏幕尺寸)
    {
        use crate::core::image_loader_mode::load_image_bitmap_scaled;
        
        let start = Instant::now();
        let result = load_image_bitmap_scaled(&data, 1920, 1080);
        let decode_ms = start.elapsed().as_secs_f64() * 1000.0;
        
        match result {
            Ok(ImageLoadResult::Bitmap { data: out_data, width, height }) => {
                results.push(LoadModeTestResult {
                    mode: "Bitmap (1920×1080)".to_string(),
                    format: format.clone(),
                    input_size,
                    output_size: out_data.len(),
                    decode_ms,
                    width: Some(width),
                    height: Some(height),
                    success: true,
                    error: None,
                });
            }
            _ => {}
        }
    }
    
    Ok(results)
}

/// 加载图片为 Bitmap（用于前端渲染测试）
#[command]
pub async fn load_image_as_bitmap(file_path: String) -> Result<BitmapLoadResult, String> {
    use std::fs;
    use crate::core::image_loader_mode::{load_image_unified, ImageLoadMode, ImageLoadResult};
    
    let path = PathBuf::from(&file_path);
    let format = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    
    let data = fs::read(&path).map_err(|e| format!("读取文件失败: {}", e))?;
    
    let start = Instant::now();
    let result = load_image_unified(data, &format, ImageLoadMode::Bitmap)?;
    let decode_ms = start.elapsed().as_secs_f64() * 1000.0;
    
    match result {
        ImageLoadResult::Bitmap { data, width, height } => {
            Ok(BitmapLoadResult {
                data,
                width,
                height,
                decode_ms,
            })
        }
        _ => Err("意外的返回类型".to_string()),
    }
}

/// 加载图片为 Bitmap（带缩放）
#[command]
pub async fn load_image_as_bitmap_scaled(
    file_path: String,
    max_width: u32,
    max_height: u32,
) -> Result<BitmapLoadResult, String> {
    use std::fs;
    use crate::core::image_loader_mode::{load_image_bitmap_scaled, ImageLoadResult};
    
    let data = fs::read(&file_path).map_err(|e| format!("读取文件失败: {}", e))?;
    
    let start = Instant::now();
    let result = load_image_bitmap_scaled(&data, max_width, max_height)?;
    let decode_ms = start.elapsed().as_secs_f64() * 1000.0;
    
    match result {
        ImageLoadResult::Bitmap { data, width, height } => {
            Ok(BitmapLoadResult {
                data,
                width,
                height,
                decode_ms,
            })
        }
        _ => Err("意外的返回类型".to_string()),
    }
}
