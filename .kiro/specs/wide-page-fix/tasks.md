# Implementation Plan

## 1. 后端 PageFrameBuilder 修复

- [x] 1.1 修复 build_double_frame 方法
  - 按照 NeeView 的检查顺序重构逻辑
  - 当前页横向 → 独占
  - 下一页横向 → 当前页独占
  - 首页/尾页检查（检查当前页或下一页）
  - _Requirements: 1.1, 1.2, 6.1, 6.2, 6.3, 6.4_

- [x] 1.2 修复 get_frame_step 方法
  - 确保步进计算与帧构建逻辑一致
  - 使用相同的检查顺序
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ]* 1.3 编写属性测试：横向页独占
  - **Property 1: 横向页独占显示**
  - **Validates: Requirements 1.1**

- [ ]* 1.4 编写属性测试：下一页横向时当前页独占
  - **Property 2: 下一页横向时当前页独占**
  - **Validates: Requirements 1.2**

- [ ]* 1.5 编写属性测试：步进与帧构建一致性
  - **Property 3: 步进与帧构建一致性**
  - **Validates: Requirements 2.1**

## 2. 前端 viewMode.ts 修复

- [x] 2.1 更新 FrameBuildConfig 接口
  - 添加 singleFirstPage 配置
  - 添加 singleLastPage 配置
  - 添加 totalPages 配置
  - _Requirements: 6.1, 6.3_

- [x] 2.2 修复 buildFrameImages 函数
  - 按照 NeeView 的检查顺序重构逻辑
  - 当前页横向 → 独占
  - 下一页横向 → 当前页独占
  - 首页/尾页检查（检查当前页或下一页）
  - _Requirements: 1.1, 1.2, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4_

- [x] 2.3 修复 getPageStep 函数
  - 确保步进计算与 buildFrameImages 逻辑一致
  - 使用相同的检查顺序
  - _Requirements: 2.1, 5.3_

- [ ]* 2.4 编写属性测试：横向页不被跳过
  - **Property 4: 横向页不被跳过**
  - **Validates: Requirements 1.3, 1.4**

## 3. StackView.svelte 集成

- [x] 3.1 更新 frameConfig 派生状态
  - 添加 singleFirstPage 从设置读取
  - 添加 singleLastPage 从设置读取
  - 添加 totalPages 从 bookStore 读取
  - _Requirements: 6.1, 6.3, 6.5_

- [x] 3.2 验证 pageStep 计算使用新逻辑
  - 确保 pageStep 使用更新后的 getPageStep
  - _Requirements: 2.1_

## 4. 设置面板集成

- [x] 4.1 更新 settingsManager 默认值
  - singleFirstPageMode 已存在，默认值 'restoreOrDefault'（等效于 true）
  - singleLastPageMode 已存在，默认值 'restoreOrDefault'（等效于 false）
  - _Requirements: 6.5_

- [ ] 4.2 添加设置面板 UI 控件（可选，设置已可通过配置文件修改）
  - 添加"首页单独显示"开关
  - 添加"尾页单独显示"开关
  - _Requirements: 6.5_

## 5. Checkpoint - 确保所有测试通过

- [x] 5.1 Checkpoint
  - yarn check 通过 ✅
  - cargo check 通过 ✅

## 6. 属性测试补充

- [ ]* 6.1 编写属性测试：首页单独显示
  - **Property 5: 首页单独显示**
  - **Validates: Requirements 6.1, 6.2**

- [ ]* 6.2 编写属性测试：尾页单独显示
  - **Property 6: 尾页单独显示**
  - **Validates: Requirements 6.3, 6.4**

- [ ]* 6.3 编写属性测试：首页/尾页检查包含配对页
  - **Property 7: 首页/尾页检查包含配对页**
  - **Validates: Requirements 6.2, 6.4**

## 7. Final Checkpoint - 确保所有测试通过

- [ ] 7.1 Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

