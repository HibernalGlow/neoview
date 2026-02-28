//! 工作线程模块
//! 包含工作线程启动逻辑、任务处理循环、保存队列刷新线程

use lru::LruCache;
use std::collections::{HashMap, HashSet};
use std::panic;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex, RwLock};
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
use super::queue;
use super::types::{
    GenerateTask, TaskLane, ThumbnailBatchReadyPayload, ThumbnailFileType, ThumbnailReadyPayload,
};
use super::{log_debug, log_info};

const LANE_SCHEDULE_LEN: usize = 9;

fn preferred_lane_for_tick(tick: usize, visible: usize, prefetch: usize, background: usize) -> TaskLane {
    let side_total = prefetch + background;

    // visible 积压明显时，提升前台配额（8:1:1）
    if visible > 0 && visible >= side_total {
        return match tick % 10 {
            0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 => TaskLane::Visible,
            7 => TaskLane::Prefetch,
            _ => TaskLane::Background,
        };
    }

    // 后台/预取积压明显时，放宽为 4:3:3 提升总体吞吐
    if side_total > visible.saturating_mul(2) {
        return match tick % 10 {
            0 | 3 | 6 | 9 => TaskLane::Visible,
            1 | 4 | 7 => TaskLane::Prefetch,
            _ => TaskLane::Background,
        };
    }

    // 默认 6:2:1 时间片配额（visible:prefetch:background）
    match tick % LANE_SCHEDULE_LEN {
        0 | 1 | 2 | 4 | 5 | 7 => TaskLane::Visible,
        3 | 6 => TaskLane::Prefetch,
        _ => TaskLane::Background,
    }
}

