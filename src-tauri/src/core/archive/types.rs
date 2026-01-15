// 压缩包类型定义模块
// 包含 ArchiveEntry, ArchiveMetadata, CachedImageEntry, ArchiveFormat 等类型

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::ffi::OsStr;
use std::path::Path;
use std::time::Instant;

/// 预编译的图片扩展名集合（压缩包内部使用）
pub static ARCHIVE_IMAGE_EXTENSIONS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    [
        "jpg", "jpeg", "png", "gif", "bmp", "webp", "avif", "jxl", "tiff", "tif",
    ]
    .into_iter()
    .collect()
});

/// 预编译的视频扩展名集合（压缩包内部使用）
pub static ARCHIVE_VIDEO_EXTENSIONS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    ["mp4", "webm", "mkv", "avi", "mov", "wmv", "flv", "m4v"]
        .into_iter()
        .collect()
});

/// 预编译的压缩包扩展名映射
pub static ZIP_EXTENSIONS: Lazy<HashSet<&'static str>> =
    Lazy::new(|| ["zip", "cbz"].into_iter().collect());
pub static RAR_EXTENSIONS: Lazy<HashSet<&'static str>> =
    Lazy::new(|| ["rar", "cbr"].into_iter().collect());
pub static SEVENZ_EXTENSIONS: Lazy<HashSet<&'static str>> =
    Lazy::new(|| ["7z", "cb7"].into_iter().collect());

/// 图片缓存大小限制
pub const IMAGE_CACHE_LIMIT: usize = 1024;

/// 压缩包格式类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArchiveFormat {
    Zip,
    Rar,
    SevenZ,
    Unknown,
}

impl ArchiveFormat {
    /// 根据文件扩展名判断格式（使用预编译 HashSet，O(1) 查找）
    #[inline]
    pub fn from_extension(path: &Path) -> Self {
        path.extension()
            .and_then(OsStr::to_str)
            .map(|ext| {
                let lower = ext.to_ascii_lowercase();
                let s = lower.as_str();
                if ZIP_EXTENSIONS.contains(s) {
                    ArchiveFormat::Zip
                } else if RAR_EXTENSIONS.contains(s) {
                    ArchiveFormat::Rar
                } else if SEVENZ_EXTENSIONS.contains(s) {
                    ArchiveFormat::SevenZ
                } else {
                    ArchiveFormat::Unknown
                }
            })
            .unwrap_or(ArchiveFormat::Unknown)
    }

    /// 检查格式是否受支持
    pub fn is_supported(&self) -> bool {
        matches!(
            self,
            ArchiveFormat::Zip | ArchiveFormat::Rar | ArchiveFormat::SevenZ
        )
    }
}

/// 缓存的图片条目
#[derive(Clone)]
pub struct CachedImageEntry {
    pub data: Vec<u8>,
    pub last_used: Instant,
}

/// 压缩包元数据
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ArchiveMetadata {
    pub modified: u64,
    pub file_size: u64,
}

/// 压缩包内的文件项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub is_image: bool,
    pub is_video: bool,
    pub entry_index: usize,
    pub modified: Option<i64>,
}
