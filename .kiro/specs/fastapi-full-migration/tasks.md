# Implementation Plan

## 阶段一：前端代码迁移

- [x] 1. 迁移 API 层文件




  - [x] 1.1 更新 src/lib/api/emm.ts - 将 invoke 调用替换为 http-bridge.ts 的 apiGet/apiPost

    - 替换 `import { invoke } from '$lib/api/adapter'` 为直接使用 http-bridge

    - _Requirements: 1.1, 4.1_

  - [x] 1.2 更新 src/lib/api/book.ts - 将 invoke 调用替换为 http-bridge.ts 函数

    - _Requirements: 1.1, 4.3_

  - [x] 1.3 更新 src/lib/api/archive.ts - 将 invoke 调用替换为 http-bridge.ts 函数

    - _Requirements: 1.1, 4.1_

  - [x] 1.4 更新 src/lib/api/image.ts - 将 invoke 调用替换为 http-bridge.ts 函数

    - _Requirements: 1.1, 4.1_

  - [ ] 1.5 更新 src/lib/api/fs.ts - 将 invoke 调用替换为 filesystem.ts 函数
    - _Requirements: 1.1, 4.1_
  - [ ] 1.6 更新 src/lib/api/content.ts - 将 invoke 调用替换为 http-bridge.ts 函数
    - _Requirements: 1.1, 4.1_
  - [ ] 1.7 更新 src/lib/api/file_index.ts - 将 invoke 调用替换为 http-bridge.ts 函数
    - _Requirements: 1.1, 4.1_
  - [ ] 1.8 更新 src/lib/api/backgroundTasks.ts - 将 invoke 调用替换为 http-bridge.ts 函数
    - _Requirements: 1.1, 4.1_
  - [ ] 1.9 更新 src/lib/api/performance.ts - 将 invoke 调用替换为 http-bridge.ts 函数
    - _Requirements: 1.1, 4.1_
  - [ ] 1.10 更新 src/lib/api/pageManager.ts - 将 invoke 和 listen 调用替换为 http-bridge.ts 函数
    - _Requirements: 1.1, 4.1_

- [ ] 2. 迁移 stores 文件
  - [ ] 2.1 更新 src/lib/stores/thumbnailStoreV3.svelte.ts - 移除 invoke/listen 依赖
    - _Requirements: 1.1, 4.2_
  - [ ] 2.2 更新 src/lib/stores/emmMetadata.svelte.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_
  - [ ] 2.3 更新 src/lib/stores/pageFrame.svelte.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_
  - [ ] 2.4 更新 src/lib/stores/emm/ratingStore.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_
  - [ ] 2.5 更新 src/lib/stores/emm/manualTagStore.svelte.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_
  - [ ] 2.6 更新 src/lib/stores/emm/folderRating.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_
  - [ ] 2.7 更新 src/lib/stores/emm/collectTagCountStore.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_
  - [ ] 2.8 更新 src/lib/stores/upscale/PyO3UpscaleManager.svelte.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.4_
  - [ ] 2.9 更新 src/lib/stores/autoBackup.svelte.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_
  - [ ] 2.10 更新 src/lib/stores/sidebarConfig.svelte.ts - 移除 listen 依赖或替换为本地事件
    - _Requirements: 1.1_
  - [ ] 2.11 更新 src/lib/stores/dimensionScanListener.ts - 移除 listen 依赖或替换为本地事件
    - _Requirements: 1.1_

- [ ] 3. 迁移 services 文件
  - [ ] 3.1 更新 src/lib/services/translationService.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_
  - [ ] 3.2 更新 src/lib/services/thumbnailService.ts - 移除 listen 依赖
    - _Requirements: 1.1, 4.2_
  - [ ] 3.3 更新 src/lib/services/ratingCache.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_
  - [ ] 3.4 更新 src/lib/services/metadataService.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_
  - [ ] 3.5 更新 src/lib/services/ipcBatcher.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_
  - [ ] 3.6 更新 src/lib/services/emmSyncService.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_

