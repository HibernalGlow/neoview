//! 文件系统读取操作命令

use super::types::{FileInfo, SubfolderItem};
use super::{DirectoryCacheState, FsState};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::async_runtime::spawn_blocking;
use tauri::State;

/// 读取目录内容
#[tauri::command]
pub async fn read_directory(
    path: String,
    excluded_paths: Option<Vec<String>>,
) -> Result<Vec<FileInfo>, String> {
    let path = Path::new(&path);
    let excluded = excluded_paths.unwrap_or_default();

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }

    let mut entries = Vec::new();

    let read_dir = fs::read_dir(path).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in read_dir {
        // 优雅处理权限错误
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                log::debug!("跳过无法读取的条目: {}", e);
                continue;
            }
        };
        
        let entry_path = entry.path();
        let path_str = entry_path.to_string_lossy().to_string();
        
        // 检查是否在排除列表中（规范化路径进行比较）
        let normalized_path = path_str.replace('/', "\\");
        let is_excluded = excluded.iter().any(|ex| {
            let normalized_ex = ex.replace('/', "\\");
            normalized_path == normalized_ex 
                || normalized_path.starts_with(&format!("{}\\", normalized_ex))
        });
        
        if is_excluded {
            continue;
        }
        
        // 优雅处理元数据获取失败
        let metadata = match entry.metadata() {
            Ok(m) => Some(m),
            Err(e) => {
                log::debug!("跳过无法获取元数据的条目 {:?}: {}", entry_path, e);
                continue;
            }
        };

        let file_info = FileInfo {
            name: entry_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown")
                .to_string(),
            path: path_str,
            is_directory: entry_path.is_dir(),
            size: metadata.as_ref().map(|m| m.len()),
            modified: metadata
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs().to_string()),
        };

        entries.push(file_info);
    }

    // 按名称排序，目录在前
    entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    Ok(entries)
}

/// 获取文件信息
#[tauri::command]
pub async fn get_file_info(path: String) -> Result<FileInfo, String> {
    let path = Path::new(&path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    let metadata = fs::metadata(path).map_err(|e| format!("Failed to get file metadata: {}", e))?;

    Ok(FileInfo {
        name: path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unknown")
            .to_string(),
        path: path.to_string_lossy().to_string(),
        is_directory: path.is_dir(),
        size: Some(metadata.len()),
        modified: metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs().to_string()),
    })
}

/// 检查路径是否存在
#[tauri::command]
pub async fn path_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

/// 读取文本文件内容
#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    let path = Path::new(&path);
    
    if !path.exists() {
        return Err(format!("文件不存在: {}", path.display()));
    }
    
    fs::read_to_string(path).map_err(|e| format!("读取文件失败: {}", e))
}

/// 浏览目录内容（使用 FsManager）
#[tauri::command]
pub async fn browse_directory(
    path: String,
    state: State<'_, FsState>,
) -> Result<Vec<crate::core::fs_manager::FsItem>, String> {
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path = PathBuf::from(path);
    fs_manager.read_directory(&path)
}

/// 快速列出目录下的子文件夹（专门用于 FolderTree，不统计文件）
/// 使用 jwalk 并行遍历，比标准 read_dir 快 5-10 倍
#[tauri::command]
pub async fn list_subfolders(path: String) -> Result<Vec<SubfolderItem>, String> {
    let path_buf = PathBuf::from(&path);
    
    spawn_blocking(move || {
        list_subfolders_sync(&path_buf)
    })
    .await
    .map_err(|e| format!("spawn_blocking error: {e}"))?
}

/// 同步版本的子文件夹列表
fn list_subfolders_sync(path: &Path) -> Result<Vec<SubfolderItem>, String> {
    use jwalk::WalkDir;
    use rayon::prelude::*;
    
    if !path.is_dir() {
        return Err("路径不是目录".to_string());
    }

    // 使用 jwalk 并行遍历，深度限制为 1（只获取直接子目录）
    let entries: Vec<_> = WalkDir::new(path)
        .min_depth(1)
        .max_depth(1)
        .skip_hidden(true)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_dir())
        .collect();

    // 并行检查每个子目录是否有子文件夹
    let subfolders: Vec<SubfolderItem> = entries
        .par_iter()
        .map(|entry| {
            let entry_path = entry.path();
            let name = entry
                .file_name()
                .to_string_lossy()
                .to_string();

            let has_children = has_subdirectory(&entry_path);

            SubfolderItem {
                path: entry_path.to_string_lossy().to_string(),
                name,
                has_children,
            }
        })
        .collect();

    // 使用并行自然排序
    let mut sorted = subfolders;
    sorted.par_sort_by(|a, b| {
        natural_sort_rs::natural_cmp::<str, String>(&a.name.to_lowercase(), &b.name.to_lowercase())
    });

    Ok(sorted)
}

/// 快速检查目录是否有子目录（找到第一个就返回）
#[inline]
fn has_subdirectory(path: &Path) -> bool {
    std::fs::read_dir(path)
        .map(|entries| {
            entries.filter_map(Result::ok).any(|entry| {
                let name = entry.file_name();
                let name_bytes = name.as_encoded_bytes();
                if name_bytes.first() == Some(&b'.') {
                    return false;
                }
                entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

/// 获取目录中的所有图片
#[tauri::command]
pub async fn get_images_in_directory(
    path: String,
    recursive: bool,
    state: State<'_, FsState>,
) -> Result<Vec<String>, String> {
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path = PathBuf::from(path);
    let images = fs_manager.get_images_in_directory(&path, recursive)?;

    Ok(images
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

/// 获取单个文件/文件夹的元数据（包含创建/修改时间）
#[tauri::command]
pub async fn get_file_metadata(
    path: String,
    state: State<'_, FsState>,
) -> Result<crate::core::fs_manager::FsItem, String> {
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path = PathBuf::from(path);
    fs_manager.get_file_metadata(&path)
}
