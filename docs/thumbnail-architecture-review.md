# 缩略图系统架构评估与改进指南

> **Version 2.0** - 基于 NeeView 可见项目优化策略的深度重构

## 核心目标

1. **可见优先**：只加载当前可见区域的缩略图，非可见区域延迟或取消
2. **中央优先**：可见区域内，越靠近中央的项目优先加载
3. **方向感知**：根据滚动方向预加载前方内容
4. **即时取消**：目录切换或快速滚动时立即取消过时任务
5. **智能重试**：区分临时错误和永久错误，只重试临时错误

---

## 一、当前实现分析

### 1.1 架构概览

当前 `ThumbnailManager` 参考 NeeView 的设计，包含以下核心模块：

```
┌─────────────────────────────────────────────────────────────┐
│                     ThumbnailManager                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  内存缓存     │  │  数据库缓存   │  │  生成器       │       │
│  │  (LRU Cache) │  │  (SQLite)    │  │  (Rust后端)  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                          │                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  任务队列     │  │  预测加载器   │  │  批量加载器   │       │
│  │  (Priority)  │  │  (Predictive)│  │  (Incremental)│      │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 NeeView 核心设计理念

基于代码注释中的 NeeView 参考，识别出以下关键设计模式：

| NeeView 概念 | 当前实现 | 状态 |
|-------------|---------|------|
| `ThumbnailType.Empty` | `failedThumbnails` Set | ✅ 已实现 |
| `IsThumbnailValid` | `canRetryFailedThumbnail()` | ✅ 已实现 |
| `JobScheduler.Order` | `enqueueTask()` | ✅ 已实现 |
| `JobClient.CancelOrder` | `setCurrentDirectory()` | ⚠️ 部分实现 |
| `PageThumbnail.LoadAsync` | `getThumbnail()` | ✅ 已实现 |
| `PageThumbnail.LoadThumbnailAsync` | `generateThumbnail()` | ✅ 已实现 |

### 1.3 当前问题

#### 问题 1：初始化失败无重试 ✅ 已修复
- **症状**：编译版本缩略图/EMM 数据不显示
- **原因**：初始化失败后静默继续，后续 IPC 调用全部失败
- **已修复**：添加了 `ensureInitialized()` 重试机制

#### 问题 2：文件夹缩略图依赖链 ⚠️ 待优化
- **症状**：文件夹缩略图很少加载
- **原因**：文件夹缩略图依赖子文件成功生成
- **状态**：需要改进

#### 问题 3：可见项目加载策略不完善 🔴 核心问题
- **症状**：滚动时缩略图加载卡顿，非可见项目占用资源
- **原因**：
  1. 没有中央优先排序（NeeView 使用 `OrderBy(Math.Abs(index - center))`）
  2. 没有根据滚动方向优化加载顺序
  3. 快速滚动时没有取消过时任务
  4. debounce 50ms 太短，无法过滤快速滚动
- **状态**：**本次重构核心**

#### 问题 4：IPC 调用可靠性 ✅ 已修复
- **症状**：编译版本 IPC 调用失败
- **原因**：CSP 配置缺少 `ipc.localhost`
- **已修复**：更新 CSP 配置

---

## 二、NeeView 可见项目加载策略详解

### 2.0 核心流程（ThumbnailListView.cs 第 385-416 行）

```csharp
// NeeView 的核心加载逻辑
private void LoadThumbnails(int direction)
{
    // 1. 如果不可见或正在冻结，取消所有请求
    if (!this.Root.IsVisible || _isFrozen) {
        _vm.CancelThumbnailRequest();
        return;
    }

    // 2. 计算可见范围（基于像素偏移）
    var itemWidth = GetItemWidth();
    var start = (int)(_listPanel.HorizontalOffset / itemWidth);
    var count = (int)(_listPanel.ViewportWidth / itemWidth) + 1;

    // 3. 请求缩略图（带边距和方向）
    _vm.RequestThumbnail(start, count, margin: 2, direction);
}
```

### 2.0.1 中央优先排序（ThumbnailList.cs 第 389-396 行）

```csharp
// NeeView 的中央优先排序策略
public void RequestThumbnail(int start, int count, int margin, int direction)
{
    int center = start + count / 2;
    
    // 按距离中央的距离排序
    var pages = Enumerable.Range(start - margin, count + margin * 2 - 1)
        .Where(i => i >= 0 && i < pageList.Count)
        .Select(e => pageList[e])
        .OrderBy(e => Math.Abs(e.Index - center));  // 关键：中央优先

    _jobClient.Order(pages);
}
```

### 2.0.2 任务取消机制（ThumbnailList.cs 第 211-217 行）

```csharp
// 集合切换时取消未处理的缩略图请求
private void PageSelector_CollectionChanging(object? sender, EventArgs e)
{
    _jobClient.CancelOrder();  // 关键：立即取消
    IsItemsDirty = true;
    CollectionChanging?.Invoke(sender, e);
}
```

---

### 2.1 三层缓存策略（已实现）

```
请求 → 内存缓存(L1) → 数据库缓存(L2) → 生成器(L3)
         ↑                 ↑
         └── 成功后回填 ──┘
