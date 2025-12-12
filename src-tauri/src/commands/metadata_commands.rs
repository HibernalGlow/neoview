//! 统一文件元数据命令
//! 提供单一入口获取所有类型文件的元数据

use crate::commands::fs_commands::FsState;
use log::info;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::Arc;
use std::time::UNIX_EPOCH;
use tauri::async_runtime::spawn_blocking;
use tauri::State;

/// 图像元数据响应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMetadataResponse {
    pub path: String,
    pub inner_path: Option<String>,
    pub name: String,
    pub size: Option<u64>,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub format: Option<String>,
    pub color_depth: Option<String>,
    /// 扩展字段（用于保留未知字段）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Value>,
}

/// 从文件路径提取文件名
fn extract_file_name(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    normalized
        .rsplit('/')
        .next()
        .unwrap_or(&normalized)
        .to_string()
}

/// 从文件名提取格式
fn extract_format(name: &str) -> Option<String> {
    name.rsplit('.')
        .next()
        .filter(|ext| !ext.is_empty() && ext.len() < 10)
        .map(|ext| ext.to_lowercase())
}

/// 获取图像尺寸（使用 image crate 的快速解码）
fn get_image_dimensions(data: &[u8]) -> Option<(u32, u32)> {
    // 使用 image crate 的 guess_format 和 dimensions
    if let Ok(format) = image::guess_format(data) {
        let reader = image::ImageReader::with_format(std::io::Cursor::new(data), format);
        if let Ok((width, height)) = reader.into_dimensions() {
            return Some((width, height));
        }
    }
    None
}

/// 获取图像格式字符串
fn get_image_format_string(data: &[u8]) -> Option<String> {
    image::guess_format(data).ok().map(|f| match f {
        image::ImageFormat::Png => "png".to_string(),
        image::ImageFormat::Jpeg => "jpeg".to_string(),
        image::ImageFormat::Gif => "gif".to_string(),
        image::ImageFormat::WebP => "webp".to_string(),
        image::ImageFormat::Bmp => "bmp".to_string(),
        image::ImageFormat::Tiff => "tiff".to_string(),
        image::ImageFormat::Avif => "avif".to_string(),
        _ => "unknown".to_string(),
    })
}

/// 获取图像元数据
/// 支持普通文件和压缩包内文件
#[tauri::command]
pub async fn get_image_metadata(
    path: String,
    inner_path: Option<String>,
    state: State<'_, FsState>,
) -> Result<ImageMetadataResponse, String> {
    let path_clone = path.clone();
    let inner_path_clone = inner_path.clone();

    if let Some(ref inner) = inner_path {
        // 压缩包内文件
        info!(
            "📋 [Metadata] 获取压缩包内文件元数据: {} :: {}",
            path, inner
        );

        let archive_manager = Arc::clone(&state.archive_manager);
        let archive_path = path.clone();
        let inner_path_str = inner.clone();

        let result = spawn_blocking(move || {
            let manager = archive_manager.lock().unwrap_or_else(|e| e.into_inner());

            // 从压缩包读取文件数据
            let data = manager
                .load_image_from_archive_binary(
                    &std::path::PathBuf::from(&archive_path),
                    &inner_path_str,
                )
                .map_err(|e| format!("读取压缩包文件失败: {}", e))?;

            let name = extract_file_name(&inner_path_str);
            let format = extract_format(&name).or_else(|| get_image_format_string(&data));
            let (width, height) = get_image_dimensions(&data).unzip();

            Ok::<ImageMetadataResponse, String>(ImageMetadataResponse {
                path: archive_path,
                inner_path: Some(inner_path_str),
                name,
                size: Some(data.len() as u64),
                created_at: None,
                modified_at: None,
                width,
                height,
                format,
                color_depth: None,
                extra: None,
            })
        })
        .await
        .map_err(|e| format!("spawn_blocking error: {}", e))??;

        return Ok(result);
    }

    // 普通文件
    info!("📋 [Metadata] 获取文件元数据: {}", path);

    let result = spawn_blocking(move || {
        let file_path = Path::new(&path_clone);

        if !file_path.exists() {
            return Err(format!("文件不存在: {}", path_clone));
        }

        let metadata = fs::metadata(file_path).map_err(|e| format!("获取文件元数据失败: {}", e))?;

        let name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let size = Some(metadata.len());

        let created_at = metadata
            .created()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| {
                chrono::DateTime::from_timestamp(d.as_secs() as i64, 0)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default()
            });

        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| {
                chrono::DateTime::from_timestamp(d.as_secs() as i64, 0)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default()
            });

        // 尝试读取图像尺寸
        let (width, height, format) = if file_path.is_file() {
            if let Ok(data) = fs::read(file_path) {
                let dims = get_image_dimensions(&data);
                let fmt = extract_format(&name).or_else(|| get_image_format_string(&data));
                (dims.map(|(w, _)| w), dims.map(|(_, h)| h), fmt)
            } else {
                (None, None, extract_format(&name))
            }
        } else {
            (None, None, None)
        };

        Ok(ImageMetadataResponse {
            path: path_clone,
            inner_path: inner_path_clone,
            name,
            size,
            created_at,
            modified_at,
            width,
            height,
            format,
            color_depth: None,
            extra: None,
        })
    })
    .await
    .map_err(|e| format!("spawn_blocking error: {}", e))??;

    Ok(result)
}
