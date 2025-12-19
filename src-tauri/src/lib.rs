//! NeoView - Main Library
//! Tauri 应用程序主入口

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// 抑制开发阶段的未使用代码警告
#![allow(dead_code)]
#![allow(unused_imports)]
#![allow(unused_variables)]

mod commands;
mod core;
mod models;
mod tray;

use commands::fs_commands::{CacheIndexState, DirectoryCacheState, FsState};
use commands::thumbnail_commands::ThumbnailState;
use core::directory_stream::StreamManagerState;
use commands::generic_upscale_commands::GenericUpscalerState;
use commands::page_commands::PageManagerState;
use commands::pyo3_upscale_commands::PyO3UpscalerState;
use commands::task_queue_commands::BackgroundSchedulerState;
use commands::upscale_commands::UpscaleManagerState;
use commands::upscale_service_commands::UpscaleServiceState;
use commands::upscale_settings_commands::UpscaleSettingsState;
use core::blob_registry::BlobRegistry;
use core::job_engine::{JobEngine, JobEngineConfig};
use core::page_manager::PageContentManager;
use core::background_scheduler::BackgroundTaskScheduler;
use core::cache_index_db::CacheIndexDb;
use core::thumbnail_db::ThumbnailDb;
use core::thumbnail_generator::{ThumbnailGenerator, ThumbnailGeneratorConfig};
use core::upscale_scheduler::{UpscaleScheduler, UpscaleSchedulerState};
use core::custom_protocol::{handle_protocol_request, ProtocolState, PROTOCOL_NAME};
use core::{ArchiveManager, BookManager, FsManager, ImageLoader};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

