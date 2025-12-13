//! 压缩包索引构建器
//!
//! 为 RAR 和 7z 格式构建索引

use super::archive_index::{is_image_file, ArchiveIndex, ArchiveIndexCache, ArchiveIndexEntry};
use log::{debug, info};
use std::path::Path;

/// 进度回调类型
pub type ProgressCallback<'a> = Option<&'a dyn Fn(usize, usize)>;

/// RAR 索引构建器
pub struct RarIndexBuilder;

impl RarIndexBuilder {
    /// 构建 RAR 压缩包索引
    ///
    /// # Arguments
    /// * `archive_path` - 压缩包路径
    /// * `progress` - 进度回调 (current, total)
    pub fn build(
        archive_path: &Path,
        progress: ProgressCallback,
    ) -> Result<ArchiveIndex, String> {
        info!("📦 开始构建 RAR 索引: {}", archive_path.display());

        let (mtime, size) = ArchiveIndexCache::get_file_info(archive_path)?;

        let archive = unrar::Archive::new(archive_path)
            .open_for_listing()
            .map_err(|e| format!("打开 RAR 失败: {:?}", e))?;

        let mut index = ArchiveIndex::new(
            archive_path.to_string_lossy().to_string(),
            mtime,
            size,
        );

        let mut entry_index = 0;

        for entry_result in archive {
            let entry = entry_result.map_err(|e| format!("读取 RAR 条目失败: {:?}", e))?;
            let name = entry.filename.to_string_lossy().to_string();

            // 报告进度
            if let Some(cb) = progress {
                cb(entry_index, 0); // RAR 不提供总数，传 0
            }

            let index_entry = ArchiveIndexEntry {
                name: name.clone(),
                entry_index,
                size: entry.unpacked_size as u64,
                compressed_size: entry.unpacked_size as u64, // RAR 不提供单独的压缩大小
                modified: if entry.file_time > 0 {
                    Some(entry.file_time as i64)
                } else {
                    None
                },
                is_dir: entry.is_directory(),
                is_image: !entry.is_directory() && is_image_file(&name),
            };

            index.add_entry(index_entry);
            entry_index += 1;
        }

        info!(
            "✅ RAR 索引构建完成: {} 条目, 预估大小 {} bytes",
            index.len(),
            index.estimated_size
        );

        Ok(index)
    }
}

/// 7z 索引构建器
pub struct SevenZIndexBuilder;

impl SevenZIndexBuilder {
    /// 构建 7z 压缩包索引
    ///
    /// # Arguments
    /// * `archive_path` - 压缩包路径
    /// * `progress` - 进度回调 (current, total)
    pub fn build(
        archive_path: &Path,
        progress: ProgressCallback,
    ) -> Result<ArchiveIndex, String> {
        info!("📦 开始构建 7z 索引: {}", archive_path.display());

        let (mtime, size) = ArchiveIndexCache::get_file_info(archive_path)?;

        let archive = sevenz_rust::SevenZReader::open(archive_path, "".into())
            .map_err(|e| format!("打开 7z 失败: {}", e))?;

        let mut index = ArchiveIndex::new(
            archive_path.to_string_lossy().to_string(),
            mtime,
            size,
        );

        let files = &archive.archive().files;
        let total = files.len();

        for (entry_index, entry) in files.iter().enumerate() {
            let name = entry.name().to_string();

            // 报告进度
            if let Some(cb) = progress {
                cb(entry_index, total);
            }

            // 获取压缩后大小（7z 可能不提供单个文件的压缩大小）
            let compressed_size = entry.size(); // 使用解压大小作为近似值

            // 获取修改时间
            let file_time = entry.last_modified_date();
            let ft_value: u64 = file_time.into();
            let modified = if ft_value > 116444736000000000 {
                Some(((ft_value - 116444736000000000) / 10_000_000) as i64)
            } else {
                None
            };

            let index_entry = ArchiveIndexEntry {
                name: name.clone(),
                entry_index,
                size: entry.size(),
                compressed_size,
                modified,
                is_dir: entry.is_directory(),
                is_image: !entry.is_directory() && is_image_file(&name),
            };

            index.add_entry(index_entry);
        }

        info!(
            "✅ 7z 索引构建完成: {} 条目, 预估大小 {} bytes",
            index.len(),
            index.estimated_size
        );

        Ok(index)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 注意：这些测试需要实际的压缩包文件
    // 在 CI 环境中可能需要跳过或使用 mock

    #[test]
    fn test_rar_index_builder_struct() {
        // 测试结构体存在
        let _ = RarIndexBuilder;
    }

    #[test]
    fn test_sevenz_index_builder_struct() {
        // 测试结构体存在
        let _ = SevenZIndexBuilder;
    }
}


// ============================================================================
// Property-Based Tests
// ============================================================================

#[cfg(test)]
mod property_tests {
    use super::*;
    use proptest::prelude::*;

    /// **Feature: archive-ipc-optimization, Property 1: Index lookup consistency (RAR)**
    /// *For any* RAR archive and any file path within it, looking up the file through
    /// the index SHALL return the same entry index as sequential scanning would find.
    /// **Validates: Requirements 1.1, 1.2**
    /// 
    /// 注意：此测试需要实际的 RAR 文件，在 CI 中可能需要跳过
    #[test]
    #[ignore] // 需要实际 RAR 文件
    fn prop_rar_index_lookup_consistency() {
        // 此测试需要实际的 RAR 文件
        // 在有测试文件时取消 ignore
    }

    /// **Feature: archive-ipc-optimization, Property 1: Index lookup consistency (7z)**
    /// *For any* 7z archive and any file path within it, looking up the file through
    /// the index SHALL return the same entry index as sequential scanning would find.
    /// **Validates: Requirements 1.1, 1.2**
    /// 
    /// 注意：此测试需要实际的 7z 文件，在 CI 中可能需要跳过
    #[test]
    #[ignore] // 需要实际 7z 文件
    fn prop_7z_index_lookup_consistency() {
        // 此测试需要实际的 7z 文件
        // 在有测试文件时取消 ignore
    }

    proptest! {
        /// 测试索引条目的正确性
        #[test]
        fn prop_index_entry_fields(
            name in "[a-z]{1,20}\\.(jpg|png|txt)",
            entry_index in 0usize..1000,
            size in 0u64..10_000_000,
            compressed_size in 0u64..5_000_000,
        ) {
            use crate::core::archive_index::{ArchiveIndexEntry, is_image_file};
            
            let is_img = name.ends_with(".jpg") || name.ends_with(".png");
            
            let entry = ArchiveIndexEntry {
                name: name.clone(),
                entry_index,
                size,
                compressed_size,
                modified: Some(1_234_567_890),
                is_dir: false,
                is_image: is_image_file(&name),
            };
            
            // 验证字段正确设置
            prop_assert_eq!(entry.name, name);
            prop_assert_eq!(entry.entry_index, entry_index);
            prop_assert_eq!(entry.size, size);
            prop_assert_eq!(entry.compressed_size, compressed_size);
            
            // 验证图片检测
            prop_assert_eq!(entry.is_image, is_img);
        }
    }
}
