//! 启动配置模块
//! 用于存储和读取启动时需要的配置字段

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// 超分条件配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpscaleConditionConfig {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub priority: i32,
    pub min_width: u32,
    pub min_height: u32,
    pub max_width: u32,
    pub max_height: u32,
    pub model_name: String,
    pub scale: i32,
    pub tile_size: i32,
    pub noise_level: i32,
    pub skip: bool,
}

/// 启动配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StartupConfig {
    /// 缓存根目录（缩略图等）
    #[serde(default)]
    pub cache_dir: Option<String>,
    /// 超分缓存目录
    #[serde(default)]
    pub cache_upscale_dir: Option<String>,
    /// Python 模块路径
    #[serde(default)]
    pub python_module_path: Option<String>,
    /// 超分条件启用状态
    #[serde(default)]
    pub upscale_conditions_enabled: bool,
    /// 超分条件列表
    #[serde(default)]
    pub upscale_conditions: Vec<UpscaleConditionConfig>,
}

impl StartupConfig {
    /// 从 JSON 文件加载配置
    pub fn load(config_path: &Path) -> Self {
        if config_path.exists() {
            match fs::read_to_string(config_path) {
                Ok(content) => {
                    match serde_json::from_str(&content) {
                        Ok(config) => {
                            log::info!("📋 已加载启动配置: {}", config_path.display());
                            return config;
                        }
                        Err(e) => {
                            log::warn!("⚠️ 解析启动配置失败: {}", e);
                        }
                    }
                }
                Err(e) => {
                    log::warn!("⚠️ 读取启动配置失败: {}", e);
                }
            }
        }
        log::info!("📋 使用默认启动配置");
        Self::default()
    }

    /// 保存配置到 JSON 文件
    pub fn save(&self, config_path: &Path) -> Result<(), String> {
        // 确保目录存在
        if let Some(parent) = config_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("序列化配置失败: {}", e))?;
        
        fs::write(config_path, json)
            .map_err(|e| format!("写入配置文件失败: {}", e))?;
        
        log::info!("💾 启动配置已保存: {}", config_path.display());
        Ok(())
    }

    /// 获取超分缓存目录（优先使用 cache_upscale_dir，否则使用 cache_dir/pyo3-upscale）
    pub fn get_upscale_cache_dir(&self) -> Option<PathBuf> {
        if let Some(dir) = &self.cache_upscale_dir {
            if !dir.is_empty() {
                return Some(PathBuf::from(dir));
            }
        }
        
        if let Some(cache_dir) = &self.cache_dir {
            if !cache_dir.is_empty() {
                return Some(PathBuf::from(cache_dir).join("pyo3-upscale"));
            }
        }
        
        None
    }
}

/// 获取默认的配置文件路径
pub fn get_config_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("config.json")
}
