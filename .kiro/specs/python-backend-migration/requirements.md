# Requirements Document

## Introduction

将 neoview-tauri 的 Rust 后端核心功能迁移到 Python FastAPI 后端，以实现：
1. Web 访问兼容性（支持浏览器直接访问）
2. 统一架构（图片加载、超分、处理都走同一个 Python 后端）
3. 更灵活的部署方式（可作为独立 Web 服务）

本迁移将保留 Tauri 作为桌面应用壳，但核心图片处理、文件服务、压缩包处理等功能全部迁移到 Python 后端。

## Glossary

- **NeoView**: 图片查看器桌面应用
- **FastAPI**: Python 高性能异步 Web 框架
- **FileResponse**: FastAPI 提供的文件响应类，用于返回本地文件
- **StreamingResponse**: FastAPI 提供的流式响应类，用于大文件传输
- **Archive**: 压缩包文件（ZIP/RAR/7z）
- **Thumbnail**: 缩略图，用于文件列表预览
- **Upscale**: 图片超分辨率放大
- **mmap**: 内存映射，用于高效读取大文件
- **WebP**: 高效图片压缩格式，用于缩略图

## Requirements

### Requirement 1

**User Story:** As a user, I want to view local images through the Python backend, so that I can access images both in Tauri app and web browser.

#### Acceptance Criteria

1. WHEN a user requests a local file path THEN the Python backend SHALL return the file with correct MIME type
2. WHEN a user requests a non-existent file THEN the Python backend SHALL return HTTP 404 with error message
3. WHEN a user requests a file larger than 10MB THEN the Python backend SHALL use streaming response to avoid memory issues
4. WHEN a user requests a JXL format image THEN the Python backend SHALL decode and return as PNG format
5. WHEN a user requests an AVIF format image THEN the Python backend SHALL return the file directly (browser supported)

### Requirement 2

**User Story:** As a user, I want to browse images inside archive files (ZIP/RAR/7z), so that I can view compressed image collections without extracting them.

#### Acceptance Criteria

1. WHEN a user requests archive contents list THEN the Python backend SHALL return sorted entries with metadata (name, size, is_image, modified_time)
2. WHEN a user requests a file from ZIP archive THEN the Python backend SHALL extract and return the file content
3. WHEN a user requests a file from RAR archive THEN the Python backend SHALL extract and return the file content
4. WHEN a user requests a file from 7z archive THEN the Python backend SHALL extract and return the file content
5. WHEN a user requests archive contents THEN the Python backend SHALL cache the archive index for subsequent requests
6. WHEN extracting from archive THEN the Python backend SHALL support natural sorting for file names

### Requirement 3

**User Story:** As a user, I want to see thumbnails for images and archives, so that I can quickly preview content in file browser.

#### Acceptance Criteria

1. WHEN a user requests thumbnail for an image file THEN the Python backend SHALL generate WebP thumbnail with max 256x256 size
2. WHEN a user requests thumbnail for an archive THEN the Python backend SHALL generate thumbnail from first image inside
3. WHEN a user requests thumbnail for a video file THEN the Python backend SHALL extract frame using ffmpeg and generate WebP thumbnail
4. WHEN thumbnail is generated THEN the Python backend SHALL cache it in SQLite database for future requests
5. WHEN cached thumbnail exists THEN the Python backend SHALL return cached version without regeneration

### Requirement 4

**User Story:** As a user, I want the Python backend to perform close to Rust backend performance, so that the migration does not degrade user experience.

#### Acceptance Criteria

1. WHEN serving files THEN the Python backend SHALL use memory mapping for files larger than 10MB
2. WHEN processing CPU-intensive tasks THEN the Python backend SHALL use process pool executor
3. WHEN handling concurrent requests THEN the Python backend SHALL use async/await pattern
4. WHEN decoding JPEG images THEN the Python backend SHALL use turbojpeg library for faster decoding
5. WHEN extracting from RAR/7z THEN the Python backend SHALL use command-line tools (unrar/7z) for better performance

### Requirement 5

**User Story:** As a developer, I want the frontend to seamlessly switch from Tauri IPC to HTTP API, so that the migration is transparent to users.

#### Acceptance Criteria

1. WHEN frontend requests image THEN the frontend SHALL use HTTP URL format `{apiBase}/file?path={encodedPath}`
2. WHEN frontend requests archive content THEN the frontend SHALL use HTTP URL format `{apiBase}/archive/list?path={encodedPath}`
3. WHEN frontend requests thumbnail THEN the frontend SHALL use HTTP URL format `{apiBase}/thumbnail?path={encodedPath}`
4. WHEN Python backend starts THEN the backend SHALL provide health check endpoint at `/health`
5. WHEN Tauri app starts THEN the app SHALL launch Python backend process and wait for health check

### Requirement 6

**User Story:** As a user, I want to upscale images using the Python backend, so that I can enhance image quality.

#### Acceptance Criteria

1. WHEN a user requests image upscale THEN the Python backend SHALL queue the task and return task ID
2. WHEN upscale task completes THEN the Python backend SHALL emit event via WebSocket
3. WHEN upscale task fails THEN the Python backend SHALL return error message with details
4. WHEN querying upscale status THEN the Python backend SHALL return current progress and status

### Requirement 7

**User Story:** As a user, I want to browse directories and get file metadata, so that I can navigate the file system.

#### Acceptance Criteria

1. WHEN a user requests directory listing THEN the Python backend SHALL return files with metadata (name, size, modified_time, is_dir, is_image, is_archive)
2. WHEN a user requests image dimensions THEN the Python backend SHALL return width and height without loading full image
3. WHEN listing directory THEN the Python backend SHALL support natural sorting for file names
4. WHEN listing directory THEN the Python backend SHALL filter by supported image/archive extensions

### Requirement 8

**User Story:** As a user, I want to browse large directories efficiently, so that I can view file lists without waiting for full scan.

#### Acceptance Criteria

1. WHEN a user requests directory streaming THEN the Python backend SHALL return files in batches via WebSocket
2. WHEN streaming directory THEN the Python backend SHALL send first batch within 200ms
3. WHEN streaming directory THEN the Python backend SHALL support cancellation mid-stream
4. WHEN streaming directory THEN the Python backend SHALL report progress (loaded count, elapsed time)
5. WHEN streaming search THEN the Python backend SHALL filter files by query while streaming results

### Requirement 9

**User Story:** As a user, I want to get detailed image metadata, so that I can view image properties.

#### Acceptance Criteria

1. WHEN a user requests image metadata THEN the Python backend SHALL return path, name, size, created_at, modified_at, width, height, format
2. WHEN requesting metadata for archive image THEN the Python backend SHALL extract and return metadata without full extraction
3. WHEN image format detection fails THEN the Python backend SHALL fallback to extension-based detection

### Requirement 10

**User Story:** As a user, I want to read EPUB ebooks, so that I can view ebook images in the viewer.

#### Acceptance Criteria

1. WHEN a user opens an EPUB file THEN the Python backend SHALL parse EPUB structure and list images
2. WHEN a user requests EPUB image THEN the Python backend SHALL extract and return the image content
3. WHEN listing EPUB contents THEN the Python backend SHALL return images in reading order


