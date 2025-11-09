use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use std::time::SystemTime;

/// 文件系统项（文件或目录）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<u64>,
    pub is_image: bool,
}

/// 文件系统管理器
pub struct FsManager {
    /// 允许访问的根目录列表（安全检查）
    allowed_roots: Vec<PathBuf>,
}

impl FsManager {
    /// 创建新的文件系统管理器
    pub fn new() -> Self {
        Self {
            allowed_roots: Vec::new(),
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
        let canonical = path.canonicalize()
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

    /// 读取目录内容
    pub fn read_directory(&self, path: &Path) -> Result<Vec<FsItem>, String> {
        // 安全验证
        self.validate_path(path)?;

        if !path.is_dir() {
            return Err("路径不是目录".to_string());
        }

        let entries = fs::read_dir(path)
            .map_err(|e| format!("读取目录失败: {}", e))?;

        let mut items = Vec::new();

        for entry in entries {
            let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
            let path = entry.path();
            
            // 跳过隐藏文件（以 . 开头）
            if let Some(name) = path.file_name() {
                if name.to_string_lossy().starts_with('.') {
                    continue;
                }
            }

            let metadata = entry.metadata()
                .map_err(|e| format!("获取元数据失败: {}", e))?;

            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = metadata.is_dir();
            // 对于目录，只计算直接子项数量，不递归（避免性能问题）
            let size = if is_dir { 
                // 计算直接子项数量
                fs::read_dir(&path)
                    .map(|entries| entries.count() as u64)
                    .unwrap_or(0)
            } else { 
                metadata.len() 
            };
            let modified = metadata.modified()
                .ok()
                .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_secs());

            let is_image = !is_dir && Self::is_image_file(&path);

            items.push(FsItem {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir,
                size,
                modified,
                is_image,
            });
        }

        // 排序：目录优先，然后按名称
        items.sort_by(|a, b| {
            match (a.is_dir, b.is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            }
        });

        Ok(items)
    }

    /// 计算目录的总大小
    fn calculate_directory_size(&self, path: &Path) -> Result<u64, String> {
        let mut total_size = 0u64;
        
        let entries = fs::read_dir(path)
            .map_err(|e| format!("读取目录失败: {}", e))?;

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
        // 安全验证
        self.validate_path(path)?;

        let metadata = fs::metadata(path)
            .map_err(|e| format!("获取元数据失败: {}", e))?;

        let name = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let is_dir = metadata.is_dir();
        let size = if is_dir { 
            self.calculate_directory_size(path).unwrap_or(0)
        } else { 
            metadata.len() 
        };
        let modified = metadata.modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());

        let is_image = !is_dir && Self::is_image_file(path);

        Ok(FsItem {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            size,
            modified,
            is_image,
        })
    }

    /// 检查是否为图片文件
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

    /// 获取目录中的所有图片文件（递归）
    pub fn get_images_in_directory(&self, path: &Path, recursive: bool) -> Result<Vec<PathBuf>, String> {
        self.validate_path(path)?;

        let mut images = Vec::new();
        self.collect_images(path, recursive, &mut images)?;
        
        // 排序
        images.sort_by(|a, b| {
            a.file_name().cmp(&b.file_name())
        });

        Ok(images)
    }

    /// 递归收集图片文件
    fn collect_images(&self, path: &Path, recursive: bool, images: &mut Vec<PathBuf>) -> Result<(), String> {
        if !path.is_dir() {
            return Ok(());
        }

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

        fs::create_dir_all(path)
            .map_err(|e| format!("创建目录失败: {}", e))
    }

    /// 删除文件或目录
    pub fn delete(&self, path: &Path) -> Result<(), String> {
        self.validate_path(path)?;

        if path.is_dir() {
            fs::remove_dir_all(path)
                .map_err(|e| format!("删除目录失败: {}", e))
        } else {
            fs::remove_file(path)
                .map_err(|e| format!("删除文件失败: {}", e))
        }
    }

    /// 重命名文件或目录
    pub fn rename(&self, from: &Path, to: &Path) -> Result<(), String> {
        self.validate_path(from)?;
        
        // 验证目标路径的父目录
        if let Some(parent) = to.parent() {
            self.validate_path(parent)?;
        }

        fs::rename(from, to)
            .map_err(|e| format!("重命名失败: {}", e))
    }

    /// 移动到回收站（Windows）
    #[cfg(target_os = "windows")]
    pub fn move_to_trash(&self, path: &Path) -> Result<(), String> {
        self.validate_path(path)?;

        // 使用 Windows Shell API 移动到回收站
        // 这里简化处理，实际应该使用 trash crate
        use std::process::Command;
        
        let path_str = path.to_string_lossy().to_string();
        let output = Command::new("powershell")
            .args(&[
                "-Command",
                &format!(
                    "Add-Type -AssemblyName Microsoft.VisualBasic; \
                     [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('{}', \
                     'OnlyErrorDialogs', 'SendToRecycleBin')",
                    path_str.replace("'", "''")
                )
            ])
            .output()
            .map_err(|e| format!("执行回收站命令失败: {}", e))?;

        if output.status.success() {
            Ok(())
        } else {
            Err("移动到回收站失败".to_string())
        }
    }

    /// 移动到回收站（非 Windows）
    #[cfg(not(target_os = "windows"))]
    pub fn move_to_trash(&self, path: &Path) -> Result<(), String> {
        self.validate_path(path)?;
        Err("当前平台不支持回收站功能".to_string())
    }
}

impl Default for FsManager {
    fn default() -> Self {
        Self::new()
    }
}
