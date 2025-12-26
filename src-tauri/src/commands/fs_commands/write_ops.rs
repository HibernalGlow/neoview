//! 文件系统写入操作命令

use super::types::{BackupFileInfo, TrashItem};
use super::FsState;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::async_runtime::spawn_blocking;
use tauri::{Emitter, State};

/// 创建目录
#[tauri::command]
pub async fn create_directory(path: String, state: State<'_, FsState>) -> Result<(), String> {
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path = PathBuf::from(path);
    fs_manager.create_directory(&path)
}

/// 删除文件或目录
#[tauri::command]
pub async fn delete_path(path: String, state: State<'_, FsState>) -> Result<(), String> {
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path = PathBuf::from(path);
    fs_manager.delete(&path)
}

/// 重命名文件或目录
#[tauri::command]
pub async fn rename_path(
    from: String,
    to: String,
    state: State<'_, FsState>,
) -> Result<(), String> {
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let from_path = PathBuf::from(from);
    let to_path = PathBuf::from(to);
    fs_manager.rename(&from_path, &to_path)
}

/// 移动到回收站
/// 使用 spawn_blocking 在独立线程执行，避免 Windows COM 线程模型冲突
#[tauri::command]
pub async fn move_to_trash(path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(path);

    spawn_blocking(move || {
        if !path_buf.exists() {
            return Err(format!("文件不存在: {}", path_buf.display()));
        }
        trash::delete(&path_buf).map_err(|e| format!("移动到回收站失败: {}", e))
    })
    .await
    .map_err(|e| format!("spawn_blocking error: {}", e))?
}

/// 异步移动到回收站（绕开 IPC 协议问题）
/// 使用事件通知结果，前端不需要等待返回
#[tauri::command]
pub async fn move_to_trash_async(
    path: String,
    request_id: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let path_clone = path.clone();
    let path_buf = PathBuf::from(path);
    
    tokio::spawn(async move {
        let delete_path = path_buf.clone();
        let result = spawn_blocking(move || {
            trash::delete(&delete_path)
        }).await;
        
        let (success, error) = match result {
            Ok(Ok(())) => (true, None),
            Ok(Err(e)) => (false, Some(e.to_string())),
            Err(e) => (false, Some(format!("spawn_blocking error: {}", e))),
        };
        
        let payload = serde_json::json!({
            "requestId": request_id,
            "path": path_clone,
            "success": success,
            "error": error
        });
        
        let _ = app_handle.emit("trash-result", payload);
    });
    
    Ok(())
}

/// 复制文件或文件夹
#[tauri::command]
pub async fn copy_path(from: String, to: String, state: State<'_, FsState>) -> Result<(), String> {
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let from_path = PathBuf::from(from);
    let to_path = PathBuf::from(to);
    fs_manager.copy(&from_path, &to_path)
}

/// 移动文件或文件夹
#[tauri::command]
pub async fn move_path(from: String, to: String, state: State<'_, FsState>) -> Result<(), String> {
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let from_path = PathBuf::from(from);
    let to_path = PathBuf::from(to);
    fs_manager.move_item(&from_path, &to_path)
}

/// 在系统默认程序中打开文件
#[tauri::command]
pub async fn open_with_system(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    Ok(())
}

/// 在文件管理器中显示文件
#[tauri::command]
pub async fn show_in_file_manager(path: String) -> Result<(), String> {
    log::info!("show_in_file_manager called with path: {}", path);
    
    let path = PathBuf::from(&path);
    
    if !path.exists() {
        log::warn!("Path does not exist: {}", path.display());
        return Err(format!("Path does not exist: {}", path.display()));
    }

    #[cfg(target_os = "windows")]
    {
        let canonical_path = path.canonicalize()
            .map_err(|e| format!("Failed to canonicalize path: {}", e))?;
        let path_str = canonical_path.to_string_lossy();
        
        // 移除 Windows 扩展路径前缀 \\?\
        let clean_path = if path_str.starts_with(r"\\?\") {
            &path_str[4..]
        } else {
            &path_str
        };
        
        log::info!("Clean path for explorer: {}", clean_path);
        
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(clean_path)
            .status()
            .map_err(|e| format!("Failed to show in file manager: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(path.to_string_lossy().as_ref())
            .spawn()
            .map_err(|e| format!("Failed to show in file manager: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        let parent = path
            .parent()
            .ok_or_else(|| "Cannot get parent directory".to_string())?;

        std::process::Command::new("xdg-open")
            .arg(parent.to_string_lossy().as_ref())
            .spawn()
            .map_err(|e| format!("Failed to show in file manager: {}", e))?;
    }

    Ok(())
}

/// 写入文本文件
#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    let path = Path::new(&path);
    
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    
    fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))
}

/// 删除文件
#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), String> {
    let path = Path::new(&path);
    
    if !path.exists() {
        return Err(format!("文件不存在: {}", path.display()));
    }
    
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| format!("删除目录失败: {}", e))
    } else {
        fs::remove_file(path).map_err(|e| format!("删除文件失败: {}", e))
    }
}

