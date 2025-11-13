//! NeoView - Core Module
//! 导出所有核心功能模块

pub mod book_manager;
pub mod image_loader;
pub mod image_cache;
pub mod fs_manager;
pub mod thumbnail;
pub mod thumbnail_queue;
pub mod thumbnail_db;
pub mod archive;
pub mod file_indexer;
pub mod upscale;
pub mod generic_upscaler;
pub mod upscale_settings;
pub mod pyo3_upscaler;

pub use book_manager::BookManager;
pub use image_loader::ImageLoader;
// ImageCache 仅供内部使用
pub use fs_manager::FsManager;
pub use thumbnail::ThumbnailManager;
// ThumbnailDatabase 仅供内部使用
// pub use thumbnail_db::{ThumbnailDatabase, ThumbnailRecord, ThumbnailStats};
pub use archive::ArchiveManager;
// FileIndexer 暂时未使用，注释掉以避免警告
// pub use file_indexer::FileIndexer;
