//! Thumbnail LRU Cache Module
//! 缩略图内存 LRU 缓存 - 2GB 容量
//! 避免频繁的数据库查询

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

/// LRU 缓存条目
struct CacheEntry {
    data: Vec<u8>,
    size: usize,
    // 用于 LRU 排序的访问时间戳
    last_access: u64,
}

/// 缩略图 LRU 缓存
pub struct ThumbnailLruCache {
    cache: RwLock<HashMap<String, CacheEntry>>,
    // 最大缓存大小（字节）
    max_size: usize,
    // 当前缓存大小
    current_size: RwLock<usize>,
    // 访问计数器（用于 LRU）
    access_counter: RwLock<u64>,
}

impl ThumbnailLruCache {
    /// 创建新的 LRU 缓存
    /// max_size_mb: 最大缓存大小（MB）
    pub fn new(max_size_mb: usize) -> Self {
        Self {
            cache: RwLock::new(HashMap::new()),
            max_size: max_size_mb * 1024 * 1024,
            current_size: RwLock::new(0),
            access_counter: RwLock::new(0),
        }
    }

    /// 获取缓存
    pub fn get(&self, key: &str) -> Option<Vec<u8>> {
        let mut cache = self.cache.write().ok()?;
        
        if let Some(entry) = cache.get_mut(key) {
            // 更新访问时间
            let mut counter = self.access_counter.write().ok()?;
            *counter += 1;
            entry.last_access = *counter;
            Some(entry.data.clone())
        } else {
            None
        }
    }

    /// 设置缓存
    pub fn set(&self, key: String, data: Vec<u8>) {
        let size = data.len();
        
        // 如果单个条目超过最大缓存的 10%，不缓存
        if size > self.max_size / 10 {
            return;
        }

        // 获取写锁
        let mut cache = match self.cache.write() {
            Ok(c) => c,
            Err(_) => return,
        };
        
        let mut current_size = match self.current_size.write() {
            Ok(s) => s,
            Err(_) => return,
        };

        // 如果 key 已存在，先移除旧的
        if let Some(old_entry) = cache.remove(&key) {
            *current_size = current_size.saturating_sub(old_entry.size);
        }

        // 如果需要，淘汰旧条目
        while *current_size + size > self.max_size && !cache.is_empty() {
            // 找到最旧的条目
            let oldest_key = cache
                .iter()
                .min_by_key(|(_, entry)| entry.last_access)
                .map(|(k, _)| k.clone());

            if let Some(oldest) = oldest_key {
                if let Some(removed) = cache.remove(&oldest) {
                    *current_size = current_size.saturating_sub(removed.size);
                }
            } else {
                break;
            }
        }

        // 获取新的访问时间戳
        let access_time = {
            let mut counter = match self.access_counter.write() {
                Ok(c) => c,
                Err(_) => return,
            };
            *counter += 1;
            *counter
        };

        // 插入新条目
        cache.insert(
            key,
            CacheEntry {
                data,
                size,
                last_access: access_time,
            },
        );
        *current_size += size;
    }

    /// 检查是否存在
    pub fn contains(&self, key: &str) -> bool {
        self.cache.read().map(|c| c.contains_key(key)).unwrap_or(false)
    }

    /// 清空缓存
    pub fn clear(&self) {
        if let Ok(mut cache) = self.cache.write() {
            cache.clear();
        }
        if let Ok(mut size) = self.current_size.write() {
            *size = 0;
        }
    }

    /// 获取缓存统计
    pub fn stats(&self) -> (usize, usize, usize) {
        let count = self.cache.read().map(|c| c.len()).unwrap_or(0);
        let current = self.current_size.read().map(|s| *s).unwrap_or(0);
        (count, current, self.max_size)
    }
}

// 全局缓存实例（2GB）
lazy_static::lazy_static! {
    pub static ref THUMBNAIL_LRU_CACHE: Arc<ThumbnailLruCache> = Arc::new(ThumbnailLruCache::new(2048));
}
