//! NeoView - File System Commands
//! 文件系统操作相关的 Tauri 命令

use super::task_queue_commands::BackgroundSchedulerState;
use crate::core::cache_index_db::{CacheGcResult, CacheIndexDb, CacheIndexStats};
use crate::core::directory_cache::DirectoryCache;
use crate::core::fs_manager::FsItem;
use crate::core::{ArchiveManager, FsManager};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;

/// 文件系统状态
pub struct FsState {
    pub fs_manager: Arc<Mutex<FsManager>>,
    pub archive_manager: Arc<Mutex<ArchiveManager>>,
}

/// 目录缓存状态（内存 LRU）
pub struct DirectoryCacheState {
    pub cache: Mutex<DirectoryCache>,
}

/// 缓存索引状态（SQLite）
pub struct CacheIndexState {
    pub db: Arc<CacheIndexDb>,
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

    let read_dir = fs::read_dir(path).map_err(|e| format!("Failed to read directory: {}", e))?;

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
    entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    Ok(entries)
}

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
    let fs_manager = state
        .fs_manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let path = PathBuf::from(path);
    fs_manager.read_directory(&path)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectorySnapshotResponse {
    pub items: Vec<FsItem>,
    pub mtime: Option<u64>,
    pub cached: bool,
}

fn directory_mtime(path: &Path) -> Option<u64> {
    let metadata = fs::metadata(path).ok()?;
    metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
}

#[tauri::command]
pub async fn load_directory_snapshot(
    path: String,
    state: State<'_, FsState>,
    cache_state: State<'_, DirectoryCacheState>,
    cache_index: State<'_, CacheIndexState>,
    scheduler: State<'_, BackgroundSchedulerState>,
) -> Result<DirectorySnapshotResponse, String> {
    let path_buf = PathBuf::from(&path);
    let mtime = directory_mtime(&path_buf);

    // 内存缓存
    {
        let mut cache = cache_state
            .cache
            .lock()
            .map_err(|e| format!("获取目录缓存锁失败: {}", e))?;
        if let Some(entry) = cache.get(&path, mtime) {
            println!(
                "📁 DirectorySnapshot 命中内存缓存: {} (entries={})",
                path,
                entry.items.len()
            );
            return Ok(DirectorySnapshotResponse {
                items: entry.items,
                mtime: entry.mtime,
                cached: true,
            });
        }
    }

    // SQLite 缓存
    if let Some(persisted_items) = cache_index.db.load_directory_snapshot(&path, mtime)? {
        println!(
            "📁 DirectorySnapshot 命中 SQLite 缓存: {} (entries={})",
            path,
            persisted_items.len()
        );
        {
            let mut cache = cache_state
                .cache
                .lock()
                .map_err(|e| format!("获取目录缓存锁失败: {}", e))?;
            cache.insert(path.clone(), persisted_items.clone(), mtime);
        }
        return Ok(DirectorySnapshotResponse {
            items: persisted_items,
            mtime,
            cached: true,
        });
    }

    // 文件系统读取
    println!(
        "📁 DirectorySnapshot miss: {} -> 调度 filebrowser-directory-load",
        path
    );
    let fs_manager = Arc::clone(&state.fs_manager);
    let job_path = path.clone();
    let path_for_job = path_buf.clone();
    let items = scheduler
        .scheduler
        .enqueue_blocking("filebrowser-directory-load", job_path, move || {
            let fs_manager = fs_manager
                .lock()
                .map_err(|e| format!("获取锁失败: {}", e))?;
            fs_manager.read_directory(&path_for_job)
        })
        .await?;

    {
        let mut cache = cache_state
            .cache
            .lock()
            .map_err(|e| format!("获取目录缓存锁失败: {}", e))?;
        cache.insert(path.clone(), items.clone(), mtime);
    }
    cache_index
        .db
        .save_directory_snapshot(&path, mtime, &items)?;

    Ok(DirectorySnapshotResponse {
        items,
        mtime,
        cached: false,
    })
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
        .map_err(|e| format!("获取锁失败: {}", e))?;

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
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let path = PathBuf::from(path);
    fs_manager.get_file_metadata(&path)
}

/// 创建目录
#[tauri::command]
pub async fn create_directory(path: String, state: State<'_, FsState>) -> Result<(), String> {
    let fs_manager = state
        .fs_manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let path = PathBuf::from(path);
    fs_manager.create_directory(&path)
}

/// 删除文件或目录
#[tauri::command]
pub async fn delete_path(path: String, state: State<'_, FsState>) -> Result<(), String> {
    let fs_manager = state
        .fs_manager
        .lock()
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
    let fs_manager = state
        .fs_manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let from_path = PathBuf::from(from);
    let to_path = PathBuf::from(to);
    fs_manager.rename(&from_path, &to_path)
}

