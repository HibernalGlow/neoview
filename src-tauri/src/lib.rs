//! NeoView - Main Library
//! Tauri 应用程序主入口

mod commands;
mod models;
mod core;

use std::sync::Mutex;
use std::path::PathBuf;
use tauri::Manager;
use core::{BookManager, ImageLoader, FsManager, ThumbnailManager, ArchiveManager};
use commands::fs_commands::FsState;

#[allow(clippy::missing_panics_doc)]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            
            // 初始化文件系统管理器、缩略图管理器和压缩包管理器
            let fs_manager = FsManager::new();
            let cache_dir = app.path().app_cache_dir()
                .unwrap_or_else(|_| PathBuf::from(".cache"))
                .join("thumbnails");
            let thumbnail_manager = ThumbnailManager::new(cache_dir, 256)
                .expect("Failed to create thumbnail manager");
            let archive_manager = ArchiveManager::new();
            
            app.manage(FsState {
                fs_manager: Mutex::new(fs_manager),
                thumbnail_manager: Mutex::new(thumbnail_manager),
                archive_manager: Mutex::new(archive_manager),
            });
            
            Ok(())
        })
        .manage(Mutex::new(BookManager::new()))
        .manage(Mutex::new(ImageLoader::default()))
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
