// 图片操作模块
// 包含从压缩包加载图片、JXL 转换、首图查找等操作

use super::types::{ArchiveFormat, ArchiveMetadata};
use super::utils::{detect_image_mime_type, get_archive_metadata, is_image_file, normalize_archive_key};
use super::zip_handler;
use super::rar_handler;
use super::sevenz_handler;
use crate::core::archive_index::ArchiveIndexCache;
use crate::core::blob_registry::BlobRegistry;
use std::fs::File;
use std::io::Cursor;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use zip::ZipArchive;

/// 从压缩包中提取文件（统一接口，自动检测格式）
pub fn extract_file(
    archive_cache: &zip_handler::ZipArchiveCache,
    index_cache: &Arc<ArchiveIndexCache>,
    archive_path: &Path,
    file_path: &str,
) -> Result<Vec<u8>, String> {
    let format = ArchiveFormat::from_extension(archive_path);
    match format {
        ArchiveFormat::Zip => zip_handler::extract_file_from_zip(archive_cache, archive_path, file_path),
        ArchiveFormat::Rar => rar_handler::extract_file_from_rar(index_cache, archive_path, file_path),
        ArchiveFormat::SevenZ => sevenz_handler::extract_file_from_7z(index_cache, archive_path, file_path),
        ArchiveFormat::Unknown => Err(format!(
            "不支持的压缩包格式: {}",
            archive_path.display()
        )),
    }
}

/// 从压缩包中加载图片（返回二进制数据，支持 ZIP/RAR/7z）
pub fn load_image_from_archive_binary(
    archive_cache: &zip_handler::ZipArchiveCache,
    index_cache: &Arc<ArchiveIndexCache>,
    image_cache: &Arc<std::sync::Mutex<std::collections::HashMap<String, super::types::CachedImageEntry>>>,
    archive_path: &Path,
    file_path: &str,
) -> Result<Vec<u8>, String> {
    let cache_key = format!(
        "{}::{}",
        normalize_archive_key(archive_path),
        file_path
    );
    
    // 检查缓存
    if let Some(cached) = get_cached_image(image_cache, &cache_key) {
        println!(
            "🎯 Archive image cache hit: {} ({} bytes)",
            file_path,
            cached.len()
        );
        return Ok(cached);
    }

    // 使用 extract_file 自动检测格式
    let data = extract_file(archive_cache, index_cache, archive_path, file_path)?;

    // 对于 JXL 格式，需要先解码再重新编码为通用格式
    if let Some(ext) = Path::new(file_path).extension() {
        if ext.to_string_lossy().to_lowercase() == "jxl" {
            let converted = load_jxl_binary_from_zip(&data)?;
            store_cached_image(image_cache, cache_key, converted.clone());
            return Ok(converted);
        }
    }

    // 直接返回原始二进制数据
    store_cached_image(image_cache, cache_key, data.clone());
    Ok(data)
}

/// 从压缩包中加载 JXL 图片并转换为 PNG（返回二进制数据）
pub fn load_jxl_binary_from_zip(image_data: &[u8]) -> Result<Vec<u8>, String> {
    use jxl_oxide::JxlImage;

    let mut reader = Cursor::new(image_data);
    let jxl_image = JxlImage::builder()
        .read(&mut reader)
        .map_err(|e| format!("Failed to decode JXL: {}", e))?;

    let render = jxl_image
        .render_frame(0)
        .map_err(|e| format!("Failed to render JXL frame: {}", e))?;

    let fb = render.image_all_channels();
    let width = fb.width() as u32;
    let height = fb.height() as u32;
    let channels = fb.channels();
    let float_buf = fb.buf();

    // 转换为 DynamicImage
    let img = if channels == 1 {
        let gray_data: Vec<u8> = float_buf
            .iter()
            .map(|&v| (v.clamp(0.0, 1.0) * 255.0) as u8)
            .collect();

        let gray_img = image::GrayImage::from_raw(width, height, gray_data)
            .ok_or_else(|| "Failed to create gray image from JXL data".to_string())?;
        image::DynamicImage::ImageLuma8(gray_img)
    } else if channels == 3 {
        let rgb_data: Vec<u8> = float_buf
            .iter()
            .map(|&v| (v.clamp(0.0, 1.0) * 255.0) as u8)
            .collect();

        let rgb_img = image::RgbImage::from_raw(width, height, rgb_data)
            .ok_or_else(|| "Failed to create RGB image from JXL data".to_string())?;
        image::DynamicImage::ImageRgb8(rgb_img)
    } else {
        let rgba_data: Vec<u8> = float_buf
            .chunks(channels)
            .flat_map(|chunk| {
                vec![
                    (chunk[0].clamp(0.0, 1.0) * 255.0) as u8,
                    (chunk[1].clamp(0.0, 1.0) * 255.0) as u8,
                    (chunk[2].clamp(0.0, 1.0) * 255.0) as u8,
                    (chunk.get(3).copied().unwrap_or(1.0).clamp(0.0, 1.0) * 255.0) as u8,
                ]
            })
            .collect();

        let rgba_img = image::RgbaImage::from_raw(width, height, rgba_data)
            .ok_or_else(|| "Failed to create RGBA image from JXL data".to_string())?;
        image::DynamicImage::ImageRgba8(rgba_img)
    };

    // 编码为 PNG
    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);

    img.write_to(&mut cursor, image::ImageFormat::Png)
        .map_err(|e| format!("编码 JXL 为 PNG 失败: {}", e))?;

    // 返回 PNG 格式的二进制数据
    Ok(buffer)
}

