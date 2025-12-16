# Implementation Plan

- [x] 1. 实现辅助函数




  - [ ] 1.1 在 FolderStack.svelte 中添加 `normalizePath` 函数
    - 统一路径分隔符（反斜杠转正斜杠）

    - 统一大小写（转小写）
    - _Requirements: 1.1_
  - [x] 1.2 在 FolderStack.svelte 中添加 `findParentLayerIndex` 函数

    - 遍历 layers 查找目标路径的父层
    - 返回父层索引或 -1
    - _Requirements: 1.2_
  - [x] 1.3 在 FolderStack.svelte 中添加 `switchToLayer` 函数

    - 切换到指定层

    - 更新 activeIndex 和 globalStore
    - 处理动画状态
    - _Requirements: 1.1, 3.1_


- [ ] 2. 实现核心历史导航逻辑
  - [ ] 2.1 在 FolderStack.svelte 中添加 `handleHistoryNavigation` 函数
    - 优先在现有 layers 中查找目标路径
    - 检查父子关系决定截断或重建
    - 调用 switchToLayer 或 initRootWithoutHistory
    - _Requirements: 1.1, 1.2, 3.1, 3.2_

  - [ ] 2.2 修改 navigationCommand 的 'history' 类型处理逻辑
    - 替换原有的直接调用 initRootWithoutHistory
    - 改为调用 handleHistoryNavigation



    - _Requirements: 1.1, 1.2_
  - [ ]* 2.3 编写属性测试：Layer Lookup Preserves Stack
    - **Property 1: Layer Lookup Preserves Stack**

    - **Validates: Requirements 1.1, 3.1**

- [ ] 3. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. 验证和优化
  - [ ] 4.1 添加调试日志
    - 在 handleHistoryNavigation 中添加日志
    - 记录查找结果和决策过程


    - _Requirements: 1.1, 1.2_
  - [ ] 4.2 处理边界情况
    - 空 layers 数组
    - 目标路径为空
    - 动画进行中的命令
    - _Requirements: 1.3, 1.4_
  - [ ]* 4.3 编写属性测试：History Index Consistency
    - **Property 2: History Index Consistency**
    - **Validates: Requirements 1.3**
  - [ ]* 4.4 编写属性测试：Back-Forward Round Trip
    - **Property 3: Back-Forward Round Trip**
    - **Validates: Requirements 1.4**

- [ ] 5. Final Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.
