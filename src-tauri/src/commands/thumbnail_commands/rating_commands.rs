//! Rating 评分命令
//! 包含评分数据的读写、批量操作、文件夹评分计算等功能

use super::ThumbnailState;
use std::collections::HashMap;
use tauri::Manager;

/// 更新单个记录的 rating_data（JSON 格式）
/// rating_data 格式: { value: number, source: 'emm'|'manual'|'calculated', timestamp: number }
#[tauri::command]
pub async fn update_rating_data(
    app: tauri::AppHandle,
    path: String,
    rating_data: Option<String>,
) -> Result<(), String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .update_rating_data(&path, rating_data.as_deref())
        .map_err(|e| format!("更新 rating_data 失败: {}", e))
}

/// 获取单个记录的 rating_data
#[tauri::command]
pub async fn get_rating_data(
    app: tauri::AppHandle,
    path: String,
) -> Result<Option<String>, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .get_rating_data(&path)
        .map_err(|e| format!("获取 rating_data 失败: {}", e))
}

/// 批量获取 rating_data（用于排序）
#[tauri::command]
pub async fn batch_get_rating_data(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<HashMap<String, Option<String>>, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .batch_get_rating_data(&paths)
        .map_err(|e| format!("批量获取 rating_data 失败: {}", e))
}

/// 获取目录下所有文件的 rating_data（用于计算文件夹平均评分）
#[tauri::command]
pub async fn get_rating_data_by_prefix(
    app: tauri::AppHandle,
    prefix: String,
) -> Result<Vec<(String, Option<String>)>, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .get_rating_data_by_prefix(&prefix)
        .map_err(|e| format!("获取目录 rating_data 失败: {}", e))
}

/// 批量保存 emm_json 和 rating_data
#[tauri::command]
pub async fn batch_save_emm_with_rating_data(
    app: tauri::AppHandle,
    entries: Vec<(String, String, Option<String>)>,
) -> Result<usize, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .batch_save_emm_with_rating_data(&entries)
        .map_err(|e| format!("批量保存 emm 和 rating_data 失败: {}", e))
}

/// 计算文件夹的平均评分并保存到 rating_data
/// 不会覆盖手动评分（source: 'manual'）
#[tauri::command]
pub async fn calculate_folder_ratings(app: tauri::AppHandle) -> Result<usize, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .calculate_folder_ratings()
        .map_err(|e| format!("计算文件夹评分失败: {}", e))
}