```

**当前实现评估**：✅ 已正确实现

### 2.2 失败标记机制（已实现，需增强）

NeeView 使用 `ThumbnailType.Empty` 标记失败的缩略图，避免重复生成：

```typescript
// 当前实现
private failedThumbnails = new Set<string>();
private failedRetryCount = new Map<string, number>();
private readonly MAX_RETRY_COUNT = 1; // 已改为1，避免队列积压
```

**当前实现评估**：✅ 已正确实现，已添加持久化和失败分类

### 2.3 优先级队列

NeeView 使用 `JobScheduler` 管理任务优先级：

```typescript
// 当前实现的优先级
type Priority = 'immediate' | 'high' | 'normal';
```

**当前实现评估**：⚠️ 部分实现

**需要增强**：
- ✅ 已实现目录切换取消机制
- 🔴 **缺少可见区域实时取消**：快速滚动时应取消已离开可见区域的任务
- 🔴 **缺少中央优先排序**：应按距离可见中心排序

### 2.4 目录切换处理 ✅ 已优化

NeeView 的 `JobClient.CancelOrder` 在目录切换时取消旧任务：

```typescript
// 当前实现（已优化）
setCurrentDirectory(path: string) {
  const oldPath = this.currentDirectory;
  this.currentDirectory = path;
  
  // 1. 取消非当前目录的 pending 任务
  this.cancelAllTasksExceptDirectory(path);
  
  // 2. 提升当前目录任务优先级
  this.bumpCurrentDirectoryPriority();
  
  // 3. 清理旧目录的失败标记
  this.clearFailedMarksForDirectory(oldPath);
  
  // 4. 立即触发队列处理
  setTimeout(() => this.processQueue(), 0);
}
```

**当前实现评估**：✅ 已正确实现

---

## 三、可见项目优化方案（核心重构）

### 3.0 VirtualizedFileListV2 可见项目加载重构

#### 3.0.1 当前问题分析

```typescript
// 当前实现（VirtualizedFileListV2.svelte 第 122-170 行）
const handleVisibleRangeChange = debounce(() => {
  // 问题1：没有中央优先排序
  // 问题2：没有根据滚动方向优化
  // 问题3：50ms debounce 太短
  // 问题4：没有取消离开可见区域的任务
  
  const visibleItems = items.slice(startIndex, endIndex + 1);
  const paths = needThumbnails.map((item) => item.path);
  
  // 直接批量加载，没有优先级排序
  thumbnailManager.batchLoadFromDb(paths);
  thumbnailManager.batchGenerate(notLoaded);
}, 50);
```

#### 3.0.2 优化后的实现方案

```typescript
// 新的可见项目加载器
class VisibleThumbnailLoader {
  private lastVisibleRange = { start: 0, end: 0 };
  private lastScrollDirection = 0; // -1=up, 0=none, 1=down
  private pendingCancel = new Set<string>();
  
