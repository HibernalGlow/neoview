# 缩略图高级优化实现说明

## 当前状态

由于TypeScript文件编辑过程中出现多次替换错误，导致 `thumbnailManager.ts` 文件损坏。

建议：

1. **回滚文件**: 使用 Git 回滚到之前的稳定版本
2. **重新实现**: 从干净的代码基础上重新实现高级功能

## 已完成的基础优化（之前步骤）

✅ **后端批量查询**
- `batch_load_thumbnails_from_db` Rust 命令已实现
- 在 lib.rs 中已注册

✅ **前端批量加载**
- `batchLoadFromDb()` 方法实现
- 虚拟列表使用批量加载

✅ **智能任务管理**
- `cancelAllTasks()` / `cancelAllTasksExceptDirectory()` 
- 文件夹切换自动取消旧任务

## 计划实现的高级功能（需要重新实现）

### 1. LRU 缓存管理

**目标**: 限制内存使用，自动淘汰最少使用的缓存

**实现要点**:
```typescript
// 数据结构
interface LRUNode {
  key: string;
  value: ThumbnailCache;
  prev: LRUNode | null;
  next: LRUNode | null;
}

// 配置
MAX_CACHE_SIZE = 1000;  // 最大缓存数量
CACHE_CLEANUP_THRESHOLD = 0.9;  // 90%时触发清理

// 关键方法
- lruSet(key, value)  // 添加/更新缓存
- lruGet(key)         // 访问缓存（更新访问时间）
- cleanupLRUCache()   // 清理最少使用的缓存
```

**修改点**:
1. `ThumbnailCache` 接口增加 `accessCount` 和 `lastAccessTime`
2. 所有 `cache.set()` 改为 `lruSet()`
3. 所有 `cache.get()` 改为 `lruGet()`
4. 定期清理缓存（达到阈值时）

### 2. 预测性加载

**目标**: 根据滚动方向提前加载即将进入视野的项目

**实现要点**:
```typescript
// 追踪滚动
private lastScrollPosition = 0;
private scrollDirection: 'up' | 'down' | 'none' = 'none';
private scrollVelocity = 0;
private lastScrollTime = 0;

// 预测范围
const PREDICTION_MULTIPLIER = 2;  // 预测可见范围的2倍

// 在 VirtualizedFileList 中
function updateScrollInfo(currentPosition: number) {
  const now = Date.now();
  const deltaPos = currentPosition - lastScrollPosition;
  const deltaTime = now - lastScrollTime;
  
  // 计算速度和方向
  scrollVelocity = deltaPos / deltaTime;
  scrollDirection = deltaPos > 0 ? 'down' : 'up';
  
  // 预测范围
  const predictRange = calculatePredictRange(
    currentPosition,
    scrollDirection,
    scrollVelocity
  );
  
  // 预加载预测范围内的缩略图
  preloadPredictedRange(predictRange);
}
```

**修改点**:
1. `VirtualizedFileList.svelte` 添加滚动追踪
2. 计算预测范围
3. 提前加载预测范围内的缩略图（低优先级）

### 3. 增量批量加载

**目标**: 流式加载，边查询边显示，减少首屏等待

**实现要点**:
```typescript
// 分批次加载，每批立即显示
async batchLoadFromDbIncremental(
  paths: string[],
  onBatchReady: (results: Map<string, string>) => void
) {
  const MINI_BATCH_SIZE = 10;  // 迷你批次大小
  
  for (let i = 0; i < paths.length; i += MINI_BATCH_SIZE) {
    const batch = paths.slice(i, i + MINI_BATCH_SIZE);
    const results = await this.batchLoadFromDb(batch);
    
    // 立即触发回调，显示这一批
    onBatchReady(results);
    
    // 短暂延迟给UI反应时间
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
```

**修改点**:
1. 添加增量批量加载方法
2. 虚拟列表使用增量加载
3. 每批加载完立即更新UI

### 4. WebWorker 并行化

**目标**: 将缩略图处理移到 Worker，避免阻塞主线程

**实现要点**:
```typescript
// thumbnailWorker.ts
const worker = new Worker(
  new URL('./thumbnailWorker.ts', import.meta.url),
  { type: 'module' }
);

// 主线程
worker.postMessage({
  type: 'batchLoad',
  paths: paths
});

worker.onmessage = (e) => {
  if (e.data.type === 'batchResult') {
    // 处理结果
    updateThumbnails(e.data.results);
  }
};

// Worker 线程（thumbnailWorker.ts）
self.onmessage = async (e) => {
  if (e.data.type === 'batchLoad') {
    const results = await batchLoadFromDb(e.data.paths);
    self.postMessage({
      type: 'batchResult',
      results: results
    });
  }
};
```

**注意**: Tauri 的 `invoke` 可能无法在 Worker 中使用，需要通过主线程代理

**修改点**:
1. 创建 thumbnailWorker.ts
2. 主线程与 Worker 通信
3. Worker 处理批量加载逻辑

## 实现顺序建议

1. **首先**：回滚 thumbnailManager.ts 到干净版本
2. **第一步**：实现 LRU 缓存（最重要，限制内存）
3. **第二步**：实现预测性加载（提升用户体验）
4. **第三步**：实现增量批量加载（优化首屏）
5. **最后**：考虑 WebWorker（可选，复杂度高）

## 代码质量建议

- 使用小步骤，一次只改一个功能
- 每次修改后测试编译
- 使用辅助方法减少重复代码
- 保持向后兼容

## 测试建议

1. 大文件夹（1000+ 文件）
2. 快速滚动
3. 频繁切换文件夹
4. 监控内存使用

## 性能预期

- LRU缓存：内存稳定在设定上限以下
- 预测性加载：感知延迟减少50%
- 增量加载：首屏时间减少30-50%
- Worker：主线程不阻塞，滚动更流畅
