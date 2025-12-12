//! NeoView - Directory Cache
//! 目录内容缓存，支持 LRU+LFU 混合淘汰策略
//!
//! 参考 Spacedrive 的缓存设计，增加访问计数以保护热点目录

use std::collections::HashMap;
use std::time::{Duration, Instant};

use crate::core::fs_manager::FsItem;

#[derive(Clone)]
pub struct DirectoryCacheEntry {
    pub path: String,
    pub items: Vec<FsItem>,
    pub mtime: Option<u64>,
    pub cached_at: Instant,
    pub last_accessed: Instant,
    /// 访问计数（用于 LFU 策略）
    pub access_count: u32,
    /// 是否完整加载（用于流式加载）
    pub is_complete: bool,
}

impl DirectoryCacheEntry {
    pub fn new(path: String, items: Vec<FsItem>, mtime: Option<u64>) -> Self {
        let now = Instant::now();
        Self {
            path,
            items,
            mtime,
            cached_at: now,
            last_accessed: now,
            access_count: 1,
            is_complete: true,
        }
    }

    /// 创建不完整的缓存条目（用于流式加载）
    pub fn new_incomplete(path: String, mtime: Option<u64>) -> Self {
        let now = Instant::now();
        Self {
            path,
            items: Vec::new(),
            mtime,
            cached_at: now,
            last_accessed: now,
            access_count: 1,
            is_complete: false,
        }
    }

    pub fn touch(&mut self) {
        self.last_accessed = Instant::now();
        self.access_count = self.access_count.saturating_add(1);
    }

    /// 追加项目（用于流式加载）
    pub fn append_items(&mut self, items: Vec<FsItem>) {
        self.items.extend(items);
        self.last_accessed = Instant::now();
    }

    /// 标记为完整
    pub fn mark_complete(&mut self) {
        self.is_complete = true;
    }

    /// 计算淘汰分数（分数越低越容易被淘汰）
    /// 结合 LRU（时间）和 LFU（频率）
    pub fn eviction_score(&self) -> u64 {
        let recency_score = self.last_accessed.elapsed().as_secs();
        let frequency_score = self.access_count as u64;
        
        // 频率权重：每次访问相当于减少 60 秒的"年龄"
        // 这样频繁访问的目录不容易被淘汰
        recency_score.saturating_sub(frequency_score * 60)
    }
}

pub struct DirectoryCache {
    capacity: usize,
    ttl: Duration,
    entries: HashMap<String, DirectoryCacheEntry>,
}

impl DirectoryCache {
    pub fn new(capacity: usize, ttl: Duration) -> Self {
        Self {
            capacity: capacity.max(1),
            ttl,
            entries: HashMap::new(),
        }
    }

    /// 获取缓存条目（仅返回完整的条目）
    pub fn get(&mut self, path: &str, mtime: Option<u64>) -> Option<DirectoryCacheEntry> {
        if let Some(entry) = self.entries.get(path) {
            // 检查是否过期或 mtime 不匹配
            if self.is_stale(entry, mtime) {
                self.entries.remove(path);
                return None;
            }
            // 只返回完整的条目
            if !entry.is_complete {
                return None;
            }
            let mut entry = entry.clone();
            entry.touch();
            // 更新缓存中的条目
            if let Some(cached_entry) = self.entries.get_mut(path) {
                cached_entry.touch();
            }
            return Some(entry);
        }
        None
    }

    /// 插入完整的缓存条目
    pub fn insert(&mut self, path: String, items: Vec<FsItem>, mtime: Option<u64>) {
        self.evict_if_needed();
        let entry = DirectoryCacheEntry::new(path.clone(), items, mtime);
        self.entries.insert(path, entry);
    }

    /// 创建流式缓存写入器
    pub fn create_stream_writer(&mut self, path: String, mtime: Option<u64>) -> StreamCacheWriter {
        self.evict_if_needed();
        let entry = DirectoryCacheEntry::new_incomplete(path.clone(), mtime);
        self.entries.insert(path.clone(), entry);
        StreamCacheWriter { path }
    }

    /// 追加项目到流式缓存
    pub fn append_to_stream(&mut self, path: &str, items: Vec<FsItem>) {
        if let Some(entry) = self.entries.get_mut(path) {
            entry.append_items(items);
        }
    }

    /// 完成流式缓存
    pub fn complete_stream(&mut self, path: &str) {
        if let Some(entry) = self.entries.get_mut(path) {
            entry.mark_complete();
        }
    }

    /// 中止流式缓存
    pub fn abort_stream(&mut self, path: &str) {
        self.entries.remove(path);
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    #[allow(dead_code)]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn clear(&mut self) {
        self.entries.clear();
    }

    /// 使用 LRU+LFU 混合策略淘汰
    fn evict_if_needed(&mut self) {
        if self.entries.len() < self.capacity {
            return;
        }

        // 找到淘汰分数最高的条目（分数越高越应该被淘汰）
        if let Some((evict_key, _)) = self
            .entries
            .iter()
            .max_by_key(|(_, entry)| entry.eviction_score())
            .map(|(k, v)| (k.clone(), v.eviction_score()))
        {
            self.entries.remove(&evict_key);
        }
    }

    fn is_stale(&self, entry: &DirectoryCacheEntry, mtime: Option<u64>) -> bool {
        // mtime 不匹配则过期
        if let (Some(entry_mtime), Some(target_mtime)) = (entry.mtime, mtime) {
            if entry_mtime != target_mtime {
                return true;
            }
        }

        // TTL 过期
        entry.cached_at.elapsed() > self.ttl
    }

    /// 获取缓存统计信息
    pub fn stats(&self) -> CacheStats {
        let total_items: usize = self.entries.values().map(|e| e.items.len()).sum();
        let complete_count = self.entries.values().filter(|e| e.is_complete).count();
        
        CacheStats {
            entry_count: self.entries.len(),
            total_items,
            complete_count,
            capacity: self.capacity,
            ttl_secs: self.ttl.as_secs(),
        }
    }
}

/// 流式缓存写入器
pub struct StreamCacheWriter {
    pub path: String,
}

/// 缓存统计信息
#[derive(Debug, Clone)]
pub struct CacheStats {
    pub entry_count: usize,
    pub total_items: usize,
    pub complete_count: usize,
    pub capacity: usize,
    pub ttl_secs: u64,
}