/// 从压缩包中加载 JXL 图片并转换为 PNG（另一个版本，功能相同）
pub fn load_jxl_from_zip(image_data: &[u8]) -> Result<Vec<u8>, String> {
    load_jxl_binary_from_zip(image_data)
}

/// 获取压缩包中的所有图片路径（支持 ZIP/RAR/7z）
pub fn get_images_from_archive(
    archive_path: &Path,
) -> Result<Vec<String>, String> {
    let entries = list_contents(archive_path)?;

    let images: Vec<String> = entries
        .into_iter()
        .filter(|e| e.is_image)
        .map(|e| e.path)
        .collect();

    Ok(images)
}

/// 读取压缩包内容列表（自动检测格式）
pub fn list_contents(archive_path: &Path) -> Result<Vec<super::types::ArchiveEntry>, String> {
    let format = ArchiveFormat::from_extension(archive_path);
    match format {
        ArchiveFormat::Zip => zip_handler::list_zip_contents(archive_path),
        ArchiveFormat::Rar => rar_handler::list_rar_contents(archive_path),
        ArchiveFormat::SevenZ => sevenz_handler::list_7z_contents(archive_path),
        ArchiveFormat::Unknown => Err(format!(
            "不支持的压缩包格式: {}",
            archive_path.display()
        )),
    }
}

/// 快速查找压缩包中的第一张图片（早停扫描）
/// 找到第一张图片即返回，避免遍历全部条目
pub fn find_first_image_entry(archive_path: &Path) -> Result<Option<String>, String> {
    println!(
        "⚡ find_first_image_entry start: {}",
        archive_path.display()
    );

    scan_first_image_entry(archive_path)
}

fn scan_first_image_entry(archive_path: &Path) -> Result<Option<String>, String> {
    let file = File::open(archive_path).map_err(|e| format!("打开压缩包失败: {}", e))?;

    let mut archive = ZipArchive::new(file).map_err(|e| format!("读取压缩包失败: {}", e))?;

    // 优先查找常见的图片命名模式
    let priority_patterns = [
        "cover", "front", "title", "page-001", "page_001", "001", "vol", "chapter", "ch",
        "p001", "p_001", "img",
    ];

    // 先按优先级查找
    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|e| format!("读取压缩包条目失败: {}", e))?;

        let name = entry.name().to_string();
        let name_lower = name.to_lowercase();

        if entry.is_dir() {
            continue;
        }

        if !is_image_file(&name) {
            continue;
        }

        for pattern in &priority_patterns {
            if name_lower.contains(pattern) {
                println!("⚡ 快速扫描找到优先图片: {}", name);
                return Ok(Some(name));
            }
        }
    }

    // 如果没找到优先图片，再次扫描找到第一张图片
    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|e| format!("读取压缩包条目失败: {}", e))?;

        let name = entry.name().to_string();

        if entry.is_dir() {
            continue;
        }

        if is_image_file(&name) {
            println!("⚡ 快速扫描找到图片: {}", name);
            return Ok(Some(name));
        }
    }

    println!("⚡ 压缩包中未找到图片");
    Ok(None)
}

