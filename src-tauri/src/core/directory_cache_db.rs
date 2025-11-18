use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::Utc;
use rusqlite::{params, Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};

use crate::core::fs_manager::FsItem;

#[derive(Clone)]
pub struct DirectoryCacheDb {
    connection: Arc<Mutex<Option<Connection>>>,
    db_path: PathBuf,
    ttl: Duration,
}

#[derive(Debug, Serialize, Deserialize)]
struct CachedDirectory {
    items: Vec<FsItem>,
}

impl DirectoryCacheDb {
    pub fn new(db_path: PathBuf, ttl: Duration) -> Self {
        Self {
            connection: Arc::new(Mutex::new(None)),
            db_path,
            ttl,
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
             CREATE INDEX IF NOT EXISTS idx_directory_cache_updated_at ON directory_cache(updated_at);",
        )?;

        *conn_guard = Some(conn);
        Ok(())
    }

    fn with_connection<T, F: FnOnce(&Connection) -> SqliteResult<T>>(
        &self,
        f: F,
    ) -> Result<T, String> {
        self.open()
            .map_err(|e| format!("打开目录缓存数据库失败: {}", e))?;
        let guard = self.connection.lock().unwrap();
        let conn = guard.as_ref().unwrap();
        f(conn).map_err(|e| format!("目录缓存数据库操作失败: {}", e))
    }

    pub fn load_snapshot(
        &self,
        path: &str,
        mtime: Option<u64>,
    ) -> Result<Option<Vec<FsItem>>, String> {
        let ttl_secs = self.ttl.as_secs() as i64;
        self.with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT payload, mtime, updated_at FROM directory_cache WHERE path = ?1 LIMIT 1",
            )?;
            let mut rows = stmt.query(params![path])?;
            if let Some(row) = rows.next() {
                let payload: String = row.get(0)?;
                let stored_mtime: Option<u64> = row.get(1)?;
                let updated_at: i64 = row.get(2)?;

                // mtime mismatch invalidates cache
                if mtime.is_some() && stored_mtime != mtime {
                    conn.execute("DELETE FROM directory_cache WHERE path = ?1", params![path])?;
                    return Ok(None);
                }

                // TTL expired
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

    pub fn save_snapshot(
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

    pub fn cleanup_expired(&self) -> Result<usize, String> {
        let ttl_secs = self.ttl.as_secs() as i64;
        self.with_connection(|conn| {
            let now = Utc::now().timestamp();
            let deleted = conn.execute(
                "DELETE FROM directory_cache WHERE (?1 > 0 AND (?2 - updated_at) > ?1)",
                params![ttl_secs, now],
            )?;
            Ok(deleted)
        })
    }
}
