# Requirements Document

## Introduction

重构前端代码，移除所有 Tauri IPC (`invoke`) 调用，全面使用 Python HTTP API。这是 Python 后端迁移的第二阶段，确保前端在 Web 模式下完全独立于 Tauri 运行。

## Glossary

- **Python_Backend**: Python FastAPI 后端服务，运行在 `http://localhost:8000/v1`
- **invoke**: Tauri IPC 调用函数，用于前端与 Rust 后端通信
- **http-bridge**: 前端 HTTP API 桥接层，封装 Python 后端调用

## Requirements

### Requirement 1

**User Story:** As a developer, I want to remove all Tauri invoke calls from the frontend, so that the application can run in pure Web mode.

#### Acceptance Criteria

1. WHEN the frontend loads THEN the System SHALL not make any calls to `localhost:3457` or Tauri IPC
2. WHEN the frontend needs file system operations THEN the System SHALL use Python HTTP API endpoints
3. WHEN the frontend needs thumbnail operations THEN the System SHALL use Python HTTP API endpoints
4. WHEN the frontend needs directory operations THEN the System SHALL use Python HTTP API endpoints

### Requirement 2

**User Story:** As a user, I want to browse directories in Web mode, so that I can view my files without Tauri.

#### Acceptance Criteria

1. WHEN a user opens a directory THEN the System SHALL call `/v1/directory/list` or `/v1/directory/snapshot`
2. WHEN a user navigates to a subdirectory THEN the System SHALL update the view using Python API responses
3. WHEN directory listing fails THEN the System SHALL display an appropriate error message

### Requirement 3

**User Story:** As a user, I want to view thumbnails in Web mode, so that I can preview my images.

#### Acceptance Criteria

1. WHEN thumbnails are requested THEN the System SHALL use `/v1/thumbnail` endpoint
2. WHEN batch thumbnails are needed THEN the System SHALL use `/v1/thumbnail/batch` endpoint
3. WHEN thumbnail cache operations are needed THEN the System SHALL use appropriate Python API endpoints

### Requirement 4

**User Story:** As a user, I want to view images in Web mode, so that I can read my comics and manga.

#### Acceptance Criteria

1. WHEN an image is displayed THEN the System SHALL use `/v1/file` endpoint for regular files
2. WHEN an archive image is displayed THEN the System SHALL use `/v1/archive/extract` endpoint
3. WHEN image metadata is needed THEN the System SHALL use `/v1/metadata/image` endpoint

### Requirement 5

**User Story:** As a user, I want upscale functionality in Web mode, so that I can enhance my images.

#### Acceptance Criteria

1. WHEN upscale is requested THEN the System SHALL use `/v1/upscale/request` endpoint
2. WHEN upscale status is checked THEN the System SHALL use `/v1/upscale/status/{task_id}` endpoint
3. WHEN upscale is cancelled THEN the System SHALL use `/v1/upscale/cancel/{task_id}` endpoint

### Requirement 6

**User Story:** As a user, I want book management in Web mode, so that I can read my books.

#### Acceptance Criteria

1. WHEN a book is opened THEN the System SHALL use `/v1/book/open` endpoint
2. WHEN navigating pages THEN the System SHALL use `/v1/book/navigate` endpoint
3. WHEN closing a book THEN the System SHALL use `/v1/book/close` endpoint
