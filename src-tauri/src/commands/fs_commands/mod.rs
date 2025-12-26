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

mod types;
mod read_ops;
mod write_ops;
mod cache_ops;
mod archive_ops;
mod index_ops;

// 重导出所有公共 API
pub use types::*;
pub use read_ops::*;
pub use write_ops::*;
pub use cache_ops::*;
pub use archive_ops::*;
pub use index_ops::*;

use std::sync::{Arc, Mutex};
use crate::core::{ArchiveManager, FsManager};
use crate::core::directory_cache::DirectoryCache;
use crate::core::cache_index_db::CacheIndexDb;

/// 文件系统状态
pub struct FsState {
    pub fs_manager: Arc<Mutex<FsManager>>,
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
