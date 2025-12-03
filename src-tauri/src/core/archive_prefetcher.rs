//! 压缩包页面预取模块
//!
//! 参考 NeeView 的 BookPageLoader 设计
//! 实现基于方向的智能预加载

use super::archive_page_cache::{PageCacheKey, SharedPageCache};
use log::{debug, info, warn};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::{Duration, Instant};

/// 预取任务
#[derive(Debug, Clone)]
struct PrefetchTask {
    /// 压缩包路径
    archive_path: PathBuf,
    /// 需要预取的页面（内部路径）
    pages: Vec<(usize, String)>,
    /// 任务创建时间
    created_at: Instant,
}

/// 预取状态
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PrefetchState {
    Idle,
    Running,
    Paused,
}

/// 预取配置
#[derive(Debug, Clone)]
pub struct PrefetchConfig {
    /// 向前预取页数
    pub ahead_count: usize,
    /// 向后预取页数
    pub behind_count: usize,
    /// 预取线程数
    pub worker_threads: usize,
    /// 预取任务超时（毫秒）
    pub timeout_ms: u64,
    /// 是否启用
    pub enabled: bool,
}

impl Default for PrefetchConfig {
    fn default() -> Self {
        Self {
            ahead_count: 3,
            behind_count: 1,
            worker_threads: 2,
            timeout_ms: 5000,
            enabled: true,
        }
    }
}

/// 预取器统计
#[derive(Debug, Clone, Default)]
pub struct PrefetchStats {
    pub total_requests: usize,
    pub cache_hits: usize,
    pub prefetch_count: usize,
    pub prefetch_bytes: usize,
    pub average_prefetch_time_ms: f64,
}

/// 压缩包页面预取器
///
/// 特点：
/// - 基于翻页方向的智能预取
/// - 后台线程异步执行
/// - 取消正在进行的无用预取
/// - 与页面缓存集成
pub struct ArchivePrefetcher {
    /// 配置
    config: RwLock<PrefetchConfig>,
    /// 页面缓存
    cache: SharedPageCache,
    /// 当前状态
    state: AtomicUsize,
    /// 取消标志
    cancel_flag: Arc<AtomicBool>,
    /// 当前任务
    current_task: Mutex<Option<PrefetchTask>>,
    /// 正在预取的页面
    pending_pages: RwLock<HashSet<String>>,
    /// 统计信息
    stats: RwLock<PrefetchStats>,
    /// 提取器函数
    extractor: Arc<dyn Fn(&Path, &str) -> Result<Vec<u8>, String> + Send + Sync>,
}

impl ArchivePrefetcher {
    /// 创建预取器
    pub fn new<F>(cache: SharedPageCache, extractor: F) -> Self
    where
        F: Fn(&Path, &str) -> Result<Vec<u8>, String> + Send + Sync + 'static,
    {
        Self {
            config: RwLock::new(PrefetchConfig::default()),
            cache,
            state: AtomicUsize::new(PrefetchState::Idle as usize),
            cancel_flag: Arc::new(AtomicBool::new(false)),
            current_task: Mutex::new(None),
            pending_pages: RwLock::new(HashSet::new()),
            stats: RwLock::new(PrefetchStats::default()),
            extractor: Arc::new(extractor),
        }
    }

    /// 设置配置
    pub fn set_config(&self, config: PrefetchConfig) {
        if let Ok(mut cfg) = self.config.write() {
            *cfg = config;
        }
    }

    /// 获取配置
    pub fn get_config(&self) -> PrefetchConfig {
        self.config.read().map(|c| c.clone()).unwrap_or_default()
    }

    /// 获取状态
    pub fn get_state(&self) -> PrefetchState {
        match self.state.load(Ordering::SeqCst) {
            0 => PrefetchState::Idle,
            1 => PrefetchState::Running,
            2 => PrefetchState::Paused,
            _ => PrefetchState::Idle,
        }
    }

