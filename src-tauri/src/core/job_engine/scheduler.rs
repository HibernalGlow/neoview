//! NeoView - Job Scheduler
//! 参考 NeeView 的 JobScheduler，实现优先级调度

use super::job::{Job, JobPriority};
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap};
use std::sync::Arc;
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

/// 带优先级的任务包装
struct PrioritizedJob {
    job: Job,
    sequence: u64,
}

impl Ord for PrioritizedJob {
    fn cmp(&self, other: &Self) -> Ordering {
        // 优先级高的在前
        match (self.job.priority as u8).cmp(&(other.job.priority as u8)) {
            Ordering::Equal => {
                // 相同优先级按序号 (FIFO，序号小的在前)
                other.sequence.cmp(&self.sequence)
            }
            other => other,
        }
    }
}

impl PartialOrd for PrioritizedJob {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl PartialEq for PrioritizedJob {
    fn eq(&self, other: &Self) -> bool {
        self.sequence == other.sequence
    }
}

impl Eq for PrioritizedJob {}

/// 调度器统计信息
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerStats {
    /// 队列中的任务数
    pub queue_size: usize,
    /// 活跃任务数（包含正在执行的）
    pub active_count: usize,
    /// 序号计数
    pub sequence: u64,
}

/// Job 调度器
pub struct JobScheduler {
    /// 优先级队列
    queue: BinaryHeap<PrioritizedJob>,
    /// 活跃任务的取消令牌 (key -> token)
    active_tokens: HashMap<String, CancellationToken>,
    /// 序号计数器（保证 FIFO）
    sequence: u64,
    /// 通知器（通知 Worker 有新任务）
    notify: Arc<Notify>,
}

impl JobScheduler {
    pub fn new() -> Self {
        Self {
            queue: BinaryHeap::new(),
            active_tokens: HashMap::new(),
            sequence: 0,
            notify: Arc::new(Notify::new()),
        }
    }

    /// 获取通知器的克隆
    pub fn notify(&self) -> Arc<Notify> {
        Arc::clone(&self.notify)
    }

    /// 入队任务
    pub fn enqueue(&mut self, job: Job) -> CancellationToken {
        let key = job.key.clone();

        // 取消相同 key 的旧任务
        if let Some(old_token) = self.active_tokens.remove(&key) {
            old_token.cancel();
            log::debug!("📋 JobScheduler: 取消旧任务 {}", key);
        }

        // 创建新的取消令牌
        let token = CancellationToken::new();
        self.active_tokens.insert(key.clone(), token.clone());

        // 入队
        self.sequence += 1;
        log::debug!(
            "📋 JobScheduler: 入队 {} (priority={:?}, seq={})",
            key,
            job.priority,
            self.sequence
        );

        self.queue.push(PrioritizedJob {
            job,
            sequence: self.sequence,
        });

        // 通知 Worker
        self.notify.notify_one();

        token
    }

    /// 批量入队（用于预加载）
    pub fn enqueue_batch(&mut self, jobs: Vec<Job>) -> Vec<CancellationToken> {
        jobs.into_iter().map(|job| self.enqueue(job)).collect()
    }

    /// 取消指定前缀的所有任务
    pub fn cancel_by_prefix(&mut self, prefix: &str) {
        let keys_to_cancel: Vec<_> = self
            .active_tokens
            .keys()
            .filter(|k| k.starts_with(prefix))
            .cloned()
            .collect();

        for key in &keys_to_cancel {
            if let Some(token) = self.active_tokens.remove(key) {
                token.cancel();
            }
        }

        if !keys_to_cancel.is_empty() {
            log::debug!(
                "📋 JobScheduler: 取消 {} 个任务 (prefix={})",
                keys_to_cancel.len(),
                prefix
            );
        }
    }

    /// 取消所有任务
    pub fn cancel_all(&mut self) {
        for (_, token) in self.active_tokens.drain() {
            token.cancel();
        }
        self.queue.clear();
        log::debug!("📋 JobScheduler: 取消所有任务");
    }

    /// 尝试获取下一个任务（非阻塞）
    pub fn try_dequeue(&mut self, min_priority: JobPriority) -> Option<(Job, CancellationToken)> {
        loop {
            // 查看队首
            let pj = self.queue.peek()?;

            // 检查优先级
            if (pj.job.priority as u8) < (min_priority as u8) {
                return None;
            }

            // 弹出任务
            let pj = self.queue.pop().unwrap();
            let key = &pj.job.key;

            // 检查任务是否已取消
            if let Some(token) = self.active_tokens.get(key) {
                if !token.is_cancelled() {
                    let token = token.clone();
                    return Some((pj.job, token));
                }
            }
            // 任务已取消，继续下一个
        }
    }

    /// 标记任务完成
    pub fn complete(&mut self, key: &str) {
        self.active_tokens.remove(key);
    }

    /// 获取统计信息
    pub fn stats(&self) -> SchedulerStats {
        SchedulerStats {
            queue_size: self.queue.len(),
            active_count: self.active_tokens.len(),
            sequence: self.sequence,
        }
    }

    /// 检查任务是否存在
    pub fn has_job(&self, key: &str) -> bool {
        self.active_tokens.contains_key(key)
    }

    /// 唤醒所有等待的 Worker
    pub fn wake_all(&self) {
        self.notify.notify_waiters();
    }
}

impl Default for JobScheduler {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::job_engine::job::{JobCategory, JobOutput, JobResult};

    fn dummy_job(key: &str, priority: JobPriority) -> Job {
        Job::new(
            key.to_string(),
            priority,
            JobCategory::PageContent,
            |_token| async { Ok(JobOutput::Empty) },
        )
    }

    #[test]
    fn test_priority_order() {
        let mut scheduler = JobScheduler::new();

        // 入队不同优先级的任务
        scheduler.enqueue(dummy_job("low", JobPriority::Thumbnail));
        scheduler.enqueue(dummy_job("mid", JobPriority::Preload));
        scheduler.enqueue(dummy_job("high", JobPriority::CurrentPage));

        // 应该按优先级顺序出队
        let (job, _) = scheduler.try_dequeue(JobPriority::Thumbnail).unwrap();
        assert_eq!(job.key, "high");

        let (job, _) = scheduler.try_dequeue(JobPriority::Thumbnail).unwrap();
        assert_eq!(job.key, "mid");

        let (job, _) = scheduler.try_dequeue(JobPriority::Thumbnail).unwrap();
        assert_eq!(job.key, "low");
    }

    #[test]
    fn test_cancel_replaces_old() {
        let mut scheduler = JobScheduler::new();

        let token1 = scheduler.enqueue(dummy_job("same_key", JobPriority::CurrentPage));
        let token2 = scheduler.enqueue(dummy_job("same_key", JobPriority::CurrentPage));

        // 旧任务应该被取消
        assert!(token1.is_cancelled());
        assert!(!token2.is_cancelled());
    }
}
