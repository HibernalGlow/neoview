//! NeoView - Core Module
//! 导出所有核心功能模块

pub mod archive;
pub mod ebook;
pub mod job_engine;
pub mod page_manager;
pub mod archive_manager;
// pub mod archive_prefetcher; // TODO: 需要 archive_page_cache 模块
pub mod background_scheduler;
pub mod data_source;
pub mod image_loader_mode;
pub mod blob_registry;
pub mod book_manager;
pub mod cache_index_db;
pub mod directory_cache;
pub mod explorer_context_menu;
pub mod file_indexer;
pub mod fs_manager;
pub mod generic_upscaler;
pub mod image_cache;
pub mod image_loader;
pub mod path_utils;
pub mod pyo3_upscaler;
pub mod python_upscale_wrapper;
pub mod sr_vulkan_manager;
pub mod thumbnail_db;
pub mod thumbnail_generator;
pub mod thumbnail_service_v3;
pub mod upscale;
pub mod upscale_scheduler;
pub mod upscale_service;
pub mod upscale_settings;
pub mod video_exts;
pub mod video_thumbnail;
pub mod wic_decoder;

pub use book_manager::BookManager;
pub use image_loader::ImageLoader;
// ImageCache 仅供内部使用
pub use archive::ArchiveManager;
pub use fs_manager::FsManager;
// FileIndexer 暂时未使用，注释掉以避免警告
// pub use file_indexer::FileIndexer;
