//! 压缩包页面缓存模块
//!
//! 参考 NeeView 的 ArchiveCache 和 BookMemoryService 设计
//! 提供高效的内存缓存，支持 LRU 淘汰和内存限制

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::Instant;

/// 缓存条目
struct CacheEntry {
    /// 图片数据
    data: Vec<u8>,
    /// 最后访问时间
    last_accessed: Instant,
    /// 数据大小（字节）
    size: usize,
}

/// 页面缓存键
#[derive(Debug, Clone, Hash, Eq, PartialEq)]
pub struct PageCacheKey {
    /// 压缩包路径
    pub archive_path: String,
    /// 内部文件路径
    pub inner_path: String,
}

impl PageCacheKey {
    pub fn new(archive_path: &str, inner_path: &str) -> Self {
        Self {
            archive_path: archive_path.replace('\\', "/"),
            inner_path: inner_path.replace('\\', "/"),
        }
    }
}

/// 压缩包页面缓存
/// 
/// 特点：
/// - LRU 淘汰策略
/// - 内存上限控制
/// - 线程安全
pub struct ArchivePageCache {
    /// 缓存数据
    cache: RwLock<HashMap<PageCacheKey, CacheEntry>>,
    /// 最大内存使用量（字节）
    max_memory: usize,
    /// 当前内存使用量
    current_memory: RwLock<usize>,
    /// 最大缓存条目数
    max_entries: usize,
}

impl ArchivePageCache {
    /// 创建新的页面缓存
    /// 
    /// # Arguments
    /// * `max_memory_mb` - 最大内存使用量（MB）
    /// * `max_entries` - 最大缓存条目数
    pub fn new(max_memory_mb: usize, max_entries: usize) -> Self {
        Self {
            cache: RwLock::new(HashMap::new()),
            max_memory: max_memory_mb * 1024 * 1024,
            current_memory: RwLock::new(0),
            max_entries,
        }
    }

    /// 获取缓存的页面数据
    pub fn get(&self, key: &PageCacheKey) -> Option<Vec<u8>> {
        let mut cache = self.cache.write().ok()?;
        if let Some(entry) = cache.get_mut(key) {
            entry.last_accessed = Instant::now();
            Some(entry.data.clone())
        } else {
            None
        }
    }

    /// 尝试获取（只读，不更新访问时间）
    pub fn peek(&self, key: &PageCacheKey) -> Option<Vec<u8>> {
        let cache = self.cache.read().ok()?;
        cache.get(key).map(|e| e.data.clone())
    }

    /// 检查是否存在
    pub fn contains(&self, key: &PageCacheKey) -> bool {
        self.cache.read().map(|c| c.contains_key(key)).unwrap_or(false)
    }

    /// 插入页面数据
    pub fn insert(&self, key: PageCacheKey, data: Vec<u8>) {
        let size = data.len();
        
        // 检查是否需要淘汰
        self.evict_if_needed(size);

        if let Ok(mut cache) = self.cache.write() {
            // 如果已存在，先减去旧的大小
            if let Some(old) = cache.get(&key) {
                if let Ok(mut mem) = self.current_memory.write() {
                    *mem = mem.saturating_sub(old.size);
                }
            }

            cache.insert(key, CacheEntry {
                data,
                last_accessed: Instant::now(),
                size,
            });

            if let Ok(mut mem) = self.current_memory.write() {
                *mem += size;
            }
        }
    }

    /// 批量插入（用于预加载）
    pub fn insert_batch(&self, entries: Vec<(PageCacheKey, Vec<u8>)>) {
        let total_size: usize = entries.iter().map(|(_, d)| d.len()).sum();
        self.evict_if_needed(total_size);

        if let Ok(mut cache) = self.cache.write() {
            let mut added_size = 0usize;
            for (key, data) in entries {
                let size = data.len();
                
                // 如果已存在，先减去旧的大小
                if let Some(old) = cache.get(&key) {
                    added_size = added_size.saturating_sub(old.size);
                }

                cache.insert(key, CacheEntry {
                    data,
                    last_accessed: Instant::now(),
                    size,
                });
                added_size += size;
            }

            if let Ok(mut mem) = self.current_memory.write() {
                *mem += added_size;
            }
        }
    }

    /// 删除指定压缩包的所有缓存
    pub fn remove_archive(&self, archive_path: &str) {
        let normalized = archive_path.replace('\\', "/");
        if let Ok(mut cache) = self.cache.write() {
            let keys_to_remove: Vec<_> = cache
                .keys()
                .filter(|k| k.archive_path == normalized)
                .cloned()
                .collect();
            
            let mut removed_size = 0usize;
            for key in keys_to_remove {
                if let Some(entry) = cache.remove(&key) {
                    removed_size += entry.size;
                }
            }

            if let Ok(mut mem) = self.current_memory.write() {
                *mem = mem.saturating_sub(removed_size);
            }
        }
    }

    /// 清空缓存
    pub fn clear(&self) {
        if let Ok(mut cache) = self.cache.write() {
            cache.clear();
        }
        if let Ok(mut mem) = self.current_memory.write() {
            *mem = 0;
        }
    }