  /**
   * 处理可见范围变化（参考 NeeView ThumbnailListView.LoadThumbnails）
   */
  handleVisibleRangeChange(
    items: FsItem[],
    visibleStart: number,
    visibleEnd: number,
    scrollDirection: number,
    currentPath: string
  ) {
    // 1. 计算可见中心
    const center = Math.floor((visibleStart + visibleEnd) / 2);
    
    // 2. 取消离开可见区域的任务（关键优化）
    this.cancelOutOfViewTasks(visibleStart, visibleEnd);
    
    // 3. 构建优先级排序的加载列表（中央优先 + 方向感知）
    const margin = 2; // 预加载边距
    const rangeStart = Math.max(0, visibleStart - margin);
    const rangeEnd = Math.min(items.length - 1, visibleEnd + margin);
    
    const itemsToLoad = [];
    for (let i = rangeStart; i <= rangeEnd; i++) {
      const item = items[i];
      if (!this.hasCache(item.path)) {
        itemsToLoad.push({
          item,
          index: i,
          // 优先级 = 距离中心的距离（越小越优先）
          distanceToCenter: Math.abs(i - center),
          // 滚动方向加成：滚动方向前方的项目额外加分
          directionBonus: scrollDirection > 0 ? 
            (i > center ? -1 : 1) : 
            (i < center ? -1 : 1)
        });
      }
    }
    
    // 4. 排序：中央优先，方向加成
    itemsToLoad.sort((a, b) => {
      const distDiff = a.distanceToCenter - b.distanceToCenter;
      if (distDiff !== 0) return distDiff;
      return a.directionBonus - b.directionBonus;
    });
    
    // 5. 批量请求（带优先级）
    const paths = itemsToLoad.map(i => i.item.path);
    thumbnailManager.requestVisibleThumbnails(paths, currentPath);
    
    // 6. 更新状态
    this.lastVisibleRange = { start: visibleStart, end: visibleEnd };
    this.lastScrollDirection = scrollDirection;
  }
  
  /**
   * 取消离开可见区域的任务
   */
  private cancelOutOfViewTasks(visibleStart: number, visibleEnd: number) {
    const { start: oldStart, end: oldEnd } = this.lastVisibleRange;
    
    // 找出离开可见区域的索引
    for (let i = oldStart; i <= oldEnd; i++) {
      if (i < visibleStart || i > visibleEnd) {
        // 这个索引已离开可见区域，取消其任务
        this.pendingCancel.add(String(i));
      }
    }
    
    // 通知 thumbnailManager 取消这些任务
    if (this.pendingCancel.size > 0) {
      thumbnailManager.cancelPendingTasks(this.pendingCancel);
      this.pendingCancel.clear();
    }
  }
}
```

#### 3.0.3 VirtualizedFileListV2.svelte 改进代码

```svelte
<script lang="ts">
  // 新增：可见项目加载器
  import { VisibleThumbnailLoader } from '$lib/utils/thumbnail/VisibleThumbnailLoader';
  
  const visibleLoader = new VisibleThumbnailLoader();
  
  // 优化：使用 150ms debounce + 滚动方向检测
  let lastScrollTop = 0;
  
  const handleVisibleRangeChange = debounce(() => {
    if (!currentPath || items.length === 0 || virtualItems.length === 0) return;
    
    const startIndex = virtualItems[0].index * columns;
    const endIndex = Math.min(
      (virtualItems[virtualItems.length - 1].index + 1) * columns - 1,
      items.length - 1
    );
    
    // 检测滚动方向
    const currentScrollTop = container?.scrollTop ?? 0;
    const scrollDirection = currentScrollTop > lastScrollTop ? 1 : 
                           currentScrollTop < lastScrollTop ? -1 : 0;
    lastScrollTop = currentScrollTop;
    
    // 使用新的可见项目加载器
    visibleLoader.handleVisibleRangeChange(
      items,
      startIndex,
      endIndex,
      scrollDirection,
      currentPath
    );
  }, 150); // 增加到 150ms，过滤快速滚动
  
  // 在滚动事件中也触发
  function handleScroll() {
    // ... existing code ...
    handleVisibleRangeChange();
  }
</script>
```

---

### 3.1 高优先级改进

#### 3.1.1 增强错误处理 ✅ 已实现
```typescript
// 在 loadFromDb 中添加超时（已实现于 ipcTimeout.ts）
import { invokeWithTimeout, DEFAULT_IPC_TIMEOUT } from './thumbnail/ipcTimeout';

