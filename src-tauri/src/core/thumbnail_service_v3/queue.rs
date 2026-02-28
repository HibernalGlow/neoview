//! 任务队列管理模块
//! 
//! 包含任务队列管理、优先级排序逻辑

use std::collections::{HashSet, VecDeque};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::sync::{Condvar, Mutex};

use super::types::{GenerateTask, TaskLane, ThumbnailFileType};

#[derive(Default)]
pub struct TaskQueueState {
    pub visible: VecDeque<GenerateTask>,
    pub prefetch: VecDeque<GenerateTask>,
    pub background: VecDeque<GenerateTask>,
    pub queued_paths: HashSet<String>,
}

impl TaskQueueState {
    pub fn is_empty(&self) -> bool {
        self.visible.is_empty() && self.prefetch.is_empty() && self.background.is_empty()
    }

    pub fn len(&self) -> usize {
        self.visible.len() + self.prefetch.len() + self.background.len()
    }
}

fn lane_queue_mut(
    state: &mut TaskQueueState,
    lane: TaskLane,
) -> &mut VecDeque<GenerateTask> {
    match lane {
        TaskLane::Visible => &mut state.visible,
        TaskLane::Prefetch => &mut state.prefetch,
        TaskLane::Background => &mut state.background,
    }
}

fn dec_counter(counter: &Arc<AtomicUsize>) {
    let _ = counter.fetch_update(Ordering::Relaxed, Ordering::Relaxed, |v| {
        Some(v.saturating_sub(1))
    });
}

fn dec_lane_counter(
    lane: TaskLane,
    queued_visible: &Arc<AtomicUsize>,
    queued_prefetch: &Arc<AtomicUsize>,
    queued_background: &Arc<AtomicUsize>,
) {
    match lane {
        TaskLane::Visible => dec_counter(queued_visible),
        TaskLane::Prefetch => dec_counter(queued_prefetch),
        TaskLane::Background => dec_counter(queued_background),
    }
}

fn split_lane_by_directory(
    queue: &mut VecDeque<GenerateTask>,
    dir: &str,
    removed: &mut Vec<GenerateTask>,
) {
    let mut kept = VecDeque::with_capacity(queue.len());
    while let Some(task) = queue.pop_front() {
        if task.directory == dir {
            removed.push(task);
        } else {
            kept.push_back(task);
        }
    }
    *queue = kept;
}

fn split_lane_by_path(
    queue: &mut VecDeque<GenerateTask>,
    path: &str,
    removed: &mut Vec<GenerateTask>,
) {
    let mut kept = VecDeque::with_capacity(queue.len());
    while let Some(task) = queue.pop_front() {
        if task.path == path {
            removed.push(task);
        } else {
            kept.push_back(task);
        }
    }
    *queue = kept;
}

fn pop_for_preferred_lane(state: &mut TaskQueueState, preferred: TaskLane) -> Option<GenerateTask> {
    match preferred {
        TaskLane::Visible => state
            .visible
            .pop_front()
            .or_else(|| state.prefetch.pop_front())
            .or_else(|| state.background.pop_front()),
        TaskLane::Prefetch => state
            .prefetch
            .pop_front()
            .or_else(|| state.visible.pop_front())
            .or_else(|| state.background.pop_front()),
        TaskLane::Background => state
            .background
            .pop_front()
            .or_else(|| state.visible.pop_front())
            .or_else(|| state.prefetch.pop_front()),
    }
}

pub fn pop_task_by_lane_locked(
    queue: &mut TaskQueueState,
    preferred: TaskLane,
    queued_visible: &Arc<AtomicUsize>,
    queued_prefetch: &Arc<AtomicUsize>,
    queued_background: &Arc<AtomicUsize>,
) -> Option<GenerateTask> {
    let task = pop_for_preferred_lane(queue, preferred);
    if let Some(ref t) = task {
        dec_lane_counter(t.lane, queued_visible, queued_prefetch, queued_background);
        queue.queued_paths.remove(t.path.as_str());
    }
    task
}

/// 将新任务添加到队列（带去重和优先级排序）
/// 
/// # 参数
/// - task_queue: 任务队列
/// - paths: 需要生成缩略图的路径列表，每项为 (path, file_type, original_index)
/// - current_dir: 当前目录
/// - center: 中心索引（用于计算优先级）
pub fn enqueue_tasks(
    task_queue: &(Mutex<TaskQueueState>, Condvar),
    paths: Vec<(String, ThumbnailFileType, usize, u64)>,
    current_dir: &str,
    center: usize,
    request_epoch: u64,
    lane: TaskLane,
    queued_visible: &Arc<AtomicUsize>,
    queued_prefetch: &Arc<AtomicUsize>,
    queued_background: &Arc<AtomicUsize>,
) {
    if paths.is_empty() {
        return;
    }
    
    if let Ok(mut queue) = task_queue.0.lock() {
        // 计算每个路径到中心的距离并创建任务
        let mut new_tasks: Vec<GenerateTask> = Vec::with_capacity(paths.len());
        let directory = current_dir.to_string();
        for (path, file_type, original_index, dedup_request_id) in paths {
            if queue.queued_paths.contains(path.as_str()) {
                continue;
            }
            let center_distance = if original_index >= center {
                original_index - center
            } else {
                center - original_index
            };
            new_tasks.push(GenerateTask {
                dedup_key: path.clone(),
                dedup_request_id,
                path,
                directory: directory.clone(),
                request_epoch,
                lane,
                file_type,
                center_distance,
                original_index,
            });
        }

        // 可见/预取任务保持优先级排序；后台任务跳过排序降低大批量入队开销
        if !matches!(lane, TaskLane::Background) {
            new_tasks.sort_unstable_by(|a, b| a.priority_cmp(b));
        }

        for task in new_tasks.iter() {
            queue.queued_paths.insert(task.path.clone());
        }

        let lane_counter = match lane {
            TaskLane::Visible => queued_visible,
            TaskLane::Prefetch => queued_prefetch,
            TaskLane::Background => queued_background,
        };
        
        // 插入到队列前端（新任务优先于旧任务）
        for task in new_tasks.into_iter().rev() {
            lane_queue_mut(&mut queue, lane).push_front(task);
            lane_counter.fetch_add(1, Ordering::Relaxed);
        }

        task_queue.1.notify_all();
    }
}

