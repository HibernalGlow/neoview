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

use crate::core::request_dedup::RequestDeduplicator;
use crate::core::thumbnail_db::ThumbnailDb;
use crate::core::thumbnail_generator::ThumbnailGenerator;

use super::config::{LaneQuota, ThumbnailServiceConfig};
use super::generators::{
    generate_archive_thumbnail_static, generate_file_thumbnail_static,
    generate_folder_thumbnail_static, generate_video_thumbnail_static,
};
use super::queue;
use super::types::{
    GenerateTask, TaskLane, ThumbnailBatchReadyPayload, ThumbnailFileType, ThumbnailReadyPayload,
};
use super::{log_debug, log_info};

fn lane_from_quota_tick(tick: usize, quota: LaneQuota) -> TaskLane {
    let visible_slots = quota.visible;
    let prefetch_slots = quota.prefetch;
    let background_slots = quota.background;
    let total = visible_slots + prefetch_slots + background_slots;

    if total == 0 {
        return TaskLane::Visible;
    }

    let slot = tick % total;
    if slot < visible_slots {
        return TaskLane::Visible;
    }
    if slot < visible_slots + prefetch_slots {
        return TaskLane::Prefetch;
    }
    TaskLane::Background
}

fn backlog_is_empty(
    queued_visible: &Arc<AtomicUsize>,
    queued_prefetch: &Arc<AtomicUsize>,
    queued_background: &Arc<AtomicUsize>,
) -> bool {
    queued_visible.load(Ordering::Relaxed)
        + queued_prefetch.load(Ordering::Relaxed)
        + queued_background.load(Ordering::Relaxed)
        == 0
}

fn preferred_lane_for_tick(
    tick: usize,
    visible: usize,
    prefetch: usize,
    background: usize,
    visible_boost_factor: usize,
    side_boost_factor: usize,
    visible_boost_quota: LaneQuota,
    default_quota: LaneQuota,
    side_boost_quota: LaneQuota,
) -> TaskLane {
    let side_total = prefetch + background;

    // visible 积压明显时，提升前台配额（8:1:1）
    if visible > 0 && visible >= side_total.saturating_mul(visible_boost_factor.max(1)) {
        return lane_from_quota_tick(tick, visible_boost_quota);
    }

    // 后台/预取积压明显时，放宽为 4:3:3 提升总体吞吐
    if side_total > visible.saturating_mul(side_boost_factor.max(1)) {
        return lane_from_quota_tick(tick, side_boost_quota);
    }

    // 默认 6:2:1 时间片配额（visible:prefetch:background）
    lane_from_quota_tick(tick, default_quota)
}

fn needs_decode_limit(task: &GenerateTask) -> bool {
    matches!(
        task.file_type,
        ThumbnailFileType::Archive | ThumbnailFileType::Video | ThumbnailFileType::Folder
    )
}

fn needs_encode_limit(task: &GenerateTask) -> bool {
    matches!(
        task.file_type,
        ThumbnailFileType::Archive
            | ThumbnailFileType::Video
            | ThumbnailFileType::Image
            | ThumbnailFileType::Other
    )
}

fn needs_scale_limit(task: &GenerateTask) -> bool {
    matches!(
        task.file_type,
        ThumbnailFileType::Archive
            | ThumbnailFileType::Video
            | ThumbnailFileType::Image
            | ThumbnailFileType::Other
    )
}

#[derive(Default)]
struct AdaptiveStats {
    completed: usize,
    failed: usize,
    total_elapsed_ms: u128,
}

