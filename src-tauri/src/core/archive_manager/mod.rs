//! 统一压缩包管理器
//! 
//! 提供统一接口处理 ZIP、RAR、7z 等压缩格式
//! 支持流式读取，避免解压到磁盘

mod zip_handler;
mod rar_handler;
mod sevenz_handler;

use std::path::Path;

pub use zip_handler::ZipHandler;
pub use rar_handler::RarHandler;
pub use sevenz_handler::SevenZHandler;

/// 压缩包条目信息
#[derive(Debug, Clone)]
pub struct ArchiveEntry {
    /// 条目名称（相对路径）
    pub name: String,
    /// 是否为目录
    pub is_directory: bool,
    /// 解压后大小（可能未知）
    pub uncompressed_size: Option<u64>,
    /// 压缩后大小（可能未知）
    pub compressed_size: Option<u64>,
    /// 在压缩包中的索引
    pub index: usize,
}

impl ArchiveEntry {
    /// 获取文件扩展名（小写）
    pub fn extension(&self) -> Option<String> {
        Path::new(&self.name)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
    }
    
    /// 检查是否为图片文件
    pub fn is_image(&self) -> bool {
        const IMAGE_EXTS: &[&str] = &[
            "jpg", "jpeg", "png", "gif", "bmp", "webp", 
            "avif", "jxl", "tiff", "tif", "ico", "heic", "heif"
        ];
        self.extension()
            .map(|ext| IMAGE_EXTS.contains(&ext.as_str()))
            .unwrap_or(false)
    }
    
    /// 检查是否为视频文件
    pub fn is_video(&self) -> bool {
        const VIDEO_EXTS: &[&str] = &[
            "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v"
        ];
        self.extension()
            .map(|ext| VIDEO_EXTS.contains(&ext.as_str()))
            .unwrap_or(false)
    }
}

/// 压缩包处理器 trait
pub trait ArchiveHandler: Send + Sync {
    /// 获取压缩包中的所有条目
    fn list_entries(&mut self) -> Result<Vec<ArchiveEntry>, String>;
    
    /// 按索引读取条目内容到内存
    fn read_entry(&mut self, index: usize) -> Result<Vec<u8>, String>;
    
    /// 按名称读取条目内容到内存
    fn read_entry_by_name(&mut self, name: &str) -> Result<Vec<u8>, String>;
    
    /// 获取第一个图片条目
    fn first_image_entry(&mut self) -> Result<Option<ArchiveEntry>, String> {
        let entries = self.list_entries()?;
        Ok(entries.into_iter().find(|e| !e.is_directory && e.is_image()))
    }
    
    /// 读取第一张图片的数据
    fn read_first_image(&mut self) -> Result<Option<(ArchiveEntry, Vec<u8>)>, String> {
        if let Some(entry) = self.first_image_entry()? {
            let data = self.read_entry(entry.index)?;
            Ok(Some((entry, data)))
        } else {
            Ok(None)
        }
    }
}

/// 压缩格式类型
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ArchiveFormat {
    Zip,
    Rar,
    SevenZ,
}

impl ArchiveFormat {
    /// 从文件扩展名检测格式
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().as_str() {
            "zip" | "cbz" => Some(Self::Zip),
            "rar" | "cbr" => Some(Self::Rar),
            "7z" | "cb7" => Some(Self::SevenZ),
            _ => None,
        }
    }
    
    /// 从文件路径检测格式
    pub fn from_path(path: &Path) -> Option<Self> {
        path.extension()
            .and_then(|e| e.to_str())
            .and_then(Self::from_extension)
    }
}

/// 打开压缩包，返回对应的处理器
pub fn open_archive(path: &Path) -> Result<Box<dyn ArchiveHandler>, String> {
    let format = ArchiveFormat::from_path(path)
        .ok_or_else(|| format!("不支持的压缩格式: {:?}", path.extension()))?;
    
    match format {
        ArchiveFormat::Zip => {
            let handler = ZipHandler::open(path)?;
            Ok(Box::new(handler))
        }
        ArchiveFormat::Rar => {
            let handler = RarHandler::open(path)?;
            Ok(Box::new(handler))
        }
        ArchiveFormat::SevenZ => {
            let handler = SevenZHandler::open(path)?;
            Ok(Box::new(handler))
        }
    }
}

/// 从内存数据打开 ZIP 压缩包
pub fn open_zip_from_memory(data: Vec<u8>) -> Result<Box<dyn ArchiveHandler>, String> {
    let handler = ZipHandler::from_memory(data)?;
    Ok(Box::new(handler))
}

/// 快速获取压缩包中第一张图片
/// 优化版本，避免列出所有条目
pub fn get_first_image(path: &Path) -> Result<Option<(ArchiveEntry, Vec<u8>)>, String> {
    let mut handler = open_archive(path)?;
    handler.read_first_image()
}

/// 获取压缩包中的所有图片条目
pub fn list_images(path: &Path) -> Result<Vec<ArchiveEntry>, String> {
    let mut handler = open_archive(path)?;
    let entries = handler.list_entries()?;
    Ok(entries.into_iter().filter(|e| !e.is_directory && e.is_image()).collect())
}