/// 启动工作线程
#[allow(clippy::too_many_arguments)]
pub fn start_workers(
    config: &ThumbnailServiceConfig,
    running: Arc<AtomicBool>,
    task_queue: Arc<(Mutex<queue::TaskQueueState>, Condvar)>,
    current_dir: Arc<RwLock<String>>,
    request_epoch: Arc<AtomicU64>,
    scheduler_paused: Arc<AtomicBool>,
    active_workers: Arc<AtomicUsize>,
    queued_visible: Arc<AtomicUsize>,
    queued_prefetch: Arc<AtomicUsize>,
    queued_background: Arc<AtomicUsize>,
    processed_visible: Arc<AtomicUsize>,
    processed_prefetch: Arc<AtomicUsize>,
    processed_background: Arc<AtomicUsize>,
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
            Arc::clone(&request_epoch),
            Arc::clone(&scheduler_paused),
            Arc::clone(&running),
            Arc::clone(&active_workers),
            Arc::clone(&queued_visible),
            Arc::clone(&queued_prefetch),
            Arc::clone(&queued_background),
            Arc::clone(&processed_visible),
            Arc::clone(&processed_prefetch),
            Arc::clone(&processed_background),
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
    task_queue: Arc<(Mutex<queue::TaskQueueState>, Condvar)>,
    current_dir: Arc<RwLock<String>>,
    request_epoch: Arc<AtomicU64>,
    scheduler_paused: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    active_workers: Arc<AtomicUsize>,
    queued_visible: Arc<AtomicUsize>,
    queued_prefetch: Arc<AtomicUsize>,
    queued_background: Arc<AtomicUsize>,
    processed_visible: Arc<AtomicUsize>,
    processed_prefetch: Arc<AtomicUsize>,
    processed_background: Arc<AtomicUsize>,
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
        const EMIT_BATCH_SIZE: usize = 16;
        log_debug!("🔧 Worker {} started", worker_id);
        let mut emit_batch: Vec<ThumbnailReadyPayload> = Vec::with_capacity(EMIT_BATCH_SIZE);
        let mut lane_tick: usize = worker_id % LANE_SCHEDULE_LEN;

        while running.load(Ordering::SeqCst) {
            if scheduler_paused.load(Ordering::Acquire) {
                thread::sleep(Duration::from_millis(20));
                continue;
            }

            // 在尝试取任务之前，若 emit_batch 有积压且队列为空，立即 flush。
            // 解决多 worker 场景下：Worker A 有 1 个 batch item，Worker B 拿走最后一个
            // 任务后 Worker A 进入 idle 等待，batch 永远不被发射的问题。
            if !emit_batch.is_empty() {
                let queue_is_empty = task_queue.0.lock().map(|q| q.is_empty()).unwrap_or(false);
                if queue_is_empty {
                    flush_worker_emit_batch(&app, &mut emit_batch, true, EMIT_BATCH_SIZE);
                }
            }

            let task = {
                let (queue_lock, queue_cv) = (&task_queue.0, &task_queue.1);
                let mut guard = match queue_lock.lock() {
                    Ok(g) => g,
                    Err(_) => {
                        thread::sleep(Duration::from_millis(10));
                        continue;
                    }
                };

                // 若队列非空，直接取任务（避免短期 Condvar 等待）
                if !guard.is_empty() {
                    let visible = queued_visible.load(Ordering::Relaxed);
                    let prefetch = queued_prefetch.load(Ordering::Relaxed);
                    let background = queued_background.load(Ordering::Relaxed);
                    let preferred = preferred_lane_for_tick(lane_tick, visible, prefetch, background);
                    lane_tick = lane_tick.wrapping_add(1);
                    queue::pop_task_by_lane_locked(
                        &mut guard,
                        preferred,
                        &queued_visible,
                        &queued_prefetch,
                        &queued_background,
                    )
                } else if !running.load(Ordering::SeqCst) {
                    None
                } else {
                    // 队列为空且仍在运行：短暂等待，超时后释放锁让外层循环检查 emit_batch
                    match queue_cv.wait_timeout(guard, Duration::from_millis(50)) {
                        Ok((mut g, _)) => {
                            if !running.load(Ordering::SeqCst) {
                                None
                            } else {
                                let visible = queued_visible.load(Ordering::Relaxed);
                                let prefetch = queued_prefetch.load(Ordering::Relaxed);
                                let background = queued_background.load(Ordering::Relaxed);
                                let preferred =
                                    preferred_lane_for_tick(lane_tick, visible, prefetch, background);
                                lane_tick = lane_tick.wrapping_add(1);
                                queue::pop_task_by_lane_locked(
                                    &mut g,
                                    preferred,
                                    &queued_visible,
                                    &queued_prefetch,
                                    &queued_background,
                                ) // None if still empty → outer loop flushes
                            }
                        }
                        Err(poisoned) => {
                            let (mut g, _) = poisoned.into_inner();
                            let visible = queued_visible.load(Ordering::Relaxed);
                            let prefetch = queued_prefetch.load(Ordering::Relaxed);
                            let background = queued_background.load(Ordering::Relaxed);
                            let preferred =
                                preferred_lane_for_tick(lane_tick, visible, prefetch, background);
                            lane_tick = lane_tick.wrapping_add(1);
                            queue::pop_task_by_lane_locked(
                                &mut g,
                                preferred,
                                &queued_visible,
                                &queued_prefetch,
                                &queued_background,
                            )
                        }
                    }
                }
            };

            if let Some(task) = task {
                let should_process = check_task_validity(&task, &current_dir, &request_epoch);
                if !should_process {
                    log_debug!("⏭️ 跳过过期/非当前目录任务: {}", task.path);
                    request_deduplicator.release_with_id(&task.dedup_key, task.dedup_request_id);
                    continue;
                }
                active_workers.fetch_add(1, Ordering::SeqCst);
                match task.lane {
                    TaskLane::Visible => {
                        processed_visible.fetch_add(1, Ordering::Relaxed);
                    }
                    TaskLane::Prefetch => {
                        processed_prefetch.fetch_add(1, Ordering::Relaxed);
                    }
                    TaskLane::Background => {
                        processed_background.fetch_add(1, Ordering::Relaxed);
                    }
                }
                if let Some(payload) = process_task(
                    &task,
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
                ) {
                    emit_batch.push(payload);
                    // 任务处理完后检查队列是否已空：
                    // 若空则立即强制发射，避免小批量（< EMIT_BATCH_SIZE）永远滞留
                    // （典型场景：文件夹只有几个压缩包，处理完后队列变空但 batch 不满 16）
                    let queue_is_empty = task_queue.0.lock().map(|q| q.is_empty()).unwrap_or(false);
                    flush_worker_emit_batch(&app, &mut emit_batch, queue_is_empty, EMIT_BATCH_SIZE);
                }
                active_workers.fetch_sub(1, Ordering::SeqCst);
            } else {
                flush_worker_emit_batch(&app, &mut emit_batch, true, EMIT_BATCH_SIZE);
            }
        }

        flush_worker_emit_batch(&app, &mut emit_batch, true, EMIT_BATCH_SIZE);
        log_debug!("🔧 Worker {} stopped", worker_id);
    })
}

