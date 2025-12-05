//! NeoView - Job Worker
//! 参考 NeeView 的 JobWorker，实现工作线程

use super::job::{JobError, JobOutput, JobPriority, JobResult};
use super::scheduler::JobScheduler;
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, Mutex};

/// Worker 配置
#[derive(Debug, Clone)]
pub struct WorkerConfig {
    /// Worker ID
    pub id: usize,
    /// 是否为主要 Worker（处理高优先级任务）
    pub is_primary: bool,
    /// 最小处理优先级
    pub min_priority: JobPriority,
}

impl WorkerConfig {
    pub fn primary(id: usize) -> Self {
        Self {
            id,
            is_primary: true,
            min_priority: JobPriority::Preload, // Primary 只处理 Preload 及以上
        }
    }

    pub fn secondary(id: usize) -> Self {
        Self {
            id,
            is_primary: false,
            min_priority: JobPriority::Thumbnail, // Secondary 处理所有
        }
    }
}

/// 任务完成事件
#[derive(Debug, Clone)]
pub struct JobCompletedEvent {
    pub key: String,
    pub result: Result<JobOutput, String>,
}

/// Job Worker
pub struct JobWorker {
    config: WorkerConfig,
    scheduler: Arc<Mutex<JobScheduler>>,
    result_tx: mpsc::Sender<JobCompletedEvent>,
}

impl JobWorker {
    pub fn new(
        config: WorkerConfig,
        scheduler: Arc<Mutex<JobScheduler>>,
        result_tx: mpsc::Sender<JobCompletedEvent>,
    ) -> Self {
        Self {
            config,
            scheduler,
            result_tx,
        }
    }

    /// 运行 Worker（阻塞直到收到关闭信号）
    pub async fn run(self, mut shutdown: broadcast::Receiver<()>) {
        let worker_type = if self.config.is_primary {
            "Primary"
        } else {
            "Secondary"
        };
        log::info!(
            "🔧 JobWorker[{}] 启动 ({}, min_priority={:?})",
            self.config.id,
            worker_type,
            self.config.min_priority
        );

        // 获取通知器
        let notify = {
            let scheduler = self.scheduler.lock().await;
            scheduler.notify()
        };

        loop {
            tokio::select! {
                biased;

                // 关闭信号
                _ = shutdown.recv() => {
                    log::info!("🔧 JobWorker[{}] 收到关闭信号", self.config.id);
                    break;
                }

                // 等待新任务通知
                _ = notify.notified() => {
                    self.process_jobs().await;
                }
            }
        }

        log::info!("🔧 JobWorker[{}] 已停止", self.config.id);
    }

    /// 处理队列中的任务
    async fn process_jobs(&self) {
        loop {
            // 尝试获取任务
            let job_opt = {
                let mut scheduler = self.scheduler.lock().await;
                scheduler.try_dequeue(self.config.min_priority)
            };

            let Some((job, token)) = job_opt else {
                break; // 没有更多任务
            };

            let key = job.key.clone();
            log::debug!(
                "🔧 JobWorker[{}] 执行任务: {} (priority={:?})",
                self.config.id,
                key,
                job.priority
            );

            // 执行任务
            let start = std::time::Instant::now();
            let result = (job.executor)(token).await;
            let elapsed = start.elapsed();

            // 记录完成
            {
                let mut scheduler = self.scheduler.lock().await;
                scheduler.complete(&key);
            }

            // 发送结果
            let event = JobCompletedEvent {
                key: key.clone(),
                result: result.map_err(|e| e.message),
            };

            match &event.result {
                Ok(output) => {
                    log::debug!(
                        "✅ JobWorker[{}] 任务完成: {} ({:.1}ms)",
                        self.config.id,
                        key,
                        elapsed.as_secs_f64() * 1000.0
                    );
                }
                Err(e) => {
                    if e.contains("cancelled") || e.contains("Cancelled") {
                        log::debug!("⏹️ JobWorker[{}] 任务取消: {}", self.config.id, key);
                    } else {
                        log::warn!("❌ JobWorker[{}] 任务失败: {} - {}", self.config.id, key, e);
                    }
                }
            }

            if self.result_tx.send(event).await.is_err() {
                log::warn!("JobWorker[{}] 结果通道已关闭", self.config.id);
                break;
            }
        }
    }
}
