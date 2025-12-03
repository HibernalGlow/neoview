//! RAR 格式处理器

use std::path::{Path, PathBuf};
use unrar::Archive;

use super::{ArchiveEntry, ArchiveHandler};

/// RAR 压缩包处理器
pub struct RarHandler {
    path: PathBuf,
    /// 缓存的条目列表
    entries_cache: Option<Vec<ArchiveEntry>>,
}

impl RarHandler {
    /// 从文件路径打开 RAR
    pub fn open(path: &Path) -> Result<Self, String> {
        // 验证文件存在且可读
        if !path.exists() {
            return Err(format!("RAR 文件不存在: {:?}", path));
        }
        
        Ok(Self {
            path: path.to_path_buf(),
            entries_cache: None,
        })
    }
    
    /// 打开用于列表
    fn open_for_listing(&self) -> Result<unrar::OpenArchive<unrar::List, unrar::CursorBeforeHeader>, String> {
        Archive::new(&self.path)
            .open_for_listing()
            .map_err(|e| format!("打开 RAR 列表失败: {:?}", e))
    }
    
    /// 打开用于处理
    fn open_for_processing(&self) -> Result<unrar::OpenArchive<unrar::Process, unrar::CursorBeforeHeader>, String> {
        Archive::new(&self.path)
            .open_for_processing()
            .map_err(|e| format!("打开 RAR 处理失败: {:?}", e))
    }
}

impl ArchiveHandler for RarHandler {
    fn list_entries(&mut self) -> Result<Vec<ArchiveEntry>, String> {
        // 使用缓存
        if let Some(ref entries) = self.entries_cache {
            return Ok(entries.clone());
        }
        
        let archive = self.open_for_listing()?;
        let mut entries = Vec::new();
        let mut index = 0;
        
        for item in archive {
            let item = item.map_err(|e| format!("读取 RAR 条目失败: {:?}", e))?;
            
            entries.push(ArchiveEntry {
                name: item.filename.to_string_lossy().to_string(),
                is_directory: item.is_directory(),
                uncompressed_size: Some(item.unpacked_size),
                compressed_size: None, // RAR 不直接提供压缩大小
                index,
            });
            
            index += 1;
        }
        
        self.entries_cache = Some(entries.clone());
        Ok(entries)
    }
    
    fn read_entry(&mut self, index: usize) -> Result<Vec<u8>, String> {
        let mut archive = self.open_for_processing()?;
        let mut current_index = 0;
        
        while let Some(header) = archive.read_header()
            .map_err(|e| format!("读取 RAR 头失败: {:?}", e))?
        {
            if current_index == index {
                let (data, _) = header.read()
                    .map_err(|e| format!("读取 RAR 数据失败: {:?}", e))?;
                return Ok(data);
            }
            
            archive = header.skip()
                .map_err(|e| format!("跳过 RAR 条目失败: {:?}", e))?;
            current_index += 1;
        }
        
        Err(format!("RAR 条目索引 {} 不存在", index))
    }
    
    fn read_entry_by_name(&mut self, name: &str) -> Result<Vec<u8>, String> {
        let mut archive = self.open_for_processing()?;
        
        while let Some(header) = archive.read_header()
            .map_err(|e| format!("读取 RAR 头失败: {:?}", e))?
        {
            let entry = header.entry();
            let entry_name = entry.filename.to_string_lossy();
            
            if entry_name == name {
                let (data, _) = header.read()
                    .map_err(|e| format!("读取 RAR 数据失败: {:?}", e))?;
                return Ok(data);
            }
            
            archive = header.skip()
                .map_err(|e| format!("跳过 RAR 条目失败: {:?}", e))?;
        }
        
        Err(format!("找不到 RAR 条目 '{}'", name))
    }
    
    fn first_image_entry(&mut self) -> Result<Option<ArchiveEntry>, String> {
        let archive = self.open_for_listing()?;
        let mut index = 0;
        
        for item in archive {
            let item = item.map_err(|e| format!("读取 RAR 条目失败: {:?}", e))?;
            
            if item.is_directory() {
                index += 1;
                continue;
            }
            
            let entry = ArchiveEntry {
                name: item.filename.to_string_lossy().to_string(),
                is_directory: false,
                uncompressed_size: Some(item.unpacked_size),
                compressed_size: None, // RAR 不直接提供压缩大小
                index,
            };
            
            if entry.is_image() {
                return Ok(Some(entry));
            }
            
            index += 1;
        }
        
        Ok(None)
    }
}
