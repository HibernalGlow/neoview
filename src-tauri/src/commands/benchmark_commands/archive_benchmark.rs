//! 压缩包基准测试命令
//! 包含压缩包扫描和缩略图提取测试的 Tauri 命令

use std::path::PathBuf;
use std::time::Instant;
use tauri::command;

use super::types::{
    BenchmarkResult, BenchmarkReport, ArchiveScanResult, DetailedBenchmarkResult,
};
use super::thumbnail_benchmark::generate_thumbnail_with_image_crate;

#[cfg(target_os = "windows")]
use super::thumbnail_benchmark::{generate_thumbnail_with_wic, generate_thumbnail_with_wic_fast};

/// 扫描文件夹中的压缩包数量（递归）
#[command]
pub async fn scan_archive_folder(folder_path: String) -> Result<ArchiveScanResult, String> {
    use walkdir::WalkDir;
    
    let path = PathBuf::from(&folder_path);
    let mut archives: Vec<PathBuf> = Vec::new();
    
    // 递归查找所有压缩包
    for entry in WalkDir::new(&path).into_iter().filter_map(|e| e.ok()) {
        let file_path = entry.path();
        if file_path.is_file() {
            if let Some(ext) = file_path.extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();
                if ["zip", "cbz", "rar", "7z", "cb7", "cbr"].contains(&ext_lower.as_str()) {
                    archives.push(file_path.to_path_buf());
                }
            }
        }
    }
    
    Ok(ArchiveScanResult {
        total_count: archives.len(),
        folder_path,
    })
}

