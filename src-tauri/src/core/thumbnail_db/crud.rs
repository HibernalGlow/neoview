//! 基本 CRUD 操作

use super::ThumbnailDb;
use rusqlite::{params, Result as SqliteResult};

impl ThumbnailDb {
    /// 保存缩略图
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

        let cat = category.unwrap_or_else(|| {
            if !key.contains("::") && !key.contains(".") {
                "folder"
            } else {
                "file"
            }
        });

        let mut stmt = conn.prepare(
            "INSERT OR REPLACE INTO thumbs (key, size, date, ghash, category, value) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
        )?;

        let _rows_affected = stmt.execute(params![key, size, date, ghash, cat, thumbnail_data])?;

        drop(stmt);

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

    /// 加载缩略图
    pub fn load_thumbnail(
        &self,
        key: &str,
        size: i64,
        ghash: i32,
    ) -> SqliteResult<Option<Vec<u8>>> {
        self.load_thumbnail_with_category(key, size, ghash, None)
    }

    /// 加载缩略图（仅根据 key 和 category）
    pub fn load_thumbnail_by_key_and_category(
        &self,
        key: &str,
        category: &str,
    ) -> SqliteResult<Option<Vec<u8>>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut stmt =
            conn.prepare("SELECT value FROM thumbs WHERE key = ?1 AND category = ?2 AND value IS NOT NULL LIMIT 1")?;

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

    /// 加载缩略图和 emm_json
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

    /// 查找路径下最早的缩略图记录
    pub fn find_earliest_thumbnail_in_path(
        &self,
        folder_path: &str,
    ) -> SqliteResult<Option<(String, Vec<u8>)>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

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

        let result = if let Some(cat) = category {
            let mut stmt = conn.prepare(
                "SELECT value FROM thumbs WHERE key = ?1 AND size = ?2 AND ghash = ?3 AND category = ?4 AND value IS NOT NULL"
            )?;
            let mut rows = stmt.query_map(params![key, size, ghash, cat], |row| {
                Ok(row.get::<_, Vec<u8>>(0)?)
            })?;
            rows.next().transpose()
        } else {
            let mut stmt = conn
                .prepare("SELECT value FROM thumbs WHERE key = ?1 AND size = ?2 AND ghash = ?3 AND value IS NOT NULL")?;
            let mut rows = stmt.query_map(params![key, size, ghash], |row| {
                Ok(row.get::<_, Vec<u8>>(0)?)
            })?;
            rows.next().transpose()
        };

        match result {
            Ok(Some(data)) => {
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

    /// 检查缩略图是否存在（仅 key + category）
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

    /// 检查缩略图是否存在
    pub fn has_thumbnail(&self, key: &str, _size: i64, _ghash: i32) -> SqliteResult<bool> {
        let category = if !key.contains("::") && !key.contains(".") {
            "folder"
        } else {
            "file"
        };
        self.has_thumbnail_by_key_and_category(key, category)
    }

    /// 检查缩略图是否存在（带类别过滤）
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
}
