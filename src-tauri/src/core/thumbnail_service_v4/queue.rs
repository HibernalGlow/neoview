//! 统一缩略图队列
//!
//! 按 lane 调度：visible > reader-visible > prefetch > background
//! 同一个 key 全局去重，多个消费者只挂 waiter

use crate::core::thumbnail_service_v4::types::*;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;
use tokio::sync::Notify;

/// 队列中的任务
pub struct QueueTask {
    pub context_id: String,
    pub request: ThumbnailRequest,
    pub lane: ThumbnailLane,
    pub center_index: Option<usize>,
    pub generation: u32,
}

/// 统一缩略图队列
pub struct ThumbnailQueue {
    /// 按 lane 分组的队列
    queues: HashMap<ThumbnailLane, VecDeque<QueueTask>>,
    /// 全局去重：已入队的 key
    in_flight: HashSet<String>,
    /// 上下文 -> 世代号
    context_generations: HashMap<String, u32>,
    /// 新任务通知
    notify: Arc<Notify>,
}

impl ThumbnailQueue {
    pub fn new() -> Self {
        let mut queues = HashMap::new();
        queues.insert(ThumbnailLane::Visible, VecDeque::new());
        queues.insert(ThumbnailLane::ReaderVisible, VecDeque::new());
        queues.insert(ThumbnailLane::Prefetch, VecDeque::new());
        queues.insert(ThumbnailLane::Background, VecDeque::new());

        Self {
            queues,
            in_flight: HashSet::new(),
            context_generations: HashMap::new(),
            notify: Arc::new(Notify::new()),
        }
    }

    /// 入队请求（去重）
    pub fn enqueue(
        &mut self,
        context_id: String,
        request: ThumbnailRequest,
        lane: ThumbnailLane,
        center_index: Option<usize>,
        generation: u32,
    ) -> bool {
        if self.in_flight.contains(&request.key) {
            return false; // 去重
        }
        self.in_flight.insert(request.key.clone());
        if let Some(queue) = self.queues.get_mut(&lane) {
            queue.push_back(QueueTask {
                context_id,
                request,
                lane,
                center_index,
                generation,
            });
            self.notify.notify_one();
            true
        } else {
            false
        }
    }

    /// 取下一个任务（按优先级）
    pub fn dequeue(&mut self) -> Option<QueueTask> {
        let lane_order = [
            ThumbnailLane::Visible,
            ThumbnailLane::ReaderVisible,
            ThumbnailLane::Prefetch,
            ThumbnailLane::Background,
        ];

        for lane in lane_order {
            if let Some(queue) = self.queues.get_mut(&lane) {
                // 跳过旧世代的任务
                while let Some(task) = queue.pop_front() {
                    if let Some(&gen) = self.context_generations.get(&task.context_id) {
                        if task.generation < gen {
                            self.in_flight.remove(&task.request.key);
                            continue; // 丢弃旧世代
                        }
                    }
                    return Some(task);
                }
            }
        }
        None
    }

    /// 取消上下文
    pub fn cancel_context(&mut self, context_id: &str, new_generation: u32) {
        self.context_generations
            .insert(context_id.to_string(), new_generation);
    }

    /// 获取通知（用于 async 等待）
    pub fn notify(&self) -> Arc<Notify> {
        self.notify.clone()
    }

    /// 队列是否为空
    pub fn finish(&mut self, key: &str) {
        self.in_flight.remove(key);
    }

    pub fn is_empty(&self) -> bool {
        self.queues.values().all(|q| q.is_empty())
    }

    /// 队列长度
    pub fn len(&self) -> usize {
        self.queues.values().map(|q| q.len()).sum()
    }
}
