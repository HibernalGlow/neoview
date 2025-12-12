# Requirements Document

## Introduction

本文档定义了 NeoView 页面系统彻底重构的需求规格。目标是完整复刻 NeeView 的页面管理架构和加载系统，在功能和性能上达到与原版相当的水平。

### 当前系统问题

1. **图像加载性能不足** - 相比 NeeView 原版，加载速度明显较慢，翻页有明显延迟
2. **切换图片时缩放异常** - 横竖图切换时有概率出现缩放跳动
3. **横屏图分割功能不完善** - 漫画阅读模式下的双页分割和步长计算存在问题
4. **前端加载逻辑复杂** - 加载逻辑分散在前端，难以优化和维护
5. **缓存管理不智能** - 简单 LRU 策略，不考虑阅读方向和页面距离

### 重构目标

参考 NeeView 的架构设计，实现：

1. **后端主导的加载系统** - JobEngine + PageContentManager，前端只负责展示
2. **三层页面架构** - Page → PageFrameElement → PageFrame
3. **智能缓存驱逐** - 基于页面距离和阅读方向的驱逐策略
4. **优先级任务调度** - 当前页 > 预加载 > 缩略图
5. **完整的双页/分割支持** - 包括首页单独显示、横向视为双页等

### NeeView 核心架构参考

```
┌─────────────────────────────────────────────────────────────┐
│                      UI Layer                               │
│  PageFrameContent → ViewContent → ImageContentControl       │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                   PageFrame Layer                           │
│  PageFrame ─── PageFrameElement ─── PageRange               │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                   Page Layer                                │
│  Page ─── PageContent ─── PageSource ─── ArchiveEntry       │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                   Job Engine                                │
│  JobEngine ─── JobScheduler ─── JobWorker(N) ─── JobClient  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                   Memory Layer                              │
│  BookMemoryService ─── MemoryPool ─── IMemoryElement        │
└─────────────────────────────────────────────────────────────┘
```

## Glossary

- **Page（页面）**: 实际的图片文件实体，包含路径、尺寸、内容等
- **PageContent（页面内容）**: 页面的加载内容，支持异步加载和取消
- **PageFrameElement（页面帧元素）**: 页面在帧中的表示，可能是完整页面或分割后的半页
- **PageFrame（页面帧）**: 当前显示的内容单位，可包含 1-2 个 PageFrameElement
- **PageRange（页面范围）**: 表示页面位置的范围，支持分割页面的 Part 概念
- **PagePosition（页面位置）**: 页面索引 + Part 索引的组合
- **JobEngine（任务引擎）**: 后端任务调度系统，管理 Worker 池
- **JobScheduler（任务调度器）**: 优先级队列，支持任务取消和去重
- **JobWorker（工作线程）**: 按优先级范围处理任务的工作线程
- **MemoryPool（内存池）**: 页面缓存池，支持距离驱逐策略
- **BookContext（书籍上下文）**: 当前书籍的状态信息
- **PageFrameContext（帧上下文）**: 页面帧的配置和状态信息
- **IsSupportedDividePage（支持分割页面）**: 单页模式下是否分割横向页面
- **IsSupportedWidePage（支持宽页）**: 双页模式下横向页面是否独占显示
- **IsSupportedSingleFirstPage（首页单独显示）**: 双页模式下首页是否单独显示
- **ContentSizeCalculator（内容尺寸计算器）**: 计算页面显示尺寸和缩放比例

## Requirements

### Requirement 1: 后端任务调度系统

**User Story:** As a developer, I want a backend job engine that manages all loading tasks, so that the frontend only needs to display content without managing complex loading logic.

#### Acceptance Criteria

1. WHEN the backend receives a page load request THEN the System SHALL create a Job with appropriate priority and submit it to the JobScheduler
2. WHEN multiple jobs are pending THEN the System SHALL process them in priority order (CurrentPage=90 > Preload=50 > Thumbnail=10)
3. WHEN a new job with the same key is submitted THEN the System SHALL cancel the existing job and replace it with the new one
4. WHEN a job is cancelled THEN the System SHALL stop processing immediately and release resources
5. WHEN the JobEngine starts THEN the System SHALL create multiple JobWorkers (default 2 primary + 2 secondary)
6. WHEN a primary worker is idle THEN the System SHALL only process high-priority jobs (priority >= 10)
7. WHEN a secondary worker is idle THEN the System SHALL process any pending job

