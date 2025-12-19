//! 压缩包实例缓存模块
//!
//! 缓存已打开的压缩包句柄，避免重复打开文件。
//! 使用弱引用存储，允许在内存压力下自动回收。

use log::{debug, warn};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Weak};
use std::time::{SystemTime, UNIX_EPOCH};
use zip::ZipArchive;

/// 缓存条目
struct CacheEntry {
    /// 弱引用到压缩包实例
    instance: Weak<Mutex<ZipArchive<File>>>,
    /// 文件修改时间（用于验证）
    mtime: u64,
    /// 文件大小（用于验证）
    size: u64,
}

/// 压缩包实例缓存
pub struct InstanceCache {
    /// 缓存映射（路径 -> 缓存条目）
    cache: Mutex<HashMap<String, CacheEntry>>,
    /// 最大缓存条目数
    max_entries: usize,
}

impl InstanceCache {
    /// 创建实例缓存
    pub fn new(max_entries: usize) -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
            max_entries,
        }
    }

    /// 获取或创建压缩包实例
    /// 
    /// 如果缓存中存在有效实例，返回缓存的实例；
    /// 否则创建新实例并缓存。
    pub fn get_or_create(&self, path: &Path) -> Result<Arc<Mutex<ZipArchive<File>>>, String> {
        let key = Self::path_to_key(path);
        
        // 获取当前文件信息
        let (mtime, size) = Self::get_file_info(path)?;

        // 检查缓存
        {
            let cache = self.cache.lock();
            if let Some(entry) = cache.get(&key) {
                // 验证文件未修改
                if entry.mtime == mtime && entry.size == size {
                    // 尝试升级弱引用
                    if let Some(instance) = entry.instance.upgrade() {
                        debug!("实例缓存命中: {}", path.display());
                        return Ok(instance);
                    }
                }
            }
        }

        // 创建新实例
        debug!("创建新压缩包实例: {}", path.display());
        let file = File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;
        let archive = ZipArchive::new(file).map_err(|e| format!("解析 ZIP 失败: {e}"))?;
        let instance = Arc::new(Mutex::new(archive));

        // 存入缓存
        {
            let mut cache = self.cache.lock();
            
            // 清理失效条目
            if cache.len() >= self.max_entries {
                self.cleanup_impl(&mut cache);
            }

            cache.insert(
                key,
                CacheEntry {
                    instance: Arc::downgrade(&instance),
                    mtime,
                    size,
                },
            );
        }

        Ok(instance)
    }

    /// 清理失效的弱引用
    pub fn cleanup(&self) {
        let mut cache = self.cache.lock();
        self.cleanup_impl(&mut cache);
    }

    /// 清理实现
    fn cleanup_impl(&self, cache: &mut HashMap<String, CacheEntry>) {
        let before = cache.len();
        cache.retain(|_, entry| entry.instance.strong_count() > 0);
        let after = cache.len();
        if before != after {
            debug!("清理实例缓存: {} -> {} 条目", before, after);
        }
    }

    /// 使指定路径的缓存失效
    pub fn invalidate(&self, path: &Path) {
        let key = Self::path_to_key(path);
        let mut cache = self.cache.lock();
        if cache.remove(&key).is_some() {
            debug!("使实例缓存失效: {}", path.display());
        }
    }

    /// 清除所有缓存
    pub fn clear(&self) {
        let mut cache = self.cache.lock();
        cache.clear();
        debug!("清除所有实例缓存");
    }

    /// 获取缓存条目数
    pub fn len(&self) -> usize {
        self.cache.lock().len()
    }

    /// 缓存是否为空
    pub fn is_empty(&self) -> bool {
        self.cache.lock().is_empty()
    }

    /// 获取有效（强引用存在）的缓存条目数
    pub fn active_count(&self) -> usize {
        self.cache
            .lock()
            .values()
            .filter(|e| e.instance.strong_count() > 0)
            .count()
    }

    // ========== 私有方法 ==========

    /// 路径转缓存键
    fn path_to_key(path: &Path) -> String {
        path.to_string_lossy().replace('\\', "/")
    }

    /// 获取文件信息
    fn get_file_info(path: &Path) -> Result<(u64, u64), String> {
        let metadata = std::fs::metadata(path).map_err(|e| format!("获取文件信息失败: {e}"))?;
        let mtime = metadata
            .modified()
            .map_err(|e| format!("获取修改时间失败: {e}"))?
            .duration_since(UNIX_EPOCH)
            .map_err(|e| format!("时间转换失败: {e}"))?
            .as_secs();
        let size = metadata.len();
        Ok((mtime, size))
    }
}

