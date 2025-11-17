//! NeoView - File Indexer
//! 文件索引管理器，用于快速搜索文件

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use crate::core::fs_manager::FsItem;

/// 文件索引项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
    pub is_image: bool,
    pub parent_path: String,
    pub keywords: Vec<String>, // 用于搜索的关键词
}

/// 索引统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexStats {
    pub total_files: usize,
    pub total_dirs: usize,
    pub total_images: usize,
    pub last_updated: u64,
    pub indexed_paths: Vec<String>,
}

/// 索引进度信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexProgress {
    pub current_path: String,
    pub processed_files: usize,
    pub total_files: usize,
    pub is_running: bool,
}

/// 文件索引器
pub struct FileIndexer {
    /// 索引数据：路径 -> 索引项
    index: Arc<Mutex<HashMap<String, IndexEntry>>>,
    /// 关键词索引：关键词 -> 路径列表
    keyword_index: Arc<Mutex<HashMap<String, Vec<String>>>>,
    /// 索引统计
    stats: Arc<Mutex<IndexStats>>,
    /// 索引文件路径
    index_file_path: PathBuf,
    /// 索引进度
    progress: Arc<Mutex<IndexProgress>>,
}

impl FileIndexer {
    /// 创建新的文件索引器
    pub fn new() -> Self {
        let mut index_file_path = std::env::temp_dir();
        index_file_path.push("neoview");
        index_file_path.push("file_index.json");
        
        // 确保目录存在
        if let Some(parent) = index_file_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        Self {
            index: Arc::new(Mutex::new(HashMap::new())),
            keyword_index: Arc::new(Mutex::new(HashMap::new())),
            stats: Arc::new(Mutex::new(IndexStats {
                total_files: 0,
                total_dirs: 0,
                total_images: 0,
                last_updated: 0,
                indexed_paths: Vec::new(),
            })),
            index_file_path,
            progress: Arc::new(Mutex::new(IndexProgress {
                current_path: String::new(),
                processed_files: 0,
                total_files: 0,
                is_running: false,
            })),
        }
    }

    /// 从文件加载索引
    pub fn load_index(&self) -> Result<(), String> {
        if !self.index_file_path.exists() {
            return Ok(());
        }

        let content = fs::read_to_string(&self.index_file_path)
            .map_err(|e| format!("读取索引文件失败: {}", e))?;

        let saved_data: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("解析索引文件失败: {}", e))?;

        // 加载索引数据
        if let Some(index_data) = saved_data.get("index") {
            let index_map: HashMap<String, IndexEntry> = serde_json::from_value(index_data.clone())
                .map_err(|e| format!("解析索引数据失败: {}", e))?;
            
            if let Ok(mut index) = self.index.lock() {
                *index = index_map;
            }
        }

        // 加载关键词索引
        if let Some(keyword_data) = saved_data.get("keyword_index") {
            let keyword_map: HashMap<String, Vec<String>> = serde_json::from_value(keyword_data.clone())
                .map_err(|e| format!("解析关键词索引失败: {}", e))?;
            
            if let Ok(mut keyword_index) = self.keyword_index.lock() {
                *keyword_index = keyword_map;
            }
        }

        // 加载统计信息
        if let Some(stats_data) = saved_data.get("stats") {
            let stats: IndexStats = serde_json::from_value(stats_data.clone())
                .map_err(|e| format!("解析统计信息失败: {}", e))?;
            
            if let Ok(mut stats_guard) = self.stats.lock() {
                *stats_guard = stats;
            }
        }

