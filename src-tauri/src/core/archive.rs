use std::fs::File;
use std::io::{Read, Cursor};
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;
use zip::ZipArchive;
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose};
use image::GenericImageView;

/// 压缩包内的文件项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub is_image: bool,
}

/// 压缩包管理器
pub struct ArchiveManager {
    /// 支持的图片格式
    image_extensions: Vec<String>,
    /// 图片缓存
    cache: Arc<std::sync::Mutex<std::collections::HashMap<String, String>>>,
    /// 压缩包文件缓存（避免重复打开）
    archive_cache: Arc<std::sync::Mutex<std::collections::HashMap<String, Arc<std::sync::Mutex<ZipArchive<std::fs::File>>>>>>,
}

impl ArchiveManager {
    /// 创建新的压缩包管理器
    pub fn new() -> Self {
        Self {
            image_extensions: vec![
                "jpg".to_string(),
                "jpeg".to_string(),
                "png".to_string(),
                "gif".to_string(),
                "bmp".to_string(),
                "webp".to_string(),
                "avif".to_string(),
                "jxl".to_string(),
                "tiff".to_string(),
                "tif".to_string(),
            ],
            cache: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
            archive_cache: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
        }
    }

    /// 获取或创建压缩包缓存
    fn get_cached_archive(&self, archive_path: &Path) -> Result<Arc<std::sync::Mutex<ZipArchive<std::fs::File>>>, String> {
        let path_str = archive_path.to_string_lossy().into_owned();
        
        // 检查缓存
        {
            let cache = self.archive_cache.lock().unwrap();
            if let Some(archive) = cache.get(&path_str) {
                return Ok(Arc::clone(archive));
            }
        }
        
        // 创建新的压缩包实例
        let file = File::open(archive_path)
            .map_err(|e| format!("打开压缩包失败: {}", e))?;
        
        let archive = ZipArchive::new(file)
            .map_err(|e| format!("读取压缩包失败: {}", e))?;
        
        let cached = Arc::new(std::sync::Mutex::new(archive));
        
        // 添加到缓存
        {
            let mut cache = self.archive_cache.lock().unwrap();
            cache.insert(path_str, Arc::clone(&cached));
        }
        
        Ok(cached)
    }

    /// 检查是否为图片文件
    fn is_image_file(&self, path: &str) -> bool {
        if let Some(ext) = Path::new(path).extension() {
            let ext = ext.to_string_lossy().to_lowercase();
            self.image_extensions.contains(&ext)
        } else {
            false
        }
    }

    /// 读取 ZIP 压缩包内容列表
    pub fn list_zip_contents(&self, archive_path: &Path) -> Result<Vec<ArchiveEntry>, String> {
        println!("📦 ArchiveManager::list_zip_contents start: {}", archive_path.display());
        let file = File::open(archive_path)
            .map_err(|e| format!("打开压缩包失败: {}", e))?;

        let mut archive = ZipArchive::new(file)
            .map_err(|e| format!("读取压缩包失败: {}", e))?;

        let mut entries = Vec::new();

        for i in 0..archive.len() {
            let file = archive.by_index(i)
                .map_err(|e| format!("读取压缩包条目失败: {}", e))?;

            let name = file.name().to_string();
            let is_dir = file.is_dir();
            let size = file.size();
            let is_image = !is_dir && self.is_image_file(&name);

            entries.push(ArchiveEntry {
                name: name.clone(),
                path: name,
                size,
                is_dir,
                is_image,
            });
        }

        println!("📦 ArchiveManager::list_zip_contents end: {} entries", entries.len());

        // 排序：目录优先，然后按名称
        entries.sort_by(|a, b| {
            match (a.is_dir, b.is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            }
        });

        Ok(entries)
    }

    /// 从 ZIP 压缩包中提取文件内容（优化版本，使用缓存的压缩包实例）
    pub fn extract_file_from_zip(
        &self,
        archive_path: &Path,
        file_path: &str,
    ) -> Result<Vec<u8>, String> {
        println!("📦 extract_file_from_zip start: archive={} inner={}", archive_path.display(), file_path);
        
        // 使用缓存的压缩包实例
        let cached_archive = self.get_cached_archive(archive_path)?;
        let mut archive = cached_archive.lock().unwrap();
        
        let mut zip_file = archive.by_name(file_path)
            .map_err(|e| format!("在压缩包中找不到文件: {}", e))?;

        let mut buffer = Vec::new();
        let start = Instant::now();
        zip_file.read_to_end(&mut buffer)
            .map_err(|e| format!("读取文件失败: {}", e))?;

        let elapsed = start.elapsed();
        // try to get compressed size if available
        let compressed = zip_file.compressed_size();
        let uncompressed = buffer.len() as u64;
        let ratio = if uncompressed > 0 { (compressed as f64) / (uncompressed as f64) } else { 0.0 };
        println!("📦 extract_file_from_zip end: read_bytes={} compressed={} ratio={:.3} elapsed_ms={} archive={} inner={}", uncompressed, compressed, ratio, elapsed.as_millis(), archive_path.display(), file_path);

        Ok(buffer)
    }

