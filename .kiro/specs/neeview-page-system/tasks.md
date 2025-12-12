设计文档已创建。让我请求你的反馈：

设计文档已创建，请查看 .kiro/specs/neeview-page-system/design.md

设计文档包含以下核心内容：

架构设计：

系统架构图（前端 ↔ IPC ↔ 后端）
模块结构（job_engine, page_manager, page_frame）
核心组件：

JobEngine - 任务调度系统（JobScheduler + JobWorker）
MemoryPool - 智能内存池（距离驱逐策略）
PageFrame 三层架构 - Page → PageFrameElement → PageFrame
PageFrameBuilder - 帧构建器（处理分割和双页）
PageFrameContext - 配置上下文
数据模型：

后端：Page, CachedPage, BookContext, PagePosition, PageRange
前端：PageFrameState, PageFrameContext
正确性属性（15 个）：

任务优先级排序、去重、Worker 过滤
距离驱逐、页面锁定
分割页面生成、方向顺序
双页配对、横向隔离
虚拟页数计算、步长计算
拉伸模式、位置保持
预加载窗口、缓存性能
测试策略：

Rust: proptest
TypeScript: fast-check

# Implementation Plan

## Phase 1: 后端 JobEngine 模块

- [x] 1. 创建 JobEngine 基础结构

  - [x] 1.1 创建 `src-tauri/src/core/job_engine/mod.rs` 模块入口

    - 定义 JobEngine 结构体和公共接口
    - 实现 new(), submit(), submit_batch(), cancel_book(), shutdown()
    - _Requirements: 1.1, 1.5_
  - [x] 1.2 实现 `job.rs` 任务定义

    - 定义 JobPriority 枚举 (Thumbnail=10, Preload=50, CurrentPage=90, Urgent=100)
    - 定义 JobCategory 枚举
    - 定义 Job 结构体 (key, priority, category, executor)
    - _Requirements: 1.1_
  - [x] 1.3 实现 `scheduler.rs` 优先级调度器

    - 实现 BinaryHeap 优先级队列
    - 实现 enqueue() 自动取消相同 key 的旧任务
    - 实现 dequeue() 按优先级范围获取任务
    - 实现 cancel_by_prefix() 批量取消
    - _Requirements: 1.2, 1.3, 1.4_
  - [ ]* 1.4 编写 JobScheduler 属性测试
    - **Property 1: Job Priority Ordering**
    - **Validates: Requirements 1.2**
  - [ ]* 1.5 编写 Job Deduplication 属性测试
    - **Property 2: Job Deduplication**
    - **Validates: Requirements 1.3**
  - [x] 1.6 实现 `worker.rs` 工作线程

    - 实现 JobWorker 结构体
    - Primary Worker 只处理 priority >= 10
    - Secondary Worker 处理所有任务
    - 实现 run() 主循环
    - _Requirements: 1.6, 1.7_
  - [ ]* 1.7 编写 Worker Priority Filtering 属性测试
    - **Property 3: Worker Priority Filtering**
    - **Validates: Requirements 1.6, 1.7**

- [ ] 2. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Phase 2: 后端 MemoryPool 模块


- [ ] 3. 创建 MemoryPool 智能缓存
  - [x] 3.1 创建 `src-tauri/src/core/page_manager/memory_pool.rs`

    - 定义 PageKey 结构体 (book_path, page_index)
    - 定义 CachedPage 结构体 (data, page_index, size, last_accessed, is_locked)
    - 实现 MemoryPool 结构体
    - _Requirements: 2.1_
  - [x] 3.2 实现距离驱逐策略

    - 实现 evict_priority() 计算驱逐优先级
    - 实现 evict_one() 驱逐单个页面
    - 考虑阅读方向 (direction)
    - _Requirements: 2.2, 2.3_
  - [ ]* 3.3 编写 Distance-Based Eviction 属性测试
    - **Property 4: Distance-Based Eviction**
    - **Validates: Requirements 2.2, 2.3**
  - [x] 3.4 实现页面锁定机制

    - 实现 lock() 和 unlock() 方法
    - 驱逐时跳过锁定页面
    - _Requirements: 2.4_
  - [ ]* 3.5 编写 Page Lock Protection 属性测试
    - **Property 5: Page Lock Protection**
    - **Validates: Requirements 2.4**
  - [x] 3.6 实现缓存清理

    - 实现 clear_book() 清除指定书籍缓存
    - 实现 stats() 获取统计信息
    - _Requirements: 2.5_

