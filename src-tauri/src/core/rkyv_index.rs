//! Rkyv 零拷贝索引模块
//! 使用 rkyv 实现零拷贝反序列化，大幅提升索引加载速度

use rkyv::{rancor::Error as RkyvError, Archive, Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Instant;

/// 索引文件魔数
const MAGIC: &[u8; 4] = b"RKIV";
/// 索引文件版本
const VERSION: u32 = 1;

/// 可归档的索引条目
#[derive(Archive, Deserialize, Serialize, Debug, Clone)]
#[rkyv(compare(PartialEq), derive(Debug))]
pub struct RkyvIndexEntry {
    /// 文件路径（压缩包内）
    pub path: String,
    /// 文件名
    pub name: String,
    /// 文件大小
    pub size: u64,
    /// 在压缩包中的偏移量
    pub offset: u64,
    /// 压缩后大小
    pub compressed_size: u64,
    /// 是否为图片
    pub is_image: bool,
    /// 是否为视频
    pub is_video: bool,
    /// 条目索引
    pub entry_index: u32,
    /// 修改时间（Unix 时间戳）
    pub modified: Option<i64>,
}

/// 可归档的压缩包索引
#[derive(Archive, Deserialize, Serialize, Debug, Clone)]
#[rkyv(compare(PartialEq), derive(Debug))]
pub struct RkyvArchiveIndex {
    /// 压缩包路径
    pub archive_path: String,
    /// 文件修改时间（Unix 时间戳）
    pub mtime: i64,
    /// 文件大小
    pub file_size: u64,
    /// 条目列表
    pub entries: Vec<RkyvIndexEntry>,
    /// 图片条目数量（缓存）
    pub image_count: u32,
}

impl RkyvArchiveIndex {
    /// 创建新索引
    pub fn new(archive_path: String, mtime: i64, file_size: u64) -> Self {
        Self {
            archive_path,
            mtime,
            file_size,
            entries: Vec::new(),
            image_count: 0,
        }
    }

    /// 添加条目
    pub fn add_entry(&mut self, entry: RkyvIndexEntry) {
        if entry.is_image || entry.is_video {
            self.image_count += 1; // 这里 image_count 实际上代表 viewable_count，保持字段名兼容
        }
        self.entries.push(entry);
    }

    /// 序列化到字节（用于持久化）
    pub fn to_bytes(&self) -> Result<Vec<u8>, String> {
        rkyv::to_bytes::<RkyvError>(self)
            .map(|v| v.to_vec())
            .map_err(|e| format!("序列化失败: {e}"))
    }

    /// 从字节反序列化（完整反序列化，用于修改）
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, String> {
        rkyv::from_bytes::<Self, RkyvError>(bytes).map_err(|e| format!("反序列化失败: {e}"))
    }

    /// 零拷贝访问归档数据（只读，无需反序列化）
    /// 返回对归档数据的引用，可以直接访问字段
    pub fn archived_ref(bytes: &[u8]) -> Result<&ArchivedRkyvArchiveIndex, String> {
        rkyv::access::<ArchivedRkyvArchiveIndex, RkyvError>(bytes)
            .map_err(|e| format!("访问归档数据失败: {e}"))
    }

    /// 获取图片条目（过滤后）
    pub fn image_entries(&self) -> Vec<&RkyvIndexEntry> {
        self.entries.iter().filter(|e| e.is_image).collect()
    }

    /// 获取可查看条目（图片和视频）
    pub fn viewable_entries(&self) -> Vec<&RkyvIndexEntry> {
        self.entries
            .iter()
            .filter(|e| e.is_image || e.is_video)
            .collect()
    }

    /// 按名称查找条目
    pub fn find_by_name(&self, name: &str) -> Option<&RkyvIndexEntry> {
        self.entries.iter().find(|e| e.name == name)
    }

    /// 按路径查找条目
    pub fn find_by_path(&self, path: &str) -> Option<&RkyvIndexEntry> {
        let normalized = path.replace('\\', "/");
        self.entries
            .iter()
            .find(|e| e.path == path || e.path.replace('\\', "/") == normalized)
    }
}

/// 索引文件管理器
pub struct RkyvIndexManager {
    /// 缓存目录
    cache_dir: PathBuf,
}

impl RkyvIndexManager {
    /// 创建索引管理器
    pub fn new(cache_dir: PathBuf) -> Self {
        // 确保缓存目录存在
        if !cache_dir.exists() {
            let _ = fs::create_dir_all(&cache_dir);
        }
        Self { cache_dir }
    }

    /// 获取索引文件路径
    fn get_index_path(&self, archive_path: &Path) -> PathBuf {
        // 使用压缩包路径的哈希作为索引文件名
        use std::hash::{Hash, Hasher};
        let mut hasher = ahash::AHasher::default();
        archive_path.hash(&mut hasher);
        let hash = hasher.finish();
        self.cache_dir.join(format!("{:016x}.rkiv", hash))
    }

    /// 保存索引到文件
    pub fn save(&self, archive_path: &Path, index: &RkyvArchiveIndex) -> Result<(), String> {
        let index_path = self.get_index_path(archive_path);
        let start = Instant::now();

        // 序列化索引
        let data = index.to_bytes()?;

        // 构建文件内容：Magic + Version + Data
        let mut file_data = Vec::with_capacity(8 + data.len());
        file_data.extend_from_slice(MAGIC);
        file_data.extend_from_slice(&VERSION.to_le_bytes());
        file_data.extend_from_slice(&data);

        // 写入文件
        let mut file = File::create(&index_path).map_err(|e| format!("创建索引文件失败: {e}"))?;
        file.write_all(&file_data)
            .map_err(|e| format!("写入索引文件失败: {e}"))?;

        log::debug!(
            "💾 保存 Rkyv 索引: {} ({} 条目, {} 字节, {:?})",
            archive_path.display(),
            index.entries.len(),
            file_data.len(),
            start.elapsed()
        );

        Ok(())
    }

    /// 加载索引（零拷贝方式）
    /// 返回原始字节，调用者可以使用 RkyvArchiveIndex::archived_ref 零拷贝访问
    pub fn load_raw(&self, archive_path: &Path) -> Result<Vec<u8>, String> {
        let index_path = self.get_index_path(archive_path);
        let start = Instant::now();

        if !index_path.exists() {
            return Err("索引文件不存在".to_string());
        }

        // 读取文件
        let mut file = File::open(&index_path).map_err(|e| format!("打开索引文件失败: {e}"))?;
        let mut file_data = Vec::new();
        file.read_to_end(&mut file_data)
            .map_err(|e| format!("读取索引文件失败: {e}"))?;

        // 验证魔数和版本
        if file_data.len() < 8 {
            return Err("索引文件太小".to_string());
        }
        if &file_data[0..4] != MAGIC {
            return Err("索引文件魔数错误".to_string());
        }
        let version = u32::from_le_bytes([file_data[4], file_data[5], file_data[6], file_data[7]]);
        if version != VERSION {
            return Err(format!("索引文件版本不匹配: {} != {}", version, VERSION));
        }

        log::debug!(
            "📖 加载 Rkyv 索引: {} ({} 字节, {:?})",
            archive_path.display(),
            file_data.len(),
            start.elapsed()
        );

        // 返回数据部分（跳过 Magic + Version）
        Ok(file_data[8..].to_vec())
    }

    /// 加载索引（完整反序列化）
    pub fn load(&self, archive_path: &Path) -> Result<RkyvArchiveIndex, String> {
        let data = self.load_raw(archive_path)?;
        RkyvArchiveIndex::from_bytes(&data)
    }

    /// 检查索引是否有效（文件存在且未过期）
    pub fn is_valid(&self, archive_path: &Path, mtime: i64, file_size: u64) -> bool {
        let index_path = self.get_index_path(archive_path);
        if !index_path.exists() {
            return false;
        }

        // 尝试加载并验证
        match self.load_raw(archive_path) {
            Ok(data) => {
                match RkyvArchiveIndex::archived_ref(&data) {
                    Ok(archived) => {
                        // 验证修改时间和文件大小
                        archived.mtime == mtime && archived.file_size == file_size
                    }
                    Err(_) => false,
                }
            }
            Err(_) => false,
        }
    }

    /// 删除索引文件
    pub fn remove(&self, archive_path: &Path) -> Result<(), String> {
        let index_path = self.get_index_path(archive_path);
        if index_path.exists() {
            fs::remove_file(&index_path).map_err(|e| format!("删除索引文件失败: {e}"))?;
        }
        Ok(())
    }

    /// 清理所有索引文件
    pub fn clear_all(&self) -> Result<usize, String> {
        let mut count = 0;
        if let Ok(entries) = fs::read_dir(&self.cache_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "rkiv").unwrap_or(false) {
                    if fs::remove_file(&path).is_ok() {
                        count += 1;
                    }
                }
            }
        }
        Ok(count)
    }

    /// 获取缓存统计
    pub fn stats(&self) -> RkyvIndexStats {
        let mut file_count = 0;
        let mut total_size = 0u64;

        if let Ok(entries) = fs::read_dir(&self.cache_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "rkiv").unwrap_or(false) {
                    file_count += 1;
                    if let Ok(meta) = fs::metadata(&path) {
                        total_size += meta.len();
                    }
                }
            }
        }

        RkyvIndexStats {
            file_count,
            total_size,
            cache_dir: self.cache_dir.clone(),
        }
    }
}

