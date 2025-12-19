//! 压缩包预热系统模块
//!
//! 后台预加载相邻压缩包的索引，实现秒开体验。

use log::{debug, info, warn};
use natural_sort_rs::natural_cmp;
use parking_lot::Mutex;
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;

use super::archive_index_cache::IndexCache;

/// 预热请求
#[derive(Debug, Clone)]
pub struct PreheatRequest {
    /// 要预热的压缩包路径
    pub path: PathBuf,
}

/// 预热系统
pub struct PreheatSystem {
    /// 预热队列
    queue: Mutex<VecDeque<PathBuf>>,
    /// 最大队列大小
    max_queue_size: usize,
    /// 是否正在运行
    running: AtomicBool,
    /// 取消信号发送器
    cancel_tx: Mutex<Option<mpsc::Sender<()>>>,
}

impl PreheatSystem {
    /// 创建预热系统
    pub fn new(max_queue_size: usize) -> Self {
        Self {
            queue: Mutex::new(VecDeque::new()),
            max_queue_size,
            running: AtomicBool::new(false),
            cancel_tx: Mutex::new(None),
        }
    }

    /// 触发预热
    /// 
    /// 识别当前压缩包的相邻压缩包，并将它们加入预热队列。
    pub fn trigger(&self, current_archive: &Path) {
        let (prev, next) = self.get_adjacent_archives(current_archive);
        
        let mut queue = self.queue.lock();
        
        // 添加相邻压缩包到队列
        if let Some(prev_path) = prev {
            if !queue.contains(&prev_path) {
                debug!("添加预热: {}", prev_path.display());
                queue.push_back(prev_path);
            }
        }
        
        if let Some(next_path) = next {
            if !queue.contains(&next_path) {
                debug!("添加预热: {}", next_path.display());
                queue.push_back(next_path);
            }
        }
        
        // 限制队列大小
        while queue.len() > self.max_queue_size {
            if let Some(removed) = queue.pop_front() {
                debug!("预热队列溢出，移除: {}", removed.display());
            }
        }
    }

    /// 获取相邻压缩包
    /// 
    /// 返回 (前一个, 后一个) 压缩包路径。
    pub fn get_adjacent_archives(&self, path: &Path) -> (Option<PathBuf>, Option<PathBuf>) {
        let parent = match path.parent() {
            Some(p) => p,
            None => return (None, None),
        };

        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => return (None, None),
        };

        // 获取同目录下的所有压缩包
        let mut archives: Vec<PathBuf> = match std::fs::read_dir(parent) {
            Ok(entries) => entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| Self::is_archive(p))
                .collect(),
            Err(_) => return (None, None),
        };

        // 自然排序
        archives.sort_by(|a, b| {
            let a_name = a.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            let b_name = b.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            natural_cmp::<str, _>(&a_name, &b_name)
        });

        // 找到当前文件的位置
        let current_idx = archives.iter().position(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n == file_name)
                .unwrap_or(false)
        });

        match current_idx {
            Some(idx) => {
                let prev = if idx > 0 {
                    Some(archives[idx - 1].clone())
                } else {
                    None
                };
                let next = if idx + 1 < archives.len() {
                    Some(archives[idx + 1].clone())
                } else {
                    None
                };
                (prev, next)
            }
            None => (None, None),
        }
    }

    /// 获取队列中的下一个预热任务
    pub fn pop_next(&self) -> Option<PathBuf> {
        self.queue.lock().pop_front()
    }

    /// 获取当前队列大小
    pub fn queue_size(&self) -> usize {
        self.queue.lock().len()
    }

    /// 清空预热队列
    pub fn clear(&self) {
        self.queue.lock().clear();
    }

    /// 取消所有预热任务
    pub fn cancel(&self) {
        self.clear();
        if let Some(tx) = self.cancel_tx.lock().take() {
            let _ = tx.try_send(());
        }
    }

    /// 执行预热任务（同步版本）
    /// 
    /// 从队列中取出任务并预热索引。
    pub fn execute_preheat(&self, index_cache: &IndexCache) {
        while let Some(path) = self.pop_next() {
            if !path.exists() {
                continue;
            }

            // 检查是否已缓存
            if index_cache.get(&path).is_some() {
                debug!("预热跳过（已缓存）: {}", path.display());
                continue;
            }

            // 构建索引
            debug!("预热开始: {}", path.display());
            if let Err(e) = self.build_index_for_preheat(&path, index_cache) {
                warn!("预热失败: {} - {}", path.display(), e);
            } else {
                info!("预热完成: {}", path.display());
            }
        }
    }

    /// 为预热构建索引
    fn build_index_for_preheat(&self, path: &Path, index_cache: &IndexCache) -> Result<(), String> {
        use crate::core::archive::ArchiveManager;
        use crate::core::archive_index_cache::{ArchiveIndex, IndexEntry, is_image_file};

        let archive_manager = ArchiveManager::new();
        let items = archive_manager.list_contents(path)?;

        // 获取文件信息
        let metadata = std::fs::metadata(path).map_err(|e| format!("获取文件信息失败: {e}"))?;
        let mtime = metadata
            .modified()
            .map_err(|e| format!("获取修改时间失败: {e}"))?
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| format!("时间转换失败: {e}"))?
            .as_secs() as i64;
        let size = metadata.len();

        let mut index = ArchiveIndex::new(path.to_string_lossy().to_string(), mtime, size);

        for item in items {
            if item.is_dir {
                continue;
            }
            index.add_entry(IndexEntry {
                path: item.path.clone(),
                name: item.name.clone(),
                size: item.size,
                entry_index: item.entry_index,
                is_image: is_image_file(&item.name),
                modified: item.modified,
            });
        }

        index_cache.put(path, index);
        Ok(())
    }

    /// 检查是否为压缩包文件
    fn is_archive(path: &Path) -> bool {
        if !path.is_file() {
            return false;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        matches!(ext.as_str(), "zip" | "rar" | "7z" | "cbz" | "cbr")
    }
}

