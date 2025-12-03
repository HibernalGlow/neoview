//! 7z 格式处理器

// std::io::Read 用于 for_each_entries 回调中的 reader.read_to_end()
#[allow(unused_imports)]
use std::io::Read;
use std::path::{Path, PathBuf};
use sevenz_rust::SevenZReader;

use super::{ArchiveEntry, ArchiveHandler};

/// 7z 压缩包处理器
pub struct SevenZHandler {
    path: PathBuf,
    /// 缓存的条目列表
    entries_cache: Option<Vec<ArchiveEntry>>,
}

impl SevenZHandler {
    /// 从文件路径打开 7z
    pub fn open(path: &Path) -> Result<Self, String> {
        // 验证文件存在且可读
        if !path.exists() {
            return Err(format!("7z 文件不存在: {:?}", path));
        }
        
        Ok(Self {
            path: path.to_path_buf(),
            entries_cache: None,
        })
    }
    
    /// 打开压缩包
    fn open_archive(&self) -> Result<SevenZReader<std::fs::File>, String> {
        SevenZReader::open(&self.path, "".into())
            .map_err(|e| format!("打开 7z 失败: {}", e))
    }
}

impl ArchiveHandler for SevenZHandler {
    fn list_entries(&mut self) -> Result<Vec<ArchiveEntry>, String> {
        // 使用缓存
        if let Some(ref entries) = self.entries_cache {
            return Ok(entries.clone());
        }
        
        let archive = self.open_archive()?;
        let mut entries = Vec::new();
        
        for (index, entry) in archive.archive().files.iter().enumerate() {
            entries.push(ArchiveEntry {
                name: entry.name().to_string(),
                is_directory: entry.is_directory(),
                uncompressed_size: Some(entry.size()),
                compressed_size: None, // 7z 不提供单条目压缩大小
                index,
            });
        }
        
        self.entries_cache = Some(entries.clone());
        Ok(entries)
    }
    
    fn read_entry(&mut self, index: usize) -> Result<Vec<u8>, String> {
        let entries = self.list_entries()?;
        let target_entry = entries.get(index)
            .ok_or_else(|| format!("7z 条目索引 {} 不存在", index))?;
        
        self.read_entry_by_name(&target_entry.name)
    }
    
    fn read_entry_by_name(&mut self, name: &str) -> Result<Vec<u8>, String> {
        let mut archive = self.open_archive()?;
        let mut result: Option<Vec<u8>> = None;
        let target_name = name.to_string();
        
        archive.for_each_entries(|entry, reader| {
            if entry.name() == target_name {
                let mut data = Vec::new();
                if let Err(e) = reader.read_to_end(&mut data) {
                    return Err(sevenz_rust::Error::io(e));
                }
                result = Some(data);
                return Ok(false); // 停止遍历
            }
            Ok(true)
        }).map_err(|e| format!("遍历 7z 失败: {}", e))?;
        
        result.ok_or_else(|| format!("找不到 7z 条目 '{}'", name))
    }
    
    fn first_image_entry(&mut self) -> Result<Option<ArchiveEntry>, String> {
        let archive = self.open_archive()?;
        
        for (index, file) in archive.archive().files.iter().enumerate() {
            if file.is_directory() {
                continue;
            }
            
            let entry = ArchiveEntry {
                name: file.name().to_string(),
                is_directory: false,
                uncompressed_size: Some(file.size()),
                compressed_size: None,
                index,
            };
            
            if entry.is_image() {
                return Ok(Some(entry));
            }
        }
        
        Ok(None)
    }
}
