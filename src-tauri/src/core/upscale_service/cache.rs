//! 超分服务缓存管理模块
//! 
//! 包含缓存键生成、缓存路径、缓存验证、缓存清理等功能

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use crate::core::pyo3_upscaler::UpscaleModel;
use super::types::CacheEntry;
use super::{log_info, log_debug};

/// 生成缓存键（与 file_proxy.rs 一致）
pub fn cache_key(book_path: &str, image_path: &str) -> String {
    format!("{}:{}", book_path, image_path)
}

/// 生成缓存文件路径
pub fn get_cache_path(cache_dir: &Path, book_path: &str, image_path: &str, model: &UpscaleModel) -> PathBuf {
    let key = cache_key(book_path, image_path);
    let hash = format!("{:x}", md5::compute(key.as_bytes()));
    let filename = format!("{}_sr[{}].webp", hash, model.model_name);
    cache_dir.join(filename)
}

/// 检查缓存是否存在且有效（使用 WIC 验证）
pub fn check_cache(cache_dir: &Path, book_path: &str, image_path: &str, model: &UpscaleModel) -> Option<PathBuf> {
    let path = get_cache_path(cache_dir, book_path, image_path, model);
    if !path.exists() {
        return None;
    }
    
    // 验证缓存文件是否有效
    match validate_cache_file(&path) {
        Ok(true) => {
            log_info!("✅ 缓存有效: {}", path.display());
            Some(path)
        }
        Ok(false) => {
            log_info!("⚠️ 缓存文件损坏，将删除: {}", path.display());
            let _ = std::fs::remove_file(&path);
            None
        }
        Err(e) => {
            log_info!("⚠️ 缓存验证失败: {} - {}", path.display(), e);
            None
        }
    }
}

/// 验证缓存文件是否有效（使用 WIC 解码测试）
#[cfg(target_os = "windows")]
pub fn validate_cache_file(path: &PathBuf) -> Result<bool, String> {
    use crate::core::wic_decoder::decode_image_from_memory_with_wic;
    
    // 读取文件
    let data = std::fs::read(path)
        .map_err(|e| format!("读取缓存文件失败: {}", e))?;
    
    if data.is_empty() {
        return Ok(false);
    }
    
    // 尝试用 WIC 解码验证
    match decode_image_from_memory_with_wic(&data) {
        Ok(result) => {
            // 检查解码结果是否合理
            if result.width > 0 && result.height > 0 && !result.pixels.is_empty() {
                log_debug!("📏 缓存验证成功: {}x{}", result.width, result.height);
                Ok(true)
            } else {
                Ok(false)
            }
        }
        Err(_) => Ok(false),
    }
}

/// 验证缓存文件是否有效（非 Windows 平台使用 image crate）
#[cfg(not(target_os = "windows"))]
pub fn validate_cache_file(path: &PathBuf) -> Result<bool, String> {
    use image::ImageReader;
    
    match ImageReader::open(path) {
        Ok(reader) => {
            match reader.decode() {
                Ok(img) => Ok(img.width() > 0 && img.height() > 0),
                Err(_) => Ok(false),
            }
        }
        Err(_) => Ok(false),
    }
}

/// 清除缓存
pub fn clear_cache(cache_map: &RwLock<HashMap<(String, usize), CacheEntry>>, book_path: Option<&str>) {
    if let Ok(mut cache) = cache_map.write() {
        if let Some(path) = book_path {
            // 清除指定书籍的缓存映射
            let keys_to_remove: Vec<_> = cache
                .keys()
                .filter(|(bp, _)| bp == path)
                .cloned()
                .collect();
            for key in keys_to_remove {
                cache.remove(&key);
            }
            log_info!("🧹 清除书籍缓存: {}", path);
        } else {
            cache.clear();
            log_info!("🧹 清除所有缓存映射");
        }
    }
    // 注意：这里不删除实际的缓存文件，只清除映射
    // 如果需要删除文件，可以遍历 cache_dir
}
