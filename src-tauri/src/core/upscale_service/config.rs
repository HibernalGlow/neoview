//! 超分服务配置模块
//! 
//! 包含 UpscaleServiceConfig 结构体及其默认实现

/// 服务配置
#[derive(Debug, Clone)]
pub struct UpscaleServiceConfig {
    /// 工作线程数
    pub worker_threads: usize,
    /// 预超分范围（当前页前后各 N 页）
    pub preload_range: usize,
    /// 前方页权重（阅读方向优先）
    pub forward_priority_weight: f32,
    /// 默认超时（秒）
    pub default_timeout: f64,
}

impl Default for UpscaleServiceConfig {
    fn default() -> Self {
        Self {
            worker_threads: 2,
            preload_range: 5, // 前后各5页
            forward_priority_weight: 0.7, // 前方页优先
            default_timeout: 120.0,
        }
    }
}
