//! 任务队列管理模块
//!
//! 包含任务队列管理、优先级排序逻辑

use std::collections::{HashSet, VecDeque};
use std::sync::Mutex;

use super::types::{GenerateTask, ThumbnailFileType};

/// 将新任务添加到队列（带去重和优先级排序）
///
/// # 参数
/// - task_queue: 任务队列
/// - paths: 需要生成缩略图的路径列表，每项为 (path, file_type, original_index)
/// - current_dir: 当前目录
/// - center: 中心索引（用于计算优先级）
pub fn enqueue_tasks(
    task_queue: &Mutex<VecDeque<GenerateTask>>,
    paths: Vec<(String, ThumbnailFileType, usize)>,
    current_dir: &str,
    center: usize,
    session_id: usize,
) {
    if paths.is_empty() {
        return;
    }

    if let Ok(mut queue) = task_queue.lock() {
        // 收集已有路径用于去重
        let existing: HashSet<_> = queue.iter().map(|t| t.path.clone()).collect();

        // 计算每个路径到中心的距离并创建任务
        let mut new_tasks: Vec<GenerateTask> = paths
            .into_iter()
            .filter(|(path, _, _)| !existing.contains(path))
            .map(|(path, file_type, original_index)| {
                let center_distance = if original_index >= center {
                    original_index - center
                } else {
                    center - original_index
                };
                GenerateTask {
                    path,
                    directory: current_dir.to_string(),
                    file_type,
                    center_distance,
                    original_index,
                    session_id,
                }
            })
            .collect();

        // 按优先级排序（中心距离小的优先）
        new_tasks.sort_by(|a, b| a.priority_cmp(b));

        // 插入到队列前端（新任务优先于旧任务）
        for task in new_tasks.into_iter().rev() {
            queue.push_front(task);
        }
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
pub fn clear_directory_tasks(task_queue: &Mutex<VecDeque<GenerateTask>>, dir: &str) -> usize {
    if let Ok(mut queue) = task_queue.lock() {
        let before = queue.len();
        queue.retain(|task| task.directory != dir);
        let after = queue.len();
        return before - after;
    }
    0
}

/// 获取下一个任务（从队列前端取出）
pub fn pop_task(task_queue: &Mutex<VecDeque<GenerateTask>>) -> Option<GenerateTask> {
    if let Ok(mut queue) = task_queue.lock() {
        return queue.pop_front();
    }
    None
}

/// 获取队列长度
pub fn queue_len(task_queue: &Mutex<VecDeque<GenerateTask>>) -> usize {
    task_queue.lock().map(|q| q.len()).unwrap_or(0)
}

/// 清空整个队列
///
/// # 返回
/// 被清除的任务数量
pub fn clear_queue(task_queue: &Mutex<VecDeque<GenerateTask>>) -> usize {
    if let Ok(mut queue) = task_queue.lock() {
        let count = queue.len();
        queue.clear();
        return count;
    }
    0
}
