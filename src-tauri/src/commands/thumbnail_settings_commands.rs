//! NeoView - Thumbnail Settings Commands
//! 缩略图设置相关的 Tauri 命令

use tauri::command;
use crate::models::settings::{ThumbnailSettings, PerformanceSettings};
use std::sync::{Arc, Mutex};

/// 全局设置状态
pub struct SettingsState {
    pub performance: Arc<Mutex<PerformanceSettings>>,
}

impl Default for SettingsState {
    fn default() -> Self {
        Self {
            performance: Arc::new(Mutex::new(PerformanceSettings::default())),
        }
    }
}

/// 获取缩略图设置
#[command]
pub async fn get_thumbnail_settings(
    state: tauri::State<'_, SettingsState>,
) -> Result<ThumbnailSettings, String> {
    let performance = state.performance.lock()
        .map_err(|e| format!("获取设置失败: {}", e))?;
    Ok(performance.thumbnail.clone())
}

/// 更新缩略图设置
#[command]
pub async fn update_thumbnail_settings(
    settings: ThumbnailSettings,
    state: tauri::State<'_, SettingsState>,
) -> Result<(), String> {
    let mut performance = state.performance.lock()
        .map_err(|e| format!("更新设置失败: {}", e))?;
    performance.thumbnail = settings;
    
    // TODO: 通知异步处理器更新设置
    println!("✅ 缩略图设置已更新");
    
    Ok(())
}

/// 重置缩略图设置为默认值
#[command]
pub async fn reset_thumbnail_settings(
    state: tauri::State<'_, SettingsState>,
) -> Result<ThumbnailSettings, String> {
    let mut performance = state.performance.lock()
        .map_err(|e| format!("重置设置失败: {}", e))?;
    performance.thumbnail = ThumbnailSettings::default();
    
    println!("✅ 缩略图设置已重置为默认值");
    
    Ok(performance.thumbnail.clone())
}