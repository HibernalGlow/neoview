//! 数据库维护操作

use super::ThumbnailDb;
use chrono::{Duration, Local};
use rusqlite::{params, Result as SqliteResult};

impl ThumbnailDb {
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

    /// 删除失败记录
    pub fn remove_failed_thumbnail(&self, key: &str) -> SqliteResult<()> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        conn.execute("DELETE FROM failed_thumbnails WHERE key = ?1", params![key])?;
        Ok(())
    }

    /// 清理过期的失败记录
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

    /// 规范化所有路径键
    pub fn normalize_all_keys(&self) -> SqliteResult<(usize, usize)> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut stmt = conn.prepare("SELECT key FROM thumbs")?;
        let keys: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        let total = keys.len();
        let mut fixed = 0;

        for old_key in keys {
            let mut new_key = old_key.replace("/", "\\");
            if new_key.len() >= 2 && new_key.chars().nth(1) == Some(':') {
                if new_key.len() == 2 || new_key.chars().nth(2) != Some('\\') {
                    new_key = format!("{}\\{}", &new_key[0..2], &new_key[2..]);
                }
            }

            if new_key != old_key {
                let exists: bool = conn
                    .query_row(
                        "SELECT 1 FROM thumbs WHERE key = ?1",
                        params![&new_key],
                        |_| Ok(true),
                    )
                    .unwrap_or(false);

                if exists {
                    conn.execute("DELETE FROM thumbs WHERE key = ?1", params![&old_key])?;
                } else {
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

    /// 清理无效条目
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

    /// 清理不存在路径的缩略图记录
    pub fn cleanup_invalid_paths(&self) -> SqliteResult<usize> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();
        
        let mut stmt = conn.prepare("SELECT key FROM thumbs")?;
        let keys: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        
        let mut invalid_keys = Vec::new();
        for key in keys {
            let actual_path = if key.contains("::") {
                key.split("::").next().unwrap_or(&key)
            } else {
                &key
            };
            
            if !std::path::Path::new(actual_path).exists() {
                invalid_keys.push(key);
            }
        }
        
        let count = invalid_keys.len();
        for key in &invalid_keys {
            conn.execute("DELETE FROM thumbs WHERE key = ?1", params![key])?;
            let _ = conn.execute("DELETE FROM failed_thumbnails WHERE key = ?1", params![key]);
        }
        
        Ok(count)
    }

    /// 清理过期条目
    pub fn cleanup_expired_entries(&self, days: i64, exclude_folders: bool) -> SqliteResult<usize> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();
        
        let cutoff_date = chrono::Utc::now() - chrono::Duration::days(days);
        let cutoff_str = cutoff_date.format("%Y-%m-%d %H:%M:%S").to_string();
        
        let count = if exclude_folders {
            conn.execute(
                "DELETE FROM thumbs WHERE date < ?1 AND category != 'folder'",
                params![cutoff_str],
            )?
        } else {
            conn.execute(
                "DELETE FROM thumbs WHERE date < ?1",
                params![cutoff_str],
            )?
        };
        
        Ok(count)
    }

    /// 清理指定路径前缀下的所有缩略图
    pub fn cleanup_by_path_prefix(&self, path_prefix: &str) -> SqliteResult<usize> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();
        
        let pattern = format!("{}%", path_prefix);
        let count = conn.execute(
            "DELETE FROM thumbs WHERE key LIKE ?1",
            params![pattern],
        )?;
        
        let _ = conn.execute(
            "DELETE FROM failed_thumbnails WHERE key LIKE ?1",
            params![pattern],
        );
        
        Ok(count)
    }

    /// 清空单个缩略图的 blob 数据
    pub fn delete_thumbnail(&self, key: &str) -> SqliteResult<()> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();
        
        let rows_updated = conn.execute("UPDATE thumbs SET value = NULL WHERE key = ?1", params![key])?;
        eprintln!("[DEBUG] 🗑️ 清空缩略图 blob: key={}, 更新行数={}", key, rows_updated);
        
        let failed_deleted = conn.execute("DELETE FROM failed_thumbnails WHERE key = ?1", params![key]).unwrap_or(0);
        if failed_deleted > 0 {
            eprintln!("[DEBUG] 🗑️ 删除失败记录: key={}, 删除行数={}", key, failed_deleted);
        }
        
        Ok(())
    }

    /// 获取数据库详细统计信息
    pub fn get_detailed_stats(&self) -> SqliteResult<(usize, usize, i64)> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();
        
        let total: usize = conn.query_row(
            "SELECT COUNT(*) FROM thumbs",
            [],
            |row| row.get(0),
        )?;
        
        let folders: usize = conn.query_row(
            "SELECT COUNT(*) FROM thumbs WHERE category = 'folder'",
            [],
            |row| row.get(0),
        )?;
        
        let db_size = std::fs::metadata(&self.db_path)
            .map(|m| m.len() as i64)
            .unwrap_or(0);
        
        Ok((total, folders, db_size))
    }

    /// 获取所有失败记录的键列表
    pub fn get_all_failed_keys(&self) -> SqliteResult<Vec<String>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut stmt = conn.prepare("SELECT key FROM failed_thumbnails")?;
        let keys: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(keys)
    }

    /// 清除所有失败记录
    pub fn clear_all_failed_thumbnails(&self) -> SqliteResult<usize> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let count = conn.execute("DELETE FROM failed_thumbnails", [])?;
        Ok(count)
    }

    /// 获取失败记录数量
    pub fn get_failed_count(&self) -> SqliteResult<usize> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let count: usize = conn.query_row(
            "SELECT COUNT(*) FROM failed_thumbnails",
            [],
            |row| row.get(0),
        )?;
        Ok(count)
    }
}