- [ ] 4. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Phase 3: 后端 PageFrame 模块

- [x] 5. 创建 PageFrame 核心类型


  - [x] 5.1 创建 `src-tauri/src/core/page_frame/position.rs`

    - 定义 PagePosition 结构体 (index, part)
    - 实现 next(), prev() 方法
    - _Requirements: 4.1_
  - [x] 5.2 创建 `src-tauri/src/core/page_frame/range.rs`

    - 定义 PageRange 结构体 (min, max)
    - 实现 is_one_page(), next(), merge() 方法
    - _Requirements: 4.2_
  - [x] 5.3 创建 `src-tauri/src/core/page_frame/page.rs`

    - 定义 Page 结构体 (index, path, inner_path, name, size, width, height, aspect_ratio)
    - 实现 is_landscape() 方法
    - _Requirements: 3.1_
  - [x] 5.4 创建 `src-tauri/src/core/page_frame/element.rs`

    - 定义 PageFrameElement 结构体
    - 实现 width(), height(), is_landscape() 方法
    - 支持 crop_rect 裁剪区域
    - _Requirements: 3.2_
  - [x] 5.5 创建 `src-tauri/src/core/page_frame/frame.rs`

    - 定义 PageFrame 结构体 (elements, frame_range, direction, angle, scale, size)
    - 实现 single(), double() 构造方法
    - 实现 contains(), get_directed_elements() 方法
    - _Requirements: 3.2_

- [x] 6. 实现 PageFrameBuilder


  - [x] 6.1 创建 `src-tauri/src/core/page_frame/builder.rs`

    - 定义 PageFrameBuilder 结构体
    - 定义 PageFrameContext 配置结构体
    - _Requirements: 3.3, 3.4, 3.5, 3.6_
  - [x] 6.2 实现分割页面逻辑

    - 检测横向页面 (aspect_ratio > divide_page_rate)
    - 生成左右两个 PageFrameElement
    - 计算 crop_rect
    - _Requirements: 5.1, 5.2_
  - [ ]* 6.3 编写 Split Page Generation 属性测试
    - **Property 6: Split Page Generation**
    - **Validates: Requirements 3.3, 5.1**
  - [x] 6.4 实现分割页面方向顺序

    - LTR: 左半边先显示
    - RTL: 右半边先显示
    - _Requirements: 5.3, 5.4_
  - [ ]* 6.5 编写 Split Page Order 属性测试
    - **Property 7: Split Page Order by Direction**
    - **Validates: Requirements 5.3, 5.4**
  - [x] 6.6 实现双页配对逻辑

    - 两个竖向页面组成一帧
    - 首页/末页单独显示选项
    - _Requirements: 6.1, 6.5, 6.6_
  - [ ]* 6.7 编写 Double Page Pairing 属性测试
    - **Property 8: Double Page Pairing**
    - **Validates: Requirements 6.1, 6.5, 6.6**
  - [x] 6.8 实现横向页面独占逻辑

    - is_supported_wide_page 启用时横向页面独占
    - _Requirements: 6.2, 6.3_
  - [ ]* 6.9 编写 Landscape Page Isolation 属性测试
    - **Property 9: Landscape Page Isolation**
    - **Validates: Requirements 6.2, 6.3**

  - [x] 6.10 实现虚拟页数计算
    - 考虑分割页面的额外计数
    - _Requirements: 4.5_
  - [ ]* 6.11 编写 Virtual Page Count 属性测试
    - **Property 10: Virtual Page Count Calculation**
    - **Validates: Requirements 4.5**

  - [x] 6.12 实现导航步长计算
    - 分割页面步长 0.5
    - 双页模式步长 1 或 2
    - _Requirements: 4.3, 4.4_
  - [ ]* 6.13 编写 Navigation Step 属性测试
    - **Property 11: Navigation Step Calculation**
    - **Validates: Requirements 4.3**

