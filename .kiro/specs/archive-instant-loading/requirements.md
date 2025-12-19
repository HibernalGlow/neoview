# Requirements Document

## Introduction

本功能旨在优化**切换不同压缩包**时的加载速度，实现类似 NeeView 的"秒开"体验。当前系统在打开大文件（>50MB）或高分辨率图片的压缩包时存在明显延迟，而 NeeView 可以实现秒开。

### 问题分析

当前系统切换压缩包时的瓶颈：
1. **同步扫描文件列表**：`list_contents` 需要完整扫描压缩包获取文件列表，大文件耗时长
2. **无索引缓存**：每次打开压缩包都重新扫描，即使压缩包未修改
3. **首页加载阻塞**：必须等待文件列表扫描完成后才能开始加载首页图片
4. **RAR/7z 格式慢**：这些格式需要顺序读取头部信息，比 ZIP 慢很多
5. **无预热机制**：没有在用户浏览文件列表时预先准备下一个可能打开的压缩包

### NeeView 的解决方案

通过分析 NeeView 源码，发现其秒开主要依赖：
1. **ArchiveCache**：使用弱引用缓存已打开的 Archive 实例，避免重复创建
2. **ArchiveEntryCollection 缓存**：`_entries` 字段缓存文件列表，避免重复扫描
3. **异步加载流程**：`BookSourceFactory.CreateAsync` 异步创建书籍源
4. **命令队列**：`BookHubCommandEngine` 管理加载命令，支持取消和优先级
5. **增量显示**：先显示 UI，后台继续加载页面内容

## Glossary

- **Archive Index（压缩包索引）**：压缩包内文件列表的缓存结构，包含文件路径、大小、索引位置等元数据
- **Index Cache（索引缓存）**：持久化存储的压缩包索引，避免重复扫描
- **Archive Instance Cache（压缩包实例缓存）**：内存中缓存的已打开压缩包句柄，避免重复打开文件
- **Preheat（预热）**：在用户可能打开某个压缩包之前，预先加载其索引到缓存
- **First Page Priority（首页优先）**：优先加载并显示第一页，其他页面后台加载
- **Modification Time（修改时间）**：文件的最后修改时间戳，用于验证缓存有效性
- **Weak Reference（弱引用）**：不阻止垃圾回收的引用，用于缓存可被回收的对象

## Requirements

### Requirement 1: 压缩包索引持久化缓存

**User Story:** As a user, I want archive file listings to be cached persistently, so that I can open previously viewed archives instantly without re-scanning.

#### Acceptance Criteria

1. WHEN an archive is opened for the first time THEN the Index Cache SHALL scan the archive and store the file index to a persistent cache file
2. WHEN an archive is opened subsequently THEN the Index Cache SHALL load the cached index from disk instead of re-scanning
3. WHEN loading a cached index THEN the Index Cache SHALL validate the cache against the archive modification time and file size
4. IF the archive has been modified since caching THEN the Index Cache SHALL rebuild and update the index
5. WHEN the Index Cache stores an index THEN the Index Cache SHALL include file paths, sizes, entry indices, and modification timestamps
6. WHEN the persistent cache exceeds its size limit (default 100MB) THEN the Index Cache SHALL evict least recently used indices

### Requirement 2: 压缩包实例缓存

**User Story:** As a system, I want to cache opened archive instances in memory, so that switching between recently viewed archives is instant.

#### Acceptance Criteria

1. WHEN an archive is opened THEN the Instance Cache SHALL store the archive handle using a weak reference
2. WHEN opening an archive that exists in the Instance Cache THEN the Instance Cache SHALL return the cached instance instead of creating a new one
3. WHEN the Instance Cache contains more than 50 entries THEN the Instance Cache SHALL clean up entries whose weak references have been garbage collected
4. WHEN an archive file is modified externally THEN the Instance Cache SHALL invalidate the cached instance for that archive
5. WHEN the application closes THEN the Instance Cache SHALL release all cached archive handles

### Requirement 3: 首页优先加载

**User Story:** As a user, I want to see the first page immediately when opening an archive, so that I can start viewing without waiting for the full file list.

