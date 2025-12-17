# Design Document: Image Transition Fix

## Overview

本设计文档描述了修复图片查看器在切换图片时出现视觉跳动问题的技术方案。核心问题是当用户切换图片时，当前图片会先被缩小到错误的比例，然后新图片才以正确的缩放比例显示。

### 问题根因分析

1. **单一变量存储问题**：`loadedImageSize` 是单一变量，每次切换页面时被清空，导致"空档期"
2. **尺寸清空时机问题**：新图片 URL 变化时立即清空尺寸，但新尺寸还没获取到
3. **尺寸来源不一致**：`modeScale` 计算依赖多个尺寸来源，切换时这些值的更新时序不一致

### 解决方案概述

综合三种方案的优点，采用"索引化缓存 + 预计算缩放 + 统一 Store"策略：

1. **利用现有尺寸缓存**（方案 A）：`stackImageLoader.dimensionsCache` 已按索引存储尺寸，直接复用
2. **使用预计算缩放**（方案 B）：`stackImageLoader.precomputeScale()` 预计算并缓存缩放值，切换时直接读取
3. **统一尺寸管理入口**（方案 C）：在 `imageStore` 中暴露统一的尺寸获取接口，解耦 StackView 与底层实现
4. **移除 transitionState**：有了可靠的预计算缩放，不再需要复杂的过渡状态管理
5. **移除 loadedImageSize 单一变量**：改用 `getDimensionsForPage(pageIndex)` 按索引读取

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        StackView.svelte                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │  Page Change    │───▶│ Get Cached      │                     │
│  │  Detection      │    │ Scale           │                     │
│  └─────────────────┘    └────────┬────────┘                     │
│                                  │                               │
│                                  ▼                               │
│                         ┌─────────────────┐                     │
│                         │ stackImageLoader│                     │
│                         │ .getCachedScale │                     │
│                         └────────┬────────┘                     │
│                                  │ 有缓存？                      │
│                    ┌─────────────┴─────────────┐                │
│                    ▼                           ▼                │
│           ┌─────────────────┐         ┌─────────────────┐       │
│           │ 直接使用缓存值   │         │ 从 dimensions   │       │
│           │ (无跳动)        │         │ 计算缩放        │       │
│           └─────────────────┘         └─────────────────┘       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     stackImageLoader                             │
├─────────────────────────────────────────────────────────────────┤
│  dimensionsCache: Map<pageIndex, {width, height}>               │
│  precomputedScaleCache: Map<cacheKey, scale>                    │
│                                                                  │
│  precomputeScale(pageIndex, zoomMode) → 计算并缓存              │
│  getCachedScale(pageIndex, zoomMode) → 读取缓存                 │
│  getCachedDimensions(pageIndex) → 读取尺寸                      │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. imageStore 新增接口

在 `imageStore` 中暴露统一的尺寸和缩放获取接口：

```typescript
// imageStore.svelte.ts 新增方法
interface ImageStore {
  // 现有方法...
  
  /** 【新增】获取指定页面的尺寸（按索引读取缓存） */
  getDimensionsForPage(pageIndex: number): { width: number; height: number } | null;
  
  /** 【新增】获取指定页面的预计算缩放值 */
  getScaleForPage(pageIndex: number, zoomMode: ZoomMode, viewport: ViewportSize): number;
  
  /** 【新增】设置视口尺寸（用于预计算） */
  setViewportSize(width: number, height: number): void;
}
```

### 2. stackImageLoader 现有接口（直接复用）

```typescript
// 已有的方法，无需修改
class StackImageLoader {
  // 尺寸缓存 - 按索引存储
  private dimensionsCache = new Map<number, { width: number; height: number }>();
  
  // 预计算缩放缓存
  private precomputedScaleCache = new Map<string, number>();
  
  // 获取缓存的尺寸
  getCachedDimensions(pageIndex: number): { width: number; height: number } | undefined;
  
  // 预计算缩放
  precomputeScale(pageIndex: number, zoomMode: string): number | null;
  
  // 获取缓存的缩放
  getCachedScale(pageIndex: number, zoomMode: string): number | null;
}
```

