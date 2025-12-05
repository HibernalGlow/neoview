//! NeoView - FileProxy 临时文件管理
//! 参考 NeeView 的 ArchiveEntry.GetFileProxyAsync
//!
//! 核心功能：
//! - 判断是否需要提取到临时文件
//! - 管理临时文件生命周期
//! - 自动清理过期临时文件

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// 默认大文件阈值 (800MB) - 超过此大小使用临时文件
pub const DEFAULT_LARGE_FILE_THRESHOLD: usize = 800 * 1024 * 1024;

/// 临时文件过期时间 (5分钟)
const TEMP_FILE_TTL: Duration = Duration::from_secs(300);

/// 临时文件缓存条目
struct TempFileEntry {
    /// 临时文件路径
    path: PathBuf,
    /// 创建时间
    created_at: Instant,
    /// 最后访问时间
    last_accessed: Instant,
    /// 引用计数
    ref_count: usize,
}

/// FileProxy - 文件代理
/// 
/// 对于需要提取到临时文件的情况（视频、大文件），
/// 提供统一的访问接口
#[derive(Debug, Clone)]
pub struct FileProxy {
    /// 原始路径（可能是压缩包内路径）
    pub source_path: String,
    /// 实际可访问路径（可能是临时文件）
    pub access_path: String,
    /// 是否是临时文件
    pub is_temp: bool,
    /// MIME 类型
    pub mime_type: String,
}

impl FileProxy {
    /// 创建内存模式的 FileProxy（不使用临时文件）
    pub fn memory(source_path: &str, mime_type: &str) -> Self {
        Self {
            source_path: source_path.to_string(),
            access_path: source_path.to_string(),
            is_temp: false,
            mime_type: mime_type.to_string(),
        }
    }

    /// 创建临时文件模式的 FileProxy
    pub fn temp(source_path: &str, temp_path: &str, mime_type: &str) -> Self {
        Self {
            source_path: source_path.to_string(),
            access_path: temp_path.to_string(),
            is_temp: true,
            mime_type: mime_type.to_string(),
        }
    }
}

/// 临时文件管理器
pub struct TempFileManager {
    /// 临时文件目录
    temp_dir: PathBuf,
    /// 缓存: (book_path:inner_path) -> TempFileEntry
    cache: Mutex<HashMap<String, TempFileEntry>>,
    /// 最大缓存文件数
    max_files: usize,
    /// 大文件阈值（字节）- 可前端配置
    large_file_threshold: Mutex<usize>,
}

impl TempFileManager {
    /// 创建临时文件管理器
    pub fn new(temp_dir: PathBuf) -> Self {
        // 确保目录存在
        if !temp_dir.exists() {
            let _ = std::fs::create_dir_all(&temp_dir);
        }

        Self {
            temp_dir,
            cache: Mutex::new(HashMap::new()),
            max_files: 50,
            large_file_threshold: Mutex::new(DEFAULT_LARGE_FILE_THRESHOLD),
        }
    }

