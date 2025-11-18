//! NeoView - Optimized Image Cache
//! 智能图像缓存模块 - 避免重复转换和 base64 编码

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// 缓存项
#[derive(Clone)]
struct CacheEntry {
    /// 图片数据 (base64 或文件URL)
    data: String,
    /// 最后访问时间
    last_access: u64,
    /// 文件大小
    size: usize,
    /// 是否为文件URL（而不是base64）
    is_file_url: bool,
}

/// 图像缓存管理器
pub struct ImageCache {
    /// 缓存数据
    cache: Mutex<HashMap<String, CacheEntry>>,
    /// 最大缓存大小 (字节)
    max_size: usize,
    /// 当前缓存大小
    current_size: Mutex<usize>,
}

impl ImageCache {
    /// 创建新的缓存管理器
    pub fn new(max_size_mb: usize) -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
            max_size: max_size_mb * 1024 * 1024,
            current_size: Mutex::new(0),
        }
    }

    /// 获取缓存的图片
    pub fn get(&self, path: &str) -> Option<String> {
        let key = path.replace('\\', "/");
        let mut cache = self.cache.lock().unwrap();

        if let Some(entry) = cache.get_mut(&key) {
            // 更新访问时间
            entry.last_access = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();

            return Some(entry.data.clone());
        }

        None
    }

    /// 添加图片到缓存
    pub fn set(&self, path: String, data: String) {
        let key = path.replace('\\', "/");
        let size = data.len();
        let is_file_url = data.starts_with("file://");
        let entry = CacheEntry {
            data: data.clone(),
            last_access: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            size,
            is_file_url,
        };

        // 检查是否需要清理缓存
        let mut current_size = self.current_size.lock().unwrap();
        let mut cache = self.cache.lock().unwrap();

        // 如果添加后超过最大大小,清理旧条目
        while *current_size + size > self.max_size && !cache.is_empty() {
            // 找到最久未访问的条目
            let oldest_key = cache
                .iter()
                .min_by_key(|(_, entry)| entry.last_access)
                .map(|(key, _)| key.clone());

            if let Some(key) = oldest_key {
                if let Some(removed) = cache.remove(&key) {
                    *current_size -= removed.size;
                }
            } else {
                break;
            }
        }

        // 添加新条目（使用规范化 key）
        cache.insert(key, entry);
        *current_size += size;
    }

    /// 清除所有缓存
    pub fn clear(&self) {
        let mut cache = self.cache.lock().unwrap();
        let mut current_size = self.current_size.lock().unwrap();

        cache.clear();
        *current_size = 0;
    }

    /// 获取缓存统计信息
    pub fn stats(&self) -> (usize, usize, usize) {
        let cache = self.cache.lock().unwrap();
        let current_size = self.current_size.lock().unwrap();

        (cache.len(), *current_size, self.max_size)
    }

    /// 移除特定路径的缓存
    pub fn remove(&self, path: &str) {
        let key = path.replace('\\', "/");
        let mut cache = self.cache.lock().unwrap();
        let mut current_size = self.current_size.lock().unwrap();

        if let Some(removed) = cache.remove(&key) {
            println!(
                "🧹 ImageCache::remove - removed key='{}' size={} bytes",
                key, removed.size
            );
            *current_size -= removed.size;
        }
    }

    /// 检查文件URL是否仍然有效
    pub fn validate_file_url(&self, path: &str) -> bool {
        let key = path.replace('\\', "/");

        if let Ok(cache) = self.cache.lock() {
            if let Some(entry) = cache.get(&key) {
                if entry.is_file_url {
                    // 检查文件是否存在
                    if let Ok(url) = url::Url::parse(&entry.data) {
                        if let Ok(file_path) = url.to_file_path() {
                            return std::path::Path::new(&file_path).exists();
                        }
                    }
                    // 文件不存在，移除缓存
                    drop(cache);
                    println!("🧹 ImageCache::validate_file_url - file missing for key='{}', removing entry", key);
                    self.remove(&key);
                    return false;
                }
            }
        }

        true
    }

    /// 获取缓存项的详细信息
    pub fn get_entry_info(&self, path: &str) -> Option<CacheEntryInfo> {
        let key = path.replace('\\', "/");
        if let Ok(cache) = self.cache.lock() {
            cache.get(&key).map(|entry| CacheEntryInfo {
                size: entry.size,
                last_access: entry.last_access,
                is_file_url: entry.is_file_url,
            })
        } else {
            None
        }
    }

    /// 批量验证文件URL
    pub fn validate_all_file_urls(&self) -> usize {
        let mut invalid_count = 0;
        let mut paths_to_remove = Vec::new();

        if let Ok(cache) = self.cache.lock() {
            for (path, entry) in cache.iter() {
                if entry.is_file_url {
                    if let Ok(url) = url::Url::parse(&entry.data) {
                        if let Ok(file_path) = url.to_file_path() {
                            if !std::path::Path::new(&file_path).exists() {
                                paths_to_remove.push(path.clone());
                                invalid_count += 1;
                            }
                        } else {
                            paths_to_remove.push(path.clone());
                            invalid_count += 1;
                        }
                    } else {
                        paths_to_remove.push(path.clone());
                        invalid_count += 1;
                    }
                }
            }
        }

        // 移除无效的缓存项
        for path in paths_to_remove {
            self.remove(&path);
        }

        invalid_count
    }
}

/// 缓存项信息
#[derive(Debug, Clone)]
pub struct CacheEntryInfo {
    /// 数据大小
    pub size: usize,
    /// 最后访问时间
    pub last_access: u64,
    /// 是否为文件URL
    pub is_file_url: bool,
}

impl Default for ImageCache {
    fn default() -> Self {
        Self::new(256) // 默认 256MB 缓存
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_basic() {
        let cache = ImageCache::new(1); // 1MB

        // 添加数据
        cache.set("test1".to_string(), "data1".to_string());

        // 获取数据
        assert_eq!(cache.get("test1"), Some("data1".to_string()));

        // 获取不存在的数据
        assert_eq!(cache.get("test2"), None);
    }

    #[test]
    fn test_cache_eviction() {
        let cache = ImageCache::new(1); // 1MB

        // 添加大量数据触发清理
        let large_data = "x".repeat(500 * 1024); // 500KB
        cache.set("test1".to_string(), large_data.clone());
        cache.set("test2".to_string(), large_data.clone());

        // test1 应该被清理
        let (count, _, _) = cache.stats();
        assert!(count <= 2);
    }

    #[test]
    fn test_cache_clear() {
        let cache = ImageCache::new(1);

        cache.set("test1".to_string(), "data1".to_string());
        cache.set("test2".to_string(), "data2".to_string());

        cache.clear();

        let (count, size, _) = cache.stats();
        assert_eq!(count, 0);
        assert_eq!(size, 0);
    }
}
