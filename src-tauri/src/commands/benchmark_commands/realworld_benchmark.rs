//! 真实场景基准测试命令
//! 包含真实场景模拟和转码测试的 Tauri 命令

use std::path::PathBuf;
use std::time::Instant;
use tauri::command;

use super::types::{RealWorldTestResult, TranscodeBenchmarkResult, TranscodeBenchmarkReport};

/// 真实场景测试：模拟虚拟列表的可见区域缩略图加载
#[command]
pub async fn run_realworld_benchmark(
    folder_path: String,
    viewport_size: usize,
    app: tauri::AppHandle,
) -> Result<RealWorldTestResult, String> {
    use walkdir::WalkDir;
    use tauri::Manager;
    use crate::core::thumbnail_generator::{ThumbnailGenerator, ThumbnailGeneratorConfig};
    use crate::core::thumbnail_db::ThumbnailDb;
    use std::sync::Arc;
    
    let path = PathBuf::from(&folder_path);
    
    // 收集文件夹中的图片和压缩包
    let mut files: Vec<PathBuf> = Vec::new();
    let image_exts = ["jpg", "jpeg", "png", "webp", "avif", "jxl", "gif", "bmp"];
    let archive_exts = ["zip", "cbz", "rar", "7z", "cb7", "cbr"];
    
    // 递归收集所有文件
    for entry in WalkDir::new(&path).into_iter().filter_map(|e| e.ok()) {
        let file_path = entry.path();
        if file_path.is_file() {
            if let Some(ext) = file_path.extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();
                if image_exts.contains(&ext_lower.as_str()) || archive_exts.contains(&ext_lower.as_str()) {
                    files.push(file_path.to_path_buf());
                }
            }
        }
    }
    
    if files.is_empty() {
        return Err("文件夹中没有找到图片或压缩包".to_string());
    }
    
    // 按文件名排序（模拟真实场景）
    files.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
    
    // 只取前 viewport_size 个文件（模拟可见区域）
    let visible_files: Vec<_> = files.into_iter().take(viewport_size).collect();
    let total_files = visible_files.len();
    
    // 初始化缩略图生成器
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    let db_path = app_data_dir.join("thumbnails.db");
    let db = ThumbnailDb::new(db_path);
    
    let config = ThumbnailGeneratorConfig {
        max_width: 200,
        max_height: 200,
        thread_pool_size: 4,
        archive_concurrency: 2,
    };
    
    let generator = ThumbnailGenerator::new(Arc::new(db), config);
    
    // 开始计时
    let start = Instant::now();
    let cached_count = 0;
    let mut generated_count = 0;
    let mut failed_count = 0;
    
    for file_path in &visible_files {
        let path_str = file_path.to_string_lossy().to_string();
        let ext = file_path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        
        let is_archive = archive_exts.contains(&ext.as_str());
        
        let result = if is_archive {
            generator.generate_archive_thumbnail(&path_str)
        } else {
            generator.generate_file_thumbnail(&path_str)
        };
        
        match result {
            Ok(_) => {
                // 检查是否是缓存命中（简单假设：非常快就是缓存）
                // 实际上应该从生成器获取这个信息
                generated_count += 1;
            }
            Err(_) => {
                failed_count += 1;
            }
        }
    }
    
    let total_time_ms = start.elapsed().as_secs_f64() * 1000.0;
    let avg_time_ms = if total_files > 0 { total_time_ms / total_files as f64 } else { 0.0 };
    let throughput = if total_time_ms > 0.0 { (total_files as f64 / total_time_ms) * 1000.0 } else { 0.0 };
    
    Ok(RealWorldTestResult {
        viewport_size,
        total_files,
        total_time_ms,
        avg_time_ms,
        cached_count,
        generated_count,
        failed_count,
        throughput,
    })
}

