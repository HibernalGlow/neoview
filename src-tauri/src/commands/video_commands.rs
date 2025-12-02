use crate::core::video_thumbnail::VideoThumbnailGenerator;
use crate::core::video_exts;
use std::path::PathBuf;
use tauri::command;

/// 检查 FFmpeg 是否可用
#[command]
pub async fn check_ffmpeg_available() -> Result<bool, String> {
    Ok(VideoThumbnailGenerator::is_ffmpeg_available())
}

/// 生成视频缩略图
/// 返回 base64 编码的图片数据 URL
#[command]
pub async fn generate_video_thumbnail(
    video_path: String,
    time_seconds: Option<f64>,
) -> Result<String, String> {
    println!("🎬 [Rust] 开始生成视频缩略图: {}", video_path);

    let path = PathBuf::from(&video_path);
    let time = time_seconds.unwrap_or(10.0);

    // 检查 FFmpeg 可用性
    if !VideoThumbnailGenerator::is_ffmpeg_available() {
        return Err("FFmpeg 不可用，请安装 FFmpeg".to_string());
    }

    // 提取视频帧
    println!("🎥 [Rust] 提取视频帧 ({}秒处)...", time);
    let frame = VideoThumbnailGenerator::extract_frame(&path, time)
        .map_err(|e| format!("提取视频帧失败: {}", e))?;

    // 将图片编码为 base64
    use base64::engine::general_purpose;
    use base64::Engine;
    use image::ImageFormat;

    let mut buffer = Vec::new();
    {
        let mut cursor = std::io::Cursor::new(&mut buffer);
        frame
            .write_to(&mut cursor, ImageFormat::Png)
            .map_err(|e| format!("编码图片失败: {}", e))?;
    }

    let base64 = general_purpose::STANDARD.encode(&buffer);
    let data_url = format!("data:image/png;base64,{}", base64);

    println!("✅ [Rust] 视频缩略图生成成功");
    Ok(data_url)
}

/// 获取视频时长
#[command]
pub async fn get_video_duration(video_path: String) -> Result<f64, String> {
    let path = PathBuf::from(&video_path);
    VideoThumbnailGenerator::get_duration(&path)
}

/// 检查是否为视频文件
#[command]
pub async fn is_video_file(file_path: String) -> Result<bool, String> {
    let path = PathBuf::from(&file_path);
    Ok(video_exts::is_video_path(&path))
}

/// 直接加载视频文件
#[command]
pub async fn load_video(
    path: String,
    trace_id: Option<String>,
    _page_index: Option<usize>,
) -> Result<Vec<u8>, String> {
    if let Some(ref id) = trace_id {
        println!("[{}] 开始加载视频文件: {}", id, path);
    }

    use std::fs::File;
    use std::io::Read;
    use std::path::Path;

    let path_obj = Path::new(&path);
    if !path_obj.exists() {
        return Err(format!("视频文件不存在: {}", path));
    }

    let metadata = path_obj
        .metadata()
        .map_err(|e| format!("无法读取文件信息: {}", e))?;

    if metadata.len() > 500 * 1024 * 1024 {
        // 限制视频大小为500MB
        return Err(format!(
            "视频文件过大: {} MB (最大 500MB)",
            metadata.len() / 1024 / 1024
        ));
    }

    let mut file = File::open(path_obj).map_err(|e| format!("无法打开视频文件: {}", e))?;

    let mut buffer = Vec::with_capacity(metadata.len() as usize);
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("读取视频文件失败: {}", e))?;

    if let Some(ref id) = trace_id {
        println!("[{}] 视频加载成功: {} bytes", id, buffer.len());
    }

    Ok(buffer)
}

/// 从压缩包加载视频文件（支持 ZIP/RAR/7z）
#[command]
pub async fn load_video_from_archive(
    archive_path: String,
    file_path: String,
    trace_id: Option<String>,
    _page_index: Option<usize>,
) -> Result<Vec<u8>, String> {
    use crate::core::archive::ArchiveManager;
    use std::path::PathBuf;

    if let Some(ref id) = trace_id {
        println!(
            "[{}] 开始从压缩包加载视频: {} -> {}",
            id, archive_path, file_path
        );
    }

    let archive_path_buf = PathBuf::from(&archive_path);
    let manager = ArchiveManager::new();
    
    // 使用 extract_file 支持 ZIP/RAR/7z
    let buffer = manager.extract_file(&archive_path_buf, &file_path)?;

    // 检查文件大小
    let size = buffer.len();
    if size > 500 * 1024 * 1024 {
        return Err(format!(
            "视频文件过大: {} MB (最大 500MB)",
            size / 1024 / 1024
        ));
    }

    if let Some(ref id) = trace_id {
        println!("[{}] 视频加载成功: {} bytes", id, size);
    }

    Ok(buffer)
}
