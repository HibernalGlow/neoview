# Design Document: Web Browser Adaptation

## Overview

本设计为 NeoView 添加 Web 浏览模式支持，采用最小改动策略：

1. **后端**：
   - 使用 `tauri-plugin-localhost` (官方插件) serve 前端静态文件
   - 使用 `axum` 提供 API 端点，桥接 Tauri IPC 调用
2. **前端**：创建一个薄适配层，根据运行环境自动选择 Tauri IPC 或 HTTP 调用

核心思路类似 RSC：服务端处理所有业务逻辑，前端只需替换通信层。

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        NeoView Application                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────────────────────────┐ │
│  │   Tauri Window  │    │      tauri-plugin-localhost         │ │
│  │   (Desktop)     │    │      (Serve 前端静态文件)            │ │
│  │                 │    │      http://localhost:3456          │ │
│  │  ┌───────────┐  │    └─────────────────────────────────────┘ │
│  │  │  Svelte   │  │                                           │
│  │  │  Frontend │  │    ┌─────────────────────────────────────┐ │
│  │  └─────┬─────┘  │    │         axum API Server             │ │
│  │        │        │    │         Port 3457                   │ │
│  │   Tauri IPC     │    │  ┌─────────────────────────────┐   │ │
│  └────────┼────────┘    │  │  POST /api/invoke/{cmd}     │   │ │
│           │             │  │  GET  /api/asset?path=xxx   │   │ │
│           │             │  │  GET  /api/events (SSE)     │   │ │
│           │             │  └─────────────┬───────────────┘   │ │
│           │             └────────────────┼───────────────────┘ │
│           │                              │                     │
│           └──────────────┬───────────────┘                     │
│                          ▼                                     │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              Existing Tauri Commands                       │ │
│  │  (book_commands, fs_commands, image_commands, etc.)       │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     Browser Client (Web Mode)                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  浏览器访问 http://localhost:3456 (由 localhost 插件 serve) ││
│  │                    Svelte Frontend                          ││
│  │  ┌─────────────────────────────────────────────────────┐   ││
│  │  │              Invoke Adapter                          │   ││
│  │  │  - invoke() → HTTP POST :3457/api/invoke/{cmd}      │   ││
│  │  │  - convertFileSrc() → :3457/api/asset?path=xxx      │   ││
│  │  │  - listen() → EventSource :3457/api/events          │   ││
│  │  └─────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## 两个服务器的分工

| 服务器 | 端口 | 职责 | 技术 |
|--------|------|------|------|
| Frontend Server | 3456 | Serve 前端静态文件 (HTML/JS/CSS) | tauri-plugin-localhost |
| API Server | 3457 | 处理 API 请求 (invoke/asset/events) | axum |

## Components and Interfaces

### 1. HTTP Bridge (Rust Backend)

新增模块 `src-tauri/src/core/http_bridge.rs`

```rust
// HTTP 服务器配置
pub struct HttpBridgeConfig {
    pub port: u16,           // 默认 3456
    pub host: String,        // 默认 "0.0.0.0"
}

// 启动 HTTP 服务器
pub async fn start_http_server(
    app_handle: tauri::AppHandle,
    config: HttpBridgeConfig,
) -> Result<(), HttpBridgeError>;

// 路由处理
// POST /api/invoke/{command} - 调用 Tauri command
// GET /api/asset?path={path} - 文件服务
// GET /api/events - SSE 事件流
```

### 2. Command Router (Rust Backend)

新增模块 `src-tauri/src/core/command_router.rs`

```rust
// 命令路由器 - 将 HTTP 请求路由到对应的 Tauri command
pub struct CommandRouter {
    app_handle: tauri::AppHandle,
}

impl CommandRouter {
    // 执行命令并返回 JSON 结果
    pub async fn execute(
        &self,
        command: &str,
        args: serde_json::Value,
    ) -> Result<serde_json::Value, CommandError>;
}
```

### 3. Invoke Adapter (TypeScript Frontend)

新增模块 `src/lib/api/adapter.ts`

```typescript
// 环境检测
export function isRunningInTauri(): boolean;

// invoke 适配器 - 与 @tauri-apps/api/core 的 invoke 签名相同
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;

// convertFileSrc 适配器
export function convertFileSrc(path: string): string;

// listen 适配器
export async function listen<T>(
  event: string,
  handler: (event: { payload: T }) => void
): Promise<() => void>;

// emit 适配器
export async function emit(event: string, payload?: unknown): Promise<void>;
```

