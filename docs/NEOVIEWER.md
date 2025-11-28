# NeoViewer 模块文档

## 概述

NeoViewer 是 NeoView 的新一代图片查看器组件，采用模块化架构设计，支持：
- 图片渲染（缩放、旋转、裁剪）
- 手势处理（触摸、鼠标、键盘）
- 横向分割、自动旋转
- 与现有 UI stores 集成

## 文件结构

```
src/lib/viewer/
├── index.ts              # 模块导出
├── NeoViewer.svelte      # 主组件（~400行）
├── ImageRenderer.svelte  # 图片渲染组件（~250行）
├── GestureHandler.ts     # 手势处理器（~300行）
└── NewViewer.svelte      # 旧版兼容（可删除）
```

## 组件说明

### NeoViewer.svelte

主查看器组件，兼容 `ImageViewerDisplay` 接口。

**Props:**
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| imageData | string \| null | null | 主图片 URL |
| imageData2 | string \| null | null | 第二张图片 URL（双页模式） |
| upscaledImageData | string \| null | null | 放大后的图片 URL |
| viewMode | 'single' \| 'double' \| 'panorama' | 'single' | 视图模式 |
| orientation | 'horizontal' \| 'vertical' | 'horizontal' | 布局方向 |
| panoramaPages | Array | [] | 全景模式页面数据 |
| panX | number | 0 | X 轴平移 |
| panY | number | 0 | Y 轴平移 |
| horizontalSplitHalf | 'first' \| 'second' \| null | null | 横向分割半边 |
| treatHorizontalAsDoublePage | boolean | false | 横向页面视为双页 |
| onPrevPage | () => void | - | 上一页回调 |
| onNextPage | () => void | - | 下一页回调 |

**特性:**
- 自动从 `zoomLevel` 和 `rotationAngle` stores 获取缩放和旋转状态
- 支持手势操作（拖拽平移、滚轮缩放、双击缩放）
- 点击左侧 30% 区域翻上一页，右侧 30% 翻下一页

### ImageRenderer.svelte

底层图片渲染组件。

**Props:**
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| src | string \| null | null | 图片 URL |
| rotation | 0 \| 90 \| 180 \| 270 | 0 | 旋转角度 |
| cropRect | Rect \| null | null | 裁剪区域 |
| splitHalf | 'left' \| 'right' \| null | null | 横向分割半边 |
| scale | number | 1 | 缩放比例 |
| offset | { x: number, y: number } | { x: 0, y: 0 } | 偏移量 |
| fitMode | 'contain' \| 'cover' \| 'none' | 'contain' | 适应模式 |
| loading | boolean | false | 加载状态 |

**实现原理:**
- 使用 CSS `transform` 实现缩放、旋转、平移
- 使用 CSS `clip-path: inset()` 实现横向分割
- 分割时：左半边 `inset(0 50% 0 0)`，右半边 `inset(0 0 0 50%)`

### GestureHandler.ts

手势处理器类，处理触摸和鼠标事件。

**构造函数:**
```typescript
new GestureHandler(element: HTMLElement, events: GestureEvents, config?: GestureConfig)
```

**事件回调:**
```typescript
interface GestureEvents {
  onPan?: (delta: Point) => void;      // 平移
  onZoom?: (scale: number, center: Point) => void;  // 缩放
  onTap?: (point: Point) => void;      // 单击
  onDoubleTap?: (point: Point) => void; // 双击
}
```

**配置:**
```typescript
interface GestureConfig {
  enablePan?: boolean;      // 启用平移
  enableZoom?: boolean;     // 启用缩放
  enableTap?: boolean;      // 启用点击
  doubleTapDelay?: number;  // 双击延迟（ms）
  minZoom?: number;         // 最小缩放
  maxZoom?: number;         // 最大缩放
}
```

## 使用方式

### 在 Classic 模式中使用

已集成到 `ImageViewer.svelte`，通过顶栏的 "N" 按钮切换。

```svelte
{#if $useNeoViewer}
  <NeoViewer
    {imageData}
    {imageData2}
    viewMode={$viewerState.viewMode}
    onPrevPage={() => bookStore.prevPage()}
    onNextPage={() => bookStore.nextPage()}
  />
{:else}
  <ImageViewerDisplay ... />
{/if}
```

### 独立使用 ImageRenderer

```svelte
<script>
  import { ImageRenderer } from '$lib/viewer';
</script>

<ImageRenderer
  src={imageUrl}
  rotation={90}
  scale={1.5}
  splitHalf="left"
/>
```

## UI Store 集成

NeoViewer 自动使用以下 stores：

| Store | 说明 |
|-------|------|
| `zoomLevel` | 缩放级别 |
| `rotationAngle` | 旋转角度 |
| `useNeoViewer` | NeoViewer 开关 |

相关函数：
- `zoomIn()` / `zoomOut()` - 缩放
- `resetZoom()` - 重置缩放
- `rotateClockwise()` - 顺时针旋转
- `toggleNeoViewer()` - 切换 NeoViewer

## 与传统 ImageViewerDisplay 的区别

| 特性 | ImageViewerDisplay | NeoViewer |
|------|-------------------|-----------|
| 缩放/旋转 | 通过 props 传入 | 自动从 stores 获取 |
| 手势处理 | 外部处理 | 内置 GestureHandler |
| 点击翻页 | 不支持 | 支持 |
| 模块化 | 单文件 | 多模块组合 |

## 迁移指南

### 从 ImageViewerDisplay 迁移

1. 移除 `zoomLevel` 和 `rotationAngle` props（自动从 stores 获取）
2. 添加 `onPrevPage` 和 `onNextPage` 回调
3. 其他 props 保持不变

### 渐进式迁移

使用 `useNeoViewer` store 控制开关，可以随时切换回传统组件。

## 后续计划

1. [ ] 添加动画过渡效果
2. [ ] 支持更多手势（双指旋转）
3. [ ] 性能优化（虚拟列表）
4. [ ] 完全替换 ImageViewerDisplay