fn flush_worker_emit_batch(
    app: &AppHandle,
    emit_batch: &mut Vec<ThumbnailReadyPayload>,
    force: bool,
    batch_size: usize,
) {
    if emit_batch.is_empty() {
        return;
    }
    if !force && emit_batch.len() < batch_size {
        return;
    }

    let payload = ThumbnailBatchReadyPayload {
        items: std::mem::take(emit_batch),
    };
    let _ = app.emit("thumbnail-batch-ready", payload);
}

/// 检查任务是否应该处理（目录是否匹配）
fn check_task_validity(
    task: &GenerateTask,
    current_dir: &Arc<RwLock<String>>,
    request_epoch: &Arc<AtomicU64>,
) -> bool {
    if task.request_epoch != request_epoch.load(Ordering::Acquire) {
        return false;
    }
    if task.directory.is_empty() {
        return true;
    }
    // 持读锁直接比较，不 clone 整个 String
    match current_dir.read() {
        Ok(guard) => task.directory == *guard,
        Err(_) => false,
    }
}

/// 处理单个任务
#[allow(clippy::too_many_arguments)]
fn process_task(
    task: &GenerateTask,
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
) -> Option<ThumbnailReadyPayload> {
    let mut ready_payload: Option<ThumbnailReadyPayload> = None;

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
            ready_payload = Some(handle_success(
                task,
                blob,
                save_info,
                memory_cache,
                memory_cache_bytes,
                db_index,
                folder_db_index,
                save_queue,
            ));
        }
        Ok(Err(e)) => {
            log_debug!("⚠️ 生成缩略图失败: {} - {}", task.path, e);
            // 文件夹失败不加入 failed_index：子文件可能尚未生成缩略图，需要允许重试
            if !matches!(task.file_type, ThumbnailFileType::Folder) {
                if let Ok(mut idx) = failed_index.write() {
                    idx.insert(task.path.clone());
                }
            }
        }
        Err(_) => {
            log_debug!("⚠️ 生成缩略图时 panic: {}", task.path);
            // 文件夹 panic 也不加入永久失败列表，允许后续重试
            if !matches!(task.file_type, ThumbnailFileType::Folder) {
                if let Ok(mut idx) = failed_index.write() {
                    idx.insert(task.path.clone());
                }
            }
        }
    }

    request_deduplicator.release_with_id(&task.dedup_key, task.dedup_request_id);

    ready_payload
}

/// 处理成功生成的缩略图（接收 owned blob 避免多余 to_vec）
#[allow(clippy::too_many_arguments)]
fn handle_success(
    task: &GenerateTask,
    blob: Vec<u8>,
    save_info: Option<(String, i64, i32)>,
    memory_cache: &Arc<RwLock<LruCache<String, Vec<u8>>>>,
    memory_cache_bytes: &Arc<AtomicUsize>,
    db_index: &Arc<RwLock<HashSet<String>>>,
    folder_db_index: &Arc<RwLock<HashSet<String>>>,
    save_queue: &Arc<Mutex<HashMap<String, (Vec<u8>, i64, i32, Instant)>>>,
) -> ThumbnailReadyPayload {
    let blob_len = blob.len();
    // 放入保存队列（如有需要，先 clone 再 move blob 到内存缓存，省一次 to_vec）
    if let Some((path_key, size, ghash)) = save_info {
        if let Ok(mut q) = save_queue.lock() {
            q.insert(path_key, (blob.clone(), size, ghash, Instant::now()));
        }
    }
    // 更新内存缓存（move blob，零拷贝）
    if let Ok(mut cache) = memory_cache.write() {
        cache.put(task.path.clone(), blob);
        memory_cache_bytes.fetch_add(blob_len, Ordering::SeqCst);
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
    // IPC 不再传输 blob：前端通过协议 URL /thumb/{key} 直接从内存缓存读取
    ThumbnailReadyPayload {
        path: task.path.clone(),
    }
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
