use super::blob_registry::BlobRegistry;
use chrono::{NaiveDate, NaiveDateTime, NaiveTime};
use image::GenericImageView;
use log::info;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{self, Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tempfile::NamedTempFile;
use zip::write::{FileOptions, SimpleFileOptions};
use zip::{ZipArchive, ZipWriter};

/// 压缩包格式类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArchiveFormat {
    Zip,
    Rar,
    SevenZ,
    Unknown,
}

impl ArchiveFormat {
    /// 根据文件扩展名判断格式
    pub fn from_extension(path: &Path) -> Self {
        if let Some(ext) = path.extension() {
            match ext.to_string_lossy().to_lowercase().as_str() {
                "zip" | "cbz" => ArchiveFormat::Zip,
                "rar" | "cbr" => ArchiveFormat::Rar,
                "7z" | "cb7" => ArchiveFormat::SevenZ,
                _ => ArchiveFormat::Unknown,
            }
        } else {
            ArchiveFormat::Unknown
        }
    }
    
    /// 检查格式是否受支持
    pub fn is_supported(&self) -> bool {
        matches!(self, ArchiveFormat::Zip | ArchiveFormat::Rar | ArchiveFormat::SevenZ)
    }
}

const IMAGE_CACHE_LIMIT: usize = 256;

#[derive(Clone)]
struct CachedImageEntry {
    data: Vec<u8>,
    last_used: Instant,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ArchiveMetadata {
    modified: u64,
    file_size: u64,
}

/// 压缩包内的文件项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub is_image: bool,
    pub entry_index: usize,
    pub modified: Option<i64>,
}

/// 压缩包管理器
pub struct ArchiveManager {
    /// 支持的图片格式
    image_extensions: Vec<String>,
    /// 图片缓存
    cache: Arc<std::sync::Mutex<std::collections::HashMap<String, CachedImageEntry>>>,
    /// 压缩包文件缓存（避免重复打开）
    archive_cache: Arc<
        std::sync::Mutex<
            std::collections::HashMap<String, Arc<std::sync::Mutex<ZipArchive<std::fs::File>>>>,
        >,
    >,

    /// Blob 注册表
    blob_registry: Arc<BlobRegistry>,
}