impl Default for PreheatSystem {
    fn default() -> Self {
        Self::new(5)
    }
}

// ============================================================================
// 单元测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
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
    fn test_preheat_system_creation() {
        let system = PreheatSystem::new(5);
        assert_eq!(system.queue_size(), 0);
    }

    #[test]
    fn test_get_adjacent_archives() {
        let temp_dir = TempDir::new().unwrap();
        
        // 创建多个压缩包
        create_test_zip(temp_dir.path(), "archive_01.zip");
        let current = create_test_zip(temp_dir.path(), "archive_02.zip");
        create_test_zip(temp_dir.path(), "archive_03.zip");
        
        let system = PreheatSystem::new(5);
        let (prev, next) = system.get_adjacent_archives(&current);
        
        assert!(prev.is_some());
        assert!(next.is_some());
        assert!(prev.unwrap().file_name().unwrap().to_str().unwrap().contains("01"));
        assert!(next.unwrap().file_name().unwrap().to_str().unwrap().contains("03"));
    }

    #[test]
    fn test_trigger_preheat() {
        let temp_dir = TempDir::new().unwrap();
        
        create_test_zip(temp_dir.path(), "archive_01.zip");
        let current = create_test_zip(temp_dir.path(), "archive_02.zip");
        create_test_zip(temp_dir.path(), "archive_03.zip");
        
        let system = PreheatSystem::new(5);
        system.trigger(&current);
        
        // 应该有 2 个预热任务（前一个和后一个）
        assert_eq!(system.queue_size(), 2);
    }

    #[test]
    fn test_queue_limit() {
        let temp_dir = TempDir::new().unwrap();
        
        // 创建多个压缩包
        for i in 0..10 {
            create_test_zip(temp_dir.path(), &format!("archive_{i:02}.zip"));
        }
        
        let system = PreheatSystem::new(3); // 限制队列大小为 3
        
        // 多次触发预热
        for i in 1..9 {
            let path = temp_dir.path().join(format!("archive_{i:02}.zip"));
            system.trigger(&path);
        }
        
        // 队列大小不应超过限制
        assert!(system.queue_size() <= 3);
    }
}

// ============================================================================
// 属性测试
// ============================================================================

#[cfg(test)]
mod property_tests {
    use super::*;
    use proptest::prelude::*;
    use std::fs::File;
    use std::io::Write;
    use tempfile::TempDir;

    fn create_test_zip_file(dir: &Path, name: &str) -> PathBuf {
        let path = dir.join(name);
        let file = File::create(&path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        zip.start_file("test.txt", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"Hello").unwrap();
        zip.finish().unwrap();
        path
    }

    proptest! {
        /// **Feature: archive-instant-loading, Property 6: Adjacent Archive Identification**
        /// *For any* archive in a folder with multiple archives, the preheat system
        /// SHALL correctly identify the next and previous archives in sorted order.
        /// **Validates: Requirements 4.1**
        #[test]
        fn prop_adjacent_archive_identification(
            archive_count in 3usize..10,
            current_idx in 1usize..9
        ) {
            let temp_dir = TempDir::new().unwrap();
            let system = PreheatSystem::new(5);
            
            // 创建多个压缩包
            let mut paths = Vec::new();
            for i in 0..archive_count {
                let path = create_test_zip_file(temp_dir.path(), &format!("archive_{i:02}.zip"));
                paths.push(path);
            }
            
            // 选择一个中间的压缩包
            let idx = current_idx.min(archive_count - 2).max(1);
            let current = &paths[idx];
            
            let (prev, next) = system.get_adjacent_archives(current);
            
            // 验证相邻识别
            if idx > 0 {
                prop_assert!(prev.is_some());
                let prev_name = prev.unwrap().file_name().unwrap().to_string_lossy().to_string();
                let expected_prev = format!("archive_{:02}.zip", idx - 1);
                prop_assert_eq!(prev_name, expected_prev);
            }
            
            if idx + 1 < archive_count {
                prop_assert!(next.is_some());
                let next_name = next.unwrap().file_name().unwrap().to_string_lossy().to_string();
                let expected_next = format!("archive_{:02}.zip", idx + 1);
                prop_assert_eq!(next_name, expected_next);
            }
        }

        /// **Feature: archive-instant-loading, Property 7: Preheat Queue Limit**
        /// *For any* sequence of preheat requests, the queue size SHALL never
        /// exceed the configured maximum (5 archives).
        /// **Validates: Requirements 4.5**
        #[test]
        fn prop_preheat_queue_limit(
            trigger_count in 1usize..20,
            max_queue_size in 1usize..10
        ) {
            let temp_dir = TempDir::new().unwrap();
            let system = PreheatSystem::new(max_queue_size);
            
            // 创建足够多的压缩包
            let archive_count = trigger_count + 2;
            let mut paths = Vec::new();
            for i in 0..archive_count {
                let path = create_test_zip_file(temp_dir.path(), &format!("archive_{i:02}.zip"));
                paths.push(path);
            }
            
            // 多次触发预热
            for i in 1..trigger_count.min(archive_count - 1) {
                system.trigger(&paths[i]);
                
                // 验证队列大小不超过限制
                prop_assert!(
                    system.queue_size() <= max_queue_size,
                    "队列大小 {} 超过限制 {}",
                    system.queue_size(),
                    max_queue_size
                );
            }
        }
    }
}
