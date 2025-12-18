# Requirements Document

## Introduction

本功能为 NeoView 添加 Web 浏览模式。采用最小改动策略：Rust 后端新增 HTTP 服务器，直接复用现有 Tauri command 处理函数；前端仅需一个薄适配层将 `invoke` 调用转换为 HTTP 请求。类似 RSC 的思路，服务端处理所有业务逻辑，前端改动最小化。

## Glossary

- **NeoView**: 基于 Tauri + Svelte 5 的图片/漫画查看器应用
- **Tauri Command**: 后端 Rust 函数，通过 `#[tauri::command]` 宏暴露给前端
- **HTTP Bridge**: 轻量级 HTTP 服务器，将 HTTP 请求路由到现有 Tauri command 函数
- **Invoke Adapter**: 前端适配层，在浏览器环境下将 `invoke` 调用转换为 HTTP fetch

## Requirements

### Requirement 1

**User Story:** 作为开发者，我希望后端能通过 HTTP 暴露现有的 Tauri command，以便浏览器能调用相同的后端逻辑。

#### Acceptance Criteria

1. WHEN the application starts THEN the HTTP Bridge SHALL start an HTTP server alongside Tauri (default port 3456)
2. WHEN an HTTP POST request arrives at `/api/invoke/{command_name}` THEN the HTTP Bridge SHALL call the corresponding Tauri command function with the request body as arguments
3. WHEN the command function returns THEN the HTTP Bridge SHALL serialize the result as JSON response
4. IF the command function returns an error THEN the HTTP Bridge SHALL return HTTP 500 with error message in JSON format

### Requirement 2

**User Story:** 作为开发者，我希望前端只需最小改动就能支持 Web 模式，以便降低维护成本。

#### Acceptance Criteria

1. WHEN the frontend imports `invoke` THEN the Invoke Adapter SHALL export a wrapper function with identical signature
2. WHEN running in Tauri environment THEN the Invoke Adapter SHALL delegate to `@tauri-apps/api/core` invoke
3. WHEN running in browser environment THEN the Invoke Adapter SHALL send HTTP POST to `/api/invoke/{command}` with JSON body
4. WHEN the HTTP response arrives THEN the Invoke Adapter SHALL parse JSON and return the result (or throw error)

### Requirement 3

**User Story:** 作为用户，我希望在浏览器中能访问本地图片文件，以便浏览图片库。

#### Acceptance Criteria

1. WHEN a browser requests `/api/asset?path={encoded_path}` THEN the HTTP Bridge SHALL serve the file with correct MIME type
2. WHEN the path points to an archive entry (e.g., `archive.zip#image.jpg`) THEN the HTTP Bridge SHALL extract and serve the file from archive
3. WHEN generating image src URLs THEN the Invoke Adapter SHALL convert `convertFileSrc` calls to HTTP asset URLs
4. IF the file does not exist THEN the HTTP Bridge SHALL return HTTP 404

### Requirement 4

**User Story:** 作为用户，我希望在浏览器中能接收后端事件，以便获得实时更新。

#### Acceptance Criteria

1. WHEN a browser connects to `/api/events` THEN the HTTP Bridge SHALL establish Server-Sent Events (SSE) connection
2. WHEN a backend event occurs THEN the HTTP Bridge SHALL push the event through SSE to all connected clients
3. WHEN the frontend imports `listen` THEN the Invoke Adapter SHALL provide SSE-based implementation for browser environment
4. WHEN SSE connection drops THEN the Invoke Adapter SHALL auto-reconnect after 3 seconds

### Requirement 5

**User Story:** 作为用户，我希望能通过命令行启动纯服务器模式，以便在无 GUI 环境下运行。

#### Acceptance Criteria

1. WHEN the user runs with `--server` flag THEN NeoView SHALL start HTTP server without creating Tauri window
2. WHEN running in server mode THEN NeoView SHALL print the server URL to stdout
3. WHEN the user presses Ctrl+C THEN NeoView SHALL gracefully shutdown the HTTP server
