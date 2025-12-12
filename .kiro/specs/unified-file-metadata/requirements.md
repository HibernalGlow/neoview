# Requirements Document

## Introduction

本功能旨在解决 NeoView 中文件元数据管理的两个核心问题：

1. **信息面板图像信息卡片无法读取图片数据** - 当前 `ImageInfoCard` 依赖 `infoPanelStore.imageInfo`，但只有视频播放器会设置该数据，图片查看时没有代码更新图片元数据。

2. **文件元数据获取入口分散** - 前端和后端存在多个获取文件元数据的方式（`getFileMetadata`、`get_file_info`、`Page` 类型中的元数据、压缩包内文件元数据等），导致重复加载和难以维护。

本功能将统一所有文件元数据（包括普通文件和压缩包内部文件）的获取入口，实现前后端元数据复用，减少重复加载，并确保图像信息卡片能正确显示当前查看图片的元数据。

## Glossary

- **FileMetadata**: 文件元数据，包含文件名、路径、大小、修改时间、创建时间等基础信息
- **ImageMetadata**: 图像元数据，继承 FileMetadata，额外包含宽度、高度、格式、色深等图像特有信息
- **ArchiveEntry**: 压缩包内部条目，包含内部路径和相关元数据
- **MetadataService**: 统一的元数据服务，负责获取、缓存和分发文件元数据
- **infoPanelStore**: 信息面板状态存储，包含 bookInfo 和 imageInfo
- **bookStore**: 书籍状态存储，管理当前打开的书籍和页面信息
- **Page**: 书籍中的单个页面，包含路径、尺寸等信息

## Requirements

### Requirement 1

**User Story:** As a user, I want to see the current image's metadata in the info panel, so that I can understand the image's properties while viewing.

#### Acceptance Criteria

1. WHEN a user navigates to a new page in the viewer THEN the MetadataService SHALL update the infoPanelStore with the current image's metadata within 100ms
2. WHEN the image metadata includes width and height THEN the ImageInfoCard SHALL display the dimensions in "width × height" format
3. WHEN the image is from an archive THEN the MetadataService SHALL retrieve metadata from the archive entry and display it correctly
4. WHEN the image metadata is not yet available THEN the ImageInfoCard SHALL display placeholder text "—" for missing fields
5. WHEN the user switches between images rapidly THEN the MetadataService SHALL cancel pending metadata requests and only display the current image's metadata

### Requirement 2

**User Story:** As a developer, I want a unified metadata service, so that I can easily retrieve file metadata from a single entry point without duplicating code.

#### Acceptance Criteria

1. WHEN any component requests file metadata THEN the MetadataService SHALL provide a single API entry point for both regular files and archive entries
2. WHEN metadata is requested for a file that was recently accessed THEN the MetadataService SHALL return cached metadata without making a new backend request
3. WHEN the backend has already loaded metadata for a file THEN the frontend SHALL reuse that metadata instead of requesting it again
4. WHEN metadata is requested for an archive entry THEN the MetadataService SHALL accept both archive path and inner path parameters
5. WHEN the MetadataService cache exceeds 1000 entries THEN the service SHALL evict least recently used entries to maintain memory efficiency

### Requirement 3

**User Story:** As a developer, I want the Page type to include complete image metadata, so that I can access image dimensions and other properties without additional API calls.

#### Acceptance Criteria

1. WHEN a book is opened THEN the backend SHALL populate Page objects with available metadata including width, height, size, and modified time
2. WHEN image dimensions are loaded from the image decoder THEN the bookStore SHALL update the corresponding Page object's width and height
3. WHEN a Page object already has metadata THEN the MetadataService SHALL use that metadata instead of making a new request
4. WHEN metadata is updated for a Page THEN the MetadataService SHALL synchronize the update to infoPanelStore if it's the current page

### Requirement 4

**User Story:** As a user, I want consistent metadata display across all panels, so that I see the same information regardless of where I look.

#### Acceptance Criteria

1. WHEN the same file's metadata is displayed in multiple locations THEN all displays SHALL show identical information
2. WHEN metadata is updated from any source THEN all subscribed components SHALL receive the update within 50ms
3. WHEN the viewer displays an image THEN the ImageInfoCard, InfoOverlay, and any other metadata displays SHALL show synchronized information

### Requirement 5

**User Story:** As a developer, I want to extend the metadata system easily, so that I can add new metadata fields without major refactoring.

#### Acceptance Criteria

1. WHEN a new metadata field is added to the backend THEN the MetadataService SHALL support the new field without breaking existing functionality
2. WHEN the MetadataService receives unknown metadata fields THEN it SHALL preserve them in a generic metadata object for future use
3. WHEN components subscribe to metadata updates THEN they SHALL receive only the fields they are interested in through selective subscription

