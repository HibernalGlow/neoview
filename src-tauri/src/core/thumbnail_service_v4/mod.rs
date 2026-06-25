//! 统一缩略图服务 V4
//!
//! 所有缩略图请求走同一套：
//! - File(path)
//! - ArchiveEntry(archivePath, innerPath, entryIndex)
//! - DirectoryCover(dirPath)
//! - BookPage(bookPath, pageIndex, path/innerPath)
//!
//! 统一缓存键、统一队列、统一事件

pub mod queue;
pub mod service;
pub mod types;

pub use service::UnifiedThumbnailService;
pub use types::*;
