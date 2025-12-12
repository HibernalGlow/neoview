//! PageFrame 错误处理模块
//!
//! 定义 PageFrame 系统的错误类型和转换

use std::fmt;
use thiserror::Error;

/// PageFrame 错误类型
#[derive(Debug, Error)]
pub enum PageFrameError {
    /// 页面索引越界
    #[error("页面索引越界: {index}, 总页数: {total}")]
    IndexOutOfBounds { index: usize, total: usize },

    /// 无效的页面位置
    #[error("无效的页面位置: index={index}, part={part}")]
    InvalidPosition { index: usize, part: i32 },

    /// 页面数据未找到
    #[error("页面数据未找到: {path}")]
    PageNotFound { path: String },

    /// 图片加载失败
    #[error("图片加载失败: {reason}")]
    ImageLoadFailed { reason: String },

    /// 缓存错误
    #[error("缓存错误: {reason}")]
    CacheError { reason: String },

    /// 配置错误
    #[error("配置错误: {reason}")]
    ConfigError { reason: String },

    /// IO 错误
    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),

    /// 内部错误
    #[error("内部错误: {reason}")]
    InternalError { reason: String },
}

impl PageFrameError {
    /// 创建索引越界错误
    pub fn index_out_of_bounds(index: usize, total: usize) -> Self {
        Self::IndexOutOfBounds { index, total }
    }

    /// 创建无效位置错误
    pub fn invalid_position(index: usize, part: i32) -> Self {
        Self::InvalidPosition { index, part }
    }

    /// 创建页面未找到错误
    pub fn page_not_found(path: impl Into<String>) -> Self {
        Self::PageNotFound { path: path.into() }
    }

    /// 创建图片加载失败错误
    pub fn image_load_failed(reason: impl Into<String>) -> Self {
        Self::ImageLoadFailed {
            reason: reason.into(),
        }
    }

    /// 创建缓存错误
    pub fn cache_error(reason: impl Into<String>) -> Self {
        Self::CacheError {
            reason: reason.into(),
        }
    }

    /// 创建配置错误
    pub fn config_error(reason: impl Into<String>) -> Self {
        Self::ConfigError {
            reason: reason.into(),
        }
    }

    /// 创建内部错误
    pub fn internal(reason: impl Into<String>) -> Self {
        Self::InternalError {
            reason: reason.into(),
        }
    }

    /// 是否可重试
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            Self::ImageLoadFailed { .. } | Self::CacheError { .. } | Self::IoError(_)
        )
    }

    /// 获取错误代码（用于前端识别）
    pub fn error_code(&self) -> &'static str {
        match self {
            Self::IndexOutOfBounds { .. } => "INDEX_OUT_OF_BOUNDS",
            Self::InvalidPosition { .. } => "INVALID_POSITION",
            Self::PageNotFound { .. } => "PAGE_NOT_FOUND",
            Self::ImageLoadFailed { .. } => "IMAGE_LOAD_FAILED",
            Self::CacheError { .. } => "CACHE_ERROR",
            Self::ConfigError { .. } => "CONFIG_ERROR",
            Self::IoError(_) => "IO_ERROR",
            Self::InternalError { .. } => "INTERNAL_ERROR",
        }
    }
}

/// PageFrame 结果类型别名
pub type PageFrameResult<T> = Result<T, PageFrameError>;

/// 可序列化的错误信息（用于 IPC）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PageFrameErrorInfo {
    /// 错误代码
    pub code: String,
    /// 错误消息
    pub message: String,
    /// 是否可重试
    pub retryable: bool,
}

impl From<&PageFrameError> for PageFrameErrorInfo {
    fn from(err: &PageFrameError) -> Self {
        Self {
            code: err.error_code().to_string(),
            message: err.to_string(),
            retryable: err.is_retryable(),
        }
    }
}

impl From<PageFrameError> for PageFrameErrorInfo {
    fn from(err: PageFrameError) -> Self {
        Self::from(&err)
    }
}

// 实现 Tauri 命令错误转换
impl serde::Serialize for PageFrameError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        PageFrameErrorInfo::from(self).serialize(serializer)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_creation() {
        let err = PageFrameError::index_out_of_bounds(10, 5);
        assert_eq!(err.error_code(), "INDEX_OUT_OF_BOUNDS");
        assert!(!err.is_retryable());

        let err = PageFrameError::image_load_failed("网络超时");
        assert_eq!(err.error_code(), "IMAGE_LOAD_FAILED");
        assert!(err.is_retryable());
    }

    #[test]
    fn test_error_info_conversion() {
        let err = PageFrameError::page_not_found("/path/to/image.jpg");
        let info: PageFrameErrorInfo = err.into();
        assert_eq!(info.code, "PAGE_NOT_FOUND");
        assert!(!info.retryable);
    }
}
