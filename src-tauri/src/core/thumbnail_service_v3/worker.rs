//! 工作线程模块
//! 包含工作线程启动逻辑、任务处理循环、保存队列刷新线程

use lru::LruCache;
use std::collections::{HashMap, HashSet, VecDeque};
use std::panic;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use crate::core::thumbnail_db::ThumbnailDb;
use crate::core::thumbnail_generator::ThumbnailGenerator;
use crate::core::request_dedup::RequestDeduplicator;

use super::config::ThumbnailServiceConfig;
use super::generators::{
    generate_archive_thumbnail_static, generate_file_thumbnail_static,
    generate_folder_thumbnail_static, generate_video_thumbnail_static,
};
use super::types::{GenerateTask, ThumbnailFileType, ThumbnailReadyPayload};
use super::{log_debug, log_info};

/// 启动工作线程
#[allow(clippy::too_many_arguments)]
pub fn start_workers(
    config: &ThumbnailServiceConfig,
    running: Arc<AtomicBool>,
    task_queue: Arc<Mutex<VecDeque<GenerateTask>>>,
    current_dir: Arc<RwLock<String>>,
    active_workers: Arc<AtomicUsize>,
    memory_cache: Arc<RwLock<LruCache<String, Vec<u8>>>>,
    memory_cache_bytes: Arc<AtomicUsize>,
    db: Arc<ThumbnailDb>,
    generator: Arc<ThumbnailGenerator>,
    db_index: Arc<RwLock<HashSet<String>>>,
    folder_db_index: Arc<RwLock<HashSet<String>>>,
    failed_index: Arc<RwLock<HashSet<String>>>,
    save_queue: Arc<Mutex<HashMap<String, (Vec<u8>, i64, i32, Instant)>>>,
    request_deduplicator: Arc<RequestDeduplicator>,
    app: AppHandle,
) -> Vec<JoinHandle<()>> {
    let mut workers = Vec::new();
    for i in 0..config.worker_threads {
        let handle = create_worker_thread(
            i,
            config.folder_search_depth,
            app.clone(),
            Arc::clone(&task_queue),
            Arc::clone(&current_dir),
            Arc::clone(&running),
            Arc::clone(&active_workers),
            Arc::clone(&memory_cache),
            Arc::clone(&memory_cache_bytes),
            Arc::clone(&db),
            Arc::clone(&generator),
            Arc::clone(&db_index),
            Arc::clone(&folder_db_index),
            Arc::clone(&failed_index),
            Arc::clone(&save_queue),
            Arc::clone(&request_deduplicator),
        );
        workers.push(handle);
    }
    workers
}

/// 创建单个工作线程
#[allow(clippy::too_many_arguments)]
fn create_worker_thread(
    worker_id: usize,
    folder_depth: u32,
    app: AppHandle,
    task_queue: Arc<Mutex<VecDeque<GenerateTask>>>,
    current_dir: Arc<RwLock<String>>,
    running: Arc<AtomicBool>,
    active_workers: Arc<AtomicUsize>,
    memory_cache: Arc<RwLock<LruCache<String, Vec<u8>>>>,
    memory_cache_bytes: Arc<AtomicUsize>,
    db: Arc<ThumbnailDb>,
    generator: Arc<ThumbnailGenerator>,
    db_index: Arc<RwLock<HashSet<String>>>,
    folder_db_index: Arc<RwLock<HashSet<String>>>,
    failed_index: Arc<RwLock<HashSet<String>>>,
    save_queue: Arc<Mutex<HashMap<String, (Vec<u8>, i64, i32, Instant)>>>,
    request_deduplicator: Arc<RequestDeduplicator>,
) -> JoinHandle<()> {
    thread::spawn(move || {
        log_debug!("🔧 Worker {} started", worker_id);
        while running.load(Ordering::SeqCst) {
            let task = task_queue.lock().ok().and_then(|mut q| q.pop_front());
            if let Some(task) = task {
                let should_process = check_task_validity(&task, &current_dir);
                if !should_process {
                    log_debug!("⏭️ 跳过非当前目录任务: {}", task.path);
                    request_deduplicator.release_with_id(&task.dedup_key, task.dedup_request_id);
                    continue;
                }
                active_workers.fetch_add(1, Ordering::SeqCst);
                process_task(
                    &task,
                    &app,
                    &generator,
                    &db,
                    folder_depth,
                    &memory_cache,
                    &memory_cache_bytes,
                    &db_index,
                    &folder_db_index,
                    &failed_index,
                    &save_queue,
                    &request_deduplicator,
                );
                active_workers.fetch_sub(1, Ordering::SeqCst);
            } else {
                thread::sleep(Duration::from_millis(10));
            }
        }
        log_debug!("🔧 Worker {} stopped", worker_id);
    })
}

