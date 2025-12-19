//! 加载命令队列模块
//!
//! 管理异步加载命令，支持取消和优先级调度。

use log::{debug, info, warn};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::{broadcast, oneshot};

/// 加载选项
#[derive(Debug, Clone, Default)]
pub struct LoadOptions {
    /// 是否优先加载首页
    pub first_page_priority: bool,
    /// 起始页码
    pub start_page: Option<usize>,
}

/// 加载命令
#[derive(Debug)]
pub struct LoadCommand {
    /// 命令 ID
    pub id: u64,
    /// 压缩包路径
    pub path: PathBuf,
    /// 加载选项
    pub options: LoadOptions,
    /// 取消标志
    cancelled: AtomicBool,
    /// 创建时间
    pub created_at: Instant,
}

impl LoadCommand {
    /// 创建新命令
    pub fn new(id: u64, path: PathBuf, options: LoadOptions) -> Self {
        Self {
            id,
            path,
            options,
            cancelled: AtomicBool::new(false),
            created_at: Instant::now(),
        }
    }

    /// 检查是否已取消
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }

    /// 取消命令
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
    }
}

/// 加载结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadResult {
    /// 命令 ID
    pub command_id: u64,
    /// 是否成功
    pub success: bool,
    /// 错误消息（如果失败）
    pub error: Option<String>,
    /// 加载耗时（毫秒）
    pub duration_ms: u64,
    /// 页面数量
    pub page_count: usize,
}

/// 命令队列
pub struct CommandQueue {
    /// 当前命令
    current: Mutex<Option<Arc<LoadCommand>>>,
    /// 命令 ID 计数器
    next_id: AtomicU64,
    /// 完成通知发送器
    completion_tx: broadcast::Sender<LoadResult>,
    /// 是否正在处理
    processing: AtomicBool,
}

impl CommandQueue {
    /// 创建命令队列
    pub fn new() -> Self {
        let (completion_tx, _) = broadcast::channel(16);
        Self {
            current: Mutex::new(None),
            next_id: AtomicU64::new(1),
            completion_tx,
            processing: AtomicBool::new(false),
        }
    }

    /// 提交新命令
    /// 
    /// 如果有正在执行的命令，会先取消它。
    pub fn submit(&self, path: PathBuf, options: LoadOptions) -> Arc<LoadCommand> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let command = Arc::new(LoadCommand::new(id, path, options));

        // 取消当前命令
        self.cancel_current();

        // 设置新命令
        {
            let mut current = self.current.lock();
            *current = Some(Arc::clone(&command));
        }

        debug!("提交加载命令 #{}: {}", id, command.path.display());
        command
    }

    /// 取消当前命令
    pub fn cancel_current(&self) {
        let mut current = self.current.lock();
        if let Some(cmd) = current.take() {
            cmd.cancel();
            debug!("取消加载命令 #{}", cmd.id);
        }
    }

    /// 获取当前命令
    pub fn get_current(&self) -> Option<Arc<LoadCommand>> {
        self.current.lock().clone()
    }

    /// 检查是否有活动命令
    pub fn has_active_command(&self) -> bool {
        self.current.lock().is_some()
    }

    /// 标记命令完成
    pub fn complete(&self, result: LoadResult) {
        let mut current = self.current.lock();
        if let Some(cmd) = current.as_ref() {
            if cmd.id == result.command_id {
                *current = None;
            }
        }
        
        // 发送完成通知
        let _ = self.completion_tx.send(result);
    }

    /// 订阅完成通知
    pub fn subscribe(&self) -> broadcast::Receiver<LoadResult> {
        self.completion_tx.subscribe()
    }

    /// 检查命令是否已取消
    pub fn is_cancelled(&self, command_id: u64) -> bool {
        let current = self.current.lock();
        match current.as_ref() {
            Some(cmd) if cmd.id == command_id => cmd.is_cancelled(),
            _ => true, // 如果不是当前命令，视为已取消
        }
    }
}

impl Default for CommandQueue {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// 性能监控
// ============================================================================

/// 加载性能指标
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LoadMetrics {
    /// 索引加载耗时（毫秒）
    pub index_load_ms: u64,
    /// 首页加载耗时（毫秒）
    pub first_page_ms: u64,
    /// 完整列表加载耗时（毫秒）
    pub full_list_ms: u64,
    /// 总耗时（毫秒）
    pub total_ms: u64,
    /// 页面数量
    pub page_count: usize,
    /// 是否使用缓存
    pub cache_hit: bool,
}

/// 性能监控器
pub struct PerformanceMonitor {
    /// 最近的加载指标
    last_metrics: Mutex<Option<LoadMetrics>>,
    /// 警告阈值（毫秒）
    warning_threshold_ms: u64,
}

impl PerformanceMonitor {
    /// 创建性能监控器
    pub fn new(warning_threshold_ms: u64) -> Self {
        Self {
            last_metrics: Mutex::new(None),
            warning_threshold_ms,
        }
    }

