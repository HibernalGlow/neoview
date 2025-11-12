//! NeoView - Upscale Settings Commands
//! 超分设置相关的 Tauri 命令

use tauri::{command, State};
use crate::core::upscale_settings::{UpscaleSettings, UpscaleSettingsManager};
use std::sync::Mutex;

/// 全局设置管理器状态
pub struct UpscaleSettingsState {
    pub manager: Mutex<Option<UpscaleSettingsManager>>,
}

impl Default for UpscaleSettingsState {
    fn default() -> Self {
        Self {
            manager: Mutex::new(None),
        }
    }
}

/// 初始化设置管理器
#[command]
pub async fn init_upscale_settings_manager(
    app_handle: tauri::AppHandle,
    state: State<'_, UpscaleSettingsState>,
) -> Result<(), String> {
    let manager = UpscaleSettingsManager::new(app_handle)?;
    
    let manager_guard = state.manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;
    let mut manager_guard = manager_guard;
    *manager_guard = Some(manager);
    
    Ok(())
}

/// 获取超分设置
#[command]
pub async fn get_upscale_settings(
    state: State<'_, UpscaleSettingsState>,
) -> Result<UpscaleSettings, String> {
    let manager_guard = state.manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;
    
    if let Some(manager) = manager_guard.as_ref() {
        Ok(manager.load_settings())
    } else {
        Err("设置管理器未初始化".to_string())
    }
}

/// 保存超分设置
#[command]
pub async fn save_upscale_settings(
    settings: UpscaleSettings,
    state: State<'_, UpscaleSettingsState>,
) -> Result<(), String> {
    let manager_guard = state.manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;
    
    if let Some(manager) = manager_guard.as_ref() {
        manager.save_settings(&settings)
    } else {
        Err("设置管理器未初始化".to_string())
    }
}

/// 重置超分设置为默认值
#[command]
pub async fn reset_upscale_settings(
    state: State<'_, UpscaleSettingsState>,
) -> Result<UpscaleSettings, String> {
    let default_settings = UpscaleSettings::default();
    
    let manager_guard = state.manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;
    
    if let Some(manager) = manager_guard.as_ref() {
        manager.save_settings(&default_settings)?;
        Ok(default_settings)
    } else {
        Err("设置管理器未初始化".to_string())
    }
}

/// 获取设置文件路径
#[command]
pub async fn get_upscale_settings_path(
    state: State<'_, UpscaleSettingsState>,
) -> Result<String, String> {
    let manager_guard = state.manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;
    
    if let Some(manager) = manager_guard.as_ref() {
        Ok(manager.get_settings_path().to_string_lossy().to_string())
    } else {
        Err("设置管理器未初始化".to_string())
    }
}