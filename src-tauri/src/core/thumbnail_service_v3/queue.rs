//! 任务队列管理模块
//! 
//! 包含任务队列管理、优先级排序逻辑

use std::collections::{HashSet, VecDeque};
use std::sync::{Condvar, Mutex};

use super::types::{GenerateTask, ThumbnailFileType};

/// 将新任务添加到队列（带去重和优先级排序）
/// 
/// # 参数
/// - task_queue: 任务队列
/// - paths: 需要生成缩略图的路径列表，每项为 (path, file_type, original_index)
/// - current_dir: 当前目录
/// - center: 中心索引（用于计算优先级）
pub fn enqueue_tasks(
    task_queue: &(Mutex<VecDeque<GenerateTask>>, Condvar),
    paths: Vec<(String, ThumbnailFileType, usize, u64)>,
    current_dir: &str,
    center: usize,
    request_epoch: u64,
) {
    if paths.is_empty() {
        return;
    }
    
    if let Ok(mut queue) = task_queue.0.lock() {
        // 收集已有路径用于去重：用 &str 引用而非 String clone，避免 O(N) 内存分配
        let existing: HashSet<&str> = queue.iter().map(|t| t.path.as_str()).collect();
        
        // 计算每个路径到中心的距离并创建任务
        let mut new_tasks: Vec<GenerateTask> = paths
            .into_iter()
            .filter(|(path, _, _, _)| !existing.contains(path.as_str()))
            .map(|(path, file_type, original_index, dedup_request_id)| {
                let center_distance = if original_index >= center {
                    original_index - center
                } else {
                    center - original_index
                };
                GenerateTask {
                    dedup_key: path.clone(),
                    dedup_request_id,
                    path,
                    directory: current_dir.to_string(),
                    request_epoch,
                    file_type,
                    center_distance,
                    original_index,
                }
            })
            .collect();
        
        // 按优先级排序（中心距离小的优先）
        new_tasks.sort_by(|a, b| a.priority_cmp(b));
        
        // 插入到队列前端（新任务优先于旧任务）
        for task in new_tasks.into_iter().rev() {
            queue.push_front(task);
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
    task_queue: &(Mutex<VecDeque<GenerateTask>>, Condvar),
    dir: &str,
) -> Vec<GenerateTask> {
    if let Ok(mut queue) = task_queue.0.lock() {
        let mut removed = Vec::new();
        let mut kept = VecDeque::with_capacity(queue.len());
        while let Some(task) = queue.pop_front() {
            if task.directory == dir {
                removed.push(task);
            } else {
                kept.push_back(task);
            }
        }
        *queue = kept;
        task_queue.1.notify_all();
        return removed;
    }
    Vec::new()
}

/// 获取下一个任务（从队列前端取出）
pub fn pop_task(task_queue: &(Mutex<VecDeque<GenerateTask>>, Condvar)) -> Option<GenerateTask> {
    if let Ok(mut queue) = task_queue.0.lock() {
        return queue.pop_front();
    }
    None
}

/// 获取队列长度
pub fn queue_len(task_queue: &(Mutex<VecDeque<GenerateTask>>, Condvar)) -> usize {
    task_queue.0.lock().map(|q| q.len()).unwrap_or(0)
}

/// 清空整个队列
/// 
/// # 返回
/// 被清除的任务数量
pub fn clear_queue(task_queue: &(Mutex<VecDeque<GenerateTask>>, Condvar)) -> usize {
    if let Ok(mut queue) = task_queue.0.lock() {
        let count = queue.len();
        queue.clear();
        task_queue.1.notify_all();
        return count;
    }
    0
}