impl ArchiveManager {
    /// 创建新的压缩包管理器
    pub fn new() -> Self {
        Self {
            image_extensions: vec![
                "jpg".to_string(),
                "jpeg".to_string(),
                "png".to_string(),
                "gif".to_string(),
                "bmp".to_string(),
                "webp".to_string(),
                "avif".to_string(),
                "jxl".to_string(),
                "tiff".to_string(),
                "tif".to_string(),
            ],
            cache: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
            archive_cache: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),

            blob_registry: Arc::new(BlobRegistry::new(512)),
        }
    }

    /// 创建使用共享 BlobRegistry 的压缩包管理器
    pub fn with_shared_blob_registry(blob_registry: Arc<BlobRegistry>) -> Self {
        Self {
            image_extensions: vec![
                "jpg".to_string(),
                "jpeg".to_string(),
                "png".to_string(),
                "gif".to_string(),
                "bmp".to_string(),
                "webp".to_string(),
                "avif".to_string(),
                "jxl".to_string(),
                "tiff".to_string(),
                "tif".to_string(),
            ],
            cache: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
            archive_cache: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),

            blob_registry,
        }
    }

    /// 创建带自定义 blob 缓存大小的压缩包管理器
    pub fn with_blob_cache_size(blob_cache_size: usize) -> Self {
        Self {
            image_extensions: vec![
                "jpg".to_string(),
                "jpeg".to_string(),
                "png".to_string(),
                "gif".to_string(),
                "bmp".to_string(),
                "webp".to_string(),
                "avif".to_string(),
                "jxl".to_string(),
                "tiff".to_string(),
                "tif".to_string(),
            ],
            cache: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
            archive_cache: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),

            blob_registry: Arc::new(BlobRegistry::new(blob_cache_size)),
        }
    }

    /// 获取或创建压缩包缓存
    pub fn get_cached_archive(
        &self,
        archive_path: &Path,
    ) -> Result<Arc<std::sync::Mutex<ZipArchive<std::fs::File>>>, String> {
        // 规范化缓存键，统一使用正斜杠，避免 Windows 上的 "\\""/" 差异导致命中失败
        let path_str = Self::normalize_archive_key(archive_path);

        // 检查缓存
        {
            let cache = self.archive_cache.lock().unwrap();
            if let Some(archive) = cache.get(&path_str) {
                return Ok(Arc::clone(archive));
            }
        }

        // 创建新的压缩包实例
        let file = File::open(archive_path).map_err(|e| format!("打开压缩包失败: {}", e))?;

        let archive = ZipArchive::new(file).map_err(|e| format!("读取压缩包失败: {}", e))?;

        let cached = Arc::new(std::sync::Mutex::new(archive));

        // 添加到缓存
        {
            let mut cache = self.archive_cache.lock().unwrap();
            cache.insert(path_str, Arc::clone(&cached));
        }

        Ok(cached)
    }

    /// 检查是否为图片文件
    fn is_image_file(&self, path: &str) -> bool {
        if let Some(ext) = Path::new(path).extension() {
            let ext = ext.to_string_lossy().to_lowercase();
            self.image_extensions.contains(&ext)
        } else {
            false
        }
    }

    /// 读取压缩包内容列表（自动检测格式）
    pub fn list_contents(&self, archive_path: &Path) -> Result<Vec<ArchiveEntry>, String> {
        let format = ArchiveFormat::from_extension(archive_path);
        match format {
            ArchiveFormat::Zip => self.list_zip_contents(archive_path),
            ArchiveFormat::Rar => self.list_rar_contents(archive_path),
            ArchiveFormat::SevenZ => self.list_7z_contents(archive_path),
            ArchiveFormat::Unknown => Err(format!(
                "不支持的压缩包格式: {}",
                archive_path.display()
            )),
        }
    }

    /// 读取 ZIP 压缩包内容列表
    pub fn list_zip_contents(&self, archive_path: &Path) -> Result<Vec<ArchiveEntry>, String> {
        println!(
            "📦 ArchiveManager::list_zip_contents start: {}",
            archive_path.display()
        );
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
            let is_image = !is_dir && self.is_image_file(&name);
            let modified = Self::zip_datetime_to_unix(file.last_modified());

            entries.push(ArchiveEntry {
                name: name.clone(),
                path: name,
                size,
                is_dir,
                is_image,
                entry_index: i,
                modified,
            });
        }

        println!(
            "📦 ArchiveManager::list_zip_contents end: {} entries",
            entries.len()
        );

        // 排序：目录优先，然后按名称
        entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });

        Ok(entries)
    }
    
    /// 读取 RAR 压缩包内容列表
    pub fn list_rar_contents(&self, archive_path: &Path) -> Result<Vec<ArchiveEntry>, String> {
        println!(
            "📦 ArchiveManager::list_rar_contents start: {}",
            archive_path.display()
        );
        
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
            let is_image = !is_dir && self.is_image_file(&name);
            
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
                entry_index: index,
                modified,
            });
            index += 1;
        }
        
        println!(
            "📦 ArchiveManager::list_rar_contents end: {} entries",
            entries.len()
        );
        
        // 排序：目录优先，然后按名称
        entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });
        
        Ok(entries)
    }
    
    /// 读取 7z 压缩包内容列表
    pub fn list_7z_contents(&self, archive_path: &Path) -> Result<Vec<ArchiveEntry>, String> {
        println!(
            "📦 ArchiveManager::list_7z_contents start: {}",
            archive_path.display()
        );
        
        let mut archive = sevenz_rust::SevenZReader::open(archive_path, "".into())
            .map_err(|e| format!("打开 7z 压缩包失败: {}", e))?;
        
        let mut entries = Vec::new();
        
        for (index, entry) in archive.archive().files.iter().enumerate() {
            let name = entry.name().to_string();
            let is_dir = entry.is_directory();
            let size = entry.size();
            let is_image = !is_dir && self.is_image_file(&name);
            
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
                entry_index: index,
                modified,
            });
        }
        
        println!(
            "📦 ArchiveManager::list_7z_contents end: {} entries",
            entries.len()
        );
        
        // 排序：目录优先，然后按名称
        entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });
        
        Ok(entries)
    }

    /// 从 ZIP 压缩包中提取文件内容（优化版本，使用缓存的压缩包实例）
    pub fn extract_file_from_zip(
        &self,
        archive_path: &Path,
        file_path: &str,
    ) -> Result<Vec<u8>, String> {
        info!(
            "📦 extract_file_from_zip start: archive={} inner={}",
            archive_path.display(),
            file_path
        );

        // 使用缓存的压缩包实例
        let cached_archive = self.get_cached_archive(archive_path)?;
        let mut archive = cached_archive.lock().unwrap();

        let mut zip_file = archive
            .by_name(file_path)
            .map_err(|e| format!("在压缩包中找不到文件: {}", e))?;

        let mut buffer = Vec::new();
        let start = Instant::now();
        zip_file
            .read_to_end(&mut buffer)
            .map_err(|e| format!("读取文件失败: {}", e))?;

        let elapsed = start.elapsed();
        // try to get compressed size if available
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

    /// 从压缩包中提取文件（统一接口，自动检测格式）
    pub fn extract_file(&self, archive_path: &Path, file_path: &str) -> Result<Vec<u8>, String> {
        let format = ArchiveFormat::from_extension(archive_path);
        match format {
            ArchiveFormat::Zip => self.extract_file_from_zip(archive_path, file_path),
            ArchiveFormat::Rar => self.extract_file_from_rar(archive_path, file_path),
            ArchiveFormat::SevenZ => self.extract_file_from_7z(archive_path, file_path),
            ArchiveFormat::Unknown => Err(format!(
                "不支持的压缩包格式: {}",
                archive_path.display()
            )),
        }
    }
    
    /// 从 RAR 压缩包中提取文件内容
    pub fn extract_file_from_rar(
        &self,
        archive_path: &Path,
        file_path: &str,
    ) -> Result<Vec<u8>, String> {
        info!(
            "📦 extract_file_from_rar start: archive={} inner={}",
            archive_path.display(),
            file_path
        );
        
        let start = Instant::now();
        
        // 创建临时目录用于解压
        let temp_dir = tempfile::tempdir()
            .map_err(|e| format!("创建临时目录失败: {}", e))?;
        
        // 规范化路径（RAR 可能使用反斜杠）
        let normalized_path = file_path.replace('\\', "/");
        
        // 打开 RAR 并解压指定文件
        let mut archive = unrar::Archive::new(archive_path)
            .open_for_processing()
            .map_err(|e| format!("打开 RAR 压缩包失败: {:?}", e))?;
        
        let mut found_data: Option<Vec<u8>> = None;
        
        while let Some(header) = archive.read_header()
            .map_err(|e| format!("读取 RAR 头失败: {:?}", e))? 
        {
            let entry_path = header.entry().filename.to_string_lossy().to_string();
            let entry_normalized = entry_path.replace('\\', "/");
            
            if entry_normalized == normalized_path || entry_path == file_path {
                // 找到目标文件，解压到临时目录
                let (data, _next) = header.read()
                    .map_err(|e| format!("读取 RAR 条目失败: {:?}", e))?;
                found_data = Some(data);
                break;
            } else {
                // 跳过其他文件
                archive = header.skip()
                    .map_err(|e| format!("跳过 RAR 条目失败: {:?}", e))?;
            }
        }
        
        let elapsed = start.elapsed();
        
        match found_data {
            Some(data) => {
                info!(
                    "📦 extract_file_from_rar end: read_bytes={} elapsed_ms={} archive={} inner={}",
                    data.len(),
                    elapsed.as_millis(),
                    archive_path.display(),
                    file_path
                );
                Ok(data)
            }
            None => Err(format!("在 RAR 压缩包中找不到文件: {}", file_path)),
        }
    }
    
    /// 从 7z 压缩包中提取文件内容
    pub fn extract_file_from_7z(
        &self,
        archive_path: &Path,
        file_path: &str,
    ) -> Result<Vec<u8>, String> {
        info!(
            "📦 extract_file_from_7z start: archive={} inner={}",
            archive_path.display(),
            file_path
        );
        
        let start = Instant::now();
        
        // 规范化路径
        let normalized_path = file_path.replace('\\', "/");
        
        let mut archive = sevenz_rust::SevenZReader::open(archive_path, "".into())
            .map_err(|e| format!("打开 7z 压缩包失败: {}", e))?;
        
        // 查找目标文件
        let target_entry = archive.archive().files.iter()
            .enumerate()
            .find(|(_, entry)| {
                let entry_path = entry.name().replace('\\', "/");
                entry_path == normalized_path || entry.name() == file_path
            });
        
        if let Some((_index, _)) = target_entry {
            let mut data = Vec::new();
            archive.for_each_entries(|entry, reader| {
                if entry.name().replace('\\', "/") == normalized_path || entry.name() == file_path {
                    reader.read_to_end(&mut data)?;
                }
                Ok(true)
            }).map_err(|e| format!("遍历 7z 条目失败: {}", e))?;
            
            let elapsed = start.elapsed();
            info!(
                "📦 extract_file_from_7z end: read_bytes={} elapsed_ms={} archive={} inner={}",
                data.len(),
                elapsed.as_millis(),
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

    pub fn delete_entry_from_zip(
        &self,
        archive_path: &Path,
        inner_path: &str,
    ) -> Result<(), String> {
        let normalized_target = Self::normalize_inner_path(inner_path);

        let parent_dir = archive_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."));

        let temp_file = NamedTempFile::new_in(&parent_dir)
            .map_err(|e| format!("创建临时文件失败: {}", e))?;
        let temp_writer = temp_file
            .reopen()
            .map_err(|e| format!("打开临时文件失败: {}", e))?;
        let mut zip_writer = ZipWriter::new(temp_writer);

        {
            let source_file = File::open(archive_path)
                .map_err(|e| format!("打开压缩包失败: {}", e))?;
            let mut archive = ZipArchive::new(source_file)
                .map_err(|e| format!("读取压缩包失败: {}", e))?;

            let mut found = false;
            for index in 0..archive.len() {
                let mut entry = archive
                    .by_index(index)
                    .map_err(|e| format!("读取压缩包条目失败: {}", e))?;
                let entry_name = entry.name().to_string();
                let normalized_name = Self::normalize_inner_path(&entry_name);

                if normalized_name == normalized_target {
                    found = true;
                    continue;
                }

                let last_modified = entry
                    .last_modified()
                    .unwrap_or_else(zip::DateTime::default);
                let mut options =
                    SimpleFileOptions::default().last_modified_time(last_modified);
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
        fs::remove_file(archive_path)
            .map_err(|e| format!("删除原压缩包失败: {}", e))?;
        temp_path
            .persist(archive_path)
            .map_err(|e| format!("替换压缩包失败: {}", e.error))?;

        self.evict_archive_cache(archive_path);

        Ok(())
    }

    /// 从压缩包中加载图片（返回二进制数据，支持 ZIP/RAR/7z）
    pub fn load_image_from_archive_binary(
        &self,
        archive_path: &Path,
        file_path: &str,
    ) -> Result<Vec<u8>, String> {
        let cache_key = format!(
            "{}::{}",
            Self::normalize_archive_key(archive_path),
            file_path
        );
        if let Some(cached) = self.get_cached_image(&cache_key) {
            println!(
                "🎯 Archive image cache hit: {} ({} bytes)",
                file_path,
                cached.len()
            );
            return Ok(cached);
        }

        // 使用 extract_file 自动检测格式
        let data = self.extract_file(archive_path, file_path)?;

        // 对于 JXL 格式，需要先解码再重新编码为通用格式
        if let Some(ext) = Path::new(file_path).extension() {
            if ext.to_string_lossy().to_lowercase() == "jxl" {
                let converted = self.load_jxl_binary_from_zip(&data)?;
                self.store_cached_image(cache_key, converted.clone());
                return Ok(converted);
            }
        }

        // 直接返回原始二进制数据
        self.store_cached_image(cache_key, data.clone());
        Ok(data)
    }

    /// 从压缩包中加载 JXL 图片并转换为 PNG（返回二进制数据）
    fn load_jxl_binary_from_zip(&self, image_data: &[u8]) -> Result<Vec<u8>, String> {
        use jxl_oxide::JxlImage;
        use std::io::Cursor;

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

    /// 从压缩包中加载 JXL 图片并转换为 PNG
    fn load_jxl_from_zip(&self, image_data: &[u8]) -> Result<Vec<u8>, String> {
        use jxl_oxide::JxlImage;
        use std::io::Cursor;

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

        // 根据通道数创建对应的图像
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

    /// 检测图片 MIME 类型
    fn detect_image_mime_type(&self, path: &str) -> &str {
        if let Some(ext) = Path::new(path).extension() {
            match ext.to_string_lossy().to_lowercase().as_str() {
                "jpg" | "jpeg" => "image/jpeg",
                "png" => "image/png",
                "gif" => "image/gif",
                "bmp" => "image/bmp",
                "webp" => "image/webp",
                "avif" => "image/avif",
                "jxl" => "image/jxl",
                "tiff" | "tif" => "image/tiff",
                _ => "application/octet-stream",
            }
        } else {
            "application/octet-stream"
        }
    }

    /// 获取压缩包中的所有图片路径（支持 ZIP/RAR/7z）
    pub fn get_images_from_archive(&self, archive_path: &Path) -> Result<Vec<String>, String> {
        let entries = self.list_contents(archive_path)?;

        let images: Vec<String> = entries
            .into_iter()
            .filter(|e| e.is_image)
            .map(|e| e.path)
            .collect();

        Ok(images)
    }

    /// 快速查找压缩包中的第一张图片（早停扫描）
    /// 找到第一张图片即返回，避免遍历全部条目
    pub fn find_first_image_entry(&self, archive_path: &Path) -> Result<Option<String>, String> {
        println!(
            "⚡ ArchiveManager::find_first_image_entry start: {}",
            archive_path.display()
        );

        self.scan_first_image_entry(archive_path)
    }

    fn scan_first_image_entry(&self, archive_path: &Path) -> Result<Option<String>, String> {
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

            if !self.is_image_file(&name) {
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

            if self.is_image_file(&name) {
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
        &self,
        archive_path: &Path,
        limit: usize,
    ) -> Result<Vec<String>, String> {
        println!(
            "⚡ ArchiveManager::scan_archive_images_fast start: {} limit={}",
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

            if !self.is_image_file(&name) {
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

            if self.is_image_file(&name) {
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

    /// 检查文件是否为支持的压缩包
    pub fn is_supported_archive(path: &Path) -> bool {
        if let Some(ext) = path.extension() {
            let ext = ext.to_string_lossy().to_lowercase();
            matches!(ext.as_str(), "zip" | "cbz")
        } else {
            false
        }
    }

    /// 等比例缩放图片
    fn resize_keep_aspect_ratio(
        &self,
        img: &image::DynamicImage,
        max_size: u32,
    ) -> image::DynamicImage {
        let (width, height) = img.dimensions();

        // 如果图片尺寸小于等于最大尺寸，直接返回
        if width <= max_size && height <= max_size {
            return img.clone();
        }

        // 计算缩放比例
        let scale = if width > height {
            max_size as f32 / width as f32
        } else {
            max_size as f32 / height as f32
        };

        let new_width = (width as f32 * scale).round() as u32;
        let new_height = (height as f32 * scale).round() as u32;

        // 使用 Lanczos3 滤波器获得更好的缩放质量
        img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3)
    }

    /// 编码为 WebP 格式（更高效）
    fn encode_webp(&self, img: &image::DynamicImage) -> Result<Vec<u8>, String> {
        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);

        // WebP 支持透明度，使用 RGBA8
        let rgba = img.to_rgba8();
        let (width, height) = rgba.dimensions();

        // 编码为 WebP，使用默认编码器（速度优化）
        image::write_buffer_with_format(
            &mut cursor,
            rgba.as_raw(),
            width,
            height,
            image::ColorType::Rgba8,
            image::ImageFormat::WebP,
        )
        .map_err(|e| format!("编码WebP失败: {}", e))?;

        Ok(buffer)
    }

    /// 编码为 JPEG 格式（保留用于兼容性）
    fn encode_jpeg(&self, img: &image::DynamicImage) -> Result<Vec<u8>, String> {
        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);

        // 转换为 RGB8（JPEG不支持透明度）
        let rgb = img.to_rgb8();
        let (width, height) = rgb.dimensions();

        // 编码为 JPEG
        image::write_buffer_with_format(
            &mut cursor,
            rgb.as_raw(),
            width,
            height,
            image::ColorType::Rgb8,
            image::ImageFormat::Jpeg,
        )
        .map_err(|e| format!("编码JPEG失败: {}", e))?;

        Ok(buffer)
    }

    /// 解码 JXL 图像（辅助方法）
    fn decode_jxl_image(&self, image_data: &[u8]) -> Result<image::DynamicImage, String> {
        use jxl_oxide::JxlImage;
        use std::io::Cursor;

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

        // 根据通道数创建对应的图像
        if channels == 1 {
            let gray_data: Vec<u8> = float_buf
                .iter()
                .map(|&v| (v.clamp(0.0, 1.0) * 255.0) as u8)
                .collect();

            let gray_img = image::GrayImage::from_raw(width, height, gray_data)
                .ok_or_else(|| "Failed to create gray image from JXL data".to_string())?;
            Ok(image::DynamicImage::ImageLuma8(gray_img))
        } else if channels == 3 {
            let rgb_data: Vec<u8> = float_buf
                .iter()
                .map(|&v| (v.clamp(0.0, 1.0) * 255.0) as u8)
                .collect();

            let rgb_img = image::RgbImage::from_raw(width, height, rgb_data)
                .ok_or_else(|| "Failed to create RGB image from JXL data".to_string())?;
            Ok(image::DynamicImage::ImageRgb8(rgb_img))
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
            Ok(image::DynamicImage::ImageRgba8(rgba_img))
        }
    }

    fn normalize_archive_key(path: &Path) -> String {
        path.to_string_lossy().replace('\\', "/")
    }

    fn normalize_inner_path(path: &str) -> String {
        path.replace('\\', "/")
    }

    fn evict_archive_cache(&self, archive_path: &Path) {
        let key = Self::normalize_archive_key(archive_path);
        if let Ok(mut cache) = self.archive_cache.lock() {
            cache.remove(&key);
        }

        if let Ok(mut image_cache) = self.cache.lock() {
            image_cache.retain(|entry_key, _| !entry_key.starts_with(&format!("{}::", key)));
        }
    }

    fn get_archive_metadata(&self, archive_path: &Path) -> Result<ArchiveMetadata, String> {
        let meta =
            fs::metadata(archive_path).map_err(|e| format!("获取压缩包元数据失败: {}", e))?;

        let modified = meta
            .modified()
            .unwrap_or(SystemTime::UNIX_EPOCH)
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        Ok(ArchiveMetadata {
            modified,
            file_size: meta.len(),
        })
    }

    fn zip_datetime_to_unix(dt: Option<zip::DateTime>) -> Option<i64> {
        let dt = dt?;
        let date = NaiveDate::from_ymd_opt(dt.year() as i32, dt.month() as u32, dt.day() as u32)?;
        let time =
            NaiveTime::from_hms_opt(dt.hour() as u32, dt.minute() as u32, dt.second() as u32)?;
        let datetime = NaiveDateTime::new(date, time);
        Some(datetime.and_utc().timestamp())
    }

    /// 获取首图 blob 或扫描（返回 blob URL 和内部路径）
    pub fn get_first_image_blob_or_scan(
        &self,
        archive_path: &Path,
    ) -> Result<(String, Option<String>), String> {
        // 查找首图路径
        let inner_path = match self.find_first_image_entry(archive_path)? {
            Some(path) => path,
            None => return Err("压缩包中没有图片".to_string()),
        };

        // 提取图片数据
        let image_data = self.extract_file(archive_path, &inner_path)?;
        let mime_type = self.detect_image_mime_type(&inner_path);

        // 注册到 BlobRegistry
        let blob_url = self.blob_registry.get_or_register(
            &image_data,
            &mime_type,
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
    pub fn get_first_image_blob(&self, archive_path: &Path) -> Result<String, String> {
        let (blob_url, _) = self.get_first_image_blob_or_scan(archive_path)?;
        Ok(blob_url)
    }

    /// 获取首图原始字节数据
    pub fn get_first_image_bytes(
        &self,
        archive_path: &Path,
    ) -> Result<(Vec<u8>, Option<String>, ArchiveMetadata), String> {
        let metadata = self.get_archive_metadata(archive_path)?;

        // 查找首图路径
        let inner_path = match self.find_first_image_entry(archive_path)? {
            Some(path) => path,
            None => return Err("压缩包中没有图片".to_string()),
        };

        // 提取图片数据
        let image_data = self.extract_file(archive_path, &inner_path)?;

        Ok((image_data, Some(inner_path), metadata))
    }

    fn get_cached_image(&self, key: &str) -> Option<Vec<u8>> {
        if let Ok(mut cache) = self.cache.lock() {
            if let Some(entry) = cache.get_mut(key) {
                entry.last_used = Instant::now();
                return Some(entry.data.clone());
            }
        }
        None
    }

    fn store_cached_image(&self, key: String, data: Vec<u8>) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.insert(
                key,
                CachedImageEntry {
                    data,
                    last_used: Instant::now(),
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

    /// 获取 BlobRegistry 引用
    pub fn blob_registry(&self) -> &Arc<BlobRegistry> {
        &self.blob_registry
    }
}

impl Default for ArchiveManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ArchiveManager {
    /// 清除缓存
    pub fn clear_cache(&self) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.clear();
        }
        if let Ok(mut archive_cache) = self.archive_cache.lock() {
            archive_cache.clear();
        }
    }

    /// 限制缓存大小（保留最近使用的项）
    pub fn limit_cache_size(&self, max_items: usize) {
        // 限制图片缓存
        if let Ok(mut cache) = self.cache.lock() {
            if cache.len() > max_items {
                // 简单策略：移除一半的条目
                let keys_to_remove: Vec<_> = cache.keys().take(cache.len() / 2).cloned().collect();
                for key in keys_to_remove {
                    cache.remove(&key);
                }
            }
        }

        // 限制压缩包缓存
        if let Ok(mut archive_cache) = self.archive_cache.lock() {
            if archive_cache.len() > 5 {
                // 压缩包实例通常较大，限制更严格
                let keys_to_remove: Vec<_> = archive_cache
                    .keys()
                    .take(archive_cache.len() / 2)
                    .cloned()
                    .collect();
                for key in keys_to_remove {
                    archive_cache.remove(&key);
                }
            }
        }
    }

    /// 预加载压缩包中的所有图片（支持 ZIP/RAR/7z）
    pub fn preload_all_images(&self, archive_path: &Path) -> Result<usize, String> {
        let entries = self.list_contents(archive_path)?;
        let image_entries: Vec<_> = entries.iter().filter(|e| e.is_image).collect();

        let mut loaded_count = 0;
        for entry in image_entries {
            if self
                .load_image_from_archive_binary(archive_path, &entry.path)
                .is_ok()
            {
                loaded_count += 1;
            }
        }

        Ok(loaded_count)
    }

    /// 从 ZIP 压缩包中流式提取文件
    pub fn extract_file_stream(
        &self,
        archive_path: &Path,
        file_path: &str,
    ) -> Result<impl Read + Send, String> {
        use std::thread;

        // 获取缓存的压缩包实例
        let cached_archive = self.get_cached_archive(archive_path)?;
        let _archive_path = archive_path.to_path_buf();
        let file_path = file_path.to_string();

        // 创建通道用于流式传输
        let (tx, rx) = std::sync::mpsc::channel::<Result<Vec<u8>, String>>();

        // 在新线程中处理读取
        thread::spawn(move || {
            let archive_result = {
                let mut archive = cached_archive.lock().unwrap();
                archive.by_name(&file_path).map(|zip_file| {
                    // 将 ZipFile 的数据复制到 Vec<u8> 中
                    let mut data = Vec::new();
                    let mut zip_file = zip_file;
                    std::io::copy(&mut zip_file, &mut data).map(|_| data)
                })
            };

            match archive_result {
                Ok(Ok(data)) => {
                    // 分块发送数据
                    let mut pos = 0;
                    while pos < data.len() {
                        let chunk_size = std::cmp::min(64 * 1024, data.len() - pos);
                        let chunk = data[pos..pos + chunk_size].to_vec();
                        if tx.send(Ok(chunk)).is_err() {
                            break; // 接收端已关闭
                        }
                        pos += chunk_size;
                    }
                }
                Ok(Err(e)) => {
                    let _ = tx.send(Err(format!("读取失败: {}", e)));
                }
                Err(e) => {
                    let _ = tx.send(Err(format!("找不到文件: {}", e)));
                }
            }
        });

        // 返回一个实现 Read 的迭代器
        Ok(StreamReader::new(rx))
    }
}

/// 流式读取器
struct StreamReader {
    receiver: std::sync::mpsc::Receiver<Result<Vec<u8>, String>>,
    buffer: Vec<u8>,
    position: usize,
}

impl StreamReader {
    fn new(receiver: std::sync::mpsc::Receiver<Result<Vec<u8>, String>>) -> Self {
        Self {
            receiver,
            buffer: Vec::new(),
            position: 0,
        }
    }
}

impl Read for StreamReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        // 如果当前缓冲区还有数据，先返回
        if self.position < self.buffer.len() {
            let remaining = self.buffer.len() - self.position;
            let to_copy = std::cmp::min(remaining, buf.len());
            buf[..to_copy].copy_from_slice(&self.buffer[self.position..self.position + to_copy]);
            self.position += to_copy;
            return Ok(to_copy);
        }

        // 获取下一块数据
        match self.receiver.recv() {
            Ok(Ok(chunk)) => {
                self.buffer = chunk;
                self.position = 0;

                // 递归调用以返回新数据
                self.read(buf)
            }
            Ok(Err(e)) => Err(std::io::Error::new(std::io::ErrorKind::Other, e)),
            Err(_) => {
                // 通道关闭，表示 EOF
                Ok(0)
            }
        }
    }
}