/// 移动到回收站
#[tauri::command]
pub async fn move_to_trash(path: String, state: State<'_, FsState>) -> Result<(), String> {
    let fs_manager = state
        .fs_manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let path = PathBuf::from(path);
    fs_manager.move_to_trash(&path)
}

// ===== 压缩包相关命令 =====

/// 列出压缩包内容
#[tauri::command]
pub async fn list_archive_contents(
    archive_path: String,
    state: State<'_, FsState>,
) -> Result<Vec<crate::core::archive::ArchiveEntry>, String> {
    let archive_manager = state
        .archive_manager
        .lock()
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
) -> Result<Vec<u8>, String> {
    let archive_manager = state
        .archive_manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let path = PathBuf::from(archive_path);
    archive_manager.load_image_from_zip_binary(&path, &file_path)
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
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let path = PathBuf::from(archive_path);
    archive_manager.get_images_from_zip(&path)
}

/// 检查是否为支持的压缩包
#[tauri::command]
pub async fn is_supported_archive(path: String) -> Result<bool, String> {
    let path = PathBuf::from(path);
    Ok(crate::core::archive::ArchiveManager::is_supported_archive(
        &path,
    ))
}

// ===== 文件操作命令 =====

/// 复制文件或文件夹
#[tauri::command]
pub async fn copy_path(from: String, to: String, state: State<'_, FsState>) -> Result<(), String> {
    let fs_manager = state
        .fs_manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

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

/// 搜索文件（使用 fd）
#[tauri::command]
pub async fn search_files(
    path: String,
    query: String,
    options: Option<SearchOptions>,
) -> Result<Vec<crate::core::fs_manager::FsItem>, String> {
    use std::process::Command;

    let search_options = options.unwrap_or_default();
    let include_subfolders = search_options.include_subfolders.unwrap_or(true);
    let max_results = search_options.max_results.unwrap_or(100);

    // 构建 fd 命令
    let mut cmd = Command::new("fd");
    cmd.arg("-t") // 指定类型
        .arg("f") // 只搜索文件
        .arg("-a") // 输出绝对路径
        .arg("-F") // 固定字符串匹配（不使用正则）
        .arg("-u") // 包含被忽略和隐藏的文件
        .arg(&query) // 搜索查询
        .arg(&path); // 搜索路径

    // 如果不包含子文件夹，添加 --maxdepth 1
    if !include_subfolders {
        cmd.arg("--maxdepth").arg("1");
    }

    // 添加调试信息
    println!(
        "执行 fd 搜索: 查询='{}', 路径='{}', 包含子文件夹={}",
        query, path, include_subfolders
    );

    // 执行命令
    let output = cmd.output().map_err(|e| format!("执行 fd 失败: {}", e))?;

    // 输出调试信息
    println!("fd 退出码: {}", output.status);
    if !output.stderr.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        println!("fd stderr: {}", stderr);
    }

    if !output.status.success() {
        return Err(format!(
            "fd 错误: 退出码 {}",
            output.status.code().unwrap_or(-1)
        ));
    }

    // 解析输出（fd 输出的是纯文本路径，每行一个）
    let stdout = String::from_utf8_lossy(&output.stdout);
    println!("fd stdout: {}", stdout);
    let mut results = Vec::new();

    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }

        println!("找到文件: {}", line.trim());

        let path = line.trim();

        // 获取文件元数据
        let path_buf = PathBuf::from(path);
        if let Ok(metadata) = std::fs::metadata(&path_buf) {
            let name = path_buf
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown")
                .to_string();

            let is_dir = metadata.is_dir();
            let size = if is_dir {
                // 对于目录，计算子项数量
                std::fs::read_dir(&path_buf)
                    .map(|entries| entries.count() as u64)
                    .unwrap_or(0)
            } else {
                metadata.len()
            };

            let modified = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs());
            let created = metadata
                .created()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs());

            let is_image = !is_dir && is_image_file(&path_buf);

            results.push(crate::core::fs_manager::FsItem {
                name,
                path: path.to_string(),
                is_dir,
                size,
                modified,
                created,
                is_image,
            });

            // 限制结果数量
            if results.len() >= max_results {
                break;
            }
        }
    }

    Ok(results)
}

