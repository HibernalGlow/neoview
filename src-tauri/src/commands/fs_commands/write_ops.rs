//! 文件系统写入操作命令

use super::types::{BackupFileInfo, TrashItem};
use super::FsState;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{Emitter, Manager, State};

/// 在全新的独立线程上执行闭包，
/// 确保 COM 状态干净（不受 Tokio/Tauri 线程池已有 COM 初始化影响）。
/// 这是解决 `trash` crate 在 Windows 上 `CoInitializeEx` 冲突 panic 的关键。
async fn run_on_trash_thread<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    let (tx, rx) = tokio::sync::oneshot::channel();
    std::thread::Builder::new()
        .name("trash-worker".into())
        .spawn(move || {
            let result = f();
            let _ = tx.send(result);
        })
        .map_err(|e| format!("Failed to spawn trash thread: {e}"))?;
    rx.await.map_err(|_| "trash thread channel closed".to_string())?
}

/// 创建目录
#[tauri::command]
pub async fn create_directory(path: String, state: State<'_, FsState>) -> Result<(), String> {
    let fs_manager = &state.fs_manager;

    let path = PathBuf::from(path);
    fs_manager.create_directory(&path)
}

/// 删除文件或目录
#[tauri::command]
pub async fn delete_path(path: String, state: State<'_, FsState>) -> Result<(), String> {
    let fs_manager = &state.fs_manager;

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
    let fs_manager = &state.fs_manager;

    let from_path = PathBuf::from(from);
    let to_path = PathBuf::from(to);
    fs_manager.rename(&from_path, &to_path)
}

/// 移动到回收站
/// 使用独立线程执行，确保 COM 状态干净（避免 Windows CoInitializeEx 冲突 panic）
/// 包含重试机制以处理文件暂时被占用的情况
#[tauri::command]
pub async fn move_to_trash(path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(path);

    run_on_trash_thread(move || {
        if !path_buf.exists() {
            return Err(format!("文件不存在: {}", path_buf.display()));
        }

        let max_retries = 3;
        let mut last_error = String::new();

        for attempt in 0..max_retries {
            match trash::delete(&path_buf) {
                Ok(()) => return Ok(()),
                Err(e) => {
                    last_error = e.to_string();
                    log::warn!(
                        "移动到回收站失败 (尝试 {}/{}): {} - {}",
                        attempt + 1,
                        max_retries,
                        path_buf.display(),
                        last_error
                    );

                    if attempt < max_retries - 1 {
                        std::thread::sleep(std::time::Duration::from_millis(
                            100 * (attempt as u64 + 1),
                        ));
                    }
                }
            }
        }

        Err(format!(
            "移动到回收站失败 (已重试{max_retries}次): {last_error}"
        ))
    })
    .await
}