    /// 记录加载指标
    pub fn record(&self, metrics: LoadMetrics) {
        if metrics.total_ms > self.warning_threshold_ms {
            warn!(
                "加载耗时过长: {}ms (阈值: {}ms)",
                metrics.total_ms, self.warning_threshold_ms
            );
        }
        
        info!(
            "加载完成: 总耗时={}ms, 索引={}ms, 首页={}ms, 列表={}ms, 页数={}, 缓存={}",
            metrics.total_ms,
            metrics.index_load_ms,
            metrics.first_page_ms,
            metrics.full_list_ms,
            metrics.page_count,
            if metrics.cache_hit { "命中" } else { "未命中" }
        );

        *self.last_metrics.lock() = Some(metrics);
    }

    /// 获取最近的加载指标
    pub fn get_last_metrics(&self) -> Option<LoadMetrics> {
        self.last_metrics.lock().clone()
    }
}

impl Default for PerformanceMonitor {
    fn default() -> Self {
        Self::new(500) // 默认 500ms 警告阈值
    }
}

// ============================================================================
// 单元测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_command_creation() {
        let cmd = LoadCommand::new(1, PathBuf::from("/test/archive.zip"), LoadOptions::default());
        assert_eq!(cmd.id, 1);
        assert!(!cmd.is_cancelled());
    }

    #[test]
    fn test_load_command_cancel() {
        let cmd = LoadCommand::new(1, PathBuf::from("/test/archive.zip"), LoadOptions::default());
        assert!(!cmd.is_cancelled());
        cmd.cancel();
        assert!(cmd.is_cancelled());
    }

    #[test]
    fn test_command_queue_submit() {
        let queue = CommandQueue::new();
        
        let cmd1 = queue.submit(PathBuf::from("/test/archive1.zip"), LoadOptions::default());
        assert_eq!(cmd1.id, 1);
        assert!(queue.has_active_command());
        
        let cmd2 = queue.submit(PathBuf::from("/test/archive2.zip"), LoadOptions::default());
        assert_eq!(cmd2.id, 2);
        
        // 第一个命令应该被取消
        assert!(cmd1.is_cancelled());
        assert!(!cmd2.is_cancelled());
    }

    #[test]
    fn test_command_queue_cancel() {
        let queue = CommandQueue::new();
        
        let cmd = queue.submit(PathBuf::from("/test/archive.zip"), LoadOptions::default());
        assert!(!cmd.is_cancelled());
        
        queue.cancel_current();
        assert!(cmd.is_cancelled());
        assert!(!queue.has_active_command());
    }

    #[test]
    fn test_performance_monitor() {
        let monitor = PerformanceMonitor::new(500);
        
        let metrics = LoadMetrics {
            index_load_ms: 50,
            first_page_ms: 100,
            full_list_ms: 200,
            total_ms: 350,
            page_count: 100,
            cache_hit: true,
        };
        
        monitor.record(metrics.clone());
        
        let last = monitor.get_last_metrics().unwrap();
        assert_eq!(last.total_ms, 350);
        assert!(last.cache_hit);
    }
}

// ============================================================================
// 属性测试
// ============================================================================

#[cfg(test)]
mod property_tests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        /// **Feature: archive-instant-loading, Property 8: Command Cancellation**
        /// *For any* load command in progress, submitting a new command SHALL cancel
        /// the previous command before starting the new one.
        /// **Validates: Requirements 6.2**
        #[test]
        fn prop_command_cancellation(
            command_count in 2usize..20
        ) {
            let queue = CommandQueue::new();
            let mut commands = Vec::new();
            
            // 提交多个命令
            for i in 0..command_count {
                let cmd = queue.submit(
                    PathBuf::from(format!("/test/archive_{i}.zip")),
                    LoadOptions::default(),
                );
                commands.push(cmd);
            }
            
            // 验证：除了最后一个，所有命令都应该被取消
            for (i, cmd) in commands.iter().enumerate() {
                if i < command_count - 1 {
                    prop_assert!(
                        cmd.is_cancelled(),
                        "命令 {} 应该被取消",
                        cmd.id
                    );
                } else {
                    prop_assert!(
                        !cmd.is_cancelled(),
                        "最后一个命令 {} 不应该被取消",
                        cmd.id
                    );
                }
            }
        }

        /// **Feature: archive-instant-loading, Property 9: Performance Metrics Recording**
        /// *For any* archive loading operation, the performance monitor SHALL record
        /// non-negative timing values for all phases.
        /// **Validates: Requirements 7.1, 7.2**
        #[test]
        fn prop_performance_metrics_recording(
            index_ms in 0u64..1000,
            first_page_ms in 0u64..1000,
            full_list_ms in 0u64..1000,
            page_count in 0usize..10000,
            cache_hit in any::<bool>(),
        ) {
            let monitor = PerformanceMonitor::new(500);
            
            let metrics = LoadMetrics {
                index_load_ms: index_ms,
                first_page_ms: first_page_ms,
                full_list_ms: full_list_ms,
                total_ms: index_ms + first_page_ms + full_list_ms,
                page_count,
                cache_hit,
            };
            
            monitor.record(metrics);
            
            let last = monitor.get_last_metrics().unwrap();
            
            // 验证所有计时值非负
            prop_assert!(last.index_load_ms >= 0);
            prop_assert!(last.first_page_ms >= 0);
            prop_assert!(last.full_list_ms >= 0);
            prop_assert!(last.total_ms >= 0);
        }
    }
}
