// ZIP/CBZ 格式处理模块
// 包含 ZIP 压缩包的读取、提取、删除等操作

use super::types::ArchiveEntry;
use super::utils::{
    is_image_file, is_video_file, normalize_archive_key, normalize_inner_path, zip_datetime_to_unix,
};
use log::info;
use natural_sort_rs::natural_cmp;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tempfile::NamedTempFile;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

/// ZIP 压缩包缓存类型
pub type ZipArchiveCache = Arc<Mutex<HashMap<String, Arc<Mutex<ZipArchive<File>>>>>>;

/// 获取或创建 ZIP 压缩包缓存
pub fn get_cached_archive(
    archive_cache: &ZipArchiveCache,
    archive_path: &Path,
) -> Result<Arc<Mutex<ZipArchive<File>>>, String> {
    // 规范化缓存键，统一使用正斜杠，避免 Windows 上的 "\\" 和 "/" 差异导致命中失败
    let path_str = normalize_archive_key(archive_path);

    // 检查缓存
    {
        let cache = archive_cache.lock().unwrap();
        if let Some(archive) = cache.get(&path_str) {
            return Ok(Arc::clone(archive));
        }
    }

    // 创建新的压缩包实例
    let file = File::open(archive_path).map_err(|e| format!("打开压缩包失败: {}", e))?;

    let archive = ZipArchive::new(file).map_err(|e| format!("读取压缩包失败: {}", e))?;

    let cached = Arc::new(Mutex::new(archive));

    // 添加到缓存
    {
        let mut cache = archive_cache.lock().unwrap();
        cache.insert(path_str, Arc::clone(&cached));
    }

    Ok(cached)
}

/// 读取 ZIP 压缩包内容列表
pub fn list_zip_contents(archive_path: &Path) -> Result<Vec<ArchiveEntry>, String> {
    println!("📦 list_zip_contents start: {}", archive_path.display());
    let file = File::open(archive_path).map_err(|e| format!("打开压缩包失败: {}", e))?;

    let mut archive = ZipArchive::new(file).map_err(|e| format!("读取压缩包失败: {}", e))?;

    let mut entries = Vec::new();

    for i in 0..archive.len() {
        let file = archive
            .by_index(i)
            .map_err(|e| format!("读取压缩包条目失败: {}", e))?;

        let name = file.name().to_string();
        let is_dir = file.is_dir();
        let size = file.size();
        let is_image = !is_dir && is_image_file(&name);
        let is_video = !is_dir && is_video_file(&name);
        let modified = zip_datetime_to_unix(file.last_modified());

        entries.push(ArchiveEntry {
            name: name.clone(),
            path: name,
            size,
            is_dir,
            is_image,
            is_video,
            entry_index: i,
            modified,
        });
    }

    println!("📦 list_zip_contents end: {} entries", entries.len());

    // 排序：目录优先，然后按自然排序
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        _ => natural_cmp::<str, _>(&a.name, &b.name),
    });

    Ok(entries)
}

/// 从 ZIP 压缩包中提取文件内容（优化版本，使用缓存的压缩包实例）
pub fn extract_file_from_zip(
    archive_cache: &ZipArchiveCache,
    archive_path: &Path,
    file_path: &str,
) -> Result<Vec<u8>, String> {
    info!(
        "📦 extract_file_from_zip start: archive={} inner={}",
        archive_path.display(),
        file_path
    );

    // 使用缓存的压缩包实例
    let cached_archive = get_cached_archive(archive_cache, archive_path)?;
    let mut archive = cached_archive.lock().unwrap();

    let mut zip_file = archive
        .by_name(file_path)
        .map_err(|e| format!("在压缩包中找不到文件: {}", e))?;

    // 使用缓冲区池，预分配解压后大小
    let uncompressed_size = zip_file.size() as usize;
    let mut buffer =
        crate::core::buffer_pool::IMAGE_BUFFER_POOL.acquire_with_capacity(uncompressed_size);

    let start = Instant::now();
    zip_file
        .read_to_end(&mut buffer)
        .map_err(|e| format!("读取文件失败: {}", e))?;

    let elapsed = start.elapsed();
    let compressed = zip_file.compressed_size();
    let uncompressed = buffer.len() as u64;
    let ratio = if uncompressed > 0 {
        (compressed as f64) / (uncompressed as f64)
    } else {
        0.0
    };
    info!("📦 extract_file_from_zip end: read_bytes={} compressed={} ratio={:.3} elapsed_ms={} archive={} inner={}", uncompressed, compressed, ratio, elapsed.as_millis(), archive_path.display(), file_path);

    Ok(buffer)
}

