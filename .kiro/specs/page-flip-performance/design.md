# Design Document: Page Flip Performance

## Overview

本功能优化图片查看器的翻页性能，目标是将翻页延迟从当前的 ~500ms 降低到 <50ms。

### 核心问题分析

当前翻页流程：
```
翻页 → imageStore.loadCurrentPage() → 等待 Blob 
     → 创建 blob: URL → 更新 state.currentUrl 
     → <img src={newUrl}> → 浏览器解码 → 显示
```

**瓶颈**：即使 Blob 已缓存，每次设置新的 `blob: URL` 浏览器都要重新解码图片（100-500ms）。

### 解决方案（参考 OpenComic）

1. **预解码缓存**：预加载时调用 `img.decode()`，缓存已解码的 HTMLImageElement
2. **分层渲染队列**：当前页立即加载，周围页延迟加载
3. **加载取消机制**：快速翻页时取消过时任务
4. **IntersectionObserver**：只解码即将进入视口的图片

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Svelte)                        │
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐ │
│  │ FrameImage      │◄───│ PreDecodeCache  │◄───│ RenderQueue  │ │
│  │ (显示图片)       │    │ (预解码缓存)     │    │ (渲染队列)    │ │
│  └─────────────────┘    └─────────────────┘    └──────────────┘ │
│           ▲                     ▲                     ▲         │
│           │                     │                     │         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐ │
│  │ imageStore      │───▶│ stackImageLoader│───▶│ imagePool    │ │
│  │ (状态管理)       │    │ (加载器)         │    │ (Blob 缓存)  │ │
│  └─────────────────┘    └─────────────────┘    └──────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 数据流

1. 翻页触发 → `imageStore.loadCurrentPage()`
2. 检查 `PreDecodeCache` 是否有预解码的图片
3. 如果有 → 直接使用，延迟 <50ms
4. 如果没有 → 从 `imagePool` 获取 Blob → 解码 → 显示
5. 后台 `RenderQueue` 预加载并预解码周围页面

## Components and Interfaces

### 1. PreDecodeCache（新增）

```typescript
// src/lib/stackview/stores/preDecodeCache.ts

/**
 * 预解码缓存
 * 存储已解码的 HTMLImageElement，避免重复解码
 */
class PreDecodeCache {
  // 缓存: pageIndex -> { img: HTMLImageElement, url: string, timestamp: number }
  private cache = new Map<number, PreDecodedEntry>();
  private maxSize = 20; // 最多缓存 20 张预解码图片
  
  /**
   * 获取预解码的图片
   */
  get(pageIndex: number): HTMLImageElement | null;
  
  /**
   * 预解码并缓存
   * @param pageIndex 页面索引
   * @param url Blob URL
   * @returns Promise<HTMLImageElement>
   */
  async preDecodeAndCache(pageIndex: number, url: string): Promise<HTMLImageElement>;
  
  /**
   * 检查是否已预解码
   */
  has(pageIndex: number): boolean;
  
  /**
   * 清除缓存
   */
  clear(): void;
  
  /**
   * 获取缓存统计
   */
  getStats(): { size: number; hitRate: number };
}

interface PreDecodedEntry {
  img: HTMLImageElement;
  url: string;
  timestamp: number;
}
```

### 2. RenderQueue（新增）

```typescript
// src/lib/stackview/stores/renderQueue.ts

/**
 * 分层渲染队列
 * 管理图片加载和预解码的优先级
 */
class RenderQueue {
  private currentToken = 0; // 用于取消过时任务
  
  /**
   * 设置当前页面，触发分层加载
   * @param pageIndex 当前页面索引
   */
  async setCurrentPage(pageIndex: number): Promise<void>;
  
  /**
   * 取消所有待处理任务
   */
  cancelAll(): void;
  
  /**
   * 获取队列状态
   */
  getStatus(): QueueStatus;
}

interface QueueStatus {
  currentPage: number;
  pendingCount: number;
  preDecodedCount: number;
}

// 优先级常量
const Priority = {
  CRITICAL: 100,  // 当前页
  HIGH: 80,       // ±1 页
  NORMAL: 50,     // ±2-3 页
  LOW: 20,        // ±4-5 页
  BACKGROUND: 10, // 更远的页
};
```

### 3. 修改 stackImageLoader

