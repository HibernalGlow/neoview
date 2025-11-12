//! NeoView - Upscale Settings Store
//! 超分设置持久化存储

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use tauri::{AppHandle, Manager};

/// 超分设置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpscaleSettings {
    /// 选择的算法
    pub algorithm: String,
    /// 选择的模型
    pub model: String,
    /// 放大倍数
    pub scale_factor: String,
    /// GPU ID
    pub gpu_id: String,
    /// Tile Size
    pub tile_size: String,
    /// TTA 模式
    pub tta: bool,
    /// 噪声等级
    pub noise_level: String,
    /// 线程数
    pub num_threads: String,
}

impl Default for UpscaleSettings {
    fn default() -> Self {
        Self {
            algorithm: "realesrgan".to_string(),
            model: "realesrgan-x4plus".to_string(),
            scale_factor: "4".to_string(),
            gpu_id: "0".to_string(),
            tile_size: "0".to_string(),
            tta: false,
            noise_level: "1".to_string(),
            num_threads: "1".to_string(),
        }
    }
}

/// 超分设置管理器
pub struct UpscaleSettingsManager {
    app_handle: AppHandle,
    settings_file: PathBuf,
}

impl UpscaleSettingsManager {
    /// 创建新的设置管理器
    pub fn new(app_handle: AppHandle) -> Result<Self, String> {
        // 获取应用数据目录
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
        
        // 确保目录存在
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("创建应用数据目录失败: {}", e))?;
        
        let settings_file = app_data_dir.join("upscale_settings.json");
        
        Ok(Self {
            app_handle,
            settings_file,
        })
    }
    
    /// 读取设置
    pub fn load_settings(&self) -> UpscaleSettings {
        if self.settings_file.exists() {
            match fs::read_to_string(&self.settings_file) {
                Ok(content) => {
                    match serde_json::from_str::<UpscaleSettings>(&content) {
                        Ok(settings) => {
                            println!("✅ 成功加载超分设置");
                            settings
                        }
                        Err(e) => {
                            println!("⚠️ 解析超分设置失败，使用默认设置: {}", e);
                            UpscaleSettings::default()
                        }
                    }
                }
                Err(e) => {
                    println!("⚠️ 读取超分设置文件失败，使用默认设置: {}", e);
                    UpscaleSettings::default()
                }
            }
        } else {
            println!("📝 超分设置文件不存在，使用默认设置");
            UpscaleSettings::default()
        }
    }
    
    /// 保存设置
    pub fn save_settings(&self, settings: &UpscaleSettings) -> Result<(), String> {
        let content = serde_json::to_string_pretty(settings)
            .map_err(|e| format!("序列化设置失败: {}", e))?;
        
        fs::write(&self.settings_file, content)
            .map_err(|e| format!("写入设置文件失败: {}", e))?;
        
        println!("✅ 成功保存超分设置");
        Ok(())
    }
    
    /// 获取设置文件路径
    pub fn get_settings_path(&self) -> &PathBuf {
        &self.settings_file
    }
}