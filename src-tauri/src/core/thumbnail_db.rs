//! Thumbnail Database Module
//! 缩略图数据库模块 - 参考 NeeView 的实现
//! 使用 SQLite 存储 webp 格式的缩略图 blob

use chrono::{Duration, Local};
use rusqlite::{params, Connection, Result as SqliteResult};
use std::collections::HashMap;
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

    /// 初始化数据库表结构（仅创建基础表，迁移由手动触发）
    fn initialize_db(conn: &Connection) -> SqliteResult<()> {
        // 设置 PRAGMA（使用 execute_batch 避免返回值问题）
        conn.execute_batch(
            "PRAGMA auto_vacuum = FULL;
             PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;",
        )?;

        // 创建缩略图表（包含所有字段，新数据库直接创建完整表）
        conn.execute(
            "CREATE TABLE IF NOT EXISTS thumbs (
                key TEXT NOT NULL PRIMARY KEY,
                size INTEGER,
                date TEXT,
                ghash INTEGER,
                category TEXT DEFAULT 'file',
                value BLOB,
                emm_json TEXT,
                rating REAL,
                manual_rating REAL,
                folder_avg_rating REAL
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
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_thumbs_rating ON thumbs(rating)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_thumbs_folder_rating ON thumbs(folder_avg_rating)",
            [],
        )?;

        // 创建失败记录表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS failed_thumbnails (
                key TEXT NOT NULL PRIMARY KEY,
                reason TEXT NOT NULL,
                retry_count INTEGER DEFAULT 0,
                last_attempt TEXT,
                error_message TEXT
            )",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_failed_reason ON failed_thumbnails(reason)",
            [],
        )?;

        Ok(())
    }

    /// 手动迁移：为旧数据库添加 EMM 相关字段（由用户在设置中手动触发）
    pub fn migrate_add_emm_columns(&self) -> SqliteResult<String> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut messages = Vec::new();

        // 检查并添加 emm_json 列
        let has_emm_json: bool = conn.prepare("SELECT emm_json FROM thumbs LIMIT 1").is_ok();
        if !has_emm_json {
            conn.execute("ALTER TABLE thumbs ADD COLUMN emm_json TEXT", [])?;
            messages.push("添加 emm_json 列");
        }

        // 检查并添加 rating 相关列
        let has_rating: bool = conn.prepare("SELECT rating FROM thumbs LIMIT 1").is_ok();
        if !has_rating {
            conn.execute("ALTER TABLE thumbs ADD COLUMN rating REAL", [])?;
            conn.execute("ALTER TABLE thumbs ADD COLUMN manual_rating REAL", [])?;
            conn.execute("ALTER TABLE thumbs ADD COLUMN folder_avg_rating REAL", [])?;
            conn.execute("CREATE INDEX IF NOT EXISTS idx_thumbs_rating ON thumbs(rating)", [])?;
            conn.execute("CREATE INDEX IF NOT EXISTS idx_thumbs_folder_rating ON thumbs(folder_avg_rating)", [])?;
            messages.push("添加 rating/manual_rating/folder_avg_rating 列和索引");
        }

        if messages.is_empty() {
            Ok("数据库已是最新版本，无需迁移".to_string())
        } else {
            Ok(format!("迁移完成: {}", messages.join(", ")))
        }
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

    /// 保存失败记录
    pub fn save_failed_thumbnail(
        &self,
        key: &str,
        reason: &str,
        retry_count: i32,
        error_message: Option<&str>,
    ) -> SqliteResult<()> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let timestamp = Self::current_timestamp_string();
        conn.execute(
            "INSERT OR REPLACE INTO failed_thumbnails (key, reason, retry_count, last_attempt, error_message)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![key, reason, retry_count, timestamp, error_message],
        )?;

        Ok(())
    }

    /// 查询失败记录
    pub fn get_failed_thumbnail(&self, key: &str) -> SqliteResult<Option<(String, i32, String)>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut stmt = conn.prepare(
            "SELECT reason, retry_count, last_attempt FROM failed_thumbnails WHERE key = ?1"
        )?;

        let result = stmt.query_row(params![key], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i32>(1)?,
                row.get::<_, String>(2)?,
            ))
        });

        match result {
            Ok(data) => Ok(Some(data)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// 删除失败记录（当缩略图成功生成后）
    pub fn remove_failed_thumbnail(&self, key: &str) -> SqliteResult<()> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        conn.execute("DELETE FROM failed_thumbnails WHERE key = ?1", params![key])?;
        Ok(())
    }

    /// 批量检查失败记录
    pub fn batch_check_failed(&self, keys: &[&str]) -> SqliteResult<HashMap<String, (String, i32)>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut results = HashMap::new();
        if keys.is_empty() {
            return Ok(results);
        }

        let placeholders: String = keys.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "SELECT key, reason, retry_count FROM failed_thumbnails WHERE key IN ({})",
            placeholders
        );

        let mut stmt = conn.prepare(&query)?;
        let params: Vec<&dyn rusqlite::ToSql> = keys.iter().map(|k| k as &dyn rusqlite::ToSql).collect();
        let mut rows = stmt.query(params.as_slice())?;

        while let Some(row) = rows.next()? {
            let key: String = row.get(0)?;
            let reason: String = row.get(1)?;
            let retry_count: i32 = row.get(2)?;
            results.insert(key, (reason, retry_count));
        }

        Ok(results)
    }

    /// 清理过期的失败记录（例如超过7天的）
    pub fn cleanup_old_failures(&self, days: i64) -> SqliteResult<usize> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let cutoff_time = Local::now() - Duration::days(days);
        let cutoff = cutoff_time.format("%Y-%m-%d %H:%M:%S").to_string();

        let count = conn.execute(
            "DELETE FROM failed_thumbnails WHERE last_attempt < ?1",
            params![cutoff],
        )?;

        Ok(count)
    }

    // ==================== EMM JSON 缓存方法 ====================

    /// 保存 EMM JSON 缓存（单条记录）
    pub fn save_emm_json(&self, key: &str, emm_json: &str) -> SqliteResult<()> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        conn.execute(
            "UPDATE thumbs SET emm_json = ?2 WHERE key = ?1",
            params![key, emm_json],
        )?;

        Ok(())
    }

    /// 批量保存 EMM JSON 缓存
    pub fn batch_save_emm_json(&self, entries: &[(String, String)]) -> SqliteResult<usize> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut count = 0;
        for (key, emm_json) in entries {
            let affected = conn.execute(
                "UPDATE thumbs SET emm_json = ?2 WHERE key = ?1",
                params![key, emm_json],
            )?;
            count += affected;
        }

        Ok(count)
    }

    /// 获取 EMM JSON 缓存
    pub fn get_emm_json(&self, key: &str) -> SqliteResult<Option<String>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut stmt = conn.prepare("SELECT emm_json FROM thumbs WHERE key = ?1")?;
        let result: Option<Option<String>> = stmt
            .query_row(params![key], |row| row.get(0))
            .ok();

        Ok(result.flatten())
    }

    /// 批量获取 EMM JSON 缓存
    pub fn batch_get_emm_json(&self, keys: &[String]) -> SqliteResult<HashMap<String, String>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut results = HashMap::new();
        if keys.is_empty() {
            return Ok(results);
        }

        let placeholders: String = keys.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "SELECT key, emm_json FROM thumbs WHERE key IN ({}) AND emm_json IS NOT NULL",
            placeholders
        );

        let mut stmt = conn.prepare(&query)?;
        let params: Vec<&dyn rusqlite::ToSql> = keys.iter().map(|k| k as &dyn rusqlite::ToSql).collect();
        let mut rows = stmt.query(params.as_slice())?;

        while let Some(row) = rows.next()? {
            let key: String = row.get(0)?;
            let emm_json: String = row.get(1)?;
            results.insert(key, emm_json);
        }

        Ok(results)
    }

    /// 插入或更新缩略图记录（包含 emm_json）
    pub fn upsert_with_emm_json(
        &self,
        key: &str,
        category: &str,
        emm_json: Option<&str>,
    ) -> SqliteResult<()> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let date = Self::current_timestamp_string();

        conn.execute(
            "INSERT INTO thumbs (key, category, date, emm_json) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(key) DO UPDATE SET emm_json = ?4, date = ?3",
            params![key, category, date, emm_json],
        )?;

        Ok(())
    }

    /// 获取所有有缩略图的路径键列表（用于 EMM 同步）
    pub fn get_all_thumbnail_keys(&self) -> SqliteResult<Vec<String>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut stmt = conn.prepare("SELECT key FROM thumbs")?;
        let keys: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(keys)
    }

    /// 获取 emm_json 为空的缩略图键列表（用于增量更新）
    pub fn get_keys_without_emm_json(&self) -> SqliteResult<Vec<String>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut stmt = conn.prepare("SELECT key FROM thumbs WHERE emm_json IS NULL OR emm_json = ''")?;
        let keys: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(keys)
    }

    /// 获取指定目录下的所有缩略图键（用于增量 EMM 同步）
    pub fn get_thumbnail_keys_by_prefix(&self, prefix: &str) -> SqliteResult<Vec<String>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let pattern = format!("{}%", prefix);
        let mut stmt = conn.prepare("SELECT key FROM thumbs WHERE key LIKE ?1")?;
        let keys: Vec<String> = stmt
            .query_map(params![pattern], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(keys)
    }

    // ==================== Rating 快速读写方法 ====================

    /// 更新单个记录的 rating（同时更新独立字段和 emm_json）
    pub fn update_rating(&self, key: &str, rating: Option<f64>, manual_rating: Option<f64>) -> SqliteResult<()> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        conn.execute(
            "UPDATE thumbs SET rating = ?2, manual_rating = ?3 WHERE key = ?1",
            params![key, rating, manual_rating],
        )?;

        Ok(())
    }

    /// 更新文件夹平均评分
    pub fn update_folder_avg_rating(&self, key: &str, avg_rating: Option<f64>) -> SqliteResult<()> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        conn.execute(
            "UPDATE thumbs SET folder_avg_rating = ?2 WHERE key = ?1",
            params![key, avg_rating],
        )?;

        Ok(())
    }

    /// 批量更新 rating
    pub fn batch_update_ratings(&self, entries: &[(String, Option<f64>, Option<f64>)]) -> SqliteResult<usize> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut count = 0;
        for (key, rating, manual_rating) in entries {
            let affected = conn.execute(
                "UPDATE thumbs SET rating = ?2, manual_rating = ?3 WHERE key = ?1",
                params![key, rating, manual_rating],
            )?;
            count += affected;
        }

        Ok(count)
    }

    /// 批量更新文件夹平均评分
    pub fn batch_update_folder_ratings(&self, entries: &[(String, Option<f64>)]) -> SqliteResult<usize> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut count = 0;
        for (key, avg_rating) in entries {
            let affected = conn.execute(
                "UPDATE thumbs SET folder_avg_rating = ?2 WHERE key = ?1",
                params![key, avg_rating],
            )?;
            count += affected;
        }

        Ok(count)
    }

    /// 获取单个记录的 rating 信息
    pub fn get_rating(&self, key: &str) -> SqliteResult<(Option<f64>, Option<f64>, Option<f64>)> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut stmt = conn.prepare(
            "SELECT rating, manual_rating, folder_avg_rating FROM thumbs WHERE key = ?1"
        )?;

        let result = stmt.query_row(params![key], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        }).ok();

        Ok(result.unwrap_or((None, None, None)))
    }

    /// 批量获取 rating（用于排序）
    pub fn batch_get_ratings(&self, keys: &[String]) -> SqliteResult<HashMap<String, (Option<f64>, Option<f64>, Option<f64>)>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut results = HashMap::new();
        if keys.is_empty() {
            return Ok(results);
        }

        let placeholders: String = keys.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "SELECT key, rating, manual_rating, folder_avg_rating FROM thumbs WHERE key IN ({})",
            placeholders
        );

        let mut stmt = conn.prepare(&query)?;
        let params: Vec<&dyn rusqlite::ToSql> = keys.iter().map(|k| k as &dyn rusqlite::ToSql).collect();
        let mut rows = stmt.query(params.as_slice())?;

        while let Some(row) = rows.next()? {
            let key: String = row.get(0)?;
            let rating: Option<f64> = row.get(1)?;
            let manual_rating: Option<f64> = row.get(2)?;
            let folder_avg_rating: Option<f64> = row.get(3)?;
            results.insert(key, (rating, manual_rating, folder_avg_rating));
        }

        Ok(results)
    }

    /// 获取指定目录下所有文件的 rating（用于计算文件夹平均评分）
    pub fn get_ratings_by_prefix(&self, prefix: &str) -> SqliteResult<Vec<(String, Option<f64>, Option<f64>)>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let pattern = format!("{}%", prefix);
        let mut stmt = conn.prepare(
            "SELECT key, rating, manual_rating FROM thumbs WHERE key LIKE ?1 AND (rating IS NOT NULL OR manual_rating IS NOT NULL)"
        )?;

        let results: Vec<(String, Option<f64>, Option<f64>)> = stmt
            .query_map(params![pattern], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(results)
    }

    /// 同时保存 emm_json 和独立 rating 字段（用于同步时一次性写入）
    pub fn save_emm_with_rating(
        &self,
        key: &str,
        emm_json: &str,
        rating: Option<f64>,
        manual_rating: Option<f64>,
        folder_avg_rating: Option<f64>,
    ) -> SqliteResult<()> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        conn.execute(
            "UPDATE thumbs SET emm_json = ?2, rating = ?3, manual_rating = ?4, folder_avg_rating = ?5 WHERE key = ?1",
            params![key, emm_json, rating, manual_rating, folder_avg_rating],
        )?;

        Ok(())
    }

    /// 批量保存 emm_json 和 rating（优化版，一次性写入所有字段）
    pub fn batch_save_emm_with_rating(
        &self,
        entries: &[(String, String, Option<f64>, Option<f64>, Option<f64>)],
    ) -> SqliteResult<usize> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut count = 0;
        for (key, emm_json, rating, manual_rating, folder_avg_rating) in entries {
            let affected = conn.execute(
                "UPDATE thumbs SET emm_json = ?2, rating = ?3, manual_rating = ?4, folder_avg_rating = ?5 WHERE key = ?1",
                params![key, emm_json, rating, manual_rating, folder_avg_rating],
            )?;
            count += affected;
        }

        Ok(count)
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