```typescript
// src/lib/stackview/utils/stackImageLoader.ts

class StackImageLoader {
  // 新增：预解码缓存引用
  private preDecodeCache = new PreDecodeCache();
  
  /**
   * 【新增】预加载并预解码
   * 在后台完成 Blob 加载 + 图片解码
   */
  async preloadWithDecode(pageIndex: number): Promise<void> {
    // 1. 加载 Blob
    const result = await this.loadPage(pageIndex);
    
    // 2. 预解码
    await this.preDecodeCache.preDecodeAndCache(pageIndex, result.url);
  }
  
  /**
   * 【新增】获取预解码的图片 URL
   * 如果已预解码，返回 URL（浏览器会使用解码缓存）
   */
  getPreDecodedUrl(pageIndex: number): string | undefined {
    const entry = this.preDecodeCache.get(pageIndex);
    return entry?.src;
  }
  
  /**
   * 【新增】检查是否已预解码
   */
  isPreDecoded(pageIndex: number): boolean {
    return this.preDecodeCache.has(pageIndex);
  }
}
```

### 4. 修改 FrameImage.svelte

```svelte
<!-- src/lib/stackview/components/FrameImage.svelte -->
<script lang="ts">
  import { stackImageLoader } from '../utils/stackImageLoader';
  
  // 优先使用预解码的 URL
  let displayUrl = $derived.by(() => {
    // 1. 检查超分图
    const hasUpscaled = imagePool.hasUpscaled(pageIndex);
    if (hasUpscaled) {
      return imagePool.getUpscaledUrl(pageIndex) ?? url;
    }
    
    // 2. 检查预解码缓存
    const preDecodedUrl = stackImageLoader.getPreDecodedUrl(pageIndex);
    if (preDecodedUrl) {
      return preDecodedUrl;
    }
    
    // 3. 使用原始 URL
    return url;
  });
</script>
```

### 5. 修改 imageStore

```typescript
// src/lib/stackview/stores/imageStore.svelte.ts

async function loadCurrentPage(pageMode, force = false) {
  const currentIndex = bookStore.currentPageIndex;
  
  // 【优化】检查预解码缓存
  if (stackImageLoader.isPreDecoded(currentIndex)) {
    const url = stackImageLoader.getPreDecodedUrl(currentIndex);
    state.currentUrl = url;
    state.loading = false;
    console.log(`⚡ 使用预解码缓存: 页码 ${currentIndex + 1}`);
    return;
  }
  
  // 原有加载逻辑...
  
  // 【优化】加载完成后触发分层预加载
  renderQueue.setCurrentPage(currentIndex);
}
```

## Data Models

### PreDecodedEntry

| 字段 | 类型 | 描述 |
|------|------|------|
| img | HTMLImageElement | 已解码的图片元素 |
| url | string | Blob URL |
| timestamp | number | 缓存时间戳（用于 LRU） |

### QueueTask

| 字段 | 类型 | 描述 |
|------|------|------|
| pageIndex | number | 页面索引 |
| priority | number | 优先级（越高越先执行） |
| token | number | 任务令牌（用于取消） |
| status | 'pending' \| 'loading' \| 'done' \| 'cancelled' | 任务状态 |

## Correctness Properties

### Property 1: Pre-decode cache consistency

*For any* page that is pre-decoded and cached, when the page is displayed, the system SHALL use the cached decoded image without re-decoding.

**Validates: Requirements 1.2, 1.3**

### Property 2: Priority ordering

*For any* set of pending load tasks, the system SHALL process tasks in priority order (CRITICAL > HIGH > NORMAL > LOW > BACKGROUND).

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 3: Cancellation effectiveness

*For any* cancelled load task, the system SHALL not update the display with the cancelled task's result.

**Validates: Requirements 3.1, 3.4**

### Property 4: Memory bounds

*For any* state of the pre-decode cache, the number of cached entries SHALL not exceed the configured maximum (default: 20).

**Validates: Requirements 1.4, 4.1**

## Error Handling

### 预解码失败

- 单个页面预解码失败时，记录警告日志
- 回退到原有的即时解码流程
- 不影响其他页面的预解码

### 缓存溢出

- 使用 LRU 策略淘汰最久未使用的条目
- 淘汰时释放 HTMLImageElement 引用

### 快速翻页

- 使用 token 机制取消过时任务
- 新任务覆盖旧任务的优先级

## Performance Targets

| 指标 | 当前值 | 目标值 |
|------|--------|--------|
| 翻页延迟（缓存命中） | ~500ms | <50ms |
| 翻页延迟（缓存未命中） | ~500ms | <200ms |
| 预解码缓存命中率 | 0% | >80% |
| 内存占用增加 | - | <100MB |

## Testing Strategy

### 单元测试

1. `PreDecodeCache` 的 get/set/evict 操作
2. `RenderQueue` 的优先级排序
3. 取消机制的正确性

### 性能测试

1. 测量翻页延迟（缓存命中 vs 未命中）
2. 测量预解码缓存命中率
3. 测量内存占用变化

### 集成测试

1. 快速翻页场景（连续翻 10 页）
2. 大图片场景（>10MB 图片）
3. 动图场景（GIF/WebP 动画）
