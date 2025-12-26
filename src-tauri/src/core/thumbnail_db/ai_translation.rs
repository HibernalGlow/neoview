//! AI 翻译操作

use super::ThumbnailDb;
use rusqlite::{params, Result as SqliteResult};
use std::collections::HashMap;

impl ThumbnailDb {
    /// 保存 AI 翻译到数据库
    pub fn save_ai_translation(&self, key: &str, ai_translation_json: &str) -> SqliteResult<()> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();
        
        let exists: bool = conn.query_row(
            "SELECT 1 FROM thumbs WHERE key = ?1 LIMIT 1",
            params![key],
            |_| Ok(true),
        ).unwrap_or(false);
        
        if exists {
            conn.execute(
                "UPDATE thumbs SET ai_translation = ?1 WHERE key = ?2",
                params![ai_translation_json, key],
            )?;
        } else {
            let date = Self::current_timestamp_string();
            let category = if !key.contains("::") && !key.contains(".") { "folder" } else { "file" };
            conn.execute(
                "INSERT INTO thumbs (key, date, category, ai_translation) VALUES (?1, ?2, ?3, ?4)",
                params![key, date, category, ai_translation_json],
            )?;
        }
        
        Ok(())
    }
    
    /// 读取 AI 翻译
    pub fn load_ai_translation(&self, key: &str, model_filter: Option<&str>) -> SqliteResult<Option<String>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();
        
        let mut stmt = conn.prepare("SELECT ai_translation FROM thumbs WHERE key = ?1 LIMIT 1")?;
        let result: Option<String> = stmt.query_row(params![key], |row| {
            row.get::<_, Option<String>>(0)
        }).ok().flatten();
        
        if let (Some(json_str), Some(filter)) = (&result, model_filter) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(json_str) {
                let stored_model = json.get("model").and_then(|m| m.as_str()).unwrap_or("");
                let stored_service = json.get("service").and_then(|s| s.as_str()).unwrap_or("");
                
                if stored_service == "ollama" && stored_model != filter {
                    return Ok(None);
                }
            }
        }
        
        Ok(result)
    }
    
    /// 获取 AI 翻译缓存数量
    pub fn get_ai_translation_count(&self) -> SqliteResult<usize> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();
        
        let count: usize = conn.query_row(
            "SELECT COUNT(*) FROM thumbs WHERE ai_translation IS NOT NULL",
            [],
            |row| row.get(0),
        )?;
        
        Ok(count)
    }
    
    /// 批量读取 AI 翻译
    pub fn batch_load_ai_translations(&self, keys: &[String], model_filter: Option<&str>) -> SqliteResult<HashMap<String, String>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();
        
        let mut results = HashMap::new();
        
        for key in keys {
            let mut stmt = conn.prepare("SELECT ai_translation FROM thumbs WHERE key = ?1 LIMIT 1")?;
            let result: Option<String> = stmt.query_row(params![key], |row| {
                row.get::<_, Option<String>>(0)
            }).ok().flatten();
            
            if let Some(json_str) = result {
                let should_include = if let Some(filter) = model_filter {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&json_str) {
                        let stored_model = json.get("model").and_then(|m| m.as_str()).unwrap_or("");
                        let stored_service = json.get("service").and_then(|s| s.as_str()).unwrap_or("");
                        stored_service == "libre" || stored_model == filter
                    } else {
                        false
                    }
                } else {
                    true
                };
                
                if should_include {
                    results.insert(key.clone(), json_str);
                }
            }
        }
        
        Ok(results)
    }
}
