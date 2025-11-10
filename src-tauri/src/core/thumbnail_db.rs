use rusqlite::{Connection, Result};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// 缩略图数据库记录
#[derive(Debug)]
pub struct ThumbnailRecord {
    pub id: Option<i64>,
    pub hash: String,
    pub file_path: String,
    pub file_name: String,
    pub thumbnail_data: String, // base64 encoded
    pub created_at: i64,
    pub updated_at: i64,
    pub file_modified: i64,
}

/// 缩略图数据库管理器
pub struct ThumbnailDatabase {
    conn: Connection,
}

impl ThumbnailDatabase {
    /// 创建新的数据库管理器
    pub fn new(db_path: &Path) -> Result<Self> {
        let conn = Connection::open(db_path)?;

        // 创建表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS thumbnails (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hash TEXT NOT NULL UNIQUE,
                file_path TEXT NOT NULL,
                file_name TEXT NOT NULL,
                thumbnail_data TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                file_modified INTEGER NOT NULL
            )",
            [],
        )?;

        // 创建索引
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_hash ON thumbnails(hash)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_file_path ON thumbnails(file_path)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_updated_at ON thumbnails(updated_at)",
            [],
        )?;

        Ok(Self { conn })
    }

    /// 计算文件路径的哈希值
    pub fn calculate_hash(file_path: &str) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        file_path.hash(&mut hasher);
        format!("{:x}", hasher.finish())
    }

    /// 获取当前时间戳
    fn current_timestamp() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64
    }

    /// 获取文件的修改时间
    fn get_file_modified_time(file_path: &Path) -> Result<i64> {
        let metadata = std::fs::metadata(file_path)
            .map_err(|e| rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(1), Some(format!("获取文件元数据失败: {}", e))))?;
        let modified = metadata.modified()
            .map_err(|e| rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(1), Some(format!("获取文件修改时间失败: {}", e))))?;
        Ok(modified
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64)
    }

    /// 存储缩略图
    pub fn store_thumbnail(&self, file_path: &str, thumbnail_data: &str) -> Result<()> {
        let hash = Self::calculate_hash(file_path);
        let file_name = Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let file_modified = if let Ok(path) = Path::new(file_path).canonicalize() {
            Self::get_file_modified_time(&path).unwrap_or(0)
        } else {
            0
        };

        let now = Self::current_timestamp();

        // 插入或替换记录
        self.conn.execute(
            "INSERT OR REPLACE INTO thumbnails
             (hash, file_path, file_name, thumbnail_data, created_at, updated_at, file_modified)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            [
                &hash,
                file_path,
                &file_name,
                thumbnail_data,
                &now.to_string(),
                &now.to_string(),
                &file_modified.to_string(),
            ],
        )?;

        Ok(())
    }

    /// 获取缩略图
    pub fn get_thumbnail(&self, file_path: &str) -> Result<Option<String>> {
        let hash = Self::calculate_hash(file_path);

        let mut stmt = self.conn.prepare(
            "SELECT thumbnail_data, file_modified FROM thumbnails WHERE hash = ?1"
        )?;

        let mut rows = stmt.query_map([&hash], |row| {
            let data: String = row.get(0)?;
            let stored_modified: i64 = row.get(1)?;
            Ok((data, stored_modified))
        })?;

        if let Some(row_result) = rows.next() {
            let (data, stored_modified) = row_result?;

            // 检查文件是否仍然存在且未修改
            if let Ok(path) = Path::new(file_path).canonicalize() {
                if let Ok(current_modified) = Self::get_file_modified_time(&path) {
                    if current_modified <= stored_modified {
                        return Ok(Some(data));
                    }
                }
            }

            // 文件已修改或不存在，删除缓存记录
            self.delete_thumbnail(file_path)?;
        }

        Ok(None)
    }

    /// 删除缩略图
    pub fn delete_thumbnail(&self, file_path: &str) -> Result<()> {
        let hash = Self::calculate_hash(file_path);
        self.conn.execute(
            "DELETE FROM thumbnails WHERE hash = ?1",
            [&hash],
        )?;
        Ok(())
    }

    /// 清理过期缓存（基于文件修改时间）
    pub fn cleanup_expired(&self) -> Result<usize> {
        let mut count = 0;
        let mut stmt = self.conn.prepare(
            "SELECT id, file_path, file_modified FROM thumbnails"
        )?;

        let mut rows = stmt.query_map([], |row| {
            let id: i64 = row.get(0)?;
            let file_path: String = row.get(1)?;
            let stored_modified: i64 = row.get(2)?;
            Ok((id, file_path, stored_modified))
        })?;

        let mut to_delete = Vec::new();

        while let Some(row_result) = rows.next() {
            let (id, file_path, stored_modified) = row_result?;

            // 检查文件是否存在
            let path = Path::new(&file_path);
            if !path.exists() {
                to_delete.push(id);
                count += 1;
                continue;
            }

            // 检查文件修改时间
            if let Ok(current_modified) = Self::get_file_modified_time(path) {
                if current_modified > stored_modified {
                    to_delete.push(id);
                    count += 1;
                }
            }
        }

        // 批量删除过期记录
        for id in to_delete {
            self.conn.execute(
                "DELETE FROM thumbnails WHERE id = ?1",
                [id],
            )?;
        }

        Ok(count)
    }

    /// 获取缓存统计信息
    pub fn get_stats(&self) -> Result<(usize, u64)> {
        let count: usize = self.conn.query_row(
            "SELECT COUNT(*) FROM thumbnails",
            [],
            |row| row.get(0),
        )?;

        let size: u64 = self.conn.query_row(
            "SELECT COALESCE(SUM(LENGTH(thumbnail_data)), 0) FROM thumbnails",
            [],
            |row| row.get(0),
        )?;

        Ok((count, size))
    }

    /// 清空所有缓存
    pub fn clear_all(&self) -> Result<()> {
        self.conn.execute("DELETE FROM thumbnails", [])?;
        Ok(())
    }

    /// 优化数据库
    pub fn optimize(&self) -> Result<()> {
        self.conn.execute("VACUUM", [])?;
        Ok(())
    }
}