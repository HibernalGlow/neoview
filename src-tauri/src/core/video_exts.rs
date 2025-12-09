use once_cell::sync::Lazy;
use std::collections::HashSet;
use std::ffi::OsStr;
use std::path::Path;

/// 默认视频扩展名列表
///
/// 注意：前端实际识别逻辑以前端 settings.image.videoFormats 为主，
/// 这里仅作为后端的兜底列表，用于：
/// - 书籍类型检测 (BookType::Media)
/// - 文件夹/压缩包内页构建 (is_video_file)
/// - 视频缩略图生成等
pub const VIDEO_EXTENSIONS: &[&str] = &[
    // 与前端 DEFAULT_VIDEO_EXTENSIONS 对齐
    "mp4",
    "m4v",
    "mov",
    "webm",
    "ogg",
    "ogv",
    "3gp",
    "3g2",
    "mkv",
    "avi",
    "flv",
    "wmv",
    // 传统容器
    "mpg",
    "mpeg",
    // 自定义扩展：常见场景是伪装为 mp4 的视频
    "nov",
];

/// 预编译的视频扩展名集合（O(1) 查找）
static VIDEO_EXTENSIONS_SET: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    VIDEO_EXTENSIONS.iter().copied().collect()
});

/// 判断扩展名是否为视频扩展（不带点，如 "mp4"）
#[inline]
pub fn is_video_extension(ext: &str) -> bool {
    VIDEO_EXTENSIONS_SET.contains(ext.to_ascii_lowercase().as_str())
}

/// 判断给定路径是否为视频文件（O(1) 查找）
#[inline]
pub fn is_video_path(path: &Path) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .map(|ext| VIDEO_EXTENSIONS_SET.contains(ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}
