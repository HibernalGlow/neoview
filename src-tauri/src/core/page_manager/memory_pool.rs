//! NeoView - Memory Pool
//! 参考 NeeView 的 MemoryPool，实现距离驱逐策略

use std::collections::HashMap;
use std::time::Instant;

/// 缓存页面
#[derive(Debug, Clone)]
pub struct CachedPage {
    /// 图片数据
    pub data: Vec<u8>,
    /// 页面索引
    pub page_index: usize,
    /// 数据大小
    pub size: usize,
    /// MIME 类型
    pub mime_type: String,
    /// 最后访问时间
    pub last_accessed: Instant,
    /// 是否锁定（防止驱逐）
    pub is_locked: bool,
}

/// 页面缓存键
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct PageKey {
    pub book_path: String,
    pub page_index: usize,
}

impl PageKey {
    pub fn new(book_path: impl Into<String>, page_index: usize) -> Self {
        Self {
            book_path: book_path.into(),
            page_index,
        }
    }
}

/// 内存池统计
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryPoolStats {
    /// 缓存条目数
    pub entry_count: usize,
    /// 当前使用内存
    pub total_size: usize,
    /// 最大内存限制
    pub max_size: usize,
    /// 使用率百分比
    pub usage_percent: u8,
    /// 锁定条目数
    pub locked_count: usize,
}

/// 内存池
///
/// 使用距离驱逐策略：
/// 1. 锁定的页面不驱逐
/// 2. 阅读方向反向的页面优先驱逐
/// 3. 距离当前页面远的优先驱逐
pub struct MemoryPool {
    /// 缓存条目
    entries: HashMap<PageKey, CachedPage>,
    /// 当前使用内存
    total_size: usize,
    /// 最大内存限制
    max_size: usize,
}

impl MemoryPool {
    /// 创建内存池
    pub fn new(max_size_mb: usize) -> Self {
        Self {
            entries: HashMap::new(),
            total_size: 0,
            max_size: max_size_mb * 1024 * 1024,
        }
    }

    /// 获取缓存页面
    pub fn get(&mut self, key: &PageKey) -> Option<&CachedPage> {
        if let Some(entry) = self.entries.get_mut(key) {
            entry.last_accessed = Instant::now();
            Some(entry)
        } else {
            None
        }
    }

    /// 检查是否存在
    pub fn contains(&self, key: &PageKey) -> bool {
        self.entries.contains_key(key)
    }

    /// 插入页面（自动驱逐）
    pub fn insert(
        &mut self,
        key: PageKey,
        data: Vec<u8>,
        mime_type: String,
        current_index: usize,
        read_direction: i32,
    ) -> usize {
        let size = data.len();

        // 如果已存在，先移除旧的
        if let Some(old) = self.entries.remove(&key) {
            self.total_size = self.total_size.saturating_sub(old.size);
        }

        // 驱逐直到有足够空间
        let mut evicted_count = 0;
        while self.total_size + size > self.max_size && !self.entries.is_empty() {
            if self.evict_one(current_index, read_direction) {
                evicted_count += 1;
            } else {
                break; // 所有页面都被锁定
            }
        }

        // 插入新页面
        self.entries.insert(
            key.clone(),
            CachedPage {
                data,
                page_index: key.page_index,
                size,
                mime_type,
                last_accessed: Instant::now(),
                is_locked: false,
            },
        );
        self.total_size += size;

        log::debug!(
            "📦 MemoryPool: 插入 page {} ({} KB), 总计 {} MB / {} MB, 驱逐 {} 页",
            key.page_index,
            size / 1024,
            self.total_size / 1024 / 1024,
            self.max_size / 1024 / 1024,
            evicted_count
        );

        evicted_count
    }

    /// 驱逐一个页面（距离驱逐策略）
    fn evict_one(&mut self, current_index: usize, direction: i32) -> bool {
        // 找到最应该驱逐的页面
        let victim = self
            .entries
            .iter()
            .filter(|(_, v)| !v.is_locked)
            .max_by(|(_, a), (_, b)| {
                let priority_a = Self::evict_priority(a.page_index, current_index, direction);
                let priority_b = Self::evict_priority(b.page_index, current_index, direction);
                priority_a.cmp(&priority_b)
            })
            .map(|(k, _)| k.clone());

        if let Some(key) = victim {
            if let Some(entry) = self.entries.remove(&key) {
                self.total_size = self.total_size.saturating_sub(entry.size);
                log::debug!(
                    "🗑️ MemoryPool: 驱逐 page {} ({} KB)",
                    entry.page_index,
                    entry.size / 1024
                );
                return true;
            }
        }
        false
    }