const blobKey = await invokeWithTimeout<string | null>(
  'load_thumbnail_from_db',
  { path, size, ghash, category },
  DEFAULT_IPC_TIMEOUT  // 5秒超时
);
```

#### 3.1.2 文件夹缩略图独立处理 ✅ 已实现

##### NeeView 文件夹缩略图策略分析

NeeView 的文件夹缩略图使用 **反向查找策略**：

1. **不主动扫描文件夹内容**：避免性能问题
2. **缓存优先**：先从数据库加载已缓存的文件夹缩略图
3. **反向更新**：当子文件/压缩包生成缩略图时，自动更新父文件夹的缩略图
4. **后台扫描**：Rust 后端异步扫描文件夹，找到第一个可用图片/压缩包后生成

##### 为什么不能主动扫描文件夹？

1. **性能问题**：文件夹可能有成千上万个子文件
2. **深度问题**：文件夹可能有很深的嵌套结构
3. **阻塞 UI**：同步扫描会阻塞主线程

##### 文件夹缩略图加载流程

```
1. 用户滚动到文件夹项目
   ↓
2. VisibleThumbnailLoader 识别为文件夹（isDir=true）
   ↓
3. 调用 thumbnailManager.getThumbnail(folderPath, ..., isFolder=true)
   ↓
4. 先从数据库加载（loadFromDb）
   ↓
5. 如果数据库没有，返回 null（不主动生成）
   ↓
6. 后台任务（warmupDirectory）会触发 FolderThumbnailLoader
   ↓
7. Rust 后端扫描文件夹，找到第一个图片/压缩包
   ↓
8. 生成缩略图并保存到数据库
   ↓
9. 通过 onThumbnailReady 回调更新 UI
```

##### 当前实现

```typescript
// VisibleThumbnailLoader.ts - 分离文件夹和普通文件
const folderItems = itemsToLoad.filter(i => i.isFolder);
const fileItems = itemsToLoad.filter(i => !i.isFolder);

// 普通文件：走 requestVisibleThumbnails
if (fileItems.length > 0) {
  thumbnailManager.requestVisibleThumbnails(filePaths, currentPath);
}

// 文件夹：只从数据库加载，不主动生成
if (folderItems.length > 0) {
  for (const folder of folders) {
    thumbnailManager.getThumbnail(folder.path, undefined, false, 'normal');
  }
}
```

### 3.2 中优先级改进

#### 3.2.1 ThumbnailManager 新增方法

```typescript
// thumbnailManager.ts 需要新增的方法
class ThumbnailManager {
  /**
   * 请求可见区域的缩略图（带优先级排序）
   * 参考 NeeView 的 RequestThumbnail
   */
  requestVisibleThumbnails(paths: string[], currentPath: string) {
    // 设置当前目录
    this.setCurrentDirectory(currentPath);
    
    // 过滤已缓存和已失败的
    const toLoad = paths.filter(p => {
      const key = this.buildPathKey(p);
      return !this.getCachedThumbnail(p) && !this.failedThumbnails.has(key);
    });
    
    if (toLoad.length === 0) return;
    
    // 异步加载（保持顺序）
    this.batchLoadFromDb(toLoad).then(loaded => {
      const notLoaded = toLoad.filter(p => !loaded.has(p));
      if (notLoaded.length > 0) {
        this.batchGenerate(notLoaded);
      }
    });
  }
  
  /**
   * 取消指定路径的待处理任务
   */
  cancelPendingTasks(pathKeys: Set<string>) {
    const before = this.taskQueue.length;
    this.taskQueue = this.taskQueue.filter(task => {
      const key = this.buildPathKey(task.path, task.innerPath);
      return !pathKeys.has(key);
    });
    const canceled = before - this.taskQueue.length;
    if (canceled > 0) {
      console.debug(`🚫 取消 ${canceled} 个离开可见区域的任务`);
    }
  }
}
```

#### 3.2.2 占位图机制 ✅ 已实现
```typescript
// 已实现于 placeholders.ts
export function getPlaceholderForPath(path: string): string {
  // 根据文件类型返回不同占位图
}
```

### 3.3 低优先级改进

#### 3.3.1 失败原因分类 ✅ 已实现
```typescript
// 已实现于 placeholders.ts
export function inferFailureReason(error: unknown): FailureReason {
  const msg = String(error).toLowerCase();
  if (msg.includes('format') || msg.includes('unsupported')) return 'format_not_supported';
  if (msg.includes('timeout')) return 'timeout';
  if (msg.includes('ipc')) return 'ipc_error';
  return 'decode_error';
}

