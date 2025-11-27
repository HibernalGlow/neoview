//! Thumbnail Database Module
//! 缩略图数据库模块 - 参考 NeeView 的实现
//! 使用 SQLite 存储 webp 格式的缩略图 blob

use chrono::{Duration, Local};
use rusqlite::{params, Connection, Result as SqliteResult};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// 缩略图数据库管理器
pub struct ThumbnailDb {
    connection: Arc<Mutex<Option<Connection>>>,
    db_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct ThumbnailDbStats {
    pub total_entries: i64,
    pub file_entries: i64,
    pub folder_entries: i64,
    pub total_size_bytes: i64,
    pub oldest_entry: Option<String>,
    pub newest_entry: Option<String>,
    pub database_size_bytes: u64,
}

#[derive(Debug)]
pub struct ThumbnailDbRecord {
    pub key: String,
    pub category: String,
    pub blob: Option<Vec<u8>>,
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
             PRAGMA synchronous = NORMAL;",
        )?;

        // 创建缩略图表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS thumbs (
                key TEXT NOT NULL PRIMARY KEY,
                size INTEGER,
                date TEXT,
                ghash INTEGER,
                category TEXT DEFAULT 'file',
                value BLOB
            )",
            [],
        )?;
        // 创建索引以提高查询性能
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_thumbs_key ON thumbs(key)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_thumbs_category ON thumbs(category)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_thumbs_date ON thumbs(date)",
            [],
        )?;

        Ok(())
    }

    /// 获取当前时间戳（秒）
    fn current_timestamp_string() -> String {
        Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
    }

    /// 保存缩略图（减少日志输出）
    pub fn save_thumbnail(
        &self,
        key: &str,
        size: i64,
        ghash: i32,
        thumbnail_data: &[u8],
    ) -> SqliteResult<()> {
        self.save_thumbnail_with_category(key, size, ghash, thumbnail_data, None)
    }

    /// 保存缩略图（带类别）
    pub fn save_thumbnail_with_category(
        &self,
        key: &str,
        size: i64,
        ghash: i32,
        thumbnail_data: &[u8],
        category: Option<&str>,
    ) -> SqliteResult<()> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let date = Self::current_timestamp_string();

        // 自动判断类别：如果没有扩展名且不是压缩包内部路径，则为文件夹
        let cat = category.unwrap_or_else(|| {
            if !key.contains("::") && !key.contains(".") {
                "folder"
            } else {
                "file"
            }
        });

        // 使用 prepare + execute 避免 "Execute returned results" 错误
        let mut stmt = conn.prepare(
            "INSERT OR REPLACE INTO thumbs (key, size, date, ghash, category, value) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
        )?;

        // execute 返回受影响的行数
        let _rows_affected = stmt.execute(params![key, size, date, ghash, cat, thumbnail_data])?;

        // 释放语句，确保数据已写入
        drop(stmt);

        // 只在调试模式下打印日志
        if cfg!(debug_assertions) {
            println!(
                "✅ 缩略图已保存到数据库: key={}, category={}, size={} bytes",
                key,
                cat,
                thumbnail_data.len()
            );
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
        self.load_thumbnail_with_category(key, size, ghash, None)
    }

    /// 加载缩略图（仅根据 key 和 category，忽略 size 和 ghash，减少计算）
    /// 这是默认的查询方式，适用于所有文件和文件夹
    pub fn load_thumbnail_by_key_and_category(
        &self,
        key: &str,
        category: &str,
    ) -> SqliteResult<Option<Vec<u8>>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut stmt =
            conn.prepare("SELECT value FROM thumbs WHERE key = ?1 AND category = ?2 LIMIT 1")?;

        let mut rows =
            stmt.query_map(params![key, category], |row| Ok(row.get::<_, Vec<u8>>(0)?))?;

        if let Some(row) = rows.next() {
            let data = row?;
            if cfg!(debug_assertions) {
                println!(
                    "✅ 从数据库加载缩略图（key+category）: key={}, category={}, size={} bytes",
                    key,
                    category,
                    data.len()
                );
            }
            Ok(Some(data))
        } else {
            if cfg!(debug_assertions) {
                println!(
                    "📭 数据库中没有找到缩略图（key+category）: key={}, category={}",
                    key, category
                );
            }
            Ok(None)
        }
    }

    /// 查找路径下最早的缩略图记录（用于文件夹绑定）
    /// 查找所有以 folder_path/ 或 folder_path\ 开头的 key，返回最早的记录
    pub fn find_earliest_thumbnail_in_path(
        &self,
        folder_path: &str,
    ) -> SqliteResult<Option<(String, Vec<u8>)>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        // 查找所有以 folder_path/ 或 folder_path\ 开头的记录，按 date 排序，取最早的
        // 只查找文件（category='file'），不查找文件夹
        // 使用 OR 条件匹配两种路径分隔符
        let search_pattern1 = format!("{}/%", folder_path);
        let search_pattern2 = format!("{}\\{}", folder_path, "%");
        let mut stmt = conn.prepare(
            "SELECT key, value, date FROM thumbs WHERE (key LIKE ?1 OR key LIKE ?2) AND category = 'file' ORDER BY date ASC LIMIT 1"
        )?;

        let mut rows = stmt.query_map(params![search_pattern1, search_pattern2], |row| {
            let key: String = row.get(0)?;
            let value: Vec<u8> = row.get(1)?;
            Ok((key, value))
        })?;

        if let Some(row) = rows.next() {
            let result = row?;
            if cfg!(debug_assertions) {
                println!("🔍 找到路径下最早的缩略图: {}", result.0);
            }
            Ok(Some(result))
        } else {
            if cfg!(debug_assertions) {
                println!("📭 路径下没有找到缩略图: {}", folder_path);
            }
            Ok(None)
        }
    }

    /// 加载缩略图（带类别过滤）
    pub fn load_thumbnail_with_category(
        &self,
        key: &str,
        size: i64,
        ghash: i32,
        category: Option<&str>,
    ) -> SqliteResult<Option<Vec<u8>>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        // 如果指定了类别，只在对应类别中搜索
        let result = if let Some(cat) = category {
            let mut stmt = conn.prepare(
                "SELECT value FROM thumbs WHERE key = ?1 AND size = ?2 AND ghash = ?3 AND category = ?4"
            )?;
            let mut rows = stmt.query_map(params![key, size, ghash, cat], |row| {
                Ok(row.get::<_, Vec<u8>>(0)?)
            })?;
            rows.next().transpose()
        } else {
            let mut stmt = conn
                .prepare("SELECT value FROM thumbs WHERE key = ?1 AND size = ?2 AND ghash = ?3")?;
            let mut rows = stmt.query_map(params![key, size, ghash], |row| {
                Ok(row.get::<_, Vec<u8>>(0)?)
            })?;
            rows.next().transpose()
        };

        match result {
            Ok(Some(data)) => {
                // 只在调试模式下打印日志
                if cfg!(debug_assertions) {
                    println!(
                        "✅ 从数据库加载缩略图: key={}, category={:?}, size={} bytes",
                        key,
                        category,
                        data.len()
                    );
                }
                Ok(Some(data))
            }
            Ok(None) => {
                // 只在调试模式下打印日志
                if cfg!(debug_assertions) {
                    println!(
                        "📭 数据库中没有找到缩略图: key={}, category={:?}",
                        key, category
                    );
                }
                Ok(None)
            }
            Err(e) => Err(e),
        }
    }

    /// 批量加载缩略图（用于预加载索引）
    pub fn batch_load_thumbnails(&self, keys: &[String]) -> SqliteResult<Vec<(String, Vec<u8>)>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();
        let mut results = Vec::new();

        for key in keys {
            let mut stmt = conn.prepare("SELECT value FROM thumbs WHERE key = ?1")?;

            let mut rows = stmt.query_map([key], |row| Ok(row.get::<_, Vec<u8>>(0)?))?;

            if let Some(row) = rows.next() {
                if let Ok(data) = row {
                    results.push((key.clone(), data));
                }
            }
        }

        Ok(results)
    }

    /// 检查缩略图是否存在（仅 key + category，减少计算）
    /// 这是默认的检查方式，适用于所有文件和文件夹
    pub fn has_thumbnail_by_key_and_category(
        &self,
        key: &str,
        category: &str,
    ) -> SqliteResult<bool> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut stmt =
            conn.prepare("SELECT 1 FROM thumbs WHERE key = ?1 AND category = ?2 LIMIT 1")?;

        let exists = stmt.exists(params![key, category])?;
        Ok(exists)
    }

    /// 检查缩略图是否存在（保留以兼容旧代码）
    pub fn has_thumbnail(&self, key: &str, _size: i64, _ghash: i32) -> SqliteResult<bool> {
        // 自动判断类别
        let category = if !key.contains("::") && !key.contains(".") {
            "folder"
        } else {
            "file"
        };
        self.has_thumbnail_by_key_and_category(key, category)
    }

    /// 检查缩略图是否存在（带类别过滤，保留以兼容旧代码）
    pub fn has_thumbnail_with_category(
        &self,
        key: &str,
        _size: i64,
        _ghash: i32,
        category: Option<&str>,
    ) -> SqliteResult<bool> {
        let cat = category.unwrap_or_else(|| {
            if !key.contains("::") && !key.contains(".") {
                "folder"
            } else {
                "file"
            }
        });
        self.has_thumbnail_by_key_and_category(key, cat)
    }

    /// 更新访问时间
    pub fn update_access_time(&self, key: &str) -> SqliteResult<()> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();
        let date = Self::current_timestamp_string();

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
        let cutoff_time = Local::now() - Duration::days(days);
        let cutoff = cutoff_time.format("%Y-%m-%d %H:%M:%S").to_string();

        let count = conn.execute("DELETE FROM thumbs WHERE date < ?1", params![cutoff])?;

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

    /// 获取目录下所有缓存的缩略图（用于启动预加载）
    pub fn get_thumbnails_by_directory(&self, directory: &str) -> SqliteResult<Vec<crate::commands::thumbnail_commands::ThumbnailEntry>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        // 规范化目录路径（确保以 / 或 \ 结尾用于 LIKE 匹配）
        let dir_pattern = if directory.ends_with('/') || directory.ends_with('\\') {
            format!("{}%", directory)
        } else {
            format!("{}%", directory)
        };

        let mut stmt = conn.prepare(
            "SELECT key, value FROM thumbs WHERE key LIKE ?1"
        )?;

        let rows = stmt.query_map([&dir_pattern], |row| {
            Ok(crate::commands::thumbnail_commands::ThumbnailEntry {
                path: row.get(0)?,
                data: row.get(1)?,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            if let Ok(entry) = row {
                results.push(entry);
            }
        }

        Ok(results)
    }

    /// 删除缩略图
    pub fn delete_thumbnail(&self, key: &str) -> SqliteResult<()> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();
        conn.execute("DELETE FROM thumbs WHERE key = ?1", [key])?;
        Ok(())
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
