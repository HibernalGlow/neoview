# NeoView 新系统迁移指南

## 概述

本指南帮助你从旧的加载系统迁移到新的 NeeView 风格页面系统。

## 新系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         bookStore2                               │
│  (Svelte Store - 响应式状态管理)                                  │
├─────────────────────────────────────────────────────────────────┤
│                         BookManager                              │
│  (整合层 - 统一的书籍操作 API)                                    │
├─────────────────────────────────────────────────────────────────┤
│  VirtualPageList  │  PageFrameManager  │  PreloadPipeline       │
│  (虚拟页面列表)    │  (页面帧管理)       │  (预加载流水线)         │
├─────────────────────────────────────────────────────────────────┤
│                      ViewerController                            │
│  (视图控制 - 缩放/平移/旋转)                                      │
├─────────────────────────────────────────────────────────────────┤
│                     tauriIntegration                             │
│  (Tauri 后端集成)                                                │
└─────────────────────────────────────────────────────────────────┘
```

## 新增文件

### 核心模块 (`src/lib/core/`)

| 文件 | 功能 |
|------|------|
| `types.ts` | 核心类型定义 |
| `virtualPageList.ts` | 虚拟页面列表，支持智能分割横向页面 |
| `pageFrameManager.ts` | 页面帧管理，支持单页/双页模式 |
| `preloadPipeline.ts` | 预加载流水线，优先级队列 |
| `viewerController.ts` | 视图控制器，统一变换管理 |
| `bookManager.ts` | 书籍管理器，高层集成 |
| `tauriIntegration.ts` | Tauri 后端集成 |
| `lruCache.ts` | LRU 缓存实现 |
| `utils.ts` | 工具函数 |

### Store (`src/lib/stores/`)

| 文件 | 功能 |
|------|------|
| `bookStore2.ts` | 新的书籍状态管理 |

### UI 组件 (`src/lib/components/viewer/`)

| 文件 | 功能 |
|------|------|
| `PageFrameViewer.svelte` | 页面帧查看器 |
| `VirtualThumbnailList.svelte` | 虚拟化缩略图列表 |
| `ReaderView.svelte` | 完整阅读器视图 |

---

## 迁移步骤

### 步骤 1: 替换 Store 导入

**旧代码:**
```typescript
import { bookStore } from '$lib/stores/bookStore';
```

**新代码:**
```typescript
import { bookStore2 } from '$lib/stores/bookStore2';
```

### 步骤 2: 更新打开书籍的方式

**旧代码:**
```typescript
await bookStore.openBook(path);
```

**新代码:**
```typescript
import { openBookWithTauri } from '$lib/core/tauriIntegration';

await openBookWithTauri(bookStore2, path, {
  enableUpscale: false,  // 可选
});
```

### 步骤 3: 更新页面导航

**旧代码:**
```typescript
bookStore.nextPage();
bookStore.prevPage();
bookStore.goToPage(index);
```

**新代码 (相同):**
```typescript
bookStore2.nextPage();
bookStore2.prevPage();
bookStore2.goToPage(index);
```

### 步骤 4: 更新状态订阅

**旧代码:**
```typescript
$: currentPage = $bookStore.currentPage;
$: totalPages = $bookStore.totalPages;
```

**新代码:**
```typescript
$: state = $bookStore2;
$: currentPage = state.currentIndex;
$: totalPages = state.virtualPageCount;
```

### 步骤 5: 更新视图控制

**旧代码:**
```typescript
// 可能分散在多个地方
zoomIn();
zoomOut();
pan(dx, dy);
```

**新代码:**
```typescript
bookStore2.zoom(1);   // 放大
bookStore2.zoom(-1);  // 缩小
bookStore2.pan(dx, dy);
bookStore2.rotate(90);
bookStore2.setViewMode('panorama');
```

### 步骤 6: 更新组件

**旧代码:**
```svelte
<ImageViewer {src} />
```

**新代码:**
```svelte
<script>
  import ReaderView from '$lib/components/viewer/ReaderView.svelte';
</script>

<ReaderView 
  showThumbnails={true}
  thumbnailPosition="left"
