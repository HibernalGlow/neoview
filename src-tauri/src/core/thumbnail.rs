use std::fs;
use std::path::{Path, PathBuf};
use image::{DynamicImage, ImageFormat, GenericImageView};
use std::io::Cursor;
use base64::{Engine as _, engine::general_purpose};
use chrono::{DateTime, Utc};
use crate::core::thumbnail_db::{ThumbnailDatabase, ThumbnailRecord};

/// 缩略图信息
#[derive(Debug, Clone)]
pub struct ThumbnailInfo {
    pub url: String,
    pub width: u32,
    pub height: u32,
    pub file_size: u64,
    pub created_at: DateTime<Utc>,
    pub is_folder: bool,
}

/// 缩略图管理器
pub struct ThumbnailManager {
    /// 缩略图数据库
    db: ThumbnailDatabase,
    /// 缩略图尺寸
    size: u32,
    /// 根目录，用于计算相对路径
    root_dir: PathBuf,
}

impl ThumbnailManager {
    /// 创建新的缩略图管理器
    pub fn new(thumbnail_root: PathBuf, root_dir: PathBuf, size: u32) -> Result<Self, String> {
        // 创建数据库
        let db = ThumbnailDatabase::new(thumbnail_root.clone())
            .map_err(|e| format!("创建缩略图数据库失败: {}", e))?;

        Ok(Self {
            db,
            size,
            root_dir,
        })
    }

    /// 获取相对路径
    pub fn get_relative_path(&self, full_path: &Path) -> Result<PathBuf, String> {
        // 尝试获取相对于根目录的路径
        match full_path.strip_prefix(&self.root_dir) {
            Ok(relative) => Ok(relative.to_path_buf()),
            Err(_) => {
                // 如果不在根目录下，使用完整路径作为相对路径
                println!("⚠️ 路径 {} 不在根目录 {} 下，使用完整路径", full_path.display(), self.root_dir.display());
                Ok(full_path.to_path_buf())
            }
        }
    }

    /// 规范化路径字符串，统一使用正斜杠
    fn normalize_path_string(path: &Path) -> String {
        path.to_string_lossy().replace('\\', "/")
    }

    /// 预加载缩略图到内存缓存
    pub fn preload_thumbnails_to_cache(&self, cache: &crate::core::image_cache::ImageCache) -> Result<usize, String> {
        println!("🔄 开始预加载缩略图到内存缓存...");
        
        // 获取数据库中的所有缩略图记录
        let records = self.db.get_all_thumbnails()
            .map_err(|e| format!("获取数据库记录失败: {}", e))?;
        
        let mut loaded_count = 0;
        
        for record in records {
            // 构建完整的缩略图文件路径（record.relative_thumb_path 已经是相对于 thumbnail_root 的路径）
            let thumbnail_path = self.db.thumbnail_root.join(&record.relative_thumb_path);

            // 检查文件是否存在
            if thumbnail_path.exists() {
                let thumbnail_url = format!("file://{}", thumbnail_path.to_string_lossy());

                // 计算原始文件的完整路径（bookpath 字段可能是相对于 root 的路径或绝对路径）
                let original_path = {
                    let book = record.bookpath.as_str();
                    let book_path = Path::new(book);
                    if book_path.is_absolute() {
                        book_path.to_path_buf()
                    } else {
                        self.root_dir.join(book_path)
                    }
                };

                // 添加到内存缓存：使用完整路径字符串作为 key，以便与前端请求的 path.to_string_lossy() 保持一致
                cache.set(original_path.to_string_lossy().to_string(), thumbnail_url.clone());
                // 另外也把相对 bookpath（数据库中的 bookpath 字符串）也注册一次，方便前端使用相对 key 查找
                cache.set(record.bookpath.clone(), thumbnail_url);
                loaded_count += 1;
            }
        }
        
        println!("✅ 预加载完成，共加载 {} 个缩略图", loaded_count);
        Ok(loaded_count)
    }

