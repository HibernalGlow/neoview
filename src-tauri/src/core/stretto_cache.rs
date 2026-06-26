//! Stretto TinyLFU 缓存模块
//! 使用 Stretto 实现高性能缓存，比 LRU 更智能的驱逐策略

use log::{debug, info};
use std::hash::Hash;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use stretto::{Cache, CacheBuilder};

/// 默认缓存配置
const DEFAULT_NUM_COUNTERS: usize = 1e7 as usize; // 1000万计数器
const DEFAULT_MAX_COST: i64 = 1 << 30; // 1GB
const DEFAULT_BUFFER_SIZE: usize = 64;

/// 图片数据缓存
/// 使用 TinyLFU 算法，比 LRU 更好地处理扫描攻击
pub struct ImageDataCache {
    /// Stretto 缓存实例
    cache: Cache<String, Arc<Vec<u8>>>,
    /// 命中计数
    hits: AtomicU64,
    /// 未命中计数
    misses: AtomicU64,
}

impl ImageDataCache {
    /// 创建新的图片缓存
    /// - max_cost: 最大缓存大小（字节）
    pub fn new(max_cost: i64) -> Result<Self, String> {
        let cache = CacheBuilder::new(DEFAULT_NUM_COUNTERS, max_cost)
            .set_buffer_size(DEFAULT_BUFFER_SIZE)
            .finalize()
            .map_err(|e| format!("创建缓存失败: {e}"))?;

        Ok(Self {
            cache,
            hits: AtomicU64::new(0),
            misses: AtomicU64::new(0),
        })
    }

    /// 创建带自定义配置的缓存
    pub fn with_config(
        num_counters: usize,
        max_cost: i64,
        buffer_size: usize,
    ) -> Result<Self, String> {
        let cache = CacheBuilder::new(num_counters, max_cost)
            .set_buffer_size(buffer_size)
            .finalize()
            .map_err(|e| format!("创建缓存失败: {e}"))?;

        Ok(Self {
            cache,
            hits: AtomicU64::new(0),
            misses: AtomicU64::new(0),
        })
    }

    /// 获取缓存项
    pub fn get(&self, key: &str) -> Option<Arc<Vec<u8>>> {
        match self.cache.get(key) {
            Some(value) => {
                self.hits.fetch_add(1, Ordering::Relaxed);
                Some(value.value().clone())
            }
            None => {
                self.misses.fetch_add(1, Ordering::Relaxed);
                None
            }
        }
    }

    /// 插入缓存项
    /// - key: 缓存键
    /// - data: 图片数据
    /// - cost: 成本（通常是数据大小）
    pub fn insert(&self, key: String, data: Vec<u8>) -> bool {
        let cost = data.len() as i64;
        let result = self.cache.insert(key, Arc::new(data), cost);
        // 等待插入完成
        self.cache.wait().ok();
        result
    }

    /// 插入带自定义成本的缓存项
    pub fn insert_with_cost(&self, key: String, data: Vec<u8>, cost: i64) -> bool {
        let result = self.cache.insert(key, Arc::new(data), cost);
        self.cache.wait().ok();
        result
    }

    /// 删除缓存项
    pub fn remove(&self, key: &str) {
        self.cache.remove(&key.to_string());
    }

    /// 清空缓存
    pub fn clear(&self) {
        let _ = self.cache.clear();
        self.cache.wait().ok();
        self.hits.store(0, Ordering::Relaxed);
        self.misses.store(0, Ordering::Relaxed);
        info!("🧹 图片缓存已清空");
    }

    /// 获取缓存统计
    pub fn stats(&self) -> ImageCacheStats {
        let hits = self.hits.load(Ordering::Relaxed);
        let misses = self.misses.load(Ordering::Relaxed);
        let total = hits + misses;
        let hit_rate = if total > 0 {
            hits as f64 / total as f64
        } else {
            0.0
        };

        ImageCacheStats {
            hits,
            misses,
            hit_rate,
            // Stretto 不直接暴露这些，使用估算值
            entry_count: 0, // 无法直接获取
            total_cost: 0,  // 无法直接获取
        }
    }
}

/// 图片缓存统计
#[derive(Debug, Clone, serde::Serialize)]
pub struct ImageCacheStats {
    /// 命中次数
    pub hits: u64,
    /// 未命中次数
    pub misses: u64,
    /// 命中率
    pub hit_rate: f64,
    /// 条目数量（估算）
    pub entry_count: usize,
    /// 总成本（估算）
    pub total_cost: i64,
}

/// 通用键值缓存
/// 适用于索引、元数据等小型数据
pub struct GenericCache<K, V>
where
    K: Hash + Eq + Send + Sync + 'static,
    V: Send + Sync + 'static,
{
    /// Stretto 缓存实例
    cache: Cache<K, Arc<V>>,
    /// 命中计数
    hits: AtomicU64,
    /// 未命中计数
    misses: AtomicU64,
}

