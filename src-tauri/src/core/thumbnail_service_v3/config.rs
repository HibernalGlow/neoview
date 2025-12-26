//! 缩略图服务配置模块
//! 
//! 包含 ThumbnailServiceConfig 结构体及其默认实现

/// 配置参数
#[derive(Clone)]
pub struct ThumbnailServiceConfig {
    /// 文件夹搜索深度
    pub folder_search_depth: u32,
    /// LRU 内存缓存大小
    pub memory_cache_size: usize,
    /// 后台工作线程数
    pub worker_threads: usize,
    /// 缩略图尺寸
    pub thumbnail_size: u32,
    /// 数据库延迟保存时间 (毫秒)
    pub db_save_delay_ms: u64,
}

impl Default for ThumbnailServiceConfig {
    fn default() -> Self {
        // 根据 CPU 核心数动态调整线程数
        let num_cores = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);
        
        // 线程数 = CPU核心数 * 1.5，最少4，最多16
        let worker_threads = ((num_cores * 3) / 2).max(4).min(16);
        
        // 动态内存缓存：基于可用系统内存的估算
        // 假设每个缩略图平均 30KB，最少512，最多4096
        // 默认 1024，如果核心数多则增加
        let memory_cache_size = if num_cores >= 8 {
            2048
        } else if num_cores >= 4 {
            1024
        } else {
            512
        };
        
        Self {
            folder_search_depth: 1,  // 优化：限制扫描深度为1，减少I/O
            memory_cache_size,
            worker_threads,
            thumbnail_size: 256,
            db_save_delay_ms: 2000,
        }
    }
}
