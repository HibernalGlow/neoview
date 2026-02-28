// 缓存管理模块
// 包含图片缓存、压缩包缓存的管理操作

use super::types::{CachedImageEntry, IMAGE_CACHE_LIMIT};
use super::utils::{normalize_archive_key, StreamReader};
use super::zip_handler::{self, ZipArchiveCache};
use super::image_ops;
use crate::core::archive_index::ArchiveIndexCache;
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::thread;

/// 图片缓存类型
pub type ImageCache = Arc<Mutex<HashMap<String, CachedImageEntry>>>;

/// 清除所有缓存
pub fn clear_cache(
    image_cache: &ImageCache,
    archive_cache: &ZipArchiveCache,
) {
    if let Ok(mut cache) = image_cache.lock() {
        cache.clear();
    }
    if let Ok(mut archive_cache) = archive_cache.lock() {
        archive_cache.clear();
    }
}

/// 限制缓存大小（保留最近使用的项）
pub fn limit_cache_size(
    image_cache: &ImageCache,
    archive_cache: &ZipArchiveCache,
    max_items: usize,
) {
    // 限制图片缓存
    if let Ok(mut cache) = image_cache.lock() {
        if cache.len() > max_items {
            // 简单策略：移除一半的条目
            let keys_to_remove: Vec<_> = cache.keys().take(cache.len() / 2).cloned().collect();
            for key in keys_to_remove {
                cache.remove(&key);
            }
        }
    }

    // 限制压缩包缓存
    if let Ok(mut archive_cache) = archive_cache.lock() {
        if archive_cache.len() > 5 {
            // 压缩包实例通常较大，限制更严格
            let keys_to_remove: Vec<_> = archive_cache
                .keys()
                .take(archive_cache.len() / 2)
                .cloned()
                .collect();
            for key in keys_to_remove {
                archive_cache.remove(&key);
            }
        }
    }
}

/// 预加载压缩包中的所有图片（支持 ZIP/RAR/7z）
pub fn preload_all_images(
    archive_cache: &ZipArchiveCache,
    index_cache: &Arc<ArchiveIndexCache>,
    image_cache: &ImageCache,
    archive_path: &Path,
) -> Result<usize, String> {
    let entries = image_ops::list_contents(archive_path)?;
    let image_entries: Vec<_> = entries.iter().filter(|e| e.is_image).collect();

    let mut loaded_count = 0;
    for entry in image_entries {
        if image_ops::load_image_from_archive_binary(
            archive_cache,
            index_cache,
            image_cache,
            archive_path,
            &entry.path,
        ).is_ok()
        {
            loaded_count += 1;
        }
    }

    Ok(loaded_count)
}

/// 从 ZIP 压缩包中流式提取文件
pub fn extract_file_stream(
    archive_cache: &ZipArchiveCache,
    archive_path: &Path,
    file_path: &str,
) -> Result<impl Read + Send, String> {
    // 获取缓存的压缩包实例
    let cached_archive = zip_handler::get_cached_archive(archive_cache, archive_path)?;
    let _archive_path = archive_path.to_path_buf();
    let file_path = file_path.to_string();

    // 创建通道用于流式传输
    let (tx, rx) = std::sync::mpsc::channel::<Result<Vec<u8>, String>>();

    // 在新线程中处理读取
    thread::spawn(move || {
        let archive_result = {
            let mut archive = cached_archive.lock().unwrap();
            archive.by_name(&file_path).map(|zip_file| {
                // 将 ZipFile 的数据复制到 Vec<u8> 中
                let mut data = Vec::new();
                let mut zip_file = zip_file;
                std::io::copy(&mut zip_file, &mut data).map(|_| data)
            })
        };

        match archive_result {
            Ok(Ok(data)) => {
                // 分块发送数据
                let mut pos = 0;
                while pos < data.len() {
                    let chunk_size = std::cmp::min(64 * 1024, data.len() - pos);
                    let chunk = data[pos..pos + chunk_size].to_vec();
                    if tx.send(Ok(chunk)).is_err() {
                        break; // 接收端已关闭
                    }
                    pos += chunk_size;
                }
            }
            Ok(Err(e)) => {
                let _ = tx.send(Err(format!("读取失败: {}", e)));
            }
            Err(e) => {
                let _ = tx.send(Err(format!("找不到文件: {}", e)));
            }
        }
    });

    // 返回一个实现 Read 的迭代器
    Ok(StreamReader::new(rx))
}

/// 获取缓存的图片
pub fn get_cached_image(cache: &ImageCache, key: &str) -> Option<Vec<u8>> {
    if let Ok(mut cache) = cache.lock() {
        if let Some(entry) = cache.get_mut(key) {
            entry.last_used = std::time::Instant::now();
            return Some(entry.data.as_ref().to_vec());
        }
    }
    None
}

/// 存储图片到缓存
pub fn store_cached_image(cache: &ImageCache, key: String, data: Vec<u8>) {
    if let Ok(mut cache) = cache.lock() {
        cache.insert(
            key,
            CachedImageEntry {
                data: Arc::<[u8]>::from(data),
                last_used: std::time::Instant::now(),
            },
        );
        if cache.len() > IMAGE_CACHE_LIMIT {
            if let Some(oldest_key) = cache
                .iter()
                .min_by_key(|(_, entry)| entry.last_used)
                .map(|(k, _)| k.clone())
            {
                cache.remove(&oldest_key);
            }
        }
    }
}

/// 清除指定压缩包的所有相关缓存
pub fn evict_archive_cache(
    image_cache: &ImageCache,
    archive_cache: &ZipArchiveCache,
    archive_path: &Path,
) {
    let key = normalize_archive_key(archive_path);
    
    // 清除 ZIP 缓存
    if let Ok(mut cache) = archive_cache.lock() {
        cache.remove(&key);
    }

    // 清除相关的图片缓存
    if let Ok(mut cache) = image_cache.lock() {
        cache.retain(|entry_key, _| !entry_key.starts_with(&format!("{}::", key)));
    }
}
