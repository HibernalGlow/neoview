# Implementation Plan

## 1. 创建 ThumbnailLoadController 核心控制器

- [x] 1.1 创建 ThumbnailLoadController 类和基础接口
  - 创建 `src/lib/services/thumbnailLoadController.ts`
  - 定义 `LoadControllerConfig` 配置接口
  - 实现 `init()` 和 `destroy()` 生命周期方法
  - _Requirements: 1.1, 7.1_

- [x] 1.2 实现中央优先排序算法
  - 实现 `sortByCenterPriority(indices: number[], center: number)` 函数
  - 按距离中心的距离升序排列
  - _Requirements: 1.2_

- [ ]* 1.3 编写中央优先排序属性测试
  - **Property 1: Center-Priority Ordering**
  - **Validates: Requirements 1.2**

- [x] 1.4 实现防抖和请求版本控制
  - 实现 `debounce` 逻辑（100ms 延迟）
  - 实现请求版本号机制，用于取消旧请求
  - _Requirements: 2.1, 2.2_

- [ ]* 1.5 编写防抖合并属性测试
  - **Property 3: Debounce Coalesces Rapid Requests**
  - **Validates: Requirements 2.1**

## 2. 优化 ThumbnailCacheStore 缓存管理

- [x] 2.1 添加内存使用追踪
  - 在 `ThumbnailEntry` 中添加 `size` 字段
  - 实现 `getMemoryUsage()` 方法
  - 维护总内存使用量计数器
  - _Requirements: 5.1_

- [x] 2.2 实现 LRU 淘汰机制
  - 实现 `evictLRU(targetBytes: number)` 方法
  - 设置默认内存上限 100MB
  - 在 `setThumbnail` 时检查并触发淘汰
  - _Requirements: 5.1, 5.3_

- [ ]* 2.3 编写 LRU 淘汰属性测试
  - **Property 6: LRU Eviction Under Memory Pressure**
  - **Validates: Requirements 5.1**

- [x] 2.4 实现批量操作方法
  - 实现 `setThumbnailsBatch(entries: ThumbnailEntry[])` 方法
  - 优化批量写入性能
  - _Requirements: 7.3_

## 3. Checkpoint - 确保所有测试通过
- [x] 3. Ensure all tests pass, ask the user if questions arise.

## 4. 集成 ThumbnailLoadController 到 BottomThumbnailBar

- [x] 4.1 重构 BottomThumbnailBar 使用新控制器
  - 替换现有的 `loadVisibleThumbnails` 逻辑
  - 使用 `ThumbnailLoadController` 管理加载
  - 保持现有 UI 和交互不变
  - _Requirements: 1.1, 1.3_

- [x] 4.2 实现可见性变化处理
  - 在 `isVisible` 变化时调用 `onVisibilityChange()`
  - 确保 100ms 内开始加载
  - _Requirements: 1.1_

- [x] 4.3 优化滚动事件处理
  - 使用控制器的 `onScroll()` 方法
  - 实现滚动停止后 500ms 内完成加载
  - _Requirements: 2.1, 2.3_

- [ ]* 4.4 编写请求取消属性测试
  - **Property 4: Request Cancellation on Directory Change**
  - **Validates: Requirements 2.2, 3.4**

## 5. 实现智能预加载策略

- [x] 5.1 实现预加载范围计算
  - 根据当前页面和配置计算预加载范围
  - 默认预加载前后各 20 页
  - _Requirements: 3.1_

- [ ]* 5.2 编写预加载范围属性测试
  - **Property 5: Preload Range Coverage**
  - **Validates: Requirements 3.1**

- [x] 5.3 实现优先级队列
  - 定义 `LoadPriority` 枚举
  - 实现优先级排序逻辑
  - _Requirements: 3.2, 7.4_

- [ ]* 5.4 编写优先级队列属性测试
  - **Property 10: Priority Queue Processing**
  - **Validates: Requirements 3.2, 7.4**

## 6. Checkpoint - 确保所有测试通过
- [x] 6. Ensure all tests pass, ask the user if questions arise.

## 7. 优化后端缩略图服务

- [x] 7.1 优化 preload_book_thumbnails 命令
  - 确保中央优先排序在后端执行
  - 优化批量处理逻辑
  - _Requirements: 1.2, 7.3_

- [x] 7.2 实现批量事件推送
  - 添加 `thumbnail-batch-ready` 事件
  - 合并多个缩略图到单次事件
  - _Requirements: 7.3_

- [ ]* 7.3 编写批量请求属性测试
  - **Property 9: Batch Request Optimization**
  - **Validates: Requirements 7.3**

## 8. 实现缓存命中优化

- [x] 8.1 优化内存缓存命中路径
  - 确保缓存命中时不触发 IPC
  - 实现 1ms 内返回
  - _Requirements: 1.4, 6.1_

- [ ]* 8.2 编写缓存命中属性测试
  - **Property 2: Cache Hit Returns Immediately**
  - **Validates: Requirements 1.4, 6.1**

- [x] 8.3 实现数据库缓存提升
  - 从数据库加载后更新内存缓存
  - 确保 50ms 内完成
  - _Requirements: 6.2, 6.3_

- [ ]* 8.4 编写缓存提升属性测试
  - **Property 7: Cache Promotion on Database Hit**
  - **Validates: Requirements 6.3**

## 9. 实现非阻塞 UI 更新

- [x] 9.1 优化事件监听和 UI 更新
  - 确保 thumbnail-ready 事件处理不阻塞主线程
  - 使用 requestAnimationFrame 批量更新 UI
  - _Requirements: 7.1, 7.2_

- [ ]* 9.2 编写非阻塞更新属性测试
  - **Property 8: Non-Blocking UI Updates**
  - **Validates: Requirements 7.1, 7.2**

## 10. 实现占位符和错误处理

- [x] 10.1 优化占位符显示
  - 确保占位符尺寸一致，防止布局抖动
  - 显示页码信息
  - _Requirements: 4.1, 4.4_

- [x] 10.2 实现加载失败处理
  - 显示错误占位符
  - 记录失败索引，不自动重试
  - _Requirements: 4.3_

## 11. Final Checkpoint - 确保所有测试通过
- [x] 11. Ensure all tests pass, ask the user if questions arise.