/// 详细分步对比测试（比较 WIC 内置缩放 vs 传统方法）
/// 支持压缩包：从压缩包中提取第一张图片进行测试
#[command]
pub async fn run_detailed_benchmark(archive_path: String) -> Result<Vec<DetailedBenchmarkResult>, String> {
    use std::fs;
    use std::io::Read;
    use zip::ZipArchive;
    use image::{GenericImageView, ImageFormat};
    use std::io::Cursor;
    
    let path = PathBuf::from(&archive_path);
    let is_archive = path.extension()
        .and_then(|e| e.to_str())
        .map(|e| ["zip", "cbz", "rar", "7z", "cb7", "cbr"].contains(&e.to_lowercase().as_str()))
        .unwrap_or(false);
    
    let (image_data, ext, extract_ms, _image_name) = if is_archive {
        // 从压缩包提取第一张图片
        let start_extract = Instant::now();
        let file = fs::File::open(&path).map_err(|e| format!("打开压缩包失败: {}", e))?;
        let mut archive = ZipArchive::new(file).map_err(|e| format!("解析压缩包失败: {}", e))?;
        
        let image_exts = ["jpg", "jpeg", "png", "webp", "avif", "jxl", "gif", "bmp"];
        let mut first_image: Option<(String, Vec<u8>)> = None;
        
        for i in 0..archive.len() {
            if let Ok(mut entry) = archive.by_index(i) {
                let name = entry.name().to_lowercase();
                if image_exts.iter().any(|ext| name.ends_with(ext)) {
                    let mut data = Vec::new();
                    if entry.read_to_end(&mut data).is_ok() {
                        first_image = Some((entry.name().to_string(), data));
                        break;
                    }
                }
            }
        }
        
        let (name, data) = first_image.ok_or("压缩包中没有找到图片")?;
        let extract_ms = start_extract.elapsed().as_secs_f64() * 1000.0;
        let ext = name.split('.').last().unwrap_or("").to_lowercase();
        (data, ext, extract_ms, name)
    } else {
        // 直接读取图像文件
        let start_read = Instant::now();
        let data = fs::read(&path).map_err(|e| format!("读取文件失败: {}", e))?;
        let read_ms = start_read.elapsed().as_secs_f64() * 1000.0;
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        (data, ext, read_ms, name)
    };
    
    let input_size = image_data.len();
    
    let mut results = Vec::new();
    
    // 方法 1: WIC 全尺寸解码 + image crate 缩放
    #[cfg(target_os = "windows")]
    {
        use crate::core::wic_decoder::{decode_image_from_memory_with_wic, wic_result_to_dynamic_image};
        
        let start_total = Instant::now();
        
        // 解码
        let start_decode = Instant::now();
        let decode_result = decode_image_from_memory_with_wic(&image_data);
        let decode_ms = start_decode.elapsed().as_secs_f64() * 1000.0;
        
        if let Ok(wic_result) = decode_result {
            let orig_dims = (wic_result.width, wic_result.height);
            
            // 转换为 DynamicImage
            let start_convert = Instant::now();
            let img = wic_result_to_dynamic_image(wic_result);
            let convert_ms = start_convert.elapsed().as_secs_f64() * 1000.0;
            
            if let Ok(img) = img {
                // 缩放
                let start_scale = Instant::now();
                let (w, h) = img.dimensions();
                let max_size = 200u32;
                let scale = (max_size as f32 / w as f32).min(max_size as f32 / h as f32).min(1.0);
                let new_w = (w as f32 * scale) as u32;
                let new_h = (h as f32 * scale) as u32;
                let thumbnail = img.thumbnail(new_w, new_h);
                let scale_ms = start_scale.elapsed().as_secs_f64() * 1000.0;
                
                // 编码
                let start_encode = Instant::now();
                let mut output = Vec::new();
                let encode_result = thumbnail.write_to(&mut Cursor::new(&mut output), ImageFormat::WebP);
                let encode_ms = start_encode.elapsed().as_secs_f64() * 1000.0;
                
                let total_ms = start_total.elapsed().as_secs_f64() * 1000.0;
                
                results.push(DetailedBenchmarkResult {
                    method: "WIC全尺寸+image缩放".to_string(),
                    format: ext.clone(),
                    extract_ms,
                    decode_ms: decode_ms + convert_ms,
                    scale_ms,
                    encode_ms,
                    total_ms,
                    success: encode_result.is_ok(),
                    error: encode_result.err().map(|e| e.to_string()),
                    input_size,
                    output_size: Some(output.len()),
                    original_dims: Some(orig_dims),
                    output_dims: Some((new_w, new_h)),
                });
            }
        }
    }
    
    // 方法 2: WIC 内置缩放（推荐）
    #[cfg(target_os = "windows")]
    {
        use crate::core::wic_decoder::{decode_and_scale_with_wic, wic_result_to_dynamic_image};
        
        let start_total = Instant::now();
        
        // 解码+缩放（一步完成）
        let start_decode_scale = Instant::now();
        let result = decode_and_scale_with_wic(&image_data, 200, 200);
        let decode_scale_ms = start_decode_scale.elapsed().as_secs_f64() * 1000.0;
        
        if let Ok(wic_result) = result {
            let output_dims = (wic_result.width, wic_result.height);
            
            // 转换
            let start_convert = Instant::now();
            let img = wic_result_to_dynamic_image(wic_result);
            let convert_ms = start_convert.elapsed().as_secs_f64() * 1000.0;
            
            if let Ok(img) = img {
                // 编码
                let start_encode = Instant::now();
                let mut output = Vec::new();
                let encode_result = img.write_to(&mut Cursor::new(&mut output), ImageFormat::WebP);
                let encode_ms = start_encode.elapsed().as_secs_f64() * 1000.0;
                
                let total_ms = start_total.elapsed().as_secs_f64() * 1000.0;
                
                results.push(DetailedBenchmarkResult {
                    method: "WIC内置缩放(推荐)".to_string(),
                    format: ext.clone(),
                    extract_ms,
                    decode_ms: decode_scale_ms,
                    scale_ms: 0.0, // 缩放已包含在解码中
                    encode_ms: encode_ms + convert_ms,
                    total_ms,
                    success: encode_result.is_ok(),
                    error: encode_result.err().map(|e| e.to_string()),
                    input_size,
                    output_size: Some(output.len()),
                    original_dims: None, // WIC 内置缩放不返回原始尺寸
                    output_dims: Some(output_dims),
                });
            }
        }
    }
    
    Ok(results)
}

/// 文件夹批量压缩包基准测试
#[command]
pub async fn run_archive_folder_benchmark(folder_path: String, tier: u32) -> Result<Vec<BenchmarkReport>, String> {
    use rand::seq::SliceRandom;
    use walkdir::WalkDir;
    
    let path = PathBuf::from(&folder_path);
    
    // 递归收集所有压缩包文件
    let mut archives: Vec<PathBuf> = Vec::new();
    for entry in WalkDir::new(&path).into_iter().filter_map(|e| e.ok()) {
        let file_path = entry.path();
        if file_path.is_file() {
            if let Some(ext) = file_path.extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();
                if ["zip", "cbz", "rar", "7z", "cb7", "cbr"].contains(&ext_lower.as_str()) {
                    archives.push(file_path.to_path_buf());
                }
            }
        }
    }
    
    if archives.is_empty() {
        return Err("文件夹中没有找到压缩包".to_string());
    }
    
    // 随机抽取指定数量的压缩包
    let selected: Vec<PathBuf> = {
        let mut rng = rand::thread_rng();
        archives.shuffle(&mut rng);
        let count = (tier as usize).min(archives.len());
        archives[..count].to_vec()
    };
    
    // 对每个压缩包进行测试
    let mut reports = Vec::new();
    for archive in selected {
        match run_archive_thumbnail_benchmark(archive.to_string_lossy().to_string()).await {
            Ok(report) => reports.push(report),
            Err(e) => eprintln!("测试 {:?} 失败: {}", archive, e),
        }
    }
    
    Ok(reports)
}

