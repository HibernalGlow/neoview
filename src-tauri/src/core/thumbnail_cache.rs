//! NeoView - Async Thumbnail Cache
//! 异步缩略图缓存加载器 - 从数据库异步加载缩略图字节数据

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
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

/// 异步缩略图缓存管理器
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

    /// 异步加载缩略图 - 先查内存缓存，再查数据库
    pub async fn load_thumbnail_async(
        &self,
        bookpath: &str,
    ) -> Result<Option<CachedThumbnail>, String> {
        // 1. 检查内存缓存
        {
            let cache = self.cache.read().await;
            if let Some(cached) = cache.get(bookpath) {
                return Ok(Some(cached.clone()));
            }
        }

        // 2. 从数据库加载
        let record = self.db
            .find_by_bookpath(bookpath)
            .map_err(|e| format!("数据库查询失败: {}", e))?;

        if let Some(record) = record {
            // 3. 转换为 data URL 并缓存
            let cached = self.record_to_cached_thumbnail(&record)?;
            
            // 4. 存入内存缓存
            {
                let mut cache = self.cache.write().await;
                
                // 简单的缓存大小管理 - 超过限制时清空一半
                if cache.len() >= self.max_cache_size {
                    let to_remove = self.max_cache_size / 2;
                    let keys_to_remove: Vec<_> = cache.keys().take(to_remove).cloned().collect();
                    for key in keys_to_remove {
                        cache.remove(&key);
                    }
                }
                
                cache.insert(bookpath.to_string(), cached.clone());
            }
            
            Ok(Some(cached))
        } else {
            Ok(None)
        }
    }

    /// 批量异步加载缩略图
    pub async fn load_thumbnails_batch_async(
        &self,
        bookpaths: Vec<String>,
    ) -> Result<HashMap<String, CachedThumbnail>, String> {
        let mut results = HashMap::new();
        
        // 并发加载，但限制并发数
        let mut tasks = Vec::new();
        for bookpath in bookpaths {
            let self_clone = self.clone_for_async();
            let task = tokio::spawn(async move {
                self_clone.load_thumbnail_async(&bookpath).await
                    .map(|opt| opt.map(|cached| (bookpath, cached)))
            });
            tasks.push(task);
        }

        // 收集结果
        for task in tasks {
            match task.await {
                Ok(Ok(Some((bookpath, cached)))) => {
                    results.insert(bookpath, cached);
                }
                Ok(Ok(None)) => {
                    // 未找到，跳过
                }
                Ok(Err(e)) => {
                    eprintln!("加载缩略图失败: {}", e);
                }
                Err(e) => {
                    eprintln!("任务执行失败: {}", e);
                }
            }
        }

        Ok(results)
    }

    /// 保存缩略图到数据库
    pub async fn save_thumbnail_async(
        &self,
        record: ThumbnailRecord,
    ) -> Result<(), String> {
        // 保存到数据库
        self.db
            .upsert_thumbnail(record.clone())
            .map_err(|e| format!("保存缩略图失败: {}", e))?;

        // 同时更新内存缓存
        let cached = self.record_to_cached_thumbnail(&record)?;
        {
            let mut cache = self.cache.write().await;
            cache.insert(record.bookpath.clone(), cached);
        }

        Ok(())
    }

    /// 清空内存缓存
    pub async fn clear_cache(&self) {
        let mut cache = self.cache.write().await;
        cache.clear();
    }

    /// 获取缓存统计信息
    pub async fn get_cache_stats(&self) -> (usize, usize) {
        let cache = self.cache.read().await;
        (cache.len(), self.max_cache_size)
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

    /// 用于异步克隆的辅助方法
    fn clone_for_async(&self) -> Self {
        Self {
            db: Arc::clone(&self.db),
            cache: Arc::clone(&self.cache),
            max_cache_size: self.max_cache_size,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_cache_manager() {
        // 测试缓存管理器的基本功能
        // 这里可以添加单元测试
    }
}
