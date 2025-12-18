# Requirements Document

## Introduction

本文档定义了将 NeoView 应用从 Tauri IPC + adapter 模式全面迁移到 FastAPI HTTP API 的需求。目标是移除 Rust 后端中与 Python FastAPI 功能重复的代码，简化架构，统一使用 Python 后端处理所有业务逻辑。

当前架构存在以下问题：
1. adapter.ts 作为中间层，将 Tauri invoke 调用转换为 HTTP 请求，增加了不必要的复杂性
2. Rust 后端包含大量与 Python 后端功能重复的命令
3. commandMap.ts 维护了一个庞大的命令映射表，难以维护
4. 前端代码中混用了多种 API 调用方式

迁移后的目标架构：
- 前端直接调用 Python FastAPI HTTP API
- Rust 后端仅保留 Tauri 窗口管理、系统托盘等桌面特有功能
- 删除所有与 Python 后端重复的 Rust 命令

## Glossary

- **FastAPI**: Python 高性能 Web 框架，用于构建 HTTP API
- **Tauri**: Rust 桌面应用框架，提供窗口管理、系统集成等功能
- **adapter.ts**: 当前的 API 适配层，将 Tauri invoke 调用转换为 HTTP 请求
- **http-bridge.ts**: Python 后端 HTTP API 桥接层
- **commandMap.ts**: Tauri 命令到 HTTP 端点的映射表
- **IPC**: Inter-Process Communication，进程间通信

## Requirements

### Requirement 1: 移除 adapter 适配层

**User Story:** 作为开发者，我希望移除 adapter.ts 适配层，直接使用 http-bridge.ts 调用 FastAPI，以简化代码架构。

#### Acceptance Criteria

1. WHEN 前端需要调用后端 API THEN 前端 SHALL 直接使用 http-bridge.ts 中的函数而非 adapter.ts 的 invoke 函数
2. WHEN adapter.ts 被移除后 THEN 系统 SHALL 保持所有现有功能正常工作
3. WHEN 前端代码引用 adapter.ts THEN 开发者 SHALL 将引用替换为 http-bridge.ts 或专门的 API 模块

### Requirement 2: 删除 commandMap.ts

**User Story:** 作为开发者，我希望删除 commandMap.ts 命令映射表，因为不再需要将 Tauri 命令映射到 HTTP 端点。

#### Acceptance Criteria

1. WHEN commandMap.ts 被删除后 THEN 系统 SHALL 保持所有 API 调用正常工作
2. WHEN 前端代码引用 commandMap.ts THEN 开发者 SHALL 将引用替换为直接的 HTTP API 调用

### Requirement 3: 精简 Rust 后端命令

**User Story:** 作为开发者，我希望删除 Rust 后端中与 Python FastAPI 功能重复的命令，以减少代码维护负担。

#### Acceptance Criteria

1. WHEN Rust 命令与 Python API 功能重复 THEN 开发者 SHALL 删除该 Rust 命令
2. WHEN 删除 Rust 命令后 THEN 系统 SHALL 通过 Python FastAPI 提供相同功能
3. WHILE 保留 Tauri 桌面特有功能 THEN 系统 SHALL 保留窗口管理、系统托盘、剪贴板等 Rust 命令

### Requirement 4: 统一 API 调用方式

**User Story:** 作为开发者，我希望前端代码统一使用 http-bridge.ts 进行 API 调用，以提高代码一致性。

#### Acceptance Criteria

1. WHEN 前端需要文件系统操作 THEN 前端 SHALL 使用 filesystem.ts 中的函数
2. WHEN 前端需要缩略图操作 THEN 前端 SHALL 使用 http-bridge.ts 中的缩略图相关函数
3. WHEN 前端需要书籍操作 THEN 前端 SHALL 使用 http-bridge.ts 中的书籍相关函数
4. WHEN 前端需要超分操作 THEN 前端 SHALL 使用 http-bridge.ts 中的超分相关函数

### Requirement 5: 保留 Tauri 桌面特有功能

**User Story:** 作为用户，我希望桌面应用保留窗口管理、系统托盘等桌面特有功能。

#### Acceptance Criteria

1. WHILE 应用运行在桌面模式 THEN 系统 SHALL 提供窗口最小化、最大化、关闭功能
2. WHILE 应用运行在桌面模式 THEN 系统 SHALL 提供系统托盘功能
3. WHILE 应用运行在桌面模式 THEN 系统 SHALL 提供剪贴板操作功能
4. WHILE 应用运行在桌面模式 THEN 系统 SHALL 提供文件拖放功能

### Requirement 6: 确保 Python FastAPI 覆盖所有必需功能

**User Story:** 作为开发者，我希望 Python FastAPI 后端覆盖所有被删除的 Rust 命令功能。

#### Acceptance Criteria

1. WHEN Rust 文件系统命令被删除 THEN Python FastAPI SHALL 提供等效的文件系统 API
2. WHEN Rust 压缩包命令被删除 THEN Python FastAPI SHALL 提供等效的压缩包 API
3. WHEN Rust 缩略图命令被删除 THEN Python FastAPI SHALL 提供等效的缩略图 API
4. WHEN Rust 书籍命令被删除 THEN Python FastAPI SHALL 提供等效的书籍 API
5. WHEN Rust 超分命令被删除 THEN Python FastAPI SHALL 提供等效的超分 API
6. WHEN Rust EMM 元数据命令被删除 THEN Python FastAPI SHALL 提供等效的 EMM API

### Requirement 7: 代码清理和验证

**User Story:** 作为开发者，我希望迁移完成后代码库保持整洁，无未使用的代码。

#### Acceptance Criteria

1. WHEN 迁移完成后 THEN 代码库 SHALL 不包含未使用的 Rust 命令文件
2. WHEN 迁移完成后 THEN 代码库 SHALL 不包含未使用的 TypeScript API 文件
3. WHEN 迁移完成后 THEN 系统 SHALL 通过 yarn check 验证无类型错误
4. WHEN 迁移完成后 THEN 系统 SHALL 通过 cargo check 验证无编译错误
