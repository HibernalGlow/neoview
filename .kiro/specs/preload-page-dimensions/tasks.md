# Implementation Plan

- [x] 1. 创建 DimensionCache 模块




  - [ ] 1.1 在 `src-tauri/src/core/` 创建 `dimension_cache.rs`
    - 定义 `DimensionEntry` 结构体（width, height, modified）
    - 定义 `DimensionCache` 结构体（entries HashMap, cache_path, dirty flag）

    - 实现 `new`, `get`, `set` 方法
    - _Requirements: 3.1, 3.2_
  - [ ] 1.2 实现缓存持久化
    - 实现 `save` 方法（序列化到 JSON 文件）

    - 实现 `load` 方法（从 JSON 文件反序列化）
    - 缓存文件路径：`{app_data}/dimension_cache.json`
    - _Requirements: 3.1, 3.3_
  - [ ] 1.3 实现缓存失效逻辑
    - `get` 方法检查 modified 时间
    - 如果文件更新则返回 None，触发重新扫描




    - _Requirements: 3.4_
  - [x]* 1.4 编写属性测试：缓存往返一致性

    - **Property 1: Dimension scan-cache round trip**
    - **Validates: Requirements 1.2, 3.1, 3.2**

- [x] 2. 创建 DimensionScanner 模块

  - [ ] 2.1 在 `src-tauri/src/core/` 创建 `dimension_scanner.rs`
    - 定义 `DimensionScanner` 结构体（cancel_token, cache）
    - 定义 `ScanResult` 结构体
    - _Requirements: 1.1, 5.1_
  - [ ] 2.2 实现单页尺寸扫描
    - `scan_page_dimensions` 方法
    - 文件夹类型：使用 `WicDecoder::get_image_dimensions`
    - 压缩包类型：提取到内存后使用 `get_image_dimensions_from_memory`

    - _Requirements: 2.1, 2.2_
  - [ ] 2.3 实现异步批量扫描
    - `scan_book` 异步方法



    - 先检查缓存，缓存命中则跳过
    - 使用 tokio 并发扫描（限制并发数）
    - 支持取消令牌检查

    - _Requirements: 1.1, 1.4, 5.1, 5.3_
  - [ ]* 2.4 编写属性测试：事件更新与扫描值匹配
    - **Property 3: Event updates match scanned values**

    - **Validates: Requirements 4.1, 4.2**

- [-] 3. Checkpoint - 确保后端编译通过


  - `cargo check` 通过

- [ ] 4. 集成到 BookManager
  - [ ] 4.1 在 `src-tauri/src/lib.rs` 添加全局状态
    - 添加 `DimensionScannerState` 到 Tauri 管理状态
    - 添加 `DimensionCacheState` 到 Tauri 管理状态
    - _Requirements: 1.1_
  - [ ] 4.2 修改 `open_book` 命令
    - 打开书籍后启动后台扫描任务
    - 取消之前的扫描任务（如果有）
    - _Requirements: 1.1, 5.1_
  - [ ] 4.3 添加 Tauri 事件发送
    - 扫描进度事件：`dimension-scan-progress`
    - 扫描完成事件：`dimension-scan-complete`
    - 批量发送更新（每 10 个页面或 100ms）
    - _Requirements: 4.1_

- [x] 5. 前端事件监听

  - [x] 5.1 在 `src/lib/stores/book.svelte.ts` 添加尺寸更新方法

    - 实现 `updatePageDimensionsBatch` 方法
    - 批量更新 pages 数组中的 width/height
    - _Requirements: 4.2_
  - [x] 5.2 在 `src/lib/App.svelte` 或合适位置添加事件监听

    - 监听 `dimension-scan-progress` 事件
    - 调用 `bookStore.updatePageDimensionsBatch`
    - 监听 `dimension-scan-complete` 事件（可选：显示扫描统计）
    - _Requirements: 4.2, 4.4_
  - [ ]* 5.3 编写属性测试：可用尺寸用于布局计算
    - **Property 2: Available dimensions are used for layout**
    - **Validates: Requirements 1.3, 4.3**

- [x] 6. 优化 getPageStep 使用预加载尺寸


  - [x] 6.1 修改 `src/lib/stores/ui.svelte.ts` 中的 `getPageStep`

    - 优先使用 `bookStore.pages[index].width/height`
    - 如果尺寸不可用，使用默认步长
    - 移除或减少调试日志
    - _Requirements: 4.3_
  - [x] 6.2 修改 `src/lib/stackview/StackView.svelte` 中的 `pageStep`


    - 使用相同的优先级逻辑
    - _Requirements: 4.3_


- [ ] 7. Checkpoint - 确保所有测试通过
  - `cargo check` 通过
  - `yarn check` 通过

- [ ] 8. 缓存失效测试
  - [ ]* 8.1 编写属性测试：文件修改时缓存失效
    - **Property 4: Cache invalidation on file change**
    - **Validates: Requirements 3.4**


- [x] 9. Final Checkpoint - 确保所有测试通过

  - `cargo check` 通过 
  - `yarn check` 通过

