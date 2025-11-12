//! NeoView - Upscale Settings Store
//! 超分设置持久化存储

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use tauri::{AppHandle, Manager};

/// Real-CUGAN 算法设置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RealCuganSettings {
    /// 模型路径
    pub model: String,
    /// 放大倍数
    pub scale: String,
    /// 噪声等级
    pub noise_level: String,
    /// Tile Size
    pub tile_size: String,
    /// Sync Gap Mode
    pub syncgap_mode: String,
    /// GPU ID
    pub gpu_id: String,
    /// 线程数
    pub threads: String,
    /// TTA 模式
    pub tta: bool,
    /// 输出格式
    pub format: String,
}

/// Real-ESRGAN 算法设置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RealesrganSettings {
    /// 模型名称
    pub model: String,
    /// 放大倍数
    pub scale: String,
    /// Tile Size
    pub tile_size: String,
    /// GPU ID
    pub gpu_id: String,
    /// 线程数
    pub threads: String,
    /// TTA 模式
    pub tta: bool,
    /// 输出格式
    pub format: String,
}

/// Waifu2x 算法设置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Waifu2xSettings {
    /// 模型路径
    pub model: String,
    /// 噪声等级
    pub noise_level: String,
    /// 放大倍数
    pub scale: String,
    /// Tile Size
    pub tile_size: String,
    /// GPU ID
    pub gpu_id: String,
    /// 线程数
    pub threads: String,
}

/// 超分设置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpscaleSettings {
    /// 当前选中的算法
    pub active_algorithm: String,
    /// Real-CUGAN 设置
    pub realcugan: RealCuganSettings,
    /// Real-ESRGAN 设置
    pub realesrgan: RealesrganSettings,
    /// Waifu2x 设置
    pub waifu2x: Waifu2xSettings,
    /// 预加载页数
    pub preload_pages: u32,
    /// 条件超分设置
    pub conditional_upscale: ConditionalUpscaleSettings,
    /// 全局超分开关
    pub global_upscale_enabled: bool,
}

/// 条件超分设置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConditionalUpscaleSettings {
    /// 是否启用条件超分
    pub enabled: bool,
    /// 最小宽度
    pub min_width: u32,
    /// 最小高度
    pub min_height: u32,
    /// 最大宽度（0表示无限制）
    pub max_width: u32,
    /// 最大高度（0表示无限制）
    pub max_height: u32,
    /// 宽高比条件（可选）
    pub aspect_ratio_condition: Option<AspectRatioCondition>,
}

/// 宽高比条件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AspectRatioCondition {
    /// 最小宽高比
    pub min_ratio: f32,
    /// 最大宽高比
    pub max_ratio: f32,
}

impl Default for UpscaleSettings {
    fn default() -> Self {
        Self {
            active_algorithm: "realcugan".to_string(),
            realcugan: RealCuganSettings::default(),
            realesrgan: RealesrganSettings::default(),
            waifu2x: Waifu2xSettings::default(),
            preload_pages: 3,
            conditional_upscale: ConditionalUpscaleSettings::default(),
            global_upscale_enabled: true,
        }
    }
}

impl Default for RealCuganSettings {
    fn default() -> Self {
        Self {
            model: "models-se".to_string(),
            scale: "2".to_string(),
            noise_level: "-1".to_string(),
            tile_size: "0".to_string(),
            syncgap_mode: "3".to_string(),
            gpu_id: "auto".to_string(),
            threads: "1:2:2".to_string(),
            tta: false,
            format: "png".to_string(),
        }
    }
}

impl Default for RealesrganSettings {
    fn default() -> Self {
        Self {
            model: "realesr-animevideov3".to_string(),
            scale: "4".to_string(),
            tile_size: "0".to_string(),
            gpu_id: "auto".to_string(),
            threads: "1:2:2".to_string(),
            tta: false,
            format: "png".to_string(),
        }
    }
}

impl Default for Waifu2xSettings {
    fn default() -> Self {
        Self {
            model: "models-cunet".to_string(),
            noise_level: "0".to_string(),
            scale: "2".to_string(),
            tile_size: "400".to_string(),
            gpu_id: "0".to_string(),
            threads: "1:2:2".to_string(),
        }
    }
}

impl Default for ConditionalUpscaleSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            min_width: 0,
            min_height: 0,
            max_width: 0,
            max_height: 0,
            aspect_ratio_condition: None,
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
    
    /// 检查图片是否满足超分要求
    pub fn should_upscale_image(&self, width: u32, height: u32) -> bool {
        let settings = self.load_settings();
        
        // 首先检查全局开关
        if !settings.global_upscale_enabled {
            return false;
        }
        
        let condition = &settings.conditional_upscale;
        
        // 如果未启用条件超分，直接返回 true
        if !condition.enabled {
            return true;
        }
        
        // 检查最小宽度
        if condition.min_width > 0 && width < condition.min_width {
            return false;
        }
        
        // 检查最小高度
        if condition.min_height > 0 && height < condition.min_height {
            return false;
        }
        
        // 检查最大宽度
        if condition.max_width > 0 && width > condition.max_width {
            return false;
        }
        
        // 检查最大高度
        if condition.max_height > 0 && height > condition.max_height {
            return false;
        }
        
        // 检查宽高比条件
        if let Some(ratio_condition) = &condition.aspect_ratio_condition {
            let ratio = width as f32 / height as f32;
            if ratio < ratio_condition.min_ratio || ratio > ratio_condition.max_ratio {
                return false;
            }
        }
        
        true
    }
}

impl ConditionalUpscaleSettings {
    /// 检查图片尺寸是否满足条件
    pub fn check_dimensions(&self, width: u32, height: u32) -> bool {
        // 检查最小宽度
        if self.min_width > 0 && width < self.min_width {
            return false;
        }
        
        // 检查最小高度
        if self.min_height > 0 && height < self.min_height {
            return false;
        }
        
        // 检查最大宽度
        if self.max_width > 0 && width > self.max_width {
            return false;
        }
        
        // 检查最大高度
        if self.max_height > 0 && height > self.max_height {
            return false;
        }
        
        true
    }
    
    /// 检查宽高比是否满足条件
    pub fn check_aspect_ratio(&self, width: u32, height: u32) -> bool {
        if let Some(ratio_condition) = &self.aspect_ratio_condition {
            let ratio = width as f32 / height as f32;
            ratio >= ratio_condition.min_ratio && ratio <= ratio_condition.max_ratio
        } else {
            true // 没有宽高比条件时总是通过
        }
    }
    
    /// 完整的图片条件检查
    pub fn check_image(&self, width: u32, height: u32) -> bool {
        self.check_dimensions(width, height) && self.check_aspect_ratio(width, height)
    }
}