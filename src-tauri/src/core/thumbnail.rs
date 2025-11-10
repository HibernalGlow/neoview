use std::path::Path;
use std::fs;
use image::{DynamicImage, ImageFormat, GenericImageView};
use std::io::Cursor;
use base64::{Engine as _, engine::general_purpose};
use crate::core::ThumbnailDatabase;

/// 缩略图管理器
pub struct ThumbnailManager {
    /// 缩略图数据库
    database: ThumbnailDatabase,
    /// 缩略图尺寸
    size: u32,
}

impl ThumbnailManager {
    /// 创建新的缩略图管理器
    pub fn new(db_path: &Path, size: u32) -> Result<Self, String> {
        let database = ThumbnailDatabase::new(db_path)
            .map_err(|e| format!("创建缩略图数据库失败: {}", e))?;

        Ok(Self {
            database,
            size,
        })
    }

    /// 重新初始化数据库路径
    pub fn reinitialize_database(&mut self, db_path: &Path) -> Result<(), String> {
        let database = ThumbnailDatabase::new(db_path)
            .map_err(|e| format!("重新创建缩略图数据库失败: {}", e))?;
        self.database = database;
        Ok(())
    }

    /// 生成缩略图（返回 base64 编码）
    pub fn generate_thumbnail(&self, image_path: &Path) -> Result<String, String> {
        let path_str = image_path.to_string_lossy();

        // 首先检查数据库缓存
        if let Ok(Some(cached_data)) = self.database.get_thumbnail(&path_str) {
            return Ok(cached_data);
        }

        // 生成新缩略图
        let thumbnail_data = self.generate_and_cache_thumbnail(image_path)?;

        // 存储到数据库
        self.database.store_thumbnail(&path_str, &thumbnail_data)
            .map_err(|e| format!("存储缩略图失败: {}", e))?;

        Ok(thumbnail_data)
    }

    /// 从字节数据生成缩略图（用于压缩包内图片）
    pub fn generate_thumbnail_from_bytes(&self, image_data: &[u8], max_size: u32) -> Result<String, String> {
        // 加载图片
        let img = image::load_from_memory(image_data)
            .map_err(|e| format!("加载图片失败: {}", e))?;

        // 生成等比例缩略图
        let thumbnail = self.resize_keep_aspect_ratio(&img, max_size);

        // 编码为 JPEG
        let jpeg_data = self.encode_jpeg(&thumbnail)?;

        // 返回 base64
        Ok(format!("data:image/jpeg;base64,{}", general_purpose::STANDARD.encode(&jpeg_data)))
    }

    /// 从缓存读取缩略图
    fn read_thumbnail_from_cache(&self, cache_path: &Path) -> Result<String, String> {
        let data = fs::read(cache_path)
            .map_err(|e| format!("读取缓存失败: {}", e))?;

        Ok(format!("data:image/jpeg;base64,{}", general_purpose::STANDARD.encode(&data)))
    }

    /// 生成并缓存缩略图
    fn generate_and_cache_thumbnail(&self, image_path: &Path) -> Result<String, String> {
        // 加载图片 - 支持 JXL、AVIF 等格式
        let img = self.load_image_with_format_support(image_path)?;

        // 生成等比例缩略图
        let thumbnail = self.resize_keep_aspect_ratio(&img, self.size);

        // 编码为 JPEG
        let jpeg_data = self.encode_jpeg(&thumbnail)?;

        // 返回 base64
        Ok(format!("data:image/jpeg;base64,{}", general_purpose::STANDARD.encode(&jpeg_data)))
    }