#### Acceptance Criteria

1. WHEN a user opens an archive THEN the Book Loader SHALL display the first page within 200ms for cached archives
2. WHEN loading an archive THEN the Book Loader SHALL load the first page data in parallel with the file list scanning
3. WHEN the first page is ready THEN the Book Loader SHALL display it immediately without waiting for other pages to load
4. WHEN the file list scanning completes THEN the Book Loader SHALL update the page count and enable navigation
5. IF the first page fails to load THEN the Book Loader SHALL display an error message and continue loading the file list

### Requirement 4: 邻近压缩包预热

**User Story:** As a user, I want the next and previous archives in the folder to be pre-warmed, so that switching to adjacent archives is instant.

#### Acceptance Criteria

1. WHEN a user opens an archive THEN the Preheat System SHALL identify the next and previous archives in the same folder
2. WHEN adjacent archives are identified THEN the Preheat System SHALL load their indices into the cache in the background
3. WHEN preheating an archive THEN the Preheat System SHALL only load the index without extracting any files
4. WHEN the user navigates to an adjacent archive THEN the Preheat System SHALL have the index ready in cache
5. WHEN the preheat queue exceeds 5 archives THEN the Preheat System SHALL cancel preheating for the oldest entries

### Requirement 5: RAR/7z 索引优化

**User Story:** As a user, I want RAR and 7z archives to open as fast as ZIP files, so that I can use any archive format without performance penalty.

#### Acceptance Criteria

1. WHEN opening a RAR archive THEN the RAR Handler SHALL build an entry index mapping file paths to entry positions
2. WHEN opening a 7z archive THEN the 7z Handler SHALL build an entry index mapping file paths to entry positions
3. WHEN the index is built THEN the Index Builder SHALL store it in the persistent cache for future use
4. WHEN extracting a file from RAR/7z THEN the Extractor SHALL use the cached index to locate the entry directly
5. WHEN the cached index is valid THEN the RAR/7z Handler SHALL skip the sequential header scanning

### Requirement 6: 异步加载流程

**User Story:** As a user, I want the UI to remain responsive while archives are loading, so that I can cancel or switch to another archive at any time.

#### Acceptance Criteria

1. WHEN a user opens an archive THEN the Load Command SHALL be queued and processed asynchronously
2. WHEN a new open request arrives while loading THEN the Command Queue SHALL cancel the current load and start the new one
3. WHEN loading is in progress THEN the UI SHALL display a loading indicator without blocking user interaction
4. WHEN the user presses Escape during loading THEN the Load Command SHALL be cancelled and the previous state restored
5. WHEN loading completes THEN the Command Queue SHALL emit a completion event to update the UI

### Requirement 7: 加载性能监控

**User Story:** As a developer, I want to monitor archive loading performance, so that I can identify and fix performance bottlenecks.

#### Acceptance Criteria

1. WHEN an archive is opened THEN the Performance Monitor SHALL record the total loading time
2. WHEN loading completes THEN the Performance Monitor SHALL record breakdown times for index loading, first page loading, and full list loading
3. WHEN the info panel is visible THEN the Info Panel SHALL display the last archive loading time
4. WHEN debug mode is enabled THEN the System SHALL log detailed timing information for each loading phase
5. WHEN loading time exceeds 500ms THEN the Performance Monitor SHALL log a warning with the archive path and size

### Requirement 8: 索引数据序列化

**User Story:** As a system, I want to efficiently serialize and deserialize archive indices, so that I can persist and load them quickly.

#### Acceptance Criteria

1. WHEN serializing an archive index THEN the Serializer SHALL use a binary format for compact storage
2. WHEN deserializing an archive index THEN the Deserializer SHALL validate the format version and data integrity
3. WHEN the serialized format changes THEN the Serializer SHALL include a version number for backward compatibility
4. WHEN loading an incompatible cache version THEN the Index Cache SHALL rebuild the index instead of failing
5. WHEN serializing an index THEN the Serializer SHALL produce output that can be deserialized to an equivalent index (round-trip property)
