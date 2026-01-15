// 压缩包工具函数模块
// 包含路径规范化、MIME 类型检测、图片处理等工具函数

use super::types::{ArchiveMetadata, ARCHIVE_IMAGE_EXTENSIONS, ARCHIVE_VIDEO_EXTENSIONS};
use chrono::{NaiveDate, NaiveDateTime, NaiveTime};
use image::GenericImageView;
use std::ffi::OsStr;
use std::fs;
use std::io::{Cursor, Read};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// 规范化压缩包缓存键，统一使用正斜杠
#[inline]
pub fn normalize_archive_key(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

/// 规范化内部路径，统一使用正斜杠
#[inline]
pub fn normalize_inner_path(path: &str) -> String {
    path.replace('\\', "/")
}

/// 检查是否为图片文件（使用预编译 HashSet，O(1) 查找）
#[inline]
pub fn is_image_file(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(OsStr::to_str)
        .map(|ext| ARCHIVE_IMAGE_EXTENSIONS.contains(ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// 检查是否为视频文件（使用预编译 HashSet，O(1) 查找）
#[inline]
pub fn is_video_file(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(OsStr::to_str)
        .map(|ext| ARCHIVE_VIDEO_EXTENSIONS.contains(ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// 检测图片 MIME 类型
pub fn detect_image_mime_type(path: &str) -> &'static str {
    if let Some(ext) = Path::new(path).extension() {
        match ext.to_string_lossy().to_lowercase().as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            "bmp" => "image/bmp",
            "webp" => "image/webp",
            "avif" => "image/avif",
            "jxl" => "image/jxl",
            "tiff" | "tif" => "image/tiff",
            _ => "application/octet-stream",
        }
    } else {
        "application/octet-stream"
    }
}

/// 获取压缩包元数据
pub fn get_archive_metadata(archive_path: &Path) -> Result<ArchiveMetadata, String> {
    let meta = fs::metadata(archive_path).map_err(|e| format!("获取压缩包元数据失败: {}", e))?;

    let modified = meta
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    Ok(ArchiveMetadata {
        modified,
        file_size: meta.len(),
    })
}

/// 将 ZIP DateTime 转换为 Unix 时间戳
pub fn zip_datetime_to_unix(dt: Option<zip::DateTime>) -> Option<i64> {
    let dt = dt?;
    let date = NaiveDate::from_ymd_opt(dt.year() as i32, dt.month() as u32, dt.day() as u32)?;
    let time = NaiveTime::from_hms_opt(dt.hour() as u32, dt.minute() as u32, dt.second() as u32)?;
    let datetime = NaiveDateTime::new(date, time);
    Some(datetime.and_utc().timestamp())
}

/// 等比例缩放图片
pub fn resize_keep_aspect_ratio(img: &image::DynamicImage, max_size: u32) -> image::DynamicImage {
    let (width, height) = img.dimensions();

    // 如果图片尺寸小于等于最大尺寸，直接返回
    if width <= max_size && height <= max_size {
        return img.clone();
    }

    // 计算缩放比例
    let scale = if width > height {
        max_size as f32 / width as f32
    } else {
        max_size as f32 / height as f32
    };

    let new_width = (width as f32 * scale).round() as u32;
    let new_height = (height as f32 * scale).round() as u32;

    // 使用 Lanczos3 滤波器获得更好的缩放质量
    img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3)
}

/// 编码为 WebP 格式（更高效）
pub fn encode_webp(img: &image::DynamicImage) -> Result<Vec<u8>, String> {
    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);

    // WebP 支持透明度，使用 RGBA8
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();

    // 编码为 WebP，使用默认编码器（速度优化）
    image::write_buffer_with_format(
        &mut cursor,
        rgba.as_raw(),
        width,
        height,
        image::ColorType::Rgba8,
        image::ImageFormat::WebP,
    )
    .map_err(|e| format!("编码WebP失败: {}", e))?;

    Ok(buffer)
}

/// 编码为 JPEG 格式（保留用于兼容性）
pub fn encode_jpeg(img: &image::DynamicImage) -> Result<Vec<u8>, String> {
    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);

    // 转换为 RGB8（JPEG不支持透明度）
    let rgb = img.to_rgb8();
    let (width, height) = rgb.dimensions();

    // 编码为 JPEG
    image::write_buffer_with_format(
        &mut cursor,
        rgb.as_raw(),
        width,
        height,
        image::ColorType::Rgb8,
        image::ImageFormat::Jpeg,
    )
    .map_err(|e| format!("编码JPEG失败: {}", e))?;

    Ok(buffer)
}

/// 流式读取器
pub struct StreamReader {
    receiver: std::sync::mpsc::Receiver<Result<Vec<u8>, String>>,
    buffer: Vec<u8>,
    position: usize,
}

impl StreamReader {
    pub fn new(receiver: std::sync::mpsc::Receiver<Result<Vec<u8>, String>>) -> Self {
        Self {
            receiver,
            buffer: Vec::new(),
            position: 0,
        }
    }
}

impl Read for StreamReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        // 如果当前缓冲区还有数据，先返回
        if self.position < self.buffer.len() {
            let remaining = self.buffer.len() - self.position;
            let to_copy = std::cmp::min(remaining, buf.len());
            buf[..to_copy].copy_from_slice(&self.buffer[self.position..self.position + to_copy]);
            self.position += to_copy;
            return Ok(to_copy);
        }

        // 获取下一块数据
        match self.receiver.recv() {
            Ok(Ok(chunk)) => {
                self.buffer = chunk;
                self.position = 0;

                // 递归调用以返回新数据
                self.read(buf)
            }
            Ok(Err(e)) => Err(std::io::Error::new(std::io::ErrorKind::Other, e)),
            Err(_) => {
                // 通道关闭，表示 EOF
                Ok(0)
            }
        }
    }
}