    /// 加载图片（支持 JXL 等特殊格式）
    fn load_image_with_format_support(&self, image_path: &Path) -> Result<DynamicImage, String> {
        // 读取文件
        let image_data = fs::read(image_path)
            .map_err(|e| format!("读取图片文件失败: {}", e))?;

        // 检查文件扩展名
        if let Some(ext) = image_path.extension().and_then(|e| e.to_str()) {
            let ext_lower = ext.to_lowercase();
            
            // JXL 格式处理
            if ext_lower == "jxl" {
                return self.decode_jxl_image(&image_data);
            }
            
            // AVIF 格式处理 - 显式指定格式
            if ext_lower == "avif" {
                return image::load_from_memory_with_format(&image_data, ImageFormat::Avif)
                    .map_err(|e| format!("加载 AVIF 图片失败: {}", e));
            }
        }

        // 其他格式使用标准加载
        image::load_from_memory(&image_data)
            .map_err(|e| format!("加载图片失败: {}", e))
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
        
        // 根据通道数创建对应的图像
        if channels == 1 {
            let gray_data: Vec<u8> = float_buf
                .iter()
                .map(|&v| (v.clamp(0.0, 1.0) * 255.0) as u8)
                .collect();
            
            let gray_img = image::GrayImage::from_raw(width, height, gray_data)
                .ok_or_else(|| "Failed to create gray image from JXL data".to_string())?;
            Ok(DynamicImage::ImageLuma8(gray_img))
        } else if channels == 3 {
            let rgb_data: Vec<u8> = float_buf
                .iter()
                .map(|&v| (v.clamp(0.0, 1.0) * 255.0) as u8)
                .collect();
            
            let rgb_img = image::RgbImage::from_raw(width, height, rgb_data)
                .ok_or_else(|| "Failed to create RGB image from JXL data".to_string())?;
            Ok(DynamicImage::ImageRgb8(rgb_img))
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
            Ok(DynamicImage::ImageRgba8(rgba_img))
        }
    }

    /// 等比例缩放图片
    fn resize_keep_aspect_ratio(&self, img: &DynamicImage, max_size: u32) -> DynamicImage {
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

    /// 编码为 JPEG 格式
    fn encode_jpeg(&self, img: &DynamicImage) -> Result<Vec<u8>, String> {
        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);

        // 转换为 RGB8（JPEG不支持透明度）
        let rgb = img.to_rgb8();
        let (width, height) = rgb.dimensions();

        // 编码为 JPEG，质量设置为85（在质量和文件大小之间取得良好平衡）
        image::write_buffer_with_format(
            &mut cursor,
            rgb.as_raw(),
            width,
            height,
            image::ColorType::Rgb8,
            ImageFormat::Jpeg,
        ).map_err(|e| format!("编码JPEG失败: {}", e))?;

        Ok(buffer)
    }

    /// 清理过期缩略图缓存
    pub fn cleanup_expired_cache(&self) -> Result<usize, String> {
        self.database.cleanup_expired()
            .map_err(|e| format!("清理过期缓存失败: {}", e))
    }

    /// 获取缓存统计信息
    pub fn get_cache_stats(&self) -> Result<(usize, u64), String> {
        self.database.get_stats()
            .map_err(|e| format!("获取缓存统计失败: {}", e))
    }
    pub fn generate_folder_thumbnail_force(&self, folder_path: &Path, max_size: u32) -> Result<String, String> {
        // 读取文件夹内容
        let entries = fs::read_dir(folder_path)
            .map_err(|e| format!("读取文件夹失败: {}", e))?;

        // 查找第一张图片文件
        for entry in entries {
            let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
            let path = entry.path();

            // 检查是否为图片文件
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();
                if matches!(ext_lower.as_str(), "jpg" | "jpeg" | "png" | "gif" | "bmp" | "tiff" | "webp" | "avif" | "jxl") {
                    // 找到第一张图片，生成缩略图并强制保存
                    return self.generate_and_cache_thumbnail(&path);
                }
            }
        }

        // 如果没有找到图片，查找压缩包
        let entries = fs::read_dir(folder_path)
            .map_err(|e| format!("读取文件夹失败: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
            let path = entry.path();

            // 检查是否为支持的压缩包
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();
                if matches!(ext_lower.as_str(), "zip" | "cbz" | "rar" | "cbr" | "7z" | "cb7") {
                    // 尝试从压缩包生成缩略图
                    return self.generate_archive_thumbnail_force(&path, max_size);
                }
            }
        }