/// 扫描压缩包内的前N张图片（限制扫描数量）
/// 用于快速获取首图，避免扫描整个压缩包
pub fn scan_archive_images_fast(
    archive_path: &Path,
    limit: usize,
) -> Result<Vec<String>, String> {
    println!(
        "⚡ scan_archive_images_fast start: {} limit={}",
        archive_path.display(),
        limit
    );

    let file = File::open(archive_path).map_err(|e| format!("打开压缩包失败: {}", e))?;

    let mut archive = ZipArchive::new(file).map_err(|e| format!("读取压缩包失败: {}", e))?;

    let mut images = Vec::new();
    let scan_limit = limit.min(archive.len()); // 限制扫描数量

    // 优先查找常见的图片命名模式
    let priority_patterns = [
        "cover", "front", "title", "page-001", "page_001", "001", "vol", "chapter", "ch",
        "p001", "p_001", "img",
    ];

    // 先按优先级查找
    for i in 0..scan_limit {
        let entry = archive
            .by_index(i)
            .map_err(|e| format!("读取压缩包条目失败: {}", e))?;

        let name = entry.name().to_string();
        let name_lower = name.to_lowercase();

        if entry.is_dir() {
            continue;
        }

        if !is_image_file(&name) {
            continue;
        }

        for pattern in &priority_patterns {
            if name_lower.contains(pattern) {
                images.push(name.clone());
                println!("⚡ 快速扫描找到优先图片: {}", name);
                return Ok(images);
            }
        }
    }

    // 如果没找到优先图片，扫描前limit个文件
    for i in 0..scan_limit {
        let entry = archive
            .by_index(i)
            .map_err(|e| format!("读取压缩包条目失败: {}", e))?;

        let name = entry.name().to_string();

        if entry.is_dir() {
            continue;
        }

        if is_image_file(&name) {
            images.push(name.clone());
            println!("⚡ 快速扫描找到图片: {}", name);
            return Ok(images);
        }
    }

    if images.is_empty() {
        println!("⚡ 压缩包内未找到图片");
        Err("压缩包内未找到图片".to_string())
    } else {
        Ok(images)
    }
}

/// 获取首图 blob 或扫描（返回 blob URL 和内部路径）
pub fn get_first_image_blob_or_scan(
    archive_cache: &zip_handler::ZipArchiveCache,
    index_cache: &Arc<ArchiveIndexCache>,
    blob_registry: &Arc<BlobRegistry>,
    archive_path: &Path,
) -> Result<(String, Option<String>), String> {
    // 查找首图路径
    let inner_path = match find_first_image_entry(archive_path)? {
        Some(path) => path,
        None => return Err("压缩包中没有图片".to_string()),
    };

    // 提取图片数据
    let image_data = extract_file(archive_cache, index_cache, archive_path, &inner_path)?;
    let mime_type = detect_image_mime_type(&inner_path);

    // 注册到 BlobRegistry
    let blob_url = blob_registry.get_or_register(
        &image_data,
        mime_type,
        Duration::from_secs(600), // 10分钟 TTL
        Some(format!("{}::{}", archive_path.display(), inner_path)), // 传递路径用于日志
    );

    println!(
        "🎯 首图 blob 注册完成: {} -> {} bytes (inner: {})",
        archive_path.display(),
        image_data.len(),
        inner_path
    );

    Ok((blob_url, Some(inner_path)))
}

/// 获取首图 blob URL（带缓存）
pub fn get_first_image_blob(
    archive_cache: &zip_handler::ZipArchiveCache,
    index_cache: &Arc<ArchiveIndexCache>,
    blob_registry: &Arc<BlobRegistry>,
    archive_path: &Path,
) -> Result<String, String> {
    let (blob_url, _) = get_first_image_blob_or_scan(archive_cache, index_cache, blob_registry, archive_path)?;
    Ok(blob_url)
}

/// 获取首图原始字节数据
pub fn get_first_image_bytes(
    archive_cache: &zip_handler::ZipArchiveCache,
    index_cache: &Arc<ArchiveIndexCache>,
    archive_path: &Path,
) -> Result<(Vec<u8>, Option<String>, ArchiveMetadata), String> {
    let metadata = get_archive_metadata(archive_path)?;

    // 查找首图路径
    let inner_path = match find_first_image_entry(archive_path)? {
        Some(path) => path,
        None => return Err("压缩包中没有图片".to_string()),
    };

    // 提取图片数据
    let image_data = extract_file(archive_cache, index_cache, archive_path, &inner_path)?;

    Ok((image_data, Some(inner_path), metadata))
}

// ============================================================================
// 缓存辅助函数
// ============================================================================

fn get_cached_image(
    cache: &Arc<std::sync::Mutex<std::collections::HashMap<String, super::types::CachedImageEntry>>>,
    key: &str,
) -> Option<Vec<u8>> {
    if let Ok(mut cache) = cache.lock() {
        if let Some(entry) = cache.get_mut(key) {
            entry.last_used = std::time::Instant::now();
            return Some(entry.data.clone());
        }
    }
    None
}

fn store_cached_image(
    cache: &Arc<std::sync::Mutex<std::collections::HashMap<String, super::types::CachedImageEntry>>>,
    key: String,
    data: Vec<u8>,
) {
    use super::types::IMAGE_CACHE_LIMIT;
    
    if let Ok(mut cache) = cache.lock() {
        cache.insert(
            key,
            super::types::CachedImageEntry {
                data,
                last_used: std::time::Instant::now(),
            },
        );
        if cache.len() > IMAGE_CACHE_LIMIT {
            if let Some(oldest_key) = cache
                .iter()
                .min_by_key(|(_, entry)| entry.last_used)
                .map(|(k, _)| k.clone())
            {
                cache.remove(&oldest_key);
            }
        }
    }
}