- [ ] 4. 迁移 utils 文件
  - [ ] 4.1 更新 src/lib/utils/thumbnail/ipcTimeout.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.2_
  - [ ] 4.2 更新 src/lib/utils/thumbnail/FolderThumbnailLoader.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.2_
  - [ ] 4.3 更新 src/lib/utils/systemCapabilities.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_
  - [ ] 4.4 更新 src/lib/utils/runtimeTheme.ts - 移除 listen 依赖或替换为本地事件
    - _Requirements: 1.1_
  - [ ] 4.5 更新 src/lib/utils/pathUtils.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_
  - [ ] 4.6 更新 src/lib/utils/loaders/batchThumbnailLoader.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.2_
  - [ ] 4.7 更新 src/lib/utils/fontManager.ts - 移除 listen/emit 依赖或替换为本地事件
    - _Requirements: 1.1_
  - [ ] 4.8 更新 src/lib/utils/assetProxy.ts - 将 convertFileSrc 替换为 getFileUrl
    - _Requirements: 1.1, 4.1_

- [ ] 5. 迁移 core 文件
  - [ ] 5.1 更新 src/lib/core/windows/windowManager.ts - 移除 listen 依赖，保留 isRunningInTauri
    - _Requirements: 1.1, 5.1_
  - [ ] 5.2 更新 src/lib/core/windows/cardWindowManager.ts - 移除 emit/listen 依赖
    - _Requirements: 1.1_
  - [ ] 5.3 更新 src/lib/core/tauriIntegration.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_
  - [ ] 5.4 更新 src/lib/core/ipc/ipcService.ts - 重构为使用 http-bridge
    - _Requirements: 1.1, 4.1_

