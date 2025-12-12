# Requirements Document

## Introduction

本功能优化书籍打开时的页面尺寸预加载机制。当前实现中，页面尺寸（width/height）在图片实际加载时才获取，导致"横向视为双页"等功能需要现场计算步长，造成性能问题。

核心优化思路：
- 在书籍打开时，后端异步扫描所有页面的尺寸信息
- 将尺寸信息存储在 Page 结构体中，随 BookInfo 返回给前端
- 前端直接使用预计算的尺寸信息，无需现场加载图片获取尺寸

## Glossary

- **Page Dimensions（页面尺寸）**: 图片的宽度和高度（像素）
- **Dimension Scan（尺寸扫描）**: 读取图片文件头获取尺寸信息的过程
- **WIC (Windows Imaging Component)**: Windows 原生图像解码 API
- **Lazy Loading（延迟加载）**: 仅在需要时才加载资源的策略
- **Background Scan（后台扫描）**: 在后台线程异步执行的扫描任务

## Requirements

### Requirement 1

**User Story:** As a reader, I want page dimensions to be available immediately after opening a book, so that page layout calculations are instant without waiting for image loading.

#### Acceptance Criteria

1. WHEN a book is opened THEN the system SHALL initiate a background scan of all page dimensions
2. WHEN the dimension scan completes for a page THEN the system SHALL update the Page's width and height fields
3. WHEN the frontend requests page dimensions THEN the system SHALL return pre-scanned values if available
4. WHEN dimension scanning is in progress THEN the system SHALL not block the book opening process

### Requirement 2

**User Story:** As a developer, I want efficient dimension scanning that only reads image headers, so that the scan is fast and doesn't consume excessive memory.

#### Acceptance Criteria

1. WHEN scanning image dimensions THEN the system SHALL read only the file header, not the full image data
2. WHEN scanning archive contents THEN the system SHALL use streaming extraction to minimize memory usage
3. WHEN scanning fails for a page THEN the system SHALL log the error and continue with other pages
4. WHEN all pages are scanned THEN the system SHALL report the total scan time for monitoring

### Requirement 3

**User Story:** As a reader, I want dimension information to persist across sessions, so that reopening a book is instant.

#### Acceptance Criteria

1. WHEN dimensions are scanned THEN the system SHALL cache them using the page's stable_hash as key
2. WHEN opening a previously scanned book THEN the system SHALL load cached dimensions first
3. WHEN the cache is hit THEN the system SHALL skip re-scanning that page
4. WHEN the cache entry is older than the file modification time THEN the system SHALL re-scan

### Requirement 4

**User Story:** As a developer, I want the frontend to receive dimension updates progressively, so that layout calculations can start as soon as partial data is available.

#### Acceptance Criteria

1. WHEN dimensions are scanned THEN the system SHALL emit events to notify the frontend of updates
2. WHEN the frontend receives dimension updates THEN the frontend SHALL update the local page store
3. WHEN calculating page step THEN the frontend SHALL use available dimensions or fall back to default behavior
4. WHEN all dimensions are available THEN the frontend SHALL recalculate any pending layout decisions

### Requirement 5

**User Story:** As a reader, I want the dimension scan to be cancellable, so that switching books doesn't waste resources on the previous book.

#### Acceptance Criteria

1. WHEN a new book is opened THEN the system SHALL cancel any ongoing dimension scan for the previous book
2. WHEN the scan is cancelled THEN the system SHALL release all associated resources
3. WHEN the scan is cancelled mid-progress THEN the system SHALL preserve already-scanned dimensions

