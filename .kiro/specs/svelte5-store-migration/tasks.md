# Implementation Plan

## 1. 创建工具函数基础设施

- [x] 1.1 创建 `src/lib/stores/utils/` 目录结构
  - 创建 utils 目录
  - 创建 index.ts 导出文件
  - _Requirements: 2.1, 3.1_

- [x] 1.2 实现 `createPersistedState` 工具函数
  - 创建 `createPersistedState.svelte.ts`
  - 实现 localStorage 读写逻辑
  - 实现 `set`/`update`/`subscribe` 兼容 API
  - 支持自定义序列化/反序列化
  - 支持 onChange 回调
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ]* 1.3 编写 `createPersistedState` 属性测试
  - **Property 1: Persisted state round-trip consistency**
  - **Property 2: Persisted state initialization from storage**
  - **Validates: Requirements 1.2, 1.3, 2.2, 2.3**

- [ ]* 1.4 编写 `createPersistedState` 单元测试
  - 测试基本创建和初始化
  - 测试 localStorage 错误处理
  - 测试自定义序列化
  - _Requirements: 2.4_

## 2. 实现异步 Store 工具函数

- [x] 2.1 实现 `createAsyncStore` 工具函数
  - 创建 `createAsyncStore.svelte.ts`
  - 实现 `execute`/`reset`/`retry`/`cancel` 方法
  - 实现 `isLoading`/`data`/`error` 状态管理
  - 实现取消机制（AbortController）
  - 实现去重逻辑
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3_

- [ ]* 2.2 编写 `createAsyncStore` 属性测试
  - **Property 3: Async store loading state transition**
  - **Property 4: Async store success state transition**
  - **Property 5: Async store error state transition**
  - **Property 6: Async store cancellation prevents state update**
  - **Validates: Requirements 3.2, 3.3, 3.4, 5.1, 5.3**

- [ ]* 2.3 编写 `createAsyncStore` 单元测试
  - 测试基本执行流程
  - 测试成功/失败状态转换
  - 测试取消操作
  - 测试去重功能
  - _Requirements: 3.2, 3.3, 3.4, 5.1, 5.2_

- [x] 2.4 Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

## 3. 迁移 UI Store

- [x] 3.1 重构 `ui.svelte.ts` 使用新工具函数
  - 移除 `writable` 导入
  - 使用 `createPersistedState` 替换所有持久化状态
  - 使用 `$state` 替换非持久化状态
  - 保持所有导出 API 不变
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ]* 3.2 编写 UI Store 兼容性属性测试
  - **Property 7: Store API compatibility - set and update methods**
  - **Validates: Requirements 4.2**

- [ ]* 3.3 编写 UI Store 单元测试
  - 测试状态初始化
  - 测试 toggle 函数
  - 测试 appState 同步
  - _Requirements: 1.4, 4.1, 4.2, 4.3_

- [x] 3.4 Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

## 4. 更新导出和类型检查

- [x] 4.1 更新 `src/lib/stores/index.ts` 导出
  - 导出新的工具函数
  - 确保所有现有导出保持不变
  - _Requirements: 1.4, 4.1_

- [x] 4.2 运行类型检查验证迁移
  - 执行 `yarn check`
  - 修复任何类型错误
  - _Requirements: 4.4_

- [x] 4.3 Final Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.
