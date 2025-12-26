//! 缩略图命令类型定义
//! 包含请求和响应的数据结构

use serde::{Deserialize, Serialize};

/// 缩略图索引请求
#[derive(Debug, Deserialize)]
pub struct ThumbnailIndexRequest {
    pub path: String,
    pub category: Option<String>,
}

/// 缩略图索引结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailIndexResult {
    pub path: String,
    pub exists: bool,
}

/// 文件夹扫描结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderScanResult {
    pub folder: String,
    pub matched_path: Option<String>,
    pub matched_type: Option<String>,
    pub generated: bool,
    pub message: Option<String>,
}

/// 文件夹匹配类型（内部使用）
#[derive(Clone, Copy)]
pub enum FolderMatchKind {
    Image,
    Archive,
}

impl FolderMatchKind {
    /// 获取字符串表示
    pub fn as_str(&self) -> &'static str {
        match self {
            FolderMatchKind::Image => "image",
            FolderMatchKind::Archive => "archive",
        }
    }
}

impl ToString for FolderMatchKind {
    fn to_string(&self) -> String {
        self.as_str().to_string()
    }
}
