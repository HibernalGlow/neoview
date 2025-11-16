use std::path::PathBuf;
use tauri::command;
use crate::core::video_thumbnail::VideoThumbnailGenerator;

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
    use image::ImageFormat;
    use base64::engine::general_purpose;
    use base64::Engine;
    
    let mut buffer = Vec::new();
    {
        let mut cursor = std::io::Cursor::new(&mut buffer);
        frame.write_to(&mut cursor, ImageFormat::Png)
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
    Ok(VideoThumbnailGenerator::is_video_file(&path))
}
