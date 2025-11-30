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
        // rating_data: JSON 格式存储评分信息 { value: number, source: 'emm'|'manual'|'calculated', timestamp: number }
        conn.execute(
            "CREATE TABLE IF NOT EXISTS thumbs (
                key TEXT NOT NULL PRIMARY KEY,
                size INTEGER,
                date TEXT,
                ghash INTEGER,
                category TEXT DEFAULT 'file',
                value BLOB,
                emm_json TEXT,
                rating_data TEXT
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

    /// 数据库版本常量
    const DB_VERSION: &'static str = "2.2";

    /// 获取当前数据库版本
    fn get_db_version(conn: &Connection) -> Option<String> {
        // 创建 metadata 表（如果不存在）
        conn.execute(
            "CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT)",
            [],
        ).ok()?;

        let mut stmt = conn.prepare("SELECT value FROM metadata WHERE key = 'version'").ok()?;
        stmt.query_row([], |row| row.get(0)).ok()
    }

    /// 设置数据库版本
    fn set_db_version(conn: &Connection, version: &str) -> SqliteResult<()> {
        conn.execute(
            "INSERT OR REPLACE INTO metadata (key, value) VALUES ('version', ?1)",
            params![version],
        )?;
        Ok(())
    }

    /// 手动迁移：检查并添加必需的列（由用户在设置中手动触发）
    /// 当前目标版本：2.2
    pub fn migrate_add_emm_columns(&self) -> SqliteResult<String> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut messages = Vec::new();

        // 获取当前版本
        let current_version = Self::get_db_version(conn).unwrap_or_else(|| "1.0".to_string());
        let target_version = Self::DB_VERSION;

        println!("📦 检查数据库结构: 当前版本 v{}, 目标版本 v{}", current_version, target_version);

        // 始终检查 emm_json 列是否存在
        let has_emm_json: bool = conn.prepare("SELECT emm_json FROM thumbs LIMIT 1").is_ok();
        if !has_emm_json {
            conn.execute("ALTER TABLE thumbs ADD COLUMN emm_json TEXT", [])?;
            messages.push("添加 emm_json 列");
            println!("✅ 添加 emm_json 列");
        }

        // 始终检查 rating_data 列是否存在
        let has_rating_data: bool = conn.prepare("SELECT rating_data FROM thumbs LIMIT 1").is_ok();
        if !has_rating_data {
            conn.execute("ALTER TABLE thumbs ADD COLUMN rating_data TEXT", [])?;
            messages.push("添加 rating_data 列");
            println!("✅ 添加 rating_data 列");
        }

        // 从 emm_json 中提取 rating 并填充到 rating_data（每次迁移都执行）
        let migrated = Self::migrate_rating_from_emm_json(conn)?;
        if migrated > 0 {
            messages.push("从 emm_json 迁移评分数据");
        }

        // 更新版本号
        Self::set_db_version(conn, target_version)?;

        // 获取列信息
        let columns = Self::get_table_columns(conn, "thumbs")?;
        let has_emm = columns.contains(&"emm_json".to_string());
        let has_rating = columns.contains(&"rating_data".to_string());

        if messages.is_empty() {
            Ok(format!(
                "数据库已是最新版本 (v{})\n列状态: emm_json={}, rating_data={}",
                target_version, has_emm, has_rating
            ))
        } else {
            Ok(format!(
                "迁移完成 (v{}): {}\n列状态: emm_json={}, rating_data={}",
                target_version,
                messages.join(", "),
                has_emm,
                has_rating
            ))
        }
    }

    /// 获取表的列名列表
    fn get_table_columns(conn: &Connection, table_name: &str) -> SqliteResult<Vec<String>> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table_name))?;
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(columns)
    }

    /// 从 emm_json 字段中提取 rating 并保存到 rating_data
    fn migrate_rating_from_emm_json(conn: &Connection) -> SqliteResult<usize> {
        use serde_json::Value;

        let mut stmt = conn.prepare(
            "SELECT key, emm_json FROM thumbs WHERE emm_json IS NOT NULL AND rating_data IS NULL"
        )?;

        let rows: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .filter_map(|r| r.ok())
            .collect();

        let mut count = 0;
        let now = chrono::Local::now().timestamp_millis();

        for (key, emm_json) in rows {
            if let Ok(json) = serde_json::from_str::<Value>(&emm_json) {
                if let Some(rating) = json.get("rating").and_then(|r| r.as_f64()) {
                    if rating > 0.0 {
                        let rating_data = serde_json::json!({
                            "value": rating,
                            "source": "emm",
                            "timestamp": now
                        });
                        conn.execute(
                            "UPDATE thumbs SET rating_data = ?1 WHERE key = ?2",
                            params![rating_data.to_string(), key],
                        )?;
                        count += 1;
                    }
                }
            }
        }

        println!("📊 从 emm_json 迁移了 {} 条评分数据", count);
        Ok(count)
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

    /// 加载缩略图和 emm_json（一次查询同时返回两者）
    pub fn load_thumbnail_with_emm_json(
        &self,
        key: &str,
        category: &str,
    ) -> SqliteResult<Option<(Vec<u8>, Option<String>)>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut stmt = conn.prepare(
            "SELECT value, emm_json FROM thumbs WHERE key = ?1 AND category = ?2 LIMIT 1"
        )?;

        let result: Option<(Vec<u8>, Option<String>)> = stmt
            .query_row(params![key, category], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .ok();

        Ok(result)
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

    // ==================== Rating 读写方法（使用 rating_data JSON）====================

    /// 更新单个记录的 rating_data（JSON 格式）
    /// rating_data 格式: { value: number, source: 'emm'|'manual'|'calculated', timestamp: number }
    pub fn update_rating_data(&self, key: &str, rating_data: Option<&str>) -> SqliteResult<()> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        conn.execute(
            "UPDATE thumbs SET rating_data = ?2 WHERE key = ?1",
            params![key, rating_data],
        )?;

        Ok(())
    }

    /// 获取单个记录的 rating_data
    pub fn get_rating_data(&self, key: &str) -> SqliteResult<Option<String>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut stmt = conn.prepare("SELECT rating_data FROM thumbs WHERE key = ?1")?;
        let result: Option<String> = stmt.query_row(params![key], |row| row.get(0)).ok();

        Ok(result)
    }

    /// 批量获取 rating_data（用于排序）
    pub fn batch_get_rating_data(&self, keys: &[String]) -> SqliteResult<HashMap<String, Option<String>>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut results = HashMap::new();
        if keys.is_empty() {
            return Ok(results);
        }

        let placeholders: String = keys.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "SELECT key, rating_data FROM thumbs WHERE key IN ({})",
            placeholders
        );

        let mut stmt = conn.prepare(&query)?;
        let params: Vec<&dyn rusqlite::ToSql> = keys.iter().map(|k| k as &dyn rusqlite::ToSql).collect();
        let mut rows = stmt.query(params.as_slice())?;

        while let Some(row) = rows.next()? {
            let key: String = row.get(0)?;
            let rating_data: Option<String> = row.get(1)?;
            results.insert(key, rating_data);
        }

        Ok(results)
    }

    /// 获取指定目录下所有条目的 rating_data（用于计算文件夹平均评分）
    pub fn get_rating_data_by_prefix(&self, prefix: &str) -> SqliteResult<Vec<(String, Option<String>)>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let pattern = format!("{}%", prefix);
        let mut stmt = conn.prepare(
            "SELECT key, rating_data FROM thumbs WHERE key LIKE ?1 AND rating_data IS NOT NULL"
        )?;

        let results: Vec<(String, Option<String>)> = stmt
            .query_map(params![pattern], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(results)
    }

    /// 同时保存 emm_json 和 rating_data（用于同步时一次性写入）
    pub fn save_emm_with_rating_data(
        &self,
        key: &str,
        emm_json: &str,
        rating_data: Option<&str>,
    ) -> SqliteResult<()> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        conn.execute(
            "UPDATE thumbs SET emm_json = ?2, rating_data = ?3 WHERE key = ?1",
            params![key, emm_json, rating_data],
        )?;

        Ok(())
    }

    /// 批量保存 emm_json 和 rating_data
    pub fn batch_save_emm_with_rating_data(
        &self,
        entries: &[(String, String, Option<String>)],
    ) -> SqliteResult<usize> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut count = 0;
        for (key, emm_json, rating_data) in entries {
            let affected = conn.execute(
                "UPDATE thumbs SET emm_json = ?2, rating_data = ?3 WHERE key = ?1",
                params![key, emm_json, rating_data.as_deref()],
            )?;
            count += affected;
        }

        Ok(count)
    }

    // ==================== 数据库维护方法 ====================

    /// 规范化所有路径键（统一格式）
    /// 返回：(处理条目数, 修复条目数)
    pub fn normalize_all_keys(&self) -> SqliteResult<(usize, usize)> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        // 获取所有 key
        let mut stmt = conn.prepare("SELECT key FROM thumbs")?;
        let keys: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        let total = keys.len();
        let mut fixed = 0;

        for old_key in keys {
            // 规范化：统一反斜杠，确保盘符后有斜杠
            let mut new_key = old_key.replace("/", "\\");
            // 处理 D:folder -> D:\folder
            if new_key.len() >= 2 && new_key.chars().nth(1) == Some(':') {
                if new_key.len() == 2 || new_key.chars().nth(2) != Some('\\') {
                    new_key = format!("{}\\{}", &new_key[0..2], &new_key[2..]);
                }
            }

            if new_key != old_key {
                // 检查新 key 是否已存在
                let exists: bool = conn
                    .query_row(
                        "SELECT 1 FROM thumbs WHERE key = ?1",
                        params![&new_key],
                        |_| Ok(true),
                    )
                    .unwrap_or(false);

                if exists {
                    // 新 key 已存在，删除旧的
                    conn.execute("DELETE FROM thumbs WHERE key = ?1", params![&old_key])?;
                } else {
                    // 更新为新 key
                    conn.execute(
                        "UPDATE thumbs SET key = ?1 WHERE key = ?2",
                        params![&new_key, &old_key],
                    )?;
                }
                fixed += 1;
            }
        }

        Ok((total, fixed))
    }

    /// 清理无效条目（没有缩略图数据的条目）
    pub fn cleanup_invalid_entries(&self) -> SqliteResult<usize> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let deleted = conn.execute(
            "DELETE FROM thumbs WHERE value IS NULL OR length(value) = 0",
            [],
        )?;

        Ok(deleted)
    }

    /// 获取数据库统计信息
    pub fn get_maintenance_stats(&self) -> SqliteResult<(usize, usize, usize)> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let total: usize = conn.query_row("SELECT COUNT(*) FROM thumbs", [], |row| row.get(0))?;
        let with_emm: usize = conn.query_row(
            "SELECT COUNT(*) FROM thumbs WHERE emm_json IS NOT NULL AND emm_json != ''",
            [],
            |row| row.get(0),
        )?;
        let invalid: usize = conn.query_row(
            "SELECT COUNT(*) FROM thumbs WHERE value IS NULL OR length(value) = 0",
            [],
            |row| row.get(0),
        )?;

        Ok((total, with_emm, invalid))
    }

    /// 计算文件夹的平均评分并保存到 rating_data
    /// 不会覆盖手动评分（source: 'manual'）
    pub fn calculate_folder_ratings(&self) -> SqliteResult<usize> {
        use serde_json::Value;
        use std::collections::HashMap;

        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        // 1. 获取所有有 rating_data 的文件条目
        let mut stmt = conn.prepare(
            "SELECT key, rating_data FROM thumbs WHERE rating_data IS NOT NULL"
        )?;

        let rows: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .filter_map(|r| r.ok())
            .collect();

        // 2. 按父目录分组计算平均评分
        let mut folder_ratings: HashMap<String, Vec<f64>> = HashMap::new();

        for (key, rating_json) in &rows {
            if let Ok(rating_data) = serde_json::from_str::<Value>(rating_json) {
                if let Some(value) = rating_data.get("value").and_then(|v| v.as_f64()) {
                    if value > 0.0 {
                        // 获取父目录
                        if let Some(parent) = Self::get_parent_path(key) {
                            folder_ratings.entry(parent).or_default().push(value);
                        }
                    }
                }
            }
        }

        // 3. 计算每个文件夹的平均评分并保存
        let now = chrono::Local::now().timestamp_millis();
        let mut count = 0;

        for (folder_key, ratings) in folder_ratings {
            if ratings.is_empty() {
                continue;
            }

            // 检查该文件夹是否已有手动评分
            let existing: Option<String> = conn
                .query_row(
                    "SELECT rating_data FROM thumbs WHERE key = ?1",
                    params![&folder_key],
                    |row| row.get(0),
                )
                .ok();

            let should_update = match existing {
                None => true, // 不存在，可以创建
                Some(ref json) => {
                    // 检查是否是手动评分
                    if let Ok(data) = serde_json::from_str::<Value>(json) {
                        data.get("source").and_then(|s| s.as_str()) != Some("manual")
                    } else {
                        true
                    }
                }
            };

            if should_update {
                let avg = ratings.iter().sum::<f64>() / ratings.len() as f64;
                let rating_data = serde_json::json!({
                    "value": avg,
                    "source": "calculated",
                    "timestamp": now,
                    "childCount": ratings.len()
                });

                // 使用 UPSERT 更新或创建
                conn.execute(
                    "INSERT INTO thumbs (key, rating_data, category) VALUES (?1, ?2, 'folder')
                     ON CONFLICT(key) DO UPDATE SET rating_data = ?2",
                    params![&folder_key, rating_data.to_string()],
                )?;
                count += 1;
            }
        }

        println!("📊 计算并保存了 {} 个文件夹的平均评分", count);
        Ok(count)
    }

    /// 获取父目录路径
    fn get_parent_path(path: &str) -> Option<String> {
        let last_sep = path.rfind('\\')?;
        if last_sep <= 2 {
            return None; // 根目录
        }
        Some(path[..last_sep].to_string())
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
