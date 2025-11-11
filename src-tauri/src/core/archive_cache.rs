//! NeoView - Archive Image Cache
//! 压缩包图片缓存管理系统

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use rusqlite::{params, Connection, Result};
use chrono::{DateTime, Utc};
use crate::core::archive::ArchiveManager;

/// 缓存条目信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry {
    /// 压缩包路径
    pub archive_path: String,
    /// 压缩包内图片路径
    pub image_path: String,
    /// MD5 哈希值
    pub md5: String,
    /// 缓存文件路径（相对于缓存根目录）
    pub cache_path: String,
    /// 缩略图路径（相对于缓存根目录）
    pub thumb_path: Option<String>,
    /// 超分图路径（相对于缓存根目录）
    pub sr_path: Option<String>,
    /// 原始格式
    pub format: String,
    /// 文件大小
    pub size: u64,
    /// 创建时间
    pub created_at: DateTime<Utc>,
    /// 最后访问时间
    pub last_accessed: DateTime<Utc>,
    /// 访问次数
    pub access_count: u32,
}

/// 缓存统计信息
#[derive(Debug, Serialize, Deserialize)]
pub struct CacheStats {
    /// 总条目数
    pub total_entries: usize,
    /// 总文件大小（字节）
    pub total_size: u64,
    /// 缓存目录大小（字节）
    pub cache_size: u64,
    /// 最旧条目时间
    pub oldest_entry: Option<DateTime<Utc>>,
    /// 最新条目时间
    pub newest_entry: Option<DateTime<Utc>>,
}

/// 压缩包图片缓存管理器
pub struct ArchiveImageCache {
    /// 缓存根目录
    cache_root: PathBuf,
    /// 数据库连接
    conn: Connection,
    /// 内存缓存（压缩包路径 -> 图片列表）
    archive_index: Arc<Mutex<HashMap<String, Vec<String>>>>,
    /// 预加载队列
    preload_queue: Arc<Mutex<Vec<PreloadTask>>>,
    /// 最大缓存条目数
    max_entries: usize,
}

/// 预加载任务
#[derive(Debug, Clone)]
struct PreloadTask {
    archive_path: String,
    image_path: String,
    priority: i32, // 优先级，数字越小优先级越高
}

