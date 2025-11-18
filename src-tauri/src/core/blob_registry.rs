//! NeoView - Blob Registry
//! 统一管理图片 blob 的注册和缓存

use md5;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Blob 条目
#[derive(Debug, Clone)]
struct BlobEntry {
    /// 原始字节数据
    data: Vec<u8>,
    /// MIME 类型
    mime: String,
    /// 创建时间
    created_at: Instant,
    /// 最后访问时间
    last_used: Instant,
    /// 引用计数
    ref_count: usize,
    /// TTL 生存时间
    ttl: Duration,
    /// 关联的路径（用于日志）
    path: Option<String>,
}

impl BlobEntry {
    fn new(data: Vec<u8>, mime: String, ttl: Duration, path: Option<String>) -> Self {
        let now = Instant::now();
        Self {
            data,
            mime,
            created_at: now,
            last_used: now,
            ref_count: 1,
            ttl,
            path,
        }
    }

    /// 增加引用计数
    fn bump(&mut self) {
        self.ref_count += 1;
        self.last_used = Instant::now();
    }

    /// 减少引用计数
    fn release(&mut self) -> bool {
        if self.ref_count > 0 {
            self.ref_count -= 1;
        }
        self.ref_count == 0
    }

    /// 检查是否已过期
    fn is_expired(&self) -> bool {
        self.last_used.elapsed() > self.ttl || self.created_at.elapsed() > self.ttl * 2
    }
}

/// Blob 注册表
pub struct BlobRegistry {
    /// blob 映射：key -> BlobEntry
    map: Arc<Mutex<HashMap<String, BlobEntry>>>,
    /// 最大缓存条目数
    max_entries: usize,
}

impl BlobRegistry {
    /// 创建新的 Blob 注册表
    pub fn new(max_entries: usize) -> Self {
        Self {
            map: Arc::new(Mutex::new(HashMap::new())),
            max_entries,
        }
    }

    /// 获取或注册 blob
    pub fn get_or_register(
        &self,
        data: &[u8],
        mime: &str,
        ttl: Duration,
        path: Option<String>,
    ) -> String {
        let hash = md5::compute(data);
        let key = format!("blob:{:x}", hash);

        let mut map = self.map.lock().unwrap();

        // 检查是否已存在
        if let Some(entry) = map.get_mut(&key) {
            entry.bump();
            return key;
        }

        // 检查缓存大小限制
        if map.len() >= self.max_entries {
            // 清理过期条目
            self.cleanup_expired_internal(&mut map);

            // 如果还是满了，移除最旧的条目
            if map.len() >= self.max_entries {
                if let Some(oldest_key) = map
                    .iter()
                    .min_by_key(|(_, entry)| entry.last_used)
                    .map(|(k, _)| k.clone())
                {
                    map.remove(&oldest_key);
                    println!("🗑️ BlobRegistry: 移除最旧条目 {}", oldest_key);
                }
            }
        }

        // 创建新条目
        let blob_url = key.clone();
        map.insert(
            key,
            BlobEntry::new(data.to_vec(), mime.to_string(), ttl, path.clone()),
        );

        // 显示路径信息（如果有）
        if let Some(ref p) = path {
            println!(
                "📝 BlobRegistry: 注册新 blob {} ({} bytes, {}) - {}",
                blob_url,
                data.len(),
                mime,
                p
            );
        } else {
            println!(
                "📝 BlobRegistry: 注册新 blob {} ({} bytes, {})",
                blob_url,
                data.len(),
                mime
            );
        }

        blob_url
    }

    /// 获取 blob 数据
    pub fn fetch_bytes(&self, key: &str) -> Option<Vec<u8>> {
        let mut map = self.map.lock().unwrap();
        if let Some(entry) = map.get_mut(key) {
            entry.bump();
            Some(entry.data.clone())
        } else {
            None
        }
    }

    /// 释放 blob 引用
    pub fn release(&self, key: &str) -> bool {
        let mut map = self.map.lock().unwrap();
        if let Some(entry) = map.get_mut(key) {
            if entry.release() {
                // 引用计数为 0，移除条目
                map.remove(key);
                println!("🗑️ BlobRegistry: 释放 blob {}", key);
                return true;
            }
        }
        false
    }

    /// 清理过期条目
    pub fn sweep_expired(&self) -> usize {
        let mut map = self.map.lock().unwrap();
        let initial_len = map.len();

        // 保留未过期的条目
        map.retain(|_, entry| !entry.is_expired());

        let removed = initial_len - map.len();
        if removed > 0 {
            println!("🧹 BlobRegistry: 清理了 {} 个过期条目", removed);
        }

        removed
    }

    /// 内部清理方法（已持有锁）
    fn cleanup_expired_internal(&self, map: &mut HashMap<String, BlobEntry>) {
        let initial_len = map.len();

        // 保留未过期的条目
        map.retain(|_, entry| !entry.is_expired());

        let removed = initial_len - map.len();
        if removed > 0 {
            println!("🧹 BlobRegistry: 清理了 {} 个过期条目", removed);
        }
    }

    /// 获取统计信息
    pub fn get_stats(&self) -> BlobStats {
        let map = self.map.lock().unwrap();
        let total_entries = map.len();
        let total_bytes: usize = map.values().map(|entry| entry.data.len()).sum();
        let expired_count = map.values().filter(|entry| entry.is_expired()).count();

        BlobStats {
            total_entries,
            total_bytes,
            expired_count,
            max_entries: self.max_entries,
        }
    }
}

/// Blob 统计信息
#[derive(Debug, Clone, serde::Serialize)]
pub struct BlobStats {
    /// 总条目数
    pub total_entries: usize,
    /// 总字节数
    pub total_bytes: usize,
    /// 过期条目数
    pub expired_count: usize,
    /// 最大条目数
    pub max_entries: usize,
}

impl Default for BlobRegistry {
    fn default() -> Self {
        Self::new(1024) // 默认最多 1024 个 blob
    }
}
