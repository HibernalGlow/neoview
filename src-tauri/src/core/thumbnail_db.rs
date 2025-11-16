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

    /// 打开数据库连接
    fn open(&self) -> SqliteResult<()> {
        println!("🔓 open() 被调用，数据库路径: {}", self.db_path.display());
        let mut conn_opt = self.connection.lock().unwrap();
        
        if conn_opt.is_some() {
            // 连接已存在，直接返回
            println!("✅ 数据库连接已存在，复用连接");
            return Ok(());
        }

        // 创建数据库目录（如果不存在）
        if let Some(parent) = self.db_path.parent() {
            println!("📁 创建数据库目录: {}", parent.display());
            if let Err(e) = std::fs::create_dir_all(parent) {
                eprintln!("❌ 创建数据库目录失败: {} - {}", parent.display(), e);
                return Err(rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
                    Some(format!("创建数据库目录失败: {}", e))
                ));
            }
            println!("✅ 数据库目录创建成功或已存在");
        }

        println!("🔌 打开数据库连接: {}", self.db_path.display());
        let conn = match Connection::open(&self.db_path) {
            Ok(c) => {
                println!("✅ 数据库连接打开成功");
                c
            }
            Err(e) => {
                eprintln!("❌ 数据库连接打开失败: {} - {}", self.db_path.display(), e);
                return Err(e);
            }
        };
        
        // 初始化数据库
        println!("🔧 初始化数据库表结构...");
        match Self::initialize_db(&conn) {
            Ok(_) => {
                println!("✅ 数据库表结构初始化成功");
            }
            Err(e) => {
                eprintln!("❌ 数据库表结构初始化失败: {}", e);
                return Err(e);
            }
        }
        
        *conn_opt = Some(conn);
        println!("✅ 数据库连接已保存到状态");
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

    /// 保存缩略图
    pub fn save_thumbnail(
        &self,
        key: &str,
        size: i64,
        ghash: i32,
        thumbnail_data: &[u8],
    ) -> SqliteResult<()> {
        println!("🔧 save_thumbnail 调用: key={}, size={}, ghash={}, data_len={}", 
                 key, size, ghash, thumbnail_data.len());
        println!("📂 数据库路径: {}", self.db_path.display());
        
        // 打开数据库连接
        println!("🔓 调用 open()...");
        match self.open() {
            Ok(_) => println!("✅ open() 成功"),
            Err(e) => {
                eprintln!("❌ open() 失败: {}", e);
                return Err(e);
            }
        }
        
        println!("🔒 获取数据库连接锁...");
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();
        println!("✅ 数据库连接锁获取成功");
        
        let date = Self::current_timestamp();
        println!("📅 当前时间戳: {}", date);

        println!("📝 准备执行 SQL 插入: key={}, size={}, date={}, ghash={}, data_len={}", 
                 key, size, date, ghash, thumbnail_data.len());

        // 使用 prepare + execute 避免 "Execute returned results" 错误
        println!("🔧 准备 SQL 语句...");
        let mut stmt = match conn.prepare(
            "INSERT OR REPLACE INTO thumbs (key, size, date, ghash, value) VALUES (?1, ?2, ?3, ?4, ?5)"
        ) {
            Ok(s) => {
                println!("✅ SQL 语句准备成功");
                s
            }
            Err(e) => {
                eprintln!("❌ SQL 语句准备失败: {}", e);
                return Err(e);
            }
        };
        
        // execute 返回受影响的行数
        println!("⚡ 执行 SQL 插入...");
        let _rows_affected = match stmt.execute(params![key, size, date, ghash, thumbnail_data]) {
            Ok(r) => {
                println!("✅ SQL 执行成功，受影响行数: {}", r);
                r
            }
            Err(e) => {
                eprintln!("❌ SQL 执行失败: {}", e);
                return Err(e);
            }
        };
        
        // 立即提交事务（确保数据写入磁盘）
        println!("💾 提交事务...");
        drop(stmt); // 释放语句，确保数据已写入
        
        // 验证数据是否真的保存了
        println!("🔍 验证数据是否保存...");
        let mut verify_stmt = match conn.prepare("SELECT COUNT(*) FROM thumbs WHERE key = ?1") {
            Ok(s) => s,
            Err(e) => {
                eprintln!("❌ 验证查询准备失败: {}", e);
                return Err(e);
            }
        };
        
        let count: i64 = match verify_stmt.query_row([key], |row| row.get(0)) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("❌ 验证查询执行失败: {}", e);
                return Err(e);
            }
        };
        println!("✅ 验证: 数据库中 key={} 的记录数: {}", key, count);
        
        if count > 0 {
            // 验证 blob 数据大小
            let mut size_stmt = match conn.prepare("SELECT LENGTH(value) FROM thumbs WHERE key = ?1") {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("⚠️ 获取 blob 大小查询准备失败: {}", e);
                    return Ok(()); // 即使验证失败，也返回成功（因为插入已经成功）
                }
            };
            
            match size_stmt.query_row([key], |row| row.get::<_, i64>(0)) {
                Ok(blob_size) => {
                    println!("✅ 验证: 数据库中 blob 数据大小: {} bytes (原始: {} bytes)", blob_size, thumbnail_data.len());
                    if blob_size != thumbnail_data.len() as i64 {
                        eprintln!("⚠️ 警告: blob 数据大小不匹配! 数据库: {} bytes, 原始: {} bytes", blob_size, thumbnail_data.len());
                    }
                }
                Err(e) => {
                    eprintln!("⚠️ 获取 blob 大小失败: {}", e);
                }
            }
        } else {
            eprintln!("❌ 严重错误: 数据插入后验证失败，记录数为 0!");
        }

        println!("✅ save_thumbnail 完成");
        Ok(())
    }

    /// 加载缩略图
    pub fn load_thumbnail(
        &self,
        key: &str,
        size: i64,
        ghash: i32,
    ) -> SqliteResult<Option<Vec<u8>>> {
        println!("🔍 load_thumbnail 调用: key={}, size={}, ghash={}", key, size, ghash);
        
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
            println!("✅ 从数据库加载缩略图成功: key={}, data_len={}", key, data.len());
            Ok(Some(data))
        } else {
            println!("📭 数据库中没有找到缩略图: key={}, size={}, ghash={}", key, size, ghash);
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

