//! NeoView - Thumbnail Database
//! 缩略图数据库管理模块

use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use chrono::{DateTime, Utc};
use rusqlite::{Connection, params, Result as SqliteResult};
use serde::{Deserialize, Serialize};

/// 缩略图数据库记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThumbnailRecord {
    /// 原始文件/文件夹的匹配路径（相对于 root_dir 的相对路径，或在非 root 下的完整路径）
    pub bookpath: String,
    /// 缩略图在 thumbnail_root 下的相对路径（例如 "2025/11/11/<hash>.webp"）
    pub relative_thumb_path: String,
    /// 缩略图文件名（哈希值.webp）
    pub thumbnail_name: String,
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
                relative_thumb_path TEXT NOT NULL,
                thumbnail_name TEXT NOT NULL,
                hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                source_modified INTEGER NOT NULL,
                is_folder BOOLEAN NOT NULL DEFAULT 0,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                file_size INTEGER NOT NULL
            )",
            [],
        )?;
        
        // 创建首图索引表（用于压缩包快速定位）
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS archive_first_image (
                archive_path TEXT PRIMARY KEY,
                inner_path TEXT NOT NULL,
                mtime INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )",
            [],
        )?;
        
        // 创建索引以提高查询性能
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_thumbnail_name ON thumbnails(thumbnail_name)",
            [],
        )?;
        
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_source_modified ON thumbnails(source_modified)",
            [],
        )?;
        
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_archive_mtime ON archive_first_image(mtime)",
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
    
    /// 获取缩略图文件路径
    pub fn get_thumbnail_path(&self, relative_path: &Path, create_date: &DateTime<Utc>) -> PathBuf {
        // 按年月日创建文件夹
        let date_folder = create_date.format("%Y/%m/%d").to_string();
        let hash = Self::hash_path(relative_path);
        let thumbnail_name = format!("{}.webp", hash);
        
        self.thumbnail_root
            .join(date_folder)
            .join(thumbnail_name)
    }
    
    /// 获取今日的缩略图存储目录
    pub fn get_today_thumbnail_dir(&self) -> PathBuf {
        let today = Utc::now();
        let date_folder = today.format("%Y/%m/%d").to_string();
        self.thumbnail_root.join(date_folder)
    }
    
    /// 添加或更新缩略图记录
    pub fn upsert_thumbnail(&self, record: ThumbnailRecord) -> SqliteResult<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO thumbnails 
                (bookpath, relative_thumb_path, thumbnail_name, hash, created_at, source_modified, is_folder, width, height, file_size)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                record.bookpath,
                record.relative_thumb_path,
                record.thumbnail_name,
                record.hash,
                record.created_at.to_rfc3339(),
                record.source_modified,
                record.is_folder,
                record.width,
                record.height,
                record.file_size
            ],
        )?;
        
        Ok(())
    }
    
    /// 获取所有缩略图记录
    pub fn get_all_thumbnails(&self) -> SqliteResult<Vec<ThumbnailRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT bookpath, relative_thumb_path, thumbnail_name, hash, created_at, source_modified, is_folder, width, height, file_size
             FROM thumbnails ORDER BY created_at DESC"
        )?;
        
        let records = stmt.query_map([], |row| {
            Ok(ThumbnailRecord {
                bookpath: row.get(0)?,
                relative_thumb_path: row.get(1)?,
                thumbnail_name: row.get(2)?,
                hash: row.get(3)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                    .unwrap()
                    .with_timezone(&Utc),
                source_modified: row.get(5)?,
                is_folder: row.get(6)?,
                width: row.get(7)?,
                height: row.get(8)?,
                file_size: row.get(9)?,
            })
        })?;
        
        let mut result = Vec::new();
        for record in records {
            result.push(record?);
        }
        
        Ok(result)
    }

    /// 根据相对路径查找缩略图记录
    /// 根据 bookpath 查找缩略图记录
    pub fn find_by_bookpath(&self, bookpath: &str) -> SqliteResult<Option<ThumbnailRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT bookpath, relative_thumb_path, thumbnail_name, hash, created_at, source_modified, is_folder, width, height, file_size
             FROM thumbnails WHERE bookpath = ?1"
        )?;
        
        let record = stmt.query_row([bookpath], |row| {
            Ok(ThumbnailRecord {
                bookpath: row.get(0)?,
                relative_thumb_path: row.get(1)?,
                thumbnail_name: row.get(2)?,
                hash: row.get(3)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                    .unwrap()
                    .with_timezone(&Utc),
                source_modified: row.get(5)?,
                is_folder: row.get(6)?,
                width: row.get(7)?,
                height: row.get(8)?,
                file_size: row.get(9)?,
            })
        });
        
        match record {
            Ok(r) => Ok(Some(r)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
    
    /// 根据缩略图名称查找记录
    pub fn find_by_thumbnail_name(&self, thumbnail_name: &str) -> SqliteResult<Option<ThumbnailRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT bookpath, relative_thumb_path, thumbnail_name, hash, created_at, source_modified, is_folder, width, height, file_size
             FROM thumbnails WHERE thumbnail_name = ?1"
        )?;
        
        let record = stmt.query_row([thumbnail_name], |row| {
            Ok(ThumbnailRecord {
                bookpath: row.get(0)?,
                relative_thumb_path: row.get(1)?,
                thumbnail_name: row.get(2)?,
                hash: row.get(3)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                    .unwrap()
                    .with_timezone(&Utc),
                source_modified: row.get(5)?,
                is_folder: row.get(6)?,
                width: row.get(7)?,
                height: row.get(8)?,
                file_size: row.get(9)?,
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
            "SELECT bookpath, relative_thumb_path, thumbnail_name, hash, created_at, source_modified, is_folder, width, height, file_size FROM thumbnails WHERE bookpath LIKE ?1 LIMIT {}",
            limit
        );

        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map([pattern], |row| {
            Ok(ThumbnailRecord {
                bookpath: row.get(0)?,
                relative_thumb_path: row.get(1)?,
                thumbnail_name: row.get(2)?,
                hash: row.get(3)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                    .unwrap()
                    .with_timezone(&Utc),
                source_modified: row.get(5)?,
                is_folder: row.get(6)?,
                width: row.get(7)?,
                height: row.get(8)?,
                file_size: row.get(9)?,
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
    
    /// 删除缩略图记录和文件
    pub fn delete_thumbnail(&self, bookpath: &str) -> SqliteResult<bool> {
        if let Some(record) = self.find_by_bookpath(bookpath)? {
            // 删除文件
            let thumbnail_path = self.thumbnail_root.join(&record.relative_thumb_path);
            if thumbnail_path.exists() {
                fs::remove_file(&thumbnail_path).ok();
            }
            
            // 删除数据库记录
            let affected = self.conn.execute(
                "DELETE FROM thumbnails WHERE bookpath = ?1",
                [bookpath],
            )?;
            
            Ok(affected > 0)
        } else {
            Ok(false)
        }
    }
    
    /// 清理过期的缩略图（超过指定天数）
    pub fn cleanup_expired(&self, days: u32) -> SqliteResult<usize> {
        let cutoff_date = Utc::now() - chrono::Duration::days(days as i64);
        
        // 查找过期记录
        let mut stmt = self.conn.prepare(
            "SELECT relative_thumb_path FROM thumbnails WHERE created_at < ?1"
        )?;
        
        let expired_names: Vec<String> = stmt.query_map([cutoff_date.to_rfc3339()], |row| {
            row.get(0)
        })?.collect::<SqliteResult<Vec<_>>>()?;
        
        // 删除文件
        for rel in &expired_names {
            let thumbnail_path = self.thumbnail_root.join(rel);
            if thumbnail_path.exists() {
                fs::remove_file(&thumbnail_path).ok();
            }
        }
        
        // 删除数据库记录
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

impl ThumbnailDatabase {
    /// 保存或更新压缩包首图索引
    pub fn upsert_archive_first_image(&self, archive_path: &str, inner_path: &str, mtime: i64) -> SqliteResult<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT OR REPLACE INTO archive_first_image (archive_path, inner_path, mtime, created_at) VALUES (?1, ?2, ?3, ?4)",
            [archive_path, inner_path, &mtime.to_string(), &now],
        )?;
        Ok(())
    }
    
    /// 查找压缩包首图索引
    pub fn find_archive_first_image(&self, archive_path: &str) -> SqliteResult<Option<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT inner_path FROM archive_first_image WHERE archive_path = ?1"
        )?;
        
        let result = stmt.query_row([archive_path], |row| {
            row.get(0)
        });
        
        match result {
            Ok(inner_path) => Ok(Some(inner_path)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
    
    /// 批量查询压缩包首图索引
    pub fn find_archive_first_images(&self, archive_paths: &[&str]) -> SqliteResult<std::collections::HashMap<String, String>> {
        if archive_paths.is_empty() {
            return Ok(std::collections::HashMap::new());
        }
        
        let placeholders: String = archive_paths.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "SELECT archive_path, inner_path FROM archive_first_image WHERE archive_path IN ({})",
            placeholders
        );
        
        let mut stmt = self.conn.prepare(&query)?;
        let params: Vec<&dyn rusqlite::ToSql> = archive_paths.iter().map(|p| p as &dyn rusqlite::ToSql).collect();
        
        let rows = stmt.query_map(params.as_slice(), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?
            ))
        })?;
        
        let mut result = std::collections::HashMap::new();
        for row in rows {
            let (archive_path, inner_path) = row?;
            result.insert(archive_path, inner_path);
        }
        
        Ok(result)
    }
    
    /// 删除压缩包首图索引
    pub fn delete_archive_first_image(&self, archive_path: &str) -> SqliteResult<bool> {
        let affected = self.conn.execute(
            "DELETE FROM archive_first_image WHERE archive_path = ?1",
            [archive_path],
        )?;
        Ok(affected > 0)
    }
    
    /// 清理过期的首图索引（超过指定天数）
    pub fn cleanup_expired_archive_first_images(&self, days: u32) -> SqliteResult<usize> {
        let cutoff_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64 - (days as i64 * 86400);
        
        let affected = self.conn.execute(
            "DELETE FROM archive_first_image WHERE mtime < ?1",
            [cutoff_time],
        )?;
        
        Ok(affected as usize)
    }
    
    /// 获取首图索引统计信息
    pub fn get_archive_first_image_stats(&self) -> SqliteResult<i64> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM archive_first_image",
            [],
            |row| row.get(0)
        )?;
        Ok(count)
    }
}

