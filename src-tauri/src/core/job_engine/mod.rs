//! NeoView - Job Engine
//! 参考 NeeView 的 JobEngine，实现后端任务调度系统
//!
//! ## 架构
//!
//! ```text
//! JobEngine
//!   ├── JobScheduler (优先级队列)
//!   ├── JobWorker[0] (Primary - 高优先级)
//!   ├── JobWorker[1] (Primary - 高优先级)
//!   ├── JobWorker[2] (Secondary - 所有任务)
//!   └── JobWorker[N] (Secondary - 所有任务)
//! ```
//!
//! ## 优先级
//!
//! - `Urgent (100)`: 紧急任务（切书等）
//! - `CurrentPage (90)`: 当前页面加载
//! - `Preload (50)`: 预加载页面
//! - `Thumbnail (10)`: 缩略图加载

mod job;
mod scheduler;
mod worker;

pub use job::{Job, JobCategory, JobError, JobOutput, JobPriority, JobResult};
pub use scheduler::{JobScheduler, SchedulerStats};
pub use worker::{JobCompletedEvent, JobWorker, WorkerConfig};

use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, Mutex};

/// 默认 Worker 数量
const DEFAULT_WORKER_COUNT: usize = 4;
/// Primary Worker 数量（处理高优先级任务）
const PRIMARY_WORKER_COUNT: usize = 2;
/// 结果通道缓冲区大小
const RESULT_CHANNEL_SIZE: usize = 1024;

/// Job Engine 配置
#[derive(Debug, Clone)]
pub struct JobEngineConfig {
    /// Worker 总数
    pub worker_count: usize,
    /// Primary Worker 数量
    pub primary_count: usize,
}

impl Default for JobEngineConfig {
    fn default() -> Self {
        Self {
            worker_count: DEFAULT_WORKER_COUNT,
            primary_count: PRIMARY_WORKER_COUNT,
        }
    }
}

/// Job Engine 统计信息
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobEngineStats {
    /// 调度器统计
    pub scheduler: SchedulerStats,
    /// Worker 数量
    pub worker_count: usize,
    /// 是否正在运行
    pub is_running: bool,
}

/// Job Engine
///
/// 管理任务队列和工作线程池
pub struct JobEngine {
    /// 调度器
    scheduler: Arc<Mutex<JobScheduler>>,
    /// 结果接收器
    result_rx: mpsc::Receiver<JobCompletedEvent>,
    /// 关闭信号发送器
    shutdown_tx: broadcast::Sender<()>,
    /// Worker 句柄
    worker_handles: Vec<tokio::task::JoinHandle<()>>,
    /// 配置
    config: JobEngineConfig,
    /// 是否正在运行
    is_running: bool,
}

impl JobEngine {
    /// 创建新的 Job Engine
    pub fn new(config: JobEngineConfig) -> Self {
        let scheduler = Arc::new(Mutex::new(JobScheduler::new()));
        let (result_tx, result_rx) = mpsc::channel(RESULT_CHANNEL_SIZE);
        let (shutdown_tx, _) = broadcast::channel(1);

        let mut worker_handles = Vec::with_capacity(config.worker_count);

        // 创建 Workers
        for i in 0..config.worker_count {
            let worker_config = if i < config.primary_count {
                WorkerConfig::primary(i)
            } else {
                WorkerConfig::secondary(i)
            };

            let worker = JobWorker::new(
                worker_config,
                Arc::clone(&scheduler),
                result_tx.clone(),
            );

            let shutdown_rx = shutdown_tx.subscribe();
            worker_handles.push(tokio::spawn(worker.run(shutdown_rx)));
        }

        log::info!(
            "🚀 JobEngine 启动: {} workers ({} primary, {} secondary)",
            config.worker_count,
            config.primary_count,
            config.worker_count - config.primary_count
        );

        Self {
            scheduler,
            result_rx,
            shutdown_tx,
            worker_handles,
            config,
            is_running: true,
        }
    }

    /// 使用默认配置创建
    pub fn with_defaults() -> Self {
        Self::new(JobEngineConfig::default())
    }

    /// 提交单个任务
    pub async fn submit(&self, job: Job) -> tokio_util::sync::CancellationToken {
        let mut scheduler = self.scheduler.lock().await;
        scheduler.enqueue(job)
    }

    /// 批量提交任务
    pub async fn submit_batch(&self, jobs: Vec<Job>) -> Vec<tokio_util::sync::CancellationToken> {
        let mut scheduler = self.scheduler.lock().await;
        scheduler.enqueue_batch(jobs)
    }

    /// 取消指定书籍的所有任务
    pub async fn cancel_book(&self, book_path: &str) {
        let mut scheduler = self.scheduler.lock().await;
        scheduler.cancel_by_prefix(&format!("page:{}:", book_path));
    }

    /// 取消所有任务
    pub async fn cancel_all(&self) {
        let mut scheduler = self.scheduler.lock().await;
        scheduler.cancel_all();
    }

    /// 获取结果接收器的可变引用
    pub fn result_receiver(&mut self) -> &mut mpsc::Receiver<JobCompletedEvent> {
        &mut self.result_rx
    }

    /// 尝试接收下一个结果（非阻塞）
    pub fn try_recv_result(&mut self) -> Option<JobCompletedEvent> {
        self.result_rx.try_recv().ok()
    }

    /// 获取统计信息
    pub async fn stats(&self) -> JobEngineStats {
        let scheduler = self.scheduler.lock().await;
        JobEngineStats {
            scheduler: scheduler.stats(),
            worker_count: self.config.worker_count,
            is_running: self.is_running,
        }
    }

    /// 检查任务是否存在
    pub async fn has_job(&self, key: &str) -> bool {
        let scheduler = self.scheduler.lock().await;
        scheduler.has_job(key)
    }

    /// 关闭引擎
    pub async fn shutdown(mut self) {
        if !self.is_running {
            return;
        }

        log::info!("🛑 JobEngine 正在关闭...");

        // 取消所有任务
        self.cancel_all().await;

        // 发送关闭信号
        let _ = self.shutdown_tx.send(());

        // 唤醒所有 Worker
        {
            let scheduler = self.scheduler.lock().await;
            scheduler.wake_all();
        }

        // 等待所有 Worker 完成
        let handles = std::mem::take(&mut self.worker_handles);
        for handle in handles {
            let _ = handle.await;
        }

        self.is_running = false;
        log::info!("🛑 JobEngine 已关闭");
    }

    /// 检查是否正在运行
    pub fn is_running(&self) -> bool {
        self.is_running
    }
}

impl Drop for JobEngine {
    fn drop(&mut self) {
        if self.is_running {
            // 发送关闭信号（异步关闭在 shutdown() 中处理）
            let _ = self.shutdown_tx.send(());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_engine_creation() {
        let engine = JobEngine::with_defaults();
        assert!(engine.is_running());

        let stats = engine.stats().await;
        assert_eq!(stats.worker_count, DEFAULT_WORKER_COUNT);

        engine.shutdown().await;
    }

    #[tokio::test]
    async fn test_submit_job() {
        let engine = JobEngine::with_defaults();

        let job = Job::new(
            "test:1".to_string(),
            JobPriority::CurrentPage,
            JobCategory::PageContent,
            |_token| async { Ok(JobOutput::Empty) },
        );

        let token = engine.submit(job).await;
        assert!(!token.is_cancelled());

        // 等待一下让任务执行
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        engine.shutdown().await;
    }
}