    /// 请求预取
    ///
    /// # Arguments
    /// * `archive_path` - 压缩包路径
    /// * `current_index` - 当前页索引
    /// * `direction` - 翻页方向 (1: 向后, -1: 向前)
    /// * `all_pages` - 所有页面列表 (索引, 内部路径)
    pub fn request_prefetch(
        &self,
        archive_path: &Path,
        current_index: usize,
        direction: i32,
        all_pages: &[(usize, String)],
    ) {
        let config = self.get_config();
        if !config.enabled {
            return;
        }

        // 取消之前的任务
        self.cancel_current();

        // 计算需要预取的页面
        let pages_to_prefetch = self.calculate_prefetch_pages(
            current_index,
            direction,
            all_pages,
            config.ahead_count,
            config.behind_count,
        );

        if pages_to_prefetch.is_empty() {
            return;
        }

        // 过滤已缓存的页面
        let archive_path_str = archive_path.to_string_lossy().to_string();
        let pages_to_fetch: Vec<_> = pages_to_prefetch
            .into_iter()
            .filter(|(_, inner_path)| {
                let key = PageCacheKey::new(&archive_path_str, inner_path);
                !self.cache.contains(&key)
            })
            .collect();

        if pages_to_fetch.is_empty() {
            debug!("所有预取页面已在缓存中");
            return;
        }

        // 更新统计
        if let Ok(mut stats) = self.stats.write() {
            stats.total_requests += 1;
            stats.cache_hits += pages_to_prefetch.len() - pages_to_fetch.len();
        }

        // 创建任务
        let task = PrefetchTask {
            archive_path: archive_path.to_path_buf(),
            pages: pages_to_fetch,
            created_at: Instant::now(),
        };

        // 启动预取
        self.start_prefetch(task);
    }

    /// 计算需要预取的页面
    fn calculate_prefetch_pages(
        &self,
        current_index: usize,
        direction: i32,
        all_pages: &[(usize, String)],
        ahead_count: usize,
        behind_count: usize,
    ) -> Vec<(usize, String)> {
        let total = all_pages.len();
        if total == 0 {
            return Vec::new();
        }

        let mut result = Vec::new();

        // 根据方向决定预取优先级
        let (primary_count, secondary_count) = if direction >= 0 {
            (ahead_count, behind_count)
        } else {
            (behind_count, ahead_count)
        };

        // 主方向预取
        if direction >= 0 {
            // 向后预取
            for i in 1..=primary_count {
                let idx = current_index + i;
                if idx < total {
                    if let Some(page) = all_pages.iter().find(|(pi, _)| *pi == idx) {
                        result.push(page.clone());
                    }
                }
            }
            // 向前预取（次要）
            for i in 1..=secondary_count {
                if current_index >= i {
                    let idx = current_index - i;
                    if let Some(page) = all_pages.iter().find(|(pi, _)| *pi == idx) {
                        result.push(page.clone());
                    }
                }
            }
        } else {
            // 向前预取
            for i in 1..=primary_count {
                if current_index >= i {
                    let idx = current_index - i;
                    if let Some(page) = all_pages.iter().find(|(pi, _)| *pi == idx) {
                        result.push(page.clone());
                    }
                }
            }
            // 向后预取（次要）
            for i in 1..=secondary_count {
                let idx = current_index + i;
                if idx < total {
                    if let Some(page) = all_pages.iter().find(|(pi, _)| *pi == idx) {
                        result.push(page.clone());
                    }
                }
            }
        }

        result
    }

    /// 启动预取任务
    fn start_prefetch(&self, task: PrefetchTask) {
        // 存储当前任务
        if let Ok(mut current) = self.current_task.lock() {
            *current = Some(task.clone());
        }

        // 设置状态
        self.state.store(PrefetchState::Running as usize, Ordering::SeqCst);
        self.cancel_flag.store(false, Ordering::SeqCst);

        // 标记正在预取的页面
        if let Ok(mut pending) = self.pending_pages.write() {
            pending.clear();
            for (_, path) in &task.pages {
                pending.insert(path.clone());
            }
        }

        let cancel_flag = Arc::clone(&self.cancel_flag);
        let cache = Arc::clone(&self.cache);
        let extractor = Arc::clone(&self.extractor);
        let stats = Arc::new(Mutex::new((0usize, 0usize, Duration::ZERO))); // (count, bytes, time)
        let pending_pages = self.pending_pages.clone();

        let archive_path = task.archive_path.clone();
        let pages = task.pages.clone();
        let config = self.get_config();
        let timeout = Duration::from_millis(config.timeout_ms);

        // 在新线程中执行预取
        thread::spawn(move || {
            let start = Instant::now();
            let archive_path_str = archive_path.to_string_lossy().to_string();

            for (idx, inner_path) in pages {
                // 检查取消
                if cancel_flag.load(Ordering::SeqCst) {
                    debug!("预取任务被取消");
                    break;
                }

                // 检查超时
                if start.elapsed() > timeout {
                    debug!("预取任务超时");
                    break;
                }

                // 再次检查缓存（可能被其他线程加载）
                let key = PageCacheKey::new(&archive_path_str, &inner_path);
                if cache.contains(&key) {
                    continue;
                }

                // 执行提取
                let extract_start = Instant::now();
                match extractor(&archive_path, &inner_path) {
                    Ok(data) => {
                        let size = data.len();
                        cache.insert(key, data);
                        
                        // 更新统计
                        if let Ok(mut s) = stats.lock() {
                            s.0 += 1;
                            s.1 += size;
                            s.2 += extract_start.elapsed();
                        }

                        debug!(
                            "预取成功: page={} size={} elapsed={}ms",
                            idx,
                            size,
                            extract_start.elapsed().as_millis()
                        );
                    }
                    Err(e) => {
                        warn!("预取失败: page={} error={}", idx, e);
                    }
                }

                // 从 pending 中移除
                if let Ok(mut pending) = pending_pages.write() {
                    pending.remove(&inner_path);
                }
            }

            info!(
                "预取完成: total_elapsed={}ms",
                start.elapsed().as_millis()
            );
        });
    }

