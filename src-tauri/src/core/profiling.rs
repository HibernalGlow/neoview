//! 性能分析模块
//! 使用 puffin 进行性能分析（仅在启用 profiling feature 时可用）

/// 性能分析宏：标记函数
/// 在启用 profiling feature 时使用 puffin，否则为空操作
#[cfg(feature = "profiling")]
#[macro_export]
macro_rules! profile_function {
    () => {
        puffin::profile_function!();
    };
    ($name:expr) => {
        puffin::profile_function!($name);
    };
}

#[cfg(not(feature = "profiling"))]
#[macro_export]
macro_rules! profile_function {
    () => {};
    ($name:expr) => {};
}

/// 性能分析宏：标记代码块
#[cfg(feature = "profiling")]
#[macro_export]
macro_rules! profile_scope {
    ($name:expr) => {
        puffin::profile_scope!($name);
    };
}

#[cfg(not(feature = "profiling"))]
#[macro_export]
macro_rules! profile_scope {
    ($name:expr) => {};
}

/// 初始化性能分析
#[cfg(feature = "profiling")]
pub fn init_profiling() {
    puffin::set_scopes_on(true);
    log::info!("🔬 Puffin 性能分析已启用");
}

#[cfg(not(feature = "profiling"))]
pub fn init_profiling() {
    // 未启用 profiling feature，不做任何事
}

/// 开始新的性能分析帧
#[cfg(feature = "profiling")]
pub fn new_frame() {
    puffin::GlobalProfiler::lock().new_frame();
}

#[cfg(not(feature = "profiling"))]
pub fn new_frame() {
    // 未启用 profiling feature，不做任何事
}

/// 获取性能分析数据
#[cfg(feature = "profiling")]
pub fn get_profiling_data() -> Option<Vec<u8>> {
    let data = puffin::GlobalProfiler::lock().report();
    Some(rmp_serde::to_vec(&data).ok()?)
}

#[cfg(not(feature = "profiling"))]
pub fn get_profiling_data() -> Option<Vec<u8>> {
    None
}

/// 性能计时器
/// 用于手动测量代码块执行时间
pub struct Timer {
    name: &'static str,
    start: std::time::Instant,
}

impl Timer {
    /// 创建新的计时器
    pub fn new(name: &'static str) -> Self {
        Self {
            name,
            start: std::time::Instant::now(),
        }
    }

    /// 获取已经过的时间（毫秒）
    pub fn elapsed_ms(&self) -> u64 {
        self.start.elapsed().as_millis() as u64
    }

    /// 获取已经过的时间（微秒）
    pub fn elapsed_us(&self) -> u64 {
        self.start.elapsed().as_micros() as u64
    }

    /// 记录并返回耗时
    pub fn finish(self) -> u64 {
        let elapsed = self.elapsed_ms();
        if elapsed > 100 {
            log::warn!("⏱️ {} 耗时 {}ms（超过 100ms）", self.name, elapsed);
        } else if elapsed > 10 {
            log::debug!("⏱️ {} 耗时 {}ms", self.name, elapsed);
        }
        elapsed
    }
}

impl Drop for Timer {
    fn drop(&mut self) {
        // 如果没有调用 finish()，在 drop 时记录
        let elapsed = self.elapsed_ms();
        if elapsed > 100 {
            log::warn!("⏱️ {} 耗时 {}ms（超过 100ms，未调用 finish）", self.name, elapsed);
        }
    }
}

/// 性能统计收集器
#[derive(Debug, Default)]
pub struct PerfStats {
    /// 操作名称
    pub name: String,
    /// 总调用次数
    pub call_count: u64,
    /// 总耗时（微秒）
    pub total_us: u64,
    /// 最小耗时（微秒）
    pub min_us: u64,
    /// 最大耗时（微秒）
    pub max_us: u64,
}

impl PerfStats {
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            call_count: 0,
            total_us: 0,
            min_us: u64::MAX,
            max_us: 0,
        }
    }

    /// 记录一次调用
    pub fn record(&mut self, duration_us: u64) {
        self.call_count += 1;
        self.total_us += duration_us;
        self.min_us = self.min_us.min(duration_us);
        self.max_us = self.max_us.max(duration_us);
    }

    /// 获取平均耗时（微秒）
    pub fn avg_us(&self) -> u64 {
        if self.call_count > 0 {
            self.total_us / self.call_count
        } else {
            0
        }
    }

    /// 格式化输出
    pub fn summary(&self) -> String {
        format!(
            "{}: calls={}, avg={}μs, min={}μs, max={}μs, total={}ms",
            self.name,
            self.call_count,
            self.avg_us(),
            if self.min_us == u64::MAX { 0 } else { self.min_us },
            self.max_us,
            self.total_us / 1000
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread::sleep;
    use std::time::Duration;

    #[test]
    fn test_timer() {
        let timer = Timer::new("test_operation");
        sleep(Duration::from_millis(10));
        let elapsed = timer.finish();
        assert!(elapsed >= 10);
    }

    #[test]
    fn test_perf_stats() {
        let mut stats = PerfStats::new("test");
        
        stats.record(100);
        stats.record(200);
        stats.record(150);
        
        assert_eq!(stats.call_count, 3);
        assert_eq!(stats.total_us, 450);
        assert_eq!(stats.min_us, 100);
        assert_eq!(stats.max_us, 200);
        assert_eq!(stats.avg_us(), 150);
    }
}
