//! NeoView - Main Library
//! Tauri 应用程序主入口

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod core;
mod models;

use tauri::Manager;
use std::sync::Mutex;
use std::path::PathBuf;
use core::{BookManager, ImageLoader, FsManager, ArchiveManager};
use commands::fs_commands::FsState;
use commands::upscale_commands::UpscaleManagerState;
use commands::generic_upscale_commands::GenericUpscalerState;
use commands::upscale_settings_commands::UpscaleSettingsState;
use commands::pyo3_upscale_commands::PyO3UpscalerState;
use std::sync::Arc;

#[allow(clippy::missing_panics_doc)]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 设置 panic hook，避免崩溃导致软件闪退
    std::panic::set_hook(Box::new(|panic_info| {
        // 检查是否是图像解码相关的 panic（dav1d/avif-native）
        if let Some(location) = panic_info.location() {
            let file = location.file();
            if file.contains("dav1d") || file.contains("avif") || file.contains("avif-native") {
                // 图像解码相关的 panic，静默处理，不终止进程
                eprintln!("⚠️ 图像解码 panic (已捕获，不影响运行): {}:{}", 
                    location.file(), location.line());
                // 不调用 std::process::abort()，让程序继续运行
                return;
            }
        }
        
        // 其他 panic 记录详细信息
        eprintln!("⚠️ Panic caught: {:?}", panic_info);
        if let Some(location) = panic_info.location() {
            eprintln!("   Location: {}:{}:{}", location.file(), location.line(), location.column());
        }
        // 注意：这里不调用 abort，让程序继续运行
    }));
    
    // 设置日志级别，屏蔽 avif-native/mp4parse 的 TRACE 日志
    std::env::set_var("RUST_LOG", "info,mp4parse=info,avif_native=info");
    
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .filter(|metadata| {
                    // 过滤掉 mp4parse 和 avif_native 的 TRACE 和 DEBUG 日志
                    if metadata.target().starts_with("mp4parse") || 
                       metadata.target().starts_with("avif_native") {
                        metadata.level() <= log::Level::Info
                    } else {
                        true
                    }
                })
                .build()
        )
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            
            // 初始化文件系统管理器和压缩包管理器
            let fs_manager = FsManager::new();
            let archive_manager = ArchiveManager::new();
            
            app.manage(FsState {
                fs_manager: Mutex::new(fs_manager),
                archive_manager: Mutex::new(archive_manager),
            });
            
            // 初始化超分管理器
            let thumbnail_path = app.path().app_data_dir()
                .unwrap_or_else(|_| {
                    // 如果无法获取应用数据目录，使用当前目录
                    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
                })
                .join("thumbnails");
            
            let upscale_manager = core::upscale::UpscaleManager::new(thumbnail_path.clone());
            app.manage(UpscaleManagerState {
                manager: Arc::new(Mutex::new(Some(upscale_manager))),
            });
            
            // 初始化通用超分管理器
            app.manage(GenericUpscalerState::default());
            
            // 初始化 PyO3 超分管理器
            app.manage(PyO3UpscalerState::default());
            
            // 初始化设置管理器
            app.manage(UpscaleSettingsState::default());
            
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
            // File system commands (old)
            commands::read_directory,
            commands::get_file_info,
            commands::path_exists,
            // File system commands (new)
            commands::browse_directory,
            commands::get_images_in_directory,
            // File system commands (paginated/streaming)
            commands::fs_commands::browse_directory_page,
            commands::fs_commands::start_directory_stream,
            commands::fs_commands::get_next_stream_batch,
            commands::fs_commands::cancel_directory_stream,
            commands::create_directory,
            commands::delete_path,
            commands::rename_path,
            commands::move_to_trash,
            // Archive commands
            commands::list_archive_contents,
            commands::load_image_from_archive,
            commands::get_images_from_archive,
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
            commands::fs_commands::get_unindexed_files,
            // Performance commands
            commands::get_performance_settings,
            commands::save_performance_settings,
            // Upscale commands
            commands::init_upscale_manager,
            commands::check_upscale_availability,
            commands::get_upscale_save_path,
            commands::upscale_image,
            commands::get_upscale_cache_stats,
            commands::cleanup_upscale_cache,
            // Generic Upscale commands
            commands::init_generic_upscale_manager,
            commands::check_generic_upscale_availability,
            commands::get_available_algorithms,
            commands::get_algorithm_default_models,
            commands::scan_models_directory,
            commands::generic_upscale_image,
            commands::get_generic_upscale_save_path,
            commands::get_generic_upscale_cache_stats,
            commands::cleanup_generic_upscale_cache,
            commands::test_all_algorithms,
            commands::test_algorithm_models,
            commands::debug_models_info,
            // PyO3 Upscale commands
            commands::init_pyo3_upscaler,
            commands::check_pyo3_upscaler_availability,
            commands::get_pyo3_available_models,
            commands::get_pyo3_model_id,
            commands::pyo3_upscale_image,
            commands::pyo3_upscale_image_memory,
            commands::pyo3_save_upscale_cache,
            commands::get_image_data_for_upscale,
            commands::read_upscale_cache_file,
            commands::check_pyo3_upscale_cache,
            commands::get_pyo3_cache_stats,
            commands::cleanup_pyo3_cache,
            commands::test_pyo3_upscaler,
            // Upscale Settings commands
            commands::init_upscale_settings_manager,
            commands::get_upscale_settings,
            commands::save_upscale_settings,
            commands::reset_upscale_settings,
            commands::get_upscale_settings_path,
            commands::check_upscale_conditions,
            commands::get_preload_pages,
            commands::set_preload_pages,
            commands::get_conditional_upscale_settings,
            commands::update_conditional_upscale_settings,
            commands::get_global_upscale_enabled,
            commands::set_global_upscale_enabled,
            commands::get_comparison_settings,
            commands::update_comparison_settings,
            commands::toggle_comparison_mode,
            commands::set_comparison_mode,
            // Image Data commands
            commands::calculate_path_hash,
            commands::check_upscale_cache,
            commands::check_upscale_cache_for_algorithm,
            commands::save_binary_file,
            commands::read_binary_file,
            // Video commands
            commands::check_ffmpeg_available,
            commands::generate_video_thumbnail,
            // Thumbnail commands
            commands::init_thumbnail_manager,
            commands::generate_file_thumbnail_new,
            commands::generate_archive_thumbnail_new,
            commands::batch_preload_thumbnails,
            commands::has_thumbnail,
            commands::load_thumbnail_from_db,
            commands::get_thumbnail_blob_data,
            commands::get_video_duration,
            commands::is_video_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
