//! 内存映射压缩包模块
//! 使用 memmap2 实现零拷贝文件访问，大幅提升大文件读取性能

use ahash::AHashMap;
use memmap2::Mmap;
use parking_lot::RwLock;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// 内存映射阈值：超过此大小的文件使用内存映射
const MMAP_THRESHOLD: u64 = 1024 * 1024; // 1MB

/// 缓存过期时间
const CACHE_TTL: Duration = Duration::from_secs(300); // 5分钟

/// 最大缓存条目数
const MAX_CACHE_ENTRIES: usize = 32;

/// 内存映射的压缩包
#[derive(Clone)]
pub struct MmapArchive {
    /// 内存映射（共享引用）
    mmap: Arc<Mmap>,
    /// 文件路径
    path: PathBuf,
    /// 文件大小
    size: u64,
    /// 创建时间（用于缓存过期）
    created_at: Instant,
}

impl MmapArchive {
    /// 打开压缩包（使用内存映射）
    pub fn open(path: &Path) -> Result<Self, String> {
        let file = File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;
        let metadata = file.metadata().map_err(|e| format!("获取文件信息失败: {e}"))?;
        let size = metadata.len();

        // 创建内存映射
        let mmap = unsafe { Mmap::map(&file) }.map_err(|e| format!("创建内存映射失败: {e}"))?;

        Ok(Self {
            mmap: Arc::new(mmap),
            path: path.to_path_buf(),
            size,
            created_at: Instant::now(),
        })
    }

    /// 获取内存映射切片
    #[inline]
    pub fn as_slice(&self) -> &[u8] {
        &self.mmap
    }

    /// 获取文件大小
    #[inline]
    pub fn size(&self) -> u64 {
        self.size
    }

    /// 获取文件路径
    #[inline]
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// 检查是否过期
    #[inline]
    pub fn is_expired(&self) -> bool {
        self.created_at.elapsed() > CACHE_TTL
    }

    /// 获取共享引用（用于并发访问）
    pub fn shared(&self) -> Arc<Mmap> {
        Arc::clone(&self.mmap)
    }
}

/// 内存映射缓存管理器
pub struct MmapCache {
    /// 缓存映射：路径 -> 内存映射
    cache: RwLock<AHashMap<PathBuf, MmapArchive>>,
    /// 最大缓存条目数
    max_entries: usize,
}

impl MmapCache {
    /// 创建新的缓存管理器
    pub fn new(max_entries: usize) -> Self {
        Self {
            cache: RwLock::new(AHashMap::with_capacity(max_entries)),
            max_entries,
        }
    }

    /// 获取或创建内存映射
    pub fn get_or_create(&self, path: &Path) -> Result<MmapArchive, String> {
        // 先尝试读取缓存
        {
            let cache = self.cache.read();
            if let Some(mmap) = cache.get(path) {
                if !mmap.is_expired() {
                    return Ok(mmap.clone());
                }
            }
        }

        // 缓存未命中或已过期，创建新的内存映射
        let mmap = MmapArchive::open(path)?;

        // 写入缓存
        {
            let mut cache = self.cache.write();

            // 如果缓存已满，清理过期条目
            if cache.len() >= self.max_entries {
                self.cleanup_expired(&mut cache);
            }

            // 如果仍然满，移除最旧的条目
            if cache.len() >= self.max_entries {
                self.evict_oldest(&mut cache);
            }

            cache.insert(path.to_path_buf(), mmap.clone());
        }

        Ok(mmap)
    }

    /// 清理过期条目
    fn cleanup_expired(&self, cache: &mut AHashMap<PathBuf, MmapArchive>) {
        cache.retain(|_, v| !v.is_expired());
    }

    /// 移除最旧的条目
    fn evict_oldest(&self, cache: &mut AHashMap<PathBuf, MmapArchive>) {
        if let Some((oldest_key, _)) = cache
            .iter()
            .min_by_key(|(_, v)| v.created_at)
            .map(|(k, v)| (k.clone(), v.clone()))
        {
            cache.remove(&oldest_key);
        }
    }

    /// 使指定路径的缓存失效
    pub fn invalidate(&self, path: &Path) {
        let mut cache = self.cache.write();
        cache.remove(path);
    }

    /// 清空所有缓存
    pub fn clear(&self) {
        let mut cache = self.cache.write();
        cache.clear();
    }

    /// 获取缓存统计
    pub fn stats(&self) -> MmapCacheStats {
        let cache = self.cache.read();
        let total_size: u64 = cache.values().map(|m| m.size).sum();
        MmapCacheStats {
            entry_count: cache.len(),
            total_size,
            max_entries: self.max_entries,
        }
    }
}

