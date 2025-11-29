# NeoView 图片管道架构说明

## 📖 概述

本架构参考 NeeView (C# WPF 图片查看器) 的设计，重新构建了 NeoView 的图片加载系统。
目标是实现**极致性能**和**高度模块化**，支持预加载、预超分等高级功能。

## 🏗️ 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      ImagePipeline                          │
│                     (总控制器)                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  JobEngine  │  │CacheManager │  │   UpscaleService    │ │
│  │  (作业引擎) │  │ (缓存管理)  │  │    (超分服务)       │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         │                │                     │            │
│  ┌──────┴──────┐  ┌──────┴──────┐              │            │
│  │JobScheduler │  │  BlobCache  │              │            │
│  │  (调度器)   │  │ (Blob缓存)  │              │            │
│  └──────┬──────┘  └─────────────┘              │            │
│         │                                      │            │
│  ┌──────┴──────┐                               │            │
│  │ JobWorker[] │                               │            │
│  │(工作线程池) │                               │            │
│  └─────────────┘                               │            │
│                                                │            │
│  ┌─────────────────────────────────────────────┴──────────┐ │
│  │                   PreloadManager                       │ │
│  │                   (预加载管理器)                        │ │
│  └────────────────────────┬───────────────────────────────┘ │
│                           │                                 │
│  ┌────────────────────────┴───────────────────────────────┐ │
│  │                  SourceStrategy                        │ │
│  │                  (数据源策略)                           │ │
│  │  ┌──────────────────┐  ┌──────────────────┐           │ │
│  │  │FileSystemStrategy│  │ ArchiveStrategy  │           │ │
│  │  │  (文件系统)      │  │   (压缩包)       │           │ │
│  │  └──────────────────┘  └──────────────────┘           │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 📁 文件结构

```
src/lib/core/pipeline/
├── types.ts              # 核心类型定义 (~300行)
├── index.ts              # 模块主入口
├── ImagePipeline.ts      # 总控制器 (~400行)
│
├── job/                  # 作业引擎模块
│   ├── index.ts
│   ├── JobScheduler.ts   # 作业调度器 (~300行)
│   ├── JobWorker.ts      # 作业工作线程 (~250行)
│   └── JobEngine.ts      # 作业引擎 (~250行)
│
├── cache/                # 缓存管理模块
│   ├── index.ts
│   ├── MemoryCache.ts    # LRU内存缓存 (~280行)
│   ├── BlobCache.ts      # Blob专用缓存 (~250行)
│   └── CacheManager.ts   # 统一缓存管理 (~350行)
│
├── source/               # 数据源策略模块
│   ├── index.ts
│   └── SourceStrategy.ts # 数据源策略 (~270行)
│
├── preload/              # 预加载模块
│   ├── index.ts
│   └── PreloadManager.ts # 预加载管理器 (~350行)
│
└── upscale/              # 超分服务模块
    ├── index.ts
    └── UpscaleService.ts # 超分服务 (~400行)
```

## 🔄 数据流程

### 1. 点击文件到出图的完整流程

```
用户点击文件
    │
    ▼
┌───────────────────────┐
│ ImagePipeline.loadPage│ ← 入口点
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│   检查 BlobCache      │ ← 命中则直接返回
└───────────┬───────────┘
            │ 未命中
            ▼
┌───────────────────────┐
│   创建加载任务        │
│   提交到 JobEngine    │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│   JobScheduler 调度   │ ← 按优先级排队
│   JobWorker 执行      │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│   SourceStrategy      │ ← 根据类型选择策略
│   加载图片数据        │   (文件/压缩包)
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│   写入 BlobCache      │
│   创建 ObjectURL      │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│   触发预加载          │ ← 异步预加载后续页面
│   PreloadManager      │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│   检查超分缓存        │
│   触发超分任务        │ ← 自动超分(如开启)
│   UpscaleService      │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│   派发事件            │ ← 通知UI更新
│   返回 ObjectURL      │
└───────────────────────┘
```

### 2. 预加载流程

```
当前页加载完成
    │
    ▼
┌───────────────────────┐
│ PreloadManager        │
│ requestLoad(range)    │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 1. 加载主页面         │ ← 优先级: Critical
│    (当前显示页)       │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 2. 加载下一页         │ ← 优先级: High
│    (预读1页)          │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 3. 加载上一页         │ ← 优先级: High
│    (回退缓存)         │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 4. 加载剩余页面       │ ← 优先级: Normal
│    (根据配置)         │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ 检查内存限制          │ ← 超限则停止
│ CacheManager.cleanup  │
└───────────────────────┘
```

### 3. 预超分流程

```
页面加载完成 + 自动超分开启
    │
    ▼
┌───────────────────────┐
│ UpscaleService        │
│ checkCache(hash)      │
└───────────┬───────────┘
            │
    ┌───────┴───────┐
    │ 缓存命中?     │
    └───────┬───────┘
        是  │   否
    ┌───────┴───────┐
    │               │
    ▼               ▼
┌─────────┐  ┌─────────────────┐
│从缓存加载│  │提交超分任务     │
│返回结果  │  │到 JobEngine     │
└─────────┘  └────────┬────────┘
                      │
                      ▼
              ┌───────────────────┐
              │ 调用后端超分API   │
              │ invoke('upscale') │
              └────────┬──────────┘
                       │
                       ▼
              ┌───────────────────┐
              │ 保存到缓存        │
              │ - 内存缓存        │
              │ - 磁盘缓存        │
              └────────┬──────────┘
                       │
                       ▼
              ┌───────────────────┐
              │ 派发完成事件      │
              │ UI 更新显示       │
              └───────────────────┘
```

## 📊 核心模块说明

### 1. 类型定义 (`types.ts`)

定义了所有核心类型：

```typescript
// 页面状态
enum PageContentState {
  None,      // 未加载
  Loading,   // 加载中
  View,      // 当前显示
  Ahead,     // 预加载
  Cached,    // 已缓存
  Error      // 加载失败
}

// 作业优先级
enum JobPriority {
  Critical = 100,  // 当前页面
  High = 80,       // 相邻页面
  Normal = 50,     // 预加载页面
  Low = 20,        // 后台任务
  Idle = 0         // 空闲任务
}

// 超分状态
enum UpscaleState {
  None,       // 未超分
  Pending,    // 等待
  Processing, // 处理中
  Completed,  // 完成
  Failed      // 失败
}
```

### 2. 作业引擎 (`job/`)

参考 NeeView 的 JobEngine 设计：

- **JobScheduler**: 管理作业队列，按优先级调度
- **JobWorker**: 工作线程，从队列获取任务执行
- **JobEngine**: 单例引擎，管理调度器和工作线程池

```typescript
// 使用示例
const engine = getJobEngine();

// 提交作业
const job = engine.submitJob(
  JobCategory.PageView,
  JobPriority.Critical,
  new PageContentJobCommand(async (signal) => {
    // 加载逻辑
  })
);

// 取消作业
engine.cancelJob(job.id);
```

### 3. 缓存管理 (`cache/`)

三层缓存架构：

- **MemoryCache**: 泛型 LRU 缓存，支持 TTL、自动清理
- **BlobCache**: 专门管理图片 Blob 和 Object URL
- **CacheManager**: 统一管理 Blob、缩略图、超分缓存

```typescript
// 使用示例
const cache = getCacheManager();

// 设置 Blob
const url = cache.setBlob(pageIndex, blob, bookPath);

// 获取 Blob
const blob = cache.getBlob(pageIndex, bookPath);

// 设置超分结果
cache.setUpscale(hash, outputBlob, modelName, scaleFactor);

// 获取统计
const stats = cache.getStats();
// { blob: {...}, thumbnail: {...}, upscale: {...}, totalSize, usagePercent }
```

### 4. 数据源策略 (`source/`)

策略模式处理不同数据源：

- **FileSystemSourceStrategy**: 从文件系统加载
- **ArchiveSourceStrategy**: 从压缩包加载

```typescript
// 自动选择策略
const data = await loadPageData(pageInfo, { signal });

// 或手动选择
const strategy = SourceStrategyFactory.createStrategy(pageInfo);
const data = await strategy.load(pageInfo);
```

### 5. 预加载管理 (`preload/`)

智能预加载策略：

```typescript
const preload = createPreloadManager({
  preloadSize: 5,        // 预加载页数
  enableAhead: true,     // 启用先行加载
  concurrentLoads: 3     // 并发数
});

// 设置上下文
preload.setContext({
  bookPath: '/path/to/book',
  pages: [...],
  currentIndex: 0,
  direction: 1
});

// 请求加载
await preload.requestLoad(range, direction);

// 监听事件
preload.addEventListener((event) => {
  if (event.type === 'progress') {
    console.log(`进度: ${event.loaded}/${event.total}`);
  }
});
```

### 6. 超分服务 (`upscale/`)

超分任务管理：

```typescript
const upscale = getUpscaleService({
  maxConcurrent: 2,
  autoUpscaleEnabled: true,
  defaultConfig: {
    modelName: '2x_MangaJaNai_1200p_V1_ESRGAN_70k',
    scaleFactor: 2,
    tileSize: 256
  }
});

// 初始化
await upscale.initialize();

// 检查缓存
const hasCache = await upscale.checkCache(hash);

// 提交任务
const taskId = await upscale.submitTask(
  pageIndex,
  hash,
  inputBlob,
  config,
  JobPriority.Normal
);

// 监听完成
upscale.addEventListener((event) => {
  if (event.type === 'complete') {
    // 更新 UI
  }
});
```

### 7. 图片管道 (`ImagePipeline.ts`)

统一入口：

```typescript
const pipeline = getImagePipeline({
  preloadPages: 5,
  maxWorkers: 4,
  autoUpscale: true
});

// 初始化
await pipeline.initialize();

// 设置书籍
pipeline.setBookContext(bookPath, pages, currentIndex);

// 加载页面
const result = await pipeline.loadPage(pageIndex, {
  priority: JobPriority.Critical,
  autoUpscale: true
});

// 获取 URL
const url = pipeline.getPageUrl(pageIndex);
const upscaledUrl = pipeline.getUpscaledUrl(hash);

// 监听事件
pipeline.addEventListener((event) => {
  switch (event.type) {
    case 'page-load':
      // 页面加载完成
      break;
    case 'upscale-complete':
      // 超分完成
      break;
    case 'preload-progress':
      // 预加载进度
      break;
  }
});
```

## 🔧 迁移指南

### 快速迁移 - 使用适配器

最简单的迁移方式是使用 `PipelineAdapter`，它提供与旧接口兼容的 API：

```typescript
// 1. 在 ImageViewer 初始化时
import { getPipelineAdapter } from '$lib/core/pipeline';

const adapter = getPipelineAdapter({
  maxConcurrentLoads: 4,
  thumbnailHeight: 120,
  preloadRadius: 5,
  autoUpscale: true
});

await adapter.initialize({
  onImageLoaded: (pageIndex, url) => {
    console.log(`Page ${pageIndex} loaded: ${url}`);
  },
  onThumbnailReady: (pageIndex, dataUrl, source) => {
    console.log(`Thumbnail ${pageIndex} ready`);
  },
  onUpscaleComplete: (pageIndex, url) => {
    console.log(`Upscale ${pageIndex} complete`);
  }
});

// 2. 设置书籍上下文
adapter.setBookContext(bookPath, pages.map(p => ({
  index: p.index,
  path: p.path,
  name: p.name,
  archivePath: isArchive ? bookPath : undefined,
  hash: p.stableHash
})));

// 3. 加载当前页（最高优先级）
const url = await adapter.loadPage(currentIndex, JobPriority.Critical);

// 4. 获取缩略图（异步，不阻塞主图）
const thumbnail = await adapter.getThumbnail(pageIndex, 'bottom-bar');

// 5. 预加载
await adapter.preloadRange(currentIndex, 5);
```

### 在 BottomThumbnailBar 中使用

```typescript
// 替换旧的 preloadManager.requestThumbnail
import { getPipelineAdapter } from '$lib/core/pipeline';

async function loadThumbnail(pageIndex: number) {
  const adapter = getPipelineAdapter();
  
  try {
    // 异步获取缩略图，不阻塞原图加载
    const dataUrl = await adapter.getThumbnail(pageIndex, 'bottom-bar');
    thumbnails = { ...thumbnails, [pageIndex]: { url: dataUrl, width: 0, height: 0 } };
  } catch (error) {
    console.error(`Thumbnail ${pageIndex} failed:`, error);
  }
}
```

### 从旧 ImageLoader 迁移

#### 旧代码 (imageLoader.ts):

```typescript
// 旧的加载方式
const loader = new ImageLoader(options);
await loader.loadCurrentImage();
```

#### 新代码:

```typescript
import { getImagePipeline } from '$lib/core/pipeline';

// 初始化（只需一次）
const pipeline = getImagePipeline();
await pipeline.initialize();

// 设置书籍上下文
pipeline.setBookContext(
  bookStore.currentBook.path,
  bookStore.currentBook.pages.map(p => ({
    index: p.index,
    path: p.path,
    name: p.name,
    archivePath: bookStore.currentBook.type === 'archive' 
      ? bookStore.currentBook.path 
      : undefined,
    hash: p.stableHash
  })),
  bookStore.currentPageIndex
);

// 加载当前页
const result = await pipeline.loadPage(currentPageIndex);

// 获取 URL 给 <img> 使用
const imageUrl = result.source.source.objectUrl;
```

### ImageViewer 组件集成示例

```svelte
<script lang="ts">
import { onMount, onDestroy } from 'svelte';
import { getImagePipeline, type PipelineEvent } from '$lib/core/pipeline';
import { bookStore } from '$lib/stores/book.svelte';

let imageUrl = $state('');
let upscaledUrl = $state('');
let isLoading = $state(false);

const pipeline = getImagePipeline();
let unsubscribe: (() => void) | null = null;

onMount(async () => {
  await pipeline.initialize();
  
  // 监听管道事件
  unsubscribe = pipeline.addEventListener((event: PipelineEvent) => {
    switch (event.type) {
      case 'page-load':
        imageUrl = event.objectUrl;
        isLoading = false;
        break;
      case 'upscale-complete':
        upscaledUrl = event.outputUrl;
        break;
    }
  });
});

onDestroy(() => {
  unsubscribe?.();
});

// 响应页面变化
$effect(() => {
  const book = bookStore.currentBook;
  const index = bookStore.currentPageIndex;
  
  if (book && index >= 0) {
    loadPage(index);
  }
});

async function loadPage(index: number) {
  isLoading = true;
  upscaledUrl = ''; // 重置超分
  
  try {
    await pipeline.loadPage(index);
  } catch (error) {
    console.error('Load failed:', error);
    isLoading = false;
  }
}
</script>

<div class="viewer">
  {#if isLoading}
    <div class="loading">加载中...</div>
  {:else}
    <img 
      src={upscaledUrl || imageUrl} 
      alt="Page {bookStore.currentPageIndex + 1}"
    />
  {/if}
</div>
```

## ⚡ 性能优化要点

### 1. 内存管理

```typescript
// 配置缓存限制
const pipeline = getImagePipeline({
  cacheConfig: {
    maxMemorySize: 512 * 1024 * 1024, // 512MB
    maxItems: 50,
    ttl: 5 * 60 * 1000  // 5分钟
  }
});

// 手动清理
pipeline.clearBookCache();  // 清理当前书籍
pipeline.clearAllCache();   // 清理所有
```

### 2. 作业优先级

```typescript
// 当前页 - 最高优先级
pipeline.loadPage(index, { priority: JobPriority.Critical });

// 预加载 - 普通优先级
pipeline.preloadRange(index, 3);

// 超分 - 低优先级
upscaleService.submitTask(index, hash, blob, config, JobPriority.Low);
```

### 3. 取消机制

```typescript
// 翻页时取消上一页的加载
pipeline.cancelPageLoad(previousIndex);

// 切换书籍时取消所有
const jobEngine = getJobEngine();
jobEngine.cancelCategoryJobs(JobCategory.PageAhead);
```

## 🎯 与 NeeView 架构对比

| 功能 | NeeView (C#) | NeoView (TypeScript) |
|------|-------------|---------------------|
| 作业调度 | JobEngine + JobScheduler | JobEngine + JobScheduler |
| 工作线程 | JobWorker (多线程) | JobWorker (异步) |
| 缓存管理 | BookMemoryService | CacheManager |
| 数据源 | ViewSourceStrategy | SourceStrategy |
| 预加载 | BookPageLoader | PreloadManager |
| 超分 | SuperResolutionService | UpscaleService |

## 📝 注意事项

1. **ESLint 警告**: 当前 ESLint 配置有 `tsconfigRootDir` 警告，这是配置问题，不影响 TypeScript 编译

2. **后端 API**: 部分功能依赖 Tauri 后端命令：
   - `load_image`: 加载图片
   - `load_image_from_archive`: 从压缩包加载
   - `upscale_image`: 执行超分
   - `check_upscale_cache`: 检查超分缓存
   - `save_upscale_cache`: 保存超分缓存

3. **单例模式**: `JobEngine`, `CacheManager`, `UpscaleService`, `ImagePipeline` 都是单例，使用对应的 `getInstance()` 或 `getXxx()` 函数获取

4. **事件系统**: 使用事件驱动架构，通过 `addEventListener` 监听状态变化

## 🚀 后续扩展

- [ ] 添加磁盘缓存持久化 (IndexedDB)
- [ ] 添加缩略图生成策略
- [ ] 添加更多数据源策略 (网络图片等)
- [ ] 添加性能监控和日志
- [ ] 添加单元测试