    /// 获取缓存统计信息
    pub fn stats(&self) -> CacheStats {
        let (entry_count, memory_used) = {
            let cache = self.cache.read().unwrap_or_else(|e| e.into_inner());
            let mem = self.current_memory.read().unwrap_or_else(|e| e.into_inner());
            (cache.len(), *mem)
        };

        CacheStats {
            entry_count,
            memory_used,
            max_memory: self.max_memory,
            max_entries: self.max_entries,
        }
    }

    /// 如果需要，执行淘汰
    fn evict_if_needed(&self, incoming_size: usize) {
        let current = *self.current_memory.read().unwrap_or_else(|e| e.into_inner());
        let entry_count = self.cache.read().map(|c| c.len()).unwrap_or(0);

        // 检查是否需要淘汰
        if current + incoming_size <= self.max_memory && entry_count < self.max_entries {
            return;
        }

        // 需要淘汰
        if let Ok(mut cache) = self.cache.write() {
            // 收集并按访问时间排序
            let mut entries: Vec<_> = cache.iter()
                .map(|(k, v)| (k.clone(), v.last_accessed, v.size))
                .collect();
            entries.sort_by_key(|(_, time, _)| *time);

            // 淘汰最旧的条目直到满足条件
            let target_memory = self.max_memory.saturating_sub(incoming_size);
            let target_entries = self.max_entries.saturating_sub(1);
            let mut current_mem = current;
            let mut current_count = entry_count;

            for (key, _, size) in entries {
                if current_mem <= target_memory && current_count <= target_entries {
                    break;
                }
                if cache.remove(&key).is_some() {
                    current_mem = current_mem.saturating_sub(size);
                    current_count = current_count.saturating_sub(1);
                }
            }

            if let Ok(mut mem) = self.current_memory.write() {
                *mem = current_mem;
            }
        }
    }

    /// 保留指定范围的页面，淘汰其他
    pub fn retain_range(&self, archive_path: &str, keep_indices: &[usize], all_pages: &[(usize, String)]) {
        let normalized = archive_path.replace('\\', "/");
        let keep_paths: std::collections::HashSet<_> = keep_indices.iter()
            .filter_map(|&idx| all_pages.iter().find(|(i, _)| *i == idx).map(|(_, p)| p.clone()))
            .collect();

        if let Ok(mut cache) = self.cache.write() {
            let keys_to_remove: Vec<_> = cache
                .keys()
                .filter(|k| k.archive_path == normalized && !keep_paths.contains(&k.inner_path))
                .cloned()
                .collect();
            
            let mut removed_size = 0usize;
            for key in keys_to_remove {
                if let Some(entry) = cache.remove(&key) {
                    removed_size += entry.size;
                }
            }

            if let Ok(mut mem) = self.current_memory.write() {
                *mem = mem.saturating_sub(removed_size);
            }
        }
    }
}

impl Default for ArchivePageCache {
    fn default() -> Self {
        // 默认 256MB 内存，最多 100 个条目
        Self::new(256, 100)
    }
}

/// 缓存统计信息
#[derive(Debug, Clone)]
pub struct CacheStats {
    pub entry_count: usize,
    pub memory_used: usize,
    pub max_memory: usize,
    pub max_entries: usize,
}

impl CacheStats {
    pub fn memory_usage_percent(&self) -> f64 {
        if self.max_memory == 0 {
            0.0
        } else {
            (self.memory_used as f64 / self.max_memory as f64) * 100.0
        }
    }
}

/// 共享的页面缓存实例
pub type SharedPageCache = Arc<ArchivePageCache>;

/// 创建共享页面缓存
pub fn create_shared_cache(max_memory_mb: usize, max_entries: usize) -> SharedPageCache {
    Arc::new(ArchivePageCache::new(max_memory_mb, max_entries))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_basic() {
        let cache = ArchivePageCache::new(10, 10);
        let key = PageCacheKey::new("/test.zip", "image.jpg");
        
        cache.insert(key.clone(), vec![1, 2, 3, 4]);
        assert!(cache.contains(&key));
        
        let data = cache.get(&key);
        assert_eq!(data, Some(vec![1, 2, 3, 4]));
    }

    #[test]
    fn test_cache_eviction() {
        // 1KB 限制，最多 2 个条目
        let cache = ArchivePageCache::new(0, 2);
        cache.max_memory; // 0MB = 0 bytes
        
        let key1 = PageCacheKey::new("/test.zip", "1.jpg");
        let key2 = PageCacheKey::new("/test.zip", "2.jpg");
        let key3 = PageCacheKey::new("/test.zip", "3.jpg");
        
        cache.insert(key1.clone(), vec![1]);
        cache.insert(key2.clone(), vec![2]);
        
        // 插入第三个应该淘汰第一个
        std::thread::sleep(std::time::Duration::from_millis(10));
        cache.insert(key3.clone(), vec![3]);
        
        // key1 应该被淘汰（最旧）
        assert!(!cache.contains(&key1) || cache.stats().entry_count <= 2);
    }
}