    /// 从压缩包中提取文件（统一接口）
    pub fn extract_file(&self, archive_path: &Path, file_path: &str) -> Result<Vec<u8>, String> {
        self.extract_file_from_zip(archive_path, file_path)
    }

    /// 从 ZIP 压缩包中加载图片（返回 base64，带缓存）
    pub fn load_image_from_zip(
        &self,
        archive_path: &Path,
        file_path: &str,
    ) -> Result<String, String> {
        // 创建缓存键：压缩包路径 + 文件路径
        let cache_key = format!("{}::{}", archive_path.display(), file_path);
        
        // 检查缓存
        if let Ok(cache) = self.cache.lock() {
            if let Some(cached_data) = cache.get(&cache_key) {
                return Ok(cached_data.clone());
            }
        }

        let data = self.extract_file_from_zip(archive_path, file_path)?;

        // 对于 JXL 格式，需要先解码再重新编码为通用格式
        let result = if let Some(ext) = Path::new(file_path).extension() {
            if ext.to_string_lossy().to_lowercase() == "jxl" {
                self.load_jxl_from_zip(&data)?
            } else {
                // 检测图片类型
                let mime_type = self.detect_image_mime_type(file_path);
                // 编码为 base64
                let base64_data = general_purpose::STANDARD.encode(&data);
                format!("data:{};base64,{}", mime_type, base64_data)
            }
        } else {
            // 检测图片类型
            let mime_type = self.detect_image_mime_type(file_path);
            // 编码为 base64
            let base64_data = general_purpose::STANDARD.encode(&data);
            format!("data:{};base64,{}", mime_type, base64_data)
        };

        // 添加到缓存
        if let Ok(mut cache) = self.cache.lock() {
            cache.insert(cache_key, result.clone());
        }

        Ok(result)
    }

    /// 从压缩包中加载 JXL 图片并转换为 PNG
    fn load_jxl_from_zip(&self, image_data: &[u8]) -> Result<String, String> {
        use jxl_oxide::JxlImage;
        use std::io::Cursor;
        
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
            image::DynamicImage::ImageLuma8(gray_img)
        } else if channels == 3 {
            let rgb_data: Vec<u8> = float_buf
                .iter()
                .map(|&v| (v.clamp(0.0, 1.0) * 255.0) as u8)
                .collect();
            
            let rgb_img = image::RgbImage::from_raw(width, height, rgb_data)
                .ok_or_else(|| "Failed to create RGB image from JXL data".to_string())?;
            image::DynamicImage::ImageRgb8(rgb_img)
        } else {
            let rgba_data: Vec<u8> = float_buf
                .chunks(channels)
                .flat_map(|chunk| {
                    vec![
                        (chunk[0].clamp(0.0, 1.0) * 255.0) as u8,
                        (chunk[1].clamp(0.0, 1.0) * 255.0) as u8,
                        (chunk[2].clamp(0.0, 1.0) * 255.0) as u8,
                        (chunk.get(3).copied().unwrap_or(1.0).clamp(0.0, 1.0) * 255.0) as u8,
                    ]
                })
                .collect();
            
            let rgba_img = image::RgbaImage::from_raw(width, height, rgba_data)
                .ok_or_else(|| "Failed to create RGBA image from JXL data".to_string())?;
            image::DynamicImage::ImageRgba8(rgba_img)
        };