/// 运行超分预处理转码 Benchmark
/// 对比 WIC 转码 vs 原有方法（jxl-oxide/ffmpeg）
#[command]
pub async fn run_transcode_benchmark(file_path: String) -> Result<TranscodeBenchmarkReport, String> {
    use std::fs;
    
    let path = std::path::PathBuf::from(&file_path);
    let file_size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    let image_data = fs::read(&path).map_err(|e| format!("读取文件失败: {}", e))?;
    
    // 检测格式
    let detected_format = detect_image_format(&image_data);
    let mut results = Vec::new();
    
    // 只对 JXL/AVIF 进行测试
    if detected_format == "jxl" || detected_format == "avif" {
        
        // 方法 1: WIC 转码到 PNG
        #[cfg(target_os = "windows")]
        {
            let result = benchmark_wic_transcode(&image_data, "png");
            results.push(result);
        }
        
        // 方法 2: WIC 转码到 JPEG
        #[cfg(target_os = "windows")]
        {
            let result = benchmark_wic_transcode(&image_data, "jpeg");
            results.push(result);
        }
        
        // 方法 3: 原有方法 (jxl-oxide / image crate)
        if detected_format == "jxl" {
            let result = benchmark_jxl_oxide_transcode(&image_data);
            results.push(result);
        }
        
        // 方法 4: 原有方法 (image crate for AVIF)
        if detected_format == "avif" {
            let result = benchmark_image_crate_transcode(&image_data, "avif");
            results.push(result);
        }
    } else {
        // 非 JXL/AVIF，直接透传测试
        results.push(TranscodeBenchmarkResult {
            method: "直接透传".to_string(),
            input_format: detected_format.clone(),
            output_format: detected_format.clone(),
            decode_ms: 0.0,
            encode_ms: 0.0,
            total_ms: 0.0,
            input_size: image_data.len(),
            output_size: image_data.len(),
            image_size: None,
            success: true,
            error: None,
        });
    }
    
    Ok(TranscodeBenchmarkReport {
        file_path,
        file_size,
        detected_format,
        results,
    })
}

/// 检测图像格式
fn detect_image_format(data: &[u8]) -> String {
    // JXL
    if data.len() >= 2 && data[0] == 0xFF && data[1] == 0x0A {
        return "jxl".to_string();
    }
    if data.len() >= 12 && data[0..4] == [0x00, 0x00, 0x00, 0x0C] && &data[4..8] == b"JXL " {
        return "jxl".to_string();
    }
    // AVIF/HEIC
    if data.len() >= 12 {
        let marker = &data[4..12];
        if marker == b"ftypavif" || marker == b"ftypavis" || marker == b"ftypheic" {
            return "avif".to_string();
        }
    }
    // WebP
    if data.len() >= 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        return "webp".to_string();
    }
    // PNG
    if data.len() >= 8 && data[0..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
        return "png".to_string();
    }
    // JPEG
    if data.len() >= 2 && data[0] == 0xFF && data[1] == 0xD8 {
        return "jpeg".to_string();
    }
    "unknown".to_string()
}

