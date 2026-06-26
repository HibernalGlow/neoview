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

/// Worker 启动状态（内部可变性）
struct WorkerState {
    handles: Vec<tokio::task::JoinHandle<()>>,
    is_running: bool,
}

/// Job Engine
///
/// 管理任务队列和工作线程池
pub struct JobEngine {
    /// 调度器
    scheduler: Arc<Mutex<JobScheduler>>,
    /// 结果接收器（暂未使用）
    #[allow(dead_code)]
    result_rx: std::sync::Mutex<Option<mpsc::Receiver<JobCompletedEvent>>>,
    /// 结果发送器（用于创建 workers）
    result_tx: mpsc::Sender<JobCompletedEvent>,
    /// 关闭信号发送器
    shutdown_tx: broadcast::Sender<()>,
    /// Worker 状态（使用 std::sync::Mutex 以便在非 async 上下文修改）
    worker_state: std::sync::Mutex<WorkerState>,
    /// 配置
    config: JobEngineConfig,
}

impl JobEngine {
    /// 创建新的 Job Engine（延迟启动模式）
    ///
    /// Workers 会在首次提交任务时自动启动
    pub fn new(config: JobEngineConfig) -> Self {
        let scheduler = Arc::new(Mutex::new(JobScheduler::new()));
        let (result_tx, result_rx) = mpsc::channel(RESULT_CHANNEL_SIZE);
        let (shutdown_tx, _) = broadcast::channel(1);

        Self {
            scheduler,
            result_rx: std::sync::Mutex::new(Some(result_rx)),
            result_tx,
            shutdown_tx,
            worker_state: std::sync::Mutex::new(WorkerState {
                handles: Vec::new(),
                is_running: false,
            }),
            config,
        }
    }

    /// 确保 Workers 已启动（在 tokio runtime 上下文中调用）
    fn ensure_started(&self) {
        let mut state = self.worker_state.lock().unwrap();
        if state.is_running {
            return;
        }

        // 创建 Workers
        for i in 0..self.config.worker_count {
            let worker_config = if i < self.config.primary_count {
                WorkerConfig::primary(i)
            } else {
                WorkerConfig::secondary(i)
            };

            let worker = JobWorker::new(
                worker_config,
                Arc::clone(&self.scheduler),
                self.result_tx.clone(),
            );

            let shutdown_rx = self.shutdown_tx.subscribe();
            state.handles.push(tokio::spawn(worker.run(shutdown_rx)));
        }

        log::info!(
            "🚀 JobEngine 启动: {} workers ({} primary, {} secondary)",
            self.config.worker_count,
            self.config.primary_count,
            self.config.worker_count - self.config.primary_count
        );

        state.is_running = true;
    }

    /// 使用默认配置创建
    pub fn with_defaults() -> Self {
        Self::new(JobEngineConfig::default())
    }

    /// 提交单个任务
    pub async fn submit(&self, job: Job) -> tokio_util::sync::CancellationToken {
        self.ensure_started();
        let mut scheduler = self.scheduler.lock().await;
        scheduler.enqueue(job)
    }

    /// 批量提交任务
    pub async fn submit_batch(&self, jobs: Vec<Job>) -> Vec<tokio_util::sync::CancellationToken> {
        self.ensure_started();
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

    /// 获取统计信息
    pub async fn stats(&self) -> JobEngineStats {
        let scheduler = self.scheduler.lock().await;
        let state = self.worker_state.lock().unwrap();
        JobEngineStats {
            scheduler: scheduler.stats(),
            worker_count: self.config.worker_count,
            is_running: state.is_running,
        }
    }

    /// 检查任务是否存在
    pub async fn has_job(&self, key: &str) -> bool {
        let scheduler = self.scheduler.lock().await;
        scheduler.has_job(key)
    }

    /// 关闭引擎
    pub async fn shutdown(&self) {
        let is_running = {
            let state = self.worker_state.lock().unwrap();
            state.is_running
        };

        if !is_running {
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
        let handles = {
            let mut state = self.worker_state.lock().unwrap();
            state.is_running = false;
            std::mem::take(&mut state.handles)
        };

        for handle in handles {
            let _ = handle.await;
        }

        log::info!("🛑 JobEngine 已关闭");
    }

    /// 检查是否正在运行
    pub fn is_running(&self) -> bool {
        let state = self.worker_state.lock().unwrap();
        state.is_running
    }
}

impl Drop for JobEngine {
    fn drop(&mut self) {
        let is_running = {
            let state = self.worker_state.lock().unwrap();
            state.is_running
        };
        if is_running {
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
        engine.ensure_started();
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