impl<K, V> GenericCache<K, V>
where
    K: Hash + Eq + Send + Sync + Clone + 'static,
    V: Send + Sync + 'static,
{
    /// 创建新的通用缓存
    pub fn new(max_entries: i64) -> Result<Self, String> {
        // 对于小型数据，使用条目数作为成本
        let num_counters = (max_entries * 10) as usize;
        let cache = CacheBuilder::new(num_counters, max_entries)
            .set_buffer_size(64)
            .finalize()
            .map_err(|e| format!("创建缓存失败: {e}"))?;

        Ok(Self {
            cache,
            hits: AtomicU64::new(0),
            misses: AtomicU64::new(0),
        })
    }

    /// 获取缓存项
    pub fn get(&self, key: &K) -> Option<Arc<V>> {
        match self.cache.get(key) {
            Some(value) => {
                self.hits.fetch_add(1, Ordering::Relaxed);
                Some(value.value().clone())
            }
            None => {
                self.misses.fetch_add(1, Ordering::Relaxed);
                None
            }
        }
    }

    /// 插入缓存项（成本为 1）
    pub fn insert(&self, key: K, value: V) -> bool {
        let result = self.cache.insert(key, Arc::new(value), 1);
        self.cache.wait().ok();
        result
    }

    /// 插入带自定义成本的缓存项
    pub fn insert_with_cost(&self, key: K, value: V, cost: i64) -> bool {
        let result = self.cache.insert(key, Arc::new(value), cost);
        self.cache.wait().ok();
        result
    }

    /// 删除缓存项
    pub fn remove(&self, key: &K) {
        self.cache.remove(key);
    }

    /// 清空缓存
    pub fn clear(&self) {
        let _ = self.cache.clear();
        self.cache.wait().ok();
        self.hits.store(0, Ordering::Relaxed);
        self.misses.store(0, Ordering::Relaxed);
    }

    /// 获取命中率
    pub fn hit_rate(&self) -> f64 {
        let hits = self.hits.load(Ordering::Relaxed);
        let misses = self.misses.load(Ordering::Relaxed);
        let total = hits + misses;
        if total > 0 {
            hits as f64 / total as f64
        } else {
            0.0
        }
    }

    /// 获取统计信息
    pub fn stats(&self) -> GenericCacheStats {
        let hits = self.hits.load(Ordering::Relaxed);
        let misses = self.misses.load(Ordering::Relaxed);
        GenericCacheStats {
            hits,
            misses,
            hit_rate: self.hit_rate(),
        }
    }
}

/// 通用缓存统计
#[derive(Debug, Clone, serde::Serialize)]
pub struct GenericCacheStats {
    /// 命中次数
    pub hits: u64,
    /// 未命中次数
    pub misses: u64,
    /// 命中率
    pub hit_rate: f64,
}

/// 索引缓存（专门用于 Rkyv 索引）
pub type IndexCache = GenericCache<String, Vec<u8>>;

impl IndexCache {
    /// 创建索引缓存
    /// - max_entries: 最大缓存条目数
    pub fn new_index_cache(max_entries: i64) -> Result<Self, String> {
        Self::new(max_entries)
    }

    /// 获取索引数据
    pub fn get_index(&self, archive_path: &str) -> Option<Arc<Vec<u8>>> {
        self.get(&archive_path.to_string())
    }

    /// 存储索引数据
    pub fn put_index(&self, archive_path: &str, data: Vec<u8>) -> bool {
        let cost = (data.len() / 1024).max(1) as i64; // 以 KB 为单位计算成本
        self.insert_with_cost(archive_path.to_string(), data, cost)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_data_cache() {
        let cache = ImageDataCache::new(1024 * 1024).unwrap(); // 1MB

        // 插入
        let data = vec![1u8; 1000];
        assert!(cache.insert("test_key".to_string(), data.clone()));

        // 获取
        let retrieved = cache.get("test_key");
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().as_ref(), &data);

        // 统计
        let stats = cache.stats();
        assert_eq!(stats.hits, 1);
        assert_eq!(stats.misses, 0);

        // 未命中
        let _ = cache.get("nonexistent");
        let stats = cache.stats();
        assert_eq!(stats.misses, 1);

        // 删除
        cache.remove("test_key");
        assert!(cache.get("test_key").is_none());
    }

    #[test]
    fn test_generic_cache() {
        let cache: GenericCache<String, String> = GenericCache::new(100).unwrap();

        // 插入
        assert!(cache.insert("key1".to_string(), "value1".to_string()));
        assert!(cache.insert("key2".to_string(), "value2".to_string()));

        // 获取
        let v1 = cache.get(&"key1".to_string());
        assert!(v1.is_some());
        assert_eq!(v1.unwrap().as_ref(), "value1");

        // 命中率
        let _ = cache.get(&"key1".to_string()); // hit
        let _ = cache.get(&"nonexistent".to_string()); // miss
        let stats = cache.stats();
        assert_eq!(stats.hits, 2);
        assert_eq!(stats.misses, 1);
        assert!(stats.hit_rate > 0.6);
    }

    #[test]
    fn test_index_cache() {
        let cache = IndexCache::new_index_cache(100).unwrap();

        let data = vec![1u8, 2, 3, 4, 5];
        assert!(cache.put_index("/path/to/archive.zip", data.clone()));

        let retrieved = cache.get_index("/path/to/archive.zip");
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().as_ref(), &data);
    }

    #[test]
    fn test_cache_clear() {
        let cache = ImageDataCache::new(1024 * 1024).unwrap();

        cache.insert("key1".to_string(), vec![1, 2, 3]);
        cache.insert("key2".to_string(), vec![4, 5, 6]);

        // 验证插入成功
        assert!(cache.get("key1").is_some());

        // 清空
        cache.clear();

        // 验证清空成功
        assert!(cache.get("key1").is_none());
        assert!(cache.get("key2").is_none());

        // 统计重置
        let stats = cache.stats();
        assert_eq!(stats.hits, 0);
        assert_eq!(stats.misses, 2); // 两次 get 都是 miss
    }
}
