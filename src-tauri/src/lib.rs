//! NeoView - Main Library
//! Tauri 应用程序主入口

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod core;
mod models;

use commands::fs_commands::{CacheIndexState, DirectoryCacheState, FsState};
use commands::generic_upscale_commands::GenericUpscalerState;
use commands::pyo3_upscale_commands::PyO3UpscalerState;
use commands::task_queue_commands::BackgroundSchedulerState;
use commands::upscale_commands::UpscaleManagerState;
use commands::upscale_settings_commands::UpscaleSettingsState;
use core::background_scheduler::BackgroundTaskScheduler;
use core::cache_index_db::CacheIndexDb;
use core::upscale_scheduler::{UpscaleScheduler, UpscaleSchedulerState};
use core::{ArchiveManager, BookManager, FsManager, ImageLoader};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

fn configure_embedded_python(app: &tauri::AppHandle) {
    if std::env::var_os("PYTHONHOME").is_some() {
        return;
    }

    #[cfg(debug_assertions)]
    {
        if let Ok(current_dir) = std::env::current_dir() {
            let candidate = current_dir.join("src-tauri").join("python");
            if candidate.join("python311.dll").exists() {
                std::env::set_var("PYTHONHOME", &candidate);
                return;
            }
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidate = resource_dir.join("python");
        if candidate.join("python311.dll").exists() {
            std::env::set_var("PYTHONHOME", &candidate);
        }
    }
}

#[allow(clippy::missing_panics_doc)]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 设置 panic hook，避免崩溃导致软件闪退
    // 使用更彻底的 panic 处理，防止 dav1d 等库的 panic 导致进程退出
    std::panic::set_hook(Box::new(|panic_info| {
        // 检查是否是图像解码相关的 panic（dav1d/avif-native）
        let is_image_panic = if let Some(location) = panic_info.location() {
            let file = location.file();
            file.contains("dav1d")
                || file.contains("avif")
                || file.contains("avif-native")
                || file.contains("image")
                || file.contains("decoder")
        } else {
            // 如果没有位置信息，检查 panic 消息
            let msg = format!("{:?}", panic_info);
            msg.contains("dav1d")
                || msg.contains("avif")
                || msg.contains("image")
                || msg.contains("decoder")
        };

        if is_image_panic {
            // 图像解码相关的 panic，静默处理，不终止进程
            eprintln!("⚠️ 图像解码 panic (已捕获，不影响运行)");
            if let Some(location) = panic_info.location() {
                eprintln!("   位置: {}:{}", location.file(), location.line());
            }
            // 不调用 std::process::abort()，让程序继续运行
            return;
        }

        // 其他 panic 记录详细信息，但不终止进程
        eprintln!("⚠️ Panic caught: {:?}", panic_info);
        if let Some(location) = panic_info.location() {
            eprintln!(
                "   Location: {}:{}:{}",
                location.file(),
                location.line(),
                location.column()
            );
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
                    if metadata.target().starts_with("mp4parse")
                        || metadata.target().starts_with("avif_native")
                    {
                        metadata.level() <= log::Level::Info
                    } else {
                        true
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_cli::init())
        .setup(|app| {
            configure_embedded_python(&app.handle());
            // 初始化文件系统管理器和压缩包管理器
            let fs_manager = FsManager::new();
            let archive_manager = ArchiveManager::new();

            let app_data_root = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

            app.manage(FsState {
                fs_manager: Arc::new(Mutex::new(fs_manager)),
                archive_manager: Arc::new(Mutex::new(archive_manager)),
            });

            let directory_cache =
                core::directory_cache::DirectoryCache::new(128, Duration::from_secs(30));
            let cache_index_db = CacheIndexDb::new(
                app_data_root.join("directory_cache.db"),
                Duration::from_secs(300),
                Duration::from_secs(3600),
            );
            app.manage(DirectoryCacheState {
                cache: Mutex::new(directory_cache),
            });
            app.manage(CacheIndexState {
                db: Arc::new(cache_index_db),
            });

            let background_scheduler = BackgroundTaskScheduler::new(4, 64);
            app.manage(BackgroundSchedulerState {
                scheduler: Arc::new(background_scheduler),
            });

            // 初始化超分管理器
            let thumbnail_path = app_data_root.join("thumbnails");

            let upscale_manager = core::upscale::UpscaleManager::new(thumbnail_path.clone());
            app.manage(UpscaleManagerState {
                manager: Arc::new(Mutex::new(Some(upscale_manager))),
            });

            // 初始化通用超分管理器
            app.manage(GenericUpscalerState::default());

            // 初始化 PyO3 超分管理器
            let pyo3_state = PyO3UpscalerState::default();
            let pyo3_state_arc = Arc::new(pyo3_state.clone());
            let worker_count = num_cpus::get().clamp(1, 4);
            let scheduler =
                UpscaleScheduler::new(app.handle().clone(), pyo3_state_arc, worker_count);
            app.manage(pyo3_state);
            app.manage(UpscaleSchedulerState {
                scheduler: Arc::new(scheduler),
            });

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
            commands::set_book_sort_mode,
            // Image commands
            commands::load_image,
            commands::get_image_dimensions,
            // File system commands (old)
            commands::read_directory,
            commands::get_file_info,
            commands::path_exists,
            // File system commands (new)
            commands::browse_directory,
            commands::fs_commands::load_directory_snapshot,
            commands::get_images_in_directory,
            // File system commands (paginated/streaming)
            commands::fs_commands::browse_directory_page,
            commands::fs_commands::start_directory_stream,
            commands::fs_commands::get_next_stream_batch,
            commands::fs_commands::cancel_directory_stream,
            commands::fs_commands::get_file_metadata,
            commands::cache_index_stats,
            commands::cache_index_gc,
            commands::enqueue_cache_maintenance,
            commands::create_directory,
            commands::delete_path,
            commands::rename_path,
            commands::move_to_trash,
            // Archive commands
            commands::list_archive_contents,
            commands::load_image_from_archive,
            commands::get_images_from_archive,
            commands::is_supported_archive,
            commands::batch_scan_archives,
            commands::delete_archive_entry,
            // Comparison commands
            commands::prepare_comparison_preview,
            // File operation commands
            commands::fs_commands::copy_path,
            commands::fs_commands::move_path,
            commands::fs_commands::open_with_system,
            commands::fs_commands::show_in_file_manager,
            commands::fs_commands::search_files,
            // EMM Metadata commands
            commands::emm_metadata_commands::load_emm_metadata,
            commands::emm_metadata_commands::load_emm_metadata_by_path,
            commands::emm_metadata_commands::load_emm_collect_tags,
            commands::emm_metadata_commands::find_emm_databases,
            commands::emm_metadata_commands::find_emm_translation_database,
            commands::emm_metadata_commands::find_emm_setting_file,
            commands::emm_metadata_commands::load_emm_translation_dict,
            commands::emm_metadata_commands::find_emm_translation_file,
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
            commands::pyo3_cancel_job,
            commands::test_pyo3_upscaler,
            // Upscale scheduler commands
            commands::enqueue_upscale_job,
            commands::cancel_upscale_job,
            commands::cancel_upscale_jobs_for_page,
            commands::cancel_upscale_jobs_for_book,
            commands::get_upscale_scheduler_stats,
            commands::enqueue_preload_batch,
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
            commands::generate_video_thumbnail_new,
            commands::batch_preload_thumbnails,
            commands::has_thumbnail,
            commands::has_thumbnail_by_key_category,
            commands::load_thumbnail_from_db,
            commands::get_thumbnail_blob_data,
            commands::batch_load_thumbnails_from_db,
            commands::batch_load_thumbnails_raw,
            commands::get_thumbnails_by_directory,
            commands::delete_thumbnails_by_paths,
            commands::preload_thumbnail_index,
            commands::scan_folder_thumbnails,
            commands::get_video_duration,
            commands::is_video_file,
            commands::load_video,
            commands::load_video_from_archive,
            commands::get_background_queue_metrics,
            commands::get_explorer_context_menu_enabled,
            commands::set_explorer_context_menu_enabled,
            commands::generate_explorer_context_menu_reg,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
