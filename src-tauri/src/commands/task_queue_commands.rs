use std::sync::Arc;

use tauri::State;

use crate::core::background_scheduler::{BackgroundSchedulerSnapshot, BackgroundTaskScheduler};

pub struct BackgroundSchedulerState {
    pub scheduler: Arc<BackgroundTaskScheduler>,
}

#[tauri::command]
pub async fn get_background_queue_metrics(
    state: State<'_, BackgroundSchedulerState>,
) -> Result<BackgroundSchedulerSnapshot, String> {
    Ok(state.scheduler.snapshot())
}