        Err("文件夹中未找到可用的图片或压缩包".to_string())
    }

    /// 生成压缩包缩略图（强制生成，跳过缓存检查）
    pub fn generate_archive_thumbnail_force(&self, archive_path: &Path, max_size: u32) -> Result<String, String> {
        use crate::core::archive::ArchiveManager;

        let archive_manager = ArchiveManager::new();

        // 获取压缩包内容
        let contents = archive_manager.list_zip_contents(archive_path)?;

        // 查找第一张图片
        for item in contents {
            if item.is_image {
                // 从压缩包中提取图片数据
                let image_data = archive_manager.extract_file_from_zip(archive_path, &item.path)?;
                // 生成缩略图
                let thumbnail = self.resize_keep_aspect_ratio(&self.load_image_with_format_support_from_bytes(&image_data)?, max_size);
                let jpeg_data = self.encode_jpeg(&thumbnail)?;
                
                // 存储到数据库
                let base64_data = format!("data:image/jpeg;base64,{}", general_purpose::STANDARD.encode(&jpeg_data));
                let path_str = archive_path.to_string_lossy().to_string();
                self.database.store_thumbnail(&path_str, &base64_data)
                    .map_err(|e| format!("存储缩略图失败: {}", e))?;

                // 返回 base64
                return Ok(base64_data);
            }
        }

        Err("压缩包中未找到图片文件".to_string())
    }

    /// 从字节数据加载图片（支持特殊格式）
    fn load_image_with_format_support_from_bytes(&self, image_data: &[u8]) -> Result<DynamicImage, String> {
        // 检查文件扩展名（这里我们不知道扩展名，所以尝试标准加载）
        // 对于JXL格式，我们可能需要额外的处理，但这里简化处理
        image::load_from_memory(image_data)
            .map_err(|e| format!("加载图片失败: {}", e))
    }

    /// 生成文件夹缩略图
    pub fn generate_folder_thumbnail(&self, folder_path: &str, max_size: u32) -> Result<String, String> {
        // 检查数据库缓存
        if let Ok(Some(cached_data)) = self.database.get_thumbnail(folder_path) {
            return Ok(cached_data);
        }

        // 扫描文件夹中的图片
        let folder_path = Path::new(folder_path);
        let thumbnail_data = self.generate_folder_thumbnail_force(folder_path, max_size)?;

        // 存储到数据库
        self.database.store_thumbnail(folder_path.to_string_lossy().as_ref(), &thumbnail_data)
            .map_err(|e| format!("存储文件夹缩略图失败: {}", e))?;

        Ok(thumbnail_data)
    }

    /// 生成压缩包缩略图
    pub fn generate_archive_thumbnail(&self, archive_path: &str, max_size: u32) -> Result<String, String> {
        // 检查数据库缓存
        if let Ok(Some(cached_data)) = self.database.get_thumbnail(archive_path) {
            return Ok(cached_data);
        }

        // 从压缩包中提取图片
        let archive_path_obj = Path::new(archive_path);
        let thumbnail_data = self.generate_archive_thumbnail_force(archive_path_obj, max_size)?;

        // 存储到数据库
        self.database.store_thumbnail(archive_path, &thumbnail_data)
            .map_err(|e| format!("存储压缩包缩略图失败: {}", e))?;

        Ok(thumbnail_data)
    }

    /// 从base64图片数据生成缩略图
    pub fn generate_thumbnail_from_bytes_base64(&self, image_data_base64: &str, max_size: u32) -> Result<String, String> {
        // 解码base64数据
        let image_data = general_purpose::STANDARD.decode(image_data_base64)
            .map_err(|e| format!("解码base64图片数据失败: {}", e))?;

        self.generate_thumbnail_from_bytes(&image_data, max_size)
    }

    /// 清空所有缓存
    pub fn clear_all_cache(&self) -> Result<(), String> {
        self.database.clear_all()
            .map_err(|e| format!("清空缓存失败: {}", e))
    }

    /// 优化数据库
    pub fn optimize_database(&self) -> Result<(), String> {
        self.database.optimize()
            .map_err(|e| format!("优化数据库失败: {}", e))
    }
}