### 3. StackView.svelte 修改

```typescript
// 移除这些：
// - loadedImageSize 单一变量
// - transitionState 过渡状态
// - 相关的 $effect.pre 监听

// 新增：
// modeScale 计算改为直接读取缓存
let modeScale = $derived.by(() => {
  const pageIndex = bookStore.currentPageIndex;
  
  // 1. 优先使用预计算的缩放值
  const cachedScale = imageStore.getScaleForPage(pageIndex, currentZoomMode, viewportSize);
  if (cachedScale > 0) {
    return cachedScale;
  }
  
  // 2. 使用缓存的尺寸计算
  const dims = imageStore.getDimensionsForPage(pageIndex);
  if (dims && viewportSize.width > 0 && viewportSize.height > 0) {
    return calculateTargetScale(dims, viewportSize, currentZoomMode);
  }
  
  // 3. 降级：使用 bookStore 元数据
  const page = bookStore.currentPage;
  if (page?.width && page?.height) {
    return calculateTargetScale({ width: page.width, height: page.height }, viewportSize, currentZoomMode);
  }
  
  // 4. 最终降级
  return 1;
});
```

## Data Models

### 尺寸缓存数据流

```
预加载阶段：
  loadPage(pageIndex) 
    → 获取图片尺寸 
    → dimensionsCache.set(pageIndex, dims)
    → bookStore.updatePageDimensions(pageIndex, dims)

切换页面时：
  modeScale 计算
    → imageStore.getScaleForPage(pageIndex)
    → stackImageLoader.getCachedScale(pageIndex) 
    → 有缓存？直接返回 : 计算并缓存

图片加载完成后：
  handleImageLoad()
    → 更新 dimensionsCache（如果尺寸有变化）
    → 触发 modeScale 重新计算（自动响应式）
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Scale calculation correctness
*For any* valid image dimensions and viewport size, the calculated scale using `calculateTargetScale` SHALL produce a value that ensures the image fits within the viewport according to the specified zoom mode.
**Validates: Requirements 1.2, 1.4**

### Property 2: Fallback scale safety
*For any* scenario where image dimensions are unavailable (null or zero), the scale calculation SHALL return 1.0 as a safe default.
**Validates: Requirements 1.3, 2.2**

### Property 3: Dimension cache consistency
*For any* page index, calling `getDimensionsForPage(pageIndex)` multiple times SHALL return the same dimensions (cache is stable).
**Validates: Requirements 2.3, 3.1**

### Property 4: Scale cache hit rate
*For any* preloaded page, calling `getScaleForPage(pageIndex)` SHALL return a cached value without recalculation.
**Validates: Requirements 3.2, 4.1, 4.3**

### Property 5: Page index isolation
*For any* two different page indices, their cached dimensions and scales SHALL be independent (modifying one does not affect the other).
**Validates: Requirements 3.4, 1.1**

## Error Handling

1. **尺寸获取失败**：当所有尺寸来源都不可用时，使用默认缩放 1.0
2. **过渡超时**：如果过渡状态持续超过 5 秒，强制清理并恢复正常计算
3. **页面索引不匹配**：如果图片加载完成时页面索引已变化，忽略该加载结果

## Testing Strategy

### 单元测试

1. `calculateTargetScale` 函数的各种缩放模式测试
2. `getBestDimensions` 函数的优先级测试
3. TransitionState 状态机的状态转换测试

### 属性测试

使用 fast-check 库进行属性测试：

1. **缩放计算正确性**：生成随机图片尺寸和视口尺寸，验证缩放结果符合预期
2. **尺寸优先级**：生成随机的尺寸来源组合，验证选择正确的来源
3. **过渡状态一致性**：生成随机的页面切换序列，验证状态机行为正确

### 集成测试

1. 模拟快速翻页场景，验证无视觉跳动
2. 模拟横竖图片切换，验证缩放平滑过渡
3. 模拟缓存命中和未命中场景，验证行为一致

### 测试框架

- 属性测试库：fast-check
- 测试运行器：vitest
- 测试文件位置：与源文件同目录，使用 `.test.ts` 后缀