/// WIC 转码基准测试
#[cfg(target_os = "windows")]
fn benchmark_wic_transcode(image_data: &[u8], output_format: &str) -> TranscodeBenchmarkResult {
    use crate::core::wic_decoder::decode_image_from_memory_with_wic;
    use std::time::Instant;
    
    let total_start = Instant::now();
    
    // 解码
    let decode_start = Instant::now();
    let decode_result = decode_image_from_memory_with_wic(image_data);
    let decode_ms = decode_start.elapsed().as_secs_f64() * 1000.0;
    
    match decode_result {
        Ok(wic_result) => {
            let width = wic_result.width;
            let height = wic_result.height;
            let mut bgra_pixels = wic_result.pixels;
            
            // BGRA -> RGBA
            for chunk in bgra_pixels.chunks_exact_mut(4) {
                chunk.swap(0, 2);
            }
            
            // 编码
            let encode_start = Instant::now();
            let encode_result = encode_rgba_to_format(&bgra_pixels, width, height, output_format);
            let encode_ms = encode_start.elapsed().as_secs_f64() * 1000.0;
            let total_ms = total_start.elapsed().as_secs_f64() * 1000.0;
            
            match encode_result {
                Ok(output) => TranscodeBenchmarkResult {
                    method: format!("WIC → {}", output_format.to_uppercase()),
                    input_format: "auto".to_string(),
                    output_format: output_format.to_string(),
                    decode_ms,
                    encode_ms,
                    total_ms,
                    input_size: image_data.len(),
                    output_size: output.len(),
                    image_size: Some((width, height)),
                    success: true,
                    error: None,
                },
                Err(e) => TranscodeBenchmarkResult {
                    method: format!("WIC → {}", output_format.to_uppercase()),
                    input_format: "auto".to_string(),
                    output_format: output_format.to_string(),
                    decode_ms,
                    encode_ms,
                    total_ms,
                    input_size: image_data.len(),
                    output_size: 0,
                    image_size: Some((width, height)),
                    success: false,
                    error: Some(e),
                },
            }
        }
        Err(e) => TranscodeBenchmarkResult {
            method: format!("WIC → {}", output_format.to_uppercase()),
            input_format: "auto".to_string(),
            output_format: output_format.to_string(),
            decode_ms,
            encode_ms: 0.0,
            total_ms: total_start.elapsed().as_secs_f64() * 1000.0,
            input_size: image_data.len(),
            output_size: 0,
            image_size: None,
            success: false,
            error: Some(e),
        },
    }
}

/// jxl-oxide 转码基准测试
fn benchmark_jxl_oxide_transcode(image_data: &[u8]) -> TranscodeBenchmarkResult {
    use jxl_oxide::JxlImage;
    use std::io::Cursor;
    use std::time::Instant;
    
    let total_start = Instant::now();
    let decode_start = Instant::now();
    
    let decode_result = (|| -> Result<(u32, u32, Vec<u8>), String> {
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
        
        // 转换为 RGBA
        let rgba: Vec<u8> = if channels >= 4 {
            float_buf.chunks(channels)
                .flat_map(|c| vec![
                    (c[0].clamp(0.0, 1.0) * 255.0) as u8,
                    (c[1].clamp(0.0, 1.0) * 255.0) as u8,
                    (c[2].clamp(0.0, 1.0) * 255.0) as u8,
                    (c.get(3).copied().unwrap_or(1.0).clamp(0.0, 1.0) * 255.0) as u8,
                ])
                .collect()
        } else if channels == 3 {
            float_buf.chunks(3)
                .flat_map(|c| vec![
                    (c[0].clamp(0.0, 1.0) * 255.0) as u8,
                    (c[1].clamp(0.0, 1.0) * 255.0) as u8,
                    (c[2].clamp(0.0, 1.0) * 255.0) as u8,
                    255u8,
                ])
                .collect()
        } else {
            return Err("不支持的通道数".to_string());
        };
        
        Ok((width, height, rgba))
    })();
    
    let decode_ms = decode_start.elapsed().as_secs_f64() * 1000.0;
    
    match decode_result {
        Ok((width, height, rgba)) => {
            let encode_start = Instant::now();
            let encode_result = encode_rgba_to_format(&rgba, width, height, "png");
            let encode_ms = encode_start.elapsed().as_secs_f64() * 1000.0;
            let total_ms = total_start.elapsed().as_secs_f64() * 1000.0;
            
            match encode_result {
                Ok(output) => TranscodeBenchmarkResult {
                    method: "jxl-oxide → PNG".to_string(),
                    input_format: "jxl".to_string(),
                    output_format: "png".to_string(),
                    decode_ms,
                    encode_ms,
                    total_ms,
                    input_size: image_data.len(),
                    output_size: output.len(),
                    image_size: Some((width, height)),
                    success: true,
                    error: None,
                },
                Err(e) => TranscodeBenchmarkResult {
                    method: "jxl-oxide → PNG".to_string(),
                    input_format: "jxl".to_string(),
                    output_format: "png".to_string(),
                    decode_ms,
                    encode_ms,
                    total_ms,
                    input_size: image_data.len(),
                    output_size: 0,
                    image_size: Some((width, height)),
                    success: false,
                    error: Some(e),
                },
            }
        }
        Err(e) => TranscodeBenchmarkResult {
            method: "jxl-oxide → PNG".to_string(),
            input_format: "jxl".to_string(),
            output_format: "png".to_string(),
            decode_ms,
            encode_ms: 0.0,
            total_ms: total_start.elapsed().as_secs_f64() * 1000.0,
            input_size: image_data.len(),
            output_size: 0,
            image_size: None,
            success: false,
            error: Some(e),
        },
    }
}