/// 清空指定目录的任务
/// 
/// # 参数
/// - task_queue: 任务队列
/// - dir: 要清空的目录
/// 
/// # 返回
/// 被清除的任务数量
pub fn clear_directory_tasks(
    task_queue: &(Mutex<TaskQueueState>, Condvar),
    dir: &str,
) -> Vec<GenerateTask> {
    if let Ok(mut queue) = task_queue.0.lock() {
        let mut removed = Vec::new();
        split_lane_by_directory(&mut queue.visible, dir, &mut removed);
        split_lane_by_directory(&mut queue.prefetch, dir, &mut removed);
        split_lane_by_directory(&mut queue.background, dir, &mut removed);
        for task in removed.iter() {
            queue.queued_paths.remove(task.path.as_str());
        }
        task_queue.1.notify_all();
        return removed;
    }
    Vec::new()
}

/// 按车道偏好取任务（无扫描，O(1)）
pub fn pop_task_by_lane(
    task_queue: &(Mutex<TaskQueueState>, Condvar),
    preferred: TaskLane,
    queued_visible: &Arc<AtomicUsize>,
    queued_prefetch: &Arc<AtomicUsize>,
    queued_background: &Arc<AtomicUsize>,
) -> Option<GenerateTask> {
    if let Ok(mut queue) = task_queue.0.lock() {
        return pop_task_by_lane_locked(
            &mut queue,
            preferred,
            queued_visible,
            queued_prefetch,
            queued_background,
        );
    }
    None
}

/// 获取队列长度
pub fn queue_len(task_queue: &(Mutex<TaskQueueState>, Condvar)) -> usize {
    task_queue.0.lock().map(|q| q.len()).unwrap_or(0)
}

/// 获取各调度车道的队列长度 (visible, prefetch, background)
pub fn queue_lane_lens(task_queue: &(Mutex<TaskQueueState>, Condvar)) -> (usize, usize, usize) {
    if let Ok(queue) = task_queue.0.lock() {
        return (queue.visible.len(), queue.prefetch.len(), queue.background.len());
    }
    (0, 0, 0)
}

/// 原子替换同路径任务：移除同 path 所有旧任务并将新任务推入对应车道队首
pub fn replace_path_with_task(
    task_queue: &(Mutex<TaskQueueState>, Condvar),
    path: &str,
    task: GenerateTask,
) -> Vec<GenerateTask> {
    if let Ok(mut queue) = task_queue.0.lock() {
        let mut removed = Vec::new();
        split_lane_by_path(&mut queue.visible, path, &mut removed);
        split_lane_by_path(&mut queue.prefetch, path, &mut removed);
        split_lane_by_path(&mut queue.background, path, &mut removed);
        for dropped in removed.iter() {
            queue.queued_paths.remove(dropped.path.as_str());
        }
        queue.queued_paths.insert(task.path.clone());
        lane_queue_mut(&mut queue, task.lane).push_front(task);
        task_queue.1.notify_all();
        return removed;
    }
    Vec::new()
}

/// 清空整个队列
/// 
/// # 返回
/// 被清除的任务数量
pub fn clear_queue(task_queue: &(Mutex<TaskQueueState>, Condvar)) -> usize {
    if let Ok(mut queue) = task_queue.0.lock() {
        let count = queue.len();
        queue.visible.clear();
        queue.prefetch.clear();
        queue.background.clear();
        queue.queued_paths.clear();
        task_queue.1.notify_all();
        return count;
    }
    0
}

/// 将任务重新放回其车道队首（用于限流回退）
pub fn requeue_front(
    task_queue: &(Mutex<TaskQueueState>, Condvar),
    task: GenerateTask,
    queued_visible: &Arc<AtomicUsize>,
    queued_prefetch: &Arc<AtomicUsize>,
    queued_background: &Arc<AtomicUsize>,
) {
    if let Ok(mut queue) = task_queue.0.lock() {
        queue.queued_paths.insert(task.path.clone());
        let lane = task.lane;
        lane_queue_mut(&mut queue, lane).push_front(task);
        match lane {
            TaskLane::Visible => {
                queued_visible.fetch_add(1, Ordering::Relaxed);
            }
            TaskLane::Prefetch => {
                queued_prefetch.fetch_add(1, Ordering::Relaxed);
            }
            TaskLane::Background => {
                queued_background.fetch_add(1, Ordering::Relaxed);
            }
        }
        task_queue.1.notify_one();
    }
}
