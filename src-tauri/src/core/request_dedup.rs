//! 请求去重模块
//!
//! 使用 dashmap 实现高性能并发去重，避免快速翻页时发送重复请求

use dashmap::DashMap;
use log::debug;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

/// 去重统计
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct DeduplicatorStats {
    /// 总请求数
    pub total_requests: u64,
    /// 去重数（被跳过的重复请求）
    pub deduplicated: u64,
    /// 当前活跃请求数
    pub active_requests: usize,
}

/// 请求状态
#[derive(Debug, Clone)]
struct RequestState {
    started_at: Instant,
    request_id: u64,
}

/// 请求去重器
///
/// 使用 dashmap（无锁并发 HashMap）实现高性能去重
pub struct RequestDeduplicator {
    /// 活跃请求
    pending: DashMap<String, RequestState>,
    /// 请求超时
    timeout: Duration,
    /// 请求 ID 计数器
    next_id: AtomicU64,
    /// 统计
    total_requests: AtomicU64,
    deduplicated: AtomicU64,
}

impl RequestDeduplicator {
    /// 创建去重器
    pub fn new() -> Self {
        Self::with_timeout(Duration::from_secs(30))
    }

    /// 使用自定义超时创建
    pub fn with_timeout(timeout: Duration) -> Self {
        Self {
            pending: DashMap::new(),
            timeout,
            next_id: AtomicU64::new(1),
            total_requests: AtomicU64::new(0),
            deduplicated: AtomicU64::new(0),
        }
    }

    /// 尝试获取处理权
    ///
    /// 返回 Some(request_id) 表示可以处理，None 表示应跳过
    pub fn try_acquire(&self, key: &str) -> Option<u64> {
        self.total_requests.fetch_add(1, Ordering::Relaxed);

        // 检查是否已有相同请求
        if let Some(state) = self.pending.get(key) {
            if state.started_at.elapsed() < self.timeout {
                self.deduplicated.fetch_add(1, Ordering::Relaxed);
                debug!("🔄 请求去重: key={}", key);
                return None;
            }
        }

        // 分配新的请求 ID
        let request_id = self.next_id.fetch_add(1, Ordering::Relaxed);
        self.pending.insert(
            key.to_string(),
            RequestState {
                started_at: Instant::now(),
                request_id,
            },
        );

        Some(request_id)
    }

    /// 标记请求完成
    pub fn release(&self, key: &str) {
        self.pending.remove(key);
    }

    /// 标记请求完成（验证 ID）
    pub fn release_with_id(&self, key: &str, request_id: u64) {
        if let Some(state) = self.pending.get(key) {
            if state.request_id == request_id {
                drop(state); // 释放引用
                self.pending.remove(key);
            }
        }
    }

    /// 检查请求是否活跃
    pub fn is_active(&self, key: &str) -> bool {
        self.pending.contains_key(key)
    }

    /// 获取统计
    pub fn stats(&self) -> DeduplicatorStats {
        DeduplicatorStats {
            total_requests: self.total_requests.load(Ordering::Relaxed),
            deduplicated: self.deduplicated.load(Ordering::Relaxed),
            active_requests: self.pending.len(),
        }
    }

    /// 清除所有
    pub fn clear(&self) {
        self.pending.clear();
    }

    /// 清理过期请求
    pub fn cleanup_expired(&self) {
        let timeout = self.timeout;
        self.pending
            .retain(|_, state| state.started_at.elapsed() < timeout);
    }
}

impl Default for RequestDeduplicator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deduplication() {
        let dedup = RequestDeduplicator::new();

        let id1 = dedup.try_acquire("key1");
        assert!(id1.is_some());

        let id2 = dedup.try_acquire("key1");
        assert!(id2.is_none());

        dedup.release("key1");
        let id3 = dedup.try_acquire("key1");
        assert!(id3.is_some());
    }

    #[test]
    fn test_stats() {
        let dedup = RequestDeduplicator::new();

        dedup.try_acquire("key1");
        dedup.try_acquire("key1");
        dedup.try_acquire("key2");

        let stats = dedup.stats();
        assert_eq!(stats.total_requests, 3);
        assert_eq!(stats.deduplicated, 1);
        assert_eq!(stats.active_requests, 2);
    }
}
