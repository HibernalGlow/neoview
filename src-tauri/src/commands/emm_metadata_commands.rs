//! NeoView - EMM Metadata Commands
//! 读取 exhentai-manga-manager 的数据库和 JSON 文件

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EMMMetadata {
    pub hash: String,
    pub translated_title: Option<String>,   // 译名
    pub tags: HashMap<String, Vec<String>>, // 分类 -> 标签列表
    pub title: Option<String>,
    pub title_jpn: Option<String>,
    // 下面这些字段对应 mangas 表中的主要列，方便前端完整展示原始记录
    pub rating: Option<f64>,
    pub id: Option<String>,
    pub cover_path: Option<String>,
    pub filepath: Option<String>,
    #[serde(rename = "type")]
    pub r#type: Option<String>,
    pub page_count: Option<i64>,
    pub bundle_size: Option<i64>,
    pub mtime: Option<String>,
    pub cover_hash: Option<String>,
    pub status: Option<String>,
    pub date: Option<i64>,
    pub filecount: Option<i64>,
    pub posted: Option<i64>,
    pub filesize: Option<i64>,
    pub category: Option<String>,
    pub url: Option<String>,
    pub mark: Option<i64>,
    pub hidden_book: Option<i64>,
    pub read_count: Option<i64>,
    pub exist: Option<i64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EMMCollectTag {
    pub id: String,
    pub letter: String,  // 分类字母
    pub tag: String,     // 标签名
    pub color: String,   // 颜色
    pub display: String, // 显示格式 "分类:标签"
}

/// 读取 EMM 数据库中的元数据
#[tauri::command]
pub async fn load_emm_metadata(
    db_path: String,
    hash: String,
    translation_db_path: Option<String>, // 可选的翻译数据库路径
) -> Result<Option<EMMMetadata>, String> {
    let path = PathBuf::from(&db_path);
    if !path.exists() {
        return Ok(None);
    }

    let conn = Connection::open(&path).map_err(|e| format!("打开数据库失败: {}", e))?;

    // 先尝试从 Mangas 表读取（一次性把主要字段都取出）
    let mut stmt = conn
        .prepare(
            "SELECT \
                id, title, coverPath, hash, filepath, type, pageCount, bundleSize, mtime, coverHash, \
                status, date, rating, tags, title_jpn, filecount, posted, filesize, category, url, \
                mark, hiddenBook, readCount, exist, createdAt, updatedAt \
                FROM Mangas WHERE hash = ?1",
        )
        .map_err(|e| format!("准备查询失败: {}", e))?;

    let mut rows = stmt
        .query_map([&hash], |row| {
            let tags_json: String = row.get(13)?;
            let tags: HashMap<String, Vec<String>> =
                serde_json::from_str(&tags_json).unwrap_or_default();

            Ok(EMMMetadata {
                // 基本字段
                hash: row.get(3)?,
                translated_title: None, // 需要从翻译数据库读取
                tags,
                title: row.get(1)?,
                title_jpn: row.get(14)?,
                // 额外字段（可能部分为空）
                rating: row.get(12).ok(),
                id: row.get(0).ok(),
                cover_path: row.get(2).ok(),
                filepath: row.get(4).ok(),
                r#type: row.get(5).ok(),
                page_count: row.get(6).ok(),
                bundle_size: row.get(7).ok(),
                mtime: row.get(8).ok(),
                cover_hash: row.get(9).ok(),
                status: row.get(10).ok(),
                date: row.get(11).ok(),
                filecount: row.get(15).ok(),
                posted: row.get(16).ok(),
                filesize: row.get(17).ok(),
                category: row.get(18).ok(),
                url: row.get(19).ok(),
                mark: row.get(20).ok(),
                hidden_book: row.get(21).ok(),
                read_count: row.get(22).ok(),
                exist: row.get(23).ok(),
                created_at: row.get(24).ok(),
                updated_at: row.get(25).ok(),
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
                let tags: HashMap<String, Vec<String>> =
                    serde_json::from_str(&tags_json).unwrap_or_default();

                Ok(EMMMetadata {
                    hash: row.get(0)?,
                    translated_title: None,
                    tags,
                    title: row.get(1)?,
                    title_jpn: row.get(2)?,
                    rating: None,
                    id: None,
                    cover_path: None,
                    filepath: None,
                    r#type: None,
                    page_count: None,
                    bundle_size: None,
                    mtime: None,
                    cover_hash: None,
                    status: None,
                    date: None,
                    filecount: None,
                    posted: None,
                    filesize: None,
                    category: None,
                    url: None,
                    mark: None,
                    hidden_book: None,
                    read_count: None,
                    exist: None,
                    created_at: None,
                    updated_at: None,
                })
            })
            .map_err(|e| format!("查询失败: {}", e))?;

        if let Some(row) = rows.next() {
            row.map_err(|e| format!("读取行失败: {}", e))?
        } else {
            return Ok(None);
        }
    };

    // 从翻译数据库读取译名（优先使用指定的翻译数据库，否则尝试从主数据库读取）
    if let Some(translation_db) = translation_db_path {
        let translation_path = PathBuf::from(&translation_db);
        if translation_path.exists() {
            if let Ok(translation_conn) = Connection::open(&translation_path) {
                let mut stmt = translation_conn
                    .prepare("SELECT chinese_title FROM translations WHERE hash = ?1")
                    .map_err(|e| format!("准备查询失败: {}", e))?;

                if let Ok(chinese_title) =
                    stmt.query_row([&hash], |row| row.get::<_, Option<String>>(0))
                {
                    if let Some(title) = chinese_title {
                        metadata.translated_title = Some(title);
                    }
                }
            }
        }
    } else {
        // 尝试从主数据库的 translations 表读取（兼容旧版本）
        let mut stmt = conn
            .prepare("SELECT chinese_title FROM translations WHERE hash = ?1")
            .map_err(|e| format!("准备查询失败: {}", e))?;

        if let Ok(chinese_title) = stmt.query_row([&hash], |row| row.get::<_, Option<String>>(0)) {
            if let Some(title) = chinese_title {
                metadata.translated_title = Some(title);
            }
        }
    }

    Ok(Some(metadata))
}

/// 批量读取 EMM 元数据（通过文件路径匹配）
#[tauri::command]
pub async fn load_emm_metadata_by_path(
    db_path: String,
    file_path: String,
    translation_db_path: Option<String>, // 可选的翻译数据库路径
) -> Result<Option<EMMMetadata>, String> {
    let path = PathBuf::from(&db_path);
    if !path.exists() {
        return Ok(None);
    }

    let conn = Connection::open(&path).map_err(|e| format!("打开数据库失败: {}", e))?;

    // 从 Mangas 表通过 filepath 查找（同样一次性取出主要字段）
    let mut stmt = conn
        .prepare(
            "SELECT \
                id, title, coverPath, hash, filepath, type, pageCount, bundleSize, mtime, coverHash, \
                status, date, rating, tags, title_jpn, filecount, posted, filesize, category, url, \
                mark, hiddenBook, readCount, exist, createdAt, updatedAt \
                FROM Mangas WHERE filepath = ?1",
        )
        .map_err(|e| format!("准备查询失败: {}", e))?;

    let mut rows = stmt
        .query_map([&file_path], |row| {
            let hash: String = row.get(3)?;
            let tags_json: String = row.get(13)?;
            let tags: HashMap<String, Vec<String>> =
                serde_json::from_str(&tags_json).unwrap_or_default();

            Ok((
                hash.clone(),
                EMMMetadata {
                    hash,
                    translated_title: None,
                    tags,
                    title: row.get(1).ok(),
                    title_jpn: row.get(14).ok(),
                    rating: row.get(12).ok(),
                    id: row.get(0).ok(),
                    cover_path: row.get(2).ok(),
                    filepath: row.get(4).ok(),
                    r#type: row.get(5).ok(),
                    page_count: row.get(6).ok(),
                    bundle_size: row.get(7).ok(),
                    mtime: row.get(8).ok(),
                    cover_hash: row.get(9).ok(),
                    status: row.get(10).ok(),
                    date: row.get(11).ok(),
                    filecount: row.get(15).ok(),
                    posted: row.get(16).ok(),
                    filesize: row.get(17).ok(),
                    category: row.get(18).ok(),
                    url: row.get(19).ok(),
                    mark: row.get(20).ok(),
                    hidden_book: row.get(21).ok(),
                    read_count: row.get(22).ok(),
                    exist: row.get(23).ok(),
                    created_at: row.get(24).ok(),
                    updated_at: row.get(25).ok(),
                },
            ))
        })
        .map_err(|e| format!("查询失败: {}", e))?;

    let (hash, mut metadata) = if let Some(row) = rows.next() {
        row.map_err(|e| format!("读取行失败: {}", e))?
    } else {
        return Ok(None);
    };

    // 从翻译数据库读取译名（优先使用指定的翻译数据库，否则尝试从主数据库读取）
    if let Some(translation_db) = translation_db_path {
        let translation_path = PathBuf::from(&translation_db);
        if translation_path.exists() {
            if let Ok(translation_conn) = Connection::open(&translation_path) {
                let mut stmt = translation_conn
                    .prepare("SELECT chinese_title FROM translations WHERE hash = ?1")
                    .map_err(|e| format!("准备查询失败: {}", e))?;

                if let Ok(chinese_title) =
                    stmt.query_row([&hash], |row| row.get::<_, Option<String>>(0))
                {
                    if let Some(title) = chinese_title {
                        metadata.translated_title = Some(title);
                    }
                }
            }
        }
    } else {
        // 尝试从主数据库的 translations 表读取（兼容旧版本）
        let mut stmt = conn
            .prepare("SELECT chinese_title FROM translations WHERE hash = ?1")
            .map_err(|e| format!("准备查询失败: {}", e))?;

        if let Ok(chinese_title) = stmt.query_row([&hash], |row| row.get::<_, Option<String>>(0)) {
            if let Some(title) = chinese_title {
                metadata.translated_title = Some(title);
            }
        }
    }

    Ok(Some(metadata))
}

/// 读取收藏标签配置（从设置文件）
#[tauri::command]
pub async fn load_emm_collect_tags(setting_path: String) -> Result<Vec<EMMCollectTag>, String> {
    use std::fs;

    let path = PathBuf::from(&setting_path);
    if !path.exists() {
        return Ok(vec![]);
    }

    let content = fs::read_to_string(&path).map_err(|e| format!("读取设置文件失败: {}", e))?;

    let setting: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("解析设置文件失败: {}", e))?;

    let collect_tags = setting
        .get("collectTag")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    println!(
        "[EMM] 从 setting.json 读取 collectTag 字段，找到 {} 个标签",
        collect_tags.len()
    );

    if collect_tags.is_empty() {
        println!("[EMM] 警告：collectTag 数组为空，可能字段名不匹配或文件格式不正确");
        println!(
            "[EMM] setting.json 的顶层键: {:?}",
            setting.as_object().map(|o| o.keys().collect::<Vec<_>>())
        );
    }

    let mut tags = Vec::new();
    println!("[EMM] 开始解析收藏标签，共 {} 个", collect_tags.len());

    for (index, tag_obj) in collect_tags.iter().enumerate() {
        // 从 JSON 中提取字段：id, letter, cat, tag, color
        // id 格式通常是 "cat:tag"，例如 "female:stirrup legwear"
        // 如果没有 id，可以从 cat 和 tag 构造
        let id = tag_obj.get("id").and_then(|v| v.as_str());
        let letter = tag_obj.get("letter").and_then(|v| v.as_str());
        let cat = tag_obj.get("cat").and_then(|v| v.as_str()); // 分类，如 "female", "male", "character"
        let tag = tag_obj.get("tag").and_then(|v| v.as_str());
        let color = tag_obj.get("color").and_then(|v| v.as_str());

        println!(
            "[EMM] 标签 #{}: id={:?}, letter={:?}, cat={:?}, tag={:?}, color={:?}",
            index, id, letter, cat, tag, color
        );

        // 至少需要 tag 和 color，其他字段可以推断
        if let (Some(tag_str), Some(color_str)) = (tag, color) {
            // 如果有 id，使用它；否则从 cat 和 tag 构造
            let id_str = id.map(|s| s.to_string()).unwrap_or_else(|| {
                if let Some(cat_str) = cat {
                    format!("{}:{}", cat_str, tag_str)
                } else if let Some(letter_str) = letter {
                    format!("{}:{}", letter_str, tag_str)
                } else {
                    tag_str.to_string()
                }
            });

            // display 格式：使用 cat:tag（如果 cat 存在），否则使用 letter:tag
            let display_str = if let Some(cat_str) = cat {
                format!("{}:{}", cat_str, tag_str)
            } else if let Some(letter_str) = letter {
                format!("{}:{}", letter_str, tag_str)
            } else {
                tag_str.to_string()
            };

            let collect_tag = EMMCollectTag {
                id: id_str.clone(),
                letter: letter.map(|s| s.to_string()).unwrap_or_default(),
                tag: tag_str.to_string(),
                color: color_str.to_string(),
                display: display_str.clone(),
            };

            println!(
                "[EMM] 解析后的标签 #{}: id={}, display={}, tag={}, color={}",
                index, collect_tag.id, collect_tag.display, collect_tag.tag, collect_tag.color
            );

            tags.push(collect_tag);
        } else {
            println!("[EMM] 警告：标签 #{} 缺少 tag 或 color 字段，跳过", index);
        }
    }

    println!("[EMM] 成功解析 {} 个收藏标签", tags.len());

    Ok(tags)
}

/// 查找 EMM 主数据库路径（自动检测，不包括 translations.db）
#[tauri::command]
pub async fn find_emm_databases() -> Result<Vec<String>, String> {
    let mut databases = Vec::new();

    // 常见的 EMM 主数据库位置（不包括 translations.db）
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_default();

    let common_paths: Vec<String> = vec![
        // 便携版（相对于当前工作目录）
        "portable/db.sqlite".to_string(),
        // 用户数据目录
        format!("{}/exhentai-manga-manager/db.sqlite", appdata),
        format!("{}/exhentai-manga-manager/db.sqlite", localappdata),
    ];

    for path_str in common_paths {
        let path = PathBuf::from(&path_str);
        if path.exists() {
            databases.push(path_str);
        }
    }

    Ok(databases)
}

/// 查找 EMM 翻译数据库路径（自动检测）
#[tauri::command]
pub async fn find_emm_translation_database() -> Result<Option<String>, String> {
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_default();

    let common_paths: Vec<String> = vec![
        // 便携版
        "portable/translations.db".to_string(),
        // 用户数据目录
        format!("{}/exhentai-manga-manager/translations.db", appdata),
        format!("{}/exhentai-manga-manager/translations.db", localappdata),
    ];

    for path_str in common_paths {
        let path = PathBuf::from(&path_str);
        if path.exists() {
            return Ok(Some(path_str));
        }
    }

    Ok(None)
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

#[derive(Debug, Clone, Serialize)]
pub struct EMMTranslationRecord {
    pub name: Option<String>,
    pub intro: Option<String>,
    pub description: Option<String>,
}

// Custom deserializer to handle string or object for translation record
impl<'de> Deserialize<'de> for EMMTranslationRecord {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct EMMTranslationRecordVisitor;

        impl<'de> serde::de::Visitor<'de> for EMMTranslationRecordVisitor {
            type Value = EMMTranslationRecord;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("string or object with name/intro/description")
            }

            fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(EMMTranslationRecord {
                    name: Some(value.to_string()),
                    intro: None,
                    description: None,
                })
            }

            fn visit_map<M>(self, mut map: M) -> Result<Self::Value, M::Error>
            where
                M: serde::de::MapAccess<'de>,
            {
                let mut name = None;
                let mut intro = None;
                let mut description = None;

                while let Some(key) = map.next_key::<String>()? {
                    match key.as_str() {
                        "name" => name = map.next_value()?,
                        "intro" => intro = map.next_value()?,
                        "description" => description = map.next_value()?,
                        _ => {
                            let _ = map.next_value::<serde_json::Value>()?;
                        }
                    }
                }

                Ok(EMMTranslationRecord {
                    name,
                    intro,
                    description,
                })
            }
        }

        deserializer.deserialize_any(EMMTranslationRecordVisitor)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EMMTranslationNamespace {
    pub namespace: String,
    pub data: HashMap<String, EMMTranslationRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EMMTranslationDict {
    pub data: Vec<EMMTranslationNamespace>,
}

/// 读取 EMM 翻译字典 (db.text.json)
#[tauri::command]
pub async fn load_emm_translation_dict(
    file_path: String,
) -> Result<HashMap<String, HashMap<String, EMMTranslationRecord>>, String> {
    use std::fs;

    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("Translation file not found: {}", file_path));
    }

    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read translation file: {}", e))?;

    let dict: EMMTranslationDict = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse translation file: {}", e))?;

    // Convert to a more usable map: namespace -> key -> record
    let mut result = HashMap::new();
    for ns in dict.data {
        result.insert(ns.namespace, ns.data);
    }

    Ok(result)
}

/// 查找 EMM 翻译字典文件路径
#[tauri::command]
pub async fn find_emm_translation_file() -> Result<Option<String>, String> {
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let localappdata = std::env::var("LOCALAPPDATA").unwrap_or_default();

    let common_paths: Vec<String> = vec![
        // 便携版
        "portable/db.text.json".to_string(),
        // 用户数据目录
        format!("{}/exhentai-manga-manager/db.text.json", appdata),
        format!("{}/exhentai-manga-manager/db.text.json", localappdata),
    ];

    for path_str in common_paths {
        let path = PathBuf::from(&path_str);
        if path.exists() {
            return Ok(Some(path_str));
        }
    }

    Ok(None)
}