/// image crate 转码基准测试
fn benchmark_image_crate_transcode(image_data: &[u8], format: &str) -> TranscodeBenchmarkResult {
    use image::GenericImageView;
    use std::time::Instant;
    
    let total_start = Instant::now();
    let decode_start = Instant::now();
    
    let decode_result = image::load_from_memory(image_data);
    let decode_ms = decode_start.elapsed().as_secs_f64() * 1000.0;
    
    match decode_result {
        Ok(img) => {
            let (width, height) = img.dimensions();
            let rgba = img.to_rgba8();
            
            let encode_start = Instant::now();
            let encode_result = encode_rgba_to_format(rgba.as_raw(), width, height, "png");
            let encode_ms = encode_start.elapsed().as_secs_f64() * 1000.0;
            let total_ms = total_start.elapsed().as_secs_f64() * 1000.0;
            
            match encode_result {
                Ok(output) => TranscodeBenchmarkResult {
                    method: format!("image crate ({}) → PNG", format),
                    input_format: format.to_string(),
                    output_format: "png".to_string(),
                    decode_ms,
                    encode_ms,
                    total_ms,
                    input_size: image_data.len(),
                    output_size: output.len(),
                    image_size: Some((width, height)),
                    success: true,
                    error: None,
                },
                Err(e) => TranscodeBenchmarkResult {
                    method: format!("image crate ({}) → PNG", format),
                    input_format: format.to_string(),
                    output_format: "png".to_string(),
                    decode_ms,
                    encode_ms,
                    total_ms,
                    input_size: image_data.len(),
                    output_size: 0,
                    image_size: Some((width, height)),
                    success: false,
                    error: Some(e),
                },
            }
        }
        Err(e) => TranscodeBenchmarkResult {
            method: format!("image crate ({}) → PNG", format),
            input_format: format.to_string(),
            output_format: "png".to_string(),
            decode_ms,
            encode_ms: 0.0,
            total_ms: total_start.elapsed().as_secs_f64() * 1000.0,
            input_size: image_data.len(),
            output_size: 0,
            image_size: None,
            success: false,
            error: Some(e.to_string()),
        },
    }
}

/// RGBA 编码为指定格式
fn encode_rgba_to_format(rgba: &[u8], width: u32, height: u32, format: &str) -> Result<Vec<u8>, String> {
    use image::{RgbaImage, ImageEncoder};
    
    let img = RgbaImage::from_raw(width, height, rgba.to_vec())
        .ok_or("创建图像失败")?;
    
    let mut output = Vec::new();
    
    match format {
        "png" => {
            use image::codecs::png::PngEncoder;
            let encoder = PngEncoder::new(&mut output);
            encoder.write_image(&img, width, height, image::ExtendedColorType::Rgba8)
                .map_err(|e| format!("PNG 编码失败: {}", e))?;
        }
        "jpeg" | "jpg" => {
            use image::codecs::jpeg::JpegEncoder;
            // 需要转换为 RGB
            let rgb: Vec<u8> = rgba.chunks(4).flat_map(|c| vec![c[0], c[1], c[2]]).collect();
            let mut encoder = JpegEncoder::new_with_quality(&mut output, 85);
            encoder.encode(&rgb, width, height, image::ExtendedColorType::Rgb8)
                .map_err(|e| format!("JPEG 编码失败: {}", e))?;
        }
        _ => return Err(format!("不支持的输出格式: {}", format)),
    }
    
    Ok(output)
}