impl Default for MmapCache {
    fn default() -> Self {
        Self::new(MAX_CACHE_ENTRIES)
    }
}

/// 缓存统计信息
#[derive(Debug, Clone, serde::Serialize)]
pub struct MmapCacheStats {
    /// 缓存条目数
    pub entry_count: usize,
    /// 总大小（字节）
    pub total_size: u64,
    /// 最大条目数
    pub max_entries: usize,
}

/// 智能文件读取器：根据文件大小自动选择读取方式
pub struct SmartFileReader;

impl SmartFileReader {
    /// 读取文件内容（自动选择最优方式）
    pub fn read(path: &Path) -> Result<Vec<u8>, String> {
        let file = File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;
        let metadata = file.metadata().map_err(|e| format!("获取文件信息失败: {e}"))?;
        let size = metadata.len();

        if size >= MMAP_THRESHOLD {
            // 大文件使用内存映射
            Self::read_with_mmap(path)
        } else {
            // 小文件直接读取
            Self::read_direct(file, size as usize)
        }
    }

    /// 使用内存映射读取
    fn read_with_mmap(path: &Path) -> Result<Vec<u8>, String> {
        let mmap = MmapArchive::open(path)?;
        Ok(mmap.as_slice().to_vec())
    }

    /// 直接读取
    fn read_direct(mut file: File, size: usize) -> Result<Vec<u8>, String> {
        let mut buffer = Vec::with_capacity(size);
        file.read_to_end(&mut buffer)
            .map_err(|e| format!("读取文件失败: {e}"))?;
        Ok(buffer)
    }

    /// 读取文件的指定范围
    pub fn read_range(path: &Path, offset: u64, length: usize) -> Result<Vec<u8>, String> {
        let file = File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;
        let metadata = file.metadata().map_err(|e| format!("获取文件信息失败: {e}"))?;
        let size = metadata.len();

        if size >= MMAP_THRESHOLD {
            // 大文件使用内存映射
            let mmap = MmapArchive::open(path)?;
            let data = mmap.as_slice();
            let end = (offset as usize + length).min(data.len());
            Ok(data[offset as usize..end].to_vec())
        } else {
            // 小文件使用 seek + read
            Self::read_range_direct(file, offset, length)
        }
    }

    /// 直接读取范围
    fn read_range_direct(mut file: File, offset: u64, length: usize) -> Result<Vec<u8>, String> {
        file.seek(SeekFrom::Start(offset))
            .map_err(|e| format!("定位文件失败: {e}"))?;
        let mut buffer = vec![0u8; length];
        let bytes_read = file
            .read(&mut buffer)
            .map_err(|e| format!("读取文件失败: {e}"))?;
        buffer.truncate(bytes_read);
        Ok(buffer)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_mmap_archive_open() {
        // 创建临时文件
        let mut temp = NamedTempFile::new().unwrap();
        temp.write_all(b"test content").unwrap();
        temp.flush().unwrap();

        // 打开内存映射
        let mmap = MmapArchive::open(temp.path()).unwrap();
        assert_eq!(mmap.as_slice(), b"test content");
        assert_eq!(mmap.size(), 12);
    }

    #[test]
    fn test_mmap_cache() {
        let cache = MmapCache::new(2);

        // 创建临时文件
        let mut temp1 = NamedTempFile::new().unwrap();
        temp1.write_all(b"file1").unwrap();
        temp1.flush().unwrap();

        let mut temp2 = NamedTempFile::new().unwrap();
        temp2.write_all(b"file2").unwrap();
        temp2.flush().unwrap();

        // 获取或创建
        let mmap1 = cache.get_or_create(temp1.path()).unwrap();
        assert_eq!(mmap1.as_slice(), b"file1");

        let mmap2 = cache.get_or_create(temp2.path()).unwrap();
        assert_eq!(mmap2.as_slice(), b"file2");

        // 验证缓存命中
        let mmap1_cached = cache.get_or_create(temp1.path()).unwrap();
        assert_eq!(mmap1_cached.as_slice(), b"file1");

        // 验证统计
        let stats = cache.stats();
        assert_eq!(stats.entry_count, 2);
    }

    #[test]
    fn test_smart_file_reader() {
        // 创建临时文件
        let mut temp = NamedTempFile::new().unwrap();
        temp.write_all(b"smart reader test").unwrap();
        temp.flush().unwrap();

        // 读取全部
        let data = SmartFileReader::read(temp.path()).unwrap();
        assert_eq!(data, b"smart reader test");

        // 读取范围
        let range = SmartFileReader::read_range(temp.path(), 6, 6).unwrap();
        assert_eq!(range, b"reader");
    }
}