- [ ] 6. 迁移 components 文件
  - [ ] 6.1 更新 src/lib/components/viewer/flow/imageReader.ts - 将 convertFileSrc 替换为 getFileUrl
    - _Requirements: 1.1, 4.1_
  - [ ] 6.2 更新 src/lib/components/viewer/VideoContainer.svelte - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_
  - [ ] 6.3 更新 src/lib/components/panels/ThemePanel.svelte - 移除 emit 依赖
    - _Requirements: 1.1_
  - [ ] 6.4 更新 src/lib/components/panels/StartupConfigPanel.svelte - 移除 appDataDir 依赖
    - _Requirements: 1.1_
  - [ ] 6.5 更新 src/lib/components/panels/SidebarManagementPanel.svelte - 移除 emit 依赖
    - _Requirements: 1.1_
  - [ ] 6.6 更新 src/lib/components/panels/emm/*.svelte - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_
  - [ ] 6.7 更新 src/lib/components/panels/BenchmarkCard.svelte - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1_
  - [ ] 6.8 更新 src/lib/components/layout/*.svelte - 保留 getAppWindow，移除其他 adapter 依赖
    - _Requirements: 1.1, 5.1_
  - [ ] 6.9 更新 src/lib/components/benchmark/*.svelte - 将 invoke/convertFileSrc 替换为 http-bridge
    - _Requirements: 1.1_

- [ ] 7. 迁移 cards 文件
  - [ ] 7.1 更新 src/lib/cards/upscale/UpscaleCacheCard.svelte - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.4_
  - [ ] 7.2 更新 src/lib/cards/shared/FileListPanel.svelte - 将 homeDir 替换为 http-bridge
    - _Requirements: 1.1, 4.1_
  - [ ] 7.3 更新 src/lib/cards/pageList/PageContextMenu.svelte - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_
  - [ ] 7.4 更新 src/lib/cards/monitor/SystemMonitorCard.svelte - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1_
  - [ ] 7.5 更新 src/lib/cards/benchmark/*.svelte - 将 invoke/convertFileSrc 替换为 http-bridge
    - _Requirements: 1.1_
  - [ ] 7.6 更新 src/lib/cards/ai/*.svelte - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1_
  - [ ] 7.7 更新 src/lib/cards/folder/hooks/*.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_

- [ ] 8. 迁移其他文件
  - [ ] 8.1 更新 src/lib/config/startupConfig.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1, 4.1_
  - [ ] 8.2 更新 src/lib/commands.svelte.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1_
  - [ ] 8.3 更新 src/lib/ai/translationIntegration.ts - 将 invoke 替换为 http-bridge
    - _Requirements: 1.1_
  - [x] 8.4 更新 src/lib/stackview/utils/imageReader.ts - 将 convertFileSrc 替换为 getFileUrl

    - _Requirements: 1.1, 4.1_
  - [ ] 8.5 更新 src/lib/stackview/stores/upscaleStore.svelte.ts - 将 invoke/listen 替换为 http-bridge
    - _Requirements: 1.1, 4.4_
  - [ ] 8.6 更新 src/App.svelte - 将 convertFileSrc 替换为 getFileUrl
    - _Requirements: 1.1_



  - [x] 8.7 更新 src/lib/CardWindow.svelte - 保留 getAppWindow

    - _Requirements: 1.1, 5.1_

  - [x] 8.8 更新 src/lib/Settings.svelte - 保留 getAppWindow

    - _Requirements: 1.1, 5.1_

  - [ ] 8.9 更新 src/routes/standalone/[id]/+page.svelte - 保留 getAppWindow
    - _Requirements: 1.1, 5.1_


- [ ] 9. Checkpoint - 验证前端迁移
  - Ensure all tests pass, ask the user if questions arise.



## 阶段二：删除适配层

- [ ] 10. 删除适配层文件
  - [-] 10.1 删除 src/lib/api/adapter.ts

    - _Requirements: 1.2, 1.3_
  - [ ] 10.2 删除 src/lib/api/commandMap.ts
    - _Requirements: 2.1, 2.2_
  - [ ] 10.3 删除 src/lib/api/MIGRATION.md - 迁移指南已过时
    - _Requirements: 7.2_
  - [ ] 10.4 更新 src/lib/api/index.ts - 移除 adapter 和 commandMap 的导出
    - _Requirements: 1.2_

- [ ] 11. 创建窗口管理模块
  - [ ] 11.1 创建 src/lib/api/window.ts - 封装 Tauri 窗口 API
    - 提供 getAppWindow, isRunningInTauri 等函数
    - Web 模式下提供 mock 实现
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [ ] 11.2 更新所有使用 getAppWindow 的文件，改为从 window.ts 导入
    - _Requirements: 5.1_

- [ ] 12. Checkpoint - 验证适配层删除
  - Ensure all tests pass, ask the user if questions arise.

## 阶段三：精简 Rust 后端

- [ ] 13. 删除 Rust 命令模块
  - [ ] 13.1 删除 src-tauri/src/commands/fs_commands.rs
    - _Requirements: 3.1, 6.1_
  - [ ] 13.2 删除 src-tauri/src/commands/book_commands.rs
    - _Requirements: 3.1, 6.4_
  - [ ] 13.3 删除 src-tauri/src/commands/thumbnail_commands.rs
    - _Requirements: 3.1, 6.3_
  - [ ] 13.4 删除 src-tauri/src/commands/thumbnail_v3_commands.rs
    - _Requirements: 3.1, 6.3_
  - [ ] 13.5 删除 src-tauri/src/commands/thumbnail_engine_commands.rs
    - _Requirements: 3.1, 6.3_
  - [ ] 13.6 删除 src-tauri/src/commands/upscale_commands.rs
    - _Requirements: 3.1, 6.5_
  - [ ] 13.7 删除 src-tauri/src/commands/upscale_scheduler_commands.rs
    - _Requirements: 3.1, 6.5_
  - [ ] 13.8 删除 src-tauri/src/commands/upscale_service_commands.rs
    - _Requirements: 3.1, 6.5_
  - [ ] 13.9 删除 src-tauri/src/commands/upscale_settings_commands.rs
    - _Requirements: 3.1, 6.5_
  - [ ] 13.10 删除 src-tauri/src/commands/generic_upscale_commands.rs
    - _Requirements: 3.1, 6.5_
  - [ ] 13.11 删除 src-tauri/src/commands/pyo3_upscale_commands.rs
    - _Requirements: 3.1, 6.5_
  - [ ] 13.12 删除 src-tauri/src/commands/emm_metadata_commands.rs
    - _Requirements: 3.1, 6.6_
  - [ ] 13.13 删除 src-tauri/src/commands/video_commands.rs
    - _Requirements: 3.1, 6.2_
  - [ ] 13.14 删除 src-tauri/src/commands/stream_commands.rs
    - _Requirements: 3.1, 6.1_
  - [ ] 13.15 删除 src-tauri/src/commands/image_commands.rs
    - _Requirements: 3.1, 6.1_
  - [ ] 13.16 删除 src-tauri/src/commands/image_data_commands.rs
    - _Requirements: 3.1, 6.1_
  - [ ] 13.17 删除 src-tauri/src/commands/benchmark_commands.rs
    - _Requirements: 3.1, 7.1_
  - [ ] 13.18 删除 src-tauri/src/commands/page_commands.rs
    - _Requirements: 3.1, 6.4_
  - [ ] 13.19 删除 src-tauri/src/commands/metadata_commands.rs
    - _Requirements: 3.1, 6.1_
  - [ ] 13.20 删除 src-tauri/src/commands/startup_config_commands.rs
    - _Requirements: 3.1, 6.1_
  - [ ] 13.21 删除 src-tauri/src/commands/ollama_commands.rs
    - _Requirements: 3.1_
  - [ ] 13.22 删除 src-tauri/src/commands/system_monitor_commands.rs
    - _Requirements: 3.1_
  - [ ] 13.23 删除 src-tauri/src/commands/task_queue_commands.rs
    - _Requirements: 3.1_


  - [ ] 13.24 删除 src-tauri/src/commands/comparison_commands.rs
    - _Requirements: 3.1_
  - [ ] 13.25 删除 src-tauri/src/commands/explorer_context_menu_commands.rs
    - _Requirements: 3.1_

- [ ] 14. 删除 Rust core 模块
  - [ ] 14.1 删除 src-tauri/src/core/ 目录下与已删除命令相关的模块
    - 保留 http_bridge.rs (如果需要)
    - _Requirements: 3.1, 7.1_

- [ ] 15. 更新 Rust 入口文件
  - [ ] 15.1 更新 src-tauri/src/commands/mod.rs - 移除已删除模块的声明
    - _Requirements: 3.1, 7.1_
  - [ ] 15.2 更新 src-tauri/src/lib.rs - 移除已删除命令的注册
    - 保留 Tauri 插件初始化
    - 保留系统托盘初始化
    - 移除所有已删除的 invoke_handler 命令
    - _Requirements: 3.1, 3.3, 7.1_

- [ ] 16. Checkpoint - 验证 Rust 编译
  - Ensure all tests pass, ask the user if questions arise.

## 阶段四：最终验证

- [ ] 17. 代码验证
  - [ ] 17.1 运行 yarn check 验证 TypeScript 无错误
    - _Requirements: 7.3_
  - [ ] 17.2 运行 cargo check 验证 Rust 无编译错误
    - _Requirements: 7.4_
  - [ ] 17.3 运行 yarn build 验证前端构建成功
    - _Requirements: 7.3_
  - [ ] 17.4 运行 cargo build 验证 Rust 构建成功
    - _Requirements: 7.4_

- [ ] 18. Final Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.
