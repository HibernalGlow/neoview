//! 延迟批量写入模块
//!
//! 参考 NeeView 的 SaveQueue 设计，使用 dashmap + tokio 实现

use dashmap::DashMap;
use log::{debug, error, info};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Notify;

/// 批量写入统计
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct BatchWriteStats {
    /// 入队请求数
    pub enqueued: u64,
    /// 实际写入次数
    pub writes: u64,
    /// 合并请求数
    pub merged: u64,
}

/// 批量写入器
///
/// 将多次写入合并为一次批量操作，减少 I/O
pub struct BatchWriter<T: Clone + Send + Sync + 'static> {
    /// 写入队列
    queue: Arc<DashMap<String, T>>,
    /// 通知器
    notify: Arc<Notify>,
    /// 统计
    enqueued: AtomicU64,
    merged: AtomicU64,
    writes: AtomicU64,
}

impl<T: Clone + Send + Sync + 'static> BatchWriter<T> {
    /// 创建批量写入器并启动后台任务
    pub fn new<F>(delay: Duration, writer: F) -> Self
    where
        F: Fn(Vec<(String, T)>) -> Result<(), String> + Send + Sync + 'static,
    {
        let queue: Arc<DashMap<String, T>> = Arc::new(DashMap::new());
        let notify = Arc::new(Notify::new());
        let writes = Arc::new(AtomicU64::new(0));

        // 启动后台刷新任务
        {
            let queue = Arc::clone(&queue);
            let notify = Arc::clone(&notify);
            let writes = Arc::clone(&writes);

            tokio::spawn(async move {
                loop {
                    // 等待通知或超时
                    tokio::select! {
                        _ = notify.notified() => {
                            // 收到通知，等待一段时间收集更多请求
                            tokio::time::sleep(delay).await;
                        }
                        _ = tokio::time::sleep(Duration::from_secs(60)) => {
                            // 定期检查
                        }
                    }

                    // 收集队列中的所有项
                    if queue.is_empty() {
                        continue;
                    }

                    let items: Vec<(String, T)> = queue
                        .iter()
                        .map(|entry| (entry.key().clone(), entry.value().clone()))
                        .collect();

                    queue.clear();

                    if items.is_empty() {
                        continue;
                    }

                    let count = items.len();
                    debug!("📝 批量写入 {} 项", count);

                    match writer(items) {
                        Ok(()) => {
                            writes.fetch_add(1, Ordering::Relaxed);
                            info!("📝 批量写入完成: {} 项", count);
                        }
                        Err(e) => {
                            error!("📝 批量写入失败: {}", e);
                        }
                    }
                }
            });
        }

        Self {
            queue,
            notify,
            enqueued: AtomicU64::new(0),
            merged: AtomicU64::new(0),
            writes: AtomicU64::new(0),
        }
    }

    /// 入队写入项
    pub fn enqueue(&self, key: String, value: T) {
        self.enqueued.fetch_add(1, Ordering::Relaxed);

        if self.queue.contains_key(&key) {
            self.merged.fetch_add(1, Ordering::Relaxed);
        }

        self.queue.insert(key, value);
        self.notify.notify_one();
    }

    /// 获取队列大小
    pub fn queue_size(&self) -> usize {
        self.queue.len()
    }

    /// 获取统计
    pub fn stats(&self) -> BatchWriteStats {
        BatchWriteStats {
            enqueued: self.enqueued.load(Ordering::Relaxed),
            writes: self.writes.load(Ordering::Relaxed),
            merged: self.merged.load(Ordering::Relaxed),
        }
    }

    /// 清空队列
    pub fn clear(&self) {
        self.queue.clear();
    }
}

/// 简单的缩略图写入项
#[derive(Clone)]
pub struct ThumbnailItem {
    pub data: Vec<u8>,
    pub created_at: u64,
}
