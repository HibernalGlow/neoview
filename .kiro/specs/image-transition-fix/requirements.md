# Requirements Document

## Introduction

本规格文档描述了修复图片查看器在切换图片时出现的视觉跳动问题。当用户切换到下一张图片时，当前图片会先被缩小，然后新图片才以正确的缩放比例显示出来。这个问题严重影响了用户体验，需要确保图片切换时的平滑过渡。

## Glossary

- **StackView**: 层叠式图片查看器组件，负责显示和管理图片的缩放、旋转等操作
- **TransitionState**: 图片过渡状态对象，用于管理图片切换时的缩放计算
- **modeScale**: 根据缩放模式（fit/fill/fitWidth等）计算的基础缩放比例
- **effectiveScale**: 最终缩放比例，等于 modeScale × manualScale
- **loadedImageSize**: 图片加载完成后获取的实际尺寸
- **preCachedDimensions**: 预缓存的图片尺寸，来自 bookStore 的元数据
- **imageStore**: 图片状态管理器，负责加载和缓存图片
- **CurrentFrameLayer**: 当前帧渲染层，负责实际渲染图片

## Requirements

### Requirement 1

**User Story:** As a user, I want smooth image transitions when navigating between pages, so that I can enjoy a seamless viewing experience without visual glitches.

#### Acceptance Criteria

1. WHEN a user navigates to the next/previous image THEN the StackView SHALL maintain the current image display until the new image is ready to render
2. WHEN the new image begins rendering THEN the StackView SHALL apply the correct scale immediately without intermediate incorrect scales
3. WHEN image dimensions are not pre-cached THEN the StackView SHALL use a fallback strategy that prevents visual jumping
4. WHEN transitioning between images of different aspect ratios (landscape to portrait or vice versa) THEN the StackView SHALL calculate the correct target scale before displaying the new image

### Requirement 2

**User Story:** As a user, I want the image viewer to handle dimension mismatches gracefully, so that I don't see jarring scale changes during image loading.

#### Acceptance Criteria

1. WHEN pre-cached dimensions differ from actual loaded dimensions THEN the StackView SHALL smoothly adjust without visible jumping
2. WHEN image dimensions are unavailable from any source THEN the StackView SHALL use a safe default scale of 1.0 until actual dimensions are known
3. WHEN the imageStore provides dimensions THEN the StackView SHALL prioritize these over bookStore metadata for accuracy

### Requirement 3

**User Story:** As a developer, I want a reliable transition state machine, so that image transitions are predictable and debuggable.

#### Acceptance Criteria

1. WHEN a page change is detected THEN the TransitionState SHALL be initialized with the best available dimensions
2. WHEN the transition is in progress THEN the modeScale calculation SHALL use the pre-calculated targetScale
3. WHEN the image finishes loading THEN the TransitionState SHALL be cleared and normal scale calculation SHALL resume
4. WHEN multiple rapid page changes occur THEN the TransitionState SHALL handle only the most recent target page

### Requirement 4

**User Story:** As a user, I want consistent behavior regardless of image loading speed, so that fast-loading cached images and slow-loading new images both transition smoothly.

#### Acceptance Criteria

1. WHEN an image is loaded from cache (synchronous) THEN the StackView SHALL apply the correct scale immediately without transition artifacts
2. WHEN an image requires async loading THEN the StackView SHALL maintain the previous image until the new one is ready
3. WHEN the imagePool has pre-loaded dimensions THEN the StackView SHALL use these for accurate scale calculation before image display
