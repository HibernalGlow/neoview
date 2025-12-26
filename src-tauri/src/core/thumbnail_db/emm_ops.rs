//! EMM JSON 操作

use super::ThumbnailDb;
use rusqlite::{params, Result as SqliteResult};
use std::collections::HashMap;

impl ThumbnailDb {
    /// 保存 EMM JSON 缓存
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

    /// 获取所有有缩略图的路径键列表
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

    /// 获取所有文件夹类别的缩略图键
    pub fn get_folder_keys(&self) -> SqliteResult<Vec<String>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut stmt = conn.prepare("SELECT key FROM thumbs WHERE category = 'folder'")?;
        let keys: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(keys)
    }

    /// 获取 emm_json 为空的缩略图键列表
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

    /// 获取指定目录下的所有缩略图键
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
}