/// 列出目录中匹配模式的文件
#[tauri::command]
pub async fn list_directory_files(path: String, pattern: Option<String>) -> Result<Vec<BackupFileInfo>, String> {
    let dir_path = Path::new(&path);
    
    if !dir_path.exists() {
        return Ok(Vec::new());
    }
    
    if !dir_path.is_dir() {
        return Err(format!("路径不是目录: {}", path));
    }
    
    let pattern = pattern.unwrap_or_else(|| "*".to_string());
    let glob_pattern = format!("{}/{}", path.replace('\\', "/"), pattern);
    
    let mut files = Vec::new();
    
    match glob::glob(&glob_pattern) {
        Ok(entries) => {
            for entry in entries.filter_map(Result::ok) {
                if entry.is_file() {
                    if let Ok(metadata) = fs::metadata(&entry) {
                        let modified = metadata
                            .modified()
                            .ok()
                            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                            .map(|d| d.as_secs())
                            .unwrap_or(0);
                        
                        files.push(BackupFileInfo {
                            name: entry.file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("unknown")
                                .to_string(),
                            path: entry.to_string_lossy().to_string(),
                            size: metadata.len(),
                            modified,
                        });
                    }
                }
            }
        }
        Err(e) => {
            return Err(format!("Glob 模式错误: {}", e));
        }
    }
    
    // 按修改时间降序排序
    files.sort_by(|a, b| b.modified.cmp(&a.modified));
    
    Ok(files)
}

/// 获取最近删除的项目（用于撤回功能）
#[tauri::command]
pub async fn get_last_deleted_item() -> Result<Option<TrashItem>, String> {
    spawn_blocking(|| {
        let items = trash::os_limited::list()
            .map_err(|e| format!("获取回收站列表失败: {}", e))?;
        
        let latest = items
            .into_iter()
            .max_by_key(|item| item.time_deleted);
        
        match latest {
            Some(item) => {
                let deleted_at = item.time_deleted as u64;
                let is_dir = item.original_path().is_dir();
                
                Ok(Some(TrashItem {
                    name: item.name.clone(),
                    original_path: item.original_path().to_string_lossy().to_string(),
                    deleted_at,
                    is_dir,
                }))
            }
            None => Ok(None),
        }
    })
    .await
    .map_err(|e| format!("spawn_blocking error: {}", e))?
}

/// 撤回上一次删除（恢复最近删除的项目）
#[tauri::command]
pub async fn undo_last_delete() -> Result<Option<String>, String> {
    spawn_blocking(|| {
        let items = trash::os_limited::list()
            .map_err(|e| format!("获取回收站列表失败: {}", e))?;
        
        if items.is_empty() {
            return Ok(None);
        }
        
        let latest = items
            .iter()
            .max_by_key(|item| item.time_deleted);
        
        let latest = match latest {
            Some(item) => item,
            None => return Ok(None),
        };
        
        let latest_time = latest.time_deleted;
        let original_path = latest.original_path().to_string_lossy().to_string();
        
        let items_to_restore: Vec<_> = items
            .into_iter()
            .filter(|item| {
                let item_path = item.original_path().to_string_lossy().to_string();
                let time_diff = (item.time_deleted as i64 - latest_time as i64).abs();
                
                time_diff <= 2 || item_path.starts_with(&format!("{}\\", original_path)) || item_path.starts_with(&format!("{}/", original_path))
            })
            .collect();
        
        if items_to_restore.is_empty() {
            return Ok(None);
        }
        
        trash::os_limited::restore_all(items_to_restore)
            .map_err(|e| format!("恢复失败: {}", e))?;
        
        Ok(Some(original_path))
    })
    .await
    .map_err(|e| format!("spawn_blocking error: {}", e))?
}

/// 恢复指定路径的已删除项目
#[tauri::command]
pub async fn restore_from_trash(original_path: String) -> Result<(), String> {
    spawn_blocking(move || {
        let items = trash::os_limited::list()
            .map_err(|e| format!("获取回收站列表失败: {}", e))?;
        
        let target: Vec<_> = items
            .into_iter()
            .filter(|item| item.original_path().to_string_lossy() == original_path)
            .collect();
        
        if target.is_empty() {
            return Err(format!("未在回收站中找到: {}", original_path));
        }
        
        trash::os_limited::restore_all(target)
            .map_err(|e| format!("恢复失败: {}", e))
    })
    .await
    .map_err(|e| format!("spawn_blocking error: {}", e))?
}