        // 编码为 PNG
        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);
        
        img.write_to(&mut cursor, image::ImageFormat::Png)
            .map_err(|e| format!("编码 JXL 为 PNG 失败: {}", e))?;

        // 返回 PNG 格式的 base64
        Ok(format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(&buffer)))
    }

    /// 检测图片 MIME 类型
    fn detect_image_mime_type(&self, path: &str) -> &str {
        if let Some(ext) = Path::new(path).extension() {
            match ext.to_string_lossy().to_lowercase().as_str() {
                "jpg" | "jpeg" => "image/jpeg",
                "png" => "image/png",
                "gif" => "image/gif",
                "bmp" => "image/bmp",
                "webp" => "image/webp",
                "avif" => "image/avif",
                "jxl" => "image/jxl",
                "tiff" | "tif" => "image/tiff",
                _ => "application/octet-stream",
            }
        } else {
            "application/octet-stream"
        }
    }

    /// 获取 ZIP 压缩包中的所有图片路径
    pub fn get_images_from_zip(&self, archive_path: &Path) -> Result<Vec<String>, String> {
        let entries = self.list_zip_contents(archive_path)?;
        
        let images: Vec<String> = entries
            .into_iter()
            .filter(|e| e.is_image)
            .map(|e| e.path)
            .collect();

        Ok(images)
    }

    /// 检查文件是否为支持的压缩包
    pub fn is_supported_archive(path: &Path) -> bool {
        if let Some(ext) = path.extension() {
            let ext = ext.to_string_lossy().to_lowercase();
            matches!(ext.as_str(), "zip" | "cbz")
        } else {
            false
        }
    }

    /// 生成压缩包内图片的缩略图（优化版本，流式处理）
    pub fn generate_thumbnail_from_zip(
        &self,
        archive_path: &Path,
        file_path: &str,
        max_size: u32,
    ) -> Result<String, String> {
        // 创建缓存键：压缩包路径 + 文件路径 + 缩略图大小
        let cache_key = format!("{}::{}::thumb_{}", archive_path.display(), file_path, max_size);
        
        // 检查缓存
        if let Ok(cache) = self.cache.lock() {
            if let Some(cached_data) = cache.get(&cache_key) {
                return Ok(cached_data.clone());
            }
        }

        // 使用缓存的压缩包实例
        let cached_archive = self.get_cached_archive(archive_path)?;
        let mut archive = cached_archive.lock().unwrap();
        
        let mut zip_file = archive.by_name(file_path)
            .map_err(|e| format!("在压缩包中找不到文件: {}", e))?;

        // 对于大图片，使用流式解码避免加载整个文件到内存
        let img = if let Some(ext) = Path::new(file_path).extension() {
            if ext.to_string_lossy().to_lowercase() == "jxl" {
                // JXL需要完整数据
                let mut buffer = Vec::new();
                zip_file.read_to_end(&mut buffer)
                    .map_err(|e| format!("读取JXL文件失败: {}", e))?;
                self.decode_jxl_image(&buffer)?
            } else {
                // 对于其他格式，尝试流式加载
                let mut buffer = Vec::new();
                zip_file.read_to_end(&mut buffer)
                    .map_err(|e| format!("读取图片文件失败: {}", e))?;
                image::load_from_memory(&buffer)
                    .map_err(|e| format!("加载图片失败: {}", e))?
            }
        } else {
            let mut buffer = Vec::new();
            zip_file.read_to_end(&mut buffer)
                .map_err(|e| format!("读取图片文件失败: {}", e))?;
            image::load_from_memory(&buffer)
                .map_err(|e| format!("加载图片失败: {}", e))?
        };

        // 生成等比例缩略图
        let thumbnail = self.resize_keep_aspect_ratio(&img, max_size);

        // 编码为 WebP（比JPEG更高效）
        let webp_data = self.encode_webp(&thumbnail)?;

        // 返回 base64
        let result = format!("data:image/webp;base64,{}", general_purpose::STANDARD.encode(&webp_data));

        // 添加到缓存
        if let Ok(mut cache) = self.cache.lock() {
            cache.insert(cache_key, result.clone());
        }

        Ok(result)
    }

    /// 等比例缩放图片
    fn resize_keep_aspect_ratio(&self, img: &image::DynamicImage, max_size: u32) -> image::DynamicImage {
        let (width, height) = img.dimensions();
        
        // 如果图片尺寸小于等于最大尺寸，直接返回
        if width <= max_size && height <= max_size {
            return img.clone();
        }
        
        // 计算缩放比例
        let scale = if width > height {
            max_size as f32 / width as f32
        } else {
            max_size as f32 / height as f32
        };
        
        let new_width = (width as f32 * scale).round() as u32;
        let new_height = (height as f32 * scale).round() as u32;
        
        // 使用 Lanczos3 滤波器获得更好的缩放质量
        img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3)
    }

    /// 编码为 WebP 格式（更高效）
    fn encode_webp(&self, img: &image::DynamicImage) -> Result<Vec<u8>, String> {
        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);

        // WebP 支持透明度，使用 RGBA8
        let rgba = img.to_rgba8();
        let (width, height) = rgba.dimensions();

        // 编码为 WebP，使用默认编码器（速度优化）
        image::write_buffer_with_format(
            &mut cursor,
            rgba.as_raw(),
            width,
            height,
            image::ColorType::Rgba8,
            image::ImageFormat::WebP,
        ).map_err(|e| format!("编码WebP失败: {}", e))?;

        Ok(buffer)
    }

    /// 编码为 JPEG 格式（保留用于兼容性）
    fn encode_jpeg(&self, img: &image::DynamicImage) -> Result<Vec<u8>, String> {
        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);

        // 转换为 RGB8（JPEG不支持透明度）
        let rgb = img.to_rgb8();
        let (width, height) = rgb.dimensions();

        // 编码为 JPEG
        image::write_buffer_with_format(
            &mut cursor,
            rgb.as_raw(),
            width,
            height,
            image::ColorType::Rgb8,
            image::ImageFormat::Jpeg,
        ).map_err(|e| format!("编码JPEG失败: {}", e))?;

        Ok(buffer)
    }

    /// 解码 JXL 图像（辅助方法）
    fn decode_jxl_image(&self, image_data: &[u8]) -> Result<image::DynamicImage, String> {
        use jxl_oxide::JxlImage;
        use std::io::Cursor;
        
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
        
        // 根据通道数创建对应的图像
        if channels == 1 {
            let gray_data: Vec<u8> = float_buf
                .iter()
                .map(|&v| (v.clamp(0.0, 1.0) * 255.0) as u8)
                .collect();
            
            let gray_img = image::GrayImage::from_raw(width, height, gray_data)
                .ok_or_else(|| "Failed to create gray image from JXL data".to_string())?;
            Ok(image::DynamicImage::ImageLuma8(gray_img))
        } else if channels == 3 {
            let rgb_data: Vec<u8> = float_buf
                .iter()
                .map(|&v| (v.clamp(0.0, 1.0) * 255.0) as u8)
                .collect();
            
            let rgb_img = image::RgbImage::from_raw(width, height, rgb_data)
                .ok_or_else(|| "Failed to create RGB image from JXL data".to_string())?;
            Ok(image::DynamicImage::ImageRgb8(rgb_img))
        } else {
            let rgba_data: Vec<u8> = float_buf
                .chunks(channels)
                .flat_map(|chunk| {
                    vec![
                        (chunk[0].clamp(0.0, 1.0) * 255.0) as u8,
                        (chunk[1].clamp(0.0, 1.0) * 255.0) as u8,
                        (chunk[2].clamp(0.0, 1.0) * 255.0) as u8,
                        (chunk.get(3).copied().unwrap_or(1.0).clamp(0.0, 1.0) * 255.0) as u8,
                    ]
                })
                .collect();
            
            let rgba_img = image::RgbaImage::from_raw(width, height, rgba_data)
                .ok_or_else(|| "Failed to create RGBA image from JXL data".to_string())?;
            Ok(image::DynamicImage::ImageRgba8(rgba_img))
        }
    }
}

