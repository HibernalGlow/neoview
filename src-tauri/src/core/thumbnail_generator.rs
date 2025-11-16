//! Thumbnail Generator Module
//! 缩略图生成器模块 - 支持多线程、压缩包流式处理、webp 格式

use std::path::Path;
use std::sync::Arc;
use std::io::{Cursor, Read};
use image::{DynamicImage, GenericImageView, ImageFormat};
use crate::core::thumbnail_db::ThumbnailDb;
use threadpool::ThreadPool;
use std::sync::mpsc;
use std::collections::HashMap;

/// 缩略图生成器配置
#[derive(Clone)]
pub struct ThumbnailGeneratorConfig {
    /// 缩略图最大宽度
    pub max_width: u32,
    /// 缩略图最大高度
    pub max_height: u32,
    /// 线程池大小
    pub thread_pool_size: usize,
    /// 压缩包并发数
    pub archive_concurrency: usize,
}

impl Default for ThumbnailGeneratorConfig {
    fn default() -> Self {
        // 根据 CPU 核心数动态调整线程池大小
        let num_cores = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);
        let thread_pool_size = (num_cores * 2).max(8).min(16); // 2倍核心数，最少8，最多16
        
        Self {
            max_width: 256,
            max_height: 256,
            thread_pool_size,
            archive_concurrency: (num_cores / 2).max(2).min(6), // 核心数的一半，最少2，最多6
        }
    }
}

/// 缩略图生成器
pub struct ThumbnailGenerator {
    db: Arc<ThumbnailDb>,
    config: ThumbnailGeneratorConfig,
    thread_pool: Arc<ThreadPool>,
}

impl ThumbnailGenerator {
    /// 创建新的缩略图生成器
    pub fn new(
        db: Arc<ThumbnailDb>,
        config: ThumbnailGeneratorConfig,
    ) -> Self {
        let thread_pool = Arc::new(ThreadPool::new(config.thread_pool_size));
        
        Self {
            db,
            config,
            thread_pool,
        }
    }

    /// 生成缩略图的哈希值（用于验证）
    fn generate_hash(path: &str, size: i64) -> i32 {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        
        let mut hasher = DefaultHasher::new();
        path.hash(&mut hasher);
        size.hash(&mut hasher);
        hasher.finish() as i32
    }

    /// 生成文件路径的键（用于数据库）
    fn build_path_key(&self, path: &str, inner_path: Option<&str>) -> String {
        if let Some(inner) = inner_path {
            format!("{}::{}", path, inner)
        } else {
            path.to_string()
        }
    }

    /// 解码 JXL 图像
    fn decode_jxl_image(&self, image_data: &[u8]) -> Result<DynamicImage, String> {
        use jxl_oxide::JxlImage;
        
        let mut reader = Cursor::new(image_data);
        let jxl_image = JxlImage::builder()
            .read(&mut reader)
            .map_err(|e| format!("Failed to decode JXL: {}", e))?;
        
        let render = jxl_image.render_frame(0)
            .map_err(|e| format!("Failed to render JXL frame: {}", e))?;
        
        let fb = render.image_all_channels();
        let width = fb.width() as u32;
        let height = fb.height() as u32;
        let channels = fb.channels();
        let float_buf = fb.buf();
        
        // 转换为 DynamicImage
        let img = if channels == 1 {
            let gray_data: Vec<u8> = float_buf
                .iter()
                .map(|&v| (v.clamp(0.0, 1.0) * 255.0) as u8)
                .collect();
            
            let gray_img = image::GrayImage::from_raw(width, height, gray_data)
                .ok_or_else(|| "Failed to create gray image from JXL data".to_string())?;
            DynamicImage::ImageLuma8(gray_img)
        } else if channels == 3 {
            let rgb_data: Vec<u8> = float_buf
                .iter()
                .map(|&v| (v.clamp(0.0, 1.0) * 255.0) as u8)
                .collect();
            
            let rgb_img = image::RgbImage::from_raw(width, height, rgb_data)
                .ok_or_else(|| "Failed to create RGB image from JXL data".to_string())?;
            DynamicImage::ImageRgb8(rgb_img)
        } else {
            let rgba_data: Vec<u8> = float_buf
                .chunks(channels)
                .flat_map(|chunk| {
                    vec![
                        (chunk[0].clamp(0.0, 1.0) * 255.0) as u8,
                        (chunk[1].clamp(0.0, 1.0) * 255.0) as u8,
                        (chunk[2].clamp(0.0, 1.0) * 255.0) as u8,
                        if channels > 3 { (chunk[3].clamp(0.0, 1.0) * 255.0) as u8 } else { 255 },
                    ]
                })
                .collect();
            
            let rgba_img = image::RgbaImage::from_raw(width, height, rgba_data)
                .ok_or_else(|| "Failed to create RGBA image from JXL data".to_string())?;
            DynamicImage::ImageRgba8(rgba_img)
        };
        
        Ok(img)
    }