    /// 获取缩略图信息（包括尺寸等）
    pub fn get_thumbnail_info(&self, full_path: &Path) -> Result<Option<ThumbnailInfo>, String> {
        println!("🔍 ThumbnailManager::get_thumbnail_info - 完整路径: {}", full_path.display());
        let relative_path = self.get_relative_path(full_path)?;
        // 统一使用正斜杠作为路径分隔符，确保数据库查询一致
    let relative_str = relative_path.to_string_lossy().replace('\\', "/");
        println!("🔍 标准化相对路径: {}", relative_str);
        
        if let Ok(Some(record)) = self.db.find_by_bookpath(&relative_str) {
            println!("✅ 数据库中找到记录: {}", record.thumbnail_name);
            // 直接使用记录中的 relative_thumb_path 构建完整路径
            let thumbnail_path = self.db.thumbnail_root.join(&record.relative_thumb_path);
            if thumbnail_path.exists() {
                println!("✅ 缩略图文件存在: {}", thumbnail_path.display());
                Ok(Some(ThumbnailInfo {
                    url: format!("file://{}", thumbnail_path.to_string_lossy()),
                    width: record.width,
                    height: record.height,
                    file_size: record.file_size,
                    created_at: record.created_at,
                    is_folder: record.is_folder,
                }))
            } else {
                println!("❌ 缩略图文件不存在: {}", thumbnail_path.display());
                Ok(None)
            }
        } else {
            println!("❌ 数据库中未找到记录");
            Ok(None)
        }
    }

    /// 生成缩略图（返回文件URL）
    pub fn generate_thumbnail(&self, image_path: &Path) -> Result<String, String> {
        // 获取相对路径
    let relative_path = self.get_relative_path(image_path)?;
    let relative_str = relative_path.to_string_lossy();
        
        // 获取源文件修改时间
        let source_meta = fs::metadata(image_path)
            .map_err(|e| format!("获取文件元数据失败: {}", e))?;
        let source_modified = source_meta.modified()
            .map_err(|e| format!("获取修改时间失败: {}", e))?
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| format!("时间转换失败: {}", e))?
            .as_secs() as i64;

        // 检查数据库中是否已有有效缩略图
        if let Ok(Some(record)) = self.db.find_by_bookpath(&relative_str) {
            if record.source_modified == source_modified {
                // 缩略图有效，使用创建日期构建正确路径
                let thumbnail_path = self.db.thumbnail_root.join(&record.relative_thumb_path);
                if thumbnail_path.exists() {
                    return Ok(format!("file://{}", thumbnail_path.to_string_lossy()));
                }
            }
        }