impl ArchiveImageCache {
    /// 创建新的缓存管理器
    pub fn new(cache_root: PathBuf, max_entries: usize) -> Result<Self, String> {
        // 确保缓存目录存在
        fs::create_dir_all(&cache_root)
            .map_err(|e| format!("创建缓存目录失败: {}", e))?;

        // 创建子目录
        let images_dir = cache_root.join("images");
        let thumbs_dir = cache_root.join("thumbs");
        let sr_dir = cache_root.join("sr");
        
        fs::create_dir_all(&images_dir)
            .map_err(|e| format!("创建图片缓存目录失败: {}", e))?;
        fs::create_dir_all(&thumbs_dir)
            .map_err(|e| format!("创建缩略图目录失败: {}", e))?;
        fs::create_dir_all(&sr_dir)
            .map_err(|e| format!("创建超分图目录失败: {}", e))?;

        // 初始化数据库
        let db_path = cache_root.join("cache.db");
        let conn = Connection::open(db_path)
            .map_err(|e| format!("打开缓存数据库失败: {}", e))?;

        // 创建表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS cache_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                archive_path TEXT NOT NULL,
                image_path TEXT NOT NULL,
                md5 TEXT NOT NULL UNIQUE,
                cache_path TEXT NOT NULL,
                thumb_path TEXT,
                sr_path TEXT,
                format TEXT NOT NULL,
                size INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                last_accessed TEXT NOT NULL,
                access_count INTEGER NOT NULL DEFAULT 1,
                UNIQUE(archive_path, image_path)
            )",
            [],
        ).map_err(|e| format!("创建数据库表失败: {}", e))?;

        Ok(Self {
            cache_root,
            conn,
            archive_index: Arc::new(Mutex::new(HashMap::new())),
            preload_queue: Arc::new(Mutex::new(Vec::new())),
            max_entries,
        })
    }

    /// 获取或创建缓存条目
    pub fn get_or_create(&mut self, archive_path: &str, image_path: &str) -> Result<CacheEntry, String> {
        let key = format!("{}::{}", archive_path, image_path);
        
        // 首先尝试从数据库获取
        if let Ok(Some(entry)) = self.get_from_db(archive_path, image_path) {
            // 更新访问信息
            self.update_access(&entry.md5)?;
            return Ok(entry);
        }

        // 如果不存在，创建新条目
        self.create_entry(archive_path, image_path)
    }

    /// 从数据库获取条目
    fn get_from_db(&self, archive_path: &str, image_path: &str) -> Result<Option<CacheEntry>, String> {
        let mut stmt = self.conn.prepare(
            "SELECT archive_path, image_path, md5, cache_path, thumb_path, sr_path, 
                    format, size, created_at, last_accessed, access_count 
             FROM cache_entries 
             WHERE archive_path = ? AND image_path = ?"
        ).map_err(|e| format!("准备查询失败: {}", e))?;

        let mut rows = stmt.query(params![archive_path, image_path])
            .map_err(|e| format!("执行查询失败: {}", e))?;

        if let Some(row) = rows.next().map_err(|e| format!("查询行失败: {}", e))? {
            Ok(Some(CacheEntry {
                archive_path: row.get(0).map_err(|e| format!("获取archive_path失败: {}", e))?,
                image_path: row.get(1).map_err(|e| format!("获取image_path失败: {}", e))?,
                md5: row.get(2).map_err(|e| format!("获取md5失败: {}", e))?,
                cache_path: row.get(3).map_err(|e| format!("获取cache_path失败: {}", e))?,
                thumb_path: row.get(4).map_err(|e| format!("获取thumb_path失败: {}", e))?,
                sr_path: row.get(5).map_err(|e| format!("获取sr_path失败: {}", e))?,
                format: row.get(6).map_err(|e| format!("获取format失败: {}", e))?,
                size: row.get(7).map_err(|e| format!("获取size失败: {}", e))?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(8).map_err(|e| format!("获取created_at失败: {}", e))?)
                    .map_err(|e| format!("解析创建时间失败: {}", e))?
                    .with_timezone(&Utc),
                last_accessed: DateTime::parse_from_rfc3339(&row.get::<_, String>(9).map_err(|e| format!("获取last_accessed失败: {}", e))?)
                    .map_err(|e| format!("解析访问时间失败: {}", e))?
                    .with_timezone(&Utc),
                access_count: row.get(10).map_err(|e| format!("获取access_count失败: {}", e))?,
            }))
        } else {
            Ok(None)
        }
    }

    /// 创建新的缓存条目
    fn create_entry(&mut self, archive_path: &str, image_path: &str) -> Result<CacheEntry, String> {
        // 提取图片数据
        let archive_manager = ArchiveManager::new();
        let image_data = archive_manager.extract_file(Path::new(archive_path), image_path)
            .map_err(|e| format!("提取图片失败: {}", e))?;

        // 计算 MD5
        let md5 = format!("{:x}", md5::compute(&image_data));

        // 确定输出格式（JXL 转换为 PNG）
        let original_ext = Path::new(image_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin");
        let output_format = if original_ext.to_lowercase() == "jxl" {
            "png"
        } else {
            original_ext
        };

        // 生成缓存文件路径
        let cache_filename = format!("{}.{}", md5, output_format);
        let cache_path = format!("images/{}", cache_filename);
        let full_cache_path = self.cache_root.join(&cache_path);

        // 保存图片文件
        fs::write(&full_cache_path, &image_data)
            .map_err(|e| format!("保存缓存文件失败: {}", e))?;

        // 创建数据库记录
        let now = Utc::now();
        let entry = CacheEntry {
            archive_path: archive_path.to_string(),
            image_path: image_path.to_string(),
            md5: md5.clone(),
            cache_path: cache_path.clone(),
            thumb_path: None, // 稍后生成
            sr_path: None,   // 稍后生成
            format: output_format.to_string(),
            size: image_data.len() as u64,
            created_at: now,
            last_accessed: now,
            access_count: 1,
        };

        // 插入数据库
        self.conn.execute(
            "INSERT INTO cache_entries 
             (archive_path, image_path, md5, cache_path, thumb_path, sr_path, 
              format, size, created_at, last_accessed, access_count)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                entry.archive_path,
                entry.image_path,
                entry.md5,
                entry.cache_path,
                entry.thumb_path,
                entry.sr_path,
                entry.format,
                entry.size,
                entry.created_at.to_rfc3339(),
                entry.last_accessed.to_rfc3339(),
                entry.access_count,
            ],
        ).map_err(|e| format!("插入数据库记录失败: {}", e))?;

        // 检查缓存大小限制
        self.check_cache_limit()?;

        Ok(entry)
    }

    /// 更新访问信息
    fn update_access(&self, md5: &str) -> Result<(), String> {
        let now = Utc::now();
        self.conn.execute(
            "UPDATE cache_entries 
             SET last_accessed = ?1, access_count = access_count + 1 
             WHERE md5 = ?2",
            params![now.to_rfc3339(), md5],
        ).map_err(|e| format!("更新访问信息失败: {}", e))?;
        Ok(())
    }

    /// 检查缓存大小限制
    fn check_cache_limit(&mut self) -> Result<(), String> {
        // 获取当前条目数
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM cache_entries",
            [],
            |row| row.get(0),
        ).map_err(|e| format!("查询缓存条目数失败: {}", e))?;

        // 如果超过限制，删除最旧的条目
        if count as usize > self.max_entries {
            let to_remove = count as usize - self.max_entries + 1; // 多删一个，避免频繁操作
            
            // 获取最旧的条目
            let mut stmt = self.conn.prepare(
                "SELECT md5, cache_path, thumb_path, sr_path 
                 FROM cache_entries 
                 ORDER BY last_accessed ASC 
                 LIMIT ?1"
            ).map_err(|e| format!("准备查询旧条目失败: {}", e))?;

            let rows = stmt.query_map([to_remove], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            }).map_err(|e| format!("查询旧条目失败: {}", e))?;

            // 删除文件和数据库记录
            for row in rows {
                let (md5, cache_path, thumb_path, sr_path) = row.map_err(|e| format!("获取行数据失败: {}", e))?;
                
                // 删除文件
                if let Some(path) = cache_path {
                    let full_path = self.cache_root.join(&path);
                    if full_path.exists() {
                        let _ = fs::remove_file(full_path);
                    }
                }
                if let Some(path) = thumb_path {
                    let full_path = self.cache_root.join(&path);
                    if full_path.exists() {
                        let _ = fs::remove_file(full_path);
                    }
                }
                if let Some(path) = sr_path {
                    let full_path = self.cache_root.join(&path);
                    if full_path.exists() {
                        let _ = fs::remove_file(full_path);
                    }
                }

                // 删除数据库记录
                let _ = self.conn.execute(
                    "DELETE FROM cache_entries WHERE md5 = ?1",
                    params![md5],
                );
            }
        }

        Ok(())
    }

    /// 生成缩略图
    pub fn generate_thumbnail(&mut self, md5: &str) -> Result<String, String> {
        // 获取条目信息
        let entry = self.get_by_md5(md5)?;
        
        // 如果已有缩略图，直接返回
        if let Some(thumb_path) = &entry.thumb_path {
            return Ok(thumb_path.clone());
        }

        // 生成缩略图路径
        let thumb_filename = format!("{}_thumb.webp", md5);
        let thumb_path = format!("thumbs/{}", thumb_filename);
        let full_thumb_path = self.cache_root.join(&thumb_path);
        let full_image_path = self.cache_root.join(&entry.cache_path);

        // 生成缩略图
        use image::{DynamicImage, ImageFormat};
        let img = image::open(&full_image_path)
            .map_err(|e| format!("打开图片失败: {}", e))?;

        // 调整大小
        let thumbnail = img.resize(256, 256, image::imageops::FilterType::Lanczos3);

        // 保存为 WebP
        thumbnail.save(&full_thumb_path)
            .map_err(|e| format!("保存缩略图失败: {}", e))?;

        // 更新数据库
        self.conn.execute(
            "UPDATE cache_entries SET thumb_path = ?1 WHERE md5 = ?2",
            params![thumb_path, md5],
        ).map_err(|e| format!("更新缩略图路径失败: {}", e))?;

        Ok(thumb_path)
    }

    /// 根据 MD5 获取条目
    fn get_by_md5(&self, md5: &str) -> Result<CacheEntry, String> {
        let mut stmt = self.conn.prepare(
            "SELECT archive_path, image_path, md5, cache_path, thumb_path, sr_path, 
                    format, size, created_at, last_accessed, access_count 
             FROM cache_entries 
             WHERE md5 = ?"
        ).map_err(|e| format!("准备查询失败: {}", e))?;

        let mut rows = stmt.query(params![md5])
            .map_err(|e| format!("执行查询失败: {}", e))?;

        if let Some(row) = rows.next().map_err(|e| format!("查询行失败: {}", e))? {
            Ok(CacheEntry {
                archive_path: row.get(0).map_err(|e| format!("获取archive_path失败: {}", e))?,
                image_path: row.get(1).map_err(|e| format!("获取image_path失败: {}", e))?,
                md5: row.get(2).map_err(|e| format!("获取md5失败: {}", e))?,
                cache_path: row.get(3).map_err(|e| format!("获取cache_path失败: {}", e))?,
                thumb_path: row.get(4).map_err(|e| format!("获取thumb_path失败: {}", e))?,
                sr_path: row.get(5).map_err(|e| format!("获取sr_path失败: {}", e))?,
                format: row.get(6).map_err(|e| format!("获取format失败: {}", e))?,
                size: row.get(7).map_err(|e| format!("获取size失败: {}", e))?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(8).map_err(|e| format!("获取created_at失败: {}", e))?)
                    .map_err(|e| format!("解析创建时间失败: {}", e))?
                    .with_timezone(&Utc),
                last_accessed: DateTime::parse_from_rfc3339(&row.get::<_, String>(9).map_err(|e| format!("获取last_accessed失败: {}", e))?)
                    .map_err(|e| format!("解析访问时间失败: {}", e))?
                    .with_timezone(&Utc),
                access_count: row.get(10).map_err(|e| format!("获取access_count失败: {}", e))?,
            })
        } else {
            Err(format!("未找到 MD5 为 {} 的条目", md5))
        }
    }

    /// 获取缓存统计信息
    pub fn get_stats(&self) -> Result<CacheStats, String> {
        let mut stmt = self.conn.prepare(
            "SELECT COUNT(*), SUM(size), MIN(created_at), MAX(created_at) 
             FROM cache_entries"
        ).map_err(|e| format!("准备统计查询失败: {}", e))?;

        let row = stmt.query_row([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, Option<i64>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        }).map_err(|e| format!("执行统计查询失败: {}", e))?;

        let (total_entries, total_size, oldest_str, newest_str) = row;

        // 计算缓存目录大小
        let cache_size = self.calculate_directory_size(&self.cache_root)?;

        // 解析时间
        let oldest_entry = oldest_str
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|dt| dt.with_timezone(&Utc));
        let newest_entry = newest_str
            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
            .map(|dt| dt.with_timezone(&Utc));

        Ok(CacheStats {
            total_entries: total_entries as usize,
            total_size: total_size.unwrap_or(0) as u64,
            cache_size,
            oldest_entry,
            newest_entry,
        })
    }

    /// 计算目录大小
    fn calculate_directory_size(&self, dir: &Path) -> Result<u64, String> {
        let mut total_size = 0u64;
        
        for entry in fs::read_dir(dir)
            .map_err(|e| format!("读取目录失败: {}", e))? {
            let entry = entry
                .map_err(|e| format!("读取条目失败: {}", e))?;
            let path = entry.path();
            
            if path.is_dir() {
                total_size += self.calculate_directory_size(&path)?;
            } else {
                total_size += entry.metadata()
                    .map_err(|e| format!("获取文件元数据失败: {}", e))?
                    .len();
            }
        }
        
        Ok(total_size)
    }

    /// 清空缓存
    pub fn clear_cache(&mut self) -> Result<usize, String> {
        // 删除所有文件
        if self.cache_root.exists() {
            fs::remove_dir_all(&self.cache_root)
                .map_err(|e| format!("删除缓存目录失败: {}", e))?;
            
            // 重新创建目录结构
            fs::create_dir_all(&self.cache_root)
                .map_err(|e| format!("创建缓存目录失败: {}", e))?;
            let images_dir = self.cache_root.join("images");
            let thumbs_dir = self.cache_root.join("thumbs");
            let sr_dir = self.cache_root.join("sr");
            
            fs::create_dir_all(&images_dir)
                .map_err(|e| format!("创建图片缓存目录失败: {}", e))?;
            fs::create_dir_all(&thumbs_dir)
                .map_err(|e| format!("创建缩略图目录失败: {}", e))?;
            fs::create_dir_all(&sr_dir)
                .map_err(|e| format!("创建超分图目录失败: {}", e))?;
        }

        // 清空数据库
        let removed_count = self.conn.execute("DELETE FROM cache_entries", [])
            .map_err(|e| format!("清空数据库失败: {}", e))?;

        Ok(removed_count as usize)
    }

    /// 获取缓存文件的完整路径
    pub fn get_full_cache_path(&self, cache_path: &str) -> PathBuf {
        self.cache_root.join(cache_path)
    }

    /// 设置最大缓存条目数
    pub fn set_max_entries(&mut self, max_entries: usize) {
        self.max_entries = max_entries;
        // 立即检查缓存限制
        let _ = self.check_cache_limit();
    }

    /// 获取压缩包中的所有图片路径
    pub fn get_archive_images(&mut self, archive_path: &str) -> Result<Vec<String>, String> {
        // 检查内存缓存
        if let Ok(index) = self.archive_index.lock() {
            if let Some(images) = index.get(archive_path) {
                return Ok(images.clone());
            }
        }

        // 从压缩包读取
        let archive_manager = ArchiveManager::new();
        let entries = archive_manager.list_zip_contents(Path::new(archive_path))
            .map_err(|e| format!("读取压缩包失败: {}", e))?;

        let mut images = Vec::new();
        for entry in entries {
            if !entry.is_dir && self.is_image_file(&entry.name) {
                images.push(entry.name);
            }
        }

        // 排序
        images.sort();

        // 更新内存缓存
        if let Ok(mut index) = self.archive_index.lock() {
            index.insert(archive_path.to_string(), images.clone());
        }

        Ok(images)
    }

    /// 检查是否为图片文件
    fn is_image_file(&self, path: &str) -> bool {
        if let Some(ext) = Path::new(path).extension() {
            let ext = ext.to_string_lossy().to_lowercase();
            matches!(
                ext.as_str(),
                "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "avif" | "jxl" | "tiff" | "tif"
            )
        } else {
            false
        }
    }
}