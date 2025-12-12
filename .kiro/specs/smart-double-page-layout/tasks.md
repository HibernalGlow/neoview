# Implementation Plan

- [x] 1. 添加 WidePageStretch 枚举和 ContentScaleCalculator
  - [x] 1.1 在 `src-tauri/src/core/page_frame/` 创建 `stretch.rs` 模块
    - 定义 `WidePageStretch` 枚举（None, UniformHeight, UniformWidth）
    - 实现 `ContentScaleCalculator` 结构体
    - 实现 `calc_uniform_height` 和 `calc_uniform_width` 方法
    - _Requirements: 1.1, 2.1, 2.2, 2.3_
  - [ ]* 1.2 编写属性测试：UniformHeight 产生相等高度
    - **Property 1: UniformHeight produces equal heights**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.2**
  - [ ]* 1.3 编写属性测试：None 模式产生 scale=1.0
    - **Property 2: None alignment produces unit scale**
    - **Validates: Requirements 2.1**
  - [x]* 1.4 编写属性测试：UniformWidth 产生相等宽度
    - **Property 3: UniformWidth produces equal widths**
    - **Validates: Requirements 2.3**

- [x] 2. 更新 PageFrame 双页构建逻辑
  - [x] 2.1 更新 `PageFrame::double_aligned` 方法接受 `WidePageStretch` 参数
    - 调用 `ContentScaleCalculator::calculate` 获取各元素的 scale
    - 将计算的 scale 应用到各 `PageFrameElement`
    - _Requirements: 3.1_
  - [ ]* 2.2 编写属性测试：帧构建包含有效 scale 值
    - **Property 4: Frame building includes valid scale values**
    - **Validates: Requirements 3.1, 3.2**





- [x] 3. 更新 PageFrameBuilder 和命令接口
  - [x] 3.1 在 `PageFrameContext` 中添加 `wide_page_stretch` 字段
    - 更新 context 结构体
    - 更新 builder 使用新的 stretch 模式
    - _Requirements: 2.4, 3.1_
  - [x] 3.2 更新 `pf_update_context` 命令接受 stretch 模式参数
    - 修改命令签名（`widePageStretch` 参数）
    - 传递参数到 builder
    - _Requirements: 3.2_

- [x] 4. Checkpoint - 确保所有测试通过
  - `cargo check` 通过
  - `yarn check` 通过

- [x] 5. 更新前端类型和 API
  - [x] 5.1 在 `src/lib/stackview/types/frame.ts` 添加 scale 字段
    - 更新 `FrameImage` 接口
    - 确保类型与后端一致
    - _Requirements: 3.2_
  - [x] 5.2 更新 `src/lib/api/pageManager.ts` 传递 stretch 模式
    - 添加 `WidePageStretch` 类型
    - 更新 `PageFrameElementInfo` 和 `PageFrameContext`
    - _Requirements: 2.4_

- [x] 6. 更新前端渲染逻辑
  - [x] 6.1 更新 `CurrentFrameLayer.svelte` 应用 scale
    - 实现 `getImageDisplayStyle` 函数
    - 为每个图片应用独立的 scale
    - 双页模式下计算组合尺寸并整体适应视口
    - _Requirements: 3.3, 4.1_
  - [ ]* 6.2 编写属性测试：帧缩放适应视口并保持比例
    - **Property 5: Frame scale fits viewport while maintaining proportions**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**





- [x] 7. 添加设置选项
  - [x] 7.1 在设置中添加 WidePageStretch 选项
    - 更新 `settingsManager.ts` 类型定义（`WidePageStretch` 类型）
    - 添加 `view.pageLayout.widePageStretch` 设置项
    - 默认值：`uniformHeight`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [ ] 7.2 添加 UI 控件让用户选择模式（可选）
    - 在设置界面添加下拉选择框

- [ ] 8. 序列化测试
  - [ ]* 8.1 编写属性测试：序列化往返保持 scale 值
    - **Property 6: Serialization round-trip preserves scale**
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [x] 9. Final Checkpoint - 确保所有测试通过
  - `cargo check` 通过 ✓
  - `yarn check` 通过 ✓