/// 压缩包缩略图提取基准测试
#[command]
pub async fn run_archive_thumbnail_benchmark(archive_path: String) -> Result<BenchmarkReport, String> {
    use std::fs;
    use std::io::Read;
    use zip::ZipArchive;
    use image::GenericImageView;
    
    let path = PathBuf::from(&archive_path);
    let file_size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    let mut results = Vec::new();
    
    // 打开压缩包
    let file = fs::File::open(&path).map_err(|e| format!("打开压缩包失败: {}", e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("解析压缩包失败: {}", e))?;
    
    // 找到第一个图片文件
    let image_exts = ["jpg", "jpeg", "png", "webp", "avif", "jxl", "gif", "bmp"];
    let mut first_image: Option<(String, Vec<u8>)> = None;
    
    for i in 0..archive.len() {
        if let Ok(mut entry) = archive.by_index(i) {
            let name = entry.name().to_lowercase();
            if image_exts.iter().any(|ext| name.ends_with(ext)) {
                let mut data = Vec::new();
                if entry.read_to_end(&mut data).is_ok() {
                    first_image = Some((entry.name().to_string(), data));
                    break;
                }
            }
        }
    }
    
    let (image_name, image_data) = first_image.ok_or("压缩包中没有找到图片")?;
    let ext = image_name.split('.').last().unwrap_or("").to_lowercase();
    
    // 1. 测试解压+解码 (image crate)
    {
        let start = Instant::now();
        let result = image::load_from_memory(&image_data);
        let duration = start.elapsed().as_secs_f64() * 1000.0;
        
        results.push(BenchmarkResult {
            method: "archive→image crate".to_string(),
            format: ext.clone(),
            duration_ms: duration,
            success: result.is_ok(),
            error: result.as_ref().err().map(|e| e.to_string()),
            image_size: result.ok().map(|img| img.dimensions()),
            output_size: None,
        });
    }
    
    // 2. 测试解压+WIC解码
    #[cfg(target_os = "windows")]
    {
        use crate::core::wic_decoder::{decode_image_from_memory_with_wic, wic_result_to_dynamic_image};
        
        let start = Instant::now();
        let result = decode_image_from_memory_with_wic(&image_data)
            .and_then(|r| wic_result_to_dynamic_image(r));
        let duration = start.elapsed().as_secs_f64() * 1000.0;
        
        results.push(BenchmarkResult {
            method: "archive→WIC".to_string(),
            format: ext.clone(),
            duration_ms: duration,
            success: result.is_ok(),
            error: result.as_ref().err().cloned(),
            image_size: result.ok().map(|img| img.dimensions()),
            output_size: None,
        });
    }
    
    // 3. 完整流程：解压+WIC解码+缩放+WebP编码（旧方法）
    #[cfg(target_os = "windows")]
    {
        let start = Instant::now();
        let result = generate_thumbnail_with_wic(&image_data);
        let duration = start.elapsed().as_secs_f64() * 1000.0;
        let output_size = result.as_ref().ok().map(|v| v.len());
        
        results.push(BenchmarkResult {
            method: "archive→WIC→webp (旧)".to_string(),
            format: ext.clone(),
            duration_ms: duration,
            success: result.is_ok(),
            error: result.as_ref().err().cloned(),
            image_size: None,
            output_size,
        });
    }
    
    // 4. 优化流程：WIC内置缩放+WebP编码（新方法，更快）
    #[cfg(target_os = "windows")]
    {
        let start = Instant::now();
        let result = generate_thumbnail_with_wic_fast(&image_data);
        let duration = start.elapsed().as_secs_f64() * 1000.0;
        let output_size = result.as_ref().ok().map(|v| v.len());
        
        results.push(BenchmarkResult {
            method: "archive→WIC快速→webp".to_string(),
            format: ext.clone(),
            duration_ms: duration,
            success: result.is_ok(),
            error: result.as_ref().err().cloned(),
            image_size: None,
            output_size,
        });
    }
    
    // 5. 完整流程：解压+image解码+缩放+WebP编码
    {
        let start = Instant::now();
        let result = generate_thumbnail_with_image_crate(&image_data);
        let duration = start.elapsed().as_secs_f64() * 1000.0;
        let output_size = result.as_ref().ok().map(|v| v.len());
        
        results.push(BenchmarkResult {
            method: "archive→image→webp (完整流程)".to_string(),
            format: ext.clone(),
            duration_ms: duration,
            success: result.is_ok(),
            error: result.as_ref().err().cloned(),
            image_size: None,
            output_size,
        });
    }
    
    Ok(BenchmarkReport {
        file_path: format!("{}::{}", archive_path, image_name),
        file_size,
        results,
    })
}
