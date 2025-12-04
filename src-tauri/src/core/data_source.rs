//! 数据源模块
//! 隔离 Blob (IPC) 和 Tempfile (asset://) 两种加载模式

use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

/// 数据源模式
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DataSourceMode {
    /// Blob 模式：通过 IPC 传输二进制数据
    Blob,
    /// Tempfile 模式：解压到临时文件，通过 asset:// 协议访问
    Tempfile,
}

impl Default for DataSourceMode {
    fn default() -> Self {
        Self::Blob
    }
}

/// 数据源加载结果
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum DataSourceResult {
    /// Blob 数据
    Blob {
        data: Vec<u8>,
        mime_type: String,
    },
    /// 临时文件路径
    TempFile {
        path: String,
        mime_type: String,
    },
}

impl DataSourceResult {
    pub fn data_size(&self) -> usize {
        match self {
            Self::Blob { data, .. } => data.len(),
            Self::TempFile { path, .. } => {
                std::fs::metadata(path).map(|m| m.len() as usize).unwrap_or(0)
            }
        }
    }
}

/// Tempfile 缓存管理
pub struct TempfileCache {
    cache_dir: PathBuf,
    max_files: usize,
}

impl TempfileCache {
    pub fn new() -> Self {
        let cache_dir = std::env::temp_dir().join("neoview_cache");
        std::fs::create_dir_all(&cache_dir).ok();
        
        Self {
            cache_dir,
            max_files: 500,
        }
    }

    /// 计算缓存键
    pub fn cache_key(archive_path: &Path, inner_path: &str) -> u64 {
        let mut hasher = DefaultHasher::new();
        archive_path.hash(&mut hasher);
        inner_path.hash(&mut hasher);
        hasher.finish()
    }

    /// 获取缓存文件路径
    pub fn get_cache_path(&self, archive_path: &Path, inner_path: &str, ext: &str) -> PathBuf {
        let hash = Self::cache_key(archive_path, inner_path);
        self.cache_dir.join(format!("{:x}.{}", hash, ext))
    }

    /// 检查缓存是否存在
    pub fn has_cached(&self, archive_path: &Path, inner_path: &str, ext: &str) -> Option<PathBuf> {
        let path = self.get_cache_path(archive_path, inner_path, ext);
        if path.exists() {
            Some(path)
        } else {
            None
        }
    }

    /// 写入缓存
    pub fn write_cache(
        &self,
        archive_path: &Path,
        inner_path: &str,
        ext: &str,
        data: &[u8],
    ) -> Result<PathBuf, String> {
        let path = self.get_cache_path(archive_path, inner_path, ext);
        std::fs::write(&path, data).map_err(|e| format!("写入缓存失败: {}", e))?;
        Ok(path)
    }

    /// 清理过期缓存
    pub fn cleanup_old_files(&self) -> usize {
        let mut files: Vec<_> = match std::fs::read_dir(&self.cache_dir) {
            Ok(entries) => entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_file())
                .filter_map(|e| {
                    let path = e.path();
                    let modified = e.metadata().ok()?.modified().ok()?;
                    Some((path, modified))
                })
                .collect(),
            Err(_) => return 0,
        };

        if files.len() <= self.max_files {
            return 0;
        }

        // 按修改时间排序，删除最旧的
        files.sort_by_key(|(_, mtime)| *mtime);
        let to_delete = files.len() - self.max_files;
        
        let mut deleted = 0;
        for (path, _) in files.into_iter().take(to_delete) {
            if std::fs::remove_file(&path).is_ok() {
                deleted += 1;
            }
        }

        if deleted > 0 {
            log::info!("🧹 清理了 {} 个临时缓存文件", deleted);
        }

        deleted
    }
}

impl Default for TempfileCache {
    fn default() -> Self {
        Self::new()
    }
}

/// 获取 MIME 类型
pub fn get_mime_type(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "jxl" => "image/jxl",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "heic" | "heif" => "image/heic",
        _ => "application/octet-stream",
    }
}

/// 从路径获取扩展名
pub fn get_extension(path: &str) -> &str {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_key_consistency() {
        let key1 = TempfileCache::cache_key(Path::new("/a/b.zip"), "img/1.jpg");
        let key2 = TempfileCache::cache_key(Path::new("/a/b.zip"), "img/1.jpg");
        assert_eq!(key1, key2);
    }

    #[test]
    fn test_mime_type() {
        assert_eq!(get_mime_type("jpg"), "image/jpeg");
        assert_eq!(get_mime_type("PNG"), "image/png");
        assert_eq!(get_mime_type("avif"), "image/avif");
    }
}
