use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::Utc;
use rusqlite::{params, Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};

use crate::core::fs_manager::FsItem;

#[derive(Clone)]
pub struct CacheIndexDb {
    connection: Arc<Mutex<Option<Connection>>>,
    db_path: PathBuf,
    directory_ttl: Duration,
    thumbnail_ttl: Duration,
}

#[derive(Debug, Serialize, Deserialize)]
struct CachedDirectory {
    items: Vec<FsItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailCacheEntry {
    pub path_key: String,
    pub category: String,
    pub hash: Option<String>,
    pub size: Option<i64>,
    pub source: Option<String>,
    pub blob_key: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheTableStats {
    pub table: String,
    pub total_entries: usize,
    pub last_updated: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheIndexStats {
    pub directory: CacheTableStats,
    pub thumbnail: CacheTableStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheGcResult {
    pub directory_removed: usize,
    pub thumbnail_removed: usize,
}

pub struct ThumbnailCacheUpsert<'a> {
    pub path_key: &'a str,
    pub category: &'a str,
    pub hash: Option<&'a str>,
    pub size: Option<i64>,
    pub source: Option<&'a str>,
    pub blob_key: Option<&'a str>,
}

impl CacheIndexDb {
    pub fn new(db_path: PathBuf, directory_ttl: Duration, thumbnail_ttl: Duration) -> Self {
        Self {
            connection: Arc::new(Mutex::new(None)),
            db_path,
            directory_ttl,
            thumbnail_ttl,
        }
    }

    fn open(&self) -> SqliteResult<()> {
        let mut conn_guard = self.connection.lock().unwrap();
        if conn_guard.is_some() {
            return Ok(());
        }

        if let Some(parent) = self.db_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }

        let conn = Connection::open(&self.db_path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             CREATE TABLE IF NOT EXISTS directory_cache (
                path TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                mtime INTEGER,
                updated_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS thumbnail_cache (
                path_key TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                hash TEXT,
                size INTEGER,
                source TEXT,
                blob_key TEXT,
                updated_at INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_directory_cache_updated_at ON directory_cache(updated_at);
             CREATE INDEX IF NOT EXISTS idx_thumbnail_cache_category ON thumbnail_cache(category);
             CREATE INDEX IF NOT EXISTS idx_thumbnail_cache_updated ON thumbnail_cache(updated_at);",
        )?;

        *conn_guard = Some(conn);
        Ok(())
    }

    fn with_connection<T, F: FnOnce(&Connection) -> SqliteResult<T>>(
        &self,
        f: F,
    ) -> Result<T, String> {
        self.open()
            .map_err(|e| format!("打开缓存数据库失败: {}", e))?;
        let guard = self.connection.lock().unwrap();
        let conn = guard.as_ref().unwrap();
        f(conn).map_err(|e| format!("缓存数据库操作失败: {}", e))
    }

    pub fn load_directory_snapshot(
        &self,
        path: &str,
        mtime: Option<u64>,
    ) -> Result<Option<Vec<FsItem>>, String> {
        let ttl_secs = self.directory_ttl.as_secs() as i64;
        self.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT payload, mtime, updated_at FROM directory_cache WHERE path = ?1 LIMIT 1",
            )?;
            let mut rows = stmt.query(params![path])?;
            if let Ok(Some(row)) = rows.next() {
                let payload: String = row.get(0)?;
                let stored_mtime: Option<u64> = row.get(1)?;
                let updated_at: i64 = row.get(2)?;

                if mtime.is_some() && stored_mtime != mtime {
                    conn.execute("DELETE FROM directory_cache WHERE path = ?1", params![path])?;
                    return Ok(None);
                }

                let now = Utc::now().timestamp();
                if ttl_secs > 0 && now - updated_at > ttl_secs {
                    conn.execute("DELETE FROM directory_cache WHERE path = ?1", params![path])?;
                    return Ok(None);
                }

                let cached: CachedDirectory = serde_json::from_str(&payload).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        payload.len(),
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })?;

                Ok(Some(cached.items))
            } else {
                Ok(None)
            }
        })
    }

    pub fn save_directory_snapshot(
        &self,
        path: &str,
        mtime: Option<u64>,
        items: &[FsItem],
    ) -> Result<(), String> {
        let payload = serde_json::to_string(&CachedDirectory {
            items: items.to_vec(),
        })
        .map_err(|e| format!("序列化目录缓存失败: {}", e))?;

        let updated_at = Utc::now().timestamp();
        self.with_connection(|conn| {
            conn.execute(
                "INSERT OR REPLACE INTO directory_cache (path, payload, mtime, updated_at) VALUES (?1, ?2, ?3, ?4)",
                params![path, payload, mtime, updated_at],
            )?;
            Ok(())
        })
    }

    pub fn cleanup_directory_cache(&self) -> Result<usize, String> {
        let ttl_secs = self.directory_ttl.as_secs() as i64;
        self.with_connection(|conn| {
            let now = Utc::now().timestamp();
            let deleted = conn.execute(
                "DELETE FROM directory_cache WHERE (?1 > 0 AND (?2 - updated_at) > ?1)",
                params![ttl_secs, now],
            )?;
            Ok(deleted)
        })
    }

    pub fn directory_stats(&self) -> Result<CacheTableStats, String> {
        self.with_connection(|conn| {
            let count: usize =
                conn.query_row("SELECT COUNT(*) FROM directory_cache", [], |row| row.get(0))?;
            let last_updated: Option<i64> = conn
                .query_row("SELECT MAX(updated_at) FROM directory_cache", [], |row| {
                    row.get(0)
                })
                .unwrap_or(None);
            Ok(CacheTableStats {
                table: "directory_cache".to_string(),
                total_entries: count,
                last_updated,
            })
        })
    }

    pub fn upsert_thumbnail_entry(&self, input: ThumbnailCacheUpsert<'_>) -> Result<(), String> {
        let updated_at = Utc::now().timestamp();
        self.with_connection(|conn| {
            conn.execute(
                "INSERT OR REPLACE INTO thumbnail_cache (path_key, category, hash, size, source, blob_key, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    input.path_key,
                    input.category,
                    input.hash,
                    input.size,
                    input.source,
                    input.blob_key,
                    updated_at
                ],
            )?;
            Ok(())
        })
    }

    pub fn lookup_thumbnail_entries(
        &self,
        keys: &[(String, String)],
    ) -> Result<Vec<ThumbnailCacheEntry>, String> {
        if keys.is_empty() {
            return Ok(Vec::new());
        }

        self.with_connection(|conn| {
            let mut results = Vec::with_capacity(keys.len());
            for (path_key, category) in keys {
                let mut stmt = conn.prepare(
                    "SELECT path_key, category, hash, size, source, blob_key, updated_at
                     FROM thumbnail_cache WHERE path_key = ?1 AND category = ?2 LIMIT 1",
                )?;
                let mut rows = stmt.query(params![path_key, category])?;
                if let Ok(Some(row)) = rows.next() {
                    results.push(ThumbnailCacheEntry {
                        path_key: row.get(0)?,
                        category: row.get(1)?,
                        hash: row.get(2)?,
                        size: row.get(3)?,
                        source: row.get(4)?,
                        blob_key: row.get(5)?,
                        updated_at: row.get(6)?,
                    });
                }
            }
            Ok(results)
        })
    }

    pub fn cleanup_thumbnail_cache(&self) -> Result<usize, String> {
        let ttl_secs = self.thumbnail_ttl.as_secs() as i64;
        self.with_connection(|conn| {
            let now = Utc::now().timestamp();
            let deleted = conn.execute(
                "DELETE FROM thumbnail_cache WHERE (?1 > 0 AND (?2 - updated_at) > ?1)",
                params![ttl_secs, now],
            )?;
            Ok(deleted)
        })
    }

    pub fn thumbnail_stats(&self) -> Result<CacheTableStats, String> {
        self.with_connection(|conn| {
            let count: usize =
                conn.query_row("SELECT COUNT(*) FROM thumbnail_cache", [], |row| row.get(0))?;
            let last_updated: Option<i64> = conn
                .query_row("SELECT MAX(updated_at) FROM thumbnail_cache", [], |row| {
                    row.get(0)
                })
                .unwrap_or(None);
            Ok(CacheTableStats {
                table: "thumbnail_cache".to_string(),
                total_entries: count,
                last_updated,
            })
        })
    }

    pub fn stats(&self) -> Result<CacheIndexStats, String> {
        Ok(CacheIndexStats {
            directory: self.directory_stats()?,
            thumbnail: self.thumbnail_stats()?,
        })
    }

    pub fn run_gc(&self) -> Result<CacheGcResult, String> {
        Ok(CacheGcResult {
            directory_removed: self.cleanup_directory_cache()?,
            thumbnail_removed: self.cleanup_thumbnail_cache()?,
        })
    }
}
