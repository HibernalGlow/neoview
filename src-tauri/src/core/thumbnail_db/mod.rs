//! Thumbnail Database Module
//! 缩略图数据库模块 - 参考 NeeView 的实现
//! 使用 SQLite 存储 webp 格式的缩略图 blob
//! 支持 LZ4 压缩以减少数据库体积
//!
//! 模块结构:
//! - types: 类型定义
//! - compression: LZ4 压缩/解压
//! - schema: 数据库初始化和迁移
//! - crud: 基本 CRUD 操作
//! - batch_ops: 批量操作
//! - emm_ops: EMM JSON 操作
//! - rating_ops: 评分数据操作
//! - maintenance: 数据库维护

mod types;
mod compression;
mod schema;
mod crud;
mod batch_ops;
mod emm_ops;
mod rating_ops;
mod maintenance;
mod tags_ops;
mod ai_translation;

pub use types::*;

use chrono::Local;
use rusqlite::{Connection, Result as SqliteResult};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

/// 缩略图数据库管理器
pub struct ThumbnailDb {
    pub(crate) connection: Arc<Mutex<Option<Connection>>>,
    pub(crate) db_path: PathBuf,
    /// 是否启用 LZ4 压缩
    pub(crate) compression_enabled: AtomicBool,
    /// 压缩后累计大小
    pub(crate) compressed_bytes: AtomicU64,
    /// 原始累计大小
    pub(crate) uncompressed_bytes: AtomicU64,
}

impl ThumbnailDb {
    /// 数据库版本常量
    pub(crate) const DB_VERSION: &'static str = "2.4";

    /// 创建新的缩略图数据库管理器
    pub fn new(db_path: PathBuf) -> Self {
        Self {
            connection: Arc::new(Mutex::new(None)),
            db_path,
            compression_enabled: AtomicBool::new(true),
            compressed_bytes: AtomicU64::new(0),
            uncompressed_bytes: AtomicU64::new(0),
        }
    }

    /// 创建新的缩略图数据库管理器（可配置压缩）
    pub fn new_with_compression(db_path: PathBuf, compression_enabled: bool) -> Self {
        Self {
            connection: Arc::new(Mutex::new(None)),
            db_path,
            compression_enabled: AtomicBool::new(compression_enabled),
            compressed_bytes: AtomicU64::new(0),
            uncompressed_bytes: AtomicU64::new(0),
        }
    }

    /// 启用/禁用压缩
    pub fn set_compression_enabled(&self, enabled: bool) {
        self.compression_enabled.store(enabled, Ordering::Relaxed);
    }

    /// 检查压缩是否启用
    pub fn is_compression_enabled(&self) -> bool {
        self.compression_enabled.load(Ordering::Relaxed)
    }

    /// 获取压缩统计信息
    pub fn get_compression_stats(&self) -> CompressionStats {
        let compressed = self.compressed_bytes.load(Ordering::Relaxed);
        let uncompressed = self.uncompressed_bytes.load(Ordering::Relaxed);
        let ratio = if uncompressed > 0 {
            compressed as f64 / uncompressed as f64
        } else {
            1.0
        };
        
        CompressionStats {
            total_entries: 0,
            compressed_size_bytes: compressed,
            uncompressed_size_bytes: uncompressed,
            compression_ratio: ratio,
        }
    }

    /// 打开数据库连接
    pub(crate) fn open(&self) -> SqliteResult<()> {
        let mut conn_opt = self.connection.lock().unwrap();

        if conn_opt.is_some() {
            return Ok(());
        }

        println!("🔓 首次打开数据库连接: {}", self.db_path.display());

        if let Some(parent) = self.db_path.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                eprintln!("❌ 创建数据库目录失败: {} - {}", parent.display(), e);
                return Err(rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
                    Some(format!("创建数据库目录失败: {}", e)),
                ));
            }
        }

        let conn = match Connection::open(&self.db_path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("❌ 数据库连接打开失败: {} - {}", self.db_path.display(), e);
                return Err(e);
            }
        };

        match schema::initialize_db(&conn) {
            Ok(_) => {}
            Err(e) => {
                eprintln!("❌ 数据库表结构初始化失败: {}", e);
                return Err(e);
            }
        }

        *conn_opt = Some(conn);
        println!("✅ 数据库连接已初始化");
        Ok(())
    }

    /// 获取当前时间戳字符串
    pub(crate) fn current_timestamp_string() -> String {
        Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
    }

    /// 获取数据库大小
    pub fn get_database_size(&self) -> SqliteResult<u64> {
        if self.db_path.exists() {
            std::fs::metadata(&self.db_path)
                .map(|m| m.len())
                .map_err(|e| {
                    rusqlite::Error::SqliteFailure(
                        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_IOERR),
                        Some(format!("Failed to get file metadata: {}", e)),
                    )
                })
        } else {
            Ok(0)
        }
    }
}

impl Clone for ThumbnailDb {
    fn clone(&self) -> Self {
        Self {
            connection: Arc::clone(&self.connection),
            db_path: self.db_path.clone(),
            compression_enabled: AtomicBool::new(self.compression_enabled.load(Ordering::Relaxed)),
            compressed_bytes: AtomicU64::new(self.compressed_bytes.load(Ordering::Relaxed)),
            uncompressed_bytes: AtomicU64::new(self.uncompressed_bytes.load(Ordering::Relaxed)),
        }
    }
}
