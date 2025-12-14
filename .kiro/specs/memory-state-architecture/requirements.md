# Requirements Document

## Introduction

本文档定义了 NeoView 应用程序的内存管理和状态管理架构改进需求。当前系统存在以下问题：

1. **ImageCache 使用固定 MB 限制**：无法根据系统内存压力动态调整
2. **大图加载效率低**：完整读入内存导致内存峰值过高
3. **缩略图存储体积大**：SQLite 数据库中的 blob 未压缩
4. **状态管理碎片化**：lib.rs 中有 15+ 个独立的 State 管理，难以维护

## Glossary

- **ImageCache**: 图像缓存管理器，用于缓存已加载的图像数据
- **LRU (Least Recently Used)**: 最近最少使用算法，一种缓存淘汰策略
- **memmap2**: Rust 内存映射库，允许将文件映射到内存而不完整读入
- **LZ4**: 高速压缩算法，压缩/解压速度极快，适合实时场景
- **AppContext**: 统一的应用上下文，集中管理核心状态
- **Arc<RwLock<>>**: Rust 并发原语，允许多读单写的共享状态
- **ThumbnailDb**: 缩略图数据库，使用 SQLite 存储 webp 格式的缩略图 blob
- **内存压力感知**: 根据系统可用内存动态调整缓存策略的能力

## Requirements

### Requirement 1: LRU + 内存压力感知的 ImageCache

**User Story:** As a user, I want the image cache to automatically adjust based on system memory pressure, so that the application remains responsive even when system memory is low.

#### Acceptance Criteria

1. WHEN the ImageCache is initialized THEN the ImageCache SHALL use LRU (Least Recently Used) algorithm for cache eviction
2. WHEN system available memory falls below a configurable threshold THEN the ImageCache SHALL proactively evict entries to reduce memory usage
3. WHEN a cache entry is accessed THEN the ImageCache SHALL update the entry's access timestamp for LRU ordering
4. WHEN the cache size exceeds the maximum limit THEN the ImageCache SHALL evict the least recently used entries first
5. WHEN memory pressure is detected THEN the ImageCache SHALL emit a log message indicating the eviction reason
6. WHEN serializing cache entries THEN the ImageCache SHALL produce output that can be deserialized back to an equivalent entry (round-trip consistency)

### Requirement 2: 大图内存映射加载

**User Story:** As a user, I want large images to be loaded efficiently without causing memory spikes, so that I can view high-resolution images without the application becoming slow or crashing.

#### Acceptance Criteria

1. WHEN loading an image file larger than a configurable threshold (default 10MB) THEN the ImageLoader SHALL use memory-mapped file access via memmap2
2. WHEN a memory-mapped image is no longer needed THEN the ImageLoader SHALL release the memory mapping promptly
3. WHEN memory mapping fails THEN the ImageLoader SHALL fall back to traditional file loading and log a warning
4. WHEN loading a memory-mapped image THEN the ImageLoader SHALL report the same dimensions as traditional loading
5. WHEN the large file threshold is updated THEN the ImageLoader SHALL apply the new threshold to subsequent load operations

### Requirement 3: LZ4 压缩缩略图存储

**User Story:** As a user, I want thumbnails to be stored efficiently, so that the application uses less disk space and loads thumbnails faster.

#### Acceptance Criteria

1. WHEN saving a thumbnail to the database THEN the ThumbnailDb SHALL compress the blob data using LZ4 algorithm
2. WHEN loading a thumbnail from the database THEN the ThumbnailDb SHALL decompress the LZ4 data transparently
3. WHEN compression fails THEN the ThumbnailDb SHALL store the uncompressed data and log a warning
4. WHEN decompression fails THEN the ThumbnailDb SHALL return an error and log the failure details
5. WHEN a thumbnail is compressed and then decompressed THEN the ThumbnailDb SHALL produce data identical to the original (round-trip consistency)
6. WHEN querying database statistics THEN the ThumbnailDb SHALL report both compressed and uncompressed sizes

### Requirement 4: 统一状态管理 AppContext

**User Story:** As a developer, I want a unified state management system, so that the codebase is easier to maintain and extend.

#### Acceptance Criteria

1. WHEN the application starts THEN the AppContext SHALL initialize and hold references to all core state managers
2. WHEN a component needs access to shared state THEN the component SHALL obtain the state through AppContext
3. WHEN multiple readers access the same state concurrently THEN the AppContext SHALL allow concurrent read access using Arc<RwLock<>>
4. WHEN a writer needs to modify state THEN the AppContext SHALL ensure exclusive write access
5. WHEN AppContext is serialized and deserialized THEN the configuration portion SHALL round-trip correctly
6. WHEN listing managed states THEN the AppContext SHALL return all registered state names

### Requirement 5: 读写锁优化

**User Story:** As a user, I want the application to handle concurrent operations efficiently, so that multiple operations can read data simultaneously without blocking each other.

#### Acceptance Criteria

1. WHEN multiple threads read from ImageCache simultaneously THEN the ImageCache SHALL allow concurrent read access without blocking
2. WHEN a thread writes to ImageCache THEN the ImageCache SHALL block other readers and writers until the write completes
3. WHEN read operations significantly outnumber write operations THEN the system SHALL demonstrate improved throughput compared to Mutex-only implementation
4. WHEN a read lock is held THEN write operations SHALL wait until all read locks are released
5. WHEN a write lock is requested THEN new read lock requests SHALL wait until the write completes
