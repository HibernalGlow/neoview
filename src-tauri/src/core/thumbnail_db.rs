//! Thumbnail Database Module
//! 缩略图数据库模块 - 参考 NeeView 的实现
//! 使用 SQLite 存储 webp 格式的缩略图 blob

use rusqlite::{Connection, params, Result as SqliteResult};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

const DB_FORMAT_VERSION: &str = "2.0";

/// 缩略图数据库管理器
pub struct ThumbnailDb {
    connection: Arc<Mutex<Option<Connection>>>,
    db_path: PathBuf,
}

impl ThumbnailDb {
    /// 创建新的缩略图数据库管理器
    pub fn new(db_path: PathBuf) -> Self {
        Self {
            connection: Arc::new(Mutex::new(None)),
            db_path,
        }
    }

    /// 打开数据库连接（减少日志输出，避免频繁检查）
    fn open(&self) -> SqliteResult<()> {
        let mut conn_opt = self.connection.lock().unwrap();
        
        if conn_opt.is_some() {
            // 连接已存在，直接返回（不打印日志，减少输出）
            return Ok(());
        }
        
        // 只在首次打开时打印日志
        println!("🔓 首次打开数据库连接: {}", self.db_path.display());

        // 创建数据库目录（如果不存在）
        if let Some(parent) = self.db_path.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                eprintln!("❌ 创建数据库目录失败: {} - {}", parent.display(), e);
                return Err(rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
                    Some(format!("创建数据库目录失败: {}", e))
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
        
        // 初始化数据库
        match Self::initialize_db(&conn) {
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


    /// 初始化数据库表结构
    fn initialize_db(conn: &Connection) -> SqliteResult<()> {
        // 设置 PRAGMA（使用 execute_batch 避免返回值问题）
        conn.execute_batch(
            "PRAGMA auto_vacuum = FULL;
             PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;"
        )?;

        // 创建属性表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS property (
                key TEXT NOT NULL PRIMARY KEY,
                value TEXT
            )",
            [],
        )?;

        // 检查格式版本
        let format = Self::load_property(conn, "format")?;
        if format.is_some() && format.as_deref() != Some(DB_FORMAT_VERSION) {
            // 格式不匹配，需要重建数据库
            return Err(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_MISUSE),
                Some("Database format mismatch".to_string()),
            ));
        }

        // 设置格式版本
        Self::save_property(conn, "format", DB_FORMAT_VERSION)?;

