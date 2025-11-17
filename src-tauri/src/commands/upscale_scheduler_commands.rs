//! Upscale Scheduler Commands

use crate::core::upscale_scheduler::{
    UpscaleJobRequest, UpscaleSchedulerState, UpscaleSchedulerStats,
};
use tauri::command;
use uuid::Uuid;

#[command]
pub async fn enqueue_upscale_job(
    job: UpscaleJobRequest,
    state: tauri::State<'_, UpscaleSchedulerState>,
) -> Result<String, String> {
    let id = state.scheduler.enqueue(job).await?;
    Ok(id.to_string())
}

#[command]
pub async fn cancel_upscale_job(
    job_id: String,
    state: tauri::State<'_, UpscaleSchedulerState>,
) -> Result<bool, String> {
    let uuid = Uuid::parse_str(&job_id).map_err(|e| format!("无效的 job_id: {}", e))?;
    Ok(state.scheduler.cancel_job(&uuid).await)
}

#[command]
pub async fn cancel_upscale_jobs_for_page(
    book_path: Option<String>,
    page_index: Option<i32>,
    state: tauri::State<'_, UpscaleSchedulerState>,
) -> Result<usize, String> {
    Ok(state
        .scheduler
        .cancel_page_jobs(book_path, page_index)
        .await)
}

#[command]
pub async fn cancel_upscale_jobs_for_book(
    book_path: String,
    state: tauri::State<'_, UpscaleSchedulerState>,
) -> Result<usize, String> {
    Ok(state.scheduler.cancel_book_jobs(book_path).await)
}

#[command]
pub async fn get_upscale_scheduler_stats(
    state: tauri::State<'_, UpscaleSchedulerState>,
) -> Result<UpscaleSchedulerStats, String> {
    Ok(state.scheduler.stats().await)
}

