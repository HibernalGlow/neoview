//! NeoView - Thumbnail Database
//! 缩略图数据库管理模块 - 直接在数据库中存储缩略图字节数据

use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use chrono::{DateTime, Utc};
use rusqlite::{Connection, params, Result as SqliteResult};
use serde::{Deserialize, Serialize};

/// 缩略图数据库记录 - 直接存储 WebP 字节数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThumbnailRecord {
    /// 原始文件/文件夹的匹配路径（相对于 root_dir 的相对路径，或在非 root 下的完整路径）
    pub bookpath: String,
    /// 缩略图哈希（不带扩展名），用于快速查找或作为备用标识
    pub hash: String,
    /// 缩略图生成时间
    pub created_at: DateTime<Utc>,
    /// 原文件最后修改时间
    pub source_modified: i64,
    /// 是否为文件夹缩略图
    pub is_folder: bool,
    /// 缩略图宽度
    pub width: u32,
    /// 缩略图高度
    pub height: u32,
    /// 缩略图文件大小（字节）
    pub file_size: u64,
    /// WebP 缩略图字节数据 - 直接存储在数据库中
    pub webp_data: Vec<u8>,
}

/// 缩略图数据库管理器
pub struct ThumbnailDatabase {
    /// 数据库连接
    pub conn: Connection,
    /// 缩略图存储根目录
    pub thumbnail_root: PathBuf,
}

impl ThumbnailDatabase {
    /// 创建或打开缩略图数据库
    pub fn new(thumbnail_root: PathBuf) -> SqliteResult<Self> {
        // 确保缩略图根目录存在
        fs::create_dir_all(&thumbnail_root).ok();
        
        // 数据库文件路径
        let db_path = thumbnail_root.join("thumbnails.db");
        let conn = Connection::open(db_path)?;
        
        let db = Self {
            conn,
            thumbnail_root,
        };
        
        // 初始化数据库表
        db.init_tables()?;
        
        Ok(db)
    }
    
