//! NeoView - Python Thumbnail Commands
//! 使用 Python FastAPI 服务的缩略图命令

use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::command;
use serde_json::Value;
use base64::{Engine as _, engine::general_purpose};
use crate::core::py_thumb_client::{PyThumbState, EnsureReq, PrefetchReq, get_client, normalize_path, get_file_mtime};

/// 启动 Python 缩略图服务
#[command]
pub async fn start_python_thumbnail_service(
    state: tauri::State<'_, PyThumbState>,
) -> Result<String, String> {
    let client = get_client(&state).await?;
    let health = client.health_check().await?;
    Ok(format!("Python 缩略图服务已启动，工作线程: {}", health.workers))
}

/// 停止 Python 缩略图服务
#[command]
pub fn stop_python_thumbnail_service(
    state: tauri::State<'_, PyThumbState>,
) -> Result<(), String> {
    if let Ok(mut client_guard) = state.client.lock() {
        if let Some(ref client) = *client_guard {
            client.stop_service()?;
            *client_guard = None;
        }
    }
    Ok(())
}

/// 获取缩略图二进制数据（新版本，使用 Python 服务）
#[command]
pub async fn get_thumbnail_blob(
    filePath: String,
    is_folder: Option<bool>,
    state: tauri::State<'_, PyThumbState>,
) -> Result<Vec<u8>, String> {
    let path = PathBuf::from(&filePath);
    let is_folder = is_folder.unwrap_or(false);
    let is_archive = is_archive_file(&path);
    
    let client = get_client(&state).await?;
    
    let req = EnsureReq {
        bookpath: normalize_path(&path),
        source_path: filePath.clone(),
        is_folder,
        is_archive,
        source_mtime: get_file_mtime(&path),
        max_size: 2048,
    };
    
    client.ensure_thumbnail(req).await
}

/// 批量获取缩略图二进制数据
#[command]
pub async fn get_thumbnail_blobs(
    filePaths: Vec<String>,
    state: tauri::State<'_, PyThumbState>,
) -> Result<Vec<(String, Vec<u8>)>, String> {
    if filePaths.is_empty() {
        return Ok(Vec::new());
    }
    
    let client = get_client(&state).await?;
    let mut results = Vec::new();
    
    // 并发获取，但限制并发数
    let semaphore = Arc::new(tokio::sync::Semaphore::new(8));
    let mut tasks = Vec::new();
    
    for file_path in filePaths {
        let path = PathBuf::from(&file_path);
        let is_archive = is_archive_file(&path);
        let client_clone = client.clone();
        let semaphore_clone = semaphore.clone();
        
        let task = tokio::spawn(async move {
            let _permit = semaphore_clone.acquire().await.unwrap();
            
            let req = EnsureReq {
                bookpath: normalize_path(&path),
                source_path: file_path.clone(),
                is_folder: false,
                is_archive,
                source_mtime: get_file_mtime(&path),
                max_size: 2048,
            };
            
            match client_clone.ensure_thumbnail(req).await {
                Ok(blob) => Some((file_path, blob)),
                Err(_) => None,
            }
        });
        
        tasks.push(task);
    }
    
    // 等待所有任务完成
    for task in tasks {
        if let Ok(Some(result)) = task.await {
            results.push(result);
        }
    }
    
    Ok(results)
}

/// 预加载目录缩略图
#[command]
pub async fn prefetch_thumbnails(
    dir_path: String,
    entries: Vec<Value>,
    state: tauri::State<'_, PyThumbState>,
) -> Result<i32, String> {
    let client = get_client(&state).await?;
    
    let req = PrefetchReq {
        dir_path,
        entries,
    };
    
    client.prefetch_directory(req).await
}

/// 生成文件缩略图（兼容旧接口，内部使用 Python 服务）
#[command]
pub async fn generate_file_thumbnail_python(
    filePath: String,
    state: tauri::State<'_, PyThumbState>,
) -> Result<String, String> {
    let path = PathBuf::from(&filePath);
    let is_archive = is_archive_file(&path);
    
    let client = get_client(&state).await?;
    
    let req = EnsureReq {
        bookpath: normalize_path(&path),
        source_path: filePath.clone(),
        is_folder: false,
        is_archive,
        source_mtime: get_file_mtime(&path),
        max_size: 2048,
    };
    
    let blob = client.ensure_thumbnail(req).await?;
    
    // 转换为 base64 data URL（保持兼容性）
    let base64 = general_purpose::STANDARD.encode(&blob);
    Ok(format!("data:image/webp;base64,{}", base64))
}

/// 生成文件夹缩略图（兼容旧接口，内部使用 Python 服务）
#[command]
pub async fn generate_folder_thumbnail_python(
    folderPath: String,
    state: tauri::State<'_, PyThumbState>,
) -> Result<String, String> {
    let path = PathBuf::from(&folderPath);
    
    let client = get_client(&state).await?;
    
    let req = EnsureReq {
        bookpath: normalize_path(&path),
        source_path: folderPath.clone(),
        is_folder: true,
        is_archive: false,
        source_mtime: get_file_mtime(&path),
        max_size: 2048,
    };
    
    let blob = client.ensure_thumbnail(req).await?;
    
    // 转换为 base64 data URL（保持兼容性）
    let base64 = general_purpose::STANDARD.encode(&blob);
    Ok(format!("data:image/webp;base64,{}", base64))
}

/// 生成压缩包缩略图（兼容旧接口，内部使用 Python 服务）
#[command]
pub async fn generate_archive_thumbnail_python(
    archivePath: String,
    state: tauri::State<'_, PyThumbState>,
) -> Result<String, String> {
    let path = PathBuf::from(&archivePath);
    
    let client = get_client(&state).await?;
    
    let req = EnsureReq {
        bookpath: normalize_path(&path),
        source_path: archivePath.clone(),
        is_folder: false,
        is_archive: true,
        source_mtime: get_file_mtime(&path),
        max_size: 2048,
    };
    
    let blob = client.ensure_thumbnail(req).await?;
    
    // 转换为 base64 data URL（保持兼容性）
    let base64 = general_purpose::STANDARD.encode(&blob);
    Ok(format!("data:image/webp;base64,{}", base64))
}

/// Python 服务健康检查
#[command]
pub async fn python_service_health(
    state: tauri::State<'_, PyThumbState>,
) -> Result<Value, String> {
    let client = {
        let client_guard = state.client.lock().unwrap();
        if let Some(ref client) = *client_guard {
            client.clone()
        } else {
            return Ok(serde_json::json!({
                "status": "stopped",
                "running": false
            }));
        }
    };
    
    match client.health_check().await {
        Ok(health) => Ok(serde_json::json!({
            "status": health.status,
            "workers": health.workers,
            "running": true
        })),
        Err(_) => Ok(serde_json::json!({
            "status": "error",
            "running": false
        }))
    }
}

/// 检查文件是否为压缩包
fn is_archive_file(path: &Path) -> bool {
    if let Some(ext) = path.extension() {
        let ext = ext.to_string_lossy().to_lowercase();
        matches!(ext.as_str(), "zip" | "rar" | "7z" | "cbz" | "cbr" | "cb7")
    } else {
        false
    }
}