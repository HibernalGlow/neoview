//! NeoView - Upscale Settings Commands
//! 超分设置相关的 Tauri 命令

use crate::core::upscale_settings::{UpscaleSettings, UpscaleSettingsManager};
use std::sync::Mutex;
use tauri::{command, State};

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

    let manager_guard = state
        .manager
        .lock()
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
    let manager_guard = state
        .manager
        .lock()
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
    let manager_guard = state
        .manager
        .lock()
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

    let manager_guard = state
        .manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    if let Some(manager) = manager_guard.as_ref() {
        manager.save_settings(&default_settings)?;
        Ok(default_settings)
    } else {
        Err("设置管理器未初始化".to_string())
    }
}

/// 检查图片是否满足超分条件
#[command]
pub async fn check_upscale_conditions(
    width: u32,
    height: u32,
    state: State<'_, UpscaleSettingsState>,
) -> Result<bool, String> {
    let manager_guard = state
        .manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    if let Some(manager) = manager_guard.as_ref() {
        Ok(manager.should_upscale_image(width, height))
    } else {
        Err("设置管理器未初始化".to_string())
    }
}

/// 获取预加载页数设置
#[command]
pub async fn get_preload_pages(state: State<'_, UpscaleSettingsState>) -> Result<u32, String> {
    let manager_guard = state
        .manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    if let Some(manager) = manager_guard.as_ref() {
        let settings = manager.load_settings();
        Ok(settings.preload_pages)
    } else {
        Err("设置管理器未初始化".to_string())
    }
}

/// 设置预加载页数
#[command]
pub async fn set_preload_pages(
    pages: u32,
    state: State<'_, UpscaleSettingsState>,
) -> Result<(), String> {
    let manager_guard = state
        .manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    if let Some(manager) = manager_guard.as_ref() {
        let mut settings = manager.load_settings();
        settings.preload_pages = pages;
        manager.save_settings(&settings)
    } else {
        Err("设置管理器未初始化".to_string())
    }
}

/// 获取条件超分设置
#[command]
pub async fn get_conditional_upscale_settings(
    state: State<'_, UpscaleSettingsState>,
) -> Result<crate::core::upscale_settings::ConditionalUpscaleSettings, String> {
    let manager_guard = state
        .manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    if let Some(manager) = manager_guard.as_ref() {
        let settings = manager.load_settings();
        Ok(settings.conditional_upscale)
    } else {
        Err("设置管理器未初始化".to_string())
    }
}

/// 更新条件超分设置
#[command]
pub async fn update_conditional_upscale_settings(
    conditional_settings: crate::core::upscale_settings::ConditionalUpscaleSettings,
    state: State<'_, UpscaleSettingsState>,
) -> Result<(), String> {
    let manager_guard = state
        .manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    if let Some(manager) = manager_guard.as_ref() {
        let mut settings = manager.load_settings();
        settings.conditional_upscale = conditional_settings;
        manager.save_settings(&settings)
    } else {
        Err("设置管理器未初始化".to_string())
    }
}

/// 获取全局超分开关状态
#[command]
pub async fn get_global_upscale_enabled(
    state: State<'_, UpscaleSettingsState>,
) -> Result<bool, String> {
    let manager_guard = state
        .manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    if let Some(manager) = manager_guard.as_ref() {
        let settings = manager.load_settings();
        Ok(settings.global_upscale_enabled)
    } else {
        Err("设置管理器未初始化".to_string())
    }
}

/// 设置全局超分开关
#[command]
pub async fn set_global_upscale_enabled(
    enabled: bool,
    state: State<'_, UpscaleSettingsState>,
) -> Result<(), String> {
    let manager_guard = state
        .manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    if let Some(manager) = manager_guard.as_ref() {
        let mut settings = manager.load_settings();
        settings.global_upscale_enabled = enabled;
        manager.save_settings(&settings)
    } else {
        Err("设置管理器未初始化".to_string())
    }
}

/// 获取设置文件路径
#[command]
pub async fn get_upscale_settings_path(
    state: State<'_, UpscaleSettingsState>,
) -> Result<String, String> {
    let manager_guard = state
        .manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    if let Some(manager) = manager_guard.as_ref() {
        Ok(manager.get_settings_path().to_string_lossy().to_string())
    } else {
        Err("设置管理器未初始化".to_string())
    }
}

/// 获取对比模式设置
#[command]
pub async fn get_comparison_settings(
    state: State<'_, UpscaleSettingsState>,
) -> Result<crate::core::upscale_settings::ComparisonSettings, String> {
    let manager_guard = state
        .manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    if let Some(manager) = manager_guard.as_ref() {
        let settings = manager.load_settings();
        Ok(settings.comparison)
    } else {
        Err("设置管理器未初始化".to_string())
    }
}

/// 更新对比模式设置
#[command]
pub async fn update_comparison_settings(
    comparison_settings: crate::core::upscale_settings::ComparisonSettings,
    state: State<'_, UpscaleSettingsState>,
) -> Result<(), String> {
    let manager_guard = state
        .manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    if let Some(manager) = manager_guard.as_ref() {
        let mut settings = manager.load_settings();
        settings.comparison = comparison_settings;
        manager.save_settings(&settings)
    } else {
        Err("设置管理器未初始化".to_string())
    }
}

/// 切换对比模式开关
#[command]
pub async fn toggle_comparison_mode(
    state: State<'_, UpscaleSettingsState>,
) -> Result<bool, String> {
    let manager_guard = state
        .manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    if let Some(manager) = manager_guard.as_ref() {
        let mut settings = manager.load_settings();
        settings.comparison.enabled = !settings.comparison.enabled;
        let enabled = settings.comparison.enabled;
        manager.save_settings(&settings)?;
        Ok(enabled)
    } else {
        Err("设置管理器未初始化".to_string())
    }
}

/// 设置对比模式类型
#[command]
pub async fn set_comparison_mode(
    mode: String,
    state: State<'_, UpscaleSettingsState>,
) -> Result<(), String> {
    let manager_guard = state
        .manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    if let Some(manager) = manager_guard.as_ref() {
        let mut settings = manager.load_settings();
        settings.comparison.mode = match mode.as_str() {
            "slider" => crate::core::upscale_settings::ComparisonMode::Slider,
            "split_screen" => crate::core::upscale_settings::ComparisonMode::SplitScreen,
            _ => return Err("无效的对比模式类型".to_string()),
        };
        manager.save_settings(&settings)
    } else {
        Err("设置管理器未初始化".to_string())
    }
}