    /// 取消当前预取
    pub fn cancel_current(&self) {
        self.cancel_flag.store(true, Ordering::SeqCst);
        self.state.store(PrefetchState::Idle as usize, Ordering::SeqCst);
        
        if let Ok(mut pending) = self.pending_pages.write() {
            pending.clear();
        }
    }

    /// 暂停预取
    pub fn pause(&self) {
        self.state.store(PrefetchState::Paused as usize, Ordering::SeqCst);
    }

    /// 恢复预取
    pub fn resume(&self) {
        if self.get_state() == PrefetchState::Paused {
            self.state.store(PrefetchState::Idle as usize, Ordering::SeqCst);
        }
    }

    /// 检查页面是否正在预取
    pub fn is_prefetching(&self, inner_path: &str) -> bool {
        self.pending_pages
            .read()
            .map(|p| p.contains(inner_path))
            .unwrap_or(false)
    }

    /// 等待特定页面预取完成
    pub fn wait_for_page(&self, inner_path: &str, timeout: Duration) -> bool {
        let start = Instant::now();
        while self.is_prefetching(inner_path) {
            if start.elapsed() > timeout {
                return false;
            }
            thread::sleep(Duration::from_millis(10));
        }
        true
    }

    /// 获取统计信息
    pub fn get_stats(&self) -> PrefetchStats {
        self.stats.read().map(|s| s.clone()).unwrap_or_default()
    }

    /// 重置统计
    pub fn reset_stats(&self) {
        if let Ok(mut stats) = self.stats.write() {
            *stats = PrefetchStats::default();
        }
    }
}

/// 共享预取器
pub type SharedPrefetcher = Arc<ArchivePrefetcher>;

/// 创建共享预取器
pub fn create_shared_prefetcher<F>(cache: SharedPageCache, extractor: F) -> SharedPrefetcher
where
    F: Fn(&Path, &str) -> Result<Vec<u8>, String> + Send + Sync + 'static,
{
    Arc::new(ArchivePrefetcher::new(cache, extractor))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    #[test]
    fn test_calculate_prefetch_forward() {
        let cache = super::super::archive_page_cache::create_shared_cache(10, 10);
        let prefetcher = ArchivePrefetcher::new(cache, |_, _| Ok(vec![]));

        let pages: Vec<_> = (0..10).map(|i| (i, format!("{}.jpg", i))).collect();

        let result = prefetcher.calculate_prefetch_pages(3, 1, &pages, 2, 1);
        
        // 向后预取 2 页 (4, 5)，向前预取 1 页 (2)
        assert_eq!(result.len(), 3);
        assert!(result.iter().any(|(i, _)| *i == 4));
        assert!(result.iter().any(|(i, _)| *i == 5));
        assert!(result.iter().any(|(i, _)| *i == 2));
    }

    #[test]
    fn test_calculate_prefetch_backward() {
        let cache = super::super::archive_page_cache::create_shared_cache(10, 10);
        let prefetcher = ArchivePrefetcher::new(cache, |_, _| Ok(vec![]));

        let pages: Vec<_> = (0..10).map(|i| (i, format!("{}.jpg", i))).collect();

        let result = prefetcher.calculate_prefetch_pages(5, -1, &pages, 2, 1);
        
        // 向前预取 2 页 (4, 3)，向后预取 1 页 (6)
        assert_eq!(result.len(), 3);
        assert!(result.iter().any(|(i, _)| *i == 4));
        assert!(result.iter().any(|(i, _)| *i == 3));
        assert!(result.iter().any(|(i, _)| *i == 6));
    }
}
