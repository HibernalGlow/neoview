//! 超分服务类型定义模块
//! 
//! 包含 TaskPriority, TaskScore, UpscaleTask, CacheEntry 等核心类型

use std::time::Instant;
use crate::core::pyo3_upscaler::UpscaleModel;

/// 任务优先级（数值越小优先级越高）
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum TaskPriority {
    /// 当前页面（最高优先级）
    Current = 0,
    /// 后方页（即将翻到的，高优先级）
    Forward = 1,
    /// 前方页（已翻过的，低优先级，通常不预加载）
    Backward = 2,
    /// 后台任务
    Background = 3,
}

/// 任务优先级分数（用于排序，越小越优先）
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct TaskScore {
    /// 基础优先级
    pub priority: TaskPriority,
    /// 距离当前页的偏移（绝对值）
    pub distance: usize,
}

/// 超分任务
#[derive(Clone)]
pub struct UpscaleTask {
    /// 书籍路径
    pub book_path: String,
    /// 页面索引
    pub page_index: usize,
    /// 图片路径（文件夹模式）或压缩包内路径
    pub image_path: String,
    /// 是否为压缩包内文件
    pub is_archive: bool,
    /// 压缩包路径（如果是压缩包内文件）
    pub archive_path: Option<String>,
    /// 图片哈希
    pub image_hash: String,
    /// 优先级分数（用于排序）
    pub score: TaskScore,
    /// 模型配置
    pub model: UpscaleModel,
    /// 是否允许缓存
    pub allow_cache: bool,
    /// 提交时间
    pub submitted_at: Instant,
}

impl UpscaleTask {
    /// 计算任务分数（基于当前页）
    pub fn calculate_score(page_index: usize, current_page: usize) -> TaskScore {
        if page_index == current_page {
            TaskScore {
                priority: TaskPriority::Current,
                distance: 0,
            }
        } else if page_index > current_page {
            // 后方页（即将翻到）
            TaskScore {
                priority: TaskPriority::Forward,
                distance: page_index - current_page,
            }
        } else {
            // 前方页（已翻过）
            TaskScore {
                priority: TaskPriority::Backward,
                distance: current_page - page_index,
            }
        }
    }
}

/// 缓存条目（只记录路径，不存储数据）
#[derive(Clone)]
pub struct CacheEntry {
    /// 缓存文件路径
    pub cache_path: String,
    /// 原始尺寸
    pub original_size: (u32, u32),
    /// 超分后尺寸
    pub upscaled_size: (u32, u32),
    /// 缓存时间
    pub cached_at: Instant,
}
