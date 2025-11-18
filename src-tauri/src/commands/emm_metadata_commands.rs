//! NeoView - EMM Metadata Commands
//! 读取 exhentai-manga-manager 的数据库和 JSON 文件

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EMMMetadata {
    pub hash: String,
    pub translated_title: Option<String>, // 译名
    pub tags: HashMap<String, Vec<String>>, // 分类 -> 标签列表
    pub title: Option<String>,
    pub title_jpn: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EMMCollectTag {
    pub id: String,
    pub letter: String, // 分类字母
    pub tag: String,    // 标签名
    pub color: String, // 颜色
    pub display: String, // 显示格式 "分类:标签"
}

/// 读取 EMM 数据库中的元数据
#[tauri::command]
pub async fn load_emm_metadata(
    db_path: String,
    hash: String,
) -> Result<Option<EMMMetadata>, String> {
    let path = PathBuf::from(&db_path);
    if !path.exists() {
        return Ok(None);
    }

    let conn = Connection::open(&path).map_err(|e| format!("打开数据库失败: {}", e))?;

    // 先尝试从 Mangas 表读取
    let mut stmt = conn
        .prepare("SELECT hash, title, title_jpn, tags FROM Mangas WHERE hash = ?1")
        .map_err(|e| format!("准备查询失败: {}", e))?;

    let mut rows = stmt
        .query_map([&hash], |row| {
            let tags_json: String = row.get(3)?;
            let tags: HashMap<String, Vec<String>> = serde_json::from_str(&tags_json)
                .unwrap_or_default();

            Ok(EMMMetadata {
                hash: row.get(0)?,
                translated_title: None, // 需要从 translations 表读取
                tags,
                title: row.get(1)?,
                title_jpn: row.get(2)?,
            })
        })
        .map_err(|e| format!("查询失败: {}", e))?;

    let mut metadata = if let Some(row) = rows.next() {
        row.map_err(|e| format!("读取行失败: {}", e))?
    } else {
        // 如果 Mangas 表没有，尝试 Metadata 表
        let mut stmt = conn
            .prepare("SELECT hash, title, title_jpn, tags FROM Metadata WHERE hash = ?1")
            .map_err(|e| format!("准备查询失败: {}", e))?;

        let mut rows = stmt
            .query_map([&hash], |row| {
                let tags_json: String = row.get(3)?;
                let tags: HashMap<String, Vec<String>> = serde_json::from_str(&tags_json)
                    .unwrap_or_default();

                Ok(EMMMetadata {
                    hash: row.get(0)?,
                    translated_title: None,
                    tags,
                    title: row.get(1)?,
                    title_jpn: row.get(2)?,
                })
            })
            .map_err(|e| format!("查询失败: {}", e))?;

        if let Some(row) = rows.next() {
            row.map_err(|e| format!("读取行失败: {}", e))?
        } else {
            return Ok(None);
        }
    };

    // 从 translations 表读取译名
    let mut stmt = conn
        .prepare("SELECT chinese_title FROM translations WHERE hash = ?1")
        .map_err(|e| format!("准备查询失败: {}", e))?;

    if let Ok(chinese_title) = stmt.query_row([&hash], |row| row.get::<_, Option<String>>(0)) {
        if let Some(title) = chinese_title {
            metadata.translated_title = Some(title);
        }
    }

    Ok(Some(metadata))
}

/// 批量读取 EMM 元数据（通过文件路径匹配）
#[tauri::command]
pub async fn load_emm_metadata_by_path(
    db_path: String,
    file_path: String,
) -> Result<Option<EMMMetadata>, String> {
    let path = PathBuf::from(&db_path);
    if !path.exists() {
        return Ok(None);
    }

    let conn = Connection::open(&path).map_err(|e| format!("打开数据库失败: {}", e))?;

    // 从 Mangas 表通过 filepath 查找
    let mut stmt = conn
        .prepare("SELECT hash, title, title_jpn, tags FROM Mangas WHERE filepath = ?1")
        .map_err(|e| format!("准备查询失败: {}", e))?;

    let mut rows = stmt
        .query_map([&file_path], |row| {
            let hash: String = row.get(0)?;
            let tags_json: String = row.get(3)?;
            let tags: HashMap<String, Vec<String>> = serde_json::from_str(&tags_json)
                .unwrap_or_default();

            Ok((hash.clone(), EMMMetadata {
                hash,
                translated_title: None,
                tags,
                title: row.get(1)?,
                title_jpn: row.get(2)?,
            }))
        })
        .map_err(|e| format!("查询失败: {}", e))?;

    let (hash, mut metadata) = if let Some(row) = rows.next() {
        row.map_err(|e| format!("读取行失败: {}", e))?
    } else {
        return Ok(None);
    };

    // 从 translations 表读取译名
    let mut stmt = conn
        .prepare("SELECT chinese_title FROM translations WHERE hash = ?1")
        .map_err(|e| format!("准备查询失败: {}", e))?;

    if let Ok(chinese_title) = stmt.query_row([&hash], |row| row.get::<_, Option<String>>(0)) {
        if let Some(title) = chinese_title {
            metadata.translated_title = Some(title);
        }
    }

    Ok(Some(metadata))
}

/// 读取收藏标签配置（从设置文件）
#[tauri::command]
pub async fn load_emm_collect_tags(
    setting_path: String,
) -> Result<Vec<EMMCollectTag>, String> {
    use std::fs;

    let path = PathBuf::from(&setting_path);
    if !path.exists() {
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("读取设置文件失败: {}", e))?;

    let setting: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析设置文件失败: {}", e))?;

    let collect_tags = setting
        .get("collectTag")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut tags = Vec::new();
    for tag_obj in collect_tags {
        if let (Some(id), Some(letter), Some(tag), Some(color)) = (
            tag_obj.get("id").and_then(|v| v.as_str()),
            tag_obj.get("letter").and_then(|v| v.as_str()),
            tag_obj.get("tag").and_then(|v| v.as_str()),
            tag_obj.get("color").and_then(|v| v.as_str()),
        ) {
            tags.push(EMMCollectTag {
                id: id.to_string(),
                letter: letter.to_string(),
                tag: tag.to_string(),
                color: color.to_string(),
                display: format!("{}:{}", letter, tag),
            });
        }
    }

    Ok(tags)
}

/// 查找 EMM 数据库路径（自动检测）
#[tauri::command]
pub async fn find_emm_databases() -> Result<Vec<String>, String> {
    let mut databases = Vec::new();

    // 常见的 EMM 数据库位置
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
    
    let common_paths: Vec<String> = vec![
        // 便携版（相对于当前工作目录）
        "portable/db.sqlite".to_string(),
        // 用户数据目录
        format!("{}/exhentai-manga-manager/db.sqlite", appdata),
        format!("{}/exhentai-manga-manager/db.sqlite", localappdata),
        // 也尝试查找 translations.db（如果存在）
        format!("{}/exhentai-manga-manager/translations.db", appdata),
        format!("{}/exhentai-manga-manager/translations.db", localappdata),
    ];

    for path_str in common_paths {
        let path = PathBuf::from(&path_str);
        if path.exists() {
            databases.push(path_str);
        }
    }

    Ok(databases)
}

/// 查找 EMM 设置文件路径
#[tauri::command]
pub async fn find_emm_setting_file() -> Result<Option<String>, String> {
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
    
    let common_paths: Vec<String> = vec![
        // 便携版
        "portable/setting.json".to_string(),
        // 用户数据目录
        format!("{}/exhentai-manga-manager/setting.json", appdata),
        format!("{}/exhentai-manga-manager/setting.json", localappdata),
    ];

    for path_str in common_paths {
        let path = PathBuf::from(&path_str);
        if path.exists() {
            return Ok(Some(path_str));
        }
    }

    Ok(None)
}

