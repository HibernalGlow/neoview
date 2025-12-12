# Requirements Document

## Introduction

本文档定义了 NeoView 文件加载性能优化的需求规格。参考 Spacedrive 项目的流式加载架构，对当前的目录浏览、文件列表加载和缩略图预加载进行系统性优化。

当前系统已实现：
- 虚拟化列表分页加载
- 目录缓存（内存 LRU + SQLite 持久化）
- 缩略图并发控制
- 后台预热子树功能

本次优化目标：
- 实现真正的流式目录加载（边扫描边返回）
- 优化大型目录（2000+ 文件）的首屏加载时间
- 减少 IPC 通道压力
- 提升用户感知性能

## Glossary

- **FsItem**: 文件系统项，包含路径、名称、类型、大小等元数据
- **DirectorySnapshot**: 目录快照，包含目录内所有 FsItem 的列表
- **BatchedStream**: 批量流，将连续的流数据批量化处理，避免过多的小批次传输
- **IPC**: 进程间通信（Inter-Process Communication），Tauri 前后端通信机制
- **jwalk**: Rust 并行目录遍历库
- **Tauri Channel**: Tauri 的流式通信通道，支持后端向前端推送数据
- **LRU**: 最近最少使用（Least Recently Used）缓存淘汰策略
- **TTL**: 生存时间（Time To Live），缓存过期时间

## Requirements

### Requirement 1

**User Story:** As a user, I want to see directory contents appear progressively as they are scanned, so that I can start browsing immediately without waiting for the entire directory to load.

#### Acceptance Criteria

1. WHEN a user opens a directory with more than 100 items THEN the System SHALL display the first batch of items within 100ms of the request
2. WHEN the backend scans a directory THEN the System SHALL stream items to the frontend in batches of 15-50 items
3. WHILE directory streaming is in progress THEN the System SHALL display a loading indicator showing scan progress
4. WHEN all items have been streamed THEN the System SHALL emit a completion signal to the frontend
5. IF the user navigates away during streaming THEN the System SHALL cancel the ongoing stream and release resources

### Requirement 2

**User Story:** As a user, I want large directories to load without freezing the UI, so that I can continue interacting with the application during loading.

#### Acceptance Criteria

1. WHEN loading a directory with 2000+ items THEN the System SHALL maintain UI responsiveness with frame rate above 30fps
2. WHEN processing directory entries THEN the System SHALL yield to the event loop every 15 items to prevent blocking
3. WHILE streaming directory contents THEN the System SHALL use non-blocking I/O operations
4. WHEN the frontend receives a batch THEN the System SHALL process the batch asynchronously without blocking the main thread

### Requirement 3

**User Story:** As a user, I want directory contents to be cached intelligently, so that revisiting directories is instant.

#### Acceptance Criteria

1. WHEN a directory is fully loaded THEN the System SHALL cache the complete item list with modification timestamp
2. WHEN revisiting a cached directory THEN the System SHALL validate cache freshness using directory mtime
3. IF the directory mtime has changed THEN the System SHALL invalidate the cache and reload from disk
4. WHEN cache capacity is exceeded THEN the System SHALL evict entries using a hybrid LRU+LFU strategy
5. WHEN the application starts THEN the System SHALL restore frequently accessed directories from persistent cache

### Requirement 4

**User Story:** As a user, I want to search within large directories quickly, so that I can find files without waiting for full directory load.

#### Acceptance Criteria

1. WHEN searching in a directory THEN the System SHALL return matching results as they are found during streaming
2. WHEN a search query is entered THEN the System SHALL begin returning results within 200ms
3. WHILE search is in progress THEN the System SHALL allow the user to interact with partial results
4. IF the user modifies the search query THEN the System SHALL cancel the previous search and start a new one

### Requirement 5

**User Story:** As a developer, I want the streaming API to be type-safe and well-documented, so that I can integrate it correctly.

#### Acceptance Criteria

1. WHEN defining streaming commands THEN the System SHALL use Rust's type system to ensure compile-time safety
2. WHEN streaming data to frontend THEN the System SHALL serialize items using a consistent JSON schema
3. WHEN an error occurs during streaming THEN the System SHALL emit a typed error event with error details
4. WHEN the stream completes THEN the System SHALL emit a typed completion event

### Requirement 6

**User Story:** As a user, I want to see accurate progress information during directory loading, so that I know how long the operation will take.

#### Acceptance Criteria

1. WHEN streaming begins THEN the System SHALL estimate total item count if possible
2. WHILE streaming is in progress THEN the System SHALL report the number of items loaded and estimated remaining
3. WHEN streaming completes THEN the System SHALL report the total items loaded and time elapsed
4. IF total count cannot be estimated THEN the System SHALL display an indeterminate progress indicator

### Requirement 7

**User Story:** As a user, I want the application to handle permission errors gracefully, so that inaccessible directories don't crash the loading process.

#### Acceptance Criteria

1. IF a directory entry cannot be read due to permissions THEN the System SHALL skip the entry and continue scanning
2. WHEN permission errors occur THEN the System SHALL log the error with the affected path
3. WHEN streaming completes with skipped entries THEN the System SHALL report the count of skipped items
4. IF the root directory is inaccessible THEN the System SHALL return an error immediately with a clear message

### Requirement 8

**User Story:** As a user, I want to cancel long-running directory loads, so that I can navigate elsewhere without waiting.

#### Acceptance Criteria

1. WHEN the user navigates away from a loading directory THEN the System SHALL cancel the ongoing stream within 50ms
2. WHEN a stream is cancelled THEN the System SHALL release all associated resources
3. WHEN a stream is cancelled THEN the System SHALL not emit any further data events
4. IF multiple streams are requested for the same directory THEN the System SHALL deduplicate and reuse the existing stream

