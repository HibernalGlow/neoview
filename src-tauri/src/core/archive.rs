use std::fs::File;
use std::io::{Read, Cursor};
use std::path::Path;
use zip::ZipArchive;
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose};

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
                "tiff".to_string(),
                "tif".to_string(),
            ],
        }
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

    /// 从 ZIP 压缩包中提取文件内容
    pub fn extract_file_from_zip(
        &self,
        archive_path: &Path,
        file_path: &str,
    ) -> Result<Vec<u8>, String> {
        let file = File::open(archive_path)
            .map_err(|e| format!("打开压缩包失败: {}", e))?;

        let mut archive = ZipArchive::new(file)
            .map_err(|e| format!("读取压缩包失败: {}", e))?;

        let mut zip_file = archive.by_name(file_path)
            .map_err(|e| format!("在压缩包中找不到文件: {}", e))?;

        let mut buffer = Vec::new();
        zip_file.read_to_end(&mut buffer)
            .map_err(|e| format!("读取文件失败: {}", e))?;

        Ok(buffer)
    }

    /// 从 ZIP 压缩包中加载图片（返回 base64）
    pub fn load_image_from_zip(
        &self,
        archive_path: &Path,
        file_path: &str,
    ) -> Result<String, String> {
        let data = self.extract_file_from_zip(archive_path, file_path)?;

        // 检测图片类型
        let mime_type = self.detect_image_mime_type(file_path);

        // 编码为 base64
        let base64_data = general_purpose::STANDARD.encode(&data);
        Ok(format!("data:{};base64,{}", mime_type, base64_data))
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

    /// 生成压缩包内图片的缩略图
    pub fn generate_thumbnail_from_zip(
        &self,
        archive_path: &Path,
        file_path: &str,
        max_size: u32,
    ) -> Result<String, String> {
        // 提取图片数据
        let data = self.extract_file_from_zip(archive_path, file_path)?;

        // 加载图片
        let img = image::load_from_memory(&data)
            .map_err(|e| format!("加载图片失败: {}", e))?;

        // 生成缩略图
        let thumbnail = img.thumbnail(max_size, max_size);

        // 编码为 PNG
        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);
        
        thumbnail.write_to(&mut cursor, image::ImageFormat::Png)
            .map_err(|e| format!("编码缩略图失败: {}", e))?;

        // 返回 base64
        Ok(format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(&buffer)))
    }
}

impl Default for ArchiveManager {
    fn default() -> Self {
        Self::new()
    }
}
