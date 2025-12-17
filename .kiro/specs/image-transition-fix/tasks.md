# Implementation Plan

- [x] 1. 在 imageStore 中添加统一的尺寸和缩放获取接口




  - [x] 1.1 添加 `getDimensionsForPage(pageIndex)` 方法，从 stackImageLoader 读取缓存尺寸

    - 调用 `stackImageLoader.getCachedDimensions(pageIndex)`

    - 如果缓存不存在，尝试从 `bookStore.currentBook.pages[pageIndex]` 获取
    - _Requirements: 2.3, 3.1_
  - [x] 1.2 添加 `getScaleForPage(pageIndex, zoomMode, viewport)` 方法

    - 优先调用 `stackImageLoader.getCachedScale(pageIndex, zoomMode)`
    - 如果缓存不存在，调用 `precomputeScale()` 计算并缓存

    - _Requirements: 3.2, 4.1_
  - [x] 1.3 添加 `setViewportSize(width, height)` 方法

    - 调用 `stackImageLoader.setViewportSize()`
    - _Requirements: 4.3_
  - [x] 1.4 写属性测试验证缩放计算正确性

    - **Property 1: Scale calculation correctness**
    - **Validates: Requirements 1.2, 1.4**


- [x] 2. 修改 StackView.svelte 使用新接口
  - [x] 2.1 移除 `loadedImageSize` 单一变量及相关的 `$effect.pre`
    - 删除 `let loadedImageSize = $state<...>(null)`
    - 删除监听 `imageStore.state.currentUrl` 变化的 `$effect.pre`
    - _Requirements: 1.1_
  - [x] 2.2 移除 `transitionState` 及相关的过渡管理代码
    - 删除 `let transitionState = $state<TransitionState | null>(null)`
    - 删除 `prepareTransition`、`completeTransition` 相关调用
    - 删除 `lastPageIndex` 追踪变量
    - _Requirements: 3.2_
  - [x] 2.3 重写 `modeScale` 计算逻辑
    - 使用 `imageStore.getScaleForPage()` 获取预计算缩放
    - 降级策略：缓存 → bookStore 元数据 → 默认值 1.0
    - _Requirements: 1.2, 1.3, 2.2_
  - [x] 2.4 更新 `hoverImageSize` 派生值
    - 使用 `imageStore.getDimensionsForPage()` 替代 `loadedImageSize`
    - _Requirements: 2.3_
  - [x] 2.5 在视口尺寸变化时同步到 imageStore
    - 在 `updateViewportSize()` 中调用 `imageStore.setViewportSize()`
    - _Requirements: 4.3_
  - [x] 2.6 写属性测试验证尺寸缓存一致性
    - **Property 3: Dimension cache consistency**
    - **Validates: Requirements 2.3, 3.1**

- [x] 3. 更新 handleImageLoad 回调
  - [x] 3.1 简化 `handleImageLoad` 函数
    - 移除 `loadedImageSize` 更新逻辑
    - 保留 `updateMetadataDimensions` 调用（更新 bookStore）
    - _Requirements: 1.1_
  - [x] 3.2 确保图片加载后尺寸写入缓存
    - 在 `stackImageLoader.loadPage()` 中已有此逻辑，确认无需额外修改
    - _Requirements: 3.3_

- [x] 4. Checkpoint - 确保所有测试通过


  - Ensure all tests pass, ask the user if questions arise.


- [x] 5. 清理不再需要的代码
  - [x] 5.1 删除 `imageTransitionManager.ts` 中不再使用的函数
    - 保留 `calculateTargetScale`（仍在使用）
    - 删除 `prepareTransition`、`completeTransition`、`checkDimensionsMatch`
    - _Requirements: 3.2_
  - [x] 5.2 清理 StackView.svelte 中的相关 import
    - 移除 `prepareTransition`、`completeTransition`、`checkDimensionsMatch`、`TransitionState` 的导入
    - _Requirements: 3.2_
  - [x] 5.3 写属性测试验证页面索引隔离性
    - **Property 5: Page index isolation**
    - **Validates: Requirements 3.4, 1.1**

- [x] 6. Final Checkpoint - 确保所有测试通过



  - Ensure all tests pass, ask the user if questions arise.