/// 检查文件是否为图片
fn is_image_file(path: &Path) -> bool {
    if let Some(ext) = path.extension() {
        let ext = ext.to_string_lossy().to_lowercase();
        matches!(
            ext.as_str(),
            "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "avif" | "jxl" | "tiff" | "tif"
        )
    } else {
        false
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    pub include_subfolders: Option<bool>,
    pub max_results: Option<usize>,
}

/// 初始化文件索引
#[tauri::command]
pub async fn initialize_file_index(state: State<'_, FsState>) -> Result<(), String> {
    let fs_manager = state
        .fs_manager
        .lock()
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
    let fs_manager = state
        .fs_manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let path = PathBuf::from(path);
    fs_manager.build_index(&path, recursive)
}

/// 获取索引统计信息
#[tauri::command]
pub async fn get_index_stats(
    state: State<'_, FsState>,
) -> Result<crate::core::file_indexer::IndexStats, String> {
    let fs_manager = state
        .fs_manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    fs_manager.get_index_stats()
}

/// 清除文件索引
#[tauri::command]
pub async fn clear_file_index(state: State<'_, FsState>) -> Result<(), String> {
    let fs_manager = state
        .fs_manager
        .lock()
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
    let fs_manager = state
        .fs_manager
        .lock()
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
    let fs_manager = state
        .fs_manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let recursive = recursive.unwrap_or(false);

    fs_manager.get_indexed_paths(path.as_deref(), recursive)
}

/// 检查路径是否已被索引
#[tauri::command]
pub async fn is_path_indexed(path: String, state: State<'_, FsState>) -> Result<bool, String> {
    let fs_manager = state
        .fs_manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    fs_manager.is_path_indexed(&path)
}

/// 获取索引进度
#[tauri::command]
pub async fn get_index_progress(
    state: State<'_, FsState>,
) -> Result<crate::core::file_indexer::IndexProgress, String> {
    let fs_manager = state
        .fs_manager
        .lock()
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

/// 获取未索引的文件和文件夹
#[tauri::command]
pub async fn get_unindexed_files(
    root_path: String,
    state: State<'_, FsState>,
) -> Result<UnindexedFilesResult, String> {
    println!("🔍 开始扫描未索引文件: {}", root_path);

    let fs_manager = state
        .fs_manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    let root_path = PathBuf::from(root_path);

    // 检查根路径是否存在
    if !root_path.exists() {
        return Err(format!("根路径不存在: {}", root_path.display()));
    }

    println!("📁 根路径存在，开始扫描...");

    // 获取所有文件和文件夹
    let mut files = Vec::new();
    let mut folders = Vec::new();
    let mut archives = Vec::new();

    // 递归扫描目录
    scan_directory(
        &root_path,
        &mut files,
        &mut folders,
        &mut archives,
        &fs_manager,
    )?;

    println!(
        "📊 扫描完成: 找到 {} 个文件, {} 个文件夹",
        files.len(),
        folders.len()
    );

    // 过滤掉已索引的项目（只获取未索引的）
    let mut unindexed_files = Vec::new();
    let mut unindexed_folders = Vec::new();
    let mut unindexed_archives = Vec::new();

    for file in files {
        let path_str = file.to_string_lossy();
        match fs_manager.is_path_indexed(&path_str) {
            Ok(is_indexed) => {
                if !is_indexed {
                    unindexed_files.push(path_str.to_string());
                }
            }
            Err(e) => {
                println!("⚠️ 检查索引状态失败 {}: {}", path_str, e);
                // 如果检查失败，假设未索引
                unindexed_files.push(path_str.to_string());
            }
        }
    }

    for folder in folders {
        let path_str = folder.to_string_lossy();
        match fs_manager.is_path_indexed(&path_str) {
            Ok(is_indexed) => {
                if !is_indexed {
                    unindexed_folders.push(path_str.to_string());
                }
            }
            Err(e) => {
                println!("⚠️ 检查索引状态失败 {}: {}", path_str, e);
                // 如果检查失败，假设未索引
                unindexed_folders.push(path_str.to_string());
            }
        }
    }

    for archive in archives {
        let path_str = archive.to_string_lossy();
        match fs_manager.is_path_indexed(&path_str) {
            Ok(is_indexed) => {
                if !is_indexed {
                    unindexed_archives.push(path_str.to_string());
                }
            }
            Err(e) => {
                println!("⚠️ 检查索引状态失败 {}: {}", path_str, e);
                unindexed_archives.push(path_str.to_string());
            }
        }
    }

    println!(
        "✅ 过滤完成: 未索引文件 {} 个, 未索引文件夹 {} 个, 未索引压缩包 {} 个",
        unindexed_files.len(),
        unindexed_folders.len(),
        unindexed_archives.len()
    );

    Ok(UnindexedFilesResult {
        files: unindexed_files,
        folders: unindexed_folders,
        archives: unindexed_archives,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnindexedFilesResult {
    pub files: Vec<String>,
    pub folders: Vec<String>,
    pub archives: Vec<String>,
}

fn scan_directory(
    dir: &Path,
    files: &mut Vec<PathBuf>,
    folders: &mut Vec<PathBuf>,
    archives: &mut Vec<PathBuf>,
    fs_manager: &FsManager,
) -> Result<(), String> {
    let dir_name = dir.file_name().and_then(|n| n.to_str()).unwrap_or("未知");

    println!("📂 扫描目录: {}", dir.display());

    let entries =
        std::fs::read_dir(dir).map_err(|e| format!("读取目录失败 {}: {}", dir.display(), e))?;

    let mut file_count = 0;
    let mut folder_count = 0;
    let mut archive_count = 0;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
        let path = entry.path();

        // 跳过隐藏文件和系统目录
        if let Some(name) = path.file_name() {
            let name_str = name.to_string_lossy();
            if name_str.starts_with('.')
                || name_str == "$RECYCLE.BIN"
                || name_str == "System Volume Information"
            {
                continue;
            }
        }

        if path.is_dir() {
            // 添加文件夹
            folders.push(path.clone());
            folder_count += 1;

            // 递归扫描子目录
            scan_directory(&path, files, folders, archives, fs_manager)?;
        } else if path.is_file() {
            // 检查是否为图片文件或压缩包
            if is_image_file(&path) {
                files.push(path);
                file_count += 1;
            } else if is_archive_file(&path) {
                archives.push(path);
                archive_count += 1;
            }
        }
    }

    if file_count > 0 || folder_count > 0 || archive_count > 0 {
        println!(
            "  📊 {} - 文件: {}, 文件夹: {}, 压缩包: {}",
            dir_name, file_count, folder_count, archive_count
        );
    }

    Ok(())
}

fn is_archive_file(path: &Path) -> bool {
    if let Some(ext) = path.extension() {
        let ext = ext.to_string_lossy().to_lowercase();
        matches!(ext.as_str(), "zip" | "cbz" | "rar" | "cbr" | "7z" | "cb7")
    } else {
        false
    }
}

// ===== 分页和流式浏览相关 =====

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::LazyLock;

// 全局流ID计数器
static STREAM_COUNTER: AtomicU64 = AtomicU64::new(0);

// 流状态管理
static STREAMS: LazyLock<Mutex<HashMap<String, DirectoryStream>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Debug)]
struct DirectoryStream {
    id: String,
    path: PathBuf,
    entries: Vec<PathBuf>, // 改为存储PathBuf而不是DirEntry
    current_index: usize,
    batch_size: usize,
    total: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryPageResult {
    pub items: Vec<FileInfo>,
    pub total: usize,
    pub has_more: bool,
    pub next_offset: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryStreamStartResult {
    pub stream_id: String,
    pub initial_batch: Vec<FileInfo>,
    pub total: usize,
    pub has_more: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamBatchResult {
    pub items: Vec<FileInfo>,
    pub has_more: bool,
}

/// 分页浏览目录
#[tauri::command]
pub async fn browse_directory_page(
    path: String,
    options: Option<DirectoryPageOptions>,
) -> Result<DirectoryPageResult, String> {
    let options = options.unwrap_or_default();
    let path = Path::new(&path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }

    // 读取所有目录条目
    let mut entries: Vec<PathBuf> = std::fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect();

    // 应用排序
    sort_entries(&mut entries, &options.sort_by, &options.sort_order);

    let total = entries.len();
    let offset = options.offset.unwrap_or(0);
    let limit = options.limit.unwrap_or(100);

    // 获取分页数据
    let page_entries: Vec<PathBuf> = entries.into_iter().skip(offset).take(limit).collect();

    // 转换为FileInfo
    let items = convert_paths_to_file_info(page_entries)?;

    let has_more = offset + items.len() < total;
    let next_offset = if has_more {
        Some(offset + items.len())
    } else {
        None
    };

    Ok(DirectoryPageResult {
        items,
        total,
        has_more,
        next_offset,
    })
}

/// 启动目录流
#[tauri::command]
pub async fn start_directory_stream(
    path: String,
    options: Option<DirectoryStreamOptions>,
) -> Result<DirectoryStreamStartResult, String> {
    let options = options.unwrap_or_default();
    let path = Path::new(&path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }

    // 读取所有目录条目
    let mut entries: Vec<PathBuf> = std::fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect();

    // 应用排序
    sort_entries(&mut entries, &options.sort_by, &options.sort_order);

    let total = entries.len();
    let batch_size = options.batch_size.unwrap_or(50);
    let stream_id = format!("stream_{}", STREAM_COUNTER.fetch_add(1, Ordering::SeqCst));

    // 获取初始批次
    let initial_batch: Vec<PathBuf> = entries.iter().take(batch_size).cloned().collect();

    let initial_items = convert_paths_to_file_info(initial_batch)?;
    let has_more = batch_size < total;

    // 创建流状态
    let stream = DirectoryStream {
        id: stream_id.clone(),
        path: path.to_path_buf(),
        entries,
        current_index: batch_size,
        batch_size,
        total,
    };

    // 存储流状态
    let mut streams = STREAMS.lock().unwrap();
    streams.insert(stream_id.clone(), stream);

    Ok(DirectoryStreamStartResult {
        stream_id,
        initial_batch: initial_items,
        total,
        has_more,
    })
}

/// 获取流的下一批数据
#[tauri::command]
pub async fn get_next_stream_batch(stream_id: String) -> Result<StreamBatchResult, String> {
    let mut streams = STREAMS.lock().unwrap();

    if let Some(stream) = streams.get_mut(&stream_id) {
        if stream.current_index >= stream.entries.len() {
            // 没有更多数据
            return Ok(StreamBatchResult {
                items: vec![],
                has_more: false,
            });
        }

        // 获取下一批
        let next_index = (stream.current_index + stream.batch_size).min(stream.entries.len());
        let batch: Vec<PathBuf> = stream.entries[stream.current_index..next_index]
            .iter()
            .cloned()
            .collect();

        stream.current_index = next_index;
        let has_more = stream.current_index < stream.entries.len();

        let items = convert_paths_to_file_info(batch)?;

        Ok(StreamBatchResult { items, has_more })
    } else {
        Err(format!("Stream not found: {}", stream_id))
    }
}

/// 缓存索引统计
#[tauri::command]
pub async fn cache_index_stats(
    cache_index: State<'_, CacheIndexState>,
) -> Result<CacheIndexStats, String> {
    cache_index.db.stats()
}

/// 触发缓存 GC
#[tauri::command]
pub async fn cache_index_gc(
    cache_index: State<'_, CacheIndexState>,
) -> Result<CacheGcResult, String> {
    cache_index.db.run_gc()
}

/// 取消目录流
#[tauri::command]
pub async fn cancel_directory_stream(stream_id: String) -> Result<(), String> {
    let mut streams = STREAMS.lock().unwrap();
    if streams.remove(&stream_id).is_some() {
        Ok(())
    } else {
        Err(format!("Stream not found: {}", stream_id))
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryPageOptions {
    pub offset: Option<usize>,
    pub limit: Option<usize>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryStreamOptions {
    pub batch_size: Option<usize>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

fn sort_entries(entries: &mut Vec<PathBuf>, sort_by: &Option<String>, sort_order: &Option<String>) {
    let sort_by = sort_by.as_ref().map(|s| s.as_str()).unwrap_or("name");
    let sort_ascending = sort_order.as_ref().map(|s| s.as_str()).unwrap_or("asc") == "asc";

    entries.sort_by(|a, b| {
        let a_name = a.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let b_name = b.file_name().and_then(|n| n.to_str()).unwrap_or("");

        let comparison = match sort_by {
            "name" => a_name.cmp(&b_name),
            "size" => {
                let a_size = a.metadata().ok().map(|m| m.len()).unwrap_or(0);
                let b_size = b.metadata().ok().map(|m| m.len()).unwrap_or(0);
                a_size.cmp(&b_size)
            }
            "modified" => {
                let a_modified = a.metadata().ok().and_then(|m| m.modified().ok());
                let b_modified = b.metadata().ok().and_then(|m| m.modified().ok());
                a_modified.cmp(&b_modified)
            }
            _ => a_name.cmp(&b_name),
        };

        if sort_ascending {
            comparison
        } else {
            comparison.reverse()
        }
    });
}

fn convert_paths_to_file_info(paths: Vec<PathBuf>) -> Result<Vec<FileInfo>, String> {
    let mut items = Vec::new();

    for path in paths {
        let metadata = std::fs::metadata(&path)
            .map_err(|e| format!("Failed to read metadata for {}: {}", path.display(), e))?;

        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let size = if metadata.is_file() {
            Some(metadata.len())
        } else {
            None
        };

        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.elapsed().ok())
            .map(|duration| {
                let secs = duration.as_secs();
                format!("{} seconds ago", secs)
            });

        items.push(FileInfo {
            name,
            path: path.to_string_lossy().to_string(),
            is_directory: metadata.is_dir(),
            size,
            modified,
        });
    }

    Ok(items)
}