/// 检查任务是否应该处理（目录是否匹配）
fn check_task_validity(task: &GenerateTask, current_dir: &Arc<RwLock<String>>) -> bool {
    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
        let current = current_dir
            .read()
            .ok()
            .map(|g| g.clone())
            .unwrap_or_default();
        task.directory.is_empty() || task.directory == current
    }));
    result.unwrap_or(false)
}

/// 处理单个任务
#[allow(clippy::too_many_arguments)]
fn process_task(
    task: &GenerateTask,
    app: &AppHandle,
    generator: &Arc<ThumbnailGenerator>,
    db: &Arc<ThumbnailDb>,
    folder_depth: u32,
    memory_cache: &Arc<RwLock<LruCache<String, Vec<u8>>>>,
    memory_cache_bytes: &Arc<AtomicUsize>,
    db_index: &Arc<RwLock<HashSet<String>>>,
    folder_db_index: &Arc<RwLock<HashSet<String>>>,
    failed_index: &Arc<RwLock<HashSet<String>>>,
    save_queue: &Arc<Mutex<HashMap<String, (Vec<u8>, i64, i32, Instant)>>>,
    request_deduplicator: &Arc<RequestDeduplicator>,
) {
    let gen_result = panic::catch_unwind(panic::AssertUnwindSafe(|| match task.file_type {
        ThumbnailFileType::Folder => {
            generate_folder_thumbnail_static(generator, db, &task.path, folder_depth)
                .map(|blob| (blob, None))
        }
        ThumbnailFileType::Archive => generate_archive_thumbnail_static(generator, &task.path)
            .map(|(blob, pk, sz, gh)| (blob, Some((pk, sz, gh)))),
        ThumbnailFileType::Video => generate_video_thumbnail_static(generator, &task.path)
            .map(|(blob, pk, sz, gh)| (blob, Some((pk, sz, gh)))),
        ThumbnailFileType::Image | ThumbnailFileType::Other => {
            generate_file_thumbnail_static(generator, &task.path)
                .map(|(blob, pk, sz, gh)| (blob, Some((pk, sz, gh))))
        }
    }));

    match gen_result {
        Ok(Ok((blob, save_info))) => {
            handle_success(
                task,
                &blob,
                save_info,
                memory_cache,
                memory_cache_bytes,
                db_index,
                folder_db_index,
                save_queue,
                app,
            );
        }
        Ok(Err(e)) => {
            log_debug!("⚠️ 生成缩略图失败: {} - {}", task.path, e);
            if let Ok(mut idx) = failed_index.write() {
                idx.insert(task.path.clone());
            }
        }
        Err(_) => {
            log_debug!("⚠️ 生成缩略图时 panic: {}", task.path);
            if let Ok(mut idx) = failed_index.write() {
                idx.insert(task.path.clone());
            }
        }
    }

    request_deduplicator.release_with_id(&task.dedup_key, task.dedup_request_id);
}

