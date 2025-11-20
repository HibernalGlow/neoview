# 缩略图优化功能说明

本文档说明新增的缩略图优化功能，包括预测性加载、智能缓存淘汰、增量批量加载和 WebWorker 并行化。

## 功能概述

### 1. 预测性加载 (Predictive Loading)

根据滚动方向预测用户下一步可能查看的项目，提前加载预测范围内的缩略图。

**实现位置：**
- `src/lib/utils/predictiveLoader.ts` - 预测性加载器核心逻辑
- `src/lib/utils/thumbnailManager.ts` - 集成到缩略图管理器
- `src/lib/components/panels/file/components/VirtualizedFileList.svelte` - 在虚拟滚动中使用

**特性：**
- 自动检测滚动方向（上/下/左/右）
- 根据滚动速度自适应调整预测范围
- 支持垂直和水平滚动预测
- 可配置预测范围（默认 20 个项目）

**使用方法：**
```typescript
// 在滚动事件中更新预测性加载器
thumbnailManager.updateScroll(scrollTop, scrollLeft, currentIndex, totalItems);
```

### 2. 智能缓存淘汰 (LRU Cache)

基于 LRU（Least Recently Used）算法的智能缓存淘汰系统，限制内存使用。

**实现位置：**
- `src/lib/utils/lruCache.ts` - LRU 缓存实现
- `src/lib/utils/thumbnailManager.ts` - 集成到缩略图管理器

**特性：**
- 基于访问时间的 LRU 淘汰策略
- 支持基于大小和项数的双重限制
- 可选的 TTL（Time To Live）过期机制
- 自动清理过期缓存项
- 提供缓存统计信息

**配置：**
```typescript
// 默认配置：100MB 内存限制，最多 10000 个缓存项
const lruCache = new LRUCache<string>({
  maxSize: 100 * 1024 * 1024, // 100MB
  maxItems: 10000,
  ttl: undefined, // 可选：缓存过期时间（毫秒）
});
```

**API：**
```typescript
// 获取缓存
const cached = lruCache.get(key);

// 设置缓存
lruCache.set(key, value, size);

// 获取统计信息
const stats = lruCache.getStats();

// 清理过期项
const cleaned = lruCache.cleanupExpired();
```

### 3. 增量批量加载 (Incremental Batch Loading)

支持流式批量加载，边查询边显示，减少首屏等待时间。

**实现位置：**
- `src/lib/utils/incrementalBatchLoader.ts` - 增量批量加载器
- `src/lib/utils/thumbnailManager.ts` - 集成到缩略图管理器

**特性：**
- 分批加载，每批之间可配置延迟
- 支持优先级排序
- 流式显示，边加载边显示结果
- 自动去重
- 支持取消操作

**使用方法：**
```typescript
const loader = new IncrementalBatchLoader<string>(
  async (items) => {
    // 批量加载执行器
    const results = await batchLoadFromDb(items.map(i => i.path));
    return results;
  },
  {
    batchSize: 50,      // 每批 50 个
    streamDelay: 50,    // 每批延迟 50ms
    maxConcurrent: 3,   // 最多 3 个并发
  }
);

// 设置回调，边加载边显示
loader.setCallback((result) => {
  if (result.data) {
    // 立即显示结果
    displayThumbnail(result.id, result.data);
  }
});

// 添加项目并开始加载
loader.addItems(items);
await loader.start();
```

### 4. WebWorker 并行化 (WebWorker Parallelization)

将缩略图处理移到 Worker 线程，避免阻塞主线程。

**实现位置：**
- `src/lib/workers/thumbnailWorker.ts` - Worker 线程处理逻辑
- `src/lib/utils/thumbnailWorkerManager.ts` - Worker 管理器

**特性：**
- 在 Worker 线程中处理缩略图生成
- 支持单个和批量处理
- 自动回退到主线程（如果 Worker 不可用）
- 支持取消操作
- 进度回调支持

**使用方法：**
```typescript
import { thumbnailWorkerManager } from '$lib/utils/thumbnailWorkerManager';

// 初始化 Worker
await thumbnailWorkerManager.initialize();

// 处理单个缩略图
await thumbnailWorkerManager.processThumbnail(
  {
    id: 'thumbnail-1',
    blobData: uint8Array,
    maxWidth: 256,
    maxHeight: 256,
    quality: 0.85,
  },
  (result) => {
    if (result.dataUrl) {
      // 使用生成的缩略图
      displayThumbnail(result.id, result.dataUrl);
    } else if (result.error) {
      console.error('处理失败:', result.error);
    }
  }
);

// 批量处理
await thumbnailWorkerManager.processBatchThumbnails(tasks, callback);
```

## 集成说明

### 缩略图管理器更新

`thumbnailManager` 已更新以支持所有新功能：

1. **LRU 缓存集成**
   - 自动使用 LRU 缓存存储缩略图
   - 当缓存满时自动淘汰最少使用的项
   - 提供缓存统计和清理方法

2. **预测性加载集成**
   - 在滚动时自动触发预测性加载
   - 根据滚动方向预测需要加载的缩略图

3. **增量批量加载集成**
   - 大批量加载时自动使用增量批量加载
   - 边加载边显示，提升用户体验

4. **WebWorker 支持**
   - 可选使用 Worker 处理缩略图（需要时启用）

### 使用示例

```typescript
import { thumbnailManager } from '$lib/utils/thumbnailManager';

// 在滚动事件中
function handleScroll(scrollTop: number, scrollLeft: number) {
  const currentIndex = calculateCurrentIndex();
  const totalItems = items.length;
  
  // 更新预测性加载
  thumbnailManager.updateScroll(scrollTop, scrollLeft, currentIndex, totalItems);
}

// 批量加载缩略图（自动使用增量加载）
const results = await thumbnailManager.batchLoadFromDb(paths);

// 获取缓存统计
const stats = thumbnailManager.getCacheStats();
console.log('LRU 缓存使用率:', stats.lru.usage);
console.log('LRU 缓存项数:', stats.lru.count);

// 清理过期缓存
const cleaned = thumbnailManager.cleanupCache();
console.log('清理了', cleaned, '个过期项');
```

## 性能优化建议

1. **预测性加载**
   - 根据实际使用情况调整 `lookAhead` 参数
   - 快速滚动时自动增加预测范围

2. **LRU 缓存**
   - 根据可用内存调整 `maxSize`
   - 定期清理过期项（可设置定时任务）

3. **增量批量加载**
   - 根据网络速度调整 `streamDelay`
   - 大批量加载时使用增量加载

4. **WebWorker**
   - Worker 初始化有开销，适合批量处理
   - 单个缩略图处理可能不需要 Worker

## 注意事项

1. **Worker 兼容性**
   - 某些环境可能不支持 Worker，会自动回退到主线程
   - 生产环境需要确保 Worker 文件正确打包

2. **内存管理**
   - LRU 缓存会自动淘汰，但建议定期检查内存使用
   - 大量缩略图时注意内存限制

3. **性能监控**
   - 使用 `getCacheStats()` 监控缓存使用情况
   - 根据实际情况调整配置参数

## 未来改进

- [ ] 添加缓存预热机制
- [ ] 支持更智能的预测算法（基于用户行为）
- [ ] 添加性能监控和报告
- [ ] 支持 Service Worker 缓存
- [ ] 添加缩略图压缩优化

