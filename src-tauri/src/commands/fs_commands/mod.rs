//! NeoView - 文件系统命令模块
//!
//! 提供文件系统操作相关的 Tauri 命令
//!
//! 模块结构:
//! - types: 共享类型定义
//! - read_ops: 读取操作命令
//! - write_ops: 写入操作命令
//! - cache_ops: 缓存操作命令
//! - archive_ops: 压缩包操作命令
//! - index_ops: 索引操作命令

mod archive_ops;
mod cache_ops;
mod index_ops;
mod read_ops;
mod types;
mod write_ops;

// 重导出所有公共 API
pub use archive_ops::*;
pub use cache_ops::*;
pub use index_ops::*;
pub use read_ops::*;
pub use types::*;
pub use write_ops::*;

use crate::core::cache_index_db::CacheIndexDb;
use crate::core::directory_cache::DirectoryCache;
use crate::core::{ArchiveManager, FsManager};
use std::sync::{Arc, Mutex};

/// 文件系统状态
pub struct FsState {
    pub fs_manager: Arc<FsManager>,
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
