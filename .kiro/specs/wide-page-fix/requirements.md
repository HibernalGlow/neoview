# Requirements Document

## Introduction

本文档定义了"横向视为双页"功能的 bug 修复需求。当前实现存在以下问题：

1. **横向页跳过问题**：在双页模式下，当第二页是横向图时，会被跳过而不是独占显示
2. **纵向全景双页模式冲突**：横向视为双页功能与纵向全景双页模式的交互逻辑不完善
3. **步进计算不一致**：翻页步进计算与帧构建逻辑不一致，导致导航混乱

### 参考实现

NeeView 的 `PageFrameFactory.CreatePageFrame` 方法实现了正确的逻辑：
- 当前页是横向 → 独占显示
- 下一页是横向 → 当前页独占显示（不与横向页配对）
- 这确保每个横向页都能独占显示，不会被跳过

### 修复目标

1. 修复横向页被跳过的 bug
2. 确保横向视为双页与纵向全景模式的正确交互
3. 统一帧构建和步进计算逻辑

## Glossary

- **横向视为双页（IsSupportedWidePage）**: 双页模式下，横向图片独占整个双页区域的功能
- **纵向全景双页模式**: 双页模式 + 纵向排列（vertical orientation），两页上下排列
- **PageFrame（页面帧）**: 当前显示的内容单位，可包含 1-2 个页面
- **PageFrameElement（页面帧元素）**: 页面在帧中的表示
- **步进（Step）**: 翻页时跳过的页面数量
- **帧构建（Frame Building）**: 根据当前页面索引和配置构建显示帧的过程

## Requirements

### Requirement 1: 横向页独占显示

**User Story:** As a user, I want landscape images to be displayed alone in double-page mode when "treat horizontal as double page" is enabled, so that I can view wide images without them being paired with other pages.

#### Acceptance Criteria

1. WHEN in double-page mode AND IsSupportedWidePage is enabled AND the current page is landscape THEN the System SHALL display only the current page in the frame
2. WHEN in double-page mode AND IsSupportedWidePage is enabled AND the next page is landscape THEN the System SHALL display only the current page in the frame (not pairing with the landscape page)
3. WHEN navigating forward from a landscape page THEN the System SHALL move to the next page (step = 1)
4. WHEN navigating forward to a landscape page THEN the System SHALL display that landscape page alone

### Requirement 2: 步进计算一致性

**User Story:** As a user, I want page navigation to be consistent with the displayed frames, so that I don't skip pages or see unexpected behavior.

#### Acceptance Criteria

1. WHEN calculating page step THEN the System SHALL use the same logic as frame building
2. WHEN the current page is landscape AND IsSupportedWidePage is enabled THEN the System SHALL use step = 1
3. WHEN the next page is landscape AND IsSupportedWidePage is enabled THEN the System SHALL use step = 1 (current page alone)
4. WHEN both current and next pages are portrait THEN the System SHALL use step = 2 (normal double page)

### Requirement 3: 纵向全景双页模式兼容

**User Story:** As a user, I want the "treat horizontal as double page" feature to work correctly with vertical orientation double-page mode, so that I can view manga in vertical scroll mode.

#### Acceptance Criteria

1. WHEN in double-page mode with vertical orientation AND IsSupportedWidePage is enabled AND the current page is landscape THEN the System SHALL display only the current page
2. WHEN in double-page mode with vertical orientation AND IsSupportedWidePage is enabled AND the next page is landscape THEN the System SHALL display only the current page
3. WHEN orientation is vertical THEN the System SHALL apply the same IsSupportedWidePage logic as horizontal orientation

### Requirement 4: 后端帧构建器修复

**User Story:** As a developer, I want the backend PageFrameBuilder to correctly handle landscape pages, so that the frame building logic is consistent.

#### Acceptance Criteria

1. WHEN building a double frame AND the next page is landscape AND IsSupportedWidePage is enabled THEN the PageFrameBuilder SHALL return a single-element frame
2. WHEN building a double frame AND the current page is landscape AND IsSupportedWidePage is enabled THEN the PageFrameBuilder SHALL return a single-element frame
3. WHEN calculating next frame position THEN the PageFrameBuilder SHALL account for landscape pages correctly

### Requirement 5: 前端帧构建修复

**User Story:** As a developer, I want the frontend frame building utilities to correctly handle landscape pages, so that the display matches the backend logic.

#### Acceptance Criteria

1. WHEN buildFrameImages is called with a landscape current page AND treatHorizontalAsDoublePage is enabled THEN the function SHALL return only the current image
2. WHEN buildFrameImages is called with a landscape next page AND treatHorizontalAsDoublePage is enabled THEN the function SHALL return only the current image
3. WHEN getPageStep is called THEN the function SHALL return consistent step values with buildFrameImages

### Requirement 6: 首页/尾页单独显示功能

**User Story:** As a user, I want to configure whether the first and last pages should be displayed alone in double-page mode, so that I can properly view manga covers and back covers.

#### Acceptance Criteria

1. WHEN in double-page mode AND IsSupportedSingleFirst is enabled AND the current page is the first page THEN the System SHALL display only the first page
2. WHEN in double-page mode AND IsSupportedSingleFirst is enabled AND the next page is the first page THEN the System SHALL display only the current page
3. WHEN in double-page mode AND IsSupportedSingleLast is enabled AND the current page is the last page THEN the System SHALL display only the last page
4. WHEN in double-page mode AND IsSupportedSingleLast is enabled AND the next page is the last page THEN the System SHALL display only the current page
5. WHEN the user toggles the single first/last page settings THEN the System SHALL update the display immediately