- [ ] 7. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Phase 4: 后端 PageContentManager 模块

- [x] 8. 创建 PageContentManager
  - [x] 8.1 创建 `src-tauri/src/core/page_manager/mod.rs`

    - 定义 PageContentManager 结构体
    - 集成 JobEngine 和 MemoryPool
    - _Requirements: 1.1, 2.1_
  - [x] 8.2 实现 open_book() 方法

    - 清除旧书籍缓存
    - 加载新书籍页面列表
    - 初始化 BookContext
    - _Requirements: 3.1_

  - [x] 8.3 实现 goto_position() 方法
    - 提交当前页加载任务 (CurrentPage 优先级)
    - 更新阅读方向
    - 返回 PageFrame 信息
    - _Requirements: 4.6_

  - [x] 8.4 实现预加载管道
    - 前向预加载 5 页
    - 后向预加载 2 页
    - 取消不在窗口内的预加载
    - _Requirements: 8.1, 8.2, 8.3_
  - [ ]* 8.5 编写 Preload Window 属性测试
    - **Property 14: Preload Window Management**
    - **Validates: Requirements 8.1, 8.2**
  - [x] 8.6 实现 get_page_data() 方法
    - 从缓存获取或等待加载
    - 返回二进制数据
    - _Requirements: 8.4_
  - [ ]* 8.7 编写 Cache Hit Performance 属性测试
    - **Property 15: Cache Hit Performance**
    - **Validates: Requirements 8.4**

- [ ] 9. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Phase 5: 后端 ContentSizeCalculator


- [ ] 10. 实现 ContentSizeCalculator
  - [x] 10.1 创建 `src-tauri/src/core/page_frame/calculator.rs`

    - 定义 ContentSizeCalculator 结构体
    - 定义 StretchMode 枚举
    - _Requirements: 9.1_
  - [x] 10.2 实现各种 StretchMode 计算

    - Uniform: 适应视口
    - UniformToFill: 填充视口
    - UniformToVertical: 适应高度
    - UniformToHorizontal: 适应宽度
    - _Requirements: 9.2, 9.3, 9.4, 9.5_
  - [ ]* 10.3 编写 Stretch Mode 属性测试
    - **Property 12: Stretch Mode Calculation**
    - **Validates: Requirements 9.2, 9.3, 9.4, 9.5**
  - [x] 10.4 实现自动旋转计算

    - 根据图片和视口方向决定是否旋转
    - _Requirements: 9.6_

- [ ] 11. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Phase 6: 后端 Tauri Commands

- [x] 12. 创建 Tauri Commands



  - [x] 12.1 创建 `src-tauri/src/commands/page_commands.rs`

    - 实现 open_book_v2 命令
    - 实现 goto_position 命令
    - 实现 get_page_image 命令
    - 实现 next_frame / prev_frame 命令
    - _Requirements: 11.1, 11.5_
  - [x] 12.2 实现二进制传输

    - 使用 tauri::ipc::Response 返回二进制数据
    - 避免 Base64 编码
    - _Requirements: 11.2_
  - [x] 12.3 实现事件推送

    - page_loaded 事件
    - page_unloaded 事件
    - memory_pressure 事件
    - _Requirements: 11.3_
  - [x] 12.4 实现 update_context 命令

    - 更新 PageFrameContext 配置
    - 触发帧重新计算
    - _Requirements: 10.4_
  - [x] 12.5 实现设置切换时位置保持

    - 记录当前物理页面索引
    - 重新计算帧后导航到正确位置
    - _Requirements: 10.1, 10.2, 10.3_
  - [ ]* 12.6 编写 Position Preservation 属性测试
    - **Property 13: Position Preservation on Setting Change**
    - **Validates: Requirements 10.1, 10.2, 10.3**

