use std::fs;
use std::path::{Path, PathBuf};
use image::{DynamicImage, ImageFormat};
use std::io::Cursor;
use base64::{Engine as _, engine::general_purpose};

/// 缩略图管理器
pub struct ThumbnailManager {
    /// 缩略图缓存目录
    cache_dir: PathBuf,
    /// 缩略图尺寸
    size: u32,
}

impl ThumbnailManager {
    /// 创建新的缩略图管理器
    pub fn new(cache_dir: PathBuf, size: u32) -> Result<Self, String> {
        // 确保缓存目录存在
        fs::create_dir_all(&cache_dir)
            .map_err(|e| format!("创建缓存目录失败: {}", e))?;

        Ok(Self {
            cache_dir,
            size,
        })
    }

    /// 获取缩略图缓存路径
    fn get_cache_path(&self, image_path: &Path) -> PathBuf {
        // 使用原文件路径的哈希值作为缓存文件名
        let hash = {
            use std::collections::hash_map::DefaultHasher;
            use std::hash::{Hash, Hasher};
            let mut hasher = DefaultHasher::new();
            image_path.to_string_lossy().hash(&mut hasher);
            hasher.finish()
        };

        self.cache_dir.join(format!("{}.webp", hash))
    }

    /// 生成缩略图（返回 base64 编码）
    pub fn generate_thumbnail(&self, image_path: &Path) -> Result<String, String> {
        // 检查缓存
        let cache_path = self.get_cache_path(image_path);
        
        if cache_path.exists() {
            // 检查缓存是否过期（原文件是否更新）
            if let (Ok(cache_meta), Ok(source_meta)) = (
                fs::metadata(&cache_path),
                fs::metadata(image_path)
            ) {
                if let (Ok(cache_time), Ok(source_time)) = (
                    cache_meta.modified(),
                    source_meta.modified()
                ) {
                    if cache_time >= source_time {
                        // 缓存有效，直接读取
                        return self.read_thumbnail_from_cache(&cache_path);
                    }
                }
            }
        }

        // 生成新缩略图
        self.generate_and_cache_thumbnail(image_path, &cache_path)
    }

    /// 从缓存读取缩略图
    fn read_thumbnail_from_cache(&self, cache_path: &Path) -> Result<String, String> {
        let data = fs::read(cache_path)
            .map_err(|e| format!("读取缓存失败: {}", e))?;

        Ok(format!("data:image/webp;base64,{}", general_purpose::STANDARD.encode(&data)))
    }

    /// 生成并缓存缩略图
    fn generate_and_cache_thumbnail(&self, image_path: &Path, cache_path: &Path) -> Result<String, String> {
        // 加载图片 - 支持 JXL、AVIF 等格式
        let img = self.load_image_with_format_support(image_path)?;

        // 生成缩略图
        let thumbnail = img.thumbnail(self.size, self.size);

        // 编码为 WebP
        let webp_data = self.encode_webp(&thumbnail)?;

        // 保存到缓存
        fs::write(cache_path, &webp_data)
            .map_err(|e| format!("保存缓存失败: {}", e))?;

        // 返回 base64
        Ok(format!("data:image/webp;base64,{}", general_purpose::STANDARD.encode(&webp_data)))
    }

    /// 加载图片（支持 JXL、AVIF 等特殊格式）
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
            
            // AVIF 格式处理
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

    /// 编码为 WebP 格式
    fn encode_webp(&self, img: &DynamicImage) -> Result<Vec<u8>, String> {
        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);

        // 转换为 RGBA8
        let rgba = img.to_rgba8();
        let (width, height) = rgba.dimensions();

        // 使用 PNG 格式作为临时方案（因为 image crate 不直接支持 WebP 编码）
        // 实际项目中应该使用 webp crate
        image::write_buffer_with_format(
            &mut cursor,
            rgba.as_raw(),
            width,
            height,
            image::ColorType::Rgba8,
            ImageFormat::Png,
        ).map_err(|e| format!("编码图片失败: {}", e))?;

        Ok(buffer)
    }

    /// 清除过期缓存（可选的后台任务）
    pub fn cleanup_cache(&self, max_age_days: u64) -> Result<usize, String> {
        use std::time::{SystemTime, Duration};

        let max_age = Duration::from_secs(max_age_days * 24 * 60 * 60);
        let now = SystemTime::now();
        let mut removed_count = 0;

        let entries = fs::read_dir(&self.cache_dir)
            .map_err(|e| format!("读取缓存目录失败: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
            let path = entry.path();

            if let Ok(metadata) = fs::metadata(&path) {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(age) = now.duration_since(modified) {
                        if age > max_age {
                            if fs::remove_file(&path).is_ok() {
                                removed_count += 1;
                            }
                        }
                    }
                }
            }
        }

        Ok(removed_count)
    }

    /// 获取缓存大小
    pub fn get_cache_size(&self) -> Result<u64, String> {
        let mut total_size = 0u64;

        let entries = fs::read_dir(&self.cache_dir)
            .map_err(|e| format!("读取缓存目录失败: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
            if let Ok(metadata) = entry.metadata() {
                total_size += metadata.len();
            }
        }

        Ok(total_size)
    }

    /// 清空所有缓存
    pub fn clear_all_cache(&self) -> Result<usize, String> {
        let mut removed_count = 0;

        let entries = fs::read_dir(&self.cache_dir)
            .map_err(|e| format!("读取缓存目录失败: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
            let path = entry.path();
            
            if fs::remove_file(&path).is_ok() {
                removed_count += 1;
            }
        }

        Ok(removed_count)
    }
}
