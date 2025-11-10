
use std::fs;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct PerformanceSettings {
    pub cache_memory_size: usize,         // MB
    pub preload_enabled: bool,           // whether to preload pages
    pub preload_size: usize,             // number of pages
    pub gpu_acceleration: bool,          // GPU rendering
    pub multi_threaded_rendering: bool,  // multi-threaded decoding
    pub decoding_threads: usize,         // number of threads for decoding
}

impl Default for PerformanceSettings {
    fn default() -> Self {
        Self {
            cache_memory_size: 512,
            preload_enabled: true,
            preload_size: 3,
            gpu_acceleration: true,
            multi_threaded_rendering: true,
            decoding_threads: 4,
        }
    }
}

#[tauri::command]
pub fn read(path: String) -> Result<String, String> {
    let data = fs::read(path).map_err(|e| e.to_string())?;
    String::from_utf8(data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write(path: String, contents: String) -> Result<(), String> {
    fs::write(path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_performance_settings() -> PerformanceSettings {
    // 尝试从配置文件读取设置
    if let Ok(config_dir) = std::env::var("APPDATA") {
        let config_path = std::path::Path::new(&config_dir)
            .join("NeoView")
            .join("performance.json");
        
        if let Ok(content) = std::fs::read_to_string(&config_path) {
            if let Ok(settings) = serde_json::from_str::<PerformanceSettings>(&content) {
                return settings;
            }
        }
    }
    
    // 如果没有配置文件，返回默认值
    PerformanceSettings::default()
}

#[tauri::command]
pub fn save_performance_settings(settings: PerformanceSettings) -> Result<(), String> {
    if let Ok(config_dir) = std::env::var("APPDATA") {
        let config_path = std::path::Path::new(&config_dir)
            .join("NeoView");
        
        // 确保目录存在
        if let Err(e) = std::fs::create_dir_all(&config_path) {
            return Err(format!("创建配置目录失败: {}", e));
        }
        
        let config_file = config_path.join("performance.json");
        let content = serde_json::to_string_pretty(&settings)
            .map_err(|e| format!("序列化设置失败: {}", e))?;
        if let Err(e) = std::fs::write(config_file, content) {
            return Err(format!("写入配置文件失败: {}", e));
        }
        
        Ok(())
    } else {
        Err("无法获取配置目录".to_string())
    }
}