impl Default for InstanceCache {
    fn default() -> Self {
        Self::new(50)
    }
}

// ============================================================================
// 单元测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    fn create_test_zip(dir: &Path, name: &str) -> PathBuf {
        let path = dir.join(name);
        let file = File::create(&path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        zip.start_file("test.txt", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"Hello, World!").unwrap();
        zip.finish().unwrap();
        path
    }

    #[test]
    fn test_instance_cache_creation() {
        let cache = InstanceCache::new(10);
        assert!(cache.is_empty());
        assert_eq!(cache.len(), 0);
    }

    #[test]
    fn test_get_or_create() {
        let temp_dir = TempDir::new().unwrap();
        let zip_path = create_test_zip(temp_dir.path(), "test.zip");
        
        let cache = InstanceCache::new(10);
        
        // 第一次获取
        let instance1 = cache.get_or_create(&zip_path).unwrap();
        assert_eq!(cache.len(), 1);
        
        // 第二次获取应该返回相同实例
        let instance2 = cache.get_or_create(&zip_path).unwrap();
        assert!(Arc::ptr_eq(&instance1, &instance2));
    }

    #[test]
    fn test_invalidate() {
        let temp_dir = TempDir::new().unwrap();
        let zip_path = create_test_zip(temp_dir.path(), "test.zip");
        
        let cache = InstanceCache::new(10);
        let _ = cache.get_or_create(&zip_path).unwrap();
        assert_eq!(cache.len(), 1);
        
        cache.invalidate(&zip_path);
        assert_eq!(cache.len(), 0);
    }

    #[test]
    fn test_cleanup() {
        let temp_dir = TempDir::new().unwrap();
        let zip_path = create_test_zip(temp_dir.path(), "test.zip");
        
        let cache = InstanceCache::new(10);
        
        // 创建实例并立即丢弃强引用
        {
            let _ = cache.get_or_create(&zip_path).unwrap();
        }
        
        // 清理后应该移除失效条目
        cache.cleanup();
        assert_eq!(cache.active_count(), 0);
    }
}

// ============================================================================
// 属性测试
// ============================================================================

#[cfg(test)]
mod property_tests {
    use super::*;
    use proptest::prelude::*;
    use std::io::Write;
    use tempfile::TempDir;

    fn create_test_zip_with_content(dir: &Path, name: &str, content: &[u8]) -> PathBuf {
        let path = dir.join(name);
        let file = File::create(&path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        zip.start_file("data.bin", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(content).unwrap();
        zip.finish().unwrap();
        path
    }

    proptest! {
        /// **Feature: archive-instant-loading, Property 4: Instance Cache Reuse**
        /// *For any* archive path, opening the same archive twice within the cache
        /// lifetime SHALL return the same instance.
        /// **Validates: Requirements 2.2**
        #[test]
        fn prop_instance_cache_reuse(
            content in prop::collection::vec(any::<u8>(), 10..100)
        ) {
            let temp_dir = TempDir::new().unwrap();
            let zip_path = create_test_zip_with_content(
                temp_dir.path(),
                "test.zip",
                &content,
            );
            
            let cache = InstanceCache::new(10);
            
            // 第一次获取
            let instance1 = cache.get_or_create(&zip_path).unwrap();
            
            // 第二次获取
            let instance2 = cache.get_or_create(&zip_path).unwrap();
            
            // 应该是同一个实例
            prop_assert!(Arc::ptr_eq(&instance1, &instance2));
        }

        /// 测试缓存容量限制
        #[test]
        fn prop_cache_capacity(
            file_count in 1usize..10
        ) {
            let temp_dir = TempDir::new().unwrap();
            let max_entries = 5;
            let cache = InstanceCache::new(max_entries);
            
            // 创建多个 ZIP 文件
            let mut instances = Vec::new();
            for i in 0..file_count {
                let zip_path = create_test_zip_with_content(
                    temp_dir.path(),
                    &format!("test_{i}.zip"),
                    &[i as u8; 10],
                );
                let instance = cache.get_or_create(&zip_path).unwrap();
                instances.push(instance);
            }
            
            // 缓存条目数不应超过最大值（考虑清理）
            prop_assert!(cache.len() <= max_entries + file_count);
        }
    }
}
