# 预计算页面分布系统

## 概述

参考 OpenComic 的 `calculateImagesDistribution` 实现，预先计算所有页面的组合方式，翻页时直接查表，实现 O(1) 复杂度。

## 核心优势

1. **翻页性能**: O(1) 查表，无需每次翻页都重新计算
2. **横向图独占**: 自动处理横向图在双页模式下独占显示
3. **空白页对齐**: 支持插入空白页使横向图对齐
4. **首尾页处理**: 支持首页/尾页单独显示

## 架构对比

### OpenComic 方式（预计算）
```
打开书籍 → calculateImagesDistribution() → imagesDistribution[]
翻页 → imagesDistribution[frameIndex] → O(1)
```

### NeoView 原方式（实时计算）
```
翻页 → buildFrameImages() → 计算当前帧 → O(n) 最坏情况
```

### NeoView 新方式（预计算）
```
打开书籍 → PageDistributionManager.setPages() → 预计算分布
翻页 → getFrame(frameIndex) → O(1)
```

## 使用方法

### 1. 初始化

```typescript
import { pageDistributionStore } from '$lib/stores/pageDistributionStore.svelte';

// 书籍打开时初始化
$effect(() => {
  if (bookStore.currentBook) {
    pageDistributionStore.initialize();
  }
});
```

### 2. 设置双页模式

```typescript
// 切换到双页模式
pageDistributionStore.setDoublePage(true);

// 切换到单页模式
pageDistributionStore.setDoublePage(false);
```

### 3. 翻页

```typescript
// 下一帧
const success = pageDistributionStore.nextFrame();

// 上一帧
const success = pageDistributionStore.prevFrame();

// 跳转到指定页面
pageDistributionStore.goToPage(pageIndex);
```

### 4. 查询当前帧

```typescript
// 获取当前帧数据
const frame = pageDistributionStore.currentFrame;
// frame.items: 帧内的页面项（可能包含空白页）
// frame.isDoublePage: 是否为双页帧

// 获取当前帧包含的物理页面索引
const pageIndices = pageDistributionStore.getCurrentPageIndices();
```

### 5. 更新页面尺寸

```typescript
// 当异步加载图片后获取到真实尺寸时
pageDistributionStore.updatePageSize(pageIndex, { width, height });
```

## 数据结构

### FrameDistribution
```typescript
interface FrameDistribution {
  frameIndex: number;      // 帧索引
  items: DistributionItem[]; // 帧内的页面项
  isDoublePage: boolean;   // 是否为双页帧
}
```

### DistributionItem
```typescript
interface DistributionItem {
  pageIndex: number;  // 物理页面索引（-1 表示空白页）
  isBlank: boolean;   // 是否为空白页
  isFolder: boolean;  // 是否为文件夹
  width: 1 | 2;       // 宽度权重
}
```

## 配置选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| doublePage | 是否启用双页模式 | false |
| doNotApplyToHorizontals | 横向图不应用双页（独占显示） | true |
| alignWithNextHorizontal | 与下一横向图对齐（插入空白页） | false |
| blankFirstPage | 首页前插入空白页 | false |
| singleFirstPage | 首页单独显示 | false |
| singleLastPage | 尾页单独显示 | false |
| readOrder | 阅读方向 | 'ltr' |
| landscapeThreshold | 横向判断阈值（宽高比） | 1.0 |

## 性能对比

| 操作 | 原方式 | 新方式 |
|------|--------|--------|
| 翻页 | O(n) 最坏 | O(1) |
| 页面→帧索引 | O(n) | O(1) |
| 帧索引→页面 | O(n) | O(1) |
| 初始化 | O(1) | O(n) |

初始化时的 O(n) 开销是一次性的，之后所有翻页操作都是 O(1)。