/// 异步移动到回收站（绕开 IPC 协议问题）
/// 使用事件通知结果，前端不需要等待返回
/// 包含重试机制以处理文件暂时被占用的情况
#[tauri::command]
pub async fn move_to_trash_async(
    path: String,
    request_id: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let path_clone = path.clone();
    let path_buf = PathBuf::from(path);

    tokio::spawn(async move {
        let result = run_on_trash_thread(move || {
            let max_retries = 3;
            let mut last_error = String::new();

            for attempt in 0..max_retries {
                match trash::delete(&path_buf) {
                    Ok(()) => return Ok(()),
                    Err(e) => {
                        last_error = e.to_string();
                        log::warn!(
                            "异步移动到回收站失败 (尝试 {}/{}): {} - {}",
                            attempt + 1,
                            max_retries,
                            path_buf.display(),
                            last_error
                        );

                        if attempt < max_retries - 1 {
                            std::thread::sleep(std::time::Duration::from_millis(
                                100 * (attempt as u64 + 1),
                            ));
                        }
                    }
                }
            }

            Err(format!("异步移动到回收站失败 (已重试{max_retries}次): {last_error}"))
        })
        .await;

        let (success, error) = match result {
            Ok(()) => (true, None),
            Err(e) => (false, Some(e)),
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
    let fs_manager = &state.fs_manager;

    let from_path = PathBuf::from(from);
    let to_path = PathBuf::from(to);
    fs_manager.copy(&from_path, &to_path)
}

/// 移动文件或文件夹
#[tauri::command]
pub async fn move_path(from: String, to: String, state: State<'_, FsState>) -> Result<(), String> {
    let fs_manager = &state.fs_manager;

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
        let canonical_path = path
            .canonicalize()
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
pub async fn list_directory_files(
    path: String,
    pattern: Option<String>,
) -> Result<Vec<BackupFileInfo>, String> {
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
                            name: entry
                                .file_name()
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
    run_on_trash_thread(|| {
        let items = trash::os_limited::list().map_err(|e| format!("获取回收站列表失败: {}", e))?;

        let latest = items.into_iter().max_by_key(|item| item.time_deleted);

        match latest {
            Some(item) => {
                let deleted_at = item.time_deleted as u64;
                let is_dir = item.original_path().is_dir();

                Ok(Some(TrashItem {
                    name: item.name.to_string_lossy().to_string(),
                    original_path: item.original_path().to_string_lossy().to_string(),
                    deleted_at,
                    is_dir,
                }))
            }
            None => Ok(None),
        }
    })
    .await
}

/// 撤回上一次删除（恢复最近删除的项目）
#[tauri::command]
pub async fn undo_last_delete() -> Result<Option<String>, String> {
    run_on_trash_thread(|| {
        let items = trash::os_limited::list().map_err(|e| format!("获取回收站列表失败: {}", e))?;

        if items.is_empty() {
            return Ok(None);
        }

        let latest_item = items
            .into_iter()
            .max_by_key(|item| item.time_deleted)
            .ok_or_else(|| "回收站为空".to_string())?;

        let original_path = latest_item.original_path().to_string_lossy().to_string();

        trash::os_limited::restore_all(vec![latest_item]).map_err(|e| format!("恢复失败: {}", e))?;

        Ok(Some(original_path))
    })
    .await
}

/// 规范化路径用于比较（统一斜杠方向、移除尾部斜杠、小写化）
fn normalize_path_for_compare(path: &str) -> String {
    let normalized = path.replace('/', "\\");
    let trimmed = normalized.trim_end_matches('\\');
    trimmed.to_lowercase()
}

/// 检查 child_path 是否是 parent_path 的子路径
fn is_child_of(child_path: &str, parent_path: &str) -> bool {
    let child_norm = normalize_path_for_compare(child_path);
    let parent_norm = normalize_path_for_compare(parent_path);

    if child_norm == parent_norm {
        return true;
    }

    // 检查是否以 parent_path\ 开头
    child_norm.starts_with(&format!("{}\\", parent_norm))
}

/// 恢复指定路径的已删除项目
/// 如果指定的路径是某个已删除文件夹的子路径，会自动恢复该父文件夹
#[tauri::command]
pub async fn restore_from_trash(original_path: String) -> Result<(), String> {
    run_on_trash_thread(move || {
        let items = trash::os_limited::list().map_err(|e| format!("获取回收站列表失败: {}", e))?;

        let path_norm = normalize_path_for_compare(&original_path);

        // 首先尝试精确匹配
        let mut target: Vec<_> = items
            .iter()
            .filter(|item| {
                let item_path = item.original_path().to_string_lossy().to_string();
                normalize_path_for_compare(&item_path) == path_norm
            })
            .cloned()
            .collect();

        // 如果精确匹配失败，检查是否有父文件夹包含此路径
        // 这处理了删除文件夹后尝试通过内部文件路径恢复的情况
        if target.is_empty() {
            // 查找包含此路径的已删除文件夹（找最深的那个）
            let mut best_match: Option<trash::TrashItem> = None;
            let mut best_depth = 0usize;

            for item in items.iter() {
                let item_path = item.original_path().to_string_lossy().to_string();
                let item_path_norm = normalize_path_for_compare(&item_path);

                // 检查 original_path 是否在这个已删除项目的路径下
                if is_child_of(&original_path, &item_path) && item_path_norm != path_norm {
                    let depth = item_path_norm.matches('\\').count();
                    if depth >= best_depth {
                        best_depth = depth;
                        best_match = Some(item.clone());
                    }
                }
            }

            if let Some(matched_item) = best_match {
                log::info!(
                    "恢复父文件夹: {} (请求的路径: {})",
                    matched_item.original_path().display(),
                    original_path
                );
                target = vec![matched_item];
            }
        }

        if target.is_empty() {
            return Err(format!("未在回收站中找到: {}", original_path));
        }

        trash::os_limited::restore_all(target).map_err(|e| format!("恢复失败: {}", e))
    })
    .await
}

/// 释放指定路径相关的所有资源
/// 在删除文件/文件夹前调用，确保释放文件句柄
#[tauri::command]
pub async fn release_path_resources(
    path: String, 
    state: State<'_, FsState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    log::info!("🔓 [ReleaseResources] 释放路径资源: {}", path);
    
    let path_buf = PathBuf::from(&path);
    
    // 清除 ArchiveManager 中与该路径相关的缓存
    if let Ok(archive_manager) = state.archive_manager.lock() {
        // 清除所有缓存（确保释放所有文件句柄）
        archive_manager.clear_cache();
        log::info!("🔓 [ReleaseResources] 已清除 ArchiveManager 缓存");
    }
    
    // 清除 ProtocolState 的缓存
    if let Some(protocol_state) = app_handle.try_state::<crate::core::custom_protocol::ProtocolState>() {
        protocol_state.clear_cache();
        protocol_state.mmap_cache.clear();
        protocol_state.path_registry.clear();
        log::info!("🔓 [ReleaseResources] 已清除 ProtocolState 缓存");
    }
    
    // 如果是文件夹，遍历清除所有子文件的缓存
    if path_buf.is_dir() {
        if let Ok(archive_manager) = state.archive_manager.lock() {
            // 遍历文件夹中的所有压缩包并清除缓存
            if let Ok(entries) = std::fs::read_dir(&path_buf) {
                for entry in entries.flatten() {
                    let entry_path = entry.path();
                    if entry_path.is_file() {
                        archive_manager.evict_cache_for_path(&entry_path);
                    }
                }
            }
            log::info!("🔓 [ReleaseResources] 已清除文件夹内所有压缩包缓存");
        }
    }
    
    // 强制触发 Rust 的 drop（通过重新获取锁来确保之前的引用被释放）
    drop(state.archive_manager.lock());
    
    // 等待更长时间确保文件句柄完全释放
    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
    
    log::info!("✅ [ReleaseResources] 资源释放完成: {}", path);
    Ok(())
}