        // 生成新缩略图
        self.generate_and_save_thumbnail(image_path, &relative_path, source_modified, false)
    }

    /// 从字节数据生成缩略图（用于压缩包内图片）
    pub fn generate_thumbnail_from_bytes(&self, image_data: &[u8], max_size: u32) -> Result<String, String> {
        // 加载图片
        let img = image::load_from_memory(image_data)
            .map_err(|e| format!("加载图片失败: {}", e))?;

        // 生成等比例缩略图
        let thumbnail = self.resize_keep_aspect_ratio(&img, max_size);

        // 编码为 WebP
        let webp_data = self.encode_webp(&thumbnail)?;

        // 返回 base64
        Ok(format!("data:image/webp;base64,{}", general_purpose::STANDARD.encode(&webp_data)))
    }

    /// 生成并保存缩略图到文件系统
    pub fn generate_and_save_thumbnail(
        &self,
        image_path: &Path,
        relative_path: &Path,
        source_modified: i64,
        is_folder: bool,
    ) -> Result<String, String> {
        // 加载图片 - 支持 JXL、AVIF 等格式
        let img = if is_folder {
            // 文件夹缩略图需要特殊处理
            return self.generate_folder_thumbnail(image_path, relative_path, source_modified);
        } else {
            self.load_image_with_format_support(image_path)?
        };

        // 生成等比例缩略图
        let thumbnail = self.resize_keep_aspect_ratio(&img, self.size);

        // 编码为 WebP
        let webp_data = self.encode_webp(&thumbnail)?;

    // 获取保存路径
    let now = Utc::now();
    let thumbnail_path = self.db.get_thumbnail_path(relative_path, &now);
        
        // 确保目录存在
        if let Some(parent) = thumbnail_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建缩略图目录失败: {}", e))?;
        }

        // 保存文件
        fs::write(&thumbnail_path, &webp_data)
            .map_err(|e| format!("保存缩略图失败: {}", e))?;

        // 获取文件信息
        let (width, height) = thumbnail.dimensions();
        let file_size = webp_data.len() as u64;
        let thumbnail_name = thumbnail_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&ThumbnailDatabase::hash_path(relative_path))
            .to_string();

        // 创建数据库记录：bookpath 存储原始文件的相对/绝对表示，relative_thumb_path 存储缩略图在 thumbnail_root 下的相对路径
        // 统一使用正斜杠作为路径分隔符，确保数据库查询一致
        let bookpath_str = relative_path.to_string_lossy().replace('\\', "/");
        let relative_thumb_path = thumbnail_path
            .strip_prefix(&self.db.thumbnail_root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| thumbnail_path.to_string_lossy().replace('\\', "/"));
        let hash = thumbnail_path.file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| ThumbnailDatabase::hash_path(relative_path));

        let record = ThumbnailRecord {
            bookpath: bookpath_str,
            relative_thumb_path: relative_thumb_path.to_string(),
            thumbnail_name,
            hash,
            created_at: now,
            source_modified,
            is_folder,
            width,
            height,
            file_size,
        };

        // 保存到数据库
        self.db.upsert_thumbnail(record)
            .map_err(|e| format!("保存数据库记录失败: {}", e))?;

        // 返回文件URL
        Ok(format!("file://{}", thumbnail_path.to_string_lossy()))
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
            
            // AVIF 格式处理
            if ext_lower == "avif" {
                // AVIF 格式可能需要特殊处理
                // 首先尝试使用 AVIF 格式加载
                match image::load_from_memory_with_format(&image_data, ImageFormat::Avif) {
                    Ok(img) => return Ok(img),
                    Err(e) => {
                        println!("⚠️ AVIF 格式加载失败: {}, 尝试通用加载", e);
                        // 如果 AVIF 格式加载失败，尝试通用加载
                        match image::load_from_memory(&image_data) {
                            Ok(img) => {
                                println!("✅ 通用加载成功");
                                return Ok(img);
                            },
                            Err(e2) => {
                                println!("❌ 通用加载也失败: {}", e2);
                                // 不再使用系统转换作为回退，改为返回错误，让调用方决定策略
                                return Err(format!("AVIF 解码失败: {} ; {}", e, e2));
                            }
                        }
                    }
                }
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

    // 已移除对系统工具（ImageMagick/FFmpeg）的 AVIF 回退转换。若 native 解码失败，则返回错误。

    /// 编码为 WebP 格式
    fn encode_webp(&self, img: &DynamicImage) -> Result<Vec<u8>, String> {
        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);

        // WebP 支持透明度，使用 RGBA8
        let rgba = img.to_rgba8();
        let (width, height) = rgba.dimensions();

        // 编码为 WebP，质量设置为85（在质量和文件大小之间取得良好平衡）
        image::write_buffer_with_format(
            &mut cursor,
            rgba.as_raw(),
            width,
            height,
            image::ColorType::Rgba8,
            ImageFormat::WebP,
        ).map_err(|e| format!("编码WebP失败: {}", e))?;

        Ok(buffer)
    }

    /// 生成文件夹缩略图
    fn generate_folder_thumbnail(
        &self,
        folder_path: &Path,
        relative_path: &Path,
        source_modified: i64,
    ) -> Result<String, String> {
        // 查找文件夹中的第一个图片或压缩包
        let first_image = self.find_first_image_in_folder(folder_path)?;
        
        if let Some(image_path) = first_image {
            // 检查是否为压缩包内的图片
            let img = if image_path.to_string_lossy().contains("__archive__") {
                // 从压缩包中提取图片
                self.extract_image_from_archive(&image_path)?
            } else {
                // 直接加载图片文件
                self.load_image_with_format_support(&image_path)?
            };
            
            let thumbnail = self.resize_keep_aspect_ratio(&img, self.size);
            let webp_data = self.encode_webp(&thumbnail)?;

            // 获取保存路径
            let now = Utc::now();
            let thumbnail_path = self.db.get_thumbnail_path(relative_path, &now);
            
            // 确保目录存在
            if let Some(parent) = thumbnail_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("创建缩略图目录失败: {}", e))?;
            }

            // 保存文件
            fs::write(&thumbnail_path, &webp_data)
                .map_err(|e| format!("保存缩略图失败: {}", e))?;

            // 获取文件信息
            let (width, height) = thumbnail.dimensions();
            let file_size = webp_data.len() as u64;
            let thumbnail_name = thumbnail_path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&ThumbnailDatabase::hash_path(relative_path))
                .to_string();

            // 创建数据库记录（folder）
            let bookpath_str = relative_path.to_string_lossy().replace('\\', "/");
            let relative_thumb_path = thumbnail_path
                .strip_prefix(&self.db.thumbnail_root)
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_else(|_| thumbnail_path.to_string_lossy().replace('\\', "/"));
            let hash = thumbnail_path.file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| ThumbnailDatabase::hash_path(relative_path));

            let record = ThumbnailRecord {
                bookpath: bookpath_str,
                relative_thumb_path: relative_thumb_path.to_string(),
                thumbnail_name,
                hash,
                created_at: now,
                source_modified,
                is_folder: true,
                width,
                height,
                file_size,
            };

            // 保存到数据库
            self.db.upsert_thumbnail(record)
                .map_err(|e| format!("保存数据库记录失败: {}", e))?;

            // 返回文件URL
            Ok(format!("file://{}", thumbnail_path.to_string_lossy()))
        } else {
            Err("文件夹中没有找到图片或压缩包".to_string())
        }
    }

    /// 查找文件夹中的第一个图片或压缩包（递归查找子目录）
    fn find_first_image_in_folder(&self, folder_path: &Path) -> Result<Option<PathBuf>, String> {
        if !folder_path.is_dir() {
            return Err("路径不是文件夹".to_string());
        }

        // 使用广度优先搜索，优先查找浅层目录
        let mut dirs_to_check = vec![folder_path.to_path_buf()];
        
        while let Some(current_dir) = dirs_to_check.pop() {
            let entries = fs::read_dir(&current_dir)
                .map_err(|e| format!("读取目录失败: {}", e))?;
            let mut entries_vec: Vec<_> = entries
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("读取条目失败: {}", e))?;
            
            // 按名称排序，确保结果一致
            entries_vec.sort_by(|a, b| {
                a.path()
                    .file_name()
                    .and_then(|n| n.to_str())
                    .cmp(&b.path().file_name().and_then(|n| n.to_str()))
            });

            // 首先查找图片文件
            for entry in entries_vec.iter() {
                let path = entry.path();
                
                // 跳过隐藏文件
                if let Some(name) = path.file_name() {
                    if name.to_string_lossy().starts_with('.') {
                        continue;
                    }
                }

                if path.is_file() && self.is_image_file(&path) {
                    return Ok(Some(path));
                }
            }

            // 如果没有图片，查找压缩包
            for entry in entries_vec.iter() {
                let path = entry.path();
                
                // 跳过隐藏文件
                if let Some(name) = path.file_name() {
                    if name.to_string_lossy().starts_with('.') {
                        continue;
                    }
                }

                if path.is_file() && self.is_archive_file(&path) {
                    // 尝试从压缩包中获取第一张图片
                    if let Ok(first_image) = self.get_first_image_from_archive(&path) {
                        return Ok(Some(first_image));
                    }
                }
            }

            // 将子目录添加到待检查列表（为了广度优先）
            for entry in entries_vec.iter() {
                let path = entry.path();
                if path.is_dir() {
                    // 跳过隐藏目录
                    if let Some(name) = path.file_name() {
                        if !name.to_string_lossy().starts_with('.') {
                            dirs_to_check.insert(0, path); // 插入到开头，保持广度优先
                        }
                    }
                }
            }
        }

        Ok(None)
    }

    /// 从压缩包中获取第一张图片
    fn get_first_image_from_archive(&self, archive_path: &Path) -> Result<PathBuf, String> {
        use crate::core::archive::ArchiveManager;
        
        let archive_manager = ArchiveManager::new();
        let entries = archive_manager.list_zip_contents(archive_path)
            .map_err(|e| format!("列出压缩包内容失败: {}", e))?;

        // 对条目按名称排序
        let mut sorted_entries = entries;
        sorted_entries.sort_by(|a, b| a.name.cmp(&b.name));

        for entry in sorted_entries {
            if !entry.is_dir && self.is_image_file(&Path::new(&entry.name)) {
                // 返回压缩包路径和内部图片路径的组合
                // 这将在生成文件夹缩略图时被特殊处理
                let combined_path = archive_path.join("__archive__").join(&entry.name);
                return Ok(combined_path);
            }
        }

        Err("压缩包中没有找到图片".to_string())
    }

    /// 检查文件是否为图片
    fn is_image_file(&self, path: &Path) -> bool {
        if let Some(ext) = path.extension() {
            let ext = ext.to_string_lossy().to_lowercase();
            matches!(
                ext.as_str(),
                "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "avif" | "jxl" | "tiff" | "tif"
            )
        } else {
            false
        }
    }

    /// 检查文件是否为压缩包
    fn is_archive_file(&self, path: &Path) -> bool {
        if let Some(ext) = path.extension() {
            let ext = ext.to_string_lossy().to_lowercase();
            matches!(
                ext.as_str(),
                "zip" | "rar" | "7z" | "cbz" | "cbr" | "cb7"
            )
        } else {
            false
        }
    }

    /// 获取缓存统计信息
    pub fn get_cache_stats(&self) -> Result<crate::core::thumbnail_db::ThumbnailStats, String> {
        self.db.get_stats()
            .map_err(|e| format!("获取缓存统计失败: {}", e))
    }

    /// 清空所有缓存
    pub fn clear_all_cache(&self) -> Result<usize, String> {
        let records = self.db.get_all_thumbnails()
            .map_err(|e| format!("获取缩略图列表失败: {}", e))?;
        
        let mut removed_count = 0;
        
        for record in records {
            let thumbnail_path = self.db.thumbnail_root.join(&record.thumbnail_name);
            if thumbnail_path.exists() {
                if fs::remove_file(&thumbnail_path).is_ok() {
                    removed_count += 1;
                }
            }
        }
        
        // 清空数据库
        
        self.db.conn.execute("DELETE FROM thumbnails", [])
            .map_err(|e| format!("清空数据库失败: {}", e))?;
        
        Ok(removed_count)
    }

    /// 清除过期缓存
    pub fn cleanup_expired(&self, max_age_days: u32) -> Result<usize, String> {
        self.db.cleanup_expired(max_age_days)
            .map_err(|e| format!("清理过期缩略图失败: {}", e))
    }

    /// 从压缩包中提取图片
    fn extract_image_from_archive(&self, combined_path: &Path) -> Result<DynamicImage, String> {
        use crate::core::archive::ArchiveManager;
        
        // 解析组合路径：archive_path/__archive__/image_path
        let path_str = combined_path.to_string_lossy();
        let parts: Vec<&str> = path_str.split("__archive__").collect();
        
        if parts.len() != 2 {
            return Err("无效的压缩包路径格式".to_string());
        }
        
        let archive_path = Path::new(parts[0]);
        let image_path_in_archive = parts[1].trim_start_matches(['/', '\\']);
        
        let archive_manager = ArchiveManager::new();
        let image_data = archive_manager.extract_file(archive_path, image_path_in_archive)
            .map_err(|e| format!("从压缩包提取图片失败: {}", e))?;
        
        // 加载提取的图片数据
        image::load_from_memory(&image_data)
            .map_err(|e| format!("加载压缩包内图片失败: {}", e))
    }

    
}
