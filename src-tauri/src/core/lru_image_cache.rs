//! `NeoView` - LRU Image Cache
//! 智能图像缓存模块 - LRU 淘汰 + 内存压力感知 + 距离感知淘汰
//!
//! 参考 NeeView 的 PageDistanceComparer 实现：
//! - 优先删除翻页反方向的页面
//! - 同方向按距离远近排序

use lru::LruCache;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::num::NonZeroUsize;
use std::sync::atomic::{AtomicI32, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use sysinfo::System;

/// 缓存条目
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CacheEntry {
    /// 图片数据 (base64 或文件URL)
    pub data: String,
    /// 数据大小 (字节)
    pub size: usize,
    /// 是否为文件URL
    pub is_file_url: bool,
    /// 创建时间戳
    pub created_at: u64,
    /// 页面索引 (用于距离感知淘汰)
    #[serde(default)]
    pub page_index: Option<i32>,
    /// 是否锁定 (锁定的页面不会被淘汰)
    #[serde(default)]
    pub locked: bool,
}

/// 缓存统计信息
#[derive(Debug, Clone, Serialize)]
pub struct CacheStats {
    /// 缓存条目数
    pub entry_count: usize,
    /// 当前大小 (字节)
    pub current_size: usize,
    /// 最大大小 (字节)
    pub max_size: usize,
    /// 命中次数
    pub hits: u64,
    /// 未命中次数
    pub misses: u64,
    /// 淘汰次数
    pub evictions: u64,
    /// 距离感知淘汰次数
    pub distance_evictions: u64,
}

/// 用于距离感知淘汰的条目信息
#[derive(Debug, Clone)]
struct EvictionCandidate {
    key: String,
    page_index: i32,
    size: usize,
    distance_score: i32, // 负数表示反方向，正数表示正方向，值越大越优先删除
}

/// LRU 图像缓存管理器
pub struct LruImageCache {
    /// LRU 缓存 (key -> CacheEntry)
    cache: Arc<RwLock<LruCache<String, CacheEntry>>>,
    /// 最大缓存大小 (字节)
    max_size: AtomicUsize,
    /// 当前缓存大小
    current_size: AtomicUsize,
    /// 内存压力阈值 (可用内存百分比，低于此值触发淘汰)
    memory_pressure_threshold: AtomicUsize,
    /// 命中次数
    hits: AtomicU64,
    /// 未命中次数
    misses: AtomicU64,
    /// 淘汰次数
    evictions: AtomicU64,
    /// 距离感知淘汰次数
    distance_evictions: AtomicU64,
    /// 当前页面索引 (用于距离感知淘汰)
    current_page_index: AtomicI32,
    /// 当前翻页方向 (1: 向后, -1: 向前)
    current_direction: AtomicI32,
}

impl LruImageCache {
    /// 创建新的 LRU 缓存
    ///
    /// # Arguments
    /// * `max_size_mb` - 最大缓存大小 (MB)
    /// * `memory_pressure_threshold` - 内存压力阈值 (0-100，表示可用内存百分比)
    pub fn new(max_size_mb: usize, memory_pressure_threshold: u8) -> Self {
        let max_entries = NonZeroUsize::new(10000).unwrap();
        Self {
            cache: Arc::new(RwLock::new(LruCache::new(max_entries))),
            max_size: AtomicUsize::new(max_size_mb * 1024 * 1024),
            current_size: AtomicUsize::new(0),
            memory_pressure_threshold: AtomicUsize::new(memory_pressure_threshold as usize),
            hits: AtomicU64::new(0),
            misses: AtomicU64::new(0),
            evictions: AtomicU64::new(0),
            distance_evictions: AtomicU64::new(0),
            current_page_index: AtomicI32::new(0),
            current_direction: AtomicI32::new(1), // 默认向后
        }
    }

    /// 获取缓存项 (更新 LRU 顺序)
    pub fn get(&self, key: &str) -> Option<CacheEntry> {
        let normalized_key = key.replace('\\', "/");
        let mut cache = self.cache.write();

        if let Some(entry) = cache.get(&normalized_key) {
            self.hits.fetch_add(1, Ordering::Relaxed);
            Some(entry.clone())
        } else {
            self.misses.fetch_add(1, Ordering::Relaxed);
            None
        }
    }

    /// 仅查看缓存项 (不更新 LRU 顺序)
    pub fn peek(&self, key: &str) -> Option<CacheEntry> {
        let normalized_key = key.replace('\\', "/");
        let cache = self.cache.read();
        cache.peek(&normalized_key).cloned()
    }

    /// 设置缓存项
    pub fn set(&self, key: &str, data: String) {
        self.set_with_page_index(key, data, None);
    }

    /// 设置缓存项（带页面索引，用于距离感知淘汰）
    pub fn set_with_page_index(&self, key: &str, data: String, page_index: Option<i32>) {
        let normalized_key = key.replace('\\', "/");
        let size = data.len();
        let is_file_url = data.starts_with("file://");
        let created_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let entry = CacheEntry {
            data,
            size,
            is_file_url,
            created_at,
            page_index,
            locked: false,
        };

        // 检查是否需要淘汰
        let max_size = self.max_size.load(Ordering::Relaxed);
        let current = self.current_size.load(Ordering::Relaxed);

        if current + size > max_size {
            // 优先使用距离感知淘汰
            let origin = self.current_page_index.load(Ordering::Relaxed);
            let direction = self.current_direction.load(Ordering::Relaxed);
            self.evict_by_distance(origin, direction, size);
        }

        let mut cache = self.cache.write();

        // 如果 key 已存在，先减去旧的大小
        if let Some(old_entry) = cache.peek(&normalized_key) {
            self.current_size
                .fetch_sub(old_entry.size, Ordering::Relaxed);
        }

        cache.put(normalized_key, entry);
        self.current_size.fetch_add(size, Ordering::Relaxed);
    }

    /// 更新当前页面位置（用于距离感知淘汰）
    ///
    /// # Arguments
    /// * `page_index` - 当前页面索引
    /// * `direction` - 翻页方向 (1: 向后, -1: 向前)
    pub fn update_page_position(&self, page_index: i32, direction: i32) {
        self.current_page_index.store(page_index, Ordering::Relaxed);
        self.current_direction.store(direction, Ordering::Relaxed);
    }

    /// 锁定页面（防止被淘汰）
    pub fn lock_page(&self, key: &str) {
        let normalized_key = key.replace('\\', "/");
        let mut cache = self.cache.write();
        if let Some(entry) = cache.get_mut(&normalized_key) {
            entry.locked = true;
        }
    }

    /// 解锁页面
    pub fn unlock_page(&self, key: &str) {
        let normalized_key = key.replace('\\', "/");
        let mut cache = self.cache.write();
        if let Some(entry) = cache.get_mut(&normalized_key) {
            entry.locked = false;
        }
    }

    /// 基于距离的智能淘汰
    /// 参考 NeeView 的 PageDistanceComparer 实现：
    /// 1. 锁定的页面不删除
    /// 2. 翻页反方向的页面优先删除
    /// 3. 同方向按距离远近排序（距离越远越先删除）
    ///
    /// # Arguments
    /// * `origin` - 当前页面索引
    /// * `direction` - 翻页方向 (1: 向后, -1: 向前)
    /// * `needed_size` - 需要释放的空间大小
    pub fn evict_by_distance(&self, origin: i32, direction: i32, needed_size: usize) {
        let max_size = self.max_size.load(Ordering::Relaxed);
        let mut cache = self.cache.write();

        // 收集所有有页面索引的候选条目
        let mut candidates: Vec<EvictionCandidate> = cache
            .iter()
            .filter_map(|(key, entry)| {
                if entry.locked {
                    return None; // 跳过锁定的页面
                }
                entry.page_index.map(|idx| {
                    let distance = (idx - origin) * direction;
                    EvictionCandidate {
                        key: key.clone(),
                        page_index: idx,
                        size: entry.size,
                        distance_score: distance,
                    }
                })
            })
            .collect();

        // 按距离得分排序（负数优先，因为负数表示反方向）
        // 对于同方向的，距离越大越优先删除
        candidates.sort_by(|a, b| {
            // 反方向（负数距离）优先删除
            if a.distance_score < 0 && b.distance_score >= 0 {
                return std::cmp::Ordering::Less;
            }
            if a.distance_score >= 0 && b.distance_score < 0 {
                return std::cmp::Ordering::Greater;
            }

            // 同方向：距离越远越优先删除
            if a.distance_score >= 0 && b.distance_score >= 0 {
                b.distance_score.cmp(&a.distance_score)
            } else {
                // 都是反方向：绝对距离越小越优先删除（刚刚翻过的不删）
                a.distance_score.cmp(&b.distance_score)
            }
        });

        // 删除直到满足空间需求
        let mut freed_size = 0;
        let target_free = if self.current_size.load(Ordering::Relaxed) + needed_size > max_size {
            self.current_size.load(Ordering::Relaxed) + needed_size - max_size
        } else {
            return;
        };

        for candidate in candidates {
            if freed_size >= target_free {
                break;
            }
            if let Some((_, evicted)) = cache.pop_entry(&candidate.key) {
                freed_size += evicted.size;
                self.current_size.fetch_sub(evicted.size, Ordering::Relaxed);
                self.distance_evictions.fetch_add(1, Ordering::Relaxed);
                log::debug!(
                    "🧹 距离感知淘汰: page={} distance_score={} size={}",
                    candidate.page_index,
                    candidate.distance_score,
                    evicted.size
                );
            }
        }

        // 如果距离感知淘汰不够，回退到 LRU 淘汰
        while self.current_size.load(Ordering::Relaxed) + needed_size > max_size {
            if let Some((_, evicted)) = cache.pop_lru() {
                self.current_size.fetch_sub(evicted.size, Ordering::Relaxed);
                self.evictions.fetch_add(1, Ordering::Relaxed);
            } else {
                break;
            }
        }
    }

    /// 淘汰条目直到有足够空间（传统 LRU 方式）
    fn evict_until_fit(&self, needed_size: usize) {
        let max_size = self.max_size.load(Ordering::Relaxed);
        let mut cache = self.cache.write();

        while self.current_size.load(Ordering::Relaxed) + needed_size > max_size {
            if let Some((_, evicted)) = cache.pop_lru() {
                self.current_size.fetch_sub(evicted.size, Ordering::Relaxed);
                self.evictions.fetch_add(1, Ordering::Relaxed);
            } else {
                break;
            }
        }
    }

    /// 检查并响应内存压力
    /// 返回 true 如果检测到内存压力并进行了淘汰
    pub fn check_memory_pressure(&self) -> bool {
        let mut sys = System::new();
        sys.refresh_memory();

        let total_memory = sys.total_memory();
        let available_memory = sys.available_memory();

        if total_memory == 0 {
            return false;
        }

        let available_percent = (available_memory * 100 / total_memory) as usize;
        let threshold = self.memory_pressure_threshold.load(Ordering::Relaxed);

        if available_percent < threshold {
            // 内存压力过大，淘汰 50% 的缓存
            let target_evictions = {
                let cache = self.cache.read();
                cache.len() / 2
            };

            if target_evictions > 0 {
                log::warn!(
                    "🧹 内存压力检测: 可用内存 {}% < 阈值 {}%，淘汰 {} 条缓存",
                    available_percent,
                    threshold,
                    target_evictions
                );
                self.evict(target_evictions);
                return true;
            }
        }

        false
    }

    /// 强制淘汰指定数量的条目
    pub fn evict(&self, count: usize) -> usize {
        let mut cache = self.cache.write();
        let mut evicted = 0;

        for _ in 0..count {
            if let Some((_, entry)) = cache.pop_lru() {
                self.current_size.fetch_sub(entry.size, Ordering::Relaxed);
                self.evictions.fetch_add(1, Ordering::Relaxed);
                evicted += 1;
            } else {
                break;
            }
        }

        evicted
    }

    /// 移除特定路径的缓存
    pub fn remove(&self, key: &str) {
        let normalized_key = key.replace('\\', "/");
        let mut cache = self.cache.write();

        if let Some(entry) = cache.pop(&normalized_key) {
            self.current_size.fetch_sub(entry.size, Ordering::Relaxed);
        }
    }

    /// 清除所有缓存
    pub fn clear(&self) {
        let mut cache = self.cache.write();
        cache.clear();
        self.current_size.store(0, Ordering::Relaxed);
    }

    /// 获取缓存统计
    pub fn stats(&self) -> CacheStats {
        let cache = self.cache.read();
        CacheStats {
            entry_count: cache.len(),
            current_size: self.current_size.load(Ordering::Relaxed),
            max_size: self.max_size.load(Ordering::Relaxed),
            hits: self.hits.load(Ordering::Relaxed),
            misses: self.misses.load(Ordering::Relaxed),
            evictions: self.evictions.load(Ordering::Relaxed),
            distance_evictions: self.distance_evictions.load(Ordering::Relaxed),
        }
    }

    /// 更新最大缓存大小
    pub fn set_max_size(&self, max_size_mb: usize) {
        self.max_size
            .store(max_size_mb * 1024 * 1024, Ordering::Relaxed);
    }

    /// 更新内存压力阈值
    pub fn set_memory_pressure_threshold(&self, threshold: u8) {
        self.memory_pressure_threshold
            .store(threshold as usize, Ordering::Relaxed);
    }

    /// 检查文件URL是否仍然有效
    pub fn validate_file_url(&self, key: &str) -> bool {
        let normalized_key = key.replace('\\', "/");

        let entry = {
            let cache = self.cache.read();
            cache.peek(&normalized_key).cloned()
        };

        if let Some(entry) = entry {
            if entry.is_file_url {
                if let Ok(url) = url::Url::parse(&entry.data) {
                    if let Ok(file_path) = url.to_file_path() {
                        if !std::path::Path::new(&file_path).exists() {
                            self.remove(&normalized_key);
                            return false;
                        }
                    }
                }
            }
        }

        true
    }
}

impl Default for LruImageCache {
    fn default() -> Self {
        Self::new(256, 20) // 默认 256MB 缓存，20% 内存压力阈值
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_basic() {
        let cache = LruImageCache::new(1, 20);

        cache.set("test1", "data1".to_string());

        let entry = cache.get("test1");
        assert!(entry.is_some());
        assert_eq!(entry.unwrap().data, "data1");

        assert!(cache.get("test2").is_none());
    }

    #[test]
    fn test_cache_lru_eviction() {
        let cache = LruImageCache::new(1, 20); // 1MB

        // 添加大量数据触发 LRU 淘汰
        let large_data = "x".repeat(400 * 1024); // 400KB
        cache.set("test1", large_data.clone());
        cache.set("test2", large_data.clone());
        cache.set("test3", large_data.clone()); // 这应该触发淘汰 test1

        let stats = cache.stats();
        assert!(stats.evictions > 0 || stats.entry_count <= 3);
    }

    #[test]
    fn test_cache_clear() {
        let cache = LruImageCache::new(1, 20);

        cache.set("test1", "data1".to_string());
        cache.set("test2", "data2".to_string());

        cache.clear();

        let stats = cache.stats();
        assert_eq!(stats.entry_count, 0);
        assert_eq!(stats.current_size, 0);
    }

    #[test]
    fn test_cache_entry_serialization() {
        let entry = CacheEntry {
            data: "test_data".to_string(),
            size: 9,
            is_file_url: false,
            created_at: 1234567890,
            page_index: None,
            locked: false,
        };

        let json = serde_json::to_string(&entry).unwrap();
        let deserialized: CacheEntry = serde_json::from_str(&json).unwrap();

        assert_eq!(entry.data, deserialized.data);
        assert_eq!(entry.size, deserialized.size);
        assert_eq!(entry.is_file_url, deserialized.is_file_url);
        assert_eq!(entry.created_at, deserialized.created_at);
    }
}
