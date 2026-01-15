//! 压缩包操作命令

use super::types::{ArchiveScanResult, PreloadResult};
use super::FsState;
use crate::commands::task_queue_commands::BackgroundSchedulerState;
use log::{info, warn};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;
use tauri::async_runtime::spawn_blocking;
use tauri::State;

/// 列出压缩包内容
#[tauri::command]
pub async fn list_archive_contents(
    archive_path: String,
    state: State<'_, FsState>,
) -> Result<Vec<crate::core::archive::ArchiveEntry>, String> {
    let archive_manager = state
        .archive_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path = PathBuf::from(archive_path);
    archive_manager.list_contents(&path)
}

/// 删除压缩包中的指定条目
#[tauri::command]
pub async fn delete_archive_entry(
    archive_path: String,
    inner_path: String,
    state: State<'_, FsState>,
) -> Result<(), String> {
    let archive_manager = state
        .archive_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path = PathBuf::from(&archive_path);
    archive_manager.delete_entry_from_zip(&path, &inner_path)
}

/// 【优化】从压缩包加载图片 - 使用 Response 直接传输二进制
#[tauri::command]
pub async fn load_image_from_archive_binary(
    archive_path: String,
    file_path: String,
    trace_id: Option<String>,
    page_index: Option<i32>,
    state: State<'_, FsState>,
) -> Result<tauri::ipc::Response, String> {
    let trace_id = trace_id.unwrap_or_else(|| {
        let millis = SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or_default();
        format!("rust-archive-bin-{}-{}", page_index.unwrap_or(-1), millis)
    });

    info!(
        "📥 [ImagePipeline:{}] load_image_from_archive_binary request archive={} inner={} page_index={:?}",
        trace_id, archive_path, file_path, page_index
    );

    let archive_manager = Arc::clone(&state.archive_manager);
    let archive_path_buf = PathBuf::from(&archive_path);
    let inner_path = file_path.clone();
    let result = spawn_blocking(move || {
        let manager = archive_manager
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        manager.load_image_from_archive_binary(&archive_path_buf, &inner_path)
    })
    .await
    .map_err(|e| format!("load_image_from_archive_binary join error: {}", e))?;

    match &result {
        Ok(bytes) => {
            info!(
                "📤 [ImagePipeline:{}] load_image_from_archive_binary success bytes={}",
                trace_id,
                bytes.len()
            );
            Ok(tauri::ipc::Response::new(bytes.clone()))
        },
        Err(err) => {
            warn!(
                "⚠️ [ImagePipeline:{}] load_image_from_archive_binary failed: {}",
                trace_id, err
            );
            Err(err.clone())
        }
    }
}

/// 【优化】从压缩包加载图片 - 使用 Base64 编码传输
#[tauri::command]
pub async fn load_image_from_archive_base64(
    archive_path: String,
    file_path: String,
    trace_id: Option<String>,
    page_index: Option<i32>,
    state: State<'_, FsState>,
) -> Result<String, String> {
    let trace_id = trace_id.unwrap_or_else(|| {
        let millis = SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or_default();
        format!("rust-archive-b64-{}-{}", page_index.unwrap_or(-1), millis)
    });

    info!(
        "📥 [ImagePipeline:{}] load_image_from_archive_base64 request archive={} inner={}",
        trace_id, archive_path, file_path
    );

    let archive_manager = Arc::clone(&state.archive_manager);
    let archive_path_buf = PathBuf::from(&archive_path);
    let inner_path = file_path.clone();
    let result = spawn_blocking(move || {
        let manager = archive_manager
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        manager.load_image_from_archive_binary(&archive_path_buf, &inner_path)
    })
    .await
    .map_err(|e| format!("load_image_from_archive_base64 join error: {}", e))?;

    match result {
        Ok(bytes) => {
            use base64::{engine::general_purpose::STANDARD, Engine};
            let encoded = STANDARD.encode(&bytes);
            info!(
                "📤 [ImagePipeline:{}] load_image_from_archive_base64 success bytes={} base64_len={}",
                trace_id, bytes.len(), encoded.len()
            );
            Ok(encoded)
        },
        Err(err) => {
            warn!(
                "⚠️ [ImagePipeline:{}] load_image_from_archive_base64 failed: {}",
                trace_id, err
            );
            Err(err)
        }
    }
}

/// 从压缩包加载图片 (兼容旧版)
#[tauri::command]
pub async fn load_image_from_archive(
    archive_path: String,
    file_path: String,
    trace_id: Option<String>,
    page_index: Option<i32>,
    state: State<'_, FsState>,
) -> Result<Vec<u8>, String> {
    let trace_id = trace_id.unwrap_or_else(|| {
        let millis = SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or_default();
        format!("rust-archive-{}-{}", page_index.unwrap_or(-1), millis)
    });

    info!(
        "📥 [ImagePipeline:{}] load_image_from_archive request archive={} inner={} page_index={:?}",
        trace_id, archive_path, file_path, page_index
    );

    let archive_manager = Arc::clone(&state.archive_manager);
    let archive_path_buf = PathBuf::from(&archive_path);
    let inner_path = file_path.clone();
    let result = spawn_blocking(move || {
        let manager = archive_manager
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        manager.load_image_from_archive_binary(&archive_path_buf, &inner_path)
    })
    .await
    .map_err(|e| format!("load_image_from_archive join error: {}", e))?;

    match &result {
        Ok(bytes) => info!(
            "📤 [ImagePipeline:{}] load_image_from_archive success bytes={}",
            trace_id,
            bytes.len()
        ),
        Err(err) => warn!(
            "⚠️ [ImagePipeline:{}] load_image_from_archive failed: {}",
            trace_id, err
        ),
    }

    result
}

