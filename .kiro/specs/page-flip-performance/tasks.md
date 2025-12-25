# Implementation Plan

## 1. 创建预解码缓存模块

- [x] 1.1 创建 `src/lib/stackview/stores/preDecodeCache.ts`
  - 定义 `PreDecodedEntry` 接口（img, url, timestamp）
  - 定义 `PreDecodeCache` 类
  - 实现 `get`, `has`, `clear` 方法
  - _Requirements: 1.1, 1.2_

- [x] 1.2 实现预解码核心逻辑
  - 实现 `preDecodeAndCache(pageIndex, url)` 方法
  - 使用 `img.decode()` API 在后台解码
  - 解码完成后存入缓存
  - _Requirements: 1.1, 1.3_

- [x] 1.3 实现 LRU 缓存淘汰
  - 设置最大缓存数量（默认 20）
  - 超出限制时淘汰最久未使用的条目
  - 淘汰时释放 HTMLImageElement 引用
  - _Requirements: 1.4_

- [x] 1.4 实现缓存统计
  - 记录缓存命中/未命中次数
  - 实现 `getStats()` 方法返回命中率
  - _Requirements: 5.3_

## 2. 创建分层渲染队列

- [x] 2.1 创建 `src/lib/stackview/stores/renderQueue.ts`
  - 定义优先级常量（CRITICAL=100, HIGH=80, NORMAL=50, LOW=20）
  - 定义 `QueueTask` 接口
  - 定义 `RenderQueue` 类
  - _Requirements: 2.1, 2.2_

- [x] 2.2 实现任务调度逻辑
  - 实现 `setCurrentPage(pageIndex)` 方法
  - 当前页使用 CRITICAL 优先级
  - ±1 页使用 HIGH 优先级
  - ±2-3 页使用 NORMAL 优先级
  - ±4-5 页使用 LOW 优先级
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 2.3 实现任务取消机制
  - 使用 token 机制标识任务版本
  - 实现 `cancelAll()` 方法
  - 新页面切换时自动取消旧任务
  - _Requirements: 2.4, 3.1, 3.2_

- [x] 2.4 实现延迟加载
  - 当前页立即加载
  - 周围页延迟 100ms 后开始加载
  - 更远的页延迟 300ms 后开始加载
  - _Requirements: 2.2, 2.3_

## 3. 集成到 stackImageLoader

- [x] 3.1 修改 `src/lib/stackview/utils/stackImageLoader.ts`
  - 添加 `preDecodeCache` 实例
  - 添加 `renderQueue` 实例
  - _Requirements: 1.1_

- [x] 3.2 实现 `preloadWithDecode` 方法
  - 先调用 `loadPage` 获取 Blob URL
  - 再调用 `preDecodeCache.preDecodeAndCache` 预解码
  - 记录预解码耗时
  - _Requirements: 1.1, 5.1_

- [x] 3.3 添加预解码查询方法
  - 实现 `getPreDecodedUrl(pageIndex)` 方法
  - 实现 `isPreDecoded(pageIndex)` 方法
  - _Requirements: 1.2_

- [x] 3.4 修改 `preloadRange` 方法
  - 改用 `preloadWithDecode` 替代 `loadPage`
  - 按优先级顺序预加载
  - _Requirements: 2.2, 2.3_

## 4. 修改 imageStore 使用预解码

- [x] 4.1 修改 `src/lib/stackview/stores/imageStore.svelte.ts`
  - 在 `loadCurrentPage` 开头检查预解码缓存
  - 如果命中，直接使用预解码 URL，跳过加载
  - 记录缓存命中日志
  - _Requirements: 1.2, 1.3_

- [x] 4.2 触发分层预加载
  - 当前页加载完成后调用 `renderQueue.setCurrentPage`
  - 确保预加载在后台异步执行
  - _Requirements: 2.1, 2.2_

- [x] 4.3 添加性能监控
  - 记录翻页总延迟
  - 延迟超过 100ms 时打印警告
  - _Requirements: 5.1, 5.2_

## 5. 修改 FrameImage 组件

- [x] 5.1 修改 `src/lib/stackview/components/FrameImage.svelte`
  - 修改 `displayUrl` 派生逻辑
  - 优先检查预解码缓存
  - 其次检查超分图
  - 最后使用原始 URL
  - _Requirements: 1.2_

- [ ] 5.2 添加 IntersectionObserver 优化（可选）
  - 创建 IntersectionObserver 监测图片可见性
  - 设置 rootMargin 为 2000px
  - 只有即将可见的图片才触发解码
  - _Requirements: 4.2, 4.3_

## 6. Checkpoint - 基础功能验证

- [x] 6.1 运行 `yarn check` 确保编译通过
- [ ] 6.2 手动测试翻页延迟
  - 打开一本漫画
  - 翻几页让预加载完成
  - 测试翻页是否流畅（<50ms）
- [ ] 6.3 检查控制台日志
  - 确认预解码缓存命中日志
  - 确认无错误警告

## 7. 性能优化调优

- [ ] 7.1 调整预解码缓存大小
  - 根据内存占用调整 maxSize
  - 大图片场景可能需要减小
  - _Requirements: 1.4_

- [ ] 7.2 调整预加载范围
  - 根据翻页速度调整预加载页数
  - 快速翻页场景可能需要增加
  - _Requirements: 2.2_

- [x] 7.3 添加动图特殊处理
  - 检测 GIF/WebP/APNG 动图
  - 动图不使用预解码（保持动画）
  - _Requirements: 4.4_

## 8. 清理和文档

- [ ] 8.1 移除调试日志
  - 保留关键性能日志
  - 移除冗余的 console.log

- [ ] 8.2 添加代码注释
  - 为新增的类和方法添加 JSDoc 注释
  - 说明预解码机制的工作原理

## 9. Final Checkpoint

- [x] 9.1 运行 `yarn check` 确保编译通过
- [ ] 9.2 性能验证
  - 翻页延迟（缓存命中）< 50ms
  - 预解码缓存命中率 > 80%
- [ ] 9.3 内存验证
  - 内存占用增加 < 100MB
