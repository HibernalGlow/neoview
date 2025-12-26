//! 缩略图维护命令
//! 包含失败记录管理、数据库迁移、清理、标签搜索、AI翻译、手动标签等功能

use super::ThumbnailState;
use std::collections::HashMap;
use tauri::Manager;

// ==================== 失败记录管理 ====================

/// 保存失败记录
#[tauri::command]
pub async fn save_failed_thumbnail(
    app: tauri::AppHandle,
    path: String,
    reason: String,
    retry_count: i32,
    error_message: Option<String>,
) -> Result<(), String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .save_failed_thumbnail(&path, &reason, retry_count, error_message.as_deref())
        .map_err(|e| format!("保存失败记录失败: {}", e))
}

/// 查询失败记录
#[tauri::command]
pub async fn get_failed_thumbnail(
    app: tauri::AppHandle,
    path: String,
) -> Result<Option<(String, i32, String)>, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .get_failed_thumbnail(&path)
        .map_err(|e| format!("查询失败记录失败: {}", e))
}

/// 删除失败记录
#[tauri::command]
pub async fn remove_failed_thumbnail(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .remove_failed_thumbnail(&path)
        .map_err(|e| format!("删除失败记录失败: {}", e))
}

/// 批量检查失败记录
#[tauri::command]
pub async fn batch_check_failed_thumbnails(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<HashMap<String, (String, i32)>, String> {
    let state = app.state::<ThumbnailState>();
    let keys: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    state
        .db
        .batch_check_failed(&keys)
        .map_err(|e| format!("批量检查失败记录失败: {}", e))
}

/// 清理过期失败记录
#[tauri::command]
pub async fn cleanup_old_failures(app: tauri::AppHandle, days: i64) -> Result<usize, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .cleanup_old_failures(days)
        .map_err(|e| format!("清理失败记录失败: {}", e))
}

// ==================== 数据库维护 ====================

/// 手动触发数据库迁移（为旧数据库添加 EMM 相关字段）
#[tauri::command]
pub async fn migrate_thumbnail_db(app: tauri::AppHandle) -> Result<String, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .migrate_add_emm_columns()
        .map_err(|e| format!("迁移失败: {}", e))
}

/// 规范化所有路径键
#[tauri::command]
pub async fn normalize_thumbnail_keys(app: tauri::AppHandle) -> Result<(usize, usize), String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .normalize_all_keys()
        .map_err(|e| format!("规范化路径键失败: {}", e))
}

/// 清理无效缩略图条目
#[tauri::command]
pub async fn cleanup_invalid_thumbnails(app: tauri::AppHandle) -> Result<usize, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .cleanup_invalid_entries()
        .map_err(|e| format!("清理无效条目失败: {}", e))
}

/// 获取缩略图数据库维护统计
#[tauri::command]
pub async fn get_thumbnail_maintenance_stats(
    app: tauri::AppHandle,
) -> Result<(usize, usize, usize), String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .get_maintenance_stats()
        .map_err(|e| format!("获取统计信息失败: {}", e))
}

// ==================== 标签搜索 ====================

/// 搜索符合标签条件的书籍
/// search_tags: Vec<(namespace, tag, prefix)>，prefix 为 "" 表示必须包含，"-" 表示排除
/// enable_mixed_gender: 是否启用混合性别匹配
/// base_path: 可选的基础路径过滤
#[tauri::command]
pub async fn search_by_tags(
    app: tauri::AppHandle,
    search_tags: Vec<(String, String, String)>,
    enable_mixed_gender: bool,
    base_path: Option<String>,
) -> Result<Vec<String>, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .search_by_tags(search_tags, enable_mixed_gender, base_path.as_deref())
        .map_err(|e| format!("标签搜索失败: {}", e))
}

/// 统计书籍匹配的收藏标签数量
#[tauri::command]
pub async fn count_matching_collect_tags(
    app: tauri::AppHandle,
    key: String,
    collect_tags: Vec<(String, String)>,
    enable_mixed_gender: bool,
) -> Result<usize, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .count_matching_collect_tags(&key, &collect_tags, enable_mixed_gender)
        .map_err(|e| format!("统计收藏标签失败: {}", e))
}

/// 批量统计书籍匹配的收藏标签数量
#[tauri::command]
pub async fn batch_count_matching_collect_tags(
    app: tauri::AppHandle,
    keys: Vec<String>,
    collect_tags: Vec<(String, String)>,
    enable_mixed_gender: bool,
) -> Result<Vec<(String, usize)>, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .batch_count_matching_collect_tags(&keys, &collect_tags, enable_mixed_gender)
        .map_err(|e| format!("批量统计收藏标签失败: {}", e))
}

// ==================== AI 翻译 ====================

/// 保存 AI 翻译到缩略图数据库
/// ai_translation_json 格式: { title: string, service: 'libre'|'ollama', model?: string, timestamp: number }
#[tauri::command]
pub async fn save_ai_translation(
    app: tauri::AppHandle,
    key: String,
    ai_translation_json: String,
) -> Result<(), String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .save_ai_translation(&key, &ai_translation_json)
        .map_err(|e| format!("保存 AI 翻译失败: {}", e))
}

/// 读取 AI 翻译（支持按模型筛选）
/// model_filter: 对于 ollama 服务，只返回匹配该模型的翻译
#[tauri::command]
pub async fn load_ai_translation(
    app: tauri::AppHandle,
    key: String,
    model_filter: Option<String>,
) -> Result<Option<String>, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .load_ai_translation(&key, model_filter.as_deref())
        .map_err(|e| format!("读取 AI 翻译失败: {}", e))
}

/// 批量读取 AI 翻译
#[tauri::command]
pub async fn batch_load_ai_translations(
    app: tauri::AppHandle,
    keys: Vec<String>,
    model_filter: Option<String>,
) -> Result<HashMap<String, String>, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .batch_load_ai_translations(&keys, model_filter.as_deref())
        .map_err(|e| format!("批量读取 AI 翻译失败: {}", e))
}

/// 获取数据库中 AI 翻译缓存数量
#[tauri::command]
pub async fn get_ai_translation_count(app: tauri::AppHandle) -> Result<usize, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .get_ai_translation_count()
        .map_err(|e| format!("获取 AI 翻译数量失败: {}", e))
}

// ==================== 手动标签 ====================

/// 更新单个记录的手动标签
/// manual_tags_json 格式: [{ namespace: string, tag: string, timestamp: number }]
#[tauri::command]
pub async fn update_manual_tags(
    app: tauri::AppHandle,
    key: String,
    manual_tags_json: Option<String>,
) -> Result<(), String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .update_manual_tags(&key, manual_tags_json.as_deref())
        .map_err(|e| format!("更新手动标签失败: {}", e))
}

/// 获取单个记录的手动标签
#[tauri::command]
pub async fn get_manual_tags(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .get_manual_tags(&key)
        .map_err(|e| format!("获取手动标签失败: {}", e))
}

/// 批量获取手动标签
#[tauri::command]
pub async fn batch_get_manual_tags(
    app: tauri::AppHandle,
    keys: Vec<String>,
) -> Result<HashMap<String, Option<String>>, String> {
    let state = app.state::<ThumbnailState>();
    state
        .db
        .batch_get_manual_tags(&keys)
        .map_err(|e| format!("批量获取手动标签失败: {}", e))
}