/// 处理成功生成的缩略图
#[allow(clippy::too_many_arguments)]
fn handle_success(
    task: &GenerateTask,
    blob: &[u8],
    save_info: Option<(String, i64, i32)>,
    memory_cache: &Arc<RwLock<LruCache<String, Vec<u8>>>>,
    memory_cache_bytes: &Arc<AtomicUsize>,
    db_index: &Arc<RwLock<HashSet<String>>>,
    folder_db_index: &Arc<RwLock<HashSet<String>>>,
    save_queue: &Arc<Mutex<HashMap<String, (Vec<u8>, i64, i32, Instant)>>>,
    app: &AppHandle,
) {
    // 更新内存缓存
    if let Ok(mut cache) = memory_cache.write() {
        cache.put(task.path.clone(), blob.to_vec());
        memory_cache_bytes.fetch_add(blob.len(), Ordering::SeqCst);
    }
    // 更新数据库索引
    if let Ok(mut idx) = db_index.write() {
        idx.insert(task.path.clone());
    }
    // 如果是文件夹，更新文件夹索引
    if matches!(task.file_type, ThumbnailFileType::Folder) {
        if let Ok(mut idx) = folder_db_index.write() {
            idx.insert(task.path.clone());
        }
    }
    // 放入保存队列
    if let Some((path_key, size, ghash)) = save_info {
        if let Ok(mut q) = save_queue.lock() {
            q.insert(path_key, (blob.to_vec(), size, ghash, Instant::now()));
        }
    }
    // 发送到前端
    let _ = app.emit(
        "thumbnail-ready",
        ThumbnailReadyPayload {
            path: task.path.clone(),
            blob: blob.to_vec(),
        },
    );
}

/// 启动保存队列刷新线程
pub fn start_flush_thread(
    running: Arc<AtomicBool>,
    save_queue: Arc<Mutex<HashMap<String, (Vec<u8>, i64, i32, Instant)>>>,
    db: Arc<ThumbnailDb>,
    flush_interval_ms: u64,
    batch_threshold: usize,
) -> JoinHandle<()> {
    thread::spawn(move || {
        log_debug!(
            "🔧 SaveQueue flush thread started (batch_threshold={})",
            batch_threshold
        );
        let mut last_flush = Instant::now();
        while running.load(Ordering::SeqCst) {
            thread::sleep(Duration::from_millis(500));
            let (should_flush, _) =
                check_flush_condition(&save_queue, &last_flush, flush_interval_ms, batch_threshold);
            if !should_flush {
                continue;
            }
            let items = drain_save_queue(&save_queue);
            if items.is_empty() {
                continue;
            }
            last_flush = Instant::now();
            log_debug!("💾 批量保存 {} 个缩略图到数据库", items.len());
            save_items_to_db(&db, items);
        }
        // 退出前刷新剩余队列
        let remaining = drain_save_queue(&save_queue);
        if !remaining.is_empty() {
            log_debug!("💾 退出前批量保存 {} 个缩略图", remaining.len());
            save_items_to_db(&db, remaining);
        }
        log_debug!("🔧 SaveQueue flush thread stopped");
    })
}

/// 检查是否应该刷新保存队列
fn check_flush_condition(
    save_queue: &Arc<Mutex<HashMap<String, (Vec<u8>, i64, i32, Instant)>>>,
    last_flush: &Instant,
    flush_interval_ms: u64,
    batch_threshold: usize,
) -> (bool, usize) {
    match save_queue.lock() {
        Ok(q) => {
            let len = q.len();
            let time_ok = last_flush.elapsed().as_millis() as u64 >= flush_interval_ms;
            let count_ok = len >= batch_threshold;
            ((time_ok || count_ok) && len > 0, len)
        }
        Err(_) => (false, 0),
    }
}

/// 清空保存队列并返回所有项
fn drain_save_queue(
    save_queue: &Arc<Mutex<HashMap<String, (Vec<u8>, i64, i32, Instant)>>>,
) -> Vec<(String, i64, i32, Vec<u8>)> {
    match save_queue.lock() {
        Ok(mut q) => q.drain().map(|(k, (b, s, g, _))| (k, s, g, b)).collect(),
        Err(_) => Vec::new(),
    }
}

/// 保存项到数据库
fn save_items_to_db(db: &Arc<ThumbnailDb>, items: Vec<(String, i64, i32, Vec<u8>)>) {
    if let Err(e) = db.save_thumbnails_batch(&items) {
        log_debug!("⚠️ 批量保存失败: {}, 回退到逐个保存", e);
        for (pk, sz, gh, blob) in items {
            let _ = db.save_thumbnail(&pk, sz, gh, &blob);
        }
    }
}