/>
```

---

## API 对照表

### 书籍操作

| 旧 API | 新 API |
|--------|--------|
| `bookStore.openBook(path)` | `openBookWithTauri(bookStore2, path)` |
| `bookStore.closeBook()` | `bookStore2.closeBook()` |
| `bookStore.isOpen` | `$bookStore2.isOpen` |

### 页面导航

| 旧 API | 新 API |
|--------|--------|
| `bookStore.nextPage()` | `bookStore2.nextPage()` |
| `bookStore.prevPage()` | `bookStore2.prevPage()` |
| `bookStore.goToPage(n)` | `bookStore2.goToPage(n)` |
| `bookStore.goToFirst()` | `bookStore2.goToFirst()` |
| `bookStore.goToLast()` | `bookStore2.goToLast()` |

### 状态访问

| 旧 API | 新 API |
|--------|--------|
| `$bookStore.currentPage` | `$bookStore2.currentIndex` |
| `$bookStore.totalPages` | `$bookStore2.virtualPageCount` |
| `$bookStore.physicalPages` | `$bookStore2.physicalPageCount` |

### 设置

| 旧 API | 新 API |
|--------|--------|
| - | `bookStore2.setDivideLandscape(bool)` |
| - | `bookStore2.setPageMode('single' \| 'wide')` |
| - | `bookStore2.setReadOrder('ltr' \| 'rtl')` |
| - | `bookStore2.setSortMode(mode)` |

### 视图控制

| 旧 API | 新 API |
|--------|--------|
| - | `bookStore2.zoom(delta)` |
| - | `bookStore2.zoomTo(scale)` |
| - | `bookStore2.pan(dx, dy)` |
| - | `bookStore2.rotate(angle)` |
| - | `bookStore2.setViewMode(mode)` |
| - | `bookStore2.fitToContainer()` |

---

## 新功能

### 1. 智能分割横向页面

```typescript
// 启用分割横向页面
bookStore2.setDivideLandscape(true);

// 横向页面会被自动分割成两个虚拟页面
// 虚拟页面数 > 物理页面数
```

### 2. 双页模式

```typescript
// 设置双页模式
bookStore2.setPageMode('wide');

// 两个纵向页面会并排显示
```

### 3. 多视图模式

```typescript
// 普通模式
bookStore2.setViewMode('normal');

// 全景模式 (适合长图)
bookStore2.setViewMode('panorama');

// 放大镜模式
bookStore2.setViewMode('loupe');
```

### 4. 预加载流水线

预加载自动管理，无需手动调用。可以通过以下方式控制：

```typescript
// 暂停预加载
bookStore2.pausePreload();

// 恢复预加载
bookStore2.resumePreload();

// 清空缓存
bookStore2.clearPreloadCache();
```

### 5. 虚拟化缩略图列表

使用 `VirtualThumbnailList` 组件，只渲染可见区域的缩略图：

```svelte
<VirtualThumbnailList
  itemWidth={120}
  itemHeight={160}
  direction="vertical"
  on:select={handleSelect}
/>
```

---

## 渐进式迁移策略

### 阶段 1: 并行运行

1. 保留旧的 `bookStore`
2. 在新页面/组件中使用 `bookStore2`
3. 通过 Feature Flag 切换

### 阶段 2: 逐步替换

1. 从简单的组件开始
2. 替换页面导航逻辑
3. 替换视图控制逻辑

### 阶段 3: 完全迁移

1. 移除旧的 `bookStore`
2. 移除旧的组件
3. 清理未使用的代码

---

## 注意事项

1. **状态结构变化**: 新系统的状态结构与旧系统不同，需要更新所有订阅代码

2. **异步操作**: `openBookWithTauri` 是异步的，需要 `await`

3. **缓存管理**: 新系统使用 LRU 缓存，自动管理内存

4. **事件处理**: 新系统使用事件回调而非 Svelte 事件

5. **类型安全**: 新系统提供完整的 TypeScript 类型定义

---

## 故障排除

### 问题: 图像不显示

检查加载函数是否正确设置：
```typescript
bookStore2.setLoadFunctions(imageLoader, thumbnailLoader);
```

### 问题: 页面数量不对

检查是否启用了分割横向页面：
```typescript
// 虚拟页面数可能大于物理页面数
console.log('Virtual:', $bookStore2.virtualPageCount);
console.log('Physical:', $bookStore2.physicalPageCount);
```

### 问题: 预加载不工作

确保加载函数已设置，并且没有暂停预加载：
```typescript
bookStore2.resumePreload();
```

---

## 下一步

1. 运行 `yarn build` 验证编译
2. 在测试页面中尝试新组件
3. 逐步替换现有组件
4. 完成迁移后删除旧代码
