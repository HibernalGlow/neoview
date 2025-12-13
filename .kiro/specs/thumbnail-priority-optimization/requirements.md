# Requirements Document

## Introduction

优化底栏缩略图生成的优先级顺序。当前实现中，缩略图生成顺序不是从当前页向两边扩散，而是按照某种固定顺序（可能是倒序）处理，导致用户体验不佳。用户期望看到当前页附近的缩略图优先加载，而不是最后几页的缩略图先出现。

## Glossary

- **ThumbnailService**: 前端缩略图服务，负责管理缩略图的请求和缓存
- **PageManager**: 后端页面管理器，负责页面数据和缩略图的生成
- **Center-First Strategy**: 中央优先策略，从当前页开始向两边扩散加载
- **Bottom Thumbnail Bar**: 底部缩略图栏，显示书籍所有页面的缩略图预览

## Requirements

### Requirement 1

**User Story:** As a user, I want thumbnails near my current page to load first, so that I can quickly preview adjacent pages.

#### Acceptance Criteria

1. WHEN the thumbnail service requests thumbnails THEN the system SHALL process thumbnails in center-first order starting from the current page index
2. WHEN generating thumbnails THEN the system SHALL alternate between forward and backward pages relative to the current page (e.g., current, current+1, current-1, current+2, current-2, ...)
3. WHEN the user navigates to a new page THEN the system SHALL cancel pending thumbnail requests and restart with the new center index

### Requirement 2

**User Story:** As a user, I want to see visual feedback for thumbnail loading progress, so that I know the system is working.

#### Acceptance Criteria

1. WHEN a thumbnail is being generated THEN the system SHALL display a loading indicator in the thumbnail slot
2. WHEN a thumbnail generation completes THEN the system SHALL immediately display the thumbnail without waiting for other thumbnails

### Requirement 3

**User Story:** As a developer, I want the thumbnail generation order to be deterministic and testable, so that I can verify the center-first behavior.

#### Acceptance Criteria

1. WHEN the backend receives a list of thumbnail indices THEN the system SHALL sort them by distance from the center index before processing
2. WHEN sorting indices THEN the system SHALL use absolute distance from center as the primary sort key
3. WHEN two indices have equal distance from center THEN the system SHALL process the forward (larger) index first