### Requirement 2: 智能内存池管理

**User Story:** As a user, I want the application to manage memory intelligently based on my reading direction, so that pages I'm likely to view next are kept in cache.

#### Acceptance Criteria

1. WHEN a page is loaded THEN the System SHALL store it in the MemoryPool with its page index and access timestamp
2. WHEN memory usage exceeds the configured limit THEN the System SHALL evict pages using distance-based strategy
3. WHEN evicting pages THEN the System SHALL prioritize pages that are far from the current page in the opposite reading direction
4. WHEN a page is being displayed THEN the System SHALL lock it to prevent eviction
5. WHEN a book is closed THEN the System SHALL clear all cached pages for that book
6. WHEN the user changes reading direction THEN the System SHALL update the eviction priority calculation

### Requirement 3: PageFrame 三层架构

**User Story:** As a user, I want the page display system to support complex layouts including split pages and double-page spreads, so that I can read manga in the intended format.

#### Acceptance Criteria

1. WHEN a book is opened THEN the System SHALL create Page objects for each image file with metadata (path, size, dimensions)
2. WHEN building a PageFrame THEN the System SHALL create PageFrameElements that reference Pages with optional crop information
3. WHEN IsSupportedDividePage is enabled AND a page is landscape THEN the System SHALL create two PageFrameElements (left half, right half) from one Page
4. WHEN in double-page mode THEN the System SHALL combine up to two PageFrameElements into a single PageFrame
5. WHEN IsSupportedWidePage is enabled AND a page is landscape THEN the System SHALL display it alone in the PageFrame
6. WHEN IsSupportedSingleFirstPage is enabled THEN the System SHALL display the first page alone in its PageFrame

### Requirement 4: 页面范围和位置计算

**User Story:** As a user, I want accurate page navigation that accounts for split pages and double-page mode, so that I can navigate predictably.

#### Acceptance Criteria

1. WHEN representing a page position THEN the System SHALL use PagePosition (index + part) where part indicates which half of a split page
2. WHEN representing a page range THEN the System SHALL use PageRange that can span multiple pages and parts
3. WHEN navigating forward in single-page split mode THEN the System SHALL move to the next part or next page as appropriate
4. WHEN navigating forward in double-page mode THEN the System SHALL move by the appropriate step (1 for wide pages, 2 for paired pages)
5. WHEN calculating the total page count THEN the System SHALL account for split pages (e.g., 10 physical pages with 2 landscape = 12 virtual pages)
6. WHEN the user jumps to a specific page THEN the System SHALL navigate to the correct PageFrame containing that page

### Requirement 5: 横向页面分割

**User Story:** As a user, I want landscape images to be split into two pages in manga reading mode, so that I can read double-page spreads correctly.

#### Acceptance Criteria

1. WHEN IsSupportedDividePage is enabled AND the current image has aspect ratio > DividePageRate THEN the System SHALL treat it as a split page
2. WHEN displaying a split page THEN the System SHALL use CSS clip-path to show only the relevant half without duplicating image data
3. WHEN the reading direction is RTL THEN the System SHALL display the right half first, then the left half
4. WHEN the reading direction is LTR THEN the System SHALL display the left half first, then the right half
5. WHEN a split page is displayed THEN the System SHALL share the same image cache entry for both halves
6. WHEN DividePageRate setting changes THEN the System SHALL recalculate which pages are split

### Requirement 6: 双页模式配对

**User Story:** As a user, I want double page mode to correctly pair pages according to manga conventions, so that I can view spreads as intended.

#### Acceptance Criteria

1. WHEN in double page mode AND both current and next pages are portrait THEN the System SHALL display them side by side in a single PageFrame
2. WHEN in double page mode AND IsSupportedWidePage is enabled AND current page is landscape THEN the System SHALL display only the current page
3. WHEN in double page mode AND IsSupportedWidePage is enabled AND next page is landscape THEN the System SHALL display only the current page alone
4. WHEN in double page mode with RTL direction THEN the System SHALL display pages in right-to-left order (CSS flex-direction: row-reverse)
5. WHEN IsSupportedSingleFirstPage is enabled THEN the System SHALL not pair the first page with the second page
6. WHEN IsSupportedSingleLastPage is enabled THEN the System SHALL not pair the last page with the previous page

