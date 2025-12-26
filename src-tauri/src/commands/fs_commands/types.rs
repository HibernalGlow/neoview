//! 文件系统命令共享类型定义

use serde::{Deserialize, Serialize};

/// 文件信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: Option<u64>,
    pub modified: Option<String>,
}

/// 轻量级子文件夹项（仅用于 FolderTree）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubfolderItem {
    pub path: String,
    pub name: String,
    /// 是否有子目录（用于显示展开箭头）
    pub has_children: bool,
}

/// 目录快照响应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectorySnapshotResponse {
    pub items: Vec<crate::core::fs_manager::FsItem>,
    pub mtime: Option<u64>,
    pub cached: bool,
}

/// 批量目录快照结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDirectorySnapshotResult {
    pub path: String,
    pub snapshot: Option<DirectorySnapshotResponse>,
    pub error: Option<String>,
}

/// 压缩包扫描结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveScanResult {
    pub archive_path: String,
    pub entries: Vec<crate::core::archive::ArchiveEntry>,
    pub error: Option<String>,
}

/// 预加载结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreloadResult {
    pub total: usize,
    pub success: usize,
    pub failed: usize,
    pub total_bytes: usize,
    pub errors: Option<Vec<String>>,
}

/// 搜索选项
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    pub include_subfolders: Option<bool>,
    pub max_results: Option<usize>,
    pub search_in_path: Option<bool>,
}

/// 索引搜索选项
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexSearchOptions {
    pub include_subfolders: Option<bool>,
    pub images_only: Option<bool>,
    pub folders_only: Option<bool>,
    pub min_size: Option<u64>,
    pub max_size: Option<u64>,
    pub modified_after: Option<u64>,
    pub modified_before: Option<u64>,
}

/// 未索引文件结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnindexedFilesResult {
    pub files: Vec<String>,
    pub folders: Vec<String>,
    pub archives: Vec<String>,
}

/// 目录分页选项
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryPageOptions {
    pub offset: Option<usize>,
    pub limit: Option<usize>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

/// 目录流选项
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryStreamOptions {
    pub batch_size: Option<usize>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

/// 目录分页结果
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryPageResult {
    pub items: Vec<FileInfo>,
    pub total: usize,
    pub has_more: bool,
    pub next_offset: Option<usize>,
}

/// 目录流启动结果
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryStreamStartResult {
    pub stream_id: String,
    pub initial_batch: Vec<FileInfo>,
    pub total: usize,
    pub has_more: bool,
}

/// 流批次结果
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamBatchResult {
    pub items: Vec<FileInfo>,
    pub has_more: bool,
}

/// 备份文件信息
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: u64,
}

/// 回收站项目信息
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashItem {
    /// 原始文件名
    pub name: String,
    /// 原始路径
    pub original_path: String,
    /// 删除时间（Unix 时间戳，秒）
    pub deleted_at: u64,
    /// 是否为目录
    pub is_dir: bool,
}
