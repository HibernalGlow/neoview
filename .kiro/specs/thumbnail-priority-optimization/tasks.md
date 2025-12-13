# Implementation Plan

- [x] 1. 后端实现优先级排序



  - [x] 1.1 添加 `sort_by_distance_from_center` 函数

    - 在 `page_commands.rs` 中实现距离排序函数
    - 排序规则：按与 center 的绝对距离升序，距离相同时大索引优先
    - _Requirements: 3.1, 3.2, 3.3_
  - [ ]* 1.2 编写属性测试：排序正确性
    - **Property 1: Center-First Ordering**
    - **Validates: Requirements 1.1, 3.1, 3.2**
  - [ ]* 1.3 编写属性测试：等距优先级
    - **Property 3: Forward Priority on Equal Distance**
    - **Validates: Requirements 3.3**

- [x] 2. 更新后端 API


  - [x] 2.1 修改 `pm_preload_thumbnails` 命令


    - 添加 `center_index: Option<usize>` 参数
    - 在处理前调用排序函数
    - 保持向后兼容（center_index 为 None 时按原顺序）
    - _Requirements: 1.1, 1.2_
  - [ ]* 2.2 编写单元测试：API 参数兼容性
    - 测试 center_index 为 None 时的行为
    - 测试 indices 为空时的行为
    - _Requirements: 1.1_

- [x] 3. 更新前端 API


  - [x] 3.1 修改 `preloadThumbnails` 函数签名
    - 在 `pageManager.ts` 中添加 `centerIndex` 参数
    - 更新 invoke 调用传递 center_index
    - _Requirements: 1.1_
  - [x] 3.2 更新 `thumbnailService.ts` 调用

    - 在 `loadThumbnails` 中传递 centerIndex 给 `preloadThumbnails`
    - _Requirements: 1.1_

- [x] 4. Checkpoint - 确保所有测试通过

  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. 验证和优化

  - [x] 5.1 手动测试缩略图加载顺序

    - 打开一本多页书籍
    - 观察底栏缩略图加载顺序是否从当前页向两边扩散
    - _Requirements: 1.1, 1.2_
  - [ ]* 5.2 编写属性测试：交替模式
    - **Property 2: Alternating Pattern**
    - **Validates: Requirements 1.2**

- [x] 6. Final Checkpoint - 确保所有测试通过


  - Ensure all tests pass, ask the user if questions arise.
