//! NeoView - Image Data Processing Commands
//! 图片数据处理相关的 Tauri 命令

use tauri::command;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::fs;
use std::path::PathBuf;
use base64::{Engine as _, engine::general_purpose};
use std::collections::HashMap;
use serde::Serialize;

/// 缓存元数据结构
#[derive(Debug, Serialize)]
pub struct CacheMeta {
    pub path: String,
    pub mtime: u64,
    pub size: u64,
    pub algorithm: String,
}

/// 计算数据的哈希值（使用MD5）
#[command]
pub async fn calculate_data_hash(data_url: String) -> Result<String, String> {
    use md5;
    
    // 从 data URL 提取二进制数据
    let binary_data = extract_binary_from_data_url(&data_url)?;
    
    // 计算MD5
    let digest = md5::compute(&binary_data);
    
    Ok(format!("{:x}", digest))
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
    use std::process::Command;
    
    // 从 data URL 提取二进制数据
    let binary_data = extract_binary_from_data_url(&image_data)?;
    
    // 创建临时文件
    let temp_dir = std::env::temp_dir();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let temp_input = temp_dir.join(format!("temp_input_{}.png", timestamp));
    let temp_output = temp_dir.join(format!("temp_output_{}.webp", timestamp));
    
    // 保存临时输入文件
    fs::write(&temp_input, &binary_data)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;
    
    // 确保输出目录存在
    let save_path_buf = std::path::PathBuf::from(&save_path);
    if let Some(parent) = save_path_buf.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建输出目录失败: {}", e))?;
    }
    
    // 构建命令
    let command = match algorithm.as_str() {
        "realcugan" => "realcugan-ncnn-vulkan",
        "realesrgan" => "realesrgan-ncnn-vulkan",
        "waifu2x" => "waifu2x-ncnn-vulkan",
        _ => return Err("不支持的算法".to_string()),
    };
    
    let mut cmd = Command::new(command);
    cmd.arg("-i").arg(&temp_input);
    cmd.arg("-o").arg(&temp_output);
    
    // 添加算法特定参数
    match algorithm.as_str() {
        "realcugan" => {
            cmd.arg("-n").arg(&noise_level);
            cmd.arg("-s").arg("2"); // Real-CUGAN 默认2x
            cmd.arg("-t").arg(&tile_size);
            cmd.arg("-m").arg(&model);
            cmd.arg("-g").arg(&gpu_id);
            cmd.arg("-j").arg(&num_threads);
            if tta { cmd.arg("-x"); }
        }
        "realesrgan" => {
            cmd.arg("-s").arg("4"); // Real-ESRGAN 默认4x
            cmd.arg("-t").arg(&tile_size);
            cmd.arg("-m").arg("models");
            cmd.arg("-n").arg(&model);
            cmd.arg("-g").arg(&gpu_id);
            cmd.arg("-j").arg(&num_threads);
            if tta { cmd.arg("-x"); }
        }
        "waifu2x" => {
            cmd.arg("-n").arg(&noise_level);
            cmd.arg("-s").arg("2"); // Waifu2x 默认2x
            cmd.arg("-t").arg(&tile_size);
            cmd.arg("-m").arg(&model);
            cmd.arg("-g").arg(&gpu_id);
            cmd.arg("-j").arg(&num_threads);
        }
        _ => {}
    }
    
    println!("执行超分命令: {:?}", cmd);
    
    // 执行命令
    let output = cmd.output()
        .map_err(|e| format!("执行超分命令失败: {}", e))?;
    
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        return Err(format!("超分命令执行失败: {}", error));
    }
    
    // 读取结果文件
    let result = fs::read(&temp_output)
        .map_err(|e| format!("读取超分结果失败: {}", e))?;
    
    // 只保存到最终路径如果 save_path 不为空
    if !save_path.is_empty() {
        fs::write(&save_path, &result)
            .map_err(|e| format!("保存超分结果失败: {}", e))?;
        println!("超分完成，结果保存到: {}", save_path);
    } else {
        println!("超分完成，结果直接返回内存（未保存）");
    }
    
    // 清理临时文件
    let _ = fs::remove_file(&temp_input);
    let _ = fs::remove_file(&temp_output);
    
    Ok(result)
}

/// 计算基于路径的哈希（MD5）
#[command]
pub async fn calculate_path_hash(path: String) -> Result<String, String> {
    use md5;

    let digest = md5::compute(path.as_bytes());
    Ok(format!("{:x}", digest))
}

