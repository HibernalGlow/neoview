# Requirements Document

## Introduction

本文档定义了修复 NeoView 图片查看器在横竖图片切换时的视觉过渡问题。当前存在以下问题：
1. 当从横向图片切换到竖向图片（或反之）时，原图会先缩小然后才显示正确缩放的下一张图片
2. 这种视觉跳动影响用户体验，特别是在快速翻页时更为明显
3. 根本原因是图片切换时，新图片的尺寸信息尚未加载完成，导致缩放计算使用了错误的尺寸

## Glossary

- **System（系统）**: NeoView 图片查看器应用程序
- **Image Transition（图片过渡）**: 从一张图片切换到另一张图片的过程
- **Aspect Ratio（宽高比）**: 图片宽度与高度的比值，横向图片 > 1，竖向图片 < 1
- **Mode Scale（模式缩放）**: 根据当前缩放模式（fit/fill/fitWidth等）计算的基础缩放比例
- **Viewport（视口）**: 图片显示区域的尺寸
- **Pre-cached Dimensions（预缓存尺寸）**: 在图片加载前就已知的尺寸信息（来自 bookStore.currentPage）
- **Loaded Dimensions（加载后尺寸）**: 图片实际加载完成后获取的精确尺寸

## Requirements

### Requirement 1

**User Story:** As a user, I want smooth visual transitions when switching between images of different aspect ratios, so that I have a seamless viewing experience without jarring visual jumps.

#### Acceptance Criteria

1. WHEN the System switches from one image to another THEN the System SHALL calculate the new image's scale using pre-cached dimensions before the image loads
2. WHEN pre-cached dimensions are available for the next image THEN the System SHALL use those dimensions immediately for scale calculation
3. WHEN the image finishes loading THEN the System SHALL verify the scale calculation with actual dimensions and adjust if necessary

### Requirement 2

**User Story:** As a user, I want the current image to remain stable until the next image is ready to display, so that I don't see intermediate scaling artifacts.

#### Acceptance Criteria

1. WHEN a page change is initiated THEN the System SHALL maintain the current image's display state until the new image data is ready
2. WHEN the new image's scale has been calculated THEN the System SHALL apply the new scale atomically with the image source change
3. WHEN transitioning between images THEN the System SHALL prevent any intermediate scale values from being displayed

### Requirement 3

**User Story:** As a user, I want the image transition to be fast and responsive, so that I can browse through images quickly without delays.

#### Acceptance Criteria

1. WHEN switching images THEN the System SHALL complete the transition within 100 milliseconds of the new image being available
2. WHEN pre-cached dimensions are used THEN the System SHALL not wait for image load to calculate initial scale
3. WHEN the image pool has preloaded the next image THEN the System SHALL use the preloaded data immediately

### Requirement 4

**User Story:** As a user, I want consistent behavior regardless of whether I'm viewing horizontal or vertical images, so that the viewing experience is predictable.

#### Acceptance Criteria

1. WHEN switching from a horizontal image to a vertical image THEN the System SHALL display the vertical image at its correct scale immediately
2. WHEN switching from a vertical image to a horizontal image THEN the System SHALL display the horizontal image at its correct scale immediately
3. WHEN the aspect ratio changes significantly THEN the System SHALL recalculate the mode scale based on the new image's dimensions

