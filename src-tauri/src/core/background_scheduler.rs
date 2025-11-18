use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use chrono::{DateTime, Utc};
use tauri::async_runtime::JoinHandle;
use tokio::sync::Semaphore;

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundTaskRecord {
    pub job_type: String,
    pub source: String,
    pub started_at: DateTime<Utc>,
    pub finished_at: DateTime<Utc>,
    pub duration_ms: u128,
    pub status: BackgroundTaskStatus,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BackgroundTaskStatus {
    Success,
    Failed,
}

#[derive(Clone)]
pub struct BackgroundTaskScheduler {
    concurrency: Arc<Semaphore>,
    metrics: Arc<BackgroundTaskMetrics>,
}

impl BackgroundTaskScheduler {
    pub fn new(concurrency: usize, history: usize) -> Self {
        Self {
            concurrency: Arc::new(Semaphore::new(concurrency.max(1))),
            metrics: Arc::new(BackgroundTaskMetrics::new(history)),
        }
    }

    pub fn snapshot(&self) -> BackgroundSchedulerSnapshot {
        self.metrics.snapshot()
    }

    pub async fn enqueue_blocking<T, E, F, R>(
        &self,
        job_type: impl Into<String>,
        source: impl Into<String>,
        work: F,
    ) -> Result<T, E>
    where
        T: Send + 'static,
        E: From<String> + Send + 'static,
        F: FnOnce() -> Result<T, E> + Send + 'static,
    {
        let job_type = job_type.into();
        let source = source.into();
        self.metrics.queue_depth.fetch_add(1, Ordering::SeqCst);
        let permit = self
            .concurrency
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| "调度器不可用".to_string())
            .map_err(E::from)?;
        self.metrics.queue_depth.fetch_sub(1, Ordering::SeqCst);
        self.metrics.running.fetch_add(1, Ordering::SeqCst);

        let metrics = Arc::clone(&self.metrics);
        let job_type_clone = job_type.clone();
        let source_clone = source.clone();
        let start = Instant::now();
        let started_at = Utc::now();

        let handle: JoinHandle<Result<T, E>> = tauri::async_runtime::spawn_blocking(move || work());
        let result = handle
            .await
            .map_err(|e| format!("后台任务执行失败: {}", e))
            .map_err(E::from)?;

        let finished_at = Utc::now();
        let duration = start.elapsed().as_millis();
        self.metrics.running.fetch_sub(1, Ordering::SeqCst);
        match &result {
            Ok(_) => {
                self.metrics.completed.fetch_add(1, Ordering::SeqCst);
                metrics.record(BackgroundTaskRecord {
                    job_type: job_type_clone,
                    source: source_clone,
                    started_at,
                    finished_at,
                    duration_ms: duration,
                    status: BackgroundTaskStatus::Success,
                });
            }
            Err(_) => {
                self.metrics.failed.fetch_add(1, Ordering::SeqCst);
                metrics.record(BackgroundTaskRecord {
                    job_type: job_type_clone,
                    source: source_clone,
                    started_at,
                    finished_at,
                    duration_ms: duration,
                    status: BackgroundTaskStatus::Failed,
                });
            }
        }
        drop(permit);
        result
    }
}

struct BackgroundTaskMetrics {
    queue_depth: AtomicUsize,
    running: AtomicUsize,
    completed: AtomicU64,
    failed: AtomicU64,
    history_limit: usize,
    history: Mutex<VecDeque<BackgroundTaskRecord>>,
}

impl BackgroundTaskMetrics {
    fn new(history_limit: usize) -> Self {
        Self {
            queue_depth: AtomicUsize::new(0),
            running: AtomicUsize::new(0),
            completed: AtomicU64::new(0),
            failed: AtomicU64::new(0),
            history_limit: history_limit.max(1),
            history: Mutex::new(VecDeque::new()),
        }
    }

    fn record(&self, record: BackgroundTaskRecord) {
        let mut history = self.history.lock().unwrap();
        if history.len() >= self.history_limit {
            history.pop_front();
        }
        history.push_back(record);
    }

    fn snapshot(&self) -> BackgroundSchedulerSnapshot {
        let history = self.history.lock().unwrap();
        BackgroundSchedulerSnapshot {
            queue_depth: self.queue_depth.load(Ordering::SeqCst),
            running: self.running.load(Ordering::SeqCst),
            completed: self.completed.load(Ordering::SeqCst),
            failed: self.failed.load(Ordering::SeqCst),
            recent_tasks: history.iter().cloned().collect(),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundSchedulerSnapshot {
    pub queue_depth: usize,
    pub running: usize,
    pub completed: u64,
    pub failed: u64,
    pub recent_tasks: Vec<BackgroundTaskRecord>,
}
