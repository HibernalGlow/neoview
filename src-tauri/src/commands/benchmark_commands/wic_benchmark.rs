//! WIC + LZ4 基准测试命令
//! 包含 WIC 解码和 LZ4 压缩传输测试的 Tauri 命令

use std::collections::HashMap;
use std::sync::Mutex;
use once_cell::sync::Lazy;
use tauri::command;

use super::types::WicLz4Result;

/// WIC + LZ4 缓存
pub static WIC_LZ4_CACHE: Lazy<Mutex<HashMap<String, WicLz4Result>>> = Lazy::new(|| {
    Mutex::new(HashMap::new())
});

/// 使用 WIC 读取图片为 BGRA bitmap，然后 LZ4 压缩传输
/// 用于测试 bitmap + 压缩传输 vs 原始编码格式的性能对比
#[command]
pub async fn load_image_wic_lz4(
    archive_path: String,
    file_path: String,
) -> Result<WicLz4Result, String> {
    use std::time::Instant;
    use std::path::Path;
    use crate::core::archive::ArchiveManager;
    
    let total_start = Instant::now();
    
    // 1. 从压缩包提取图片数据
    let manager = ArchiveManager::new();
    let image_data = manager.extract_file(Path::new(&archive_path), &file_path)
        .map_err(|e| format!("提取图片失败: {}", e))?;
    
    // 2. 使用 WIC 解码为 BGRA bitmap
    #[cfg(target_os = "windows")]
    {
        use crate::core::wic_decoder::decode_image_from_memory_with_wic;
        
        let wic_start = Instant::now();
        let wic_result = decode_image_from_memory_with_wic(&image_data)?;
        let wic_decode_ms = wic_start.elapsed().as_secs_f64() * 1000.0;
        
        let original_size = wic_result.pixels.len();
        
        // 3. LZ4 压缩
        let lz4_start = Instant::now();
        let compressed = lz4_flex::compress_prepend_size(&wic_result.pixels);
        let lz4_compress_ms = lz4_start.elapsed().as_secs_f64() * 1000.0;
        
        let compressed_size = compressed.len();
        let compression_ratio = if original_size > 0 {
            compressed_size as f64 / original_size as f64
        } else {
            1.0
        };
        
        let total_ms = total_start.elapsed().as_secs_f64() * 1000.0;
        
        Ok(WicLz4Result {
            width: wic_result.width,
            height: wic_result.height,
            original_size,
            compressed_size,
            compression_ratio,
            wic_decode_ms,
            lz4_compress_ms,
            total_ms,
            success: true,
            error: None,
            compressed_data: compressed,
        })
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        Err("WIC 仅在 Windows 上可用".to_string())
    }
}

/// 带缓存的 WIC + LZ4 加载
#[command]
pub async fn load_image_wic_lz4_cached(
    archive_path: String,
    file_path: String,
) -> Result<WicLz4Result, String> {
    let cache_key = format!("{}::{}", archive_path, file_path);
    
    // 检查缓存
    {
        let cache = WIC_LZ4_CACHE.lock().map_err(|e| format!("缓存锁失败: {}", e))?;
        if let Some(cached) = cache.get(&cache_key) {
            return Ok(cached.clone());
        }
    }
    
    // 未命中，加载并缓存
    let result = load_image_wic_lz4(archive_path, file_path).await?;
    
    {
        let mut cache = WIC_LZ4_CACHE.lock().map_err(|e| format!("缓存锁失败: {}", e))?;
        // 限制缓存大小
        if cache.len() >= 50 {
            cache.clear();
        }
        cache.insert(cache_key, result.clone());
    }
    
    Ok(result)
}

/// 清除 WIC + LZ4 缓存
#[command]
pub async fn clear_wic_lz4_cache() -> Result<(), String> {
    let mut cache = WIC_LZ4_CACHE.lock().map_err(|e| format!("缓存锁失败: {}", e))?;
    cache.clear();
    Ok(())
}
