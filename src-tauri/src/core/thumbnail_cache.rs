//! NeoView - Thumbnail Cache
//! 缩略图缓存加载器 - 从数据库加载缩略图字节数据

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::RwLock;
use base64::{Engine as _, engine::general_purpose};
use crate::core::thumbnail_db::{ThumbnailDatabase, ThumbnailRecord};

/// 内存中的缩略图缓存项
#[derive(Debug, Clone)]
pub struct CachedThumbnail {
    /// Base64 编码的 WebP 数据 URL
    pub data_url: String,
    /// 缩略图宽度
    pub width: u32,
    /// 缩略图高度
    pub height: u32,
    /// 文件大小（字节）
    pub file_size: u64,
}

/// 缩略图缓存管理器
pub struct ThumbnailCacheManager {
    /// 数据库引用
    db: Arc<ThumbnailDatabase>,
    /// 内存缓存 - 存储已加载的缩略图
    cache: Arc<RwLock<HashMap<String, CachedThumbnail>>>,
    /// 最大缓存项数
    max_cache_size: usize,
}

impl ThumbnailCacheManager {
    /// 创建新的缓存管理器
    pub fn new(db: Arc<ThumbnailDatabase>, max_cache_size: usize) -> Self {
        Self {
            db,
            cache: Arc::new(RwLock::new(HashMap::new())),
            max_cache_size,
        }
    }

    /// 加载单个缩略图 - 先查内存缓存，再查数据库
    pub fn load_thumbnail(&self, bookpath: &str) -> Result<Option<CachedThumbnail>, String> {
        // 1. 检查内存缓存
        {
            let cache = self.cache.read().map_err(|e| format!("缓存锁错误: {}", e))?;
            if let Some(cached) = cache.get(bookpath) {
                return Ok(Some(cached.clone()));
            }
        }

        // 2. 从数据库加载
        match self.db.find_by_bookpath(bookpath) {
            Ok(Some(record)) => {
                let cached = self.record_to_cached_thumbnail(&record)?;
                
                // 添加到内存缓存
                {
                    let mut cache = self.cache.write().map_err(|e| format!("缓存锁错误: {}", e))?;
                    cache.insert(bookpath.to_string(), cached.clone());
                }
                
                Ok(Some(cached))
            }
            Ok(None) => Ok(None),
            Err(e) => Err(format!("数据库查询失败: {}", e)),
        }
    }

    /// 批量加载缩略图
    pub fn load_thumbnails_batch(
        &self,
        bookpaths: Vec<String>,
    ) -> Result<HashMap<String, CachedThumbnail>, String> {
        let mut results = HashMap::new();

        // 顺序加载（避免并发问题）
        for bookpath in bookpaths {
            if let Ok(Some(cached)) = self.load_thumbnail(&bookpath) {
                results.insert(bookpath, cached);
            }
        }

        Ok(results)
    }

    /// 保存缩略图到数据库
    pub fn save_thumbnail(&self, record: ThumbnailRecord) -> Result<(), String> {
        // 保存到数据库
        self.db
            .upsert_thumbnail(record.clone())
            .map_err(|e| format!("保存缩略图失败: {}", e))?;

        // 同时更新内存缓存
        let cached = self.record_to_cached_thumbnail(&record)?;
        {
            let mut cache = self.cache.write().map_err(|e| format!("缓存锁错误: {}", e))?;
            cache.insert(record.bookpath.clone(), cached);
        }

        Ok(())
    }

    /// 清空内存缓存
    pub fn clear_cache(&self) -> Result<(), String> {
        let mut cache = self.cache.write().map_err(|e| format!("缓存锁错误: {}", e))?;
        cache.clear();
        Ok(())
    }

    /// 获取缓存统计信息
    pub fn get_cache_stats(&self) -> Result<(usize, usize), String> {
        let cache = self.cache.read().map_err(|e| format!("缓存锁错误: {}", e))?;
        Ok((cache.len(), self.max_cache_size))
    }

    /// 将数据库记录转换为缓存项
    fn record_to_cached_thumbnail(&self, record: &ThumbnailRecord) -> Result<CachedThumbnail, String> {
        // 将 WebP 字节数据转换为 base64 data URL
        let base64_data = general_purpose::STANDARD.encode(&record.webp_data);
        let data_url = format!("data:image/webp;base64,{}", base64_data);

        Ok(CachedThumbnail {
            data_url,
            width: record.width,
            height: record.height,
            file_size: record.file_size,
        })
    }
}
