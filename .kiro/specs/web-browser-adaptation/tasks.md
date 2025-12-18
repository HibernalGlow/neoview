# Implementation Plan

## Phase 1: 安装插件和依赖

- [x] 1. 安装 tauri-plugin-localhost




  - [x] 1.1 添加 Rust 依赖到 Cargo.toml





    - 添加 `tauri-plugin-localhost = "2"`

    - _Requirements: 1.1_
  - [-] 1.2 添加前端依赖


    - 运行 `yarn add @tauri-apps/plugin-localhost`
    - _Requirements: 1.1_
  - [ ] 1.3 在 lib.rs 中注册插件
    - 添加 `.plugin(tauri_plugin_localhost::Builder::new(3456).build())`
    - _Requirements: 1.1_


- [ ] 2. 添加 axum 依赖
  - [x] 2.1 在 Cargo.toml 添加 axum 相关依赖

    - 添加 `axum = "0.7"`
    - 添加 `tower = "0.4"`


    - 添加 `tower-http = { version = "0.5", features = ["cors"] }`
    - _Requirements: 1.1_


## Phase 2: 后端 API Server

- [x] 3. 创建 HTTP Bridge 基础结构

  - [ ] 3.1 创建 `src-tauri/src/core/http_bridge.rs` 模块
    - 定义 HttpBridgeConfig 结构体 (port, host)
    - 实现 start_api_server 函数
    - _Requirements: 1.1_
  - [ ] 3.2 在 mod.rs 中导出新模块
    - _Requirements: 1.1_



- [ ] 4. 实现 `/api/invoke/{command}` 端点
  - [ ] 4.1 创建 invoke 路由处理函数
    - 解析 URL 中的 command 名称

    - 解析 POST body 为 JSON
    - _Requirements: 1.2_
  - [x] 4.2 实现命令分发逻辑

    - 根据 command 名称调用对应的处理函数
    - 复用现有 Tauri command 的核心逻辑
    - _Requirements: 1.2_
  - [ ] 4.3 实现响应序列化
    - 成功: `{ "success": true, "data": ... }`
    - 失败: `{ "success": false, "error": "..." }`
    - _Requirements: 1.3, 1.4_
  - [ ]* 4.4 编写 Property Test: JSON Serialization Round-Trip
    - **Property 2: JSON Serialization Round-Trip**
    - **Validates: Requirements 1.3**

- [ ] 5. 实现 `/api/asset` 端点
  - [x] 5.1 创建 asset 路由处理函数

    - 解析 path 查询参数
    - 解析可选的 entry 参数 (压缩包内文件)
    - _Requirements: 3.1_

  - [ ] 5.2 实现文件读取和响应
    - 读取文件内容
    - 根据扩展名设置 Content-Type

    - _Requirements: 3.1_
  - [ ] 5.3 实现压缩包内文件提取
    - 复用现有的 ArchiveManager 逻辑
    - 支持 ZIP/RAR/7z 格式
    - _Requirements: 3.2_
  - [ ]* 5.4 编写 Property Test: Archive Entry Extraction
    - **Property 5: Archive Entry Extraction**
    - **Validates: Requirements 3.2**

- [ ] 6. Checkpoint - 确保后端编译通过
  - Ensure all tests pass, ask the user if questions arise.

## Phase 3: SSE 事件系统


- [ ] 7. 实现 `/api/events` SSE 端点
  - [x] 7.1 创建 `src-tauri/src/core/event_broadcaster.rs` 模块

    - 定义 EventBroadcaster 结构体
    - 使用 tokio broadcast channel
    - _Requirements: 4.1_

  - [ ] 7.2 实现 SSE 连接处理
    - 建立 SSE 连接
    - 发送心跳保持连接

    - _Requirements: 4.1_
  - [ ] 7.3 集成 Tauri 事件系统
    - 监听 Tauri app.emit 事件
    - 转发到 SSE 客户端
    - _Requirements: 4.2_
  - [ ]* 7.4 编写 Property Test: SSE Event Delivery
    - **Property 6: SSE Event Delivery**
    - **Validates: Requirements 4.2**

