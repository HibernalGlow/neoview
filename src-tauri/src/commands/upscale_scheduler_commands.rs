//! Upscale Scheduler Commands

use crate::core::{
    archive::ArchiveManager,
    book_manager::BookManager,
    image_loader::ImageLoader,
    upscale_scheduler::{
        UpscaleJobPriority, UpscaleJobRequest, UpscaleSchedulerState, UpscaleSchedulerStats,
    },
};
use crate::models::book::BookType;
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::Mutex;
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

#[derive(Debug, Deserialize)]
pub struct PreloadBatchJobDescriptor {
    pub page_index: usize,
    pub image_hash: Option<String>,
    pub condition_id: Option<String>,
    pub model_name: String,
    pub scale: i32,
    pub tile_size: i32,
    pub noise_level: i32,
    pub gpu_id: Option<i32>,
    pub priority: Option<UpscaleJobPriority>,
}

#[derive(Debug, Deserialize)]
pub struct PreloadBatchPayload {
    pub book_path: String,
    pub jobs: Vec<PreloadBatchJobDescriptor>,
}

#[command]
pub async fn enqueue_preload_batch(
    payload: PreloadBatchPayload,
    scheduler_state: tauri::State<'_, UpscaleSchedulerState>,
    book_manager_state: tauri::State<'_, Mutex<BookManager>>,
    image_loader_state: tauri::State<'_, Mutex<ImageLoader>>,
) -> Result<Vec<String>, String> {
    if payload.jobs.is_empty() {
        return Ok(Vec::new());
    }

    let (active_book, book_type) = {
        let manager = book_manager_state
            .lock()
            .map_err(|e| format!("获取 BookManager 锁失败: {}", e))?;
        let book = manager
            .get_current_book()
            .cloned()
            .ok_or_else(|| "没有打开的书籍".to_string())?;
        if book.path != payload.book_path {
            return Err("请求的 book_path 与当前书籍不匹配".to_string());
        }
        (book.clone(), book.book_type.clone())
    };

    let archive_path = PathBuf::from(&active_book.path);
    let archive_manager = match book_type {
        BookType::Archive => Some(ArchiveManager::new()),
        _ => None,
    };

    let image_loader = image_loader_state
        .lock()
        .map_err(|e| format!("获取 ImageLoader 锁失败: {}", e))?
        .clone();

    let mut job_ids = Vec::new();
    for descriptor in payload.jobs {
        let page = active_book
            .pages
            .get(descriptor.page_index)
            .cloned()
            .ok_or_else(|| format!("页面索引 {} 越界", descriptor.page_index))?;

        let image_hash = descriptor
            .image_hash
            .clone()
            .filter(|h| !h.is_empty())
            .unwrap_or_else(|| page.stable_hash.clone());

        let image_data = match book_type {
            BookType::Archive => {
                let manager = archive_manager
                    .as_ref()
                    .ok_or_else(|| "ArchiveManager 未初始化".to_string())?;
                manager.load_image_from_zip_binary(&archive_path, &page.path)?
            }
            _ => image_loader.load_image_as_binary(&page.path)?,
        };

        let request = UpscaleJobRequest {
            book_id: Some(active_book.path.clone()),
            book_path: Some(active_book.path.clone()),
            page_index: descriptor.page_index as i32,
            image_hash,
            image_data,
            priority: descriptor.priority.unwrap_or(UpscaleJobPriority::Normal),
            origin: crate::core::upscale_scheduler::UpscaleJobOrigin::Preload,
            condition_id: descriptor.condition_id.clone(),
            model_name: descriptor.model_name.clone(),
            scale: descriptor.scale,
            tile_size: descriptor.tile_size,
            noise_level: descriptor.noise_level,
            gpu_id: descriptor.gpu_id,
            allow_cache: true,
            background: true,
        };

        let job_id = scheduler_state.scheduler.enqueue(request).await?;
        job_ids.push(job_id.to_string());
    }

    Ok(job_ids)
}
