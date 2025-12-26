//! 缩略图数据库类型定义

use serde::{Deserialize, Serialize};

/// 压缩统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressionStats {
    /// 总条目数
    pub total_entries: u64,
    /// 压缩后总大小 (字节)
    pub compressed_size_bytes: u64,
    /// 原始总大小 (字节)
    pub uncompressed_size_bytes: u64,
    /// 压缩比 (compressed / uncompressed)
    pub compression_ratio: f64,
}

/// 缩略图数据库统计信息
#[derive(Debug, Clone)]
pub struct ThumbnailDbStats {
    pub total_entries: i64,
    pub file_entries: i64,
    pub folder_entries: i64,
    pub total_size_bytes: i64,
    pub oldest_entry: Option<String>,
    pub newest_entry: Option<String>,
    pub database_size_bytes: u64,
}

/// 缩略图数据库记录
#[derive(Debug)]
pub struct ThumbnailDbRecord {
    pub key: String,
    pub category: String,
    pub blob: Option<Vec<u8>>,
}
