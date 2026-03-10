//! 超分服务任务队列管理模块
//! 
//! 包含任务队列管理、优先级排序、跳页重规划等功能

use std::collections::VecDeque;
use std::cmp::Ordering;
use std::sync::Mutex;
use super::types::UpscaleTask;
use super::log_debug;

fn compare_task_order(a: &UpscaleTask, b: &UpscaleTask) -> Ordering {
    a.score
        .cmp(&b.score)
        .then_with(|| a.submitted_at.cmp(&b.submitted_at))
}

/// 页面变化时重新规划队列
/// - 清除不在当前活动窗口内的待处理任务
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

/// 已有待处理任务再次被请求时，使用最新优先级覆盖旧任务
pub fn reprioritize_existing_task(
    task_queue: &Mutex<VecDeque<UpscaleTask>>,
    task: UpscaleTask,
) -> bool {
    if let Ok(mut queue) = task_queue.lock() {
        if let Some(idx) = queue
            .iter()
            .position(|existing| existing.book_path == task.book_path && existing.page_index == task.page_index)
        {
            queue[idx] = task;

            let mut tasks: Vec<_> = queue.drain(..).collect();
            tasks.sort_by(compare_task_order);
            queue.extend(tasks);
            return true;
        }
    }

    false
}

/// 从队列中获取优先级最高的任务
pub fn get_highest_priority_task(task_queue: &Mutex<VecDeque<UpscaleTask>>) -> Option<UpscaleTask> {
    if let Ok(mut queue) = task_queue.lock() {
        queue.pop_front()
    } else {
        None
    }
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
        let insert_idx = {
            let contiguous = queue.make_contiguous();
            contiguous
                .binary_search_by(|existing| compare_task_order(existing, &task))
                .unwrap_or_else(|idx| idx)
        };
        queue.insert(insert_idx, task);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::pyo3_upscaler::UpscaleModel;
    use crate::core::upscale_service::types::{TaskPriority, TaskScore};
    use std::time::Instant;

    fn make_task(page_index: usize, priority: TaskPriority, distance: usize) -> UpscaleTask {
        UpscaleTask {
            book_path: "book".to_string(),
            page_index,
            image_path: format!("page-{page_index}.png"),
            is_archive: false,
            archive_path: None,
            image_hash: format!("hash-{page_index}"),
            job_key: UpscaleTask::build_job_key("book", page_index),
            score: TaskScore { priority, distance },
            model: UpscaleModel::default(),
            allow_cache: true,
            submitted_at: Instant::now(),
        }
    }

    #[test]
    fn replan_keeps_only_current_and_forward_window() {
        let queue = Mutex::new(VecDeque::from(vec![
            make_task(4, TaskPriority::Backward, 1),
            make_task(5, TaskPriority::Current, 0),
            make_task(6, TaskPriority::Forward, 1),
            make_task(7, TaskPriority::Forward, 2),
            make_task(10, TaskPriority::Forward, 5),
        ]));

        replan_queue_for_jump(&queue, 2, 5, 6);

        let pages: Vec<_> = queue
            .lock()
            .unwrap()
            .iter()
            .map(|task| task.page_index)
            .collect();

        assert_eq!(pages, vec![6, 7]);
    }

    #[test]
    fn reprioritize_existing_task_promotes_current_page() {
        let queue = Mutex::new(VecDeque::from(vec![
            make_task(8, TaskPriority::Forward, 2),
            make_task(9, TaskPriority::Forward, 3),
        ]));

        assert!(reprioritize_existing_task(
            &queue,
            make_task(8, TaskPriority::Current, 0),
        ));

        let queue = queue.lock().unwrap();
        assert_eq!(queue.front().map(|task| task.page_index), Some(8));
        assert_eq!(queue.front().map(|task| task.score.priority), Some(TaskPriority::Current));
    }
}
