use image::DynamicImage;
use std::fs;
use std::path::Path;
use std::process::Command;
use uuid::Uuid;

/// 视频缩略图生成器
pub struct VideoThumbnailGenerator;

impl VideoThumbnailGenerator {
    /// 检查 FFmpeg 是否可用
    pub fn is_ffmpeg_available() -> bool {
        Command::new("ffmpeg")
            .arg("-version")
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }

    /// 从视频提取帧
    pub fn extract_frame(video_path: &Path, time_seconds: f64) -> Result<DynamicImage, String> {
        // 创建临时文件用于存储提取的帧
        let temp_dir = std::env::temp_dir();
        let unique_id = Uuid::new_v4();
        let temp_file = temp_dir.join(format!(
            "neoview_frame_{}_{}.png",
            std::process::id(),
            unique_id
        ));

        // 使用 FFmpeg 提取指定时间的帧
        let output = Command::new("ffmpeg")
            .args(&[
                "-y", // 覆盖输出文件（即使极端情况下重名也不会报错）
                "-i",
                video_path.to_string_lossy().as_ref(),
                "-ss",
                &format!("{}", time_seconds),
                "-vframes",
                "1",
                "-q:v",
                "2",
                temp_file.to_string_lossy().as_ref(),
            ])
            .output()
            .map_err(|e| format!("FFmpeg 执行失败: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("FFmpeg 错误: {}", stderr));
        }

        // 读取提取的帧
        let frame_data = fs::read(&temp_file).map_err(|e| format!("读取帧文件失败: {}", e))?;

        // 清理临时文件
        let _ = fs::remove_file(&temp_file);

        // 加载图片
        image::load_from_memory(&frame_data).map_err(|e| format!("加载图片失败: {}", e))
    }

    /// 检查是否为视频文件
    pub fn is_video_file(path: &Path) -> bool {
        let extensions = [
            "mp4", "mkv", "avi", "mov", "flv", "webm", "wmv", "m4v", "mpg", "mpeg",
        ];

        path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| extensions.contains(&ext.to_lowercase().as_str()))
            .unwrap_or(false)
    }

    /// 获取视频时长（秒）
    pub fn get_duration(video_path: &Path) -> Result<f64, String> {
        let output = Command::new("ffprobe")
            .args(&[
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1:noprint_wrappers=1",
                video_path.to_string_lossy().as_ref(),
            ])
            .output()
            .map_err(|e| format!("FFprobe 执行失败: {}", e))?;

        if !output.status.success() {
            return Err("无法获取视频时长".to_string());
        }

        let duration_str = String::from_utf8_lossy(&output.stdout);
        duration_str
            .trim()
            .parse::<f64>()
            .map_err(|e| format!("解析时长失败: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_video_file() {
        assert!(VideoThumbnailGenerator::is_video_file(Path::new(
            "video.mp4"
        )));
        assert!(VideoThumbnailGenerator::is_video_file(Path::new(
            "movie.mkv"
        )));
        assert!(!VideoThumbnailGenerator::is_video_file(Path::new(
            "image.jpg"
        )));
    }
}
