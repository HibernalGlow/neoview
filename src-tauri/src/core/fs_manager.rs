use super::file_indexer::FileIndexer;
use super::video_exts;
use once_cell::sync::Lazy;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;
use trash;

/// 预编译的图片扩展名集合（O(1) 查找）
static IMAGE_EXTENSIONS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    [
        "jpg", "jpeg", "png", "gif", "bmp", "webp", "avif", "jxl", "tiff", "tif",
    ]
    .into_iter()
    .collect()
});

/// 预编译的压缩包扩展名集合
static ARCHIVE_EXTENSIONS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    ["zip", "cbz", "rar", "cbr", "7z", "cb7"]
        .into_iter()
        .collect()
});

/// 文件系统项（文件或目录）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<u64>,
    pub created: Option<u64>,
    pub is_image: bool,
    /// 文件夹内的子文件夹数量（仅对文件夹有效，不递归）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_count: Option<u32>,
    /// 文件夹内的图片文件数量（仅对文件夹有效，不递归）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_count: Option<u32>,
    /// 文件夹内的压缩包数量（仅对文件夹有效，不递归）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archive_count: Option<u32>,
    /// 文件夹内的视频文件数量（仅对文件夹有效，不递归）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_count: Option<u32>,
    /// 如果是链接文件（如 .lnk），这是解析后的目标路径
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_path: Option<String>,
}

/// 搜索选项
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    /// 是否包含子文件夹
    pub include_subfolders: Option<bool>,
    /// 最大结果数量
    pub max_results: Option<usize>,
    /// 是否在完整路径中搜索（而不仅仅是文件名）
    pub search_in_path: Option<bool>,
}

/// 子目录统计结果
#[derive(Default, Debug)]
pub struct FolderStats {
    pub total_bytes: u64,
    pub total_items: u32,
    pub folders: u32,
    pub images: u32,
    pub archives: u32,
    pub videos: u32,
}

/// 文件系统管理器
pub struct FsManager {
    /// 允许访问的根目录列表（安全检查）
    allowed_roots: Vec<PathBuf>,
    /// 文件索引器
    indexer: Arc<FileIndexer>,
}

impl FsManager {
    /// 创建新的文件系统管理器
    pub fn new() -> Self {
        Self {
            allowed_roots: Vec::new(),
            indexer: Arc::new(FileIndexer::new()),
        }
    }

    /// 添加允许访问的根目录
    pub fn add_allowed_root(&mut self, root: PathBuf) {
        if root.is_absolute() {
            self.allowed_roots.push(root);
        }
    }

    /// 验证路径是否在允许的根目录下（防止目录遍历攻击）
    pub fn validate_path(&self, path: &Path) -> Result<(), String> {
        let canonical = path
            .canonicalize()
            .map_err(|e| format!("无法解析路径: {}", e))?;

        // 如果没有限制，允许所有路径
        if self.allowed_roots.is_empty() {
            return Ok(());
        }

        // 检查是否在允许的根目录下
        for root in &self.allowed_roots {
            if let Ok(root_canonical) = root.canonicalize() {
                if canonical.starts_with(&root_canonical) {
                    return Ok(());
                }
            }
        }

        Err("路径不在允许的根目录下".to_string())
    }

    /// 读取目录内容（快速模式，不扫描子目录统计）
    pub fn read_directory(&self, path: &Path) -> Result<Vec<FsItem>, String> {
        self.read_directory_impl(path, false)
    }

    /// 读取目录内容（带子目录统计）
    pub fn read_directory_with_stats(&self, path: &Path) -> Result<Vec<FsItem>, String> {
        self.read_directory_impl(path, true)
    }