- [ ] 8. Checkpoint - 确保后端功能完整
  - Ensure all tests pass, ask the user if questions arise.

## Phase 4: 前端 Invoke Adapter

- [ ] 9. 创建前端适配层
  - [ ] 9.1 创建 `src/lib/api/adapter.ts` 模块
    - 实现 isRunningInTauri() 环境检测
    - 定义 API_BASE_URL 常量 (http://localhost:3457)
    - _Requirements: 2.1_
  - [ ] 9.2 实现 invoke 适配器
    - Tauri 环境: 委托到 `@tauri-apps/api/core` invoke
    - 浏览器环境: fetch POST 到 `/api/invoke/{cmd}`
    - _Requirements: 2.2, 2.3_
  - [ ] 9.3 实现 convertFileSrc 适配器
    - Tauri 环境: 委托到原生 convertFileSrc
    - 浏览器环境: 返回 `/api/asset?path={encodedPath}`
    - _Requirements: 3.3_
  - [ ] 9.4 实现 listen/emit 适配器
    - Tauri 环境: 委托到 `@tauri-apps/api/event`
    - 浏览器环境: 使用 EventSource 连接 SSE
    - 实现自动重连逻辑
    - _Requirements: 4.3, 4.4_
  - [ ]* 9.5 编写 Property Test: Asset URL Conversion
    - **Property 4: Asset URL Conversion**
    - **Validates: Requirements 3.1, 3.3**

- [ ] 10. Checkpoint - 确保前端适配层工作
  - Ensure all tests pass, ask the user if questions arise.

## Phase 5: 集成和启动

- [ ] 11. 集成到应用启动流程
  - [x] 11.1 修改 `src-tauri/src/lib.rs` setup

    - 启动 axum API server (端口 3457)
    - 与 Tauri 应用并行运行
    - _Requirements: 1.1_
  - [x] 11.2 配置 CORS

    - 允许 localhost:3456 访问 localhost:3457
    - _Requirements: 1.1_



- [x] 12. 更新前端 import 路径
  - [x] 12.1 创建 import 替换脚本或手动更新
    - 将 `import { invoke } from '@tauri-apps/api/core'` 
    - 改为 `import { invoke } from '$lib/api/adapter'`
    - 同样处理 convertFileSrc, listen, emit
    - _Requirements: 2.1_
  - [x] 12.2 修复 getCurrentWebviewWindow 直接调用
    - TopToolbar.svelte, TitleBarSection.svelte, TitleBar.svelte
    - Settings.svelte, CardWindow.svelte, standalone/[id]/+page.svelte
    - 改用 adapter 的 getAppWindow() 异步获取窗口对象
    - _Requirements: 2.1_
  - [x] 12.3 修复窗口管理器的浏览器兼容性
    - windowManager.ts: 使用 window.open 替代 WebviewWindow
    - cardWindowManager.ts: 添加浏览器模式支持
    - 全屏功能使用 Fullscreen API
    - _Requirements: 2.1_

- [ ] 13. 实现 `--server` 命令行模式 (可选)
  - [ ] 13.1 解析 CLI 参数
    - 检测 `--server` 和 `--port` 参数
    - _Requirements: 5.1_
  - [ ] 13.2 实现无头模式
    - 不创建 Tauri 窗口
    - 只启动 localhost 插件和 API server
    - _Requirements: 5.1, 5.2_

- [ ] 14. Final Checkpoint - 端到端测试
  - Ensure all tests pass, ask the user if questions arise.
  - 测试: 启动应用后，用浏览器访问 http://localhost:3457
  - 验证: 文件浏览、图片查看、缩略图加载都正常工作

## Bug 修复记录

- [x] 修复 `load_directory_snapshot` 返回数据格式问题
  - 字段名 `isDirectory` 改为 `isDir`（与前端 FsItem 类型匹配）
  - 添加 `isImage` 字段
- [x] 修复 `filesystem.ts` 中 null 检查
  - `loadDirectorySnapshot` 添加 null/undefined 防护
- [x] 修复 `browse_directory_internal` 等函数移除不必要的 async
- [x] 合并重复的 match arms（消除 clippy 警告）
- [x] 内联 format 字符串（消除 clippy 警告）
