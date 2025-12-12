# Requirements Document

## Introduction

本功能优化双页模式下的图片拼接布局，参考NeeView的实现。当一横一竖图片组合时，不再简单对半分，而是自动调整缩放比例保证竖边（高度）对齐。这种智能布局在纵向上能节省空间，提供更好的阅读体验。

核心思想：
- 当两张图片高度不同时，将较矮的图片按比例放大，使两张图片高度一致
- 这样可以避免一张图片上下留白过多的问题
- 特别适用于横向图片（如跨页）与竖向图片组合的场景

## Glossary

- **Double Page Mode（双页模式）**: 同时显示两张图片的阅读模式
- **Wide Page（宽页/横向页）**: 宽度大于高度的图片，通常是跨页或横向构图
- **Portrait Page（竖向页）**: 高度大于宽度的图片，通常是单页漫画
- **Uniform Height（高度统一）**: 将两张图片缩放到相同高度的对齐方式
- **Uniform Width（宽度统一）**: 将两张图片缩放到相同宽度的对齐方式
- **Content Scale（内容缩放）**: 应用于单个页面元素的缩放比例，用于对齐
- **Frame Scale（帧缩放）**: 应用于整个帧的缩放比例，用于适应视口
- **WidePageStretch**: 宽页拉伸模式，控制双页模式下不同尺寸图片的对齐方式

## Requirements

### Requirement 1

**User Story:** As a reader, I want images in double page mode to be aligned by height, so that I can have a better reading experience without excessive whitespace.

#### Acceptance Criteria

1. WHEN the system displays two images in double page mode THEN the system SHALL calculate individual scale factors for each image to achieve uniform height
2. WHEN two images have different heights THEN the system SHALL scale the shorter image up proportionally to match the taller image's height
3. WHEN two images have the same height THEN the system SHALL apply a scale factor of 1.0 to both images
4. WHEN height alignment is applied THEN the system SHALL preserve each image's aspect ratio

### Requirement 2

**User Story:** As a reader, I want to choose different alignment modes for double page display, so that I can customize the layout according to my preference.

#### Acceptance Criteria

1. WHEN the user selects "None" alignment mode THEN the system SHALL display both images at their original proportions without additional scaling
2. WHEN the user selects "Uniform Height" alignment mode THEN the system SHALL scale images to have matching heights
3. WHEN the user selects "Uniform Width" alignment mode THEN the system SHALL scale images to have matching widths
4. WHEN the alignment mode setting is changed THEN the system SHALL immediately update the display to reflect the new mode

### Requirement 3

**User Story:** As a developer, I want the alignment calculation to be performed in the Rust backend, so that the frontend receives pre-calculated scale values for efficient rendering.

#### Acceptance Criteria

1. WHEN building a double page frame THEN the Rust backend SHALL calculate and include individual scale factors for each PageFrameElement
2. WHEN the frontend receives frame data THEN the frame data SHALL contain pre-calculated scale values for each element
3. WHEN rendering images THEN the frontend SHALL apply the received scale values to each image independently

### Requirement 4

**User Story:** As a reader, I want the combined frame to fit within the viewport after alignment, so that I don't need to scroll to see the full content.

#### Acceptance Criteria

1. WHEN displaying an aligned double page frame THEN the system SHALL calculate a frame-level scale to fit the combined content within the viewport
2. WHEN the combined width exceeds viewport width THEN the system SHALL reduce the frame scale proportionally
3. WHEN the combined height exceeds viewport height THEN the system SHALL reduce the frame scale proportionally
4. WHEN applying frame scale THEN the system SHALL maintain the relative proportions established by content alignment

### Requirement 5

**User Story:** As a reader, I want vertical alignment options for the images within the frame, so that I can choose how images are positioned when they have different heights after scaling.

#### Acceptance Criteria

1. WHEN displaying aligned images with "Top" vertical alignment THEN the system SHALL align both images to the top edge
2. WHEN displaying aligned images with "Center" vertical alignment THEN the system SHALL center both images vertically
3. WHEN displaying aligned images with "Bottom" vertical alignment THEN the system SHALL align both images to the bottom edge

### Requirement 6

**User Story:** As a developer, I want the scale calculation to be serialized and deserialized correctly, so that the frontend can receive accurate scale values.

#### Acceptance Criteria

1. WHEN serializing PageFrameElement to JSON THEN the system SHALL include the scale field with the calculated value
2. WHEN deserializing PageFrameElement from JSON THEN the system SHALL correctly parse the scale field
3. WHEN the scale field is missing in JSON THEN the system SHALL default to a scale value of 1.0