export function shouldRetry(reason: FailureReason, retryCount: number, maxRetry: number): boolean {
  if (reason === 'format_not_supported') return false;
  return retryCount < maxRetry;
}
```

---

## 四、代码重构建议

### 4.1 模块化拆分

当前 `thumbnailManager.ts` 有 1580+ 行，建议拆分为：

```
src/lib/utils/thumbnail/
├── index.ts                   # 导出入口
├── ThumbnailManager.ts        # 主管理器（核心调度逻辑）
├── ThumbnailCache.ts          # 缓存管理（内存 + LRU）
├── ThumbnailQueue.ts          # 任务队列管理
├── ThumbnailLoader.ts         # 加载逻辑（数据库 + 生成）
├── VisibleThumbnailLoader.ts  # 🆕 可见项目加载器（本次重构核心）
├── FolderThumbnailLoader.ts   # 文件夹缩略图特殊处理（已存在）
├── ipcTimeout.ts              # IPC 超时处理（已存在）
├── placeholders.ts            # 占位图和失败分类（已存在）
└── types.ts                   # 类型定义
```

### 4.2 依赖注入

使用依赖注入提高可测试性：

```typescript
interface IThumbnailLoader {
  loadFromDb(path: string, options: LoadOptions): Promise<string | null>;
  generate(path: string, options: GenerateOptions): Promise<string | null>;
}

class ThumbnailManager {
  constructor(
    private readonly loader: IThumbnailLoader,
    private readonly cache: IThumbnailCache,
    private readonly queue: IThumbnailQueue
  ) {}
}
```

---

## 五、测试检查清单

### 5.1 编译版本测试

- [x] 初始化成功后，控制台显示 "✅ 缩略图管理器初始化成功"
- [x] 初始化失败时，自动重试最多 3 次
- [x] EMM 初始化失败不影响缩略图功能
- [ ] 文件夹缩略图正确显示
- [x] AVIF 图片缩略图正确生成
- [x] 目录切换时旧任务被取消

### 5.2 可见项目优化测试 🆕

- [ ] 快速滚动时只加载可见区域的缩略图
- [ ] 可见区域中央的项目优先加载
- [ ] 滚动方向前方的项目有加载优先权
- [ ] 离开可见区域的任务被取消
- [ ] 150ms debounce 正常过滤快速滚动

### 5.3 性能测试

- [ ] 大目录（1000+ 文件）首次加载时间 < 3秒
- [ ] 内存缓存命中率 > 80%（热数据）
- [ ] 数据库缓存命中率 > 95%（冷启动）
- [ ] CPU 使用率平稳（无尖峰）
- [ ] 快速滚动时 UI 不卡顿（60fps）

---

## 六、实施计划

### Phase 1: 可见项目加载优化（本次重构核心）

| 步骤 | 任务 | 文件 | 状态 |
|------|------|------|------|
| 1 | 创建 VisibleThumbnailLoader 类 | `src/lib/utils/thumbnail/VisibleThumbnailLoader.ts` | ✅ 完成 |
| 2 | 实现中央优先排序算法 | VisibleThumbnailLoader.ts | ✅ 完成 |
| 3 | 实现滚动方向检测 | VirtualizedFileListV2.svelte | ✅ 完成 |
| 4 | 实现任务取消机制 | thumbnailManager.ts | ✅ 完成 |
| 5 | 修改 debounce 时间为 150ms | VirtualizedFileListV2.svelte | ✅ 完成 |
| 6 | 集成测试 | - | 待验证 |

### Phase 2: 模块化拆分

| 步骤 | 任务 | 状态 |
|------|------|------|
| 1 | 拆分 ThumbnailCache 模块 | 待开始 |
| 2 | 拆分 ThumbnailQueue 模块 | 待开始 |
| 3 | 拆分 ThumbnailLoader 模块 | 待开始 |
| 4 | 更新 index.ts 导出 | 待开始 |

---

## 七、总结

当前实现已经很好地参考了 NeeView 的设计，本次重构重点是：

1. ✅ **可靠性**：初始化重试、IPC 超时处理已完成
2. ✅ **文件夹缩略图**：已有独立的 FolderThumbnailLoader
3. ✅ **错误处理**：已有失败分类和占位图
4. 🔴 **可见项目优化**：**本次重构核心**
   - 实现中央优先排序
   - 实现滚动方向感知
   - 实现离开可见区域任务取消
   - 优化 debounce 时间
5. ⚠️ **模块化**：代码需要拆分以提高可维护性（Phase 2）

建议按 Phase 顺序实施，每个步骤后进行充分测试。
