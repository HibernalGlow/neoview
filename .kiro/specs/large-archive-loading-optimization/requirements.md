# Requirements Document

## Introduction

本功能旨在优化超大压缩包（>1GB，>1000页）的加载性能。参考 NeeView 的架构设计，实现：
1. 渐进式索引构建 - 不阻塞 UI，边扫描边显示
2. 智能预提取策略 - 基于 Solid 压缩检测的混合提取
3. 内存压力管理 - 动态调整缓存大小，避免 OOM
4. 取消与恢复机制 - 支持中断和继续加载

当前问题：
- 打开超大压缩包时 UI 卡顿数秒
- RAR/7z Solid 压缩包随机访问性能极差
- 内存占用不可控，可能导致崩溃
- 无法取消正在进行的加载操作

## Glossary

- **Solid Archive**: 固实压缩包，多个文件作为一个整体压缩，随机访问需要解压前面所有数据
- **Pre-Extract**: 预提取，在后台提前解压文件到临时目录或内存
- **Streaming Index**: 流式索引，边扫描边返回结果，不等待完整扫描
- **Memory Pool**: 内存池，统一管理解压缓存的内存分配
- **Job Engine**: 任务引擎，管理后台任务的调度和优先级

## Requirements

### Requirement 1

**User Story:** As a user, I want to open large archives without UI freezing, so that I can start browsing immediately.

#### Acceptance Criteria

1. WHEN the user opens an archive larger than 100MB THEN the System SHALL display the first page within 500ms
2. WHEN scanning archive contents THEN the System SHALL stream results to the UI progressively every 100 entries
3. WHEN the archive scan is in progress THEN the System SHALL display a progress indicator showing scanned percentage
4. WHEN the user navigates during scanning THEN the System SHALL prioritize loading the requested page over background scanning
5. IF the archive scan fails THEN the System SHALL display an error message and allow retry

### Requirement 2

**User Story:** As a user, I want solid archives to load efficiently, so that I can browse them without long waits.

#### Acceptance Criteria

1. WHEN opening a solid RAR/7z archive THEN the System SHALL detect the solid compression within 100ms
2. WHEN a solid archive is detected THEN the System SHALL trigger background pre-extraction to a temporary directory
3. WHILE pre-extraction is in progress THEN the System SHALL serve pages from the extraction buffer as they become available
4. WHEN pre-extraction completes THEN the System SHALL switch to direct file access from the temporary directory
5. IF pre-extraction is interrupted THEN the System SHALL resume from the last completed entry on retry

### Requirement 3

**User Story:** As a user, I want the application to manage memory efficiently, so that it doesn't crash with large archives.

#### Acceptance Criteria

1. WHEN the memory usage exceeds 80% of the configured limit THEN the System SHALL evict least-recently-used cached pages
2. WHEN loading a page larger than 50MB THEN the System SHALL use temporary file storage instead of memory cache
3. WHILE the memory pool is full THEN the System SHALL pause pre-extraction until memory is available
4. WHEN the user closes an archive THEN the System SHALL release all associated memory within 1 second
5. WHEN the application starts THEN the System SHALL configure memory limits based on available system RAM

### Requirement 4

**User Story:** As a user, I want to cancel long-running operations, so that I can switch to a different archive quickly.

#### Acceptance Criteria

1. WHEN the user requests to open a different archive THEN the System SHALL cancel all pending operations for the previous archive
2. WHEN cancellation is requested THEN the System SHALL stop background tasks within 100ms
3. WHEN a task is cancelled THEN the System SHALL clean up partial temporary files
4. WHEN the user navigates away during pre-extraction THEN the System SHALL pause but not cancel the extraction
5. IF the user returns to a paused archive THEN the System SHALL resume pre-extraction from the paused state

### Requirement 5

**User Story:** As a user, I want intelligent page preloading, so that page turns are instant.

#### Acceptance Criteria

1. WHEN the user views a page THEN the System SHALL preload the next 3 pages in the reading direction
2. WHEN the user changes reading direction THEN the System SHALL adjust preload priorities within 50ms
3. WHEN preloading pages THEN the System SHALL skip pages that are already cached
4. WHEN the preload queue exceeds 10 pages THEN the System SHALL drop the lowest priority pages
5. WHEN a preloaded page is accessed THEN the System SHALL serve it from cache within 10ms

### Requirement 6

**User Story:** As a developer, I want archive index caching, so that reopening archives is fast.

#### Acceptance Criteria

1. WHEN an archive is fully scanned THEN the System SHALL persist the index to a database
2. WHEN reopening a previously scanned archive THEN the System SHALL load the index from database if the archive is unchanged
3. WHEN the archive file is modified THEN the System SHALL invalidate the cached index
4. WHEN the index cache exceeds 100MB THEN the System SHALL evict oldest entries
5. WHEN loading from cached index THEN the System SHALL display the first page within 100ms

### Requirement 7

**User Story:** As a user, I want to see loading progress, so that I know how long to wait.

#### Acceptance Criteria

1. WHEN pre-extraction is in progress THEN the System SHALL emit progress events with percentage and estimated time remaining
2. WHEN scanning archive contents THEN the System SHALL emit events with current entry count and total estimate
3. WHEN multiple background tasks are running THEN the System SHALL aggregate progress into a single indicator
4. WHEN a task completes THEN the System SHALL emit a completion event with duration and bytes processed
5. WHEN an error occurs THEN the System SHALL emit an error event with details and recovery suggestions
