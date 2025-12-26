//! 标签操作

use super::ThumbnailDb;
use rusqlite::{params, Result as SqliteResult};
use serde_json::Value;
use std::collections::HashMap;

impl ThumbnailDb {
    /// 更新单个记录的 manual_tags
    pub fn update_manual_tags(&self, key: &str, manual_tags: Option<&str>) -> SqliteResult<()> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        conn.execute(
            "UPDATE thumbs SET manual_tags = ?2 WHERE key = ?1",
            params![key, manual_tags],
        )?;

        Ok(())
    }

    /// 获取单个记录的 manual_tags
    pub fn get_manual_tags(&self, key: &str) -> SqliteResult<Option<String>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut stmt = conn.prepare("SELECT manual_tags FROM thumbs WHERE key = ?1")?;
        let result: Option<String> = stmt.query_row(params![key], |row| row.get(0)).ok();

        Ok(result)
    }

    /// 批量获取 manual_tags
    pub fn batch_get_manual_tags(&self, keys: &[String]) -> SqliteResult<HashMap<String, Option<String>>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut results = HashMap::new();
        if keys.is_empty() {
            return Ok(results);
        }

        let placeholders: String = keys.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "SELECT key, manual_tags FROM thumbs WHERE key IN ({})",
            placeholders
        );

        let mut stmt = conn.prepare(&query)?;
        let params: Vec<&dyn rusqlite::ToSql> = keys.iter().map(|k| k as &dyn rusqlite::ToSql).collect();
        let mut rows = stmt.query(params.as_slice())?;

        while let Some(row) = rows.next()? {
            let key: String = row.get(0)?;
            let manual_tags: Option<String> = row.get(1)?;
            results.insert(key, manual_tags);
        }

        Ok(results)
    }

    /// 搜索符合标签条件的记录
    pub fn search_by_tags(
        &self,
        search_tags: Vec<(String, String, String)>,
        enable_mixed_gender: bool,
        base_path: Option<&str>,
    ) -> SqliteResult<Vec<String>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut sql = String::from(
            "SELECT key, emm_json FROM thumbs WHERE emm_json IS NOT NULL"
        );
        
        if let Some(path) = base_path {
            let normalized_path = path.to_lowercase().replace("/", "\\");
            sql.push_str(&format!(" AND LOWER(key) LIKE '{}%'", normalized_path.replace("'", "''")));
            println!("🔍 标签搜索: 基础路径过滤 = {}", normalized_path);
        }

        println!("🔍 标签搜索 SQL: {}", sql);
        let mut stmt = conn.prepare(&sql)?;
        let rows: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .filter_map(|r| r.ok())
            .collect();

        println!("🔍 标签搜索: 查询到 {} 条记录", rows.len());

        let gender_categories = ["female", "male", "mixed"];
        let mut results = Vec::new();

        for (key, emm_json) in rows {
            if let Ok(json) = serde_json::from_str::<Value>(&emm_json) {
                if let Some(tags_array) = json.get("tags").and_then(|t| t.as_array()) {
                    let mut book_tags: HashMap<String, Vec<String>> = HashMap::new();
                    for tag_obj in tags_array {
                        if let (Some(ns), Some(tag)) = (
                            tag_obj.get("namespace").and_then(|n| n.as_str()),
                            tag_obj.get("tag").and_then(|t| t.as_str()),
                        ) {
                            book_tags.entry(ns.to_string()).or_default().push(tag.to_string());
                        }
                    }

                    let mut all_match = true;
                    for (ns, tag, prefix) in &search_tags {
                        let is_exclude = prefix == "-";
                        let mut matched = false;

                        if let Some(ns_tags) = book_tags.get(ns) {
                            if ns_tags.contains(tag) {
                                matched = true;
                            }
                        }

                        if !matched && enable_mixed_gender && gender_categories.contains(&ns.as_str()) {
                            for alt_ns in &gender_categories {
                                if *alt_ns == ns.as_str() {
                                    continue;
                                }
                                if let Some(alt_tags) = book_tags.get(*alt_ns) {
                                    if alt_tags.contains(tag) {
                                        matched = true;
                                        break;
                                    }
                                }
                            }
                        }

                        if is_exclude {
                            if matched {
                                all_match = false;
                                break;
                            }
                        } else {
                            if !matched {
                                all_match = false;
                                break;
                            }
                        }
                    }

                    if all_match {
                        results.push(key);
                    }
                }
            }
        }

        println!("🔍 标签搜索完成: 找到 {} 个匹配", results.len());
        Ok(results)
    }

    /// 批量统计书籍匹配的收藏标签数量
    pub fn batch_count_matching_collect_tags(
        &self,
        keys: &[String],
        collect_tags: &[(String, String)],
        enable_mixed_gender: bool,
    ) -> SqliteResult<Vec<(String, usize)>> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let gender_categories = ["female", "male", "mixed"];
        let mut results = Vec::new();

        for key in keys {
            let emm_json: Option<String> = conn
                .query_row(
                    "SELECT emm_json FROM thumbs WHERE LOWER(key) = LOWER(?1)",
                    params![key],
                    |row| row.get(0),
                )
                .ok();

            let count = if let Some(json_str) = emm_json {
                Self::count_tags_in_json(&json_str, collect_tags, enable_mixed_gender, &gender_categories)
            } else {
                0
            };

            results.push((key.clone(), count));
        }

        Ok(results)
    }

    /// 从 JSON 中统计匹配的标签数
    fn count_tags_in_json(
        json_str: &str,
        collect_tags: &[(String, String)],
        enable_mixed_gender: bool,
        gender_categories: &[&str],
    ) -> usize {
        if let Ok(json) = serde_json::from_str::<Value>(json_str) {
            if let Some(tags_array) = json.get("tags").and_then(|t| t.as_array()) {
                let mut book_tags: HashMap<String, Vec<String>> = HashMap::new();
                for tag_obj in tags_array {
                    if let (Some(ns), Some(tag)) = (
                        tag_obj.get("namespace").and_then(|n| n.as_str()),
                        tag_obj.get("tag").and_then(|t| t.as_str()),
                    ) {
                        book_tags.entry(ns.to_string()).or_default().push(tag.to_string());
                    }
                }

                let mut count = 0;
                for (ns, tag) in collect_tags {
                    if let Some(ns_tags) = book_tags.get(ns) {
                        if ns_tags.contains(tag) {
                            count += 1;
                            continue;
                        }
                    }

                    if enable_mixed_gender && gender_categories.contains(&ns.as_str()) {
                        for alt_ns in gender_categories {
                            if *alt_ns == ns.as_str() {
                                continue;
                            }
                            if let Some(alt_tags) = book_tags.get(*alt_ns) {
                                if alt_tags.contains(tag) {
                                    count += 1;
                                    break;
                                }
                            }
                        }
                    }
                }

                return count;
            }
        }

        0
    }

    /// 统计书籍匹配的收藏标签数量
    pub fn count_matching_collect_tags(
        &self,
        key: &str,
        collect_tags: &[(String, String)],
        enable_mixed_gender: bool,
    ) -> SqliteResult<usize> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let emm_json: Option<String> = conn
            .query_row(
                "SELECT emm_json FROM thumbs WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .ok();

        let gender_categories = ["female", "male", "mixed"];

        if let Some(json_str) = emm_json {
            Ok(Self::count_tags_in_json(&json_str, collect_tags, enable_mixed_gender, &gender_categories))
        } else {
            Ok(0)
        }
    }

    /// 获取随机标签
    pub fn get_random_tags(&self, count: usize) -> SqliteResult<Vec<(String, String)>> {
        use rand::seq::SliceRandom;

        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().ok_or_else(|| {
            rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(1),
                Some("Database not open".to_string()),
            )
        })?;

        let mut stmt = conn.prepare(
            "SELECT emm_json FROM thumbs WHERE emm_json IS NOT NULL ORDER BY RANDOM() LIMIT 50"
        )?;

        let rows: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        let mut all_tags: Vec<(String, String)> = Vec::new();
        
        for emm_json in rows {
            if let Ok(json) = serde_json::from_str::<Value>(&emm_json) {
                if let Some(tags_array) = json.get("tags").and_then(|t| t.as_array()) {
                    for tag_obj in tags_array {
                        if let (Some(ns), Some(tag)) = (
                            tag_obj.get("namespace").and_then(|n| n.as_str()),
                            tag_obj.get("tag").and_then(|t| t.as_str()),
                        ) {
                            let pair = (ns.to_string(), tag.to_string());
                            if !all_tags.contains(&pair) {
                                all_tags.push(pair);
                            }
                        }
                    }
                }
            }
        }

        let mut rng = rand::thread_rng();
        all_tags.shuffle(&mut rng);
        all_tags.truncate(count);

        Ok(all_tags)
    }
}
