# Implementation Plan

## 状态说明

**⚠️ 回滚通知**：由于优化后缩略图加载变慢甚至不显示，已回滚以下修改：
- 删除了 `ThumbnailLoadController` 类
- 简化了 `thumbnailCacheStore`，移除了复杂的 LRU 淘汰和内存追踪
- 恢复了 `thumbnailService` 的简单防抖逻辑

**保留的优化**：
- 后端 `thumbnail_service_v3.rs` 的 NeeView 风格架构（后端推送、LRU 缓存、多线程工作池）
- 前端 `thumbnailService` 的后端推送模式和中央优先策略

**最新修改**（速度优化 v2）：
- 初始预加载范围：8 → 10 页
- 后台批次大小：15 → 20 页
- 后台加载间隔：300ms → 200ms
- 切书延迟：150ms → 100ms
- 防抖时间：80ms → 50ms
- 后台启动延迟：300ms → 100ms
- 修复了后台加载终止条件（正确计算最大半径）

**下一步**：
- 用户测试速度优化是否正常工作

---

## 1. 创建 ThumbnailLoadController 核心控制器

- [x] ~~1.1 创建 ThumbnailLoadController 类和基础接口~~ **（已回滚）**
- [x] 1.2 实现中央优先排序算法（保留在 thumbnailService 中）
- [ ]* 1.3 编写中央优先排序属性测试
- [x] 1.4 实现防抖和请求版本控制（保留在 thumbnailService 中）
- [ ]* 1.5 编写防抖合并属性测试

## 2. 优化 ThumbnailCacheStore 缓存管理

- [x] ~~2.1 添加内存使用追踪~~ **（已回滚）**
- [x] ~~2.2 实现 LRU 淘汰机制~~ **（已回滚）**
- [ ]* 2.3 编写 LRU 淘汰属性测试
- [x] 2.4 实现批量操作方法（保留 setThumbnails）

## 3. Checkpoint
- [x] 3. 回滚后代码检查通过

## 4. 集成到 BottomThumbnailBar

- [x] 4.1 简化 BottomThumbnailBar 使用 thumbnailService
- [x] 4.2 实现可见性变化处理
- [x] 4.3 优化滚动事件处理
- [ ]* 4.4 编写请求取消属性测试

## 5. 实现智能预加载策略

- [x] 5.1 实现预加载范围计算（PRELOAD_RANGE = 5）
- [ ]* 5.2 编写预加载范围属性测试
- [x] 5.3 实现优先级队列（后端实现）
- [ ]* 5.4 编写优先级队列属性测试

## 6. Checkpoint
- [x] 6. 回滚后代码检查通过

## 7. 后端缩略图服务（已完成，未回滚）

- [x] 7.1 优化 pm_preload_thumbnails 命令
- [x] 7.2 实现事件推送（thumbnail-ready）
- [ ]* 7.3 编写批量请求属性测试

## 8. 缓存命中优化

- [x] 8.1 优化内存缓存命中路径
- [ ]* 8.2 编写缓存命中属性测试
- [x] 8.3 实现数据库缓存提升（后端实现）
- [ ]* 8.4 编写缓存提升属性测试

## 9. 非阻塞 UI 更新

- [x] 9.1 优化事件监听和 UI 更新
- [ ]* 9.2 编写非阻塞更新属性测试

## 10. 占位符和错误处理

- [x] 10.1 优化占位符显示
- [x] 10.2 实现加载失败处理

## 11. Final Checkpoint
- [x] 11. 回滚后代码检查通过，等待用户测试