/// 【优化】从压缩包解压图片到临时文件，返回临时文件路径
#[tauri::command]
pub async fn extract_image_to_temp(
    archive_path: String,
    file_path: String,
    trace_id: Option<String>,
    page_index: Option<i32>,
    state: State<'_, FsState>,
) -> Result<String, String> {
    let trace_id = trace_id.unwrap_or_else(|| {
        let millis = SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or_default();
        format!("rust-extract-{}-{}", page_index.unwrap_or(-1), millis)
    });

    info!(
        "📥 [ImagePipeline:{}] extract_image_to_temp request archive={} inner={} page_index={:?}",
        trace_id, archive_path, file_path, page_index
    );

    let archive_manager = Arc::clone(&state.archive_manager);
    let archive_path_buf = PathBuf::from(&archive_path);
    let inner_path = file_path.clone();
    
    let result = spawn_blocking(move || {
        let manager = archive_manager
            .lock()
            .unwrap_or_else(|e| e.into_inner());

        let ext = Path::new(&inner_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("jpg");
        
        let temp_dir = std::env::temp_dir().join("neoview_cache");
        std::fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;
        
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        archive_path_buf.hash(&mut hasher);
        inner_path.hash(&mut hasher);
        let hash = hasher.finish();
        
        let temp_path = temp_dir.join(format!("{:x}.{}", hash, ext));
        
        if temp_path.exists() {
            return Ok(temp_path.to_string_lossy().to_string());
        }

        manager.extract_file_to_path(&archive_path_buf, &inner_path, &temp_path)?;
        
        Ok(temp_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("extract_image_to_temp join error: {}", e))?;

    match &result {
        Ok(path) => info!(
            "📤 [ImagePipeline:{}] extract_image_to_temp success path={}",
            trace_id, path
        ),
        Err(err) => warn!(
            "⚠️ [ImagePipeline:{}] extract_image_to_temp failed: {}",
            trace_id, err
        ),
    }

    result
}

/// 从压缩包提取文件用于复制到剪贴板
#[tauri::command]
pub async fn extract_for_clipboard(
    archive_path: String,
    file_path: String,
    state: State<'_, FsState>,
) -> Result<String, String> {
    info!(
        "📥 [Clipboard] extract_for_clipboard request archive={} inner={}",
        archive_path, file_path
    );

    let archive_manager = Arc::clone(&state.archive_manager);
    let archive_path_buf = PathBuf::from(&archive_path);
    let inner_path = file_path.clone();
    
    let result = spawn_blocking(move || {
        let manager = archive_manager
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        
        let bytes = manager.load_image_from_archive_binary(&archive_path_buf, &inner_path)?;
        
        let ext = Path::new(&inner_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("jpg");
        
        let temp_dir = std::env::temp_dir().join("neoview_clipboard");
        std::fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;
        
        let archive_stem = archive_path_buf
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("archive");
        
        let inner_name = Path::new(&inner_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("file");
        
        let temp_path = temp_dir.join(format!("{}_{}.{}", archive_stem, inner_name, ext));
        
        std::fs::write(&temp_path, &bytes).map_err(|e| format!("写入临时文件失败: {}", e))?;
        
        Ok(temp_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("extract_for_clipboard join error: {}", e))?;

    match &result {
        Ok(path) => info!(
            "📤 [Clipboard] extract_for_clipboard success path={}",
            path
        ),
        Err(err) => warn!(
            "⚠️ [Clipboard] extract_for_clipboard failed: {}",
            err
        ),
    }

    result
}

/// 获取压缩包中的所有图片
#[tauri::command]
pub async fn get_images_from_archive(
    archive_path: String,
    state: State<'_, FsState>,
) -> Result<Vec<String>, String> {
    let archive_manager = state
        .archive_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path = PathBuf::from(archive_path);
    archive_manager.get_images_from_archive(&path)
}

/// 【优化】批量预解压压缩包中的图片到临时目录
#[tauri::command]
pub async fn batch_extract_archive(
    archive_path: String,
    state: State<'_, FsState>,
) -> Result<String, String> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let archive_path_buf = PathBuf::from(&archive_path);
    
    let mut hasher = DefaultHasher::new();
    archive_path_buf.hash(&mut hasher);
    let hash = hasher.finish();
    
    let temp_dir = std::env::temp_dir()
        .join("neoview_cache")
        .join(format!("{:x}", hash));
    
    if temp_dir.exists() {
        let count = std::fs::read_dir(&temp_dir)
            .map(|d| d.count())
            .unwrap_or(0);
        if count > 0 {
            info!("📦 使用已解压的缓存目录: {:?} ({} files)", temp_dir, count);
            return Ok(temp_dir.to_string_lossy().to_string());
        }
    }
    
    info!("📦 开始批量解压: {:?} -> {:?}", archive_path_buf, temp_dir);
    
    let archive_manager = Arc::clone(&state.archive_manager);
    
    let result = spawn_blocking(move || {
        let manager = archive_manager
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        
        let images = manager.get_images_from_archive(&archive_path_buf)?;
        
        std::fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;
        
        for (index, inner_path) in images.iter().enumerate() {
            let bytes = manager.load_image_from_archive_binary(&archive_path_buf, inner_path)?;
            
            let ext = Path::new(inner_path)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("jpg");
            let temp_file = temp_dir.join(format!("{:05}.{}", index, ext));
            
            std::fs::write(&temp_file, &bytes).map_err(|e| format!("写入临时文件失败: {}", e))?;
        }
        
        info!("✅ 批量解压完成: {} files", images.len());
        Ok(temp_dir.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("batch_extract_archive join error: {}", e))?;
    
    result
}

/// 检查是否为支持的压缩包
#[tauri::command]
pub async fn is_supported_archive(path: String) -> Result<bool, String> {
    let path = PathBuf::from(path);
    Ok(crate::core::archive::ArchiveManager::is_supported_archive(
        &path,
    ))
}

/// 批量扫描压缩包内容
#[tauri::command]
pub async fn batch_scan_archives(
    archive_paths: Vec<String>,
    state: State<'_, FsState>,
    scheduler: State<'_, BackgroundSchedulerState>,
) -> Result<Vec<ArchiveScanResult>, String> {
    let archive_manager = Arc::clone(&state.archive_manager);
    let paths: Vec<PathBuf> = archive_paths.iter().map(PathBuf::from).collect();

    let results: Vec<ArchiveScanResult> = scheduler
        .scheduler
        .enqueue_blocking(
            "archive-batch-scan",
            "filebrowser",
            move || -> Result<Vec<ArchiveScanResult>, String> {
                let mut results = Vec::with_capacity(paths.len());
                let manager = archive_manager
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());

                for path in paths {
                    let archive_path_str = path.to_string_lossy().to_string();
                    match manager.list_contents(&path) {
                        Ok(entries) => {
                            results.push(ArchiveScanResult {
                                archive_path: archive_path_str,
                                entries,
                                error: None,
                            });
                        }
                        Err(e) => {
                            results.push(ArchiveScanResult {
                                archive_path: archive_path_str,
                                entries: Vec::new(),
                                error: Some(e),
                            });
                        }
                    }
                }

                Ok(results)
            },
        )
        .await?;

    Ok(results)
}

/// 【优化】并行预加载多个页面到缓存
#[tauri::command]
pub async fn preload_archive_pages(
    archive_path: String,
    page_paths: Vec<String>,
    state: State<'_, FsState>,
) -> Result<PreloadResult, String> {
    use rayon::prelude::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    
    let archive_manager = Arc::clone(&state.archive_manager);
    let archive_path_buf = PathBuf::from(&archive_path);
    let page_count = page_paths.len();
    
    info!(
        "📦 [Preload] 开始并行预加载 {} 个页面: {}",
        page_count,
        archive_path
    );
    
    let start_time = std::time::Instant::now();
    
    let result = spawn_blocking(move || {
        let manager = archive_manager
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        
        let success_count = AtomicUsize::new(0);
        let total_bytes = AtomicUsize::new(0);
        
        let errors: Vec<String> = page_paths
            .par_iter()
            .filter_map(|page_path| {
                match manager.load_image_from_archive_binary(&archive_path_buf, page_path) {
                    Ok(bytes) => {
                        success_count.fetch_add(1, Ordering::Relaxed);
                        total_bytes.fetch_add(bytes.len(), Ordering::Relaxed);
                        None
                    }
                    Err(e) => Some(format!("{}: {}", page_path, e)),
                }
            })
            .collect();
        
        Ok(PreloadResult {
            total: page_count,
            success: success_count.load(Ordering::Relaxed),
            failed: errors.len(),
            total_bytes: total_bytes.load(Ordering::Relaxed),
            errors: if errors.is_empty() { None } else { Some(errors) },
        })
    })
    .await
    .map_err(|e| format!("preload_archive_pages join error: {}", e))?;
    
    let elapsed = start_time.elapsed();
    
    match &result {
        Ok(r) => info!(
            "✅ [Preload] 完成: {}/{} 成功, {} bytes, {:.1}ms",
            r.success, r.total, r.total_bytes, elapsed.as_secs_f64() * 1000.0
        ),
        Err(e) => warn!("⚠️ [Preload] 失败: {}", e),
    }
    
    result
}