fn start_adaptive_control_thread(
    config: ThumbnailServiceConfig,
    running: Arc<AtomicBool>,
    queued_visible: Arc<AtomicUsize>,
    queued_prefetch: Arc<AtomicUsize>,
    queued_background: Arc<AtomicUsize>,
    worker_budget: Arc<AtomicUsize>,
    adaptive_completed: Arc<AtomicUsize>,
    adaptive_failed: Arc<AtomicUsize>,
    adaptive_total_elapsed_ms: Arc<AtomicU64>,
) -> JoinHandle<()> {
    thread::spawn(move || {
        while running.load(Ordering::SeqCst) {
            thread::sleep(Duration::from_millis(config.adaptive_tick_ms.max(100)));

            if !running.load(Ordering::SeqCst) {
                break;
            }

            let completed = adaptive_completed.swap(0, Ordering::AcqRel);
            let failed = adaptive_failed.swap(0, Ordering::AcqRel);
            let elapsed = adaptive_total_elapsed_ms.swap(0, Ordering::AcqRel);
            let backlog = queued_visible.load(Ordering::Relaxed)
                + queued_prefetch.load(Ordering::Relaxed)
                + queued_background.load(Ordering::Relaxed);

            if completed == 0 {
                if backlog > config.adaptive_scale_up_backlog {
                    let current = worker_budget.load(Ordering::Relaxed);
                    if current < config.worker_threads {
                        worker_budget.store(current + 1, Ordering::Relaxed);
                    }
                }
                continue;
            }

            let avg_ms = elapsed / completed as u64;
            let fail_percent = (failed * 100) / completed.max(1);
            let current = worker_budget.load(Ordering::Relaxed);

            let should_scale_down = avg_ms >= config.adaptive_scale_down_avg_ms
                || fail_percent >= config.adaptive_scale_down_fail_percent;
            let should_scale_up = backlog >= config.adaptive_scale_up_backlog
                && avg_ms <= config.adaptive_scale_up_avg_ms
                && fail_percent <= config.adaptive_scale_down_fail_percent / 2;

            if should_scale_down && current > config.adaptive_min_active_workers {
                worker_budget.store(current - 1, Ordering::Relaxed);
            } else if should_scale_up && current < config.worker_threads {
                worker_budget.store(current + 1, Ordering::Relaxed);
            }
        }
    })
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
    decode_wait_count: Arc<AtomicUsize>,
    decode_wait_ms: Arc<AtomicU64>,
    scale_wait_count: Arc<AtomicUsize>,
    scale_wait_ms: Arc<AtomicU64>,
    encode_wait_count: Arc<AtomicUsize>,
    encode_wait_ms: Arc<AtomicU64>,
    memory_cache: Arc<RwLock<LruCache<String, Arc<[u8]>>>>,
    memory_cache_bytes: Arc<AtomicUsize>,
    db: Arc<ThumbnailDb>,
    generator: Arc<ThumbnailGenerator>,
    db_index: Arc<RwLock<HashSet<String>>>,
    folder_db_index: Arc<RwLock<HashSet<String>>>,
    failed_index: Arc<RwLock<HashSet<String>>>,
    save_queue: Arc<Mutex<HashMap<String, (Arc<[u8]>, i64, i32, Instant)>>>,
    request_deduplicator: Arc<RequestDeduplicator>,
    app: AppHandle,
) -> Vec<JoinHandle<()>> {
    let mut workers = Vec::new();
    let visible_boost_factor = config.scheduler_visible_boost_factor;
    let side_boost_factor = config.scheduler_side_boost_factor;
    let visible_boost_quota = config.scheduler_visible_boost_quota;
    let default_quota = config.scheduler_default_quota;
    let side_boost_quota = config.scheduler_side_boost_quota;
    let worker_budget = Arc::new(AtomicUsize::new(
        config
            .adaptive_min_active_workers
            .max(1)
            .min(config.worker_threads),
    ));
    let decode_inflight = Arc::new(AtomicUsize::new(0));
    let scale_inflight = Arc::new(AtomicUsize::new(0));
    let encode_inflight = Arc::new(AtomicUsize::new(0));
    let adaptive_completed = Arc::new(AtomicUsize::new(0));
    let adaptive_failed = Arc::new(AtomicUsize::new(0));
    let adaptive_total_elapsed_ms = Arc::new(AtomicU64::new(0));

    let adaptive_handle = start_adaptive_control_thread(
        config.clone(),
        Arc::clone(&running),
        Arc::clone(&queued_visible),
        Arc::clone(&queued_prefetch),
        Arc::clone(&queued_background),
        Arc::clone(&worker_budget),
        Arc::clone(&adaptive_completed),
        Arc::clone(&adaptive_failed),
        Arc::clone(&adaptive_total_elapsed_ms),
    );
    workers.push(adaptive_handle);

    for i in 0..config.worker_threads {
        let handle = create_worker_thread(
            i,
            config.folder_search_depth,
            config.clone(),
            visible_boost_factor,
            side_boost_factor,
            visible_boost_quota,
            default_quota,
            side_boost_quota,
            Arc::clone(&worker_budget),
            Arc::clone(&decode_inflight),
            Arc::clone(&scale_inflight),
            Arc::clone(&encode_inflight),
            Arc::clone(&adaptive_completed),
            Arc::clone(&adaptive_failed),
            Arc::clone(&adaptive_total_elapsed_ms),
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
            Arc::clone(&decode_wait_count),
            Arc::clone(&decode_wait_ms),
            Arc::clone(&scale_wait_count),
            Arc::clone(&scale_wait_ms),
            Arc::clone(&encode_wait_count),
            Arc::clone(&encode_wait_ms),
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
    config: ThumbnailServiceConfig,
    visible_boost_factor: usize,
    side_boost_factor: usize,
    visible_boost_quota: LaneQuota,
    default_quota: LaneQuota,
    side_boost_quota: LaneQuota,
    worker_budget: Arc<AtomicUsize>,
    decode_inflight: Arc<AtomicUsize>,
    scale_inflight: Arc<AtomicUsize>,
    encode_inflight: Arc<AtomicUsize>,
    adaptive_completed: Arc<AtomicUsize>,
    adaptive_failed: Arc<AtomicUsize>,
    adaptive_total_elapsed_ms: Arc<AtomicU64>,
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
    decode_wait_count: Arc<AtomicUsize>,
    decode_wait_ms: Arc<AtomicU64>,
    scale_wait_count: Arc<AtomicUsize>,
    scale_wait_ms: Arc<AtomicU64>,
    encode_wait_count: Arc<AtomicUsize>,
    encode_wait_ms: Arc<AtomicU64>,
    memory_cache: Arc<RwLock<LruCache<String, Arc<[u8]>>>>,
    memory_cache_bytes: Arc<AtomicUsize>,
    db: Arc<ThumbnailDb>,
    generator: Arc<ThumbnailGenerator>,
    db_index: Arc<RwLock<HashSet<String>>>,
    folder_db_index: Arc<RwLock<HashSet<String>>>,
    failed_index: Arc<RwLock<HashSet<String>>>,
    save_queue: Arc<Mutex<HashMap<String, (Arc<[u8]>, i64, i32, Instant)>>>,
    request_deduplicator: Arc<RequestDeduplicator>,
) -> JoinHandle<()> {
    thread::spawn(move || {
        const EMIT_BATCH_SIZE: usize = 16;
        const STAGE_BACKOFF_MS: u64 = 2;
        log_debug!("🔧 Worker {} started", worker_id);
        let mut emit_batch: Vec<ThumbnailReadyPayload> = Vec::with_capacity(EMIT_BATCH_SIZE);
        let mut lane_tick: usize = worker_id;

        while running.load(Ordering::SeqCst) {
            if scheduler_paused.load(Ordering::Acquire) {
                thread::sleep(Duration::from_millis(20));
                continue;
            }

            // 在尝试取任务之前，若 emit_batch 有积压且队列为空，立即 flush。
            // 解决多 worker 场景下：Worker A 有 1 个 batch item，Worker B 拿走最后一个
            // 任务后 Worker A 进入 idle 等待，batch 永远不被发射的问题。
            if !emit_batch.is_empty() {
                let queue_is_empty =
                    backlog_is_empty(&queued_visible, &queued_prefetch, &queued_background);
                if queue_is_empty {
                    flush_worker_emit_batch(&app, &mut emit_batch, true, EMIT_BATCH_SIZE);
                }
            }

            if active_workers.load(Ordering::Acquire) >= worker_budget.load(Ordering::Acquire) {
                thread::sleep(Duration::from_millis(2));
                continue;
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
                    let preferred = preferred_lane_for_tick(
                        lane_tick,
                        visible,
                        prefetch,
                        background,
                        visible_boost_factor,
                        side_boost_factor,
                        visible_boost_quota,
                        default_quota,
                        side_boost_quota,
                    );
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
                                let preferred = preferred_lane_for_tick(
                                    lane_tick,
                                    visible,
                                    prefetch,
                                    background,
                                    visible_boost_factor,
                                    side_boost_factor,
                                    visible_boost_quota,
                                    default_quota,
                                    side_boost_quota,
                                );
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
                            let preferred = preferred_lane_for_tick(
                                lane_tick,
                                visible,
                                prefetch,
                                background,
                                visible_boost_factor,
                                side_boost_factor,
                                visible_boost_quota,
                                default_quota,
                                side_boost_quota,
                            );
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

                if needs_decode_limit(&task)
                    && decode_inflight.load(Ordering::Acquire)
                        >= config.decode_stage_max_active.max(1)
                {
                    decode_wait_count.fetch_add(1, Ordering::Relaxed);
                    decode_wait_ms.fetch_add(STAGE_BACKOFF_MS, Ordering::Relaxed);
                    queue::requeue_front(
                        &task_queue,
                        task,
                        &queued_visible,
                        &queued_prefetch,
                        &queued_background,
                    );
                    thread::sleep(Duration::from_millis(STAGE_BACKOFF_MS));
                    continue;
                }

                if needs_scale_limit(&task)
                    && scale_inflight.load(Ordering::Acquire)
                        >= config.scale_stage_max_active.max(1)
                {
                    scale_wait_count.fetch_add(1, Ordering::Relaxed);
                    scale_wait_ms.fetch_add(STAGE_BACKOFF_MS, Ordering::Relaxed);
                    queue::requeue_front(
                        &task_queue,
                        task,
                        &queued_visible,
                        &queued_prefetch,
                        &queued_background,
                    );
                    thread::sleep(Duration::from_millis(STAGE_BACKOFF_MS));
                    continue;
                }

                let mut decode_token_held = false;
                if needs_decode_limit(&task) {
                    decode_inflight.fetch_add(1, Ordering::SeqCst);
                    decode_token_held = true;
                }

                let mut scale_token_held = false;
                if needs_scale_limit(&task) {
                    scale_inflight.fetch_add(1, Ordering::SeqCst);
                    scale_token_held = true;
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

                let started = Instant::now();
                let mut task_succeeded = false;
                let generated =
                    generate_task_blob(&task, &generator, &db, folder_depth, &failed_index);

                if decode_token_held {
                    decode_inflight.fetch_sub(1, Ordering::SeqCst);
                }
                if scale_token_held {
                    scale_inflight.fetch_sub(1, Ordering::SeqCst);
                }

                if let Some((blob, save_info)) = generated {
                    let mut encode_token_held = false;
                    let encode_wait_started = Instant::now();
                    if needs_encode_limit(&task) {
                        while running.load(Ordering::SeqCst)
                            && encode_inflight.load(Ordering::Acquire)
                                >= config.encode_stage_max_active.max(1)
                        {
                            thread::sleep(Duration::from_millis(1));
                        }
                        if running.load(Ordering::SeqCst) {
                            encode_inflight.fetch_add(1, Ordering::SeqCst);
                            encode_token_held = true;
                        }
                    }
                    let encode_wait_elapsed = encode_wait_started.elapsed().as_millis() as u64;
                    if encode_wait_elapsed > 0 {
                        encode_wait_count.fetch_add(1, Ordering::Relaxed);
                        encode_wait_ms.fetch_add(encode_wait_elapsed, Ordering::Relaxed);
                    }

                    let payload = handle_success(
                        &task,
                        blob,
                        save_info,
                        &memory_cache,
                        &memory_cache_bytes,
                        &db_index,
                        &folder_db_index,
                        &save_queue,
                    );
                    emit_batch.push(payload);
                    let queue_is_empty =
                        backlog_is_empty(&queued_visible, &queued_prefetch, &queued_background);
                    flush_worker_emit_batch(&app, &mut emit_batch, queue_is_empty, EMIT_BATCH_SIZE);
                    task_succeeded = true;

                    if encode_token_held {
                        encode_inflight.fetch_sub(1, Ordering::SeqCst);
                    }
                }
                active_workers.fetch_sub(1, Ordering::SeqCst);

                request_deduplicator.release_with_id(&task.dedup_key, task.dedup_request_id);

                let elapsed_ms = started.elapsed().as_millis() as u64;
                adaptive_total_elapsed_ms.fetch_add(elapsed_ms, Ordering::Relaxed);
                adaptive_completed.fetch_add(1, Ordering::Relaxed);
                if !task_succeeded {
                    adaptive_failed.fetch_add(1, Ordering::Relaxed);
                }
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
fn generate_task_blob(
    task: &GenerateTask,
    generator: &Arc<ThumbnailGenerator>,
    db: &Arc<ThumbnailDb>,
    folder_depth: u32,
    failed_index: &Arc<RwLock<HashSet<String>>>,
) -> Option<(Vec<u8>, Option<(String, i64, i32)>)> {
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
            return Some((blob, save_info));
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

    None
}

/// 处理成功生成的缩略图（接收 owned blob 避免多余 to_vec）
#[allow(clippy::too_many_arguments)]
fn handle_success(
    task: &GenerateTask,
    blob: Vec<u8>,
    save_info: Option<(String, i64, i32)>,
    memory_cache: &Arc<RwLock<LruCache<String, Arc<[u8]>>>>,
    memory_cache_bytes: &Arc<AtomicUsize>,
    db_index: &Arc<RwLock<HashSet<String>>>,
    folder_db_index: &Arc<RwLock<HashSet<String>>>,
    save_queue: &Arc<Mutex<HashMap<String, (Arc<[u8]>, i64, i32, Instant)>>>,
) -> ThumbnailReadyPayload {
    let blob = Arc::<[u8]>::from(blob);
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
    save_queue: Arc<Mutex<HashMap<String, (Arc<[u8]>, i64, i32, Instant)>>>,
    db: Arc<ThumbnailDb>,
    flush_interval_ms: u64,
    batch_threshold: usize,
    write_min: usize,
    write_max: usize,
    target_ms: u64,
    db_write_window: Arc<AtomicUsize>,
    db_write_last_ms: Arc<AtomicU64>,
    db_write_last_items: Arc<AtomicUsize>,
) -> JoinHandle<()> {
    thread::spawn(move || {
        log_debug!(
            "🔧 SaveQueue flush thread started (batch_threshold={})",
            batch_threshold
        );
        let write_min = write_min.max(1);
        let write_max = write_max.max(write_min);
        let target_ms = target_ms.max(4);
        let mut write_window = db_write_window
            .load(Ordering::Relaxed)
            .max(write_min)
            .min(write_max);
        let mut last_flush = Instant::now();
        while running.load(Ordering::SeqCst) {
            thread::sleep(Duration::from_millis(500));
            let (should_flush, queued_len) =
                check_flush_condition(&save_queue, &last_flush, flush_interval_ms, batch_threshold);
            if !should_flush {
                continue;
            }

            let dynamic_target = write_window.min(queued_len.max(write_min));
            let items = drain_save_queue_limited(&save_queue, dynamic_target);
            if items.is_empty() {
                continue;
            }

            let chunk_started = Instant::now();
            let item_count = items.len();
            last_flush = Instant::now();
            log_debug!("💾 批量保存 {} 个缩略图到数据库", items.len());
            save_items_to_db(&db, items);

            let elapsed_ms = chunk_started.elapsed().as_millis() as u64;
            db_write_last_ms.store(elapsed_ms, Ordering::Relaxed);
            db_write_last_items.store(item_count, Ordering::Relaxed);

            if elapsed_ms > target_ms && write_window > write_min {
                write_window = write_window.saturating_sub(8).max(write_min);
            } else if elapsed_ms < target_ms / 2
                && dynamic_target == write_window
                && write_window < write_max
            {
                write_window = (write_window + 8).min(write_max);
            }
            db_write_window.store(write_window, Ordering::Relaxed);
        }

        // 退出前刷新剩余队列
        loop {
            let remaining = drain_save_queue_limited(&save_queue, write_window);
            if remaining.is_empty() {
                break;
            }
            let chunk_started = Instant::now();
            let remaining_len = remaining.len();
            log_debug!("💾 退出前批量保存 {} 个缩略图", remaining_len);
            save_items_to_db(&db, remaining);
            db_write_last_ms.store(
                chunk_started.elapsed().as_millis() as u64,
                Ordering::Relaxed,
            );
            db_write_last_items.store(remaining_len, Ordering::Relaxed);
        }
        log_debug!("🔧 SaveQueue flush thread stopped");
    })
}

/// 检查是否应该刷新保存队列
fn check_flush_condition(
    save_queue: &Arc<Mutex<HashMap<String, (Arc<[u8]>, i64, i32, Instant)>>>,
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
fn drain_save_queue_limited(
    save_queue: &Arc<Mutex<HashMap<String, (Arc<[u8]>, i64, i32, Instant)>>>,
    max_items: usize,
) -> Vec<(String, i64, i32, Arc<[u8]>)> {
    match save_queue.lock() {
        Ok(mut q) => {
            if q.is_empty() || max_items == 0 {
                return Vec::new();
            }
            let keys: Vec<String> = q.keys().take(max_items).cloned().collect();
            let mut drained = Vec::with_capacity(keys.len());
            for key in keys {
                if let Some((blob, size, ghash, _)) = q.remove(&key) {
                    drained.push((key, size, ghash, blob));
                }
            }
            drained
        }
        Err(_) => Vec::new(),
    }
}

/// 保存项到数据库
fn save_items_to_db(db: &Arc<ThumbnailDb>, items: Vec<(String, i64, i32, Arc<[u8]>)>) {
    let batch: Vec<(String, i64, i32, Vec<u8>)> = items
        .iter()
        .map(|(pk, sz, gh, blob)| (pk.clone(), *sz, *gh, blob.as_ref().to_vec()))
        .collect();

    if let Err(e) = db.save_thumbnails_batch(&batch) {
        log_debug!("⚠️ 批量保存失败: {}, 回退到逐个保存", e);
        for (pk, sz, gh, blob) in items {
            let _ = db.save_thumbnail(&pk, sz, gh, &blob);
        }
    }
}
