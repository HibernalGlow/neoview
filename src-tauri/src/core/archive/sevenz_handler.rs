// 7Z/CB7 格式处理模块
// 包含 7z 压缩包的读取、提取等操作

use super::types::ArchiveEntry;
use super::utils::{is_image_file, is_video_file};
use crate::core::archive_index::ArchiveIndexCache;
use crate::core::archive_index_builder::SevenZIndexBuilder;
use log::{debug, info};
use natural_sort_rs::natural_cmp;
use std::cmp::Ordering;
use std::io::Read;
use std::io::Write;
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;

/// 读取 7z 压缩包内容列表
pub fn list_7z_contents(archive_path: &Path) -> Result<Vec<ArchiveEntry>, String> {
    println!("📦 list_7z_contents start: {}", archive_path.display());

    let archive = sevenz_rust::SevenZReader::open(archive_path, "".into())
        .map_err(|e| format!("打开 7z 压缩包失败: {}", e))?;

    let mut entries = Vec::new();

    for (index, entry) in archive.archive().files.iter().enumerate() {
        let name = entry.name().to_string();
        let is_dir = entry.is_directory();
        let size = entry.size();
        let is_image = !is_dir && is_image_file(&name);
        let is_video = !is_dir && is_video_file(&name);

        // 7z 的修改时间处理 (FileTime 内部是 u64，转换为 Unix 时间戳)
        let file_time = entry.last_modified_date();
        // Windows FILETIME 是从 1601-01-01 开始的 100 纳秒计数
        // Unix 时间戳是从 1970-01-01 开始的秒数
        // 差值约为 116444736000000000 (100 纳秒单位)
        let modified = {
            let ft_value: u64 = file_time.into();
            if ft_value > 116444736000000000 {
                Some(((ft_value - 116444736000000000) / 10_000_000) as i64)
            } else {
                None
            }
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
    }

    println!("📦 list_7z_contents end: {} entries", entries.len());

    // 排序：目录优先，然后按自然排序
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        _ => natural_cmp::<str, _>(&a.name, &b.name),
    });

    Ok(entries)
}

/// 从 7z 压缩包中提取文件内容（使用索引优化）
pub fn extract_file_from_7z(
    index_cache: &Arc<ArchiveIndexCache>,
    archive_path: &Path,
    file_path: &str,
) -> Result<Vec<u8>, String> {
    info!(
        "📦 extract_file_from_7z start: archive={} inner={}",
        archive_path.display(),
        file_path
    );

    let start = Instant::now();

    // 尝试使用索引
    let target_index = get_7z_entry_index(index_cache, archive_path, file_path);

    // 规范化路径
    let normalized_path = file_path.replace('\\', "/");

    let mut archive = sevenz_rust::SevenZReader::open(archive_path, "".into())
        .map_err(|e| format!("打开 7z 压缩包失败: {}", e))?;

    // 查找目标文件
    let target_entry = if let Some(idx) = target_index {
        // 使用索引直接定位
        archive.archive().files.get(idx).map(|e| (idx, e))
    } else {
        // 顺序查找
        archive
            .archive()
            .files
            .iter()
            .enumerate()
            .find(|(_, entry)| {
                let entry_path = entry.name().replace('\\', "/");
                entry_path == normalized_path || entry.name() == file_path
            })
    };

    if let Some((_index, _)) = target_entry {
        let mut data = Vec::new();
        let mut found = false;

        archive
            .for_each_entries(|entry, reader| {
                let entry_path = entry.name().replace('\\', "/");
                if entry_path == normalized_path || entry.name() == file_path {
                    reader.read_to_end(&mut data)?;
                    found = true;
                    return Ok(false); // 找到后停止遍历
                }
                Ok(true)
            })
            .map_err(|e| format!("遍历 7z 条目失败: {}", e))?;

        let elapsed = start.elapsed();
        let indexed = if target_index.is_some() {
            "indexed"
        } else {
            "sequential"
        };
        info!(
            "📦 extract_file_from_7z end: read_bytes={} elapsed_ms={} mode={} archive={} inner={}",
            data.len(),
            elapsed.as_millis(),
            indexed,
            archive_path.display(),
            file_path
        );

        if data.is_empty() {
            Err(format!("在 7z 压缩包中找不到文件或文件为空: {}", file_path))
        } else {
            Ok(data)
        }
    } else {
        Err(format!("在 7z 压缩包中找不到文件: {}", file_path))
    }
}

pub fn extract_file_from_7z_to_path(
    index_cache: &Arc<ArchiveIndexCache>,
    archive_path: &Path,
    file_path: &str,
    dest_path: &Path,
) -> Result<u64, String> {
    let _ = index_cache;
    let normalized_path = file_path.replace('\\', "/");

    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    let mut out = std::fs::File::create(dest_path).map_err(|e| format!("创建文件失败: {}", e))?;

    let mut archive = sevenz_rust::SevenZReader::open(archive_path, "".into())
        .map_err(|e| format!("打开 7z 压缩包失败: {}", e))?;

    let mut written: u64 = 0;
    let mut found = false;

    archive
        .for_each_entries(|entry, reader| {
            let entry_path = entry.name().replace('\\', "/");
            if entry_path == normalized_path || entry.name() == file_path {
                written = std::io::copy(reader, &mut out)?;
                found = true;
                return Ok(false);
            }
            Ok(true)
        })
        .map_err(|e| format!("遍历 7z 条目失败: {}", e))?;

    out.flush().map_err(|e| format!("刷新文件失败: {}", e))?;

    if !found {
        return Err(format!("在 7z 压缩包中找不到文件: {}", file_path));
    }

    Ok(written)
}

/// 获取 7z 条目索引（如果有缓存）
pub fn get_7z_entry_index(
    index_cache: &Arc<ArchiveIndexCache>,
    archive_path: &Path,
    file_path: &str,
) -> Option<usize> {
    let index = index_cache.get(archive_path)?;
    let idx = index.read().ok()?;
    let entry = idx.get_normalized(file_path)?;
    Some(entry.entry_index)
}

/// 构建 7z 索引（如果不存在）
pub fn build_7z_index(
    index_cache: &Arc<ArchiveIndexCache>,
    archive_path: &Path,
) -> Result<(), String> {
    if index_cache.is_valid(archive_path) {
        debug!("📦 7z 索引已存在: {}", archive_path.display());
        return Ok(());
    }

    let index = SevenZIndexBuilder::build(archive_path, None)?;
    index_cache.put(archive_path, index);
    Ok(())
}