        Ok(())
    }

    /// 保存索引到文件
    pub fn save_index(&self) -> Result<(), String> {
        let mut data = serde_json::Map::new();

        // 收集索引数据
        if let Ok(index) = self.index.lock() {
            data.insert("index".to_string(), serde_json::to_value(&*index).unwrap());
        }

        // 收集关键词索引
        if let Ok(keyword_index) = self.keyword_index.lock() {
            data.insert("keyword_index".to_string(), serde_json::to_value(&*keyword_index).unwrap());
        }

        // 收集统计信息
        if let Ok(stats) = self.stats.lock() {
            data.insert("stats".to_string(), serde_json::to_value(&*stats).unwrap());
        }

        let json_content = serde_json::to_string_pretty(&data)
            .map_err(|e| format!("序列化索引失败: {}", e))?;

        fs::write(&self.index_file_path, json_content)
            .map_err(|e| format!("写入索引文件失败: {}", e))?;

        Ok(())
    }

    /// 构建指定路径的索引
    pub fn build_index(&self, path: &Path, recursive: bool) -> Result<(), String> {
        if !path.exists() {
            return Err("路径不存在".to_string());
        }

        // 初始化进度
        if let Ok(mut progress) = self.progress.lock() {
            progress.current_path = path.to_string_lossy().to_string();
            progress.processed_files = 0;
            progress.total_files = 0;
            progress.is_running = true;
        }

        let mut new_index = HashMap::new();
        let mut new_keyword_index = HashMap::new();
        let mut stats = IndexStats {
            total_files: 0,
            total_dirs: 0,
            total_images: 0,
            last_updated: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            indexed_paths: Vec::new(),
        };

        // 开始索引
        let result = self.index_recursive(path, recursive, &mut new_index, &mut new_keyword_index, &mut stats);

        // 更新进度状态
        if let Ok(mut progress) = self.progress.lock() {
            progress.is_running = false;
        }

        // 如果成功，更新索引
        if result.is_ok() {
            if let Ok(mut index) = self.index.lock() {
                *index = new_index;
            }

            if let Ok(mut keyword_index) = self.keyword_index.lock() {
                *keyword_index = new_keyword_index;
            }

            if let Ok(mut stats_guard) = self.stats.lock() {
                *stats_guard = stats;
            }

            // 保存索引
            let _ = self.save_index();
        }

        result
    }

    /// 获取索引进度
    pub fn get_progress(&self) -> Result<IndexProgress, String> {
        if let Ok(progress) = self.progress.lock() {
            Ok(progress.clone())
        } else {
            Err("无法获取索引进度".to_string())
        }
    }

    /// 递归索引目录
    fn index_recursive(
        &self,
        path: &Path,
        recursive: bool,
        index: &mut HashMap<String, IndexEntry>,
        keyword_index: &mut HashMap<String, Vec<String>>,
        stats: &mut IndexStats,
    ) -> Result<(), String> {
        if !path.is_dir() {
            return Ok(());
        }

        stats.indexed_paths.push(path.to_string_lossy().to_string());

        let entries = fs::read_dir(path)
            .map_err(|e| format!("读取目录失败: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
            let entry_path = entry.path();

            // 跳过隐藏文件
            if let Some(name) = entry_path.file_name() {
                if name.to_string_lossy().starts_with('.') {
                    continue;
                }
            }

            let metadata = entry.metadata()
                .map_err(|e| format!("获取元数据失败: {}", e))?;

            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = metadata.is_dir();
            let size = if is_dir {
                fs::read_dir(&entry_path)
                    .map(|entries| entries.count() as u64)
                    .unwrap_or(0)
            } else {
                metadata.len()
            };
            let modified = metadata.modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            let is_image = !is_dir && Self::is_image_file(&entry_path);

            // 创建索引项
            let index_entry = IndexEntry {
                name: name.clone(),
                path: entry_path.to_string_lossy().to_string(),
                is_dir,
                size,
                modified,
                is_image,
                parent_path: path.to_string_lossy().to_string(),
                keywords: Self::generate_keywords(&name),
            };

            // 添加到索引
            index.insert(entry_path.to_string_lossy().to_string(), index_entry.clone());

            // 更新关键词索引
            for keyword in &index_entry.keywords {
                keyword_index
                    .entry(keyword.clone())
                    .or_insert_with(Vec::new)
                    .push(entry_path.to_string_lossy().to_string());
            }

            // 更新统计
            if is_dir {
                stats.total_dirs += 1;
            } else {
                stats.total_files += 1;
                if is_image {
                    stats.total_images += 1;
                }
            }

            // 更新进度
            if let Ok(mut progress) = self.progress.lock() {
                progress.current_path = entry_path.to_string_lossy().to_string();
                if !is_dir {
                    progress.processed_files += 1;
                }
                // 估算总文件数（简单实现）
                if progress.total_files == 0 && stats.total_files > 100 {
                    progress.total_files = stats.total_files * 2; // 粗略估算
                }
            }

            // 递归处理子目录
            if recursive && entry_path.is_dir() {
                self.index_recursive(&entry_path, true, index, keyword_index, stats)?;
            }
        }

        Ok(())
    }

    /// 搜索索引
    pub fn search(&self, query: &str, max_results: usize, options: Option<&SearchOptions>) -> Result<Vec<FsItem>, String> {
        if let Ok(index) = self.index.lock() {
            if let Ok(keyword_index) = self.keyword_index.lock() {
                let query_lower = query.to_lowercase();
                let mut results = Vec::new();
                let mut matched_paths = std::collections::HashSet::new();
                let default_options = SearchOptions::default();
                let search_options = options.unwrap_or(&default_options);

                // 首先查找完全匹配的路径
                for (path, entry) in index.iter() {
                    // 应用过滤条件
                    if !self.matches_search_options(entry, search_options) {
                        continue;
                    }

                    if entry.name.to_lowercase().contains(&query_lower) {
                        if matched_paths.insert(path.clone()) {
                            results.push(FsItem {
                                name: entry.name.clone(),
                                path: entry.path.clone(),
                                is_dir: entry.is_dir,
                                size: entry.size,
                                modified: Some(entry.modified),
                                created: None,
                                is_image: entry.is_image,
                            });
                        }
                    }
                }

                // 然后查找关键词匹配
                for keyword in keyword_index.keys() {
                    if keyword.contains(&query_lower) {
                        if let Some(paths) = keyword_index.get(keyword) {
                            for path in paths {
                                if matched_paths.insert(path.clone()) {
                                    if let Some(entry) = index.get(path) {
                                        // 再次应用过滤条件
                                        if !self.matches_search_options(entry, search_options) {
                                            continue;
                                        }
                                        
                                        results.push(FsItem {
                                            name: entry.name.clone(),
                                            path: entry.path.clone(),
                                            is_dir: entry.is_dir,
                                            size: entry.size,
                                            modified: Some(entry.modified),
                                            created: None,
                                            is_image: entry.is_image,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }

                // 排序结果
                results.sort_by(|a, b| {
                    match (a.is_dir, b.is_dir) {
                        (true, false) => std::cmp::Ordering::Less,
                        (false, true) => std::cmp::Ordering::Greater,
                        _ => {
                            let a_name = a.name.to_lowercase();
                            let b_name = b.name.to_lowercase();
                            
                            let a_exact = a_name == query_lower;
                            let b_exact = b_name == query_lower;
                            
                            match (a_exact, b_exact) {
                                (true, false) => std::cmp::Ordering::Less,
                                (false, true) => std::cmp::Ordering::Greater,
                                _ => {
                                    let a_prefix = a_name.starts_with(&query_lower);
                                    let b_prefix = b_name.starts_with(&query_lower);
                                    
                                    match (a_prefix, b_prefix) {
                                        (true, false) => std::cmp::Ordering::Less,
                                        (false, true) => std::cmp::Ordering::Greater,
                                        _ => a_name.cmp(&b_name),
                                    }
                                }
                            }
                        }
                    }
                });

                // 限制结果数量
                if results.len() > max_results {
                    results.truncate(max_results);
                }

                Ok(results)
            } else {
                Err("无法获取关键词索引锁".to_string())
            }
        } else {
            Err("无法获取索引锁".to_string())
        }
    }

    /// 检查条目是否匹配搜索选项
    fn matches_search_options(&self, entry: &IndexEntry, options: &SearchOptions) -> bool {
        // 文件类型过滤
        if options.images_only && !entry.is_image {
            return false;
        }
        if options.folders_only && !entry.is_dir {
            return false;
        }

        // 大小过滤
        if let Some(min_size) = options.min_size {
            if entry.size < min_size {
                return false;
            }
        }
        if let Some(max_size) = options.max_size {
            if entry.size > max_size {
                return false;
            }
        }

        // 修改时间过滤
        if let Some(after) = options.modified_after {
            if entry.modified < after {
                return false;
            }
        }
        if let Some(before) = options.modified_before {
            if entry.modified > before {
                return false;
            }
        }

        true
    }

    /// 获取索引中的路径列表
    pub fn get_indexed_paths(&self, parent_path: Option<&str>, recursive: bool) -> Result<Vec<String>, String> {
        if let Ok(index) = self.index.lock() {
            let mut paths = Vec::new();
            
            for (_path, entry) in index.iter() {
                // 如果指定了父路径，只返回该路径下的内容
                if let Some(parent) = parent_path {
                    if !entry.path.starts_with(parent) {
                        continue;
                    }
                    
                    // 如果不递归，只返回直接子项
                    if !recursive {
                        let relative_path = &entry.path[parent.len()..];
                        // 跳过父路径本身
                        if relative_path.is_empty() {
                            continue;
                        }
                        // 检查是否为直接子项（不包含额外的路径分隔符）
                        if relative_path.contains(['/', '\\']) && 
                           relative_path.matches(['/', '\\']).count() > 1 {
                            continue;
                        }
                    }
                }
                
                paths.push(entry.path.clone());
            }
            
            paths.sort();
            Ok(paths)
        } else {
            Err("无法获取索引锁".to_string())
        }
    }

    /// 检查路径是否已被索引
    pub fn is_path_indexed(&self, path: &str) -> Result<bool, String> {
        if let Ok(index) = self.index.lock() {
            Ok(index.contains_key(path))
        } else {
            Err("无法获取索引锁".to_string())
        }
    }

    /// 获取索引统计信息
    pub fn get_stats(&self) -> Result<IndexStats, String> {
        if let Ok(stats) = self.stats.lock() {
            Ok(stats.clone())
        } else {
            Err("无法获取统计信息".to_string())
        }
    }

    /// 清除索引
    pub fn clear_index(&self) -> Result<(), String> {
        if let Ok(mut index) = self.index.lock() {
            index.clear();
        }

        if let Ok(mut keyword_index) = self.keyword_index.lock() {
            keyword_index.clear();
        }

        if let Ok(mut stats) = self.stats.lock() {
            *stats = IndexStats {
                total_files: 0,
                total_dirs: 0,
                total_images: 0,
                last_updated: 0,
                indexed_paths: Vec::new(),
            };
        }

        // 删除索引文件
        if self.index_file_path.exists() {
            fs::remove_file(&self.index_file_path)
                .map_err(|e| format!("删除索引文件失败: {}", e))?;
        }

        Ok(())
    }

    /// 检查文件是否为图片
    fn is_image_file(path: &Path) -> bool {
        if let Some(ext) = path.extension() {
            let ext = ext.to_string_lossy().to_lowercase();
            matches!(
                ext.as_str(),
                "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "avif" | "jxl" | "tiff" | "tif"
            )
        } else {
            false
        }
    }

    /// 生成搜索关键词
    fn generate_keywords(name: &str) -> Vec<String> {
        let mut keywords = Vec::new();
        let name_lower = name.to_lowercase();

        // 添加完整名称
        keywords.push(name_lower.clone());

        // 按空格、下划线、连字符分割
        for part in name_lower.split(|c| c == ' ' || c == '_' || c == '-') {
            if !part.is_empty() {
                keywords.push(part.to_string());
            }
        }

        // 移除扩展名
        if let Some(dot_pos) = name_lower.rfind('.') {
            let name_without_ext = &name_lower[..dot_pos];
            keywords.push(name_without_ext.to_string());

            // 再次分割不带扩展名的名称
            for part in name_without_ext.split(|c| c == ' ' || c == '_' || c == '-') {
                if !part.is_empty() {
                    keywords.push(part.to_string());
                }
            }
        }

        // 去重
        keywords.sort();
        keywords.dedup();

        keywords
    }
}

/// 搜索选项
#[derive(Debug, Clone, Default)]
pub struct SearchOptions {
    /// 是否包含子文件夹
    pub include_subfolders: bool,
    /// 是否只搜索图片文件
    pub images_only: bool,
    /// 是否只搜索文件夹
    pub folders_only: bool,
    /// 文件大小过滤（最小字节数）
    pub min_size: Option<u64>,
    /// 文件大小过滤（最大字节数）
    pub max_size: Option<u64>,
    /// 修改时间过滤（开始时间戳）
    pub modified_after: Option<u64>,
    /// 修改时间过滤（结束时间戳）
    pub modified_before: Option<u64>,
}

impl Default for FileIndexer {
    fn default() -> Self {
        Self::new()
    }
}