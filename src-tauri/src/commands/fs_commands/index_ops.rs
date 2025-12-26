//! 文件索引操作命令

use super::types::{IndexSearchOptions, SearchOptions, UnindexedFilesResult};
use super::FsState;
use crate::core::fs_manager::FsManager;
use std::path::{Path, PathBuf};
use tauri::State;

/// 搜索文件（使用后端实现）
#[tauri::command]
pub async fn search_files(
    path: String,
    query: String,
    options: Option<SearchOptions>,
    state: State<'_, FsState>,
) -> Result<Vec<crate::core::fs_manager::FsItem>, String> {
    let search_options = options.unwrap_or_default();

    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let path_buf = PathBuf::from(path);

    let fs_search_options = crate::core::fs_manager::SearchOptions {
        include_subfolders: search_options.include_subfolders,
        max_results: search_options.max_results,
        search_in_path: search_options.search_in_path,
    };

    fs_manager.search_files(&path_buf, &query, &fs_search_options)
}

/// 初始化文件索引
#[tauri::command]
pub async fn initialize_file_index(state: State<'_, FsState>) -> Result<(), String> {
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

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
        .unwrap_or_else(|e| e.into_inner());

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
        .unwrap_or_else(|e| e.into_inner());

    fs_manager.get_index_stats()
}

/// 清除文件索引
#[tauri::command]
pub async fn clear_file_index(state: State<'_, FsState>) -> Result<(), String> {
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

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
        .unwrap_or_else(|e| e.into_inner());

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
        .unwrap_or_else(|e| e.into_inner());

    let recursive = recursive.unwrap_or(false);

    fs_manager.get_indexed_paths(path.as_deref(), recursive)
}

/// 检查路径是否已被索引
#[tauri::command]
pub async fn is_path_indexed(path: String, state: State<'_, FsState>) -> Result<bool, String> {
    let fs_manager = state
        .fs_manager
        .lock()
        .unwrap_or_else(|e| e.into_inner());

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
        .unwrap_or_else(|e| e.into_inner());

    fs_manager.get_index_progress()
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
        .unwrap_or_else(|e| e.into_inner());

    let root_path = PathBuf::from(root_path);

    if !root_path.exists() {
        return Err(format!("根路径不存在: {}", root_path.display()));
    }

    println!("📁 根路径存在，开始扫描...");

    let mut files = Vec::new();
    let mut folders = Vec::new();
    let mut archives = Vec::new();

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

// 辅助函数

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
            folders.push(path.clone());
            folder_count += 1;
            scan_directory(&path, files, folders, archives, fs_manager)?;
        } else if path.is_file() {
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

/// 检查文件是否为压缩包
fn is_archive_file(path: &Path) -> bool {
    if let Some(ext) = path.extension() {
        let ext = ext.to_string_lossy().to_lowercase();
        matches!(ext.as_str(), "zip" | "cbz" | "rar" | "cbr" | "7z" | "cb7")
    } else {
        false
    }
}
