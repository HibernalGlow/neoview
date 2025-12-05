//! NeoView - Job 定义
//! 参考 NeeView 的 Job 系统

use std::future::Future;
use std::pin::Pin;
use tokio_util::sync::CancellationToken;

/// 任务优先级
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum JobPriority {
    /// 缩略图加载 (最低)
    Thumbnail = 10,
    /// 预加载页面
    Preload = 50,
    /// 当前页面加载
    CurrentPage = 90,
    /// 紧急任务 (如切书)
    Urgent = 100,
}

impl Default for JobPriority {
    fn default() -> Self {
        Self::CurrentPage
    }
}

/// 任务类别
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum JobCategory {
    /// 页面内容加载
    PageContent,
    /// 缩略图生成
    Thumbnail,
    /// 压缩包扫描
    ArchiveScan,
}

/// 任务结果类型
pub type JobResult = Result<JobOutput, JobError>;

/// 任务输出
#[derive(Debug, Clone)]
pub enum JobOutput {
    /// 页面加载完成
    PageLoaded {
        book_path: String,
        page_index: usize,
        data: Vec<u8>,
        mime_type: String,
    },
    /// 缩略图加载完成
    ThumbnailLoaded {
        path: String,
        data: Vec<u8>,
    },
    /// 压缩包扫描完成
    ArchiveScanned {
        path: String,
        entries: Vec<String>,
    },
    /// 空结果（用于取消等情况）
    Empty,
}

/// 任务错误
#[derive(Debug, Clone)]
pub struct JobError {
    pub message: String,
    pub is_cancelled: bool,
}

impl JobError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            is_cancelled: false,
        }
    }

    pub fn cancelled() -> Self {
        Self {
            message: "Job cancelled".to_string(),
            is_cancelled: true,
        }
    }
}

impl std::fmt::Display for JobError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for JobError {}

/// 任务执行器类型
pub type JobExecutor = Box<
    dyn FnOnce(CancellationToken) -> Pin<Box<dyn Future<Output = JobResult> + Send>>
        + Send
        + 'static,
>;

/// 任务定义
pub struct Job {
    /// 唯一标识 (用于去重和取消)
    pub key: String,
    /// 优先级
    pub priority: JobPriority,
    /// 类别
    pub category: JobCategory,
    /// 执行器
    pub executor: JobExecutor,
    /// 创建时间（用于 FIFO 排序）
    pub created_at: std::time::Instant,
}

impl Job {
    /// 创建新任务
    pub fn new<F, Fut>(key: String, priority: JobPriority, category: JobCategory, executor: F) -> Self
    where
        F: FnOnce(CancellationToken) -> Fut + Send + 'static,
        Fut: Future<Output = JobResult> + Send + 'static,
    {
        Self {
            key,
            priority,
            category,
            executor: Box::new(move |token| Box::pin(executor(token))),
            created_at: std::time::Instant::now(),
        }
    }

    /// 创建页面加载任务
    pub fn page_load<F, Fut>(
        book_path: &str,
        page_index: usize,
        priority: JobPriority,
        executor: F,
    ) -> Self
    where
        F: FnOnce(CancellationToken) -> Fut + Send + 'static,
        Fut: Future<Output = JobResult> + Send + 'static,
    {
        let key = format!("page:{}:{}", book_path, page_index);
        Self::new(key, priority, JobCategory::PageContent, executor)
    }

    /// 创建缩略图加载任务
    pub fn thumbnail_load<F, Fut>(path: &str, executor: F) -> Self
    where
        F: FnOnce(CancellationToken) -> Fut + Send + 'static,
        Fut: Future<Output = JobResult> + Send + 'static,
    {
        let key = format!("thumb:{}", path);
        Self::new(key, JobPriority::Thumbnail, JobCategory::Thumbnail, executor)
    }
}

impl std::fmt::Debug for Job {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Job")
            .field("key", &self.key)
            .field("priority", &self.priority)
            .field("category", &self.category)
            .finish()
    }
}
