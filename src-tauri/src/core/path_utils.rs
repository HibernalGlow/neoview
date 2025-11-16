//! NeoView - Path Utilities
//! 路径相关的工具函数

use crate::models::BookType;
use sha1::{Sha1, Digest};

/// 规范化路径（统一使用正斜杠）
fn normalize_path(path: &str) -> String {
    path.replace('\\', "/")
}

/// 构建路径键（用于哈希计算）
/// 规则：
/// - 压缩包：archivePath::innerPath（或 archivePath::pagePath）
/// - 普通文件/文件夹：pagePath（完整路径）
pub fn build_path_key(
    book_path: &str,
    page_path: &str,
    book_type: &BookType,
    inner_path: Option<&str>,
) -> String {
    // 规范化路径（统一使用正斜杠）
    let normalized_book_path = normalize_path(book_path);
    let normalized_page_path = normalize_path(page_path);
    
    match book_type {
        BookType::Archive => {
            if let Some(inner) = inner_path {
                // 压缩包：使用 inner_path
                let normalized_inner = normalize_path(inner);
                format!("{}::{}", normalized_book_path, normalized_inner)
            } else {
                // 压缩包：使用 page_path
                format!("{}::{}", normalized_book_path, normalized_page_path)
            }
        }
        _ => normalized_page_path,
    }
}

/// 计算路径哈希（SHA1）
/// 对路径键进行 SHA1 哈希计算，返回十六进制字符串
pub fn calculate_path_hash(path_key: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(path_key.as_bytes());
    hex::encode(hasher.finalize())
}