    /// 读取目录内容的内部实现
    /// `with_stats`: 是否扫描子目录统计（会显著增加 I/O）
    fn read_directory_impl(&self, path: &Path, with_stats: bool) -> Result<Vec<FsItem>, String> {
        // 安全验证
        self.validate_path(path)?;

        if !path.is_dir() {
            // 检查是否为 .lnk
            if let Some(target) = crate::utils::lnk_resolver::resolve_lnk(path) {
                if target.is_dir() {
                    return self.read_directory_impl(&target, with_stats);
                }
            }
            return Err("路径不是目录".to_string());
        }

        let entries = fs::read_dir(path).map_err(|e| format!("读取目录失败: {}", e))?;

        // 收集有效条目（优化：使用 OsStr 字节比较避免 String 转换）
        let valid_entries: Vec<_> = entries
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let entry_path = entry.path();

                // 优化：直接检查第一个字节是否为 '.'
                let name = entry_path.file_name()?;
                if name.as_encoded_bytes().first() == Some(&b'.') {
                    return None;
                }

                // 获取元数据
                let metadata = entry.metadata().ok()?;
                Some((entry, entry_path, metadata))
            })
            .collect();

        // 使用 rayon 并行处理条目
        let items: Vec<FsItem> = valid_entries
            .par_iter()
            .map(|(entry, entry_path, metadata)| {
                let name = entry.file_name().to_string_lossy().to_string();
                let mut target_path_str = None;
                let mut is_dir = metadata.is_dir();
                // 检查 .lnk
                // 注意：entry_path 是 PathBuf
                if !is_dir
                    && entry_path
                        .extension()
                        .map_or(false, |e| e.eq_ignore_ascii_case("lnk"))
                {
                    if let Some(target) = crate::utils::lnk_resolver::resolve_lnk(&entry_path) {
                        target_path_str = Some(target.to_string_lossy().to_string());
                        if target.is_dir() {
                            is_dir = true;
                        }
                    }
                }

                // 子目录统计
                let (size, folder_count, image_count, archive_count, video_count) = if is_dir {
                    if with_stats {
                        // 如果需要统计，则获取详细数据（包含大小和计数）
                        let stats = self.get_directory_stats(entry_path, false);
                        (
                            stats.total_bytes, // 在此处，由于不递归，这就是直接子文件的大小和
                            Some(stats.folders),
                            Some(stats.images),
                            Some(stats.archives),
                            Some(stats.videos),
                        )
                    } else {
                        // 快速模式：不统计
                        (0, None, None, None, None)
                    }
                } else {
                    (metadata.len(), None, None, None, None)
                };

                let modified = metadata
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs());
                let created = metadata
                    .created()
                    .ok()
                    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs());

                let is_image = !is_dir
                    && (Self::is_image_file(entry_path)
                        || target_path_str
                            .as_ref()
                            .map(|t| Self::is_image_file(Path::new(t)))
                            .unwrap_or(false));

                FsItem {
                    name,
                    path: entry_path.to_string_lossy().to_string(),
                    is_dir,
                    size,
                    modified,
                    created,
                    is_image,
                    folder_count,
                    image_count,
                    archive_count,
                    video_count,
                    target_path: target_path_str,
                }
            })
            .collect();

        // 排序：目录优先，然后按名称（使用并行自然排序，大量条目时更快）
        let mut sorted_items = items;
        sorted_items.par_sort_by(|a, b| match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => {
                let name_a = a.name.to_lowercase();
                let name_b = b.name.to_lowercase();
                natural_sort_rs::natural_cmp::<str, String>(&name_a, &name_b)
            }
        });

        Ok(sorted_items)
    }

    /// 快速统计目录内的项目数量和大小（优化版本）
    #[inline]
    fn get_directory_stats(&self, path: &Path, recursive_size: bool) -> FolderStats {
        let mut stats = FolderStats::default();

        if let Ok(sub_entries) = fs::read_dir(path) {
            for sub_entry in sub_entries.flatten() {
                // 优化：使用字节比较跳过隐藏文件
                let name = sub_entry.file_name();
                if name.as_encoded_bytes().first() == Some(&b'.') {
                    continue;
                }

                stats.total_items += 1;

                // 优化：使用 file_type() 代替 is_dir()，避免额外的 stat 调用
                if let Ok(ft) = sub_entry.file_type() {
                    if ft.is_dir() {
                        stats.folders += 1;
                        if recursive_size {
                            if let Ok(size) = self.calculate_directory_size(&sub_entry.path()) {
                                stats.total_bytes += size;
                            }
                        }
                    } else {
                        let sub_path = sub_entry.path();
                        if Self::is_image_file(&sub_path) {
                            stats.images += 1;
                        } else if Self::is_archive_file(&sub_path) {
                            stats.archives += 1;
                        } else if Self::is_video_file(&sub_path) {
                            stats.videos += 1;
                        }

                        // 累计文件大小
                        if let Ok(metadata) = sub_entry.metadata() {
                            stats.total_bytes += metadata.len();
                        }
                    }
                }
            }
        }

        stats
    }

    /// 计算目录的总大小
    fn calculate_directory_size(&self, path: &Path) -> Result<u64, String> {
        let mut total_size = 0u64;

        let entries = fs::read_dir(path).map_err(|e| format!("读取目录失败: {}", e))?;

        for entry in entries {
            if let Ok(entry) = entry {
                let entry_path = entry.path();

                // 跳过隐藏文件
                if let Some(name) = entry_path.file_name() {
                    if name.to_string_lossy().starts_with('.') {
                        continue;
                    }
                }

                if let Ok(metadata) = entry.metadata() {
                    if metadata.is_dir() {
                        // 递归计算子目录大小
                        total_size += self.calculate_directory_size(&entry_path).unwrap_or(0);
                    } else {
                        // 添加文件大小
                        total_size += metadata.len();
                    }
                }
            }
        }

        Ok(total_size)
    }

    /// 获取文件元数据
    pub fn get_file_metadata(&self, path: &Path) -> Result<FsItem, String> {
        self.get_file_metadata_impl(path, false)
    }

    /// 获取文件元数据（带统计信息）
    pub fn read_item_with_stats(&self, path: &Path) -> Result<FsItem, String> {
        self.get_file_metadata_impl(path, true)
    }

    /// 获取文件元数据的内部实现
    fn get_file_metadata_impl(&self, path: &Path, with_stats: bool) -> Result<FsItem, String> {
        // 安全验证
        self.validate_path(path)?;

        let metadata = fs::metadata(path).map_err(|e| format!("获取元数据失败: {}", e))?;

        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let mut is_dir = metadata.is_dir();
        let mut target_path_str = None;

        // 尝试解析 .lnk
        if !is_dir
            && path
                .extension()
                .map_or(false, |e| e.eq_ignore_ascii_case("lnk"))
        {
            if let Some(target) = crate::utils::lnk_resolver::resolve_lnk(path) {
                target_path_str = Some(target.to_string_lossy().to_string());
                if target.is_dir() {
                    is_dir = true;
                }
            }
        }

        let (size, folder_count, image_count, archive_count, video_count) = if is_dir {
            // 获取详细统计（递归计算大小，同时获取浅层计数）
            let stats = self.get_directory_stats(path, true);
            (
                stats.total_bytes,
                Some(stats.folders),
                Some(stats.images),
                Some(stats.archives),
                Some(stats.videos),
            )
        } else {
            (metadata.len(), None, None, None, None)
        };

        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());
        let created = metadata
            .created()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());

        let is_image = if !is_dir {
            Self::is_image_file(path)
                || target_path_str
                    .as_ref()
                    .map(|t| Self::is_image_file(Path::new(t)))
                    .unwrap_or(false)
        } else {
            false
        };

        Ok(FsItem {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            size,
            modified,
            created,
            is_image,
            folder_count,
            image_count,
            archive_count,
            video_count,
            target_path: target_path_str,
        })
    }

    /// 检查是否为图片文件（使用预编译 HashSet，O(1) 查找）
    pub fn is_image_file(path: &Path) -> bool {
        path.extension()
            .and_then(OsStr::to_str)
            .map(|ext| IMAGE_EXTENSIONS.contains(ext.to_ascii_lowercase().as_str()))
            .unwrap_or(false)
    }

    /// 检查是否为压缩包文件（使用预编译 HashSet，O(1) 查找）
    pub fn is_archive_file(path: &Path) -> bool {
        path.extension()
            .and_then(OsStr::to_str)
            .map(|ext| ARCHIVE_EXTENSIONS.contains(ext.to_ascii_lowercase().as_str()))
            .unwrap_or(false)
    }

    /// 检查是否为视频文件
    pub fn is_video_file(path: &Path) -> bool {
        video_exts::is_video_path(path)
    }

    /// 获取目录中的所有图片文件（递归）
    pub fn get_images_in_directory(
        &self,
        path: &Path,
        recursive: bool,
    ) -> Result<Vec<PathBuf>, String> {
        self.validate_path(path)?;

        let mut images = Vec::new();
        self.collect_images(path, recursive, &mut images)?;

        // 排序
        images.sort_by(|a, b| a.file_name().cmp(&b.file_name()));

        Ok(images)
    }

    /// 递归收集图片文件
    fn collect_images(
        &self,
        path: &Path,
        recursive: bool,
        images: &mut Vec<PathBuf>,
    ) -> Result<(), String> {
        if !path.is_dir() {
            return Ok(());
        }

        let entries = fs::read_dir(path).map_err(|e| format!("读取目录失败: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
            let entry_path = entry.path();

            // 跳过隐藏文件
            if let Some(name) = entry_path.file_name() {
                if name.to_string_lossy().starts_with('.') {
                    continue;
                }
            }

            if entry_path.is_file() && Self::is_image_file(&entry_path) {
                images.push(entry_path);
            } else if recursive && entry_path.is_dir() {
                self.collect_images(&entry_path, true, images)?;
            }
        }

        Ok(())
    }

    /// 创建目录
    pub fn create_directory(&self, path: &Path) -> Result<(), String> {
        // 验证父目录
        if let Some(parent) = path.parent() {
            self.validate_path(parent)?;
        }

        fs::create_dir_all(path).map_err(|e| format!("创建目录失败: {}", e))
    }

    /// 删除文件或目录
    pub fn delete(&self, path: &Path) -> Result<(), String> {
        self.validate_path(path)?;

        if path.is_dir() {
            fs::remove_dir_all(path).map_err(|e| format!("删除目录失败: {}", e))
        } else {
            fs::remove_file(path).map_err(|e| format!("删除文件失败: {}", e))
        }
    }

    /// 重命名文件或目录
    pub fn rename(&self, from: &Path, to: &Path) -> Result<(), String> {
        self.validate_path(from)?;

        // 验证目标路径的父目录
        if let Some(parent) = to.parent() {
            self.validate_path(parent)?;
        }

        fs::rename(from, to).map_err(|e| format!("重命名失败: {}", e))
    }

    /// 移动到回收站
    pub fn move_to_trash(&self, path: &Path) -> Result<(), String> {
        // 对于删除操作，只检查路径是否存在，不需要完整的 canonicalize 验证
        // 因为删除的目标文件可能包含特殊字符或即将被删除
        if !path.exists() {
            return Err(format!("文件不存在: {}", path.display()));
        }

        trash::delete(path).map_err(|e| format!("移动到回收站失败: {}", e))
    }

    /// 复制文件或目录
    pub fn copy(&self, from: &Path, to: &Path) -> Result<(), String> {
        self.validate_path(from)?;

        // 验证目标路径的父目录
        if let Some(parent) = to.parent() {
            self.validate_path(parent)?;
        }

        if from.is_file() {
            // 复制文件
            fs::copy(from, to).map_err(|e| format!("复制文件失败: {}", e))?;
            Ok(())
        } else if from.is_dir() {
            // 复制目录（递归）
            self.copy_directory(from, to)
        } else {
            Err("源路径不存在".to_string())
        }
    }

    /// 递归复制目录
    fn copy_directory(&self, from: &Path, to: &Path) -> Result<(), String> {
        // 创建目标目录
        fs::create_dir_all(to).map_err(|e| format!("创建目标目录失败: {}", e))?;

        // 读取源目录内容
        let entries = fs::read_dir(from).map_err(|e| format!("读取源目录失败: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
            let from_path = entry.path();
            let to_path = to.join(entry.file_name());

            if from_path.is_file() {
                // 复制文件
                fs::copy(&from_path, &to_path).map_err(|e| format!("复制文件失败: {}", e))?;
            } else if from_path.is_dir() {
                // 递归复制子目录
                self.copy_directory(&from_path, &to_path)?;
            }
        }

        Ok(())
    }

    /// 移动文件或目录
    pub fn move_item(&self, from: &Path, to: &Path) -> Result<(), String> {
        self.validate_path(from)?;

        // 验证目标路径的父目录
        if let Some(parent) = to.parent() {
            self.validate_path(parent)?;
        }

        // 尝试使用系统重命名（在同一文件系统上更快）
        if let Err(_) = fs::rename(from, to) {
            // 如果重命名失败（跨文件系统），则使用复制+删除
            self.copy(from, to)?;
            if from.is_file() {
                fs::remove_file(from).map_err(|e| format!("删除源文件失败: {}", e))?;
            } else {
                fs::remove_dir_all(from).map_err(|e| format!("删除源目录失败: {}", e))?;
            }
        }
        Ok(())
    }

    /// 搜索文件
    pub fn search_files(
        &self,
        path: &Path,
        query: &str,
        options: &SearchOptions,
    ) -> Result<Vec<FsItem>, String> {
        println!("🔍 [Rust Search] search_files called");
        println!("🔍 [Rust Search] path: {:?}", path);
        println!("🔍 [Rust Search] query: {:?}", query);
        println!("🔍 [Rust Search] options: {:?}", options);

        self.validate_path(path)?;

        let include_subfolders = options.include_subfolders.unwrap_or(false);
        let max_results = options.max_results.unwrap_or(1000);

        println!(
            "🔍 [Rust Search] include_subfolders: {}, max_results: {}",
            include_subfolders, max_results
        );

        // 尝试使用索引搜索（更快）
        if let Ok(has_index) = self.has_index() {
            println!("🔍 [Rust Search] has_index: {}", has_index);
            if has_index {
                // 使用索引搜索
                if let Ok(mut results) = self.search_with_index(query, max_results) {
                    println!(
                        "🔍 [Rust Search] Index search returned {} results",
                        results.len()
                    );

                    // 如果指定了路径，过滤结果
                    if path.to_string_lossy() != "/" {
                        let path_str = path.to_string_lossy();
                        results = results
                            .into_iter()
                            .filter(|item| item.path.starts_with(&*path_str))
                            .collect();
                        println!(
                            "🔍 [Rust Search] After path filter: {} results",
                            results.len()
                        );
                    }

                    // 如果不包含子文件夹，只返回当前目录的结果
                    if !include_subfolders {
                        results = results
                            .into_iter()
                            .filter(|item| {
                                let item_path = Path::new(&item.path);
                                if let Some(parent) = item_path.parent() {
                                    parent == path
                                } else {
                                    false
                                }
                            })
                            .collect();
                        println!(
                            "🔍 [Rust Search] After subfolder filter: {} results",
                            results.len()
                        );
                    }

                    println!("🔍 [Rust Search] Returning {} index results", results.len());
                    return Ok(results);
                }
            }
        }

        // 使用 rust_search 进行搜索
        println!("🔍 [Rust Search] Using rust_search fallback");

        let search_in_path = options.search_in_path.unwrap_or(false);
        println!("🔍 [Rust Search] search_in_path: {}", search_in_path);

        // rust_search 默认会搜索完整路径
        let mut search_builder = rust_search::SearchBuilder::default()
            .location(path)
            .search_input(query)
            .ignore_case()
            .hidden(); // 默认忽略隐藏文件

        println!(
            "🔍 [Rust Search] Search will match in {}",
            if search_in_path {
                "full path"
            } else {
                "file name only"
            }
        );

        if !include_subfolders {
            search_builder = search_builder.depth(1);
            println!("🔍 [Rust Search] Set depth to 1 (no subfolders)");
        } else {
            // 限制最大深度以防止无限循环或过深
            search_builder = search_builder.depth(20);
            println!("🔍 [Rust Search] Set depth to 20 (with subfolders)");
        }

        // rust_search 返回 Vec<String>
        println!("🔍 [Rust Search] Building search...");
        let paths: Vec<String> = search_builder.build().collect();
        println!(
            "🔍 [Rust Search] rust_search returned {} paths",
            paths.len()
        );

        let mut results = Vec::new();

        for p in paths {
            if results.len() >= max_results {
                break;
            }

            let path_buf = PathBuf::from(&p);
            // 获取元数据
            if let Ok(metadata) = fs::metadata(&path_buf) {
                let name = path_buf
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();

                // 根据 search_in_path 选项过滤结果
                let query_lower = query.to_lowercase();
                let matches = if search_in_path {
                    // 在完整路径中搜索
                    p.to_lowercase().contains(&query_lower)
                } else {
                    // 只在文件名中搜索
                    name.to_lowercase().contains(&query_lower)
                };

                if !matches {
                    continue;
                }

                let is_dir = metadata.is_dir();
                let size = if is_dir {
                    0 // 搜索时不计算目录大小以提高速度
                } else {
                    metadata.len()
                };

                let modified = metadata
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs());

                let created = metadata
                    .created()
                    .ok()
                    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs());

                let is_image = !is_dir && Self::is_image_file(&path_buf);

                let (folder_count, image_count, archive_count, video_count, final_size) = if is_dir
                {
                    let stats = self.get_directory_stats(&path_buf, false);
                    (
                        Some(stats.folders),
                        Some(stats.images),
                        Some(stats.archives),
                        Some(stats.videos),
                        stats.total_items as u64,
                    )
                } else {
                    (
                        None,
                        None,
                        None,
                        if Self::is_video_file(&path_buf) {
                            Some(1)
                        } else {
                            None
                        },
                        metadata.len(),
                    )
                };

                results.push(FsItem {
                    name,
                    path: p,
                    is_dir,
                    size: final_size,
                    modified,
                    created,
                    is_image,
                    folder_count,
                    image_count,
                    archive_count,
                    video_count,
                    target_path: None,
                });
            }
        }

        // 排序结果：目录优先，然后按匹配度
        results.sort_by(|a, b| {
            match (a.is_dir, b.is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => {
                    // 按名称匹配度排序：完全匹配 > 前缀匹配 > 包含匹配
                    let a_name = a.name.to_lowercase();
                    let b_name = b.name.to_lowercase();
                    let query_lower = query.to_lowercase();

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

        println!("🔍 [Rust Search] Returning {} total results", results.len());
        Ok(results)
    }

    /// 在单个目录中搜索
    fn search_directory(
        &self,
        path: &Path,
        query: &str,
        results: &mut Vec<FsItem>,
        max_results: usize,
    ) -> Result<(), String> {
        if !path.is_dir() {
            return Ok(());
        }

        let entries = fs::read_dir(path).map_err(|e| format!("读取目录失败: {}", e))?;

        for entry in entries {
            if results.len() >= max_results {
                break;
            }

            let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
            let entry_path = entry.path();

            // 跳过隐藏文件
            if let Some(name) = entry_path.file_name() {
                if name.to_string_lossy().starts_with('.') {
                    continue;
                }
            }

            let name = entry.file_name().to_string_lossy().to_string();

            // 检查名称是否匹配查询
            if name.to_lowercase().contains(query) {
                let metadata = entry
                    .metadata()
                    .map_err(|e| format!("获取元数据失败: {}", e))?;

                let is_dir = metadata.is_dir();
                let size = if is_dir {
                    fs::read_dir(&entry_path)
                        .map(|entries| entries.count() as u64)
                        .unwrap_or(0)
                } else {
                    metadata.len()
                };
                let modified = metadata
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs());
                let created = metadata
                    .created()
                    .ok()
                    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs());

                let is_image = !is_dir && Self::is_image_file(&entry_path);

                results.push(FsItem {
                    name,
                    path: entry_path.to_string_lossy().to_string(),
                    is_dir,
                    size,
                    modified,
                    created,
                    is_image,
                    folder_count: None,
                    image_count: None,
                    archive_count: None,
                    video_count: None,
                    target_path: None,
                });
            }
        }

        Ok(())
    }

    /// 递归搜索目录
    fn search_recursive(
        &self,
        path: &Path,
        query: &str,
        results: &mut Vec<FsItem>,
        max_results: usize,
    ) -> Result<(), String> {
        if !path.is_dir() {
            return Ok(());
        }

        // 先搜索当前目录
        self.search_directory(path, query, results, max_results)?;

        if results.len() >= max_results {
            return Ok(());
        }

        // 然后递归搜索子目录
        let entries = fs::read_dir(path).map_err(|e| format!("读取目录失败: {}", e))?;

        for entry in entries {
            if results.len() >= max_results {
                break;
            }

            let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
            let entry_path = entry.path();

            // 跳过隐藏文件
            if let Some(name) = entry_path.file_name() {
                if name.to_string_lossy().starts_with('.') {
                    continue;
                }
            }

            if entry_path.is_dir() {
                self.search_recursive(&entry_path, query, results, max_results)?;
            }
        }

        Ok(())
    }

    // ===== 索引相关方法 =====

    /// 初始化索引器
    pub fn initialize_indexer(&self) -> Result<(), String> {
        self.indexer.load_index()
    }

    /// 构建指定路径的索引
    pub fn build_index(&self, path: &Path, recursive: bool) -> Result<(), String> {
        self.validate_path(path)?;
        self.indexer.build_index(path, recursive)
    }

    /// 使用索引搜索文件
    pub fn search_with_index(
        &self,
        query: &str,
        max_results: usize,
    ) -> Result<Vec<FsItem>, String> {
        self.indexer.search(query, max_results, None)
    }

    /// 获取索引统计信息
    pub fn get_index_stats(&self) -> Result<super::file_indexer::IndexStats, String> {
        self.indexer.get_stats()
    }

    /// 清除索引
    pub fn clear_index(&self) -> Result<(), String> {
        self.indexer.clear_index()
    }

    /// 检查是否有可用的索引
    pub fn has_index(&self) -> Result<bool, String> {
        let stats = self.indexer.get_stats()?;
        Ok(stats.total_files > 0 || stats.total_dirs > 0)
    }

    /// 在索引中搜索文件（带选项）
    pub fn search_in_index(
        &self,
        query: &str,
        max_results: usize,
        options: Option<&super::file_indexer::SearchOptions>,
    ) -> Result<Vec<FsItem>, String> {
        self.indexer.search(query, max_results, options)
    }

    /// 获取索引中的路径列表
    pub fn get_indexed_paths(
        &self,
        parent_path: Option<&str>,
        recursive: bool,
    ) -> Result<Vec<String>, String> {
        self.indexer.get_indexed_paths(parent_path, recursive)
    }

    /// 检查路径是否已被索引
    pub fn is_path_indexed(&self, path: &str) -> Result<bool, String> {
        self.indexer.is_path_indexed(path)
    }

    /// 获取索引进度
    pub fn get_index_progress(&self) -> Result<super::file_indexer::IndexProgress, String> {
        self.indexer.get_progress()
    }
}

impl Default for FsManager {
    fn default() -> Self {
        Self::new()
    }
}