    /// 获取当前大文件阈值
    pub fn get_large_file_threshold(&self) -> usize {
        *self.large_file_threshold.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// 设置大文件阈值（字节）
    pub fn set_large_file_threshold(&self, threshold: usize) {
        if let Ok(mut t) = self.large_file_threshold.lock() {
            *t = threshold;
            log::info!("📁 TempFileManager: 设置大文件阈值为 {} MB", threshold / 1024 / 1024);
        }
    }

    /// 判断是否需要使用临时文件
    pub fn needs_temp_file(&self, content_type: &super::book_context::PageContentType, estimated_size: usize) -> bool {
        use super::book_context::PageContentType;
        
        match content_type {
            // 视频必须使用临时文件（浏览器需要文件路径）
            PageContentType::Video => true,
            // 大文件使用临时文件避免内存压力
            _ if estimated_size > self.get_large_file_threshold() => true,
            // 其他情况使用内存
            _ => false,
        }
    }

    /// 生成缓存键
    fn cache_key(book_path: &str, inner_path: &str) -> String {
        format!("{}:{}", book_path, inner_path)
    }

    /// 生成临时文件路径
    fn temp_file_path(&self, book_path: &str, inner_path: &str) -> PathBuf {
        // 使用 MD5 哈希生成唯一文件名
        let key = Self::cache_key(book_path, inner_path);
        let hash = format!("{:x}", md5::compute(key.as_bytes()));
        
        // 保留原始扩展名
        let ext = Path::new(inner_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("tmp");
        
        self.temp_dir.join(format!("{}.{}", hash, ext))
    }

    /// 获取或创建临时文件
    pub fn get_or_create(
        &self,
        book_path: &str,
        inner_path: &str,
        data: &[u8],
    ) -> Result<PathBuf, String> {
        let key = Self::cache_key(book_path, inner_path);
        let temp_path = self.temp_file_path(book_path, inner_path);

        let mut cache = self.cache.lock().map_err(|e| e.to_string())?;

        // 检查缓存
        if let Some(entry) = cache.get_mut(&key) {
            if temp_path.exists() {
                entry.last_accessed = Instant::now();
                entry.ref_count += 1;
                return Ok(entry.path.clone());
            }
        }

        // 清理过期文件
        self.cleanup_expired(&mut cache);

        // 写入新文件
        std::fs::write(&temp_path, data)
            .map_err(|e| format!("写入临时文件失败: {}", e))?;

        log::debug!(
            "📁 TempFileManager: 创建临时文件 {} ({} KB)",
            temp_path.display(),
            data.len() / 1024
        );

        // 添加到缓存
        cache.insert(key, TempFileEntry {
            path: temp_path.clone(),
            created_at: Instant::now(),
            last_accessed: Instant::now(),
            ref_count: 1,
        });

        Ok(temp_path)
    }

    /// 检查是否已缓存
    pub fn is_cached(&self, book_path: &str, inner_path: &str) -> bool {
        let key = Self::cache_key(book_path, inner_path);
        let temp_path = self.temp_file_path(book_path, inner_path);

        if let Ok(cache) = self.cache.lock() {
            if cache.contains_key(&key) && temp_path.exists() {
                return true;
            }
        }
        false
    }

    /// 获取已缓存的临时文件路径
    pub fn get_cached(&self, book_path: &str, inner_path: &str) -> Option<PathBuf> {
        let key = Self::cache_key(book_path, inner_path);
        let temp_path = self.temp_file_path(book_path, inner_path);

        if let Ok(mut cache) = self.cache.lock() {
            if let Some(entry) = cache.get_mut(&key) {
                if temp_path.exists() {
                    entry.last_accessed = Instant::now();
                    return Some(entry.path.clone());
                }
            }
        }
        None
    }

    /// 清理过期文件
    fn cleanup_expired(&self, cache: &mut HashMap<String, TempFileEntry>) {
        let now = Instant::now();
        let expired_keys: Vec<_> = cache
            .iter()
            .filter(|(_, entry)| {
                now.duration_since(entry.last_accessed) > TEMP_FILE_TTL && entry.ref_count == 0
            })
            .map(|(k, _)| k.clone())
            .collect();

        for key in expired_keys {
            if let Some(entry) = cache.remove(&key) {
                let _ = std::fs::remove_file(&entry.path);
                log::debug!("🗑️ TempFileManager: 清理过期文件 {}", entry.path.display());
            }
        }
    }

    /// 清理指定书籍的所有临时文件
    pub fn cleanup_book(&self, book_path: &str) {
        let prefix = format!("{}:", book_path);
        
        if let Ok(mut cache) = self.cache.lock() {
            let keys_to_remove: Vec<_> = cache
                .keys()
                .filter(|k| k.starts_with(&prefix))
                .cloned()
                .collect();

            for key in keys_to_remove {
                if let Some(entry) = cache.remove(&key) {
                    let _ = std::fs::remove_file(&entry.path);
                }
            }
        }
    }

    /// 清理所有临时文件
    pub fn cleanup_all(&self) {
        if let Ok(mut cache) = self.cache.lock() {
            for (_, entry) in cache.drain() {
                let _ = std::fs::remove_file(&entry.path);
            }
        }

        // 清理目录中可能遗留的文件
        if let Ok(entries) = std::fs::read_dir(&self.temp_dir) {
            for entry in entries.flatten() {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }

    /// 获取统计信息
    pub fn stats(&self) -> TempFileStats {
        let (file_count, total_size) = if let Ok(cache) = self.cache.lock() {
            let count = cache.len();
            let size: u64 = cache
                .values()
                .filter_map(|e| std::fs::metadata(&e.path).ok())
                .map(|m| m.len())
                .sum();
            (count, size)
        } else {
            (0, 0)
        };

        TempFileStats {
            file_count,
            total_size,
            temp_dir: self.temp_dir.to_string_lossy().to_string(),
        }
    }
}

impl Drop for TempFileManager {
    fn drop(&mut self) {
        // 清理所有临时文件
        self.cleanup_all();
    }
}

/// 临时文件统计
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TempFileStats {
    pub file_count: usize,
    pub total_size: u64,
    pub temp_dir: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_key() {
        let key = TempFileManager::cache_key("test.zip", "image.jpg");
        assert_eq!(key, "test.zip:image.jpg");
    }

    #[test]
    fn test_needs_temp_file() {
        use super::super::book_context::PageContentType;
        use std::path::PathBuf;
        
        let manager = TempFileManager::new(PathBuf::from("/tmp/test"));
        
        // 视频始终需要临时文件
        assert!(manager.needs_temp_file(&PageContentType::Video, 0));
        // 大文件需要临时文件（1GB > 800MB）
        assert!(manager.needs_temp_file(&PageContentType::Image, 1024 * 1024 * 1024));
        // 小文件不需要
        assert!(!manager.needs_temp_file(&PageContentType::Image, 1024));
    }
}