- [ ] 13. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Phase 7: 前端 Store 和 API


- [ ] 14. 创建前端 API 封装
  - [x] 14.1 创建 `src/lib/api/pageManager.ts`

    - 封装 openBook, gotoPosition, getPageImage 等 API
    - 处理二进制响应转 Blob
    - _Requirements: 11.1, 11.4_
  - [x] 14.2 实现事件监听

    - 监听 page_loaded, page_unloaded, memory_pressure 事件
    - _Requirements: 11.3_

- [x] 15. 创建 PageFrameStore

  - [x] 15.1 创建 `src/lib/stores/pageFrame.svelte.ts`

    - 定义 PageFrameState 状态
    - 实现 openBook, nextFrame, prevFrame 方法
    - _Requirements: 11.5_
  - [x] 15.2 实现上下文配置管理

    - 同步 PageFrameContext 到后端
    - 响应配置变化
    - _Requirements: 10.4_

## Phase 8: 前端 FrameLayer 组件

- [ ] 16. 重构 FrameLayer 组件
  - [x] 16.1 更新 `src/lib/stackview/StackView.svelte`
    - 集成 PageFrameStore（已有完整帧管理逻辑）
    - 协调 CurrentFrameLayer/PrevFrameLayer/NextFrameLayer
    - _Requirements: 7.5_
  - [x] 16.2 更新 `src/lib/stackview/layers/CurrentFrameLayer.svelte`

    - 支持分割页面渲染 (CSS clip-path)
    - 支持双页布局
    - _Requirements: 5.2, 5.5, 6.4_
  - [x] 16.3 更新 PrevFrameLayer/NextFrameLayer
    - 同步分割页面和双页支持（添加 cropRect 支持）
    - 添加 direction 属性支持 RTL
    - 预加载帧数据
    - _Requirements: 7.5_
  - [x] 16.4 实现无闪烁切换
    - 预缓存尺寸计算缩放（imageTransitionManager）
    - 原子切换图片和缩放（transitionState）
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

## Phase 9: 错误处理和集成

- [x] 17. 实现错误处理
  - [x] 17.1 后端错误处理
    - 创建 `src-tauri/src/core/page_frame/error.rs`
    - 定义 PageFrameError 枚举（8 种错误类型）
    - 实现 is_retryable() 判断可重试错误
    - 实现 error_code() 用于前端识别
    - _Requirements: 12.1, 12.2_
  - [x] 17.2 前端错误处理
    - 创建 `src/lib/utils/pageFrameError.ts`
    - 实现 parsePageFrameError() 解析后端错误
    - 实现 withRetry() 指数退避重试
    - 实现 ErrorBoundaryState 错误边界状态管理
    - _Requirements: 12.1, 12.5_
  - [x] 17.3 内存压力处理
    - 实现 subscribeEvents() 订阅后端事件
    - 实现 createMemoryPressureHandler() 内存压力处理器
    - 支持自动清理和手动触发清理
    - _Requirements: 12.4_

- [ ] 18. 集成测试（需手动验证）
  - [ ] 18.1 端到端翻页测试
    - 打开书籍 → 翻页 → 验证帧内容
  - [ ] 18.2 设置切换测试
    - 切换分割模式 → 验证位置保持
  - [ ] 18.3 性能测试
    - 预加载命中率
    - 缓存访问延迟

- [ ] 19. Final Checkpoint - 确保所有测试通过
  - 需要用户手动运行应用验证功能