/// 索引统计信息
#[derive(Debug, Clone, serde::Serialize)]
pub struct RkyvIndexStats {
    /// 索引文件数量
    pub file_count: usize,
    /// 总大小（字节）
    pub total_size: u64,
    /// 缓存目录
    pub cache_dir: PathBuf,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_rkyv_index_serialization() {
        let mut index =
            RkyvArchiveIndex::new("/test/archive.zip".to_string(), 1234567890, 1024 * 1024);

        index.add_entry(RkyvIndexEntry {
            path: "images/001.jpg".to_string(),
            name: "001.jpg".to_string(),
            size: 50000,
            offset: 0,
            compressed_size: 45000,
            is_image: true,
            is_video: false,
            entry_index: 0,
            modified: Some(1234567890),
        });

        index.add_entry(RkyvIndexEntry {
            path: "images/002.png".to_string(),
            name: "002.png".to_string(),
            size: 80000,
            offset: 45000,
            compressed_size: 75000,
            is_image: true,
            is_video: false,
            entry_index: 1,
            modified: None,
        });

        // 序列化
        let bytes = index.to_bytes().unwrap();
        assert!(!bytes.is_empty());

        // 反序列化
        let restored = RkyvArchiveIndex::from_bytes(&bytes).unwrap();
        assert_eq!(restored.archive_path, index.archive_path);
        assert_eq!(restored.entries.len(), 2);
        assert_eq!(restored.image_count, 2);
    }

