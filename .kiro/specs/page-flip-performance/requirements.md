# Requirements Document

## Introduction

本功能优化图片查看器的翻页性能。当前实现中，即使图片 Blob 已缓存，翻页时仍需等待浏览器解码图片（100-500ms），导致明显卡顿。

核心优化思路（参考 OpenComic）：
- **预解码**：预加载时使用 `img.decode()` 在后台完成图片解码
- **分层渲染队列**：优先渲染当前页，延迟渲染周围页
- **加载取消机制**：快速翻页时取消过时的加载任务
- **IntersectionObserver 懒解码**：只解码即将进入视口的图片

## Glossary

- **img.decode()**：浏览器 API，在后台线程解码图片，返回 Promise
- **预解码（Pre-decode）**：在图片显示前完成解码，避免显示时卡顿
- **渲染队列（Render Queue）**：管理图片加载/渲染任务的优先级队列
- **IntersectionObserver**：浏览器 API，监测元素是否进入视口
- **Blob URL**：`blob:` 协议的 URL，指向内存中的 Blob 对象

## Requirements

### Requirement 1: 预解码缓存

**User Story:** As a reader, I want page flipping to be instant, so that I can browse images without any delay.

#### Acceptance Criteria

1. WHEN an image is preloaded THEN the system SHALL also pre-decode it using `img.decode()`
2. WHEN a pre-decoded image is displayed THEN the system SHALL use the cached decoded state
3. WHEN flipping to a pre-decoded page THEN the display latency SHALL be less than 50ms
4. WHEN the pre-decode cache exceeds the limit THEN the system SHALL evict least recently used entries

### Requirement 2: 分层渲染队列

**User Story:** As a reader, I want the current page to load first, so that I can start reading immediately while other pages load in the background.

#### Acceptance Criteria

1. WHEN flipping to a new page THEN the system SHALL prioritize loading the current page
2. WHEN the current page is loaded THEN the system SHALL start loading adjacent pages (±2)
3. WHEN adjacent pages are loaded THEN the system SHALL load further pages (±5) with lower priority
4. WHEN a new page flip occurs THEN the system SHALL cancel pending low-priority loads

### Requirement 3: 加载取消机制

**User Story:** As a reader, I want fast page flipping to be responsive, so that skipping through pages doesn't cause lag.

#### Acceptance Criteria

1. WHEN rapidly flipping pages THEN the system SHALL cancel outdated load requests
2. WHEN a load is cancelled THEN the system SHALL release associated resources
3. WHEN the same page is requested again THEN the system SHALL start a fresh load
4. WHEN cancellation occurs THEN the system SHALL not display stale images

### Requirement 4: 懒解码优化

**User Story:** As a developer, I want efficient memory usage, so that the app doesn't consume excessive resources.

#### Acceptance Criteria

1. WHEN images are outside the viewport THEN the system SHALL defer decoding
2. WHEN an image enters the viewport (with margin) THEN the system SHALL trigger decoding
3. WHEN using IntersectionObserver THEN the rootMargin SHALL be at least 2000px
4. WHEN an image is decoded THEN the system SHALL mark it to avoid re-decoding

### Requirement 5: 性能监控

**User Story:** As a developer, I want to monitor page flip performance, so that I can identify and fix bottlenecks.

#### Acceptance Criteria

1. WHEN a page flip occurs THEN the system SHALL record the total latency
2. WHEN latency exceeds 100ms THEN the system SHALL log a warning with details
3. WHEN requested THEN the system SHALL provide cache hit rate statistics
4. WHEN requested THEN the system SHALL provide pre-decode queue status
