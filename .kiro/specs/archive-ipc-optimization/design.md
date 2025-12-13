# Design Document

## Overview

本设计文档描述了 NeoView 压缩包随机访问优化和 IPC 传输优化的技术方案。

### 核心目标

1. **RAR/7z 索引缓存**：建立文件名到条目位置的映射，实现 O(1) 随机访问
2. **流式传输**：大文件分块传输，支持进度反馈和取消
3. **内存管理**：LRU 缓存淘汰，限制并发传输

### 设计原则

- 向后兼容：现有 API 保持不变
- 渐进增强：优化自动生效，无需修改调用代码
- 资源高效：合理使用内存，避免资源泄漏

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Svelte)                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Image Loader   │  │ Stream Receiver │  │ Progress UI     │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│           └────────────────────┼────────────────────┘           │
│                                │                                │
│                    ┌───────────▼───────────┐                    │
│                    │   Tauri Channel API   │                    │
│                    └───────────┬───────────┘                    │
└────────────────────────────────┼────────────────────────────────┘
                                 │ IPC (Binary/Stream)
┌────────────────────────────────┼────────────────────────────────┐
│                         Backend (Rust)                          │
├────────────────────────────────┼────────────────────────────────┤
│                    ┌───────────▼───────────┐                    │
│                    │   Command Handlers    │                    │
│                    └───────────┬───────────┘                    │
│                                │                                │
│  ┌─────────────────────────────┼─────────────────────────────┐  │
│  │                             │                             │  │
│  │  ┌──────────────┐  ┌───────▼───────┐  ┌──────────────┐   │  │
│  │  │ArchiveIndex  │  │ArchiveManager │  │StreamTransfer│   │  │
│  │  │   Cache      │◄─┤  (Enhanced)   │──►│   Manager    │   │  │
│  │  └──────────────┘  └───────┬───────┘  └──────────────┘   │  │
│  │                            │                              │  │
│  │  ┌──────────────┐  ┌───────▼───────┐  ┌──────────────┐   │  │
│  │  │  RAR Index   │  │  7z Index     │  │  ZIP Cache   │   │  │
│  │  │  Builder     │  │  Builder      │  │  (Existing)  │   │  │
│  │  └──────────────┘  └───────────────┘  └──────────────┘   │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. ArchiveIndexCache（压缩包索引缓存）

负责管理 RAR/7z 压缩包的索引缓存。

```rust
/// 压缩包索引条目
#[derive(Debug, Clone)]
pub struct ArchiveIndexEntry {
    /// 文件名（内部路径）
    pub name: String,
    /// 条目在压缩包中的索引位置
    pub entry_index: usize,
    /// 文件大小（解压后）
    pub size: u64,
    /// 压缩后大小
    pub compressed_size: u64,
    /// 修改时间（Unix 时间戳）
    pub modified: Option<i64>,
    /// 是否为目录
    pub is_dir: bool,
    /// 是否为图片
    pub is_image: bool,
}

/// 压缩包索引
#[derive(Debug, Clone)]
pub struct ArchiveIndex {
    /// 压缩包路径
    pub archive_path: String,
    /// 压缩包修改时间（用于验证缓存有效性）
    pub archive_mtime: u64,
    /// 压缩包大小
    pub archive_size: u64,
    /// 文件名到条目的映射（HashMap 实现 O(1) 查找）
    pub entries: HashMap<String, ArchiveIndexEntry>,
    /// 按顺序排列的条目列表（用于遍历）
    pub ordered_entries: Vec<String>,
    /// 索引创建时间
    pub created_at: Instant,
    /// 最后访问时间
    pub last_accessed: Instant,
}

/// 索引缓存管理器
pub struct ArchiveIndexCache {
    /// 缓存映射（路径 -> 索引）
    cache: RwLock<HashMap<String, Arc<ArchiveIndex>>>,
    /// 最大缓存大小（字节）
    max_size: usize,
    /// 当前缓存大小（字节）
    current_size: AtomicUsize,
    /// LRU 访问顺序
    access_order: Mutex<VecDeque<String>>,
}

impl ArchiveIndexCache {
    /// 获取或构建索引
    pub async fn get_or_build<F>(
        &self,
        archive_path: &Path,
        builder: F,
        progress: Option<&dyn Fn(usize, usize)>,
    ) -> Result<Arc<ArchiveIndex>, String>
    where
        F: FnOnce(&Path, Option<&dyn Fn(usize, usize)>) -> Result<ArchiveIndex, String>;
    
    /// 检查索引是否有效
    pub fn is_valid(&self, archive_path: &Path) -> bool;
    
    /// 清除指定压缩包的索引
    pub fn invalidate(&self, archive_path: &Path);
    
    /// 清除所有索引
    pub fn clear(&self);
    
    /// 获取缓存统计
    pub fn stats(&self) -> IndexCacheStats;
}
```