/// 检查指定算法的超分缓存（支持可选的最大年龄过滤，单位秒）。
/// 返回匹配的缓存文件的完整路径（字符串），如果未找到则返回 Err。
#[command]
pub async fn check_upscale_cache_for_algorithm(
    image_hash: String,
    algorithm: String,
    thumbnail_path: String,
    max_age_seconds: Option<u64>,
) -> Result<CacheMeta, String> {
    let thumbnail_root = PathBuf::from(thumbnail_path);
    let upscale_dir = thumbnail_root.join("generic-upscale");

    // 索引文件（简单的文本格式：每行 hash|path|mtime|algorithm）
    let index_file = upscale_dir.join("index.txt");

    // 尝试从索引中快速查找
    if index_file.exists() {
        if let Ok(content) = fs::read_to_string(&index_file) {
            for line in content.lines() {
                let parts: Vec<&str> = line.splitn(4, '|').collect();
                if parts.len() < 4 { continue; }
                let h = parts[0];
                let p = parts[1];
                let mtime = parts[2].parse::<u64>().unwrap_or(0);
                let alg = parts[3];
                if h == image_hash {
                    let path_buf = PathBuf::from(p);
                    if path_buf.exists() {
                        // 检查TTL
                        if let Some(max_age) = max_age_seconds {
                            if let Ok(metadata) = fs::metadata(&path_buf) {
                                if let Ok(modified) = metadata.modified() {
                                    if let Ok(elapsed) = std::time::SystemTime::now().duration_since(modified) {
                                        if elapsed.as_secs() > max_age {
                                            // 过期，跳过此索引项并继续查找（不要中断整个索引遍历）
                                            continue;
                                        }
                                    }
                                }
                            }
                        }
                        let size = fs::metadata(&path_buf).map(|m| m.len()).unwrap_or(0);
                        return Ok(CacheMeta { path: path_buf.to_string_lossy().to_string(), mtime, size, algorithm: alg.to_string() });
                    }
                }
            }
        }
    }

    // 索引未命中或索引不可用时扫描目录并更新索引
    if upscale_dir.exists() {
        // map: hash -> (path, mtime, algorithm)
        let mut new_index: HashMap<String, (String, u64, String)> = HashMap::new();
        if let Ok(entries) = fs::read_dir(&upscale_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(filename) = path.file_name() {
                        let filename_str = filename.to_string_lossy();
                        if filename_str.starts_with(&format!("{}_", image_hash)) {
                            // 检查TTL
                            if let Some(max_age) = max_age_seconds {
                                if let Ok(metadata) = fs::metadata(&path) {
                                    if let Ok(modified) = metadata.modified() {
                                        if let Ok(elapsed) = std::time::SystemTime::now().duration_since(modified) {
                                            if elapsed.as_secs() > max_age {
                                                // 已过期，跳过此文件
                                                continue;
                                            }
                                        }
                                    }
                                }
                            }
                            // 找到匹配的缓存文件，记录到索引并返回 metadata
                            if let Ok(metadata) = fs::metadata(&path) {
                                let mtime = metadata.modified()
                                    .ok()
                                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                    .map(|d| d.as_secs()).unwrap_or(0);
                                let size = metadata.len();
                                new_index.insert(image_hash.clone(), (path.to_string_lossy().to_string(), mtime, algorithm.clone()));
                                return Ok(CacheMeta { path: path.to_string_lossy().to_string(), mtime, size, algorithm: algorithm.clone() });
                            }
                        } else {
                            // 也把其他文件加入索引候选（简单策略）
                            if let Some(pos) = filename_str.find("_") {
                                let key = &filename_str[..pos];
                                if let Ok(metadata) = fs::metadata(&path) {
                                    let mtime = metadata.modified()
                                        .ok()
                                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                        .map(|d| d.as_secs()).unwrap_or(0);
                                    new_index.insert(key.to_string(), (path.to_string_lossy().to_string(), mtime, algorithm.clone()));
                                }
                            }
                        }
                    }
                }
            }
        }

        // 写回索引文件（覆盖）
        if !new_index.is_empty() {
            let mut lines = Vec::new();
            for (k, (p, m, alg)) in new_index.iter() {
                lines.push(format!("{}|{}|{}|{}", k, p, m, alg));
            }
            let content = lines.join("\n");
            let _ = fs::write(&index_file, content);
        }
    }
    
    Err("未找到缓存".to_string())
}

/// 保存二进制文件
#[command]
pub async fn save_binary_file(file_path: String, data: Vec<u8>) -> Result<(), String> {
    use std::fs;
    
    fs::write(&file_path, data)
        .map_err(|e| format!("保存文件失败: {}", e))?;
    
    Ok(())
}

/// 读取二进制文件并返回字节数组
#[command]
pub async fn read_binary_file(file_path: String) -> Result<Vec<u8>, String> {
    use std::fs;
    fs::read(&file_path).map_err(|e| format!("读取文件失败: {}", e))
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