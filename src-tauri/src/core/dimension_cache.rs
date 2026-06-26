//! 页面尺寸缓存模块
//!
//! 持久化存储页面尺寸信息，避免重复扫描

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// 尺寸缓存条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DimensionEntry {
    pub width: u32,
    pub height: u32,
    /// 文件修改时间（用于缓存失效）
    pub modified: Option<i64>,
}

/// 页面尺寸缓存
/// 使用 stable_hash 作为键，持久化到 JSON 文件
pub struct DimensionCache {
    /// 内存缓存: stable_hash -> DimensionEntry
    entries: HashMap<String, DimensionEntry>,
    /// 缓存文件路径
    cache_path: PathBuf,
    /// 是否有未保存的更改
    dirty: bool,
}

impl DimensionCache {
    /// 创建新的缓存实例
    pub fn new(cache_path: PathBuf) -> Self {
        let mut cache = Self {
            entries: HashMap::new(),
            cache_path,
            dirty: false,
        };
        // 尝试加载已有缓存
        cache.load_from_file();
        cache
    }

    /// 创建内存缓存（用于测试）
    #[allow(dead_code)]
    pub fn new_in_memory() -> Self {
        Self {
            entries: HashMap::new(),
            cache_path: PathBuf::new(),
            dirty: false,
        }
    }

    /// 获取缓存的尺寸
    /// 如果 modified 时间比缓存新，返回 None（需要重新扫描）
    pub fn get(&self, stable_hash: &str, modified: Option<i64>) -> Option<(u32, u32)> {
        if let Some(entry) = self.entries.get(stable_hash) {
            // 检查缓存是否过期
            if let (Some(cached_mod), Some(file_mod)) = (entry.modified, modified) {
                if file_mod > cached_mod {
                    // 文件已更新，缓存失效
                    return None;
                }
            }
            Some((entry.width, entry.height))
        } else {
            None
        }
    }

    /// 设置尺寸
    pub fn set(&mut self, stable_hash: &str, width: u32, height: u32, modified: Option<i64>) {
        self.entries.insert(
            stable_hash.to_string(),
            DimensionEntry {
                width,
                height,
                modified,
            },
        );
        self.dirty = true;
    }

    /// 批量设置尺寸
    pub fn set_batch(&mut self, entries: Vec<(String, u32, u32, Option<i64>)>) {
        for (hash, width, height, modified) in entries {
            self.entries.insert(
                hash,
                DimensionEntry {
                    width,
                    height,
                    modified,
                },
            );
        }
        self.dirty = true;
    }

    /// 保存到文件
    pub fn save(&mut self) -> Result<(), String> {
        if !self.dirty || self.cache_path.as_os_str().is_empty() {
            return Ok(());
        }

        // 确保父目录存在
        if let Some(parent) = self.cache_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建缓存目录失败: {e}"))?;
        }

        let json =
            serde_json::to_string(&self.entries).map_err(|e| format!("序列化缓存失败: {e}"))?;

        fs::write(&self.cache_path, json).map_err(|e| format!("写入缓存文件失败: {e}"))?;

        self.dirty = false;
        log::debug!(
            "💾 DimensionCache: 保存 {} 条记录到 {:?}",
            self.entries.len(),
            self.cache_path
        );
        Ok(())
    }

    /// 从文件加载
    fn load_from_file(&mut self) {
        if self.cache_path.as_os_str().is_empty() || !self.cache_path.exists() {
            return;
        }

        match fs::read_to_string(&self.cache_path) {
            Ok(json) => match serde_json::from_str::<HashMap<String, DimensionEntry>>(&json) {
                Ok(entries) => {
                    log::info!("📂 DimensionCache: 加载 {} 条缓存记录", entries.len());
                    self.entries = entries;
                }
                Err(e) => {
                    log::warn!("⚠️ DimensionCache: 解析缓存文件失败: {}, 将重新扫描", e);
                    self.entries.clear();
                }
            },
            Err(e) => {
                log::warn!("⚠️ DimensionCache: 读取缓存文件失败: {}", e);
            }
        }
    }

    /// 获取缓存条目数量
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// 检查缓存是否为空
    #[allow(dead_code)]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

impl Drop for DimensionCache {
    fn drop(&mut self) {
        // 析构时自动保存
        if let Err(e) = self.save() {
            log::error!("❌ DimensionCache: 保存失败: {}", e);
        }
    }
}
