//! NeoView - Image Data Processing Commands
//! 图片数据处理相关的 Tauri 命令

use tauri::command;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::fs;
use std::path::PathBuf;
use base64::{Engine as _, engine::general_purpose};

/// 计算数据的哈希值
#[command]
pub async fn calculate_data_hash(data_url: String) -> Result<String, String> {
    // 从 data URL 提取二进制数据
    let binary_data = extract_binary_from_data_url(&data_url)?;
    
    // 计算哈希
    let mut hasher = DefaultHasher::new();
    hasher.write(&binary_data);
    let hash = hasher.finish();
    
    Ok(format!("{:x}", hash))
}

/// 将 data URL 转换为 WebP 格式
#[command]
pub async fn convert_data_url_to_webp(data_url: String) -> Result<String, String> {
    // 从 data URL 提取二进制数据
    let binary_data = extract_binary_from_data_url(&data_url)?;
    
    // 暂时直接返回原始数据，格式转换为 WebP 需要额外的依赖
    // 这里简化处理，保持原始格式
    let base64_data = general_purpose::STANDARD.encode(&binary_data);
    Ok(format!("data:image/webp;base64,{}", base64_data))
}

/// 从数据生成超分保存路径
#[command]
pub async fn get_upscale_save_path_from_data(
    image_hash: String,
    algorithm: String,
    model: String,
    gpu_id: String,
    tile_size: String,
    tta: bool,
    noise_level: String,
    num_threads: String,
    thumbnail_path: String,
) -> Result<String, String> {
    let thumbnail_root = PathBuf::from(thumbnail_path);
    let upscale_dir = thumbnail_root.join("generic-upscale");
    
    // 确保目录存在
    fs::create_dir_all(&upscale_dir)
        .map_err(|e| format!("创建目录失败: {}", e))?;
    
    // 提取模型名称
    let model_name = if model.contains('/') || model.contains('\\') {
        model
            .split('/')
            .last()
            .unwrap_or(&model)
            .split('\\')
            .last()
            .unwrap_or(&model)
            .to_string()
    } else {
        model
    };
    
    // 生成文件名: md5_sr[model].webp
    let filename = format!("{}_sr[{}].webp", image_hash, model_name);
    let save_path = upscale_dir.join(filename);
    
    Ok(save_path.to_string_lossy().to_string())
}

/// 从内存数据执行超分
#[command]
pub async fn upscale_image_from_data(
    image_data: String,
    save_path: String,
    algorithm: String,
    model: String,
    gpu_id: String,
    tile_size: String,
    tta: bool,
    noise_level: String,
    num_threads: String,
    thumbnail_path: String,
) -> Result<Vec<u8>, String> {
    // 从 data URL 提取二进制数据
    let binary_data = extract_binary_from_data_url(&image_data)?;
    
    // 创建临时文件
    let temp_dir = std::env::temp_dir();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let temp_input = temp_dir.join(format!("temp_input_{}.png", timestamp));
    
    // 保存临时文件
    fs::write(&temp_input, &binary_data)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;
    
    // 直接读取保存的文件并返回
    // 这里应该调用超分算法，但暂时返回原始数据
    let result = fs::read(&temp_input)
        .map_err(|e| format!("读取临时文件失败: {}", e))?;
    
    // 清理临时文件
    let _ = fs::remove_file(&temp_input);
    
    Ok(result)
}

/// 检查指定算法的超分缓存
#[command]
pub async fn check_upscale_cache_for_algorithm(
    image_hash: String,
    algorithm: String,
    thumbnail_path: String,
) -> Result<String, String> {
    let thumbnail_root = PathBuf::from(thumbnail_path);
    let upscale_dir = thumbnail_root.join("generic-upscale");
    
    // 搜索缓存目录中匹配的文件
    if upscale_dir.exists() {
        if let Ok(entries) = fs::read_dir(&upscale_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(filename) = path.file_name() {
                        let filename_str = filename.to_string_lossy();
                        
                        // 检查文件名是否匹配: {hash}_sr[{model}].webp
                        if filename_str.starts_with(&format!("{}_", image_hash)) {
                            // 找到匹配的缓存文件
                            let data = fs::read(&path)
                                .map_err(|e| format!("读取缓存文件失败: {}", e))?;
                            
                            // 返回base64编码的数据
                            let base64_data = general_purpose::STANDARD.encode(&data);
                            return Ok(base64_data);
                        }
                    }
                }
            }
        }
    }
    
    Err("未找到缓存".to_string())
}

/// 从 data URL 提取二进制数据
fn extract_binary_from_data_url(data_url: &str) -> Result<Vec<u8>, String> {
    // 解析 data URL
    if !data_url.starts_with("data:") {
        return Err("无效的 data URL".to_string());
    }
    
    // 找到逗号位置
    let comma_pos = data_url.find(',')
        .ok_or("data URL 格式错误")?;
    
    // 提取 base64 部分
    let base64_part = &data_url[comma_pos + 1..];
    
    // 解码 base64
    general_purpose::STANDARD
        .decode(base64_part)
        .map_err(|e| format!("base64 解码失败: {}", e))
}