impl Default for ArchiveManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ArchiveManager {
    /// 清除缓存
    pub fn clear_cache(&self) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.clear();
        }
        if let Ok(mut archive_cache) = self.archive_cache.lock() {
            archive_cache.clear();
        }
    }

    /// 限制缓存大小（保留最近使用的项）
    pub fn limit_cache_size(&self, max_items: usize) {
        // 限制图片缓存
        if let Ok(mut cache) = self.cache.lock() {
            if cache.len() > max_items {
                // 简单策略：移除一半的条目
                let keys_to_remove: Vec<_> = cache.keys().take(cache.len() / 2).cloned().collect();
                for key in keys_to_remove {
                    cache.remove(&key);
                }
            }
        }
        
        // 限制压缩包缓存
        if let Ok(mut archive_cache) = self.archive_cache.lock() {
            if archive_cache.len() > 5 { // 压缩包实例通常较大，限制更严格
                let keys_to_remove: Vec<_> = archive_cache.keys().take(archive_cache.len() / 2).cloned().collect();
                for key in keys_to_remove {
                    archive_cache.remove(&key);
                }
            }
        }
    }

    /// 预加载压缩包中的所有图片
    pub fn preload_all_images(&self, archive_path: &Path) -> Result<usize, String> {
        let entries = self.list_zip_contents(archive_path)?;
        let image_entries: Vec<_> = entries.iter().filter(|e| e.is_image).collect();
        
        let mut loaded_count = 0;
        for entry in image_entries {
            if self.load_image_from_zip(archive_path, &entry.path).is_ok() {
                loaded_count += 1;
            }
        }
        
        Ok(loaded_count)
    }
}