        // 创建缩略图表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS thumbs (
                key TEXT NOT NULL PRIMARY KEY,
                size INTEGER,
                date INTEGER,
                ghash INTEGER,
                value BLOB
            )",
            [],
        )?;

        // 创建索引以提高查询性能
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_thumbs_key ON thumbs(key)",
            [],
        )?;

        Ok(())
    }

    /// 加载属性
    fn load_property(conn: &Connection, key: &str) -> SqliteResult<Option<String>> {
        let mut stmt = conn.prepare("SELECT value FROM property WHERE key = ?1")?;
        let mut rows = stmt.query_map([key], |row| {
            Ok(row.get::<_, String>(0)?)
        })?;

        if let Some(row) = rows.next() {
            row.map(Some)
        } else {
            Ok(None)
        }
    }

    /// 保存属性
    fn save_property(conn: &Connection, key: &str, value: &str) -> SqliteResult<()> {
        let mut stmt = conn.prepare(
            "INSERT OR REPLACE INTO property (key, value) VALUES (?1, ?2)"
        )?;
        let _ = stmt.execute(params![key, value])?;
        Ok(())
    }

    /// 获取当前时间戳（秒）
    fn current_timestamp() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
    }

    /// 保存缩略图（减少日志输出）
    pub fn save_thumbnail(
        &self,
        key: &str,
        size: i64,
        ghash: i32,
        thumbnail_data: &[u8],
    ) -> SqliteResult<()> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();
        
        let date = Self::current_timestamp();

        // 使用 prepare + execute 避免 "Execute returned results" 错误
        let mut stmt = conn.prepare(
            "INSERT OR REPLACE INTO thumbs (key, size, date, ghash, value) VALUES (?1, ?2, ?3, ?4, ?5)"
        )?;
        
        // execute 返回受影响的行数
        let _rows_affected = stmt.execute(params![key, size, date, ghash, thumbnail_data])?;
        
        // 释放语句，确保数据已写入
        drop(stmt);
        
        // 只在调试模式下打印日志
        if cfg!(debug_assertions) {
            println!("✅ 缩略图已保存到数据库: key={}, size={} bytes", key, thumbnail_data.len());
        }
        
        Ok(())
    }

    /// 加载缩略图（减少日志输出）
    pub fn load_thumbnail(
        &self,
        key: &str,
        size: i64,
        ghash: i32,
    ) -> SqliteResult<Option<Vec<u8>>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut stmt = conn.prepare(
            "SELECT value FROM thumbs WHERE key = ?1 AND size = ?2 AND ghash = ?3"
        )?;

        let mut rows = stmt.query_map(params![key, size, ghash], |row| {
            Ok(row.get::<_, Vec<u8>>(0)?)
        })?;

        if let Some(row) = rows.next() {
            let data = row?;
            // 只在调试模式下打印日志
            if cfg!(debug_assertions) {
                println!("✅ 从数据库加载缩略图: key={}, size={} bytes", key, data.len());
            }
            Ok(Some(data))
        } else {
            // 只在调试模式下打印日志
            if cfg!(debug_assertions) {
                println!("📭 数据库中没有找到缩略图: key={}", key);
            }
            Ok(None)
        }
    }

    /// 批量加载缩略图（用于预加载索引）
    pub fn batch_load_thumbnails(
        &self,
        keys: &[String],
    ) -> SqliteResult<Vec<(String, Vec<u8>)>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();
        let mut results = Vec::new();

        for key in keys {
            let mut stmt = conn.prepare(
                "SELECT value FROM thumbs WHERE key = ?1"
            )?;

            let mut rows = stmt.query_map([key], |row| {
                Ok(row.get::<_, Vec<u8>>(0)?)
            })?;

            if let Some(row) = rows.next() {
                if let Ok(data) = row {
                    results.push((key.clone(), data));
                }
            }
        }

        Ok(results)
    }

    /// 检查缩略图是否存在
    pub fn has_thumbnail(&self, key: &str, size: i64, ghash: i32) -> SqliteResult<bool> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut stmt = conn.prepare(
            "SELECT 1 FROM thumbs WHERE key = ?1 AND size = ?2 AND ghash = ?3 LIMIT 1"
        )?;

        let exists = stmt.exists(params![key, size, ghash])?;
        Ok(exists)
    }

    /// 更新访问时间
    pub fn update_access_time(&self, key: &str) -> SqliteResult<()> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();
        let date = Self::current_timestamp();

        conn.execute(
            "UPDATE thumbs SET date = ?1 WHERE key = ?2",
            params![date, key],
        )?;

        Ok(())
    }

    /// 删除旧的缩略图（基于时间）
    pub fn delete_old_thumbnails(&self, days: i64) -> SqliteResult<usize> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();
        let cutoff = Self::current_timestamp() - (days * 86400);

        let count = conn.execute(
            "DELETE FROM thumbs WHERE date < ?1",
            params![cutoff],
        )?;

        Ok(count)
    }

    /// 清理数据库（VACUUM）
    pub fn vacuum(&self) -> SqliteResult<()> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();
        conn.execute("VACUUM", [])?;
        Ok(())
    }

    /// 获取数据库大小
    pub fn get_database_size(&self) -> SqliteResult<u64> {
        if self.db_path.exists() {
            std::fs::metadata(&self.db_path)
                .map(|m| m.len())
                .map_err(|e| rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_IOERR),
                    Some(format!("Failed to get file metadata: {}", e))
                ))
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
        }
    }
}