    #[test]
    fn test_rkyv_zero_copy_access() {
        let mut index =
            RkyvArchiveIndex::new("/test/archive.zip".to_string(), 1234567890, 1024 * 1024);

        index.add_entry(RkyvIndexEntry {
            path: "test.jpg".to_string(),
            name: "test.jpg".to_string(),
            size: 1000,
            offset: 0,
            compressed_size: 900,
            is_image: true,
            is_video: false,
            entry_index: 0,
            modified: Some(1234567890),
        });

        let bytes = index.to_bytes().unwrap();

        // 零拷贝访问
        let archived = RkyvArchiveIndex::archived_ref(&bytes).unwrap();
        assert_eq!(archived.archive_path.as_str(), "/test/archive.zip");
        assert_eq!(archived.entries.len(), 1);
        assert_eq!(archived.entries[0].name.as_str(), "test.jpg");
        assert_eq!(archived.image_count, 1);
    }

    #[test]
    fn test_rkyv_index_manager() {
        let temp_dir = TempDir::new().unwrap();
        let manager = RkyvIndexManager::new(temp_dir.path().to_path_buf());

        let archive_path = PathBuf::from("/test/archive.zip");
        let mut index = RkyvArchiveIndex::new(
            archive_path.to_string_lossy().to_string(),
            1234567890,
            1024 * 1024,
        );

        index.add_entry(RkyvIndexEntry {
            path: "test.jpg".to_string(),
            name: "test.jpg".to_string(),
            size: 1000,
            offset: 0,
            compressed_size: 900,
            is_image: true,
            is_video: false,
            entry_index: 0,
            modified: None,
        });

        // 保存
        manager.save(&archive_path, &index).unwrap();

        // 验证有效性
        assert!(manager.is_valid(&archive_path, 1234567890, 1024 * 1024));
        assert!(!manager.is_valid(&archive_path, 9999999999, 1024 * 1024)); // 不同 mtime

        // 加载
        let loaded = manager.load(&archive_path).unwrap();
        assert_eq!(loaded.entries.len(), 1);

        // 统计
        let stats = manager.stats();
        assert_eq!(stats.file_count, 1);
        assert!(stats.total_size > 0);

        // 删除
        manager.remove(&archive_path).unwrap();
        assert!(!manager.is_valid(&archive_path, 1234567890, 1024 * 1024));
    }

    #[test]
    fn test_find_entry() {
        let mut index =
            RkyvArchiveIndex::new("/test/archive.zip".to_string(), 1234567890, 1024 * 1024);

        index.add_entry(RkyvIndexEntry {
            path: "folder/image.jpg".to_string(),
            name: "image.jpg".to_string(),
            size: 1000,
            offset: 0,
            compressed_size: 900,
            is_image: true,
            is_video: false,
            entry_index: 0,
            modified: None,
        });

        // 按名称查找
        let entry = index.find_by_name("image.jpg");
        assert!(entry.is_some());
        assert_eq!(entry.unwrap().path, "folder/image.jpg");

        // 按路径查找
        let entry = index.find_by_path("folder/image.jpg");
        assert!(entry.is_some());

        // 按路径查找（反斜杠）
        let entry = index.find_by_path("folder\\image.jpg");
        assert!(entry.is_some());
    }
}
