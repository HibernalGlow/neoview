# Requirements Document

## Introduction

本功能旨在优化底栏缩略图（BottomThumbnailBar）的加载速度。当前实现存在以下问题：
1. 缩略图加载延迟明显，用户体验不佳
2. 滚动时缩略图加载不够流畅
3. 缺乏有效的预加载策略
4. 前端与后端通信效率不高

参考 NeeView 的 ThumbnailList 和 ListBoxThumbnailLoader 实现，采用中央优先加载策略和高效的任务调度机制来优化加载性能。

## Glossary

- **BottomThumbnailBar**: 底部缩略图栏组件，显示当前书籍所有页面的缩略图
- **ThumbnailService**: 缩略图服务，负责管理缩略图的加载和缓存
- **Center-Priority Loading**: 中央优先加载策略，优先加载可见区域中心附近的缩略图
- **ImagePool**: 图片池，缓存已加载的图片数据
- **ThumbnailCacheStore**: 缩略图缓存存储，管理前端缩略图缓存
- **Preload Range**: 预加载范围，当前页面前后需要预加载的页数
- **Debounce**: 防抖，限制函数调用频率的技术

## Requirements

### Requirement 1

**User Story:** As a user, I want thumbnails to load quickly when I open the bottom thumbnail bar, so that I can navigate through pages efficiently.

#### Acceptance Criteria

1. WHEN the bottom thumbnail bar becomes visible THEN the system SHALL begin loading thumbnails within 100ms
2. WHEN loading thumbnails THEN the system SHALL prioritize thumbnails closest to the current page index
3. WHEN the current page changes THEN the system SHALL update the preload center and reload thumbnails accordingly
4. WHEN thumbnails are already cached THEN the system SHALL display them immediately without network requests

### Requirement 2

**User Story:** As a user, I want smooth scrolling in the thumbnail bar, so that I can browse through all pages without lag.

#### Acceptance Criteria

1. WHEN the user scrolls the thumbnail bar THEN the system SHALL load visible thumbnails with a debounce delay of 100ms maximum
2. WHEN scrolling rapidly THEN the system SHALL cancel pending thumbnail requests for non-visible areas
3. WHEN scrolling stops THEN the system SHALL complete loading all visible thumbnails within 500ms
4. WHILE scrolling THEN the system SHALL maintain 60fps rendering performance

### Requirement 3

**User Story:** As a user, I want thumbnails to be preloaded ahead of my current position, so that they are ready when I scroll to them.

#### Acceptance Criteria

1. WHEN the thumbnail bar is visible THEN the system SHALL preload thumbnails within a configurable range (default: 20 pages before and after current page)
2. WHEN preloading thumbnails THEN the system SHALL use a lower priority than visible thumbnails
3. WHEN system resources are limited THEN the system SHALL reduce preload range to maintain responsiveness
4. WHEN the book changes THEN the system SHALL clear old preload tasks and start fresh

### Requirement 4

**User Story:** As a user, I want to see placeholder images while thumbnails are loading, so that I know content is being loaded.

#### Acceptance Criteria

1. WHEN a thumbnail is not yet loaded THEN the system SHALL display a placeholder with the page number
2. WHEN a thumbnail starts loading THEN the system SHALL show a loading indicator
3. WHEN a thumbnail fails to load THEN the system SHALL display an error placeholder and not retry automatically
4. WHEN displaying placeholders THEN the system SHALL maintain consistent sizing to prevent layout shifts

### Requirement 5

**User Story:** As a user, I want the thumbnail bar to efficiently use memory, so that the application remains responsive.

#### Acceptance Criteria

1. WHEN the thumbnail cache exceeds 100MB THEN the system SHALL evict least recently used thumbnails
2. WHEN switching books THEN the system SHALL clear the previous book's thumbnail cache
3. WHEN thumbnails are evicted from memory THEN the system SHALL retain them in the database cache for faster reload
4. WHEN the application is low on memory THEN the system SHALL reduce thumbnail quality to conserve resources

### Requirement 6

**User Story:** As a user, I want thumbnails to load from cache when available, so that previously viewed pages load instantly.

#### Acceptance Criteria

1. WHEN a thumbnail exists in memory cache THEN the system SHALL return it within 1ms
2. WHEN a thumbnail exists in database cache but not memory THEN the system SHALL load it within 50ms
3. WHEN loading from database cache THEN the system SHALL update the memory cache for future access
4. WHEN the database cache is corrupted THEN the system SHALL regenerate thumbnails gracefully

### Requirement 7

**User Story:** As a user, I want the thumbnail loading to not block the main UI, so that I can continue interacting with the application.

#### Acceptance Criteria

1. WHEN generating thumbnails THEN the system SHALL perform the work in background threads
2. WHEN receiving thumbnail data THEN the system SHALL update the UI without blocking the main thread
3. WHEN multiple thumbnail requests are pending THEN the system SHALL batch them to reduce IPC overhead
4. WHEN the backend is busy THEN the system SHALL queue requests and process them in priority order