### 4. Asset Proxy (Rust Backend)

集成在 HTTP Bridge 中

```rust
// 文件服务处理
async fn serve_asset(
    path: &str,           // 文件路径或 archive#entry 格式
    app_handle: &AppHandle,
) -> Result<Response, AssetError>;

// MIME 类型检测
fn get_mime_type(path: &str) -> &'static str;
```

### 5. SSE Event Broadcaster (Rust Backend)

新增模块 `src-tauri/src/core/event_broadcaster.rs`

```rust
// SSE 广播器
pub struct EventBroadcaster {
    clients: Arc<RwLock<Vec<Sender<Event>>>>,
}

impl EventBroadcaster {
    // 广播事件到所有连接的客户端
    pub async fn broadcast(&self, event: &str, payload: serde_json::Value);
    
    // 添加新客户端
    pub fn add_client(&self) -> Receiver<Event>;
}
```

## Data Models

### HTTP Request/Response

```typescript
// 调用请求
interface InvokeRequest {
  // Body 直接是命令参数
  [key: string]: unknown;
}

// 成功响应
interface InvokeResponse<T> {
  success: true;
  data: T;
}

// 错误响应
interface InvokeErrorResponse {
  success: false;
  error: string;
  code?: string;
}

// SSE 事件
interface SseEvent {
  event: string;
  data: unknown;
}
```

### Asset URL Format

```
// 普通文件
/api/asset?path=/path/to/image.jpg

// 压缩包内文件
/api/asset?path=/path/to/archive.zip&entry=folder/image.jpg
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Command Routing Consistency
*For any* valid Tauri command name and arguments, calling through HTTP `/api/invoke/{command}` SHALL produce the same result as calling through Tauri IPC.
**Validates: Requirements 1.2, 1.3**

### Property 2: JSON Serialization Round-Trip
*For any* command response value, serializing to JSON and deserializing back SHALL produce an equivalent value.
**Validates: Requirements 1.3, 2.4**

### Property 3: Error Response Format
*For any* command that returns an error, the HTTP response SHALL have status 500 and body containing `{ success: false, error: string }`.
**Validates: Requirements 1.4**

### Property 4: Asset URL Conversion
*For any* valid file path, `convertFileSrc(path)` in browser mode SHALL return a valid HTTP URL that, when requested, serves the file content.
**Validates: Requirements 3.1, 3.3**

### Property 5: Archive Entry Extraction
*For any* valid archive path and entry name, requesting `/api/asset?path={archive}&entry={entry}` SHALL return the extracted file content with correct MIME type.
**Validates: Requirements 3.2**

### Property 6: SSE Event Delivery
*For any* backend event emitted, all connected SSE clients SHALL receive the event with the same payload.
**Validates: Requirements 4.2**

### Property 7: Invoke Adapter Signature Compatibility
*For any* call to the adapter's `invoke` function, the function signature and return type SHALL be identical to `@tauri-apps/api/core` invoke.
**Validates: Requirements 2.1, 2.4**

## Error Handling

### HTTP Bridge Errors

| Error Type | HTTP Status | Response |
|------------|-------------|----------|
| Command not found | 404 | `{ success: false, error: "Command not found: {cmd}" }` |
| Invalid arguments | 400 | `{ success: false, error: "Invalid arguments: {details}" }` |
| Command execution error | 500 | `{ success: false, error: "{error_message}" }` |
| File not found | 404 | `{ success: false, error: "File not found: {path}" }` |
| Archive extraction error | 500 | `{ success: false, error: "Failed to extract: {details}" }` |

### Frontend Error Handling

```typescript
// Invoke Adapter 错误处理
try {
  const result = await invoke('command', args);
} catch (error) {
  // error.message 包含后端错误信息
  // 与 Tauri IPC 错误格式一致
}
```

## Testing Strategy

### Property-Based Testing

使用 `fast-check` (TypeScript) 和 `proptest` (Rust) 进行属性测试。

**TypeScript (fast-check)**:
- 测试 Invoke Adapter 的 JSON 序列化/反序列化
- 测试 URL 转换的正确性
- 测试环境检测逻辑

**Rust (proptest)**:
- 测试 Command Router 的路由正确性
- 测试 Asset Proxy 的 MIME 类型检测
- 测试 SSE 事件广播

### Unit Tests

- HTTP 端点响应格式
- 错误处理路径
- 环境检测逻辑
- SSE 连接管理

### Integration Tests

- 完整的 invoke 调用链路
- 文件服务端到端测试
- SSE 事件推送测试
