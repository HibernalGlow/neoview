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

/// 使用 WIC 解码 + 缩放 + WebP 编码（旧方法，先全尺寸解码再缩放）
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

/// 使用 WIC 内置缩放 + WebP 编码（新方法，快速）
/// 避免解码到全分辨率，直接在 WIC 层面缩放
#[cfg(target_os = "windows")]
fn generate_thumbnail_with_wic_fast(image_data: &[u8]) -> Result<Vec<u8>, String> {
    use crate::core::wic_decoder::{decode_and_scale_with_wic, wic_result_to_dynamic_image};
    use image::ImageFormat;
    use std::io::Cursor;
    
    // 使用 WIC 内置缩放器直接输出小尺寸图像
    let result = decode_and_scale_with_wic(image_data, 200, 200)?;
    let img = wic_result_to_dynamic_image(result)?;
    
    let mut output = Vec::new();
    img.write_to(&mut Cursor::new(&mut output), ImageFormat::WebP)
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

/// 扫描文件夹中的压缩包数量（递归）
#[command]
pub async fn scan_archive_folder(folder_path: String) -> Result<ArchiveScanResult, String> {
    use std::fs;
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

#[derive(Serialize, Clone)]
pub struct ArchiveScanResult {
    pub total_count: usize,
    pub folder_path: String,
}

/// 详细分步计时结果
#[derive(Serialize, Clone)]
pub struct DetailedBenchmarkResult {
    pub method: String,
    pub format: String,
    pub extract_ms: f64,      // 解压用时
    pub decode_ms: f64,       // 解码用时
    pub scale_ms: f64,        // 缩放用时
    pub encode_ms: f64,       // 编码用时
    pub total_ms: f64,        // 总用时
    pub success: bool,
    pub error: Option<String>,
    pub input_size: usize,    // 输入大小
    pub output_size: Option<usize>,  // 输出大小
    pub original_dims: Option<(u32, u32)>,  // 原始尺寸
    pub output_dims: Option<(u32, u32)>,    // 输出尺寸
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
        use image::GenericImageView;
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
        use image::GenericImageView;
        
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
    
    // 4. 完整流程：解压+image解码+缩放+WebP编码
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

/// 真实场景测试结果
#[derive(Debug, Clone, Serialize)]
pub struct RealWorldTestResult {
    pub viewport_size: usize,
    pub total_files: usize,
    pub total_time_ms: f64,
    pub avg_time_ms: f64,
    pub cached_count: usize,
    pub generated_count: usize,
    pub failed_count: usize,
    pub throughput: f64,
}

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
    let mut cached_count = 0;
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
