//! ZIP 格式处理器

use std::fs::File;
use std::io::{Cursor, Read, Seek};
use std::path::Path;
use zip::ZipArchive;

use super::{ArchiveEntry, ArchiveHandler};

/// ZIP 压缩包处理器
pub struct ZipHandler<R: Read + Seek> {
    archive: ZipArchive<R>,
    /// 缓存的条目列表
    entries_cache: Option<Vec<ArchiveEntry>>,
}

impl ZipHandler<File> {
    /// 从文件路径打开 ZIP
    pub fn open(path: &Path) -> Result<Self, String> {
        let file = File::open(path)
            .map_err(|e| format!("打开 ZIP 失败: {}", e))?;
        let archive = ZipArchive::new(file)
            .map_err(|e| format!("解析 ZIP 失败: {}", e))?;
        
        Ok(Self {
            archive,
            entries_cache: None,
        })
    }
}

impl ZipHandler<Cursor<Vec<u8>>> {
    /// 从内存数据打开 ZIP
    pub fn from_memory(data: Vec<u8>) -> Result<Self, String> {
        let cursor = Cursor::new(data);
        let archive = ZipArchive::new(cursor)
            .map_err(|e| format!("解析 ZIP 失败: {}", e))?;
        
        Ok(Self {
            archive,
            entries_cache: None,
        })
    }
}

impl<R: Read + Seek + Send + Sync> ArchiveHandler for ZipHandler<R> {
    fn list_entries(&mut self) -> Result<Vec<ArchiveEntry>, String> {
        // 使用缓存
        if let Some(ref entries) = self.entries_cache {
            return Ok(entries.clone());
        }
        
        let mut entries = Vec::with_capacity(self.archive.len());
        
        for i in 0..self.archive.len() {
            let file = self.archive.by_index(i)
                .map_err(|e| format!("读取 ZIP 条目失败: {}", e))?;
            
            entries.push(ArchiveEntry {
                name: file.name().to_string(),
                is_directory: file.is_dir(),
                uncompressed_size: Some(file.size()),
                compressed_size: Some(file.compressed_size()),
                index: i,
            });
        }
        
        self.entries_cache = Some(entries.clone());
        Ok(entries)
    }
    
    fn read_entry(&mut self, index: usize) -> Result<Vec<u8>, String> {
        let mut file = self.archive.by_index(index)
            .map_err(|e| format!("读取 ZIP 条目失败: {}", e))?;
        
        let mut data = Vec::with_capacity(file.size() as usize);
        file.read_to_end(&mut data)
            .map_err(|e| format!("读取 ZIP 数据失败: {}", e))?;
        
        Ok(data)
    }
    
    fn read_entry_by_name(&mut self, name: &str) -> Result<Vec<u8>, String> {
        let mut file = self.archive.by_name(name)
            .map_err(|e| format!("找不到 ZIP 条目 '{}': {}", name, e))?;
        
        let mut data = Vec::with_capacity(file.size() as usize);
        file.read_to_end(&mut data)
            .map_err(|e| format!("读取 ZIP 数据失败: {}", e))?;
        
        Ok(data)
    }
    
    fn first_image_entry(&mut self) -> Result<Option<ArchiveEntry>, String> {
        // 优化：不缓存全部，只找第一个图片
        for i in 0..self.archive.len() {
            let file = self.archive.by_index(i)
                .map_err(|e| format!("读取 ZIP 条目失败: {}", e))?;
            
            if file.is_dir() {
                continue;
            }
            
            let entry = ArchiveEntry {
                name: file.name().to_string(),
                is_directory: false,
                uncompressed_size: Some(file.size()),
                compressed_size: Some(file.compressed_size()),
                index: i,
            };
            
            if entry.is_image() {
                return Ok(Some(entry));
            }
        }
        
        Ok(None)
    }
}