#[allow(clippy::missing_panics_doc)]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 设置 panic hook 以捕获崩溃信息
    std::panic::set_hook(Box::new(|panic_info| {
        let msg = format!("PANIC: {}", panic_info);
        log::error!("{}", msg);
        
        // 尝试写入日志文件
        if let Ok(app_data) = std::env::var("APPDATA") {
            let log_path = std::path::PathBuf::from(app_data)
                .join("NeoView")
                .join("logs")
                .join("panic.log");
            if let Some(parent) = log_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
            let log_entry = format!("[{}] {}\n", timestamp, msg);
            let _ = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_path)
                .and_then(|mut file| {
                    use std::io::Write;
                    file.write_all(log_entry.as_bytes())
                });
        }
        
        // 显示错误对话框
        core::startup_init::show_startup_error_dialog("NeoView 崩溃", &msg);
    }));

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_x::init())
        // 🚀 注册 Custom Protocol (neoview://)
        // 绕过 invoke 序列化开销，直接传输二进制数据
        .register_uri_scheme_protocol(PROTOCOL_NAME, |ctx, request| {
            handle_protocol_request(ctx.app_handle(), request)
        })
        .setup(|app| {
            // 🚀 启动初始化：确保所有必需目录存在
            let startup_diagnostics = match core::startup_init::ensure_app_directories(app.handle()) {
                Ok(diag) => {
                    core::startup_init::write_startup_log(&diag.app_data_path, "NeoView 启动中...");
                    diag
                }
                Err(e) => {
                    log::error!("❌ 启动初始化失败: {e}");
                    // 使用临时目录作为最后手段
                    core::startup_init::StartupDiagnostics {
                        app_data_path: std::env::temp_dir().join("neoview_data"),
                        used_fallback: true,
                        directories_created: Vec::new(),
                    }
                }
            };
            let app_data_root = startup_diagnostics.app_data_path.clone();

            // 初始化文件系统管理器和压缩包管理器
            let fs_manager = FsManager::new();
            let archive_manager = ArchiveManager::new();
            let archive_manager_arc = Arc::new(Mutex::new(archive_manager));

            app.manage(FsState {
                fs_manager: Arc::new(Mutex::new(fs_manager)),
                archive_manager: Arc::clone(&archive_manager_arc),
            });

            // 🚀 初始化 Custom Protocol 状态
            let protocol_state = ProtocolState::new(Arc::clone(&archive_manager_arc));
            app.manage(protocol_state);
            log::info!("🌐 Custom Protocol (neoview://) 初始化完成");

            // 优化：增加目录缓存容量和TTL
            // 容量从 128 增加到 512，TTL 从 30s 增加到 120s
            let directory_cache =
                core::directory_cache::DirectoryCache::new(512, Duration::from_secs(120));
            // 优化：增加 SQLite 缓存 TTL
            // directory_ttl: 300s -> 600s (10分钟)
            // thumbnail_ttl: 3600s -> 7200s (2小时)
            // 使用 new_with_recovery 以支持数据库损坏时自动恢复
            let cache_index_db = CacheIndexDb::new_with_recovery(
                app_data_root.join("directory_cache.db"),
                Duration::from_secs(600),
                Duration::from_secs(7200),
            );
            app.manage(DirectoryCacheState {
                cache: Mutex::new(directory_cache),
            });
            app.manage(CacheIndexState {
                db: Arc::new(cache_index_db),
            });

            // 根据 CPU 核心数动态调整并发度，最少 8，最多 32
            // 参考 NeeView 的 JobClient 多线程设计
            let num_cores = std::thread::available_parallelism()
                .map(|n| n.get())
                .unwrap_or(4);
            let scheduler_concurrency = (num_cores * 2).clamp(8, 32);
            let background_scheduler = BackgroundTaskScheduler::new(scheduler_concurrency, 128);
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

            // 初始化超分服务状态（V2）
            app.manage(UpscaleServiceState::default());

            // 初始化 JobEngine 和 PageContentManager (NeeView 架构)
            let job_engine = Arc::new(JobEngine::new(JobEngineConfig {
                worker_count: num_cores.clamp(2, 8),
                primary_count: 2,
            }));

            // 获取 archive_manager 的引用用于 PageContentManager
            let archive_manager_for_pm = {
                let fs_state = app.state::<FsState>();
                Arc::clone(&fs_state.archive_manager)
            };

            let page_manager = PageContentManager::new(
                Arc::clone(&job_engine),
                archive_manager_for_pm,
            );

            app.manage(PageManagerState {
                manager: Arc::new(tokio::sync::Mutex::new(page_manager)),
            });

            // 初始化流管理器状态
            app.manage(StreamManagerState::default());

            log::info!("🚀 NeoView 初始化完成 (JobEngine workers: {})", num_cores.clamp(2, 8));

            // 初始化系统托盘（使用安全版本，失败不会导致应用崩溃）
            if let Err(e) = tray::init_tray_safe(app.handle()) {
                log::warn!("⚠️ 托盘初始化返回错误: {e}");
            }

            // 初始化尺寸扫描器状态
            let dimension_cache_path = app_data_root.join("dimension_cache.json");
            app.manage(core::DimensionScannerState::new(dimension_cache_path));
            log::info!("📐 尺寸扫描器初始化完成");

            // 🖼️ 初始化 ThumbnailState（在启动时初始化，避免 state() 调用 panic）
            let thumbnail_db_path = app_data_root.join("thumbnails.db");
            let thumbnail_db = Arc::new(ThumbnailDb::new(thumbnail_db_path));
            
            // 创建生成器配置（根据 CPU 核心数动态调整）
            let thumb_thread_pool_size = (num_cores * 4).clamp(16, 32);
            let thumb_archive_concurrency = (num_cores * 2).clamp(4, 12);
            let thumb_config = ThumbnailGeneratorConfig {
                max_width: 256,  // 默认尺寸，前端可通过 init_thumbnail_manager 重新配置
                max_height: 256,
                thread_pool_size: thumb_thread_pool_size,
                archive_concurrency: thumb_archive_concurrency,
            };
            let thumbnail_generator = Arc::new(Mutex::new(
                ThumbnailGenerator::new(Arc::clone(&thumbnail_db), thumb_config)
            ));
            let blob_registry = Arc::new(BlobRegistry::new(1000));
            
            app.manage(ThumbnailState {
                db: thumbnail_db,
                generator: thumbnail_generator,
                blob_registry,
            });
            log::info!("🖼️ ThumbnailState 初始化完成");

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
            // Archive cache commands
            commands::get_cache_stats,
            commands::clear_index_cache,
            commands::invalidate_archive_cache,
            commands::preheat_adjacent_archives,
            commands::cancel_preheat,
            commands::cancel_current_load,
            commands::get_load_metrics,
            // Image commands
            commands::load_image,
            commands::load_image_base64,
            commands::get_image_dimensions,
            // File system commands (old)
            commands::read_directory,
            commands::get_file_info,
            commands::path_exists,
            commands::read_text_file,
            commands::fs_commands::write_text_file,
            commands::fs_commands::delete_file,
            commands::fs_commands::list_directory_files,
            // File system commands (new)
            commands::browse_directory,
            commands::fs_commands::load_directory_snapshot,
            commands::fs_commands::batch_load_directory_snapshots,
            commands::fs_commands::list_subfolders,
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
            commands::move_to_trash_async,
            commands::fs_commands::get_last_deleted_item,
            commands::fs_commands::undo_last_delete,
            commands::fs_commands::restore_from_trash,
            // Archive commands
            commands::list_archive_contents,
            commands::load_image_from_archive,
            commands::load_image_from_archive_binary,
            commands::load_image_from_archive_base64,
            commands::extract_image_to_temp,
            commands::extract_for_clipboard,
            commands::batch_extract_archive,
            commands::get_images_from_archive,
            commands::is_supported_archive,
            commands::batch_scan_archives,
            commands::preload_archive_pages,
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
            commands::emm_metadata_commands::get_emm_all_ratings,
            commands::emm_metadata_commands::get_random_emm_tags,
            commands::emm_metadata_commands::search_by_tags_from_emm,
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
            // Upscale Service commands (V2)
            commands::upscale_service_commands::upscale_service_init,
            commands::upscale_service_commands::upscale_service_set_enabled,
            commands::upscale_service_commands::upscale_service_is_enabled,
            commands::upscale_service_commands::upscale_service_set_current_book,
            commands::upscale_service_commands::upscale_service_set_current_page,
            commands::upscale_service_commands::upscale_service_request,
            commands::upscale_service_commands::upscale_service_request_preload_range,
            commands::upscale_service_commands::upscale_service_sync_conditions,
            commands::upscale_service_commands::upscale_service_cancel_page,
            commands::upscale_service_commands::upscale_service_cancel_book,
            commands::upscale_service_commands::upscale_service_clear_cache,
            commands::upscale_service_commands::upscale_service_get_stats,
            commands::upscale_service_commands::upscale_service_update_conditions,
            commands::upscale_service_commands::upscale_service_stop,
            // Startup Config commands
            commands::startup_config_commands::get_startup_config,
            commands::startup_config_commands::save_startup_config,
            commands::startup_config_commands::update_startup_config_field,
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
            commands::preload_thumbnail_index,
            commands::scan_folder_thumbnails,
            commands::save_folder_thumbnail,
            commands::save_failed_thumbnail,
            commands::get_failed_thumbnail,
            commands::remove_failed_thumbnail,
            commands::batch_check_failed_thumbnails,
            commands::cleanup_old_failures,
            // Thumbnail V3 commands (复刻 NeeView 架构)
            commands::init_thumbnail_service_v3,
            commands::request_visible_thumbnails_v3,
            commands::cancel_thumbnail_requests_v3,
            commands::get_cached_thumbnails_v3,
            commands::preload_directory_thumbnails_v3,
            commands::clear_thumbnail_cache_v3,
            commands::get_thumbnail_cache_stats_v3,
            // 缩略图数据库维护命令
            commands::get_thumbnail_db_stats_v3,
            commands::cleanup_invalid_paths_v3,
            commands::cleanup_expired_entries_v3,
            commands::cleanup_by_path_prefix_v3,
            commands::vacuum_thumbnail_db_v3,
            commands::reload_thumbnail_v3,
            // EMM JSON 缓存命令
            commands::save_emm_json,
            commands::batch_save_emm_json,
            commands::get_emm_json,
            commands::batch_get_emm_json,
            commands::get_all_thumbnail_keys,
            commands::get_thumbnail_keys_by_prefix,
            commands::upsert_with_emm_json,
            // Rating 读写命令（使用 rating_data JSON）
            commands::update_rating_data,
            commands::get_rating_data,
            commands::batch_get_rating_data,
            commands::get_rating_data_by_prefix,
            commands::batch_save_emm_with_rating_data,
            commands::migrate_thumbnail_db,
            commands::get_keys_without_emm_json,
            commands::load_thumbnail_with_emm_json,
            commands::normalize_thumbnail_keys,
            commands::cleanup_invalid_thumbnails,
            commands::get_thumbnail_maintenance_stats,
            commands::calculate_folder_ratings,
            commands::search_by_tags,
            commands::count_matching_collect_tags,
            commands::batch_count_matching_collect_tags,
            commands::save_ai_translation,
            commands::load_ai_translation,
            commands::batch_load_ai_translations,
            commands::get_ai_translation_count,
            // Manual Tags 命令
            commands::update_manual_tags,
            commands::get_manual_tags,
            commands::batch_get_manual_tags,
            commands::get_video_duration,
            commands::is_video_file,
            commands::load_video,
            commands::load_video_from_archive,
            commands::extract_video_to_temp,
            commands::get_background_queue_metrics,
            commands::get_explorer_context_menu_enabled,
            commands::set_explorer_context_menu_enabled,
            commands::generate_explorer_context_menu_reg,
            // Benchmark commands
            commands::benchmark_commands::run_image_benchmark,
            commands::benchmark_commands::run_batch_benchmark,
            commands::benchmark_commands::run_detailed_benchmark,
            commands::benchmark_commands::scan_archive_folder,
            commands::benchmark_commands::run_archive_folder_benchmark,
            commands::benchmark_commands::run_archive_thumbnail_benchmark,
            commands::benchmark_commands::run_realworld_benchmark,
            commands::benchmark_commands::test_load_modes,
            commands::benchmark_commands::load_image_as_bitmap,
            commands::benchmark_commands::load_image_as_bitmap_scaled,
            commands::benchmark_commands::load_image_wic_lz4,
            commands::benchmark_commands::load_image_wic_lz4_cached,
            commands::benchmark_commands::clear_wic_lz4_cache,
            commands::benchmark_commands::run_transcode_benchmark,
            // Page Manager commands (NeeView 架构)
            commands::page_commands::pm_open_book,
            commands::page_commands::pm_close_book,
            commands::page_commands::pm_get_book_info,
            commands::page_commands::pm_goto_page,
            commands::page_commands::pm_get_page,
            commands::page_commands::pm_goto_page_base64,
            commands::page_commands::pm_get_page_base64,
            commands::page_commands::pm_get_page_info,
            commands::page_commands::pm_get_stats,
            commands::page_commands::pm_get_memory_stats,
            commands::page_commands::pm_clear_cache,
            commands::page_commands::pm_trigger_preload,
            commands::page_commands::pm_get_video_path,
            commands::page_commands::pm_get_temp_stats,
            commands::page_commands::pm_get_large_file_threshold,
            commands::page_commands::pm_set_large_file_threshold,
            commands::page_commands::pm_preload_thumbnails,
            // System Monitor commands
            commands::get_system_stats,
            commands::get_system_info,
            // Ollama proxy commands
            commands::ollama_check_status,
            commands::ollama_get_models,
            commands::ollama_generate,
            // Directory streaming commands (Spacedrive-style V2)
            commands::stream_commands::stream_directory_v2,
            commands::stream_commands::cancel_directory_stream_v2,
            commands::stream_commands::cancel_streams_for_path,
            commands::stream_commands::get_active_stream_count,
            commands::stream_commands::stream_search_v2,
            // Metadata commands
            commands::metadata_commands::get_image_metadata,
            // Protocol commands (Custom Protocol 路径注册)
            commands::protocol_commands::register_book_path,
            commands::protocol_commands::batch_register_paths,
            commands::protocol_commands::get_mmap_cache_stats,
            commands::protocol_commands::clear_mmap_cache,
            commands::protocol_commands::invalidate_mmap_cache,
            commands::protocol_commands::clear_path_registry,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // 记录应用事件
            match &event {
                tauri::RunEvent::Ready => {
                    log::info!("🎉 应用就绪");
                    if let Ok(app_data) = app_handle.path().app_data_dir() {
                        core::startup_init::write_startup_log(&app_data, "步骤17: 应用就绪 (Ready)");
                    }
                }
                tauri::RunEvent::ExitRequested { api, code, .. } => {
                    log::info!("📤 应用退出请求, code: {:?}", code);
                    if let Ok(app_data) = app_handle.path().app_data_dir() {
                        core::startup_init::write_startup_log(&app_data, &format!("应用退出请求, code: {:?}", code));
                    }
                }
                tauri::RunEvent::WindowEvent { label, event, .. } => {
                    match event {
                        tauri::WindowEvent::CloseRequested { .. } => {
                            log::info!("🪟 窗口 {} 关闭请求", label);
                        }
                        tauri::WindowEvent::Destroyed => {
                            log::info!("🪟 窗口 {} 已销毁", label);
                            if let Ok(app_data) = app_handle.path().app_data_dir() {
                                core::startup_init::write_startup_log(&app_data, &format!("窗口 {} 已销毁", label));
                            }
                        }
                        _ => {}
                    }
                }
                tauri::RunEvent::WebviewEvent { label, event, .. } => {
                    log::info!("🌐 WebView 事件: {} - {:?}", label, event);
                    if let Ok(app_data) = app_handle.path().app_data_dir() {
                        core::startup_init::write_startup_log(&app_data, &format!("WebView 事件: {} - {:?}", label, event));
                    }
                }
                _ => {}
            }
        });
}