### 2. RAR/7z 索引构建器

```rust
/// RAR 索引构建器
pub struct RarIndexBuilder;

impl RarIndexBuilder {
    /// 构建 RAR 压缩包索引
    pub fn build(
        archive_path: &Path,
        progress: Option<&dyn Fn(usize, usize)>,
    ) -> Result<ArchiveIndex, String> {
        let archive = unrar::Archive::new(archive_path)
            .open_for_listing()
            .map_err(|e| format!("打开 RAR 失败: {:?}", e))?;
        
        let mut entries = HashMap::new();
        let mut ordered = Vec::new();
        let mut index = 0;
        
        for entry_result in archive {
            let entry = entry_result.map_err(|e| format!("读取条目失败: {:?}", e))?;
            let name = entry.filename.to_string_lossy().to_string();
            
            // 报告进度
            if let Some(cb) = progress {
                cb(index, 0); // 总数未知时传 0
            }
            
            let index_entry = ArchiveIndexEntry {
                name: name.clone(),
                entry_index: index,
                size: entry.unpacked_size as u64,
                compressed_size: entry.packed_size as u64,
                modified: Some(entry.file_time as i64),
                is_dir: entry.is_directory(),
                is_image: is_image_file(&name),
            };
            
            entries.insert(name.clone(), index_entry);
            ordered.push(name);
            index += 1;
        }
        
        Ok(ArchiveIndex {
            archive_path: archive_path.to_string_lossy().to_string(),
            archive_mtime: get_file_mtime(archive_path)?,
            archive_size: get_file_size(archive_path)?,
            entries,
            ordered_entries: ordered,
            created_at: Instant::now(),
            last_accessed: Instant::now(),
        })
    }
}

/// 7z 索引构建器
pub struct SevenZIndexBuilder;

impl SevenZIndexBuilder {
    /// 构建 7z 压缩包索引
    pub fn build(
        archive_path: &Path,
        progress: Option<&dyn Fn(usize, usize)>,
    ) -> Result<ArchiveIndex, String>;
}
```

### 3. StreamTransferManager（流式传输管理器）

```rust
/// 传输块
#[derive(Debug, Clone, Serialize)]
pub struct TransferChunk {
    /// 块索引
    pub chunk_index: usize,
    /// 总块数
    pub total_chunks: usize,
    /// 块数据
    pub data: Vec<u8>,
    /// 是否为最后一块
    pub is_last: bool,
}

/// 传输进度
#[derive(Debug, Clone, Serialize)]
pub struct TransferProgress {
    /// 已传输字节数
    pub transferred: usize,
    /// 总字节数
    pub total: usize,
    /// 传输速度（字节/秒）
    pub speed: f64,
    /// 预计剩余时间（秒）
    pub eta: f64,
}

/// 流式传输管理器
pub struct StreamTransferManager {
    /// 活动传输
    active_transfers: RwLock<HashMap<String, TransferState>>,
    /// 最大并发传输数
    max_concurrent: usize,
    /// 块大小（默认 256KB）
    chunk_size: usize,
    /// 大文件阈值（默认 1MB）
    large_file_threshold: usize,
}

impl StreamTransferManager {
    /// 传输文件（自动选择模式）
    pub async fn transfer(
        &self,
        transfer_id: &str,
        data: Vec<u8>,
        channel: Channel<TransferChunk>,
    ) -> Result<(), String>;
    
    /// 取消传输
    pub fn cancel(&self, transfer_id: &str);
    
    /// 获取传输进度
    pub fn get_progress(&self, transfer_id: &str) -> Option<TransferProgress>;
    
    /// 是否应使用流式传输
    pub fn should_stream(&self, size: usize) -> bool {
        size > self.large_file_threshold
    }
}
```

### 4. 增强的 ArchiveManager

