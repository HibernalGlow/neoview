//! NeoView - File System Commands
//! 文件系统操作相关的 Tauri 命令

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::State;
use base64::Engine;
use crate::core::{FsManager, ThumbnailManager, ArchiveManager};

/// 文件系统状态
pub struct FsState {
    pub fs_manager: Mutex<FsManager>,
    pub thumbnail_manager: Mutex<ThumbnailManager>,
    pub archive_manager: Mutex<ArchiveManager>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: Option<u64>,
    pub modified: Option<String>,
}

#[tauri::command]
pub async fn read_directory(path: String) -> Result<Vec<FileInfo>, String> {
    let path = Path::new(&path);
    
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }

    let mut entries = Vec::new();
    
    let read_dir = fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in read_dir {
        if let Ok(entry) = entry {
            let path = entry.path();
            let metadata = entry.metadata().ok();
            
            let file_info = FileInfo {
                name: path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("Unknown")
                    .to_string(),
                path: path.to_string_lossy().to_string(),
                is_directory: path.is_dir(),
                size: metadata.as_ref().map(|m| m.len()),
                modified: metadata
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs().to_string()),
            };
            
            entries.push(file_info);
        }
    }

    // 按名称排序，目录在前
    entries.sort_by(|a, b| {
        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        }
    });

    Ok(entries)
}

