//! Upscale Scheduler
//! 负责将前端提交的超分任务排队、并发执行，并通过事件回传状态

use crate::{
    commands::pyo3_upscale_commands::PyO3UpscalerState,
    core::pyo3_upscaler::{PyO3Upscaler, UpscaleModel},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, Notify};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum UpscaleJobPriority {
    High,
    Normal,
}

impl Default for UpscaleJobPriority {
    fn default() -> Self {
        Self::Normal
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum UpscaleJobOrigin {
    Current,
    Preload,
    Manual,
}

impl Default for UpscaleJobOrigin {
    fn default() -> Self {
        Self::Current
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpscaleJobRequest {
    pub book_id: Option<String>,
    pub book_path: Option<String>,
    pub page_index: i32,
    pub image_hash: String,
    pub image_data: Vec<u8>,
    #[serde(default)]
    pub priority: UpscaleJobPriority,
    #[serde(default)]
    pub origin: UpscaleJobOrigin,
    pub condition_id: Option<String>,
    pub model_name: String,
    pub scale: i32,
    pub tile_size: i32,
    pub noise_level: i32,
    pub gpu_id: Option<i32>,
    #[serde(default = "default_allow_cache")]
    pub allow_cache: bool,
    #[serde(default)]
    pub background: bool,
}

fn default_allow_cache() -> bool {
    true
}

#[derive(Debug, Clone)]
struct UpscaleJobHandle {
    record: UpscaleJobRecord,
    cancel_flag: Arc<AtomicBool>,
}

#[derive(Debug, Clone)]
struct UpscaleJobRecord {
    id: Uuid,
    request: UpscaleJobRequest,
}

impl UpscaleJobHandle {
    fn new(request: UpscaleJobRequest) -> Self {
        Self {
            record: UpscaleJobRecord {
                id: Uuid::new_v4(),
                request,
            },
            cancel_flag: Arc::new(AtomicBool::new(false)),
        }
    }

    fn is_cancelled(&self) -> bool {
        self.cancel_flag.load(Ordering::Relaxed)
    }

    fn cancel(&self) {
        self.cancel_flag.store(true, Ordering::Relaxed);
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum UpscaleJobStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpscaleJobEventPayload {
    pub job_id: String,
    pub status: UpscaleJobStatus,
    pub book_id: Option<String>,
    pub book_path: Option<String>,
    pub page_index: i32,
    pub image_hash: String,
    pub origin: UpscaleJobOrigin,
    pub priority: UpscaleJobPriority,
    pub condition_id: Option<String>,
    pub error: Option<String>,
    pub cache_path: Option<String>,
    pub result_data: Option<Vec<u8>>,
    pub background: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpscaleSchedulerStats {
    pub queued_high: usize,
    pub queued_normal: usize,
    pub running: usize,
}

struct UpscaleSchedulerInner {
    queue_high: Mutex<VecDeque<Arc<UpscaleJobHandle>>>,
    queue_normal: Mutex<VecDeque<Arc<UpscaleJobHandle>>>,
    waiting_map: Mutex<HashMap<Uuid, Arc<UpscaleJobHandle>>>,
    running_map: Mutex<HashMap<Uuid, Arc<UpscaleJobHandle>>>,
    notify: Notify,
    workers: usize,
    app_handle: AppHandle,
    py_state: Arc<PyO3UpscalerState>,
}

impl UpscaleSchedulerInner {
    fn new(
        app_handle: AppHandle,
        py_state: Arc<PyO3UpscalerState>,
        workers: usize,
    ) -> Arc<Self> {
        Arc::new(Self {
            queue_high: Mutex::new(VecDeque::new()),
            queue_normal: Mutex::new(VecDeque::new()),
            waiting_map: Mutex::new(HashMap::new()),
            running_map: Mutex::new(HashMap::new()),
            notify: Notify::new(),
            workers,
            app_handle,
            py_state,
        })
    }

    async fn push_job(&self, handle: Arc<UpscaleJobHandle>) {
        {
            let mut waiting = self.waiting_map.lock().await;
            waiting.insert(handle.record.id, handle.clone());
        }

        let mut queue = match handle.record.request.priority {
            UpscaleJobPriority::High => self.queue_high.lock().await,
            UpscaleJobPriority::Normal => self.queue_normal.lock().await,
        };
        queue.push_back(handle);
        drop(queue);
        self.notify.notify_one();
    }

    async fn next_job(&self) -> Arc<UpscaleJobHandle> {
        loop {
            if let Some(job) = self.queue_high.lock().await.pop_front() {
                let mut waiting = self.waiting_map.lock().await;
                waiting.remove(&job.record.id);
                drop(waiting);
                return job;
            }

            if let Some(job) = self.queue_normal.lock().await.pop_front() {
                let mut waiting = self.waiting_map.lock().await;
                waiting.remove(&job.record.id);
                drop(waiting);
                return job;
            }

            self.notify.notified().await;
        }
    }

    async fn mark_running(&self, handle: Arc<UpscaleJobHandle>) {
        let mut running = self.running_map.lock().await;
        running.insert(handle.record.id, handle);
    }

    async fn unmark_running(&self, job_id: &Uuid) {
        let mut running = self.running_map.lock().await;
        running.remove(job_id);
    }

    async fn emit_event(&self, payload: UpscaleJobEventPayload) {
        if let Err(err) = self
            .app_handle
            .emit("upscale-job-event", payload.clone())
        {
            eprintln!("emit upscale-job-event failed: {}", err);
        }
    }

    async fn acquire_manager(&self) -> Result<PyO3Upscaler, String> {
        let manager_guard = self
            .py_state
            .manager
            .lock()
            .map_err(|e| format!("获取 PyO3 管理器锁失败: {}", e))?;
        manager_guard
            .clone()
            .ok_or_else(|| "PyO3 超分管理器未初始化".to_string())
    }

    async fn process_job(&self, handle: Arc<UpscaleJobHandle>) {
        if handle.is_cancelled() {
            self.emit_event(handle.as_cancel_payload(UpscaleJobStatus::Cancelled, None))
                .await;
            return;
        }

        self.mark_running(handle.clone()).await;

        self.emit_event(handle.as_status_payload(UpscaleJobStatus::Running, None, None))
            .await;

        let result = self.execute_job(handle.clone()).await;

        self.unmark_running(&handle.record.id).await;

        match result {
            Ok((bytes, cache_path)) => {
                self.emit_event(handle.as_status_payload(
                    UpscaleJobStatus::Completed,
                    Some(bytes),
                    cache_path,
                ))
                .await;
            }
            Err(err) => {
                if handle.is_cancelled() {
                    self.emit_event(handle.as_cancel_payload(UpscaleJobStatus::Cancelled, None))
                        .await;
                } else {
                    self.emit_event(handle.as_cancel_payload(UpscaleJobStatus::Failed, Some(err)))
                        .await;
                }
            }
        }
    }

    async fn execute_job(
        &self,
        handle: Arc<UpscaleJobHandle>,
    ) -> Result<(Vec<u8>, Option<String>), String> {
        let manager = self.acquire_manager().await?;

        let request = &handle.record.request;

        let model_id = manager.get_model_id(&request.model_name)?;
        let upscale_model = UpscaleModel {
            model_id,
            model_name: request.model_name.clone(),
            scale: request.scale,
            tile_size: request.tile_size,
            noise_level: request.noise_level,
        };

        let image_data = request.image_data.clone();

        let cancellation_flag = handle.cancel_flag.clone();
        let manager_for_task = manager.clone();
        let model_for_task = upscale_model.clone();
        let result = tauri::async_runtime::spawn_blocking(move || {
            if cancellation_flag.load(Ordering::Relaxed) {
                return Err("任务在开始前被取消".to_string());
            }
            manager_for_task.upscale_image_memory(
                &image_data,
                &model_for_task,
                120.0,
                0,
                0,
            )
        })
        .await
        .map_err(|e| format!("执行任务线程失败: {}", e))??;

        if handle.is_cancelled() {
            return Err("任务被取消".to_string());
        }

        let cache_path = if request.allow_cache {
            match manager.save_upscale_cache(&request.image_hash, &upscale_model, &result) {
                Ok(path) => Some(path.to_string_lossy().to_string()),
                Err(err) => {
                    eprintln!("保存超分缓存失败: {}", err);
                    None
                }
            }
        } else {
            None
        };

        Ok((result, cache_path))
    }
}

impl UpscaleJobHandle {
    fn as_status_payload(
        &self,
        status: UpscaleJobStatus,
        result_data: Option<Vec<u8>>,
        cache_path: Option<String>,
    ) -> UpscaleJobEventPayload {
        UpscaleJobEventPayload {
            job_id: self.record.id.to_string(),
            status,
            book_id: self.record.request.book_id.clone(),
            book_path: self.record.request.book_path.clone(),
            page_index: self.record.request.page_index,
            image_hash: self.record.request.image_hash.clone(),
            origin: self.record.request.origin,
            priority: self.record.request.priority,
            condition_id: self.record.request.condition_id.clone(),
            error: None,
            cache_path,
            result_data,
            background: self.record.request.background,
        }
    }

    fn as_cancel_payload(
        &self,
        status: UpscaleJobStatus,
        error: Option<String>,
    ) -> UpscaleJobEventPayload {
        UpscaleJobEventPayload {
            job_id: self.record.id.to_string(),
            status,
            book_id: self.record.request.book_id.clone(),
            book_path: self.record.request.book_path.clone(),
            page_index: self.record.request.page_index,
            image_hash: self.record.request.image_hash.clone(),
            origin: self.record.request.origin,
            priority: self.record.request.priority,
            condition_id: self.record.request.condition_id.clone(),
            error,
            cache_path: None,
            result_data: None,
            background: self.record.request.background,
        }
    }
}

#[derive(Clone)]
pub struct UpscaleScheduler {
    inner: Arc<UpscaleSchedulerInner>,
}

impl UpscaleScheduler {
    pub fn new(app_handle: AppHandle, py_state: Arc<PyO3UpscalerState>, workers: usize) -> Self {
        let clamped_workers = workers.clamp(1, 8);
        let inner = UpscaleSchedulerInner::new(app_handle, py_state, clamped_workers);

        for worker_id in 0..clamped_workers {
            let inner_clone = inner.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    let job = inner_clone.next_job().await;
                    inner_clone.process_job(job).await;
                }
            });
            println!("🔧 UpscaleScheduler worker {} 已启动", worker_id);
        }

        Self { inner }
    }

    pub async fn enqueue(&self, request: UpscaleJobRequest) -> Result<Uuid, String> {
        if request.image_data.is_empty() {
            return Err("缺少图像数据".to_string());
        }

        if request.image_hash.is_empty() {
            return Err("缺少 image_hash".to_string());
        }

        let handle = Arc::new(UpscaleJobHandle::new(request));
        let job_id = handle.record.id;
        self.inner.push_job(handle.clone()).await;

        self.inner
            .emit_event(handle.as_status_payload(UpscaleJobStatus::Queued, None, None))
            .await;

        Ok(job_id)
    }

    pub async fn cancel_job(&self, job_id: &Uuid) -> bool {
        {
            let mut waiting = self.inner.waiting_map.lock().await;
            if let Some(handle) = waiting.remove(job_id) {
                handle.cancel();
                self.inner
                    .emit_event(handle.as_cancel_payload(
                        UpscaleJobStatus::Cancelled,
                        Some("任务在队列中被取消".into()),
                    ))
                    .await;
                return true;
            }
        }

        {
            let running = self.inner.running_map.lock().await;
            if let Some(handle) = running.get(job_id) {
                handle.cancel();
                return true;
            }
        }

        false
    }

    pub async fn cancel_page_jobs(&self, book_path: Option<String>, page_index: Option<i32>) -> usize {
        let mut cancelled = 0usize;
        let predicate = |handle: &Arc<UpscaleJobHandle>| -> bool {
            if let Some(target_index) = page_index {
                if handle.record.request.page_index != target_index {
                    return false;
                }
            }
            if let Some(path) = &book_path {
                handle
                    .record
                    .request
                    .book_path
                    .as_ref()
                    .map_or(false, |p| p == path)
            } else {
                true
            }
        };

        {
            let mut waiting = self.inner.waiting_map.lock().await;
            waiting.retain(|_, handle| {
                if predicate(handle) {
                    handle.cancel();
                    cancelled += 1;
                    false
                } else {
                    true
                }
            });
        }

        {
            let running = self.inner.running_map.lock().await;
            for handle in running.values() {
                if predicate(handle) {
                    handle.cancel();
                    cancelled += 1;
                }
            }
        }

        cancelled
    }

    pub async fn cancel_book_jobs(&self, book_path: String) -> usize {
        self.cancel_page_jobs(Some(book_path), None).await
    }

    pub async fn stats(&self) -> UpscaleSchedulerStats {
        let queued_high = self.inner.queue_high.lock().await.len();
        let queued_normal = self.inner.queue_normal.lock().await.len();
        let running = self.inner.running_map.lock().await.len();

        UpscaleSchedulerStats {
            queued_high,
            queued_normal,
            running,
        }
    }
}

#[derive(Clone)]
pub struct UpscaleSchedulerState {
    pub scheduler: Arc<UpscaleScheduler>,
}

