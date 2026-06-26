//! 数据库初始化和迁移

use super::ThumbnailDb;
use rusqlite::{params, Connection, Result as SqliteResult};

/// 初始化数据库表结构
pub fn initialize_db(conn: &Connection) -> SqliteResult<()> {
    conn.execute_batch(
        "PRAGMA auto_vacuum = FULL;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;",
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS thumbs (
            key TEXT NOT NULL PRIMARY KEY,
            size INTEGER,
            date TEXT,
            ghash INTEGER,
            category TEXT DEFAULT 'file',
            value BLOB,
            emm_json TEXT,
            rating_data TEXT,
            ai_translation TEXT,
            manual_tags TEXT
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_thumbs_key ON thumbs(key)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_thumbs_category ON thumbs(category)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_thumbs_date ON thumbs(date)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS failed_thumbnails (
            key TEXT NOT NULL PRIMARY KEY,
            reason TEXT NOT NULL,
            retry_count INTEGER DEFAULT 0,
            last_attempt TEXT,
            error_message TEXT
        )",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_failed_reason ON failed_thumbnails(reason)",
        [],
    )?;

    auto_migrate(conn)?;

    Ok(())
}

/// 自动迁移数据库
pub fn auto_migrate(conn: &Connection) -> SqliteResult<()> {
    let current_version = get_db_version(conn);
    let target_version = ThumbnailDb::DB_VERSION;

    if let Some(ref ver) = current_version {
        if ver == target_version {
            return Ok(());
        }
    }

    println!(
        "🔄 自动迁移数据库: {:?} -> {}",
        current_version, target_version
    );

    let has_ai_translation: bool = conn
        .prepare("SELECT ai_translation FROM thumbs LIMIT 1")
        .is_ok();
    if !has_ai_translation {
        conn.execute("ALTER TABLE thumbs ADD COLUMN ai_translation TEXT", [])?;
        println!("✅ 添加 ai_translation 列");
    }

    let has_manual_tags: bool = conn
        .prepare("SELECT manual_tags FROM thumbs LIMIT 1")
        .is_ok();
    if !has_manual_tags {
        conn.execute("ALTER TABLE thumbs ADD COLUMN manual_tags TEXT", [])?;
        println!("✅ 添加 manual_tags 列");
    }

    set_db_version(conn, target_version)?;
    println!("✅ 数据库版本更新为 {}", target_version);

    Ok(())
}

/// 获取当前数据库版本
pub fn get_db_version(conn: &Connection) -> Option<String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT)",
        [],
    )
    .ok()?;

    let mut stmt = conn
        .prepare("SELECT value FROM metadata WHERE key = 'version'")
        .ok()?;
    stmt.query_row([], |row| row.get(0)).ok()
}

/// 设置数据库版本
pub fn set_db_version(conn: &Connection, version: &str) -> SqliteResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO metadata (key, value) VALUES ('version', ?1)",
        params![version],
    )?;
    Ok(())
}

/// 获取表的列名列表
pub fn get_table_columns(conn: &Connection, table_name: &str) -> SqliteResult<Vec<String>> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table_name))?;
    let columns: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(columns)
}

/// 从 emm_json 字段中提取 rating 并保存到 rating_data
pub fn migrate_rating_from_emm_json(conn: &Connection) -> SqliteResult<usize> {
    use serde_json::Value;

    let mut stmt = conn.prepare(
        "SELECT key, emm_json FROM thumbs WHERE emm_json IS NOT NULL AND rating_data IS NULL",
    )?;

    let rows: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .filter_map(|r| r.ok())
        .collect();

    let mut count = 0;
    let now = chrono::Local::now().timestamp_millis();

    for (key, emm_json) in rows {
        if let Ok(json) = serde_json::from_str::<Value>(&emm_json) {
            if let Some(rating) = json.get("rating").and_then(|r| r.as_f64()) {
                if rating > 0.0 {
                    let rating_data = serde_json::json!({
                        "value": rating,
                        "source": "emm",
                        "timestamp": now
                    });
                    conn.execute(
                        "UPDATE thumbs SET rating_data = ?1 WHERE key = ?2",
                        params![rating_data.to_string(), key],
                    )?;
                    count += 1;
                }
            }
        }
    }

    println!("📊 从 emm_json 迁移了 {} 条评分数据", count);
    Ok(count)
}

impl ThumbnailDb {
    /// 手动迁移：检查并添加必需的列
    pub fn migrate_add_emm_columns(&self) -> SqliteResult<String> {
        self.open()?;
        let conn_guard = self.connection.lock().unwrap();
        let conn = conn_guard.as_ref().unwrap();

        let mut messages = Vec::new();

        let current_version = get_db_version(conn).unwrap_or_else(|| "1.0".to_string());
        let target_version = Self::DB_VERSION;

        println!(
            "📦 检查数据库结构: 当前版本 v{}, 目标版本 v{}",
            current_version, target_version
        );

        let has_emm_json: bool = conn.prepare("SELECT emm_json FROM thumbs LIMIT 1").is_ok();
        if !has_emm_json {
            conn.execute("ALTER TABLE thumbs ADD COLUMN emm_json TEXT", [])?;
            messages.push("添加 emm_json 列");
            println!("✅ 添加 emm_json 列");
        }

        let has_rating_data: bool = conn
            .prepare("SELECT rating_data FROM thumbs LIMIT 1")
            .is_ok();
        if !has_rating_data {
            conn.execute("ALTER TABLE thumbs ADD COLUMN rating_data TEXT", [])?;
            messages.push("添加 rating_data 列");
            println!("✅ 添加 rating_data 列");
        }

        let has_ai_translation: bool = conn
            .prepare("SELECT ai_translation FROM thumbs LIMIT 1")
            .is_ok();
        if !has_ai_translation {
            conn.execute("ALTER TABLE thumbs ADD COLUMN ai_translation TEXT", [])?;
            messages.push("添加 ai_translation 列");
            println!("✅ 添加 ai_translation 列");
        }

        let has_manual_tags: bool = conn
            .prepare("SELECT manual_tags FROM thumbs LIMIT 1")
            .is_ok();
        if !has_manual_tags {
            conn.execute("ALTER TABLE thumbs ADD COLUMN manual_tags TEXT", [])?;
            messages.push("添加 manual_tags 列");
            println!("✅ 添加 manual_tags 列");
        }

        let migrated = migrate_rating_from_emm_json(conn)?;
        if migrated > 0 {
            messages.push("从 emm_json 迁移评分数据");
        }

        set_db_version(conn, target_version)?;

        let columns = get_table_columns(conn, "thumbs")?;
        let has_emm = columns.contains(&"emm_json".to_string());
        let has_rating = columns.contains(&"rating_data".to_string());

        if messages.is_empty() {
            Ok(format!(
                "数据库已是最新版本 (v{})\n列状态: emm_json={}, rating_data={}",
                target_version, has_emm, has_rating
            ))
        } else {
            Ok(format!(
                "迁移完成 (v{}): {}\n列状态: emm_json={}, rating_data={}",
                target_version,
                messages.join(", "),
                has_emm,
                has_rating
            ))
        }
    }
}