    /// 从图像生成 webp 缩略图
    fn generate_webp_thumbnail(
        &self,
        img: DynamicImage,
    ) -> Result<Vec<u8>, String> {
        let (width, height) = img.dimensions();
        
        // 计算缩放比例，保持宽高比
        let scale = (self.config.max_width as f32 / width as f32)
            .min(self.config.max_height as f32 / height as f32)
            .min(1.0);
        
        let new_width = (width as f32 * scale) as u32;
        let new_height = (height as f32 * scale) as u32;
        
        // 缩放图像（使用 thumbnail 方法保持宽高比）
        let thumbnail = img.thumbnail(new_width, new_height);
        
        // 编码为 webp
        let mut output = Vec::new();
        thumbnail.write_to(
            &mut Cursor::new(&mut output),
            ImageFormat::WebP,
        ).map_err(|e| format!("编码 WebP 失败: {}", e))?;
        
        Ok(output)
    }

    /// 生成单个文件的缩略图（第一次返回原图 blob，后台生成 webp 并保存）
    pub fn generate_file_thumbnail(
        &self,
        file_path: &str,
    ) -> Result<Vec<u8>, String> {
        // 获取文件大小
        let metadata = std::fs::metadata(file_path)
            .map_err(|e| format!("获取文件元数据失败: {}", e))?;
        let file_size = metadata.len() as i64;
        
        // 构建路径键
        let path_key = self.build_path_key(file_path, None);
        let ghash = Self::generate_hash(&path_key, file_size);
        
        // 检查数据库缓存（如果有 webp 缓存，直接返回）
        if let Ok(Some(cached)) = self.db.load_thumbnail(&path_key, file_size, ghash) {
            // 更新访问时间
            let _ = self.db.update_access_time(&path_key);
            return Ok(cached);
        }
        
        // 从文件加载图像（改进错误处理，记录权限错误但静默处理）
        let image_data = match std::fs::read(file_path) {
            Ok(data) => data,
            Err(e) => {
                if e.kind() == std::io::ErrorKind::PermissionDenied {
                    // 权限错误：记录到日志但不打印到控制台（避免日志污染）
                    eprintln!("⚠️ 权限错误 (静默处理): {}", file_path);
                    return Err("权限被拒绝".to_string());
                } else {
                    return Err(format!("读取文件失败: {}", e));
                }
            }
        };
        
        // 第一次：直接返回原图 blob（立即显示，不压缩）
        // 后台异步生成 webp 缩略图并保存到数据库
        let db_clone = Arc::clone(&self.db);
        let path_key_clone = path_key.clone();
        let file_size_clone = file_size;
        let ghash_clone = ghash;
        let image_data_clone = image_data.clone();
        let config_clone = self.config.clone();
        
        std::thread::spawn(move || {
            // 在后台线程中使用 vips 命令行工具生成 webp 缩略图（避免 rust 库 panic）
            // 直接将原始图像数据写入临时文件，使用 vips 处理
            use std::fs;
            use std::process::Command;
            
            let temp_dir = std::env::temp_dir();
            let input_path = temp_dir.join(format!("thumb_input_{}_{}.tmp", std::process::id(), 
                std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
            let output_path = temp_dir.join(format!("thumb_output_{}_{}.webp", std::process::id(),
                std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
            
            // 写入原始图像数据到临时文件
            if let Err(e) = fs::write(&input_path, &image_data_clone) {
                eprintln!("❌ 写入临时文件失败: {} - {}", path_key_clone, e);
                return;
            }
            
            // 使用 vips 命令行工具转换（完全避免 rust 图像解码库）
            let vips_result = Command::new("vips")
                .arg("thumbnail")
                .arg(&input_path)
                .arg(&output_path)
                .arg(config_clone.max_width.to_string())
                .arg("--size")
                .arg("down")
                .arg("--format")
                .arg("webp")
                .arg("--Q")
                .arg("85")
                .output();
            
            // 清理临时输入文件
            let _ = fs::remove_file(&input_path);
            
            let webp_data = match vips_result {
                Ok(output) if output.status.success() => {
                    // 读取生成的 webp 文件
                    match fs::read(&output_path) {
                        Ok(data) => {
                            let _ = fs::remove_file(&output_path);
                            data
                        }
                        Err(e) => {
                            let _ = fs::remove_file(&output_path);
                            eprintln!("❌ 读取 vips 输出失败: {} - {}", path_key_clone, e);
                            return;
                        }
                    }
                }
                Ok(output) => {
                    let _ = fs::remove_file(&output_path);
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    eprintln!("⚠️ vips 转换失败: {} - {}, 尝试降级方案", path_key_clone, stderr);
                    // 降级：使用 image crate（但捕获 panic）
                    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        image::load_from_memory(&image_data_clone)
                            .and_then(|img| {
                                let (width, height) = img.dimensions();
                                let scale = (config_clone.max_width as f32 / width as f32)
                                    .min(config_clone.max_height as f32 / height as f32)
                                    .min(1.0);
                                let new_width = (width as f32 * scale) as u32;
                                let new_height = (height as f32 * scale) as u32;
                                let thumbnail = img.thumbnail(new_width, new_height);
                                let mut output = Vec::new();
                                thumbnail.write_to(
                                    &mut Cursor::new(&mut output),
                                    ImageFormat::WebP,
                                )?;
                                Ok(output)
                            })
                    })) {
                        Ok(Ok(data)) => data,
                        Ok(Err(e)) => {
                            eprintln!("❌ 降级方案失败: {} - {}", path_key_clone, e);
                            return;
                        }
                        Err(_) => {
                            eprintln!("❌ 降级方案 panic: {}", path_key_clone);
                            return;
                        }
                    }
                }
                Err(_) => {
                    // vips 命令不存在，使用降级方案
                    eprintln!("⚠️ vips 命令不存在，使用降级方案: {}", path_key_clone);
                    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        image::load_from_memory(&image_data_clone)
                            .and_then(|img| {
                                let (width, height) = img.dimensions();
                                let scale = (config_clone.max_width as f32 / width as f32)
                                    .min(config_clone.max_height as f32 / height as f32)
                                    .min(1.0);
                                let new_width = (width as f32 * scale) as u32;
                                let new_height = (height as f32 * scale) as u32;
                                let thumbnail = img.thumbnail(new_width, new_height);
                                let mut output = Vec::new();
                                thumbnail.write_to(
                                    &mut Cursor::new(&mut output),
                                    ImageFormat::WebP,
                                )?;
                                Ok(output)
                            })
                    })) {
                        Ok(Ok(data)) => data,
                        Ok(Err(e)) => {
                            eprintln!("❌ 降级方案失败: {} - {}", path_key_clone, e);
                            return;
                        }
                        Err(_) => {
                            eprintln!("❌ 降级方案 panic: {}", path_key_clone);
                            return;
                        }
                    }
                }
            };
            
            println!("💾 后台开始保存文件缩略图到数据库: {} ({} bytes)", path_key_clone, webp_data.len());
            match db_clone.save_thumbnail(&path_key_clone, file_size_clone, ghash_clone, &webp_data) {
                Ok(_) => {
                    println!("✅ 文件缩略图已成功保存到数据库: {}", path_key_clone);
                }
                Err(e) => {
                    eprintln!("❌ 保存文件缩略图到数据库失败: {} - {}", path_key_clone, e);
                }
            }
        });
        
        // 立即返回原图 blob（用于显示）
        Ok(image_data)
    }
    
    /// 安全解码图像（捕获 panic，用于后台线程）
    fn decode_image_safe(image_data: &[u8]) -> Result<DynamicImage, String> {
        // 使用 catch_unwind 捕获可能的 panic（如 dav1d 崩溃）
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            image::load_from_memory(image_data)
        }))
        .map_err(|_| "图像解码时发生 panic（可能是格式问题）".to_string())?
        .map_err(|e| format!("从内存加载图像失败: {}", e))
    }
    
    /// 静态方法：使用 vips 命令行工具生成 webp 缩略图（避免 rust 库 panic）
    fn generate_webp_thumbnail_static(
        img: &DynamicImage,
        config: &ThumbnailGeneratorConfig,
    ) -> Result<Vec<u8>, String> {
        use std::process::Command;
        use std::fs;
        
        let (width, height) = img.dimensions();
        
        // 计算缩放比例，保持宽高比
        let scale = (config.max_width as f32 / width as f32)
            .min(config.max_height as f32 / height as f32)
            .min(1.0);
        
        let new_width = (width as f32 * scale) as u32;
        
        // 创建临时目录
        let temp_dir = std::env::temp_dir();
        let input_path = temp_dir.join(format!("thumb_input_{}.png", std::process::id()));
        let output_path = temp_dir.join(format!("thumb_output_{}.webp", std::process::id()));
        
        // 将图像保存为 PNG（临时文件）
        img.save(&input_path)
            .map_err(|e| format!("保存临时图像失败: {}", e))?;
        
        // 使用 vips 命令行工具转换（避免 rust 库 panic）
        // vips 会自动计算高度以保持宽高比
        let vips_result = Command::new("vips")
            .arg("thumbnail")
            .arg(&input_path)
            .arg(&output_path)
            .arg(new_width.to_string())
            .arg("--size")
            .arg("down")  // 只缩小，不放大
            .arg("--format")
            .arg("webp")
            .arg("--Q")
            .arg("85")  // WebP 质量
            .output();
        
        // 清理临时输入文件
        let _ = fs::remove_file(&input_path);
        
        match vips_result {
            Ok(output) if output.status.success() => {
                // 读取生成的 webp 文件
                match fs::read(&output_path) {
                    Ok(webp_data) => {
                        // 清理临时输出文件
                        let _ = fs::remove_file(&output_path);
                        Ok(webp_data)
                    }
                    Err(e) => {
                        let _ = fs::remove_file(&output_path);
                        Err(format!("读取 vips 输出失败: {}", e))
                    }
                }
            }
            Ok(output) => {
                let _ = fs::remove_file(&output_path);
                let stderr = String::from_utf8_lossy(&output.stderr);
                // vips 不可用时，降级到 image crate
                Self::generate_webp_thumbnail_fallback(img, config)
                    .map_err(|e| format!("vips 失败: {}, 降级失败: {}", stderr, e))
            }
            Err(_) => {
                // vips 命令不存在，降级到 image crate
                Self::generate_webp_thumbnail_fallback(img, config)
            }
        }
    }
    
    /// 降级方法：使用 image crate 生成 webp（当 vips 不可用时）
    fn generate_webp_thumbnail_fallback(
        img: &DynamicImage,
        config: &ThumbnailGeneratorConfig,
    ) -> Result<Vec<u8>, String> {
        let (width, height) = img.dimensions();
        
        // 计算缩放比例，保持宽高比
        let scale = (config.max_width as f32 / width as f32)
            .min(config.max_height as f32 / height as f32)
            .min(1.0);
        
        let new_width = (width as f32 * scale) as u32;
        let new_height = (height as f32 * scale) as u32;
        
        // 缩放图像（使用 thumbnail 方法保持宽高比）
        let thumbnail = img.thumbnail(new_width, new_height);
        
        // 编码为 webp
        let mut output = Vec::new();
        thumbnail.write_to(
            &mut Cursor::new(&mut output),
            ImageFormat::WebP,
        ).map_err(|e| format!("编码 WebP 失败: {}", e))?;
        
        Ok(output)
    }

    /// 从压缩包生成缩略图（流式处理，找到第一张图就停止）
    pub fn generate_archive_thumbnail(
        &self,
        archive_path: &str,
    ) -> Result<Vec<u8>, String> {
        println!("📦 开始生成压缩包缩略图: {}", archive_path);
        
        // 获取压缩包大小
        let metadata = std::fs::metadata(archive_path)
            .map_err(|e| format!("获取压缩包元数据失败: {}", e))?;
        let archive_size = metadata.len() as i64;
        
        // 构建路径键
        let path_key = self.build_path_key(archive_path, None);
        let ghash = Self::generate_hash(&path_key, archive_size);
        
        // 检查数据库缓存
        if let Ok(Some(cached)) = self.db.load_thumbnail(&path_key, archive_size, ghash) {
            println!("✅ 从数据库加载压缩包缩略图: {}", archive_path);
            let _ = self.db.update_access_time(&path_key);
            return Ok(cached);
        }
        
        println!("🔄 生成新的压缩包缩略图: {}", archive_path);
        
        // 检查文件扩展名，目前只支持 ZIP 格式
        let path_lower = archive_path.to_lowercase();
        if !path_lower.ends_with(".zip") && !path_lower.ends_with(".cbz") {
            return Err(format!("暂不支持此压缩包格式: {} (目前仅支持 ZIP/CBZ)", archive_path));
        }
        
        // 使用 zip crate 直接读取压缩包，找到第一张图片
        use zip::ZipArchive;
        use std::fs::File;
        
        let file = match File::open(archive_path) {
            Ok(f) => f,
            Err(e) => {
                if e.kind() == std::io::ErrorKind::PermissionDenied {
                    // 权限错误：记录到日志但不打印到控制台
                    eprintln!("⚠️ 权限错误 (静默处理): {}", archive_path);
                    return Err("权限被拒绝".to_string());
                } else {
                    return Err(format!("打开压缩包失败: {}", e));
                }
            }
        };
        let mut archive = ZipArchive::new(file)
            .map_err(|e| format!("读取压缩包失败: {}", e))?;
        
        println!("📂 压缩包包含 {} 个文件", archive.len());
        
        // 支持的图片扩展名
        let image_exts = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "avif", "jxl", "tiff", "tif"];
        
        // 遍历压缩包条目，找到第一个图片文件
        for i in 0..archive.len() {
            let mut file = archive.by_index(i)
                .map_err(|e| format!("读取压缩包条目失败: {}", e))?;
            
            let name = file.name().to_string();
            if let Some(ext) = Path::new(&name)
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
            {
                if image_exts.contains(&ext.as_str()) {
                    println!("🖼️ 找到图片文件: {} (索引: {})", name, i);
                    // 读取文件内容
                    let mut image_data = Vec::new();
                    file.read_to_end(&mut image_data)
                        .map_err(|e| format!("读取压缩包文件失败: {}", e))?;
                    
                    println!("📊 图片文件大小: {} bytes", image_data.len());
                    
                    // 第一次：直接返回原图 blob（立即显示，不压缩）
                    // 后台异步生成 webp 缩略图并保存到数据库
                    let db_clone = Arc::clone(&self.db);
                    let path_key_clone = path_key.clone();
                    let archive_size_clone = archive_size;
                    let ghash_clone = ghash;
                    let image_data_clone = image_data.clone();
                    let config_clone = self.config.clone();
                    
                    std::thread::spawn(move || {
                        // 在后台线程中使用 vips 命令行工具生成 webp 缩略图（避免 rust 库 panic）
                        use std::fs;
                        use std::process::Command;
                        
                        let temp_dir = std::env::temp_dir();
                        let input_path = temp_dir.join(format!("thumb_archive_input_{}_{}.tmp", std::process::id(),
                            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
                        let output_path = temp_dir.join(format!("thumb_archive_output_{}_{}.webp", std::process::id(),
                            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
                        
                        // 写入原始图像数据到临时文件
                        if let Err(e) = fs::write(&input_path, &image_data_clone) {
                            eprintln!("❌ 写入临时文件失败: {} - {}", path_key_clone, e);
                            return;
                        }
                        
                        // 使用 vips 命令行工具转换
                        let vips_result = Command::new("vips")
                            .arg("thumbnail")
                            .arg(&input_path)
                            .arg(&output_path)
                            .arg(config_clone.max_width.to_string())
                            .arg("--size")
                            .arg("down")
                            .arg("--format")
                            .arg("webp")
                            .arg("--Q")
                            .arg("85")
                            .output();
                        
                        // 清理临时输入文件
                        let _ = fs::remove_file(&input_path);
                        
                        let webp_data = match vips_result {
                            Ok(output) if output.status.success() => {
                                match fs::read(&output_path) {
                                    Ok(data) => {
                                        let _ = fs::remove_file(&output_path);
                                        data
                                    }
                                    Err(e) => {
                                        let _ = fs::remove_file(&output_path);
                                        eprintln!("❌ 读取 vips 输出失败: {} - {}", path_key_clone, e);
                                        return;
                                    }
                                }
                            }
                            Ok(output) => {
                                let _ = fs::remove_file(&output_path);
                                let stderr = String::from_utf8_lossy(&output.stderr);
                                eprintln!("⚠️ vips 转换失败: {} - {}, 尝试降级方案", path_key_clone, stderr);
                                // 降级方案
                                match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                                    image::load_from_memory(&image_data_clone)
                                        .and_then(|img| {
                                            let (width, height) = img.dimensions();
                                            let scale = (config_clone.max_width as f32 / width as f32)
                                                .min(config_clone.max_height as f32 / height as f32)
                                                .min(1.0);
                                            let new_width = (width as f32 * scale) as u32;
                                            let new_height = (height as f32 * scale) as u32;
                                            let thumbnail = img.thumbnail(new_width, new_height);
                                            let mut output = Vec::new();
                                            thumbnail.write_to(
                                                &mut Cursor::new(&mut output),
                                                ImageFormat::WebP,
                                            )?;
                                            Ok(output)
                                        })
                                })) {
                                    Ok(Ok(data)) => data,
                                    Ok(Err(e)) => {
                                        eprintln!("❌ 降级方案失败: {} - {}", path_key_clone, e);
                                        return;
                                    }
                                    Err(_) => {
                                        eprintln!("❌ 降级方案 panic: {}", path_key_clone);
                                        return;
                                    }
                                }
                            }
                            Err(_) => {
                                eprintln!("⚠️ vips 命令不存在，使用降级方案: {}", path_key_clone);
                                match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                                    image::load_from_memory(&image_data_clone)
                                        .and_then(|img| {
                                            let (width, height) = img.dimensions();
                                            let scale = (config_clone.max_width as f32 / width as f32)
                                                .min(config_clone.max_height as f32 / height as f32)
                                                .min(1.0);
                                            let new_width = (width as f32 * scale) as u32;
                                            let new_height = (height as f32 * scale) as u32;
                                            let thumbnail = img.thumbnail(new_width, new_height);
                                            let mut output = Vec::new();
                                            thumbnail.write_to(
                                                &mut Cursor::new(&mut output),
                                                ImageFormat::WebP,
                                            )?;
                                            Ok(output)
                                        })
                                })) {
                                    Ok(Ok(data)) => data,
                                    Ok(Err(e)) => {
                                        eprintln!("❌ 降级方案失败: {} - {}", path_key_clone, e);
                                        return;
                                    }
                                    Err(_) => {
                                        eprintln!("❌ 降级方案 panic: {}", path_key_clone);
                                        return;
                                    }
                                }
                            }
                        };
                        
                        println!("💾 后台开始保存压缩包缩略图到数据库: {} ({} bytes)", path_key_clone, webp_data.len());
                        match db_clone.save_thumbnail(&path_key_clone, archive_size_clone, ghash_clone, &webp_data) {
                            Ok(_) => {
                                println!("✅ 压缩包缩略图已成功保存到数据库: {}", path_key_clone);
                            }
                            Err(e) => {
                                eprintln!("❌ 保存压缩包缩略图到数据库失败: {} - {}", path_key_clone, e);
                            }
                        }
                    });
                    
                    // 立即返回原图 blob（用于显示）
                    return Ok(image_data);
                }
            }
        }
        
        println!("⚠️ 压缩包中没有找到图片文件: {}", archive_path);
        Err("压缩包中没有找到图片文件".to_string())
    }

    /// 批量生成缩略图（多线程）
    pub fn batch_generate_thumbnails(
        &self,
        paths: Vec<String>,
        is_archive: bool,
    ) -> HashMap<String, Result<Vec<u8>, String>> {
        let (tx, rx) = mpsc::channel();
        let mut results = HashMap::new();
        
        // 提交任务到线程池
        for path in paths {
            let tx = tx.clone();
            let generator = self.clone();
            
            self.thread_pool.execute(move || {
                let result = if is_archive {
                    generator.generate_archive_thumbnail(&path)
                } else {
                    generator.generate_file_thumbnail(&path)
                };
                
                let _ = tx.send((path, result));
            });
        }
        
        // 收集结果
        drop(tx);
        for (path, result) in rx.iter() {
            results.insert(path, result);
        }
        
        results
    }
}

impl Clone for ThumbnailGenerator {
    fn clone(&self) -> Self {
        Self {
            db: Arc::clone(&self.db),
            config: ThumbnailGeneratorConfig {
                max_width: self.config.max_width,
                max_height: self.config.max_height,
                thread_pool_size: self.config.thread_pool_size,
                archive_concurrency: self.config.archive_concurrency,
            },
            thread_pool: Arc::clone(&self.thread_pool),
        }
    }
}