pub fn extract_file_from_zip_to_path(
    archive_cache: &ZipArchiveCache,
    archive_path: &Path,
    file_path: &str,
    dest_path: &Path,
) -> Result<u64, String> {
    let cached_archive = get_cached_archive(archive_cache, archive_path)?;
    let mut archive = cached_archive.lock().unwrap();

    let mut zip_file = archive
        .by_name(file_path)
        .map_err(|e| format!("在压缩包中找不到文件: {}", e))?;

    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }

    let mut out = File::create(dest_path).map_err(|e| format!("创建文件失败: {}", e))?;
    let written = io::copy(&mut zip_file, &mut out).map_err(|e| format!("写入文件失败: {}", e))?;
    out.flush().map_err(|e| format!("刷新文件失败: {}", e))?;
    Ok(written)
}

/// 从 ZIP 压缩包中删除条目
pub fn delete_entry_from_zip(
    archive_cache: &ZipArchiveCache,
    archive_path: &Path,
    inner_path: &str,
) -> Result<(), String> {
    let normalized_target = normalize_inner_path(inner_path);

    let parent_dir = archive_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));

    let temp_file =
        NamedTempFile::new_in(&parent_dir).map_err(|e| format!("创建临时文件失败: {}", e))?;
    let temp_writer = temp_file
        .reopen()
        .map_err(|e| format!("打开临时文件失败: {}", e))?;
    let mut zip_writer = ZipWriter::new(temp_writer);

    {
        let source_file = File::open(archive_path).map_err(|e| format!("打开压缩包失败: {}", e))?;
        let mut archive =
            ZipArchive::new(source_file).map_err(|e| format!("读取压缩包失败: {}", e))?;

        let mut found = false;
        for index in 0..archive.len() {
            let mut entry = archive
                .by_index(index)
                .map_err(|e| format!("读取压缩包条目失败: {}", e))?;
            let entry_name = entry.name().to_string();
            let normalized_name = normalize_inner_path(&entry_name);

            if normalized_name == normalized_target {
                found = true;
                continue;
            }

            let last_modified = entry.last_modified().unwrap_or_else(zip::DateTime::default);
            let mut options = SimpleFileOptions::default().last_modified_time(last_modified);
            if let Some(mode) = entry.unix_mode() {
                options = options.unix_permissions(mode);
            }

            if entry.is_dir() {
                zip_writer
                    .add_directory(entry_name, options)
                    .map_err(|e| format!("写入目录失败: {}", e))?;
            } else {
                let options = options.compression_method(entry.compression());
                zip_writer
                    .start_file(entry_name, options)
                    .map_err(|e| format!("写入文件失败: {}", e))?;
                io::copy(&mut entry, &mut zip_writer)
                    .map_err(|e| format!("写入文件内容失败: {}", e))?;
            }
        }

        if !found {
            return Err(format!("在压缩包中找不到文件: {}", inner_path));
        }
    }

    let mut writer = zip_writer
        .finish()
        .map_err(|e| format!("写入压缩包失败: {}", e))?;
    writer
        .flush()
        .map_err(|e| format!("刷新压缩包失败: {}", e))?;
    drop(writer);

    let temp_path = temp_file.into_temp_path();
    fs::remove_file(archive_path).map_err(|e| format!("删除原压缩包失败: {}", e))?;
    temp_path
        .persist(archive_path)
        .map_err(|e| format!("替换压缩包失败: {}", e.error))?;

    // 清除缓存
    evict_archive_cache(archive_cache, archive_path);

    Ok(())
}

/// 清除指定压缩包的缓存
pub fn evict_archive_cache(archive_cache: &ZipArchiveCache, archive_path: &Path) {
    let key = normalize_archive_key(archive_path);
    if let Ok(mut cache) = archive_cache.lock() {
        cache.remove(&key);
    }
}

/// 检查文件是否为支持的 ZIP 压缩包
pub fn is_supported_archive(path: &Path) -> bool {
    if let Some(ext) = path.extension() {
        let ext = ext.to_string_lossy().to_lowercase();
        matches!(ext.as_str(), "zip" | "cbz")
    } else {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_extract_file_from_zip_to_path_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let zip_path = dir.path().join("test.zip");
        let dest_path = dir.path().join("out.bin");

        let payload: Vec<u8> = (0..1024 * 1024).map(|i| (i % 251) as u8).collect();

        {
            let file = File::create(&zip_path).unwrap();
            let mut w = ZipWriter::new(file);
            w.start_file("a.bin", SimpleFileOptions::default()).unwrap();
            w.write_all(&payload).unwrap();
            w.finish().unwrap();
        }

        let cache: ZipArchiveCache = Arc::new(Mutex::new(HashMap::new()));
        let written =
            extract_file_from_zip_to_path(&cache, &zip_path, "a.bin", &dest_path).unwrap();
        assert_eq!(written, payload.len() as u64);

        let out = std::fs::read(&dest_path).unwrap();
        assert_eq!(out, payload);
    }
}
