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

    /// 生成单个文件的缩略图
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
        
        // 检查数据库缓存
        if let Ok(Some(cached)) = self.db.load_thumbnail(&path_key, file_size, ghash) {
            // 更新访问时间
            let _ = self.db.update_access_time(&path_key);
            return Ok(cached);
        }
        
        // 从文件加载图像（改进错误处理）
        let image_data = std::fs::read(file_path)
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::PermissionDenied {
                    format!("读取文件失败: 权限被拒绝 (os error 5)。请检查文件权限或尝试以管理员身份运行")
                } else {
                    format!("读取文件失败: {}", e)
                }
            })?;
        
        // 检查是否为 JXL 文件
        let img = if let Some(ext) = Path::new(file_path).extension().and_then(|e| e.to_str()) {
            if ext.to_lowercase() == "jxl" {
                self.decode_jxl_image(&image_data)?
            } else {
                // 使用 catch_unwind 捕获可能的 panic（如 dav1d 崩溃）
                std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    image::load_from_memory(&image_data)
                }))
                .map_err(|_| "图像解码时发生 panic（可能是格式问题）".to_string())?
                .map_err(|e| format!("从内存加载图像失败: {}", e))?
            }
        } else {
            // 使用 catch_unwind 捕获可能的 panic
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                image::load_from_memory(&image_data)
            }))
            .map_err(|_| "图像解码时发生 panic（可能是格式问题）".to_string())?
            .map_err(|e| format!("从内存加载图像失败: {}", e))?
        };
        
        // 生成 webp 缩略图
        let thumbnail_data = self.generate_webp_thumbnail(img)?;
        
        // 保存到数据库（忽略错误，不影响返回）
        if let Err(e) = self.db.save_thumbnail(&path_key, file_size, ghash, &thumbnail_data) {
            // 只记录警告，不打印错误（避免日志污染）
            if !e.to_string().contains("Execute returned results") {
                eprintln!("保存缩略图到数据库失败: {}", e);
            }
        }
        
        Ok(thumbnail_data)
    }

    /// 从压缩包生成缩略图（流式处理，找到第一张图就停止）
    pub fn generate_archive_thumbnail(
        &self,
        archive_path: &str,
    ) -> Result<Vec<u8>, String> {
        // 获取压缩包大小
        let metadata = std::fs::metadata(archive_path)
            .map_err(|e| format!("获取压缩包元数据失败: {}", e))?;
        let archive_size = metadata.len() as i64;
        
        // 构建路径键
        let path_key = self.build_path_key(archive_path, None);
        let ghash = Self::generate_hash(&path_key, archive_size);
        
        // 检查数据库缓存
        if let Ok(Some(cached)) = self.db.load_thumbnail(&path_key, archive_size, ghash) {
            let _ = self.db.update_access_time(&path_key);
            return Ok(cached);
        }
        
        // 使用 zip crate 直接读取压缩包，找到第一张图片
        use zip::ZipArchive;
        use std::fs::File;
        
        let file = File::open(archive_path)
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::PermissionDenied {
                    format!("打开压缩包失败: 权限被拒绝 (os error 5)。请检查文件权限或尝试以管理员身份运行")
                } else {
                    format!("打开压缩包失败: {}", e)
                }
            })?;
        let mut archive = ZipArchive::new(file)
            .map_err(|e| format!("读取压缩包失败: {}", e))?;
        
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
                    // 读取文件内容
                    let mut image_data = Vec::new();
                    file.read_to_end(&mut image_data)
                        .map_err(|e| format!("读取压缩包文件失败: {}", e))?;
                    
                    // 从内存加载图像（使用 catch_unwind 避免 panic）
                    let img = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        image::load_from_memory(&image_data)
                    }))
                    .map_err(|_| "图像解码时发生 panic（可能是格式问题）".to_string())?
                    .map_err(|e| format!("从内存加载图像失败: {}", e))?;
                    
                    // 生成 webp 缩略图
                    let thumbnail_data = self.generate_webp_thumbnail(img)?;
                    
                    // 保存到数据库（忽略错误，不影响返回）
                    if let Err(e) = self.db.save_thumbnail(&path_key, archive_size, ghash, &thumbnail_data) {
                        // 只记录警告，不打印错误（避免日志污染）
                        if !e.to_string().contains("Execute returned results") {
                            eprintln!("保存缩略图到数据库失败: {}", e);
                        }
                    }
                    
                    return Ok(thumbnail_data);
                }
            }
        }
        
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

