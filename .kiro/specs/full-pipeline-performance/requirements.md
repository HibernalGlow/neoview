# Requirements Document

## Introduction

本文档定义了 NeoView 全流程性能优化的需求规格。在现有流式目录加载（file-loading-performance）的基础上，进一步优化图像加载、渲染和 UI 响应性能。

当前系统已实现：
- 流式目录加载（Tauri Channel）
- 目录缓存（LRU + mtime 验证）
- 虚拟化列表

本次优化目标：
- 优化图像解码和渲染流程，减少主线程阻塞
- 实现智能预加载策略，提升翻页流畅度
- 优化 IPC 通信效率，减少序列化开销
- 提升大图像（>10MB）的加载性能
- 确保 UI 在任何操作下保持 60fps 响应

## Glossary

- **ImagePool**: 图像池，管理图像的加载、缓存和生命周期
- **Preloader**: 预加载器，提前加载即将显示的图像
- **IPC**: 进程间通信（Inter-Process Communication），Tauri 前后端通信机制
- **Base64**: 二进制数据的文本编码格式，用于 IPC 传输
- **Blob**: 二进制大对象，浏览器中的二进制数据容器
- **Object URL**: 浏览器为 Blob 创建的临时 URL
- **Web Worker**: 浏览器后台线程，用于执行耗时操作
- **OffscreenCanvas**: 离屏画布，支持在 Worker 中进行图像处理
- **RequestIdleCallback**: 浏览器空闲时执行回调的 API
- **IntersectionObserver**: 监测元素可见性的 API

## Requirements

### Requirement 1

**User Story:** As a user, I want images to load instantly when flipping pages, so that I can browse smoothly without waiting.

#### Acceptance Criteria

1. WHEN a user flips to the next/previous page THEN the System SHALL display the image within 50ms if it was preloaded
2. WHEN the user is viewing a page THEN the System SHALL preload the next 3 pages and previous 1 page in the background
3. WHEN preloading images THEN the System SHALL use low priority requests that do not block current page rendering
4. WHEN memory usage exceeds the configured limit THEN the System SHALL evict least recently used images from the preload cache
5. WHEN the user rapidly flips through pages THEN the System SHALL cancel pending preloads for skipped pages

### Requirement 2

**User Story:** As a user, I want the UI to remain responsive while loading large images, so that I can continue interacting with the application.

#### Acceptance Criteria

1. WHEN loading an image larger than 5MB THEN the System SHALL decode the image in a background thread
2. WHEN decoding an image THEN the System SHALL yield to the main thread every 16ms to maintain 60fps
3. WHILE an image is loading THEN the System SHALL display a placeholder with loading progress
4. WHEN the user interacts with the UI during image loading THEN the System SHALL respond within 100ms
5. IF image decoding fails THEN the System SHALL display an error placeholder and log the error

### Requirement 3

**User Story:** As a user, I want thumbnails to load progressively without freezing the file browser, so that I can navigate folders smoothly.

#### Acceptance Criteria

1. WHEN displaying a folder with many images THEN the System SHALL load thumbnails in batches of 10
2. WHEN loading thumbnails THEN the System SHALL prioritize visible items over off-screen items
3. WHILE thumbnails are loading THEN the System SHALL display placeholder images
4. WHEN the user scrolls the file list THEN the System SHALL cancel thumbnail requests for items that scrolled out of view
5. WHEN thumbnail loading is complete THEN the System SHALL cache thumbnails for instant display on revisit

### Requirement 4

**User Story:** As a developer, I want efficient IPC communication, so that data transfer between frontend and backend does not become a bottleneck.

#### Acceptance Criteria

1. WHEN transferring image data via IPC THEN the System SHALL use binary transfer instead of Base64 when supported
2. WHEN multiple small requests are pending THEN the System SHALL batch them into a single IPC call
3. WHEN transferring large data (>1MB) THEN the System SHALL use streaming transfer with progress reporting
4. WHEN IPC errors occur THEN the System SHALL retry with exponential backoff up to 3 times
5. WHEN the backend is processing a request THEN the System SHALL not block other IPC channels

### Requirement 5

**User Story:** As a user, I want archive files to open quickly, so that I can start reading without long waits.

#### Acceptance Criteria

1. WHEN opening an archive file THEN the System SHALL display the first page within 500ms
2. WHEN listing archive contents THEN the System SHALL stream the file list instead of waiting for complete extraction
3. WHEN extracting images from archives THEN the System SHALL use parallel extraction for multiple pages
4. WHEN the same archive is reopened THEN the System SHALL use cached file list and extracted images
5. IF archive extraction fails for a page THEN the System SHALL skip to the next page and report the error

### Requirement 6

**User Story:** As a user, I want smooth scrolling in the file browser, so that I can navigate large folders without lag.

#### Acceptance Criteria

1. WHEN scrolling the file list THEN the System SHALL maintain 60fps frame rate
2. WHEN rendering file items THEN the System SHALL use virtualization to render only visible items
3. WHEN the file list updates THEN the System SHALL batch DOM updates to minimize reflows
4. WHEN sorting or filtering the file list THEN the System SHALL complete the operation within 100ms for up to 10000 items
5. WHEN the user stops scrolling THEN the System SHALL load detailed metadata for visible items within 200ms

### Requirement 7

**User Story:** As a developer, I want to monitor performance metrics, so that I can identify and fix performance bottlenecks.

#### Acceptance Criteria

1. WHEN performance monitoring is enabled THEN the System SHALL track image load times, IPC latency, and frame rates
2. WHEN a performance metric exceeds threshold THEN the System SHALL log a warning with context information
3. WHEN the developer requests performance data THEN the System SHALL provide aggregated statistics
4. WHEN performance issues are detected THEN the System SHALL suggest optimization actions

### Requirement 8

**User Story:** As a user, I want the application to adapt to my system's capabilities, so that it performs well on both high-end and low-end devices.

#### Acceptance Criteria

1. WHEN the application starts THEN the System SHALL detect available memory and CPU cores
2. WHEN system resources are limited THEN the System SHALL reduce preload count and cache size
3. WHEN the system is under heavy load THEN the System SHALL defer non-critical operations
4. WHEN memory pressure is detected THEN the System SHALL proactively release cached resources

