//! 缩略图服务类型定义模块
//!
//! 包含文件类型枚举、任务结构、事件 payload 和缓存统计等类型

use serde::Serialize;
use std::path::Path;

/// 文件类型枚举
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ThumbnailFileType {
    /// 普通文件夹
    Folder,
    /// 压缩包 (zip, cbz, rar, cbr, 7z, cb7)
    Archive,
    /// 视频文件 (mp4, mkv, avi, etc)
    Video,
    /// 图片文件 (jpg, png, webp, etc)
    Image,
    /// 其他/未知文件
    Other,
}

/// 生成任务
#[derive(Clone)]
pub struct GenerateTask {
    pub path: String,
    pub directory: String,
    pub file_type: ThumbnailFileType,
    /// 去重键（通常为 path）
    pub dedup_key: String,
    /// 去重请求 ID（用于 release_with_id）
    pub dedup_request_id: u64,
    /// 距离中心的距离（越小优先级越高）
    pub center_distance: usize,
    /// 原始索引（用于平局时保持原顺序）
    pub original_index: usize,
}

impl GenerateTask {
    /// 比较优先级：中心距离越小优先级越高
    pub fn priority_cmp(&self, other: &Self) -> std::cmp::Ordering {
        // 先按中心距离升序（距离小的优先）
        match self.center_distance.cmp(&other.center_distance) {
            std::cmp::Ordering::Equal => {
                // 距离相同时，按原始索引排序
                self.original_index.cmp(&other.original_index)
            }
            other_order => other_order,
        }
    }
}

/// 缩略图就绪事件 payload
/// 优化：不再通过 IPC 传输 blob 数据，前端通过内建协议 URL /thumb/{key} 直接读取
/// 减少每个事件 10-30KB 的 JSON 序列化开销
#[derive(Clone, Serialize)]
pub struct ThumbnailReadyPayload {
    pub path: String,
}

/// 批量缩略图就绪事件 payload（优化：减少 IPC 调用）
#[derive(Clone, Serialize)]
pub struct ThumbnailBatchReadyPayload {
    pub items: Vec<ThumbnailReadyPayload>,
}

/// 缓存统计
#[derive(Clone, Serialize)]
pub struct CacheStats {
    pub memory_count: usize,
    pub memory_bytes: usize,
    pub database_count: i64,
    pub database_bytes: i64,
    pub queue_length: usize,
    pub active_workers: usize,
}

/// 检测文件类型
pub fn detect_file_type(path: &str) -> ThumbnailFileType {
    // 如果以斜杠结尾，肯定是文件夹
    if path.ends_with('/') || path.ends_with('\\') {
        return ThumbnailFileType::Folder;
    }

    let path_lower = path.to_lowercase();

    // 检测压缩包
    if path_lower.ends_with(".zip")
        || path_lower.ends_with(".cbz")
        || path_lower.ends_with(".rar")
        || path_lower.ends_with(".cbr")
        || path_lower.ends_with(".7z")
        || path_lower.ends_with(".cb7")
    {
        return ThumbnailFileType::Archive;
    }

    // 检测视频（统一引用 video_exts）
    if crate::core::video_exts::is_video_path(Path::new(path)) {
        return ThumbnailFileType::Video;
    }

    // 检测图片
    if path_lower.ends_with(".jpg")
        || path_lower.ends_with(".jpeg")
        || path_lower.ends_with(".png")
        || path_lower.ends_with(".gif")
        || path_lower.ends_with(".webp")
        || path_lower.ends_with(".bmp")
        || path_lower.ends_with(".avif")
        || path_lower.ends_with(".jxl")
        || path_lower.ends_with(".heic")
        || path_lower.ends_with(".heif")
        || path_lower.ends_with(".tiff")
        || path_lower.ends_with(".tif")
        || path_lower.ends_with(".svg")
        || path_lower.ends_with(".ico")
    {
        return ThumbnailFileType::Image;
    }

    // 检查是否是文件夹（使用文件系统检查，因为文件夹名可能包含点号）
    let path_obj = Path::new(path);

    // 首选：使用文件系统检查（最准确）
    if let Ok(metadata) = std::fs::metadata(path) {
        if metadata.is_dir() {
            return ThumbnailFileType::Folder;
        }
    }

    // 备选：如果没有扩展名，默认认为是文件夹
    if path_obj.extension().is_none() {
        return ThumbnailFileType::Folder;
    }

    // 检查扩展名是否可能是误判（文件夹名包含点号）
    // 如果扩展名长度超过 5 或包含空格/特殊字符，可能是文件夹名的一部分
    if let Some(ext) = path_obj.extension() {
        let ext_str = ext.to_string_lossy();
        if ext_str.len() > 5
            || ext_str.contains(' ')
            || ext_str.contains('(')
            || ext_str.contains(')')
        {
            return ThumbnailFileType::Folder;
        }
    }

    ThumbnailFileType::Other
}

/// 快速判断路径是否可能是文件夹（避免系统调用）
/// 启发式规则：没有扩展名或以斜杠结尾的路径可能是文件夹
pub fn is_likely_folder(path: &str) -> bool {
    // 如果以斜杠结尾，肯定是文件夹
    if path.ends_with('/') || path.ends_with('\\') {
        return true;
    }

    let path_obj = Path::new(path);

    // 如果有明显的文件扩展名，认为是文件
    if let Some(ext) = path_obj.extension() {
        let ext_lower = ext.to_string_lossy().to_lowercase();
        // 图片/压缩包扩展名
        if matches!(
            ext_lower.as_str(),
            // 图片
            "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "tiff" | "svg" | 
            "avif" | "jxl" | "heic" | "heif" | "ico" | "raw" | "cr2" | "nef" |
            // 压缩包
            "zip" | "rar" | "7z" | "cbz" | "cbr" | "cb7" | "tar" | "gz" |
            // 其他
            "pdf" | "psd" | "ai" | "txt" | "json" | "xml"
        ) {
            return false;
        }
        // 视频扩展名（统一引用 video_exts）
        if crate::core::video_exts::is_video_extension(&ext_lower) {
            return false;
        }
    }

    // 如果没有扩展名或扩展名不在列表中，认为是文件夹
    // 不调用 path_obj.is_dir() 以避免阻塞文件系统调用
    true
}

/// 判断是否为压缩包文件
pub fn is_archive_file(path: &str) -> bool {
    matches!(detect_file_type(path), ThumbnailFileType::Archive)
}
