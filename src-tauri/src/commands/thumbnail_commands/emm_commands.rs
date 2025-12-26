//! EMM JSON 缓存命令
//! 包含 EMM 元数据的保存、获取、批量操作等功能

use super::ThumbnailState;
use std::collections::HashMap;
use tauri::Manager;

/// 保存单个 EMM JSON 缓存
#[tauri::command]
pub async fn save_emm_json(
    app: tauri::AppHandle,
    path: String,
    emm_json: String,
) -> Result<(), String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .save_emm_json(&path, &emm_json)
        .map_err(|e| format!("保存 EMM JSON 失败: {}", e))
}

/// 批量保存 EMM JSON 缓存
#[tauri::command]
pub async fn batch_save_emm_json(
    app: tauri::AppHandle,
    entries: Vec<(String, String)>,
) -> Result<usize, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .batch_save_emm_json(&entries)
        .map_err(|e| format!("批量保存 EMM JSON 失败: {}", e))
}

/// 获取单个 EMM JSON 缓存
#[tauri::command]
pub async fn get_emm_json(app: tauri::AppHandle, path: String) -> Result<Option<String>, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .get_emm_json(&path)
        .map_err(|e| format!("获取 EMM JSON 失败: {}", e))
}

/// 批量获取 EMM JSON 缓存
#[tauri::command]
pub async fn batch_get_emm_json(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<HashMap<String, String>, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .batch_get_emm_json(&paths)
        .map_err(|e| format!("批量获取 EMM JSON 失败: {}", e))
}

/// 获取所有缩略图键（用于 EMM 同步）
#[tauri::command]
pub async fn get_all_thumbnail_keys(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .get_all_thumbnail_keys()
        .map_err(|e| format!("获取缩略图键列表失败: {}", e))
}

/// 获取指定目录下的缩略图键（用于增量 EMM 同步）
#[tauri::command]
pub async fn get_thumbnail_keys_by_prefix(
    app: tauri::AppHandle,
    prefix: String,
) -> Result<Vec<String>, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .get_thumbnail_keys_by_prefix(&prefix)
        .map_err(|e| format!("获取目录缩略图键失败: {}", e))
}

/// 插入或更新带 EMM JSON 的记录
#[tauri::command]
pub async fn upsert_with_emm_json(
    app: tauri::AppHandle,
    path: String,
    category: String,
    emm_json: Option<String>,
) -> Result<(), String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .upsert_with_emm_json(&path, &category, emm_json.as_deref())
        .map_err(|e| format!("插入/更新记录失败: {}", e))
}

/// 获取 emm_json 为空的缩略图键列表（用于增量更新）
#[tauri::command]
pub async fn get_keys_without_emm_json(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .get_keys_without_emm_json()
        .map_err(|e| format!("获取空 emm_json 键失败: {}", e))
}
