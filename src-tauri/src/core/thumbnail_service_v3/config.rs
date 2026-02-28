//! 缩略图服务配置模块
//! 
//! 包含 ThumbnailServiceConfig 结构体及其默认实现

#[derive(Clone, Copy)]
pub struct LaneQuota {
    pub visible: usize,
    pub prefetch: usize,
    pub background: usize,
}

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
    /// DB 读批窗口下限
    pub db_read_batch_min: usize,
    /// DB 读批窗口上限
    pub db_read_batch_max: usize,
    /// DB 写批窗口下限
    pub db_write_batch_min: usize,
    /// DB 写批窗口上限
    pub db_write_batch_max: usize,
    /// DB 批处理目标耗时（毫秒）
    pub db_batch_target_ms: u64,
    /// visible 车道加强阈值：visible >= side_total * 此系数 时使用 8:1:1
    pub scheduler_visible_boost_factor: usize,
    /// side 车道加强阈值：side_total > visible * 此系数 时使用 4:3:3
    pub scheduler_side_boost_factor: usize,
    /// visible 强势场景配额
    pub scheduler_visible_boost_quota: LaneQuota,
    /// 默认场景配额
    pub scheduler_default_quota: LaneQuota,
    /// side 强势场景配额
    pub scheduler_side_boost_quota: LaneQuota,
    /// 自适应并发下限
    pub adaptive_min_active_workers: usize,
    /// 自适应控制周期（毫秒）
    pub adaptive_tick_ms: u64,
    /// backlog 达到该值且耗时健康时尝试扩并发
    pub adaptive_scale_up_backlog: usize,
    /// 扩并发耗时阈值（毫秒）
    pub adaptive_scale_up_avg_ms: u64,
    /// 缩并发耗时阈值（毫秒）
    pub adaptive_scale_down_avg_ms: u64,
    /// 缩并发失败率阈值（百分比，0-100）
    pub adaptive_scale_down_fail_percent: usize,
    /// 解码阶段并发上限（主要约束 archive/video/folder）
    pub decode_stage_max_active: usize,
    /// 缩放阶段并发上限（主要约束 image/archive/video）
    pub scale_stage_max_active: usize,
    /// 编码阶段并发上限（主要约束 image/archive/video）
    pub encode_stage_max_active: usize,
    /// 内存缓存字节预算
    pub memory_cache_byte_budget: usize,
    /// 热度衰减触发阈值（预算百分比）
    pub memory_cache_decay_threshold_percent: usize,
    /// 每次热度衰减清理比例（百分比）
    pub memory_cache_decay_drop_percent: usize,
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

        let adaptive_min_active_workers = (worker_threads / 3).max(2).min(worker_threads);
        let decode_stage_max_active = (worker_threads / 2).max(1);
        let scale_stage_max_active = ((worker_threads * 3) / 4).max(1);
        let encode_stage_max_active = ((worker_threads * 2) / 3).max(1);
        let memory_cache_byte_budget = if num_cores >= 8 {
            512 * 1024 * 1024
        } else if num_cores >= 4 {
            256 * 1024 * 1024
        } else {
            128 * 1024 * 1024
        };
        
        Self {
            folder_search_depth: 3,  // 允许递归3层查找子文件夹中的图片
            memory_cache_size,
            worker_threads,
            thumbnail_size: 256,
            db_save_delay_ms: 2000,
            db_read_batch_min: 16,
            db_read_batch_max: 64,
            db_write_batch_min: 32,
            db_write_batch_max: 256,
            db_batch_target_ms: 16,
            scheduler_visible_boost_factor: 1,
            scheduler_side_boost_factor: 2,
            scheduler_visible_boost_quota: LaneQuota {
                visible: 8,
                prefetch: 1,
                background: 1,
            },
            scheduler_default_quota: LaneQuota {
                visible: 6,
                prefetch: 2,
                background: 1,
            },
            scheduler_side_boost_quota: LaneQuota {
                visible: 4,
                prefetch: 3,
                background: 3,
            },
            adaptive_min_active_workers,
            adaptive_tick_ms: 500,
            adaptive_scale_up_backlog: 24,
            adaptive_scale_up_avg_ms: 40,
            adaptive_scale_down_avg_ms: 160,
            adaptive_scale_down_fail_percent: 18,
            decode_stage_max_active,
            scale_stage_max_active,
            encode_stage_max_active,
            memory_cache_byte_budget,
            memory_cache_decay_threshold_percent: 85,
            memory_cache_decay_drop_percent: 12,
        }
    }
}
