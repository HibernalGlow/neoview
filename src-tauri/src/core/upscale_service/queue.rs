//! 超分服务任务队列管理模块
//! 
//! 包含任务队列管理、优先级排序、跳页重规划等功能

use std::collections::VecDeque;
use std::sync::Mutex;
use super::types::{UpscaleTask, TaskScore};
use super::log_debug;

/// 跳页时重新规划队列
/// - 清除不在预超分范围内的待处理任务
/// - 重新计算所有任务的优先级分数
/// - 按新优先级排序（当前页 > 后方页 > 前方页）
pub fn replan_queue_for_jump(
    task_queue: &Mutex<VecDeque<UpscaleTask>>,
    preload_range: usize,
    _old_page: usize,
    new_page: usize,
) {
    // 只保留后方页（即将翻到的）+ 当前页，前方页不保留
    let valid_end = new_page + preload_range;
    
    if let Ok(mut queue) = task_queue.lock() {
        let before = queue.len();
        
        // 只保留当前页和后方页的任务（前方页任务取消）
        queue.retain(|task| {
            task.page_index >= new_page && task.page_index <= valid_end
        });
        
        let removed = before - queue.len();
        if removed > 0 {
            log_debug!("🔄 跳页清理: 移除 {} 个已翻过/超出范围的任务", removed);
        }
        
        // 重新计算分数并排序
        let mut tasks: Vec<_> = queue.drain(..).collect();
        for task in &mut tasks {
            task.score = UpscaleTask::calculate_score(task.page_index, new_page);
        }
        // 按分数排序（TaskScore 实现了 Ord）
        tasks.sort_by(|a, b| a.score.cmp(&b.score));
        queue.extend(tasks);
    }
}

/// 从队列中获取优先级最高的任务
pub fn get_highest_priority_task(task_queue: &Mutex<VecDeque<UpscaleTask>>) -> Option<UpscaleTask> {
    let mut queue = match task_queue.lock() {
        Ok(q) => q,
        Err(_) => return None,
    };

    // 优先取分数最小的任务（当前页 > 后方近页 > 后方远页）
    queue
        .iter()
        .enumerate()
        .min_by_key(|(_, t)| &t.score)
        .map(|(idx, _)| idx)
        .and_then(|idx| queue.remove(idx))
}

/// 检查任务是否已在队列中
pub fn is_task_in_queue(
    task_queue: &Mutex<VecDeque<UpscaleTask>>,
    book_path: &str,
    page_index: usize,
) -> bool {
    if let Ok(queue) = task_queue.lock() {
        queue.iter().any(|t| t.book_path == book_path && t.page_index == page_index)
    } else {
        false
    }
}

/// 添加任务到队列
pub fn add_task_to_queue(task_queue: &Mutex<VecDeque<UpscaleTask>>, task: UpscaleTask) {
    if let Ok(mut queue) = task_queue.lock() {
        queue.push_back(task);
    }
}

/// 取消指定页面的任务
pub fn cancel_page_task(task_queue: &Mutex<VecDeque<UpscaleTask>>, book_path: &str, page_index: usize) {
    if let Ok(mut queue) = task_queue.lock() {
        queue.retain(|t| !(t.book_path == book_path && t.page_index == page_index));
    }
}

/// 取消指定书籍的所有任务
pub fn cancel_book_tasks(task_queue: &Mutex<VecDeque<UpscaleTask>>, book_path: &str) {
    if let Ok(mut queue) = task_queue.lock() {
        let before = queue.len();
        queue.retain(|t| t.book_path != book_path);
        log_debug!("🚫 取消书籍任务: {} 个", before - queue.len());
    }
}

/// 清空队列
pub fn clear_queue(task_queue: &Mutex<VecDeque<UpscaleTask>>) -> usize {
    if let Ok(mut queue) = task_queue.lock() {
        let cleared = queue.len();
        queue.clear();
        cleared
    } else {
        0
    }
}

/// 获取队列长度
pub fn get_queue_length(task_queue: &Mutex<VecDeque<UpscaleTask>>) -> usize {
    task_queue.lock().ok().map(|q| q.len()).unwrap_or(0)
}

/// 清除旧书籍的任务
pub fn clear_old_book_tasks(task_queue: &Mutex<VecDeque<UpscaleTask>>, old_book: &str) {
    if let Ok(mut queue) = task_queue.lock() {
        let before = queue.len();
        queue.retain(|t| t.book_path != old_book);
        let cleared = before - queue.len();
        if cleared > 0 {
            log_debug!("📂 书籍切换，清空 {} 个旧任务", cleared);
        }
    }
}
