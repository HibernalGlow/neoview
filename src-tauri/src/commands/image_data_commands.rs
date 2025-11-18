//! NeoView - Image Data Processing Commands
//! 图片数据处理相关的 Tauri 命令

use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::command;

/// 缓存元数据结构
#[derive(Debug, Serialize)]
pub struct CacheMeta {
    pub path: String,
    pub mtime: u64,
    pub size: u64,
    pub algorithm: String,
}

/// 计算字节数组的MD5哈希值
#[command]
pub async fn calculate_blob_md5(bytes: Vec<u8>) -> Result<String, String> {
    use md5;

    // 计算MD5
    let digest = md5::compute(&bytes);

    Ok(format!("{:x}", digest))
}

/// 计算基于路径的哈希（使用缩略图统一算法）
/// @deprecated 建议直接使用 Page.stableHash
#[command]
pub async fn calculate_path_hash(path: String) -> Result<String, String> {
    use sha1::{Digest, Sha1};
    use std::path::Path;

    // 规范化路径（统一使用正斜杠）
    let normalized_path = Path::new(&path).to_string_lossy().replace('\\', "/");

    // 计算 SHA1 哈希
    let mut hasher = Sha1::new();
    hasher.update(normalized_path.as_bytes());
    let hash = hex::encode(hasher.finalize());

    Ok(hash)
}

/// 检查超分缓存（包装函数，为前端提供简化接口）
#[command]
pub async fn check_upscale_cache(
    image_hash: String,
    thumbnail_path: String,
    max_age_seconds: i64,
) -> Result<CacheMeta, String> {
    // 调用现有的实现，使用固定的算法名称
    check_upscale_cache_for_algorithm(
        image_hash,
        "generic".to_string(), // 固定算法名
        thumbnail_path,
        Some(max_age_seconds as u64),
    )
    .await
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
                if parts.len() < 4 {
                    continue;
                }
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
                                    if let Ok(elapsed) =
                                        std::time::SystemTime::now().duration_since(modified)
                                    {
                                        if elapsed.as_secs() > max_age {
                                            // 过期，跳过此索引项并继续查找（不要中断整个索引遍历）
                                            continue;
                                        }
                                    }
                                }
                            }
                        }
                        let size = fs::metadata(&path_buf).map(|m| m.len()).unwrap_or(0);
                        return Ok(CacheMeta {
                            path: path_buf.to_string_lossy().to_string(),
                            mtime,
                            size,
                            algorithm: alg.to_string(),
                        });
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
                                        if let Ok(elapsed) =
                                            std::time::SystemTime::now().duration_since(modified)
                                        {
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
                                let mtime = metadata
                                    .modified()
                                    .ok()
                                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                    .map(|d| d.as_secs())
                                    .unwrap_or(0);
                                let size = metadata.len();
                                new_index.insert(
                                    image_hash.clone(),
                                    (path.to_string_lossy().to_string(), mtime, algorithm.clone()),
                                );
                                return Ok(CacheMeta {
                                    path: path.to_string_lossy().to_string(),
                                    mtime,
                                    size,
                                    algorithm: algorithm.clone(),
                                });
                            }
                        } else {
                            // 也把其他文件加入索引候选（简单策略）
                            if let Some(pos) = filename_str.find("_") {
                                let key = &filename_str[..pos];
                                if let Ok(metadata) = fs::metadata(&path) {
                                    let mtime = metadata
                                        .modified()
                                        .ok()
                                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                        .map(|d| d.as_secs())
                                        .unwrap_or(0);
                                    new_index.insert(
                                        key.to_string(),
                                        (
                                            path.to_string_lossy().to_string(),
                                            mtime,
                                            algorithm.clone(),
                                        ),
                                    );
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

    fs::write(&file_path, data).map_err(|e| format!("保存文件失败: {}", e))?;

    Ok(())
}

/// 读取二进制文件并返回字节数组
#[command]
pub async fn read_binary_file(file_path: String) -> Result<Vec<u8>, String> {
    use std::fs;
    fs::read(&file_path).map_err(|e| format!("读取文件失败: {}", e))
}
