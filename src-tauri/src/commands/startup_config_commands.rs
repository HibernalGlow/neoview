//! 启动配置命令
//! 用于读取和保存启动配置

use crate::core::startup_config::{get_config_path, StartupConfig};
use tauri::{command, AppHandle, Manager};

/// 获取启动配置
#[command]
pub async fn get_startup_config(app: AppHandle) -> Result<StartupConfig, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    
    let config_path = get_config_path(&app_data_dir);
    Ok(StartupConfig::load(&config_path))
}

/// 保存启动配置
#[command]
pub async fn save_startup_config(
    app: AppHandle,
    config: StartupConfig,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    
    let config_path = get_config_path(&app_data_dir);
    config.save(&config_path)
}

/// 更新启动配置的单个字段
#[command]
pub async fn update_startup_config_field(
    app: AppHandle,
    field: String,
    value: Option<String>,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    
    let config_path = get_config_path(&app_data_dir);
    let mut config = StartupConfig::load(&config_path);
    
    match field.as_str() {
        "cacheDir" => config.cache_dir = value,
        "cacheUpscaleDir" => config.cache_upscale_dir = value,
        "pythonModulePath" => config.python_module_path = value,
        _ => return Err(format!("未知的配置字段: {}", field)),
    }
    
    config.save(&config_path)
}
