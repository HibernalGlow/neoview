//! 批量操作

use super::ThumbnailDb;
use rusqlite::{params, Result as SqliteResult, ToSql};
use std::collections::HashMap;

impl ThumbnailDb {
    /// 批量保存缩略图（使用事务）
    pub fn save_thumbnails_batch(
        &self,
        items: &[(String, i64, i32, Vec<u8>)],
    ) -> SqliteResult<usize> {
        if items.is_empty() {
            return Ok(0);
        }

        self.open()?;
        let mut conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_mut().unwrap();

        let date = Self::current_timestamp_string();
        let mut saved_count = 0;

        let tx = conn.transaction()?;
        
        {
            let mut stmt = tx.prepare_cached(
                "INSERT OR REPLACE INTO thumbs (key, size, date, ghash, category, value) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
            )?;

            for (key, size, ghash, blob) in items {
                let cat = if !key.contains("::") && !key.contains('.') {
                    "folder"
                } else {
                    "file"
                };

                if stmt.execute(params![key, size, date, ghash, cat, blob]).is_ok() {
                    saved_count += 1;
                }
            }
        }

        tx.commit()?;

        if cfg!(debug_assertions) && saved_count > 0 {
            println!("✅ 批量保存 {} 个缩略图到数据库", saved_count);
        }

        Ok(saved_count)
    }

    /// 批量加载缩略图
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

    /// 按类别批量加载缩略图（单条 SQL IN 查询）
    pub fn batch_load_thumbnails_by_keys_and_category(
        &self,
        keys: &[String],
        category: &str,
    ) -> SqliteResult<HashMap<String, Vec<u8>>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut results = HashMap::new();
        if keys.is_empty() {
            return Ok(results);
        }

        let placeholders = (0..keys.len()).map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "SELECT key, value FROM thumbs WHERE category = ?1 AND key IN ({}) AND value IS NOT NULL",
            placeholders
        );

        let mut stmt = conn.prepare(&query)?;
        let mut params_vec: Vec<&dyn ToSql> = Vec::with_capacity(keys.len() + 1);
        params_vec.push(&category);
        for key in keys {
            params_vec.push(key as &dyn ToSql);
        }

        let mut rows = stmt.query(params_vec.as_slice())?;
        while let Some(row) = rows.next()? {
            let key: String = row.get(0)?;
            let value: Vec<u8> = row.get(1)?;
            results.insert(key, value);
        }

        Ok(results)
    }

    /// 批量更新时间（单条 SQL IN 更新）
    pub fn batch_update_access_time(&self, keys: &[String]) -> SqliteResult<usize> {
        self.open()?;
        if keys.is_empty() {
            return Ok(0);
        }

        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();
        let date = Self::current_timestamp_string();

        let placeholders = (0..keys.len()).map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "UPDATE thumbs SET date = ?1 WHERE key IN ({})",
            placeholders
        );

        let mut params_vec: Vec<&dyn ToSql> = Vec::with_capacity(keys.len() + 1);
        params_vec.push(&date);
        for key in keys {
            params_vec.push(key as &dyn ToSql);
        }

        conn.execute(&query, params_vec.as_slice())
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
}