```rust
impl ArchiveManager {
    /// 从 RAR 提取文件（使用索引优化）
    pub fn extract_file_from_rar_indexed(
        &self,
        archive_path: &Path,
        file_path: &str,
        index_cache: &ArchiveIndexCache,
    ) -> Result<Vec<u8>, String> {
        // 1. 尝试获取索引
        let index = index_cache.get_or_build(
            archive_path,
            |path, progress| RarIndexBuilder::build(path, progress),
            None,
        )?;
        
        // 2. 查找目标文件
        let entry = index.entries.get(file_path)
            .ok_or_else(|| format!("文件不存在: {}", file_path))?;
        
        // 3. 使用索引位置直接定位
        self.extract_rar_by_index(archive_path, entry.entry_index)
    }
    
    /// 从 7z 提取文件（使用索引优化）
    pub fn extract_file_from_7z_indexed(
        &self,
        archive_path: &Path,
        file_path: &str,
        index_cache: &ArchiveIndexCache,
    ) -> Result<Vec<u8>, String>;
}
```

## Data Models

### 索引缓存统计

```rust
#[derive(Debug, Clone, Serialize)]
pub struct IndexCacheStats {
    /// 缓存的索引数量
    pub index_count: usize,
    /// 缓存总大小（字节）
    pub total_size: usize,
    /// 缓存命中次数
    pub hits: usize,
    /// 缓存未命中次数
    pub misses: usize,
    /// 命中率
    pub hit_rate: f64,
    /// 最大缓存大小
    pub max_size: usize,
}
```

### 传输状态

```rust
#[derive(Debug, Clone)]
pub struct TransferState {
    /// 传输 ID
    pub id: String,
    /// 开始时间
    pub started_at: Instant,
    /// 总大小
    pub total_size: usize,
    /// 已传输大小
    pub transferred: usize,
    /// 是否已取消
    pub cancelled: AtomicBool,
    /// 重试次数
    pub retry_count: usize,
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Index lookup consistency
*For any* RAR/7z archive and any file path within it, looking up the file through the index SHALL return the same entry index as sequential scanning would find.
**Validates: Requirements 1.1, 1.2**

### Property 2: Index cache validity
*For any* archive that has not been modified since indexing, the cached index SHALL be reused without rebuilding.
**Validates: Requirements 1.4**

### Property 3: Index invalidation on modification
*For any* archive that has been modified after indexing, accessing the archive SHALL trigger index rebuild.
**Validates: Requirements 1.5**

### Property 4: LRU eviction correctness
*For any* sequence of index accesses, when cache capacity is exceeded, the least recently used index SHALL be evicted first.
**Validates: Requirements 1.3, 5.1**

### Property 5: Streaming transfer data integrity (round-trip)
*For any* binary data transferred via streaming, assembling all chunks SHALL produce data identical to the original.
**Validates: Requirements 3.3**

### Property 6: Progress reporting monotonicity
*For any* index building or streaming transfer operation, progress percentage SHALL monotonically increase from 0 to 100.
**Validates: Requirements 2.1, 3.2**

### Property 7: Concurrent transfer limiting
*For any* number of concurrent transfer requests, the system SHALL not exceed the configured maximum concurrent transfers.
**Validates: Requirements 5.2**

### Property 8: API backward compatibility
*For any* existing API call (extract_file_from_rar, extract_file_from_7z), the function SHALL return the same result with or without index optimization.
**Validates: Requirements 7.1, 7.2, 7.3, 7.4**

### Property 9: Metadata completeness
*For any* archive entry, the index SHALL contain all required metadata fields (size, compressed_size, modified, is_dir, is_image).
**Validates: Requirements 8.1, 8.2, 8.3**

## Error Handling

### 索引构建错误

1. **压缩包损坏**：记录错误日志，回退到顺序访问
2. **内存不足**：触发 LRU 淘汰，重试构建
3. **权限错误**：返回明确错误信息

### 传输错误

1. **网络中断**：自动重试最多 3 次
2. **取消请求**：立即停止传输，释放资源
3. **内存压力**：暂停新传输，等待现有传输完成

## Testing Strategy

### 单元测试

1. **索引构建测试**
   - 测试 RAR 索引构建正确性
   - 测试 7z 索引构建正确性
   - 测试索引查找性能

2. **缓存测试**
   - 测试 LRU 淘汰逻辑
   - 测试缓存失效检测
   - 测试并发访问安全性

3. **传输测试**
   - 测试分块传输正确性
   - 测试进度报告准确性
   - 测试取消功能

### Property-Based Testing

使用 `proptest` 库进行属性测试：

1. **Property 1**: 生成随机压缩包和文件路径，验证索引查找与顺序扫描结果一致
2. **Property 5**: 生成随机二进制数据，验证分块传输后数据完整性
3. **Property 6**: 生成随机大小的数据，验证进度报告单调递增
4. **Property 8**: 生成随机压缩包操作序列，验证 API 兼容性

每个属性测试配置运行 100 次迭代。

