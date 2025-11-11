//! NeoView - Main Library
//! Tauri 应用程序主入口

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod core;
mod models;

use commands::*;
use tauri::Manager;
use std::sync::Mutex;
use std::path::PathBuf;
use core::{BookManager, ImageLoader, FsManager, ThumbnailManager, ArchiveManager};
use commands::fs_commands::FsState;
use commands::thumbnail_commands::ThumbnailManagerState;

#[allow(clippy::missing_panics_doc)]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            
            // 初始化文件系统管理器和压缩包管理器
            let fs_manager = FsManager::new();
            let archive_manager = ArchiveManager::new();
            
            app.manage(FsState {
                fs_manager: Mutex::new(fs_manager),
                thumbnail_manager: Mutex::new(ThumbnailManager::new(
                    PathBuf::from(".cache/thumbnails"),
                    PathBuf::from("."),
                    256
                ).expect("Failed to create thumbnail manager")),
                archive_manager: Mutex::new(archive_manager),
            });
            
            // 初始化新的缩略图管理器状态
            let thumbnail_path = app.path().app_data_dir()
                .unwrap_or_else(|_| {
                    // 如果无法获取应用数据目录，使用当前目录
                    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
                })
                .join("thumbnails");
            
            // 确保缩略图目录存在
            std::fs::create_dir_all(&thumbnail_path)
                .expect("Failed to create thumbnail directory");
            
            // 获取当前目录作为根目录
            let root_path = std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            
            println!("📁 缩略图路径: {}", thumbnail_path.display());
            println!("📂 根目录路径: {}", root_path.display());
            
            // 缩略图管理器将在前端初始化，这里只创建目录
            
            Ok(())
        })
        .manage(Mutex::new(BookManager::new()))
        .manage(Mutex::new(ImageLoader::default()))
        .manage(ThumbnailManagerState::default())
        .invoke_handler(tauri::generate_handler![
            // Book commands
            commands::open_book,
            commands::close_book,
            commands::get_current_book,
            commands::navigate_to_page,
            commands::next_page,
            commands::previous_page,
            commands::navigate_to_image,
            // Image commands
            commands::load_image,
            commands::get_image_dimensions,
            commands::generate_thumbnail,
            // File system commands (old)
            commands::read_directory,
            commands::get_file_info,
            commands::path_exists,
            // File system commands (new)
            commands::browse_directory,
            commands::get_images_in_directory,
            commands::generate_file_thumbnail,
            commands::generate_thumbnail_from_data,
            commands::create_directory,
            commands::delete_path,
            commands::rename_path,
            commands::move_to_trash,
            commands::get_thumbnail_cache_size,
            commands::clear_thumbnail_cache,
            commands::cleanup_thumbnail_cache,
            // Archive commands
            commands::list_archive_contents,
            commands::load_image_from_archive,
            commands::get_images_from_archive,
            commands::generate_archive_thumbnail,
            commands::is_supported_archive,
            // File operation commands
            commands::fs_commands::copy_path,
            commands::fs_commands::move_path,
            commands::fs_commands::open_with_system,
            commands::fs_commands::show_in_file_manager,
            commands::fs_commands::search_files,
            // Index commands
            commands::fs_commands::initialize_file_index,
            commands::fs_commands::build_file_index,
            commands::fs_commands::get_index_stats,
            commands::fs_commands::clear_file_index,
            commands::fs_commands::search_in_index,
            commands::fs_commands::get_indexed_paths,
            commands::fs_commands::is_path_indexed,
            commands::fs_commands::get_index_progress,
            // Performance commands
            commands::get_performance_settings,
            commands::save_performance_settings,
            // Thumbnail commands (new)
            commands::init_thumbnail_manager,
            commands::generate_file_thumbnail_new,
            commands::generate_folder_thumbnail,
            commands::get_thumbnail_info,
            commands::get_thumbnails_for_path,
            commands::get_thumbnail_url,
            commands::cleanup_thumbnails,
            commands::get_thumbnail_stats,
            commands::clear_all_thumbnails,
            commands::preload_thumbnails,
            // Archive/temp helpers
            commands::extract_archive_images,
            commands::extract_archive_inner,
            commands::extract_archive_inner_schedule_thumb,
            commands::generate_thumb_for_extracted,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
