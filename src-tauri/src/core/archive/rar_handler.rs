// RAR/CBR 格式处理模块
// 包含 RAR 压缩包的读取、提取等操作

use super::types::ArchiveEntry;
use super::utils::{is_image_file, is_video_file};
use crate::core::archive_index::{ArchiveIndex, ArchiveIndexCache};
use crate::core::archive_index_builder::RarIndexBuilder;
use log::debug;
use natural_sort_rs::natural_cmp;
use std::cmp::Ordering;
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;

/// 读取 RAR 压缩包内容列表
pub fn list_rar_contents(archive_path: &Path) -> Result<Vec<ArchiveEntry>, String> {
    debug!("📦 list_rar_contents start: {}", archive_path.display());

    let archive = unrar::Archive::new(archive_path)
        .open_for_listing()
        .map_err(|e| format!("打开 RAR 压缩包失败: {:?}", e))?;

    let mut entries = Vec::new();
    let mut index = 0;

    for entry_result in archive {
        let entry = entry_result.map_err(|e| format!("读取 RAR 条目失败: {:?}", e))?;
        let name = entry.filename.to_string_lossy().to_string();
        let is_dir = entry.is_directory();
        let size = entry.unpacked_size as u64;
        let is_image = !is_dir && is_image_file(&name);
        let is_video = !is_dir && is_video_file(&name);

        // RAR 的修改时间处理 (file_time 是 u32 DOS 时间戳)
        let modified = if entry.file_time > 0 {
            // DOS 时间转 Unix 时间戳（简化处理）
            Some(entry.file_time as i64)
        } else {
            None
        };

        entries.push(ArchiveEntry {
            name: name.clone(),
            path: name,
            size,
            is_dir,
            is_image,
            is_video,
            entry_index: index,
            modified,
        });
        index += 1;
    }

    debug!("📦 list_rar_contents end: {} entries", entries.len());

    // 排序：目录优先，然后按自然排序
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        _ => natural_cmp::<str, _>(&a.name, &b.name),
    });

    Ok(entries)
}

/// 从 RAR 压缩包中提取文件内容（使用索引优化）
pub fn extract_file_from_rar(
    index_cache: &Arc<ArchiveIndexCache>,
    archive_path: &Path,
    file_path: &str,
) -> Result<Vec<u8>, String> {
    debug!(
        "📦 extract_file_from_rar start: archive={} inner={}",
        archive_path.display(),
        file_path
    );

    let start = Instant::now();

    // 尝试使用索引
    let target_index = get_rar_entry_index(index_cache, archive_path, file_path);
    let normalized_path = if target_index.is_none() {
        Some(file_path.replace('\\', "/"))
    } else {
        None
    };

    // 打开 RAR 并解压指定文件
    let mut archive = unrar::Archive::new(archive_path)
        .open_for_processing()
        .map_err(|e| format!("打开 RAR 压缩包失败: {:?}", e))?;

    let mut found_data: Option<Vec<u8>> = None;
    let mut current_index = 0usize;

    while let Some(header) = archive
        .read_header()
        .map_err(|e| format!("读取 RAR 头失败: {:?}", e))?
    {
        // 如果有索引，直接按索引定位，避免热路径字符串分配与归一化
        let is_target = if let Some(idx) = target_index {
            current_index == idx
        } else {
            let entry_path = header.entry().filename.to_string_lossy().to_string();
            let entry_normalized = entry_path.replace('\\', "/");
            entry_normalized == normalized_path.as_deref().unwrap_or("") || entry_path == file_path
        };

        if is_target {
            // 找到目标文件，读取数据
            let (data, _next) = header
                .read()
                .map_err(|e| format!("读取 RAR 条目失败: {:?}", e))?;
            found_data = Some(data);
            break;
        } else {
            // 跳过其他文件
            archive = header
                .skip()
                .map_err(|e| format!("跳过 RAR 条目失败: {:?}", e))?;
        }
        current_index += 1;
    }

    let elapsed = start.elapsed();

    match found_data {
        Some(data) => {
            let indexed = if target_index.is_some() {
                "indexed"
            } else {
                "sequential"
            };
            debug!(
                "📦 extract_file_from_rar end: read_bytes={} elapsed_ms={} mode={} archive={} inner={}",
                data.len(),
                elapsed.as_millis(),
                indexed,
                archive_path.display(),
                file_path
            );
            Ok(data)
        }
        None => Err(format!("在 RAR 压缩包中找不到文件: {}", file_path)),
    }
}

/// 获取 RAR 条目索引（如果有缓存）
pub fn get_rar_entry_index(
    index_cache: &Arc<ArchiveIndexCache>,
    archive_path: &Path,
    file_path: &str,
) -> Option<usize> {
    // 尝试从缓存获取索引
    let index = index_cache.get(archive_path)?;
    let idx = index.read().ok()?;
    let entry = idx.get_normalized(file_path)?;
    Some(entry.entry_index)
}

/// 构建 RAR 索引（如果不存在）
pub fn build_rar_index(
    index_cache: &Arc<ArchiveIndexCache>,
    archive_path: &Path,
) -> Result<(), String> {
    if index_cache.is_valid(archive_path) {
        debug!("📦 RAR 索引已存在: {}", archive_path.display());
        return Ok(());
    }

    let index = RarIndexBuilder::build(archive_path, None)?;
    index_cache.put(archive_path, index);
    Ok(())
}
