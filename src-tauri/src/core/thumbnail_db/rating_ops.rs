//! 评分数据操作

use super::ThumbnailDb;
use rusqlite::{params, Result as SqliteResult};
use serde_json::Value;
use std::collections::HashMap;

impl ThumbnailDb {
    /// 更新单个记录的 rating_data
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

        let mut stmt = conn.prepare("SELECT rating_data, emm_json FROM thumbs WHERE key = ?1")?;
        let result: Option<(Option<String>, Option<String>)> = stmt
            .query_row(params![key], |row| Ok((row.get(0)?, row.get(1)?)))
            .ok();

        if let Some((rating_data, emm_json)) = result {
            if rating_data.is_some() {
                return Ok(rating_data);
            }
            if let Some(ref json_str) = emm_json {
                if let Ok(json) = serde_json::from_str::<Value>(json_str) {
                    if let Some(rating) = json.get("rating").and_then(|r| r.as_f64()) {
                        if rating > 0.0 {
                            let now = chrono::Local::now().timestamp_millis();
                            return Ok(Some(serde_json::json!({
                                "value": rating,
                                "source": "emm",
                                "timestamp": now
                            }).to_string()));
                        }
                    }
                }
            }
        }

        Ok(None)
    }

    /// 批量获取 rating_data
    pub fn batch_get_rating_data(&self, keys: &[String]) -> SqliteResult<HashMap<String, Option<String>>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut results = HashMap::new();
        if keys.is_empty() {
            return Ok(results);
        }

        println!("[ThumbnailDB] batch_get_rating_data: 查询 {} 个路径", keys.len());

        let placeholders: String = keys.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "SELECT key, rating_data, emm_json FROM thumbs WHERE key IN ({})",
            placeholders
        );

        let mut stmt = conn.prepare(&query)?;
        let params: Vec<&dyn rusqlite::ToSql> = keys.iter().map(|k| k as &dyn rusqlite::ToSql).collect();
        let mut rows = stmt.query(params.as_slice())?;

        let mut count_with_rating = 0;
        let now = chrono::Local::now().timestamp_millis();
        
        while let Some(row) = rows.next()? {
            let key: String = row.get(0)?;
            let rating_data: Option<String> = row.get(1)?;
            let emm_json: Option<String> = row.get(2)?;
            
            let effective_rating = if rating_data.is_some() {
                rating_data
            } else if let Some(ref json_str) = emm_json {
                if let Ok(json) = serde_json::from_str::<Value>(json_str) {
                    if let Some(rating) = json.get("rating").and_then(|r| r.as_f64()) {
                        if rating > 0.0 {
                            Some(serde_json::json!({
                                "value": rating,
                                "source": "emm",
                                "timestamp": now
                            }).to_string())
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            };
            
            if effective_rating.is_some() {
                count_with_rating += 1;
            }
            results.insert(key, effective_rating);
        }

        println!("[ThumbnailDB] 查询结果: 找到 {} 条记录, 其中 {} 条有评分", results.len(), count_with_rating);
        Ok(results)
    }

    /// 获取指定目录下所有条目的 rating_data
    pub fn get_rating_data_by_prefix(&self, prefix: &str) -> SqliteResult<Vec<(String, Option<String>)>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let pattern = format!("{}%", prefix);
        let mut stmt = conn.prepare(
            "SELECT key, rating_data, emm_json FROM thumbs WHERE key LIKE ?1 AND (rating_data IS NOT NULL OR emm_json IS NOT NULL)"
        )?;

        let now = chrono::Local::now().timestamp_millis();
        let mut results: Vec<(String, Option<String>)> = Vec::new();
        
        let rows = stmt.query_map(params![pattern], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, Option<String>>(2)?))
        })?;

        for row_result in rows {
            if let Ok((key, rating_data, emm_json)) = row_result {
                let effective_rating = if rating_data.is_some() {
                    rating_data
                } else if let Some(ref json_str) = emm_json {
                    if let Ok(json) = serde_json::from_str::<Value>(json_str) {
                        if let Some(rating) = json.get("rating").and_then(|r| r.as_f64()) {
                            if rating > 0.0 {
                                Some(serde_json::json!({
                                    "value": rating,
                                    "source": "emm",
                                    "timestamp": now
                                }).to_string())
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                } else {
                    None
                };
                
                if effective_rating.is_some() {
                    results.push((key, effective_rating));
                }
            }
        }

        Ok(results)
    }

    /// 同时保存 emm_json 和 rating_data
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
                "INSERT INTO thumbs (key, emm_json, rating_data, category) VALUES (?1, ?2, ?3, 'file')
                 ON CONFLICT(key) DO UPDATE SET emm_json = ?2, rating_data = ?3",
                params![key, emm_json, rating_data.as_deref()],
            )?;
            count += affected;
        }

        println!("[ThumbnailDB] batch_save_emm_with_rating_data: 保存 {} 条记录", count);
        Ok(count)
    }

    /// 计算文件夹的平均评分并保存
    pub fn calculate_folder_ratings(&self) -> SqliteResult<usize> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut stmt = conn.prepare(
            "SELECT key, rating_data FROM thumbs WHERE rating_data IS NOT NULL"
        )?;

        let rows: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .filter_map(|r| r.ok())
            .collect();

        let mut folder_ratings: HashMap<String, Vec<f64>> = HashMap::new();

        for (key, rating_json) in &rows {
            if let Ok(rating_data) = serde_json::from_str::<Value>(rating_json) {
                if let Some(value) = rating_data.get("value").and_then(|v| v.as_f64()) {
                    if value > 0.0 {
                        if let Some(parent) = Self::get_parent_path(key) {
                            folder_ratings.entry(parent).or_default().push(value);
                        }
                    }
                }
            }
        }

        let now = chrono::Local::now().timestamp_millis();
        let mut count = 0;

        for (folder_key, ratings) in folder_ratings {
            if ratings.is_empty() {
                continue;
            }

            let existing: Option<String> = conn
                .query_row(
                    "SELECT rating_data FROM thumbs WHERE key = ?1",
                    params![&folder_key],
                    |row| row.get(0),
                )
                .ok();

            let should_update = match existing {
                None => true,
                Some(ref json) => {
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
            return None;
        }
        Some(path[..last_sep].to_string())
    }
}