    /// 初始化数据库表
    fn init_tables(&self) -> SqliteResult<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS thumbnails (
                bookpath TEXT PRIMARY KEY,
                hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                source_modified INTEGER NOT NULL,
                is_folder BOOLEAN NOT NULL DEFAULT 0,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                file_size INTEGER NOT NULL,
                webp_data BLOB NOT NULL
            )",
            [],
        )?;
        
        // 创建索引以提高查询性能
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_hash ON thumbnails(hash)",
            [],
        )?;
        
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_created_at ON thumbnails(created_at)",
            [],
        )?;
        
        Ok(())
    }
    
    /// 计算路径的哈希值
    pub fn hash_path(path: &Path) -> String {
        let mut hasher = DefaultHasher::new();
        path.to_string_lossy().hash(&mut hasher);
        format!("{:x}", hasher.finish())
    }
    
    /// 添加或更新缩略图记录（直接存储 WebP 字节数据）
    pub fn upsert_thumbnail(&self, record: ThumbnailRecord) -> SqliteResult<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO thumbnails 
                (bookpath, hash, created_at, source_modified, is_folder, width, height, file_size, webp_data)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                record.bookpath,
                record.hash,
                record.created_at.to_rfc3339(),
                record.source_modified,
                record.is_folder,
                record.width,
                record.height,
                record.file_size,
                record.webp_data
            ],
        )?;
        
        Ok(())
    }
    
    /// 获取所有缩略图记录
    pub fn get_all_thumbnails(&self) -> SqliteResult<Vec<ThumbnailRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT bookpath, hash, created_at, source_modified, is_folder, width, height, file_size, webp_data
             FROM thumbnails ORDER BY created_at DESC"
        )?;
        
        let records = stmt.query_map([], |row| {
            Ok(ThumbnailRecord {
                bookpath: row.get(0)?,
                hash: row.get(1)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(2)?)
                    .unwrap()
                    .with_timezone(&Utc),
                source_modified: row.get(3)?,
                is_folder: row.get(4)?,
                width: row.get(5)?,
                height: row.get(6)?,
                file_size: row.get(7)?,
                webp_data: row.get(8)?,
            })
        })?;
        
        let mut result = Vec::new();
        for record in records {
            result.push(record?);
        }
        
        Ok(result)
    }

    /// 根据 bookpath 查找缩略图记录
    pub fn find_by_bookpath(&self, bookpath: &str) -> SqliteResult<Option<ThumbnailRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT bookpath, hash, created_at, source_modified, is_folder, width, height, file_size, webp_data
             FROM thumbnails WHERE bookpath = ?1"
        )?;
        
        let record = stmt.query_row([bookpath], |row| {
            Ok(ThumbnailRecord {
                bookpath: row.get(0)?,
                hash: row.get(1)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(2)?)
                    .unwrap()
                    .with_timezone(&Utc),
                source_modified: row.get(3)?,
                is_folder: row.get(4)?,
                width: row.get(5)?,
                height: row.get(6)?,
                file_size: row.get(7)?,
                webp_data: row.get(8)?,
            })
        });
        
        match record {
            Ok(r) => Ok(Some(r)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
    
    /// 根据哈希值查找记录
    pub fn find_by_hash(&self, hash: &str) -> SqliteResult<Option<ThumbnailRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT bookpath, hash, created_at, source_modified, is_folder, width, height, file_size, webp_data
             FROM thumbnails WHERE hash = ?1"
        )?;
        
        let record = stmt.query_row([hash], |row| {
            Ok(ThumbnailRecord {
                bookpath: row.get(0)?,
                hash: row.get(1)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(2)?)
                    .unwrap()
                    .with_timezone(&Utc),
                source_modified: row.get(3)?,
                is_folder: row.get(4)?,
                width: row.get(5)?,
                height: row.get(6)?,
                file_size: row.get(7)?,
                webp_data: row.get(8)?,
            })
        });
        
        match record {
            Ok(r) => Ok(Some(r)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// 按 pattern 查找 bookpath（用于诊断，返回最多 limit 条结果）
    pub fn find_by_bookpath_like(&self, pattern: &str, limit: usize) -> SqliteResult<Vec<ThumbnailRecord>> {
        let sql = format!(
            "SELECT bookpath, hash, created_at, source_modified, is_folder, width, height, file_size, webp_data FROM thumbnails WHERE bookpath LIKE ?1 LIMIT {}",
            limit
        );

        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map([pattern], |row| {
            Ok(ThumbnailRecord {
                bookpath: row.get(0)?,
                hash: row.get(1)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(2)?)
                    .unwrap()
                    .with_timezone(&Utc),
                source_modified: row.get(3)?,
                is_folder: row.get(4)?,
                width: row.get(5)?,
                height: row.get(6)?,
                file_size: row.get(7)?,
                webp_data: row.get(8)?,
            })
        })?;

        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }
    
    /// 检查缩略图是否需要更新
    pub fn needs_update(&self, bookpath: &str, source_modified: i64) -> SqliteResult<bool> {
        match self.find_by_bookpath(bookpath)? {
            Some(record) => Ok(record.source_modified != source_modified),
            None => Ok(true),
        }
    }
    
    /// 删除缩略图记录（数据存储在数据库中，无需删除文件）
    pub fn delete_thumbnail(&self, bookpath: &str) -> SqliteResult<bool> {
        let affected = self.conn.execute(
            "DELETE FROM thumbnails WHERE bookpath = ?1",
            [bookpath],
        )?;
        
        Ok(affected > 0)
    }
    
    /// 清理过期的缩略图（超过指定天数）
    pub fn cleanup_expired(&self, days: u32) -> SqliteResult<usize> {
        let cutoff_date = Utc::now() - chrono::Duration::days(days as i64);
        
        // 直接删除数据库记录（数据存储在数据库中）
        let affected = self.conn.execute(
            "DELETE FROM thumbnails WHERE created_at < ?1",
            [cutoff_date.to_rfc3339()],
        )?;
        
        Ok(affected as usize)
    }
    
    
    
    /// 获取统计信息
    pub fn get_stats(&self) -> SqliteResult<ThumbnailStats> {
        let mut stmt = self.conn.prepare(
            "SELECT 
                COUNT(*) as total_count,
                COUNT(CASE WHEN is_folder = 1 THEN 1 END) as folder_count,
                COUNT(CASE WHEN is_folder = 0 THEN 1 END) as file_count,
                SUM(file_size) as total_size
             FROM thumbnails"
        )?;
        
        let stats = stmt.query_row([], |row| {
            Ok(ThumbnailStats {
                total_count: row.get(0)?,
                folder_count: row.get(1)?,
                file_count: row.get(2)?,
                total_size: row.get(3).unwrap_or(0),
            })
        })?;
        
        Ok(stats)
    }
}

/// 缩略图统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThumbnailStats {
    /// 总缩略图数量
    pub total_count: i64,
    /// 文件夹缩略图数量
    pub folder_count: i64,
    /// 文件缩略图数量
    pub file_count: i64,
    /// 总文件大小（字节）
    pub total_size: i64,
}