    /// 计算驱逐优先级（越大越优先驱逐）
    fn evict_priority(page_index: usize, current_index: usize, direction: i32) -> i32 {
        let diff = page_index as i32 - current_index as i32;

        if direction > 0 {
            // 向前阅读：后面的页面优先保留，前面的优先驱逐
            if diff < 0 {
                // 已经过去的页面 - 高优先级驱逐
                -diff + 1000
            } else {
                // 前面的页面 - 距离越远优先级越高
                diff
            }
        } else {
            // 向后阅读：前面的页面优先保留
            if diff > 0 {
                diff + 1000
            } else {
                -diff
            }
        }
    }

    /// 锁定页面（防止驱逐）
    pub fn lock(&mut self, key: &PageKey) -> bool {
        if let Some(entry) = self.entries.get_mut(key) {
            entry.is_locked = true;
            true
        } else {
            false
        }
    }

    /// 解锁页面
    pub fn unlock(&mut self, key: &PageKey) -> bool {
        if let Some(entry) = self.entries.get_mut(key) {
            entry.is_locked = false;
            true
        } else {
            false
        }
    }

    /// 锁定多个页面
    pub fn lock_range(&mut self, book_path: &str, start: usize, end: usize) {
        for (key, entry) in self.entries.iter_mut() {
            if key.book_path == book_path && key.page_index >= start && key.page_index <= end {
                entry.is_locked = true;
            }
        }
    }

    /// 解锁所有页面
    pub fn unlock_all(&mut self) {
        for entry in self.entries.values_mut() {
            entry.is_locked = false;
        }
    }

    /// 清除指定书籍的缓存
    pub fn clear_book(&mut self, book_path: &str) {
        let keys_to_remove: Vec<_> = self
            .entries
            .keys()
            .filter(|k| k.book_path == book_path)
            .cloned()
            .collect();

        let mut removed_size = 0;
        for key in &keys_to_remove {
            if let Some(entry) = self.entries.remove(key) {
                removed_size += entry.size;
            }
        }

        self.total_size = self.total_size.saturating_sub(removed_size);

        if !keys_to_remove.is_empty() {
            log::debug!(
                "🧹 MemoryPool: 清除 {} 页 ({} MB)",
                keys_to_remove.len(),
                removed_size / 1024 / 1024
            );
        }
    }

    /// 清除所有缓存
    pub fn clear_all(&mut self) {
        self.entries.clear();
        self.total_size = 0;
        log::debug!("🧹 MemoryPool: 清除所有缓存");
    }

    /// 获取统计信息
    pub fn stats(&self) -> MemoryPoolStats {
        let locked_count = self.entries.values().filter(|e| e.is_locked).count();

        MemoryPoolStats {
            entry_count: self.entries.len(),
            total_size: self.total_size,
            max_size: self.max_size,
            usage_percent: if self.max_size > 0 {
                (self.total_size as f64 / self.max_size as f64 * 100.0) as u8
            } else {
                0
            },
            locked_count,
        }
    }

    /// 获取所有缓存的页面索引
    pub fn cached_pages(&self, book_path: &str) -> Vec<usize> {
        self.entries
            .keys()
            .filter(|k| k.book_path == book_path)
            .map(|k| k.page_index)
            .collect()
    }
}

impl Default for MemoryPool {
    fn default() -> Self {
        Self::new(512) // 默认 512MB
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_insert_and_get() {
        let mut pool = MemoryPool::new(10); // 10MB

        let key = PageKey::new("test.zip", 0);
        pool.insert(key.clone(), vec![0; 1024], "image/jpeg".to_string(), 0, 1);

        assert!(pool.contains(&key));
        assert!(pool.get(&key).is_some());
    }

    #[test]
    fn test_eviction() {
        let mut pool = MemoryPool::new(1); // 1MB

        // 插入超过限制的数据
        for i in 0..20 {
            let key = PageKey::new("test.zip", i);
            pool.insert(
                key,
                vec![0; 100 * 1024], // 100KB
                "image/jpeg".to_string(),
                10,
                1,
            );
        }

        // 应该只保留部分页面
        assert!(pool.entries.len() < 20);
    }

    #[test]
    fn test_lock_prevents_eviction() {
        let mut pool = MemoryPool::new(1); // 1MB

        // 插入并锁定第一页
        let key0 = PageKey::new("test.zip", 0);
        pool.insert(
            key0.clone(),
            vec![0; 500 * 1024],
            "image/jpeg".to_string(),
            0,
            1,
        );
        pool.lock(&key0);

        // 插入更多数据触发驱逐
        for i in 1..10 {
            let key = PageKey::new("test.zip", i);
            pool.insert(key, vec![0; 200 * 1024], "image/jpeg".to_string(), 5, 1);
        }

        // 第一页应该还在（被锁定）
        assert!(pool.contains(&key0));
    }
}
