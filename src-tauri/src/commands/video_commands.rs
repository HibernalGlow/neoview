use std::path::PathBuf;
use tauri::command;
use crate::core::video_thumbnail::VideoThumbnailGenerator;
use crate::commands::thumbnail_commands::ThumbnailManagerState;

/// 检查 FFmpeg 是否可用
#[command]
pub async fn check_ffmpeg_available() -> Result<bool, String> {
    Ok(VideoThumbnailGenerator::is_ffmpeg_available())
}

/// 生成视频缩略图
#[command]
pub async fn generate_video_thumbnail(
    video_path: String,
    time_seconds: Option<f64>,
    state: tauri::State<'_, ThumbnailManagerState>,
) -> Result<String, String> {
    println!("🎬 [Rust] 开始生成视频缩略图: {}", video_path);
    
    let path = PathBuf::from(&video_path);
    let time = time_seconds.unwrap_or(10.0);
    
    // 检查 FFmpeg 可用性
    if !VideoThumbnailGenerator::is_ffmpeg_available() {
        return Err("FFmpeg 不可用，请安装 FFmpeg".to_string());
    }
    
    // 检查缓存
    let cache_key = format!("video::{}::{}", video_path, time);
    if let Ok(cache) = state.cache.lock() {
        if let Some(cached_url) = cache.get(&cache_key) {
            if cached_url.starts_with("file://") {
                if cache.validate_file_url(&cache_key) {
                    println!("✅ [Rust] 视频缩略图缓存命中: {}", cached_url);
                    return Ok(cached_url);
                }
            } else {
                println!("✅ [Rust] 视频缩略图缓存命中: {}", cached_url);
                return Ok(cached_url);
            }
        }
    }
    
    // 提取视频帧
    println!("🎥 [Rust] 提取视频帧 ({}秒处)...", time);
    let frame = VideoThumbnailGenerator::extract_frame(&path, time)
        .map_err(|e| format!("提取视频帧失败: {}", e))?;
    
    // 生成缩略图
    if let Ok(manager_guard) = state.manager.lock() {
        if let Some(ref manager) = *manager_guard {
            println!("📸 [Rust] 生成视频缩略图...");
            
            let relative_path = manager.get_relative_path(&path)
                .map_err(|e| format!("获取相对路径失败: {}", e))?;
            
            let thumbnail_url = manager.save_thumbnail_for_archive(
                &frame,
                &path,
                &relative_path,
                &format!("video_frame_{}", time as i32),
            ).map_err(|e| format!("保存缩略图失败: {}", e))?;
            
            println!("✅ [Rust] 视频缩略图生成成功: {}", thumbnail_url);
            
            // 添加到缓存
            if let Ok(cache) = state.cache.lock() {
                cache.set(cache_key, thumbnail_url.clone());
            }
            
            return Ok(thumbnail_url);
        }
    }
    
    Err("缩略图管理器未初始化".to_string())
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