### Requirement 7: 图像切换无闪烁

**User Story:** As a user, I want smooth image transitions without scale jumping or flickering, so that I have a seamless viewing experience.

#### Acceptance Criteria

1. WHEN switching between images THEN the System SHALL calculate the new scale using pre-cached dimensions before the image loads
2. WHEN the new image's dimensions are known THEN the System SHALL apply the scale atomically with the image source change
3. WHEN transitioning between images THEN the System SHALL prevent any intermediate scale values from being displayed
4. WHEN the preload cache has the next image THEN the System SHALL use the preloaded data immediately without re-fetching
5. WHEN using layer-based rendering THEN the System SHALL keep previous/next pages in hidden layers for instant switching

### Requirement 8: 预加载管道

**User Story:** As a user, I want images to be preloaded based on my reading direction, so that page flipping is instant.

#### Acceptance Criteria

1. WHEN viewing a page THEN the System SHALL preload the next 5 pages in the reading direction with Preload priority
2. WHEN viewing a page THEN the System SHALL preload the previous 2 pages with lower Preload priority
3. WHEN the user changes pages THEN the System SHALL cancel preload jobs for pages that are no longer in the preload window
4. WHEN a preloaded page is accessed THEN the System SHALL return it from cache within 50ms
5. WHEN the user rapidly flips through pages THEN the System SHALL prioritize the current page over preloads

### Requirement 9: 内容尺寸计算

**User Story:** As a user, I want images to be displayed at the correct size according to my stretch mode settings, so that I can view them comfortably.

#### Acceptance Criteria

1. WHEN calculating display size THEN the System SHALL use ContentSizeCalculator with the current StretchMode
2. WHEN StretchMode is Uniform THEN the System SHALL fit the image within the viewport while maintaining aspect ratio
3. WHEN StretchMode is UniformToFill THEN the System SHALL fill the viewport while maintaining aspect ratio (may crop)
4. WHEN StretchMode is UniformToVertical THEN the System SHALL fit the image height to the viewport height
5. WHEN StretchMode is UniformToHorizontal THEN the System SHALL fit the image width to the viewport width
6. WHEN AutoRotate is enabled AND the image orientation doesn't match the viewport THEN the System SHALL rotate the image 90 degrees

### Requirement 10: 设置切换时保持位置

**User Story:** As a user, I want my reading position to be preserved when I change view settings, so that I don't lose my place.

#### Acceptance Criteria

1. WHEN IsSupportedDividePage is toggled THEN the System SHALL maintain the current reading position in the physical page
2. WHEN PageMode is switched between single and double THEN the System SHALL navigate to the PageFrame containing the current page
3. WHEN reading direction is changed THEN the System SHALL update the display order without changing the current page
4. WHEN any view setting changes THEN the System SHALL recalculate the current PageFrame within 100ms
5. WHEN BaseScale is changed THEN the System SHALL apply the new scale immediately without reloading images

### Requirement 11: 前端简化

**User Story:** As a developer, I want the frontend to be a simple display layer, so that all complex logic is handled by the backend.

#### Acceptance Criteria

1. WHEN the frontend needs to display a page THEN the System SHALL request binary data from the backend via IPC
2. WHEN the backend sends page data THEN the System SHALL use binary transfer (not Base64) for efficiency
3. WHEN page state changes THEN the System SHALL receive events from the backend (page_loaded, page_unloaded, memory_pressure)
4. WHEN the frontend receives page data THEN the System SHALL create a Blob URL and display it immediately
5. WHEN the frontend navigates THEN the System SHALL only send the target page index to the backend

### Requirement 12: 错误处理和恢复

**User Story:** As a user, I want the application to handle errors gracefully, so that I can continue viewing even when some pages fail to load.

#### Acceptance Criteria

1. IF a page fails to load THEN the System SHALL display an error placeholder and log the error
2. IF a page load times out THEN the System SHALL retry with exponential backoff up to 3 times
3. IF the archive is corrupted THEN the System SHALL skip corrupted entries and continue with valid pages
4. IF memory pressure is detected THEN the System SHALL proactively release cached resources
5. WHEN an error occurs in any component THEN the System SHALL emit an error event without crashing the viewer

