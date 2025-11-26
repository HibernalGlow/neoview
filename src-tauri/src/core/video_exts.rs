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

/// 判断扩展名是否为视频扩展（不带点，如 "mp4"）
pub fn is_video_extension(ext: &str) -> bool {
    let lower = ext.to_ascii_lowercase();
    VIDEO_EXTENSIONS.contains(&lower.as_str())
}

/// 判断给定路径是否为视频文件
pub fn is_video_path(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| is_video_extension(ext))
        .unwrap_or(false)
}
