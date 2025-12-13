# Requirements Document

## Introduction

本文档定义了 NeoView 压缩包随机访问优化和 IPC 传输优化的需求规格。

### 当前问题

**RAR/7z 压缩包随机访问问题：**
- RAR 格式：每次提取文件都需要从头遍历压缩包，直到找到目标文件
- 7z 格式：使用 `for_each_entries` 遍历所有条目，效率低下
- ZIP 格式已有缓存（`archive_cache`），但 RAR/7z 没有类似机制
- 对于大型压缩包（1000+ 文件），翻页时延迟明显

**IPC 传输问题：**
- 当前使用 `number[]` 传输二进制数据，JSON 序列化开销大
- 大图片（>5MB）传输时 UI 可能卡顿
- Base64 编码增加约 33% 的数据量
- 没有传输进度反馈机制

### 优化目标

1. RAR/7z 压缩包建立索引缓存，实现 O(1) 随机访问
2. 大文件使用流式传输或共享内存，减少序列化开销
3. 提供传输进度反馈，改善用户体验
4. 保持向后兼容，不影响现有功能

## Glossary

- **ArchiveIndex**: 压缩包索引，存储文件名到偏移量/条目索引的映射
- **RandomAccess**: 随机访问，直接定位到目标文件而无需遍历
- **IPC**: 进程间通信（Inter-Process Communication），Tauri 前后端通信机制
- **SharedMemory**: 共享内存，前后端共享的内存区域，避免数据复制
- **StreamTransfer**: 流式传输，分块传输大文件，支持进度反馈
- **Tauri Channel**: Tauri 的流式通信通道，支持后端向前端推送数据
- **mmap**: 内存映射文件，将文件映射到内存地址空间
- **LRU**: 最近最少使用（Least Recently Used）缓存淘汰策略

## Requirements

### Requirement 1

**User Story:** As a user, I want to quickly access any page in a RAR/7z archive, so that I can browse large comic archives without waiting.

#### Acceptance Criteria

1. WHEN a RAR/7z archive is opened for the first time THEN the System SHALL build an index mapping file names to entry positions
2. WHEN accessing a file in an indexed RAR/7z archive THEN the System SHALL locate the file in O(1) time complexity
3. WHEN the archive index is built THEN the System SHALL cache the index in memory with LRU eviction policy
4. WHEN the same archive is reopened THEN the System SHALL reuse the cached index if the archive file has not been modified
5. IF the archive file has been modified since indexing THEN the System SHALL rebuild the index automatically

### Requirement 2

**User Story:** As a user, I want to see loading progress when opening large archives, so that I know the application is working.

#### Acceptance Criteria

1. WHEN building an archive index THEN the System SHALL report progress as percentage of entries processed
2. WHEN index building takes longer than 500ms THEN the System SHALL display a progress indicator to the user
3. WHEN index building completes THEN the System SHALL report the total number of entries indexed and time elapsed
4. IF index building is cancelled by user navigation THEN the System SHALL stop processing and release resources

### Requirement 3

**User Story:** As a user, I want large images to load without freezing the UI, so that I can continue interacting with the application.

#### Acceptance Criteria

1. WHEN transferring image data larger than 1MB THEN the System SHALL use streaming transfer with chunked delivery
2. WHEN streaming transfer is in progress THEN the System SHALL report transfer progress to the frontend
3. WHEN streaming transfer completes THEN the System SHALL assemble chunks into a complete Blob
4. IF streaming transfer fails mid-way THEN the System SHALL retry from the last successful chunk up to 3 times
5. WHEN the user navigates away during transfer THEN the System SHALL cancel the ongoing transfer

### Requirement 4

**User Story:** As a developer, I want efficient binary data transfer, so that IPC does not become a performance bottleneck.

#### Acceptance Criteria

1. WHEN transferring binary data THEN the System SHALL avoid JSON serialization overhead by using binary protocols
2. WHEN multiple image requests are pending THEN the System SHALL batch them to reduce IPC round-trips
3. WHEN the backend has data ready THEN the System SHALL push data to frontend without polling
4. WHEN IPC errors occur THEN the System SHALL log detailed error information for debugging

### Requirement 5

**User Story:** As a user, I want the application to use memory efficiently, so that it does not slow down my system.

#### Acceptance Criteria

1. WHEN archive index cache exceeds 100MB THEN the System SHALL evict least recently used indices
2. WHEN streaming large files THEN the System SHALL limit concurrent transfers to prevent memory exhaustion
3. WHEN the application is idle THEN the System SHALL proactively release unused cached resources
4. WHEN memory pressure is detected THEN the System SHALL reduce cache sizes and defer non-critical operations

### Requirement 6

**User Story:** As a user, I want consistent performance across different archive formats, so that I can use any format without worrying about speed.

#### Acceptance Criteria

1. WHEN accessing files in ZIP archives THEN the System SHALL maintain current O(1) access performance
2. WHEN accessing files in RAR archives THEN the System SHALL achieve similar performance to ZIP after indexing
3. WHEN accessing files in 7z archives THEN the System SHALL achieve similar performance to ZIP after indexing
4. WHEN comparing access times THEN the System SHALL log performance metrics for analysis

### Requirement 7

**User Story:** As a developer, I want the optimization to be transparent, so that existing code continues to work without modification.

#### Acceptance Criteria

1. WHEN the optimization is enabled THEN the System SHALL maintain backward compatibility with existing APIs
2. WHEN calling extract_file_from_rar THEN the System SHALL automatically use indexed access if available
3. WHEN calling extract_file_from_7z THEN the System SHALL automatically use indexed access if available
4. WHEN the index is not available THEN the System SHALL fall back to sequential access gracefully

### Requirement 8

**User Story:** As a user, I want to see accurate file information from archives, so that I can make informed decisions about which files to view.

#### Acceptance Criteria

1. WHEN listing archive contents THEN the System SHALL return file sizes, modification times, and compression ratios
2. WHEN the archive index is available THEN the System SHALL use indexed metadata instead of re-scanning
3. WHEN displaying archive information THEN the System SHALL show total size, compressed size, and file count
4. WHEN archive metadata changes THEN the System SHALL update the cached information accordingly