#[tauri::command]
pub async fn get_file_info(path: String) -> Result<FileInfo, String> {
    let path = Path::new(&path);
    
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    let metadata = fs::metadata(path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;

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

#[tauri::command]
pub async fn path_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

/// 浏览目录内容（使用新的 FsManager）
#[tauri::command]
pub async fn browse_directory(
    path: String,
    state: State<'_, FsState>,
) -> Result<Vec<crate::core::fs_manager::FsItem>, String> {
    let fs_manager = state.fs_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let path = PathBuf::from(path);
    fs_manager.read_directory(&path)
}

/// 获取目录中的所有图片
#[tauri::command]
pub async fn get_images_in_directory(
    path: String,
    recursive: bool,
    state: State<'_, FsState>,
) -> Result<Vec<String>, String> {
    let fs_manager = state.fs_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let path = PathBuf::from(path);
    let images = fs_manager.get_images_in_directory(&path, recursive)?;
    
    Ok(images.iter().map(|p| p.to_string_lossy().to_string()).collect())
}

/// 生成文件缩略图
#[tauri::command]
pub async fn generate_file_thumbnail(
    path: String,
    state: State<'_, FsState>,
) -> Result<String, String> {
    let thumbnail_manager = state.thumbnail_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let path = PathBuf::from(path);
    thumbnail_manager.generate_thumbnail(&path)
}

/// 从图片数据生成缩略图（用于压缩包内图片）
#[tauri::command]
pub async fn generate_thumbnail_from_data(
    image_data: String,
    max_size: u32,
    state: State<'_, FsState>,
) -> Result<String, String> {
    let thumbnail_manager = state.thumbnail_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    // 解码 base64 数据
    let base64_data = image_data.split(',').nth(1)
        .ok_or_else(|| "Invalid image data format".to_string())?;
    
    let image_bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    // 生成缩略图
    thumbnail_manager.generate_thumbnail_from_bytes(&image_bytes, max_size)
}

/// 创建目录
#[tauri::command]
pub async fn create_directory(
    path: String,
    state: State<'_, FsState>,
) -> Result<(), String> {
    let fs_manager = state.fs_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let path = PathBuf::from(path);
    fs_manager.create_directory(&path)
}

/// 删除文件或目录
#[tauri::command]
pub async fn delete_path(
    path: String,
    state: State<'_, FsState>,
) -> Result<(), String> {
    let fs_manager = state.fs_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

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
    let fs_manager = state.fs_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let from_path = PathBuf::from(from);
    let to_path = PathBuf::from(to);
    fs_manager.rename(&from_path, &to_path)
}

/// 移动到回收站
#[tauri::command]
pub async fn move_to_trash(
    path: String,
    state: State<'_, FsState>,
) -> Result<(), String> {
    let fs_manager = state.fs_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let path = PathBuf::from(path);
    fs_manager.move_to_trash(&path)
}

/// 获取缓存大小
#[tauri::command]
pub async fn get_thumbnail_cache_size(
    state: State<'_, FsState>,
) -> Result<u64, String> {
    let thumbnail_manager = state.thumbnail_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    thumbnail_manager.get_cache_size()
}

/// 清空缩略图缓存
#[tauri::command]
pub async fn clear_thumbnail_cache(
    state: State<'_, FsState>,
) -> Result<usize, String> {
    let thumbnail_manager = state.thumbnail_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    thumbnail_manager.clear_all_cache()
}



/// 清理过期缓存
#[tauri::command]
pub async fn cleanup_thumbnail_cache(
    max_age_days: u64,
    state: State<'_, FsState>,
) -> Result<usize, String> {
    let thumbnail_manager = state.thumbnail_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    thumbnail_manager.cleanup_cache(max_age_days)
}

// ===== 压缩包相关命令 =====

/// 列出压缩包内容
#[tauri::command]
pub async fn list_archive_contents(
    archive_path: String,
    state: State<'_, FsState>,
) -> Result<Vec<crate::core::archive::ArchiveEntry>, String> {
    let archive_manager = state.archive_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let path = PathBuf::from(archive_path);
    archive_manager.list_zip_contents(&path)
}

/// 从压缩包加载图片
#[tauri::command]
pub async fn load_image_from_archive(
    archive_path: String,
    file_path: String,
    state: State<'_, FsState>,
) -> Result<String, String> {
    let archive_manager = state.archive_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let path = PathBuf::from(archive_path);
    archive_manager.load_image_from_zip(&path, &file_path)
}

/// 获取压缩包中的所有图片
#[tauri::command]
pub async fn get_images_from_archive(
    archive_path: String,
    state: State<'_, FsState>,
) -> Result<Vec<String>, String> {
    let archive_manager = state.archive_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let path = PathBuf::from(archive_path);
    archive_manager.get_images_from_zip(&path)
}

/// 生成压缩包内图片的缩略图
#[tauri::command]
pub async fn generate_archive_thumbnail(
    archive_path: String,
    file_path: String,
    max_size: u32,
    state: State<'_, FsState>,
) -> Result<String, String> {
    let archive_manager = state.archive_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let path = PathBuf::from(archive_path);
    archive_manager.generate_thumbnail_from_zip(&path, &file_path, max_size)
}

/// 检查是否为支持的压缩包
#[tauri::command]
pub async fn is_supported_archive(path: String) -> Result<bool, String> {
    let path = PathBuf::from(path);
    Ok(crate::core::archive::ArchiveManager::is_supported_archive(&path))
}

// ===== 文件操作命令 =====

/// 复制文件或文件夹
#[tauri::command]
pub async fn copy_path(
    from: String,
    to: String,
    state: State<'_, FsState>,
) -> Result<(), String> {
    let fs_manager = state.fs_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let from_path = PathBuf::from(from);
    let to_path = PathBuf::from(to);
    fs_manager.copy(&from_path, &to_path)
}

/// 移动文件或文件夹
#[tauri::command]
pub async fn move_path(
    from: String,
    to: String,
    state: State<'_, FsState>,
) -> Result<(), String> {
    let fs_manager = state.fs_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

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
    let path = PathBuf::from(path);
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(path.to_string_lossy().as_ref())
            .spawn()
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
        // 对于 Linux，尝试打开包含文件的目录
        let parent = path.parent()
            .ok_or_else(|| "Cannot get parent directory".to_string())?;
            
        std::process::Command::new("xdg-open")
            .arg(parent.to_string_lossy().as_ref())
            .spawn()
            .map_err(|e| format!("Failed to show in file manager: {}", e))?;
    }
    
    Ok(())
}

/// 搜索文件
#[tauri::command]
pub async fn search_files(
    path: String,
    query: String,
    options: Option<crate::core::fs_manager::SearchOptions>,
    state: State<'_, FsState>,
) -> Result<Vec<crate::core::fs_manager::FsItem>, String> {
    let fs_manager = state.fs_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let path = PathBuf::from(path);
    let search_options = options.unwrap_or_default();
    
    fs_manager.search_files(&path, &query, &search_options)
}

/// 初始化文件索引
#[tauri::command]
pub async fn initialize_file_index(
    state: State<'_, FsState>,
) -> Result<(), String> {
    let fs_manager = state.fs_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    fs_manager.initialize_indexer()
}

/// 构建文件索引
#[tauri::command]
pub async fn build_file_index(
    path: String,
    recursive: bool,
    state: State<'_, FsState>,
) -> Result<(), String> {
    let fs_manager = state.fs_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let path = PathBuf::from(path);
    fs_manager.build_index(&path, recursive)
}

/// 获取索引统计信息
#[tauri::command]
pub async fn get_index_stats(
    state: State<'_, FsState>,
) -> Result<crate::core::file_indexer::IndexStats, String> {
    let fs_manager = state.fs_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    fs_manager.get_index_stats()
}

/// 清除文件索引
#[tauri::command]
pub async fn clear_file_index(
    state: State<'_, FsState>,
) -> Result<(), String> {
    let fs_manager = state.fs_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    fs_manager.clear_index()
}

/// 在索引中搜索文件
#[tauri::command]
pub async fn search_in_index(
    query: String,
    max_results: Option<usize>,
    options: Option<IndexSearchOptions>,
    state: State<'_, FsState>,
) -> Result<Vec<crate::core::fs_manager::FsItem>, String> {
    let fs_manager = state.fs_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let max_results = max_results.unwrap_or(100);
    let search_options = options.map(|o| crate::core::file_indexer::SearchOptions {
        include_subfolders: o.include_subfolders.unwrap_or(true),
        images_only: o.images_only.unwrap_or(false),
        folders_only: o.folders_only.unwrap_or(false),
        min_size: o.min_size,
        max_size: o.max_size,
        modified_after: o.modified_after,
        modified_before: o.modified_before,
    });

    fs_manager.search_in_index(&query, max_results, search_options.as_ref())
}

/// 获取索引中的路径列表
#[tauri::command]
pub async fn get_indexed_paths(
    path: Option<String>,
    recursive: Option<bool>,
    state: State<'_, FsState>,
) -> Result<Vec<String>, String> {
    let fs_manager = state.fs_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let recursive = recursive.unwrap_or(false);
    
    fs_manager.get_indexed_paths(path.as_deref(), recursive)
}

/// 检查路径是否已被索引
#[tauri::command]
pub async fn is_path_indexed(
    path: String,
    state: State<'_, FsState>,
) -> Result<bool, String> {
    let fs_manager = state.fs_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    fs_manager.is_path_indexed(&path)
}

/// 获取索引进度
#[tauri::command]
pub async fn get_index_progress(
    state: State<'_, FsState>,
) -> Result<crate::core::file_indexer::IndexProgress, String> {
    let fs_manager = state.fs_manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    fs_manager.get_index_progress()
}

/// 索引搜索选项
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexSearchOptions {
    pub include_subfolders: Option<bool>,
    pub images_only: Option<bool>,
    pub folders_only: Option<bool>,
    pub min_size: Option<u64>,
    pub max_size: Option<u64>,
    pub modified_after: Option<u64>,
    pub modified_before: Option<u64>,
}
