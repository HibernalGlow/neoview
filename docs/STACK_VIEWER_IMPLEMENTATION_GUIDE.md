# StackViewer 实现指南

> 本文档为前端小白准备，详细说明每个功能的实现步骤、涉及文件、关键代码和预期效果。

---

## 目录

1. [Phase 1: 基础层叠结构](#phase-1-基础层叠结构) ⭐ 最高优先级
2. [Phase 2: 帧数据管理](#phase-2-帧数据管理) ⭐ 高优先级
3. [Phase 3: 手势层](#phase-3-手势层) ⭐ 高优先级
4. [Phase 4: 信息层](#phase-4-信息层) 中优先级
5. [Phase 5: 分割和旋转](#phase-5-分割和旋转) 中优先级
6. [Phase 6: 超分层](#phase-6-超分层) 中优先级
7. [Phase 7: 视频支持](#phase-7-视频支持) 低优先级
8. [Phase 8: 进度条集成](#phase-8-进度条集成) 低优先级

---

## Phase 1: 基础层叠结构

### 目标
创建模块化的层叠结构，每层一个文件。

### 涉及文件

```
src/lib/viewer/
├── layers/
│   ├── index.ts                 # 新建
│   ├── BackgroundLayer.svelte   # 新建
│   ├── PrevFrameLayer.svelte    # 新建
│   ├── NextFrameLayer.svelte    # 新建
│   ├── CurrentFrameLayer.svelte # 新建
│   └── UpscaleLayer.svelte      # 新建
└── StackViewer.svelte           # 重构
```

### 步骤

#### 1.1 创建 `layers/index.ts`

```typescript
// src/lib/viewer/layers/index.ts
export { default as BackgroundLayer } from './BackgroundLayer.svelte';
export { default as PrevFrameLayer } from './PrevFrameLayer.svelte';
export { default as NextFrameLayer } from './NextFrameLayer.svelte';
export { default as CurrentFrameLayer } from './CurrentFrameLayer.svelte';
export { default as UpscaleLayer } from './UpscaleLayer.svelte';
```

#### 1.2 创建 `BackgroundLayer.svelte`

```svelte
<!-- src/lib/viewer/layers/BackgroundLayer.svelte -->
<script lang="ts">
  let {
    color = 'var(--background)',
  }: {
    color?: string;
  } = $props();
</script>

<div 
  class="background-layer"
  style:background-color={color}
/>

<style>
  .background-layer {
    position: absolute;
    inset: 0;
    z-index: 0;
  }
</style>
```

#### 1.3 创建 `CurrentFrameLayer.svelte`

```svelte
<!-- src/lib/viewer/layers/CurrentFrameLayer.svelte -->
<script lang="ts">
  import type { Frame } from '../types';
  
  let {
    frame,
    transform = 'none',
    onImageLoad,
  }: {
    frame: Frame;
    transform?: string;
    onImageLoad?: (e: Event, index: number) => void;
  } = $props();
</script>

<div 
  class="current-frame-layer"
  style:transform={transform}
>
  {#each frame.images as img, i (i)}
    <img
      src={img.url}
      alt="Page {i}"
      class="frame-image"
      onload={(e) => onImageLoad?.(e, i)}
      draggable="false"
    />
  {/each}
</div>

<style>
  .current-frame-layer {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .frame-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
  }
</style>
```

#### 1.4 重构 `StackViewer.svelte`

```svelte
<!-- src/lib/viewer/StackViewer.svelte -->
<script lang="ts">
  import {
    BackgroundLayer,
    PrevFrameLayer,
    NextFrameLayer,
    CurrentFrameLayer,
    UpscaleLayer,
  } from './layers';
  
  // ... props 和状态
</script>

<div class="stack-viewer">
  <BackgroundLayer color={backgroundColor} />
  <PrevFrameLayer frame={prevFrame} />
  <NextFrameLayer frame={nextFrame} />
  <CurrentFrameLayer 
    frame={currentFrame} 
    transform={baseTransform}
    onImageLoad={handleImageLoad}
  />
  <UpscaleLayer frame={upscaledFrame} transform={baseTransform} />
</div>
```

### 预期效果
- 每层独立文件，易于维护
- 层之间通过 props 通信
- z-index 由各层自己管理

---

## Phase 2: 帧数据管理

### 目标
创建统一的帧数据管理，从 `bookStore2` 获取数据并转换为帧格式。

### 涉及文件

```
src/lib/viewer/
├── stores/
│   ├── index.ts          # 新建
│   └── frameStore.ts     # 新建
└── types/
    ├── index.ts          # 新建
    └── frame.ts          # 新建
```

### 步骤

#### 2.1 创建 `types/frame.ts`

```typescript
// src/lib/viewer/types/frame.ts

export interface FrameImage {
  url: string;
  physicalIndex: number;
  virtualIndex: number;
  splitHalf?: 'left' | 'right' | null;
  rotation?: 0 | 90 | 180 | 270;
  width?: number;
  height?: number;
}

export interface Frame {
  id: string;
  images: FrameImage[];
  layout: 'single' | 'double' | 'panorama';
}

export const emptyFrame: Frame = {
  id: '',
  images: [],
  layout: 'single',
};
```

#### 2.2 创建 `stores/frameStore.ts`

```typescript
// src/lib/viewer/stores/frameStore.ts
import { derived } from 'svelte/store';
import { bookStore2 } from '$lib/stores/bookStore2';
import type { Frame, FrameImage, emptyFrame } from '../types';

/**
 * 从 bookStore2 的 PageFrame 转换为 StackViewer 的 Frame
 */
function convertToFrame(pageFrame: PageFrame | null, imageUrls: Map<number, string>): Frame {
  if (!pageFrame) return emptyFrame;
  
  const images: FrameImage[] = pageFrame.elements.map(element => {
    const vp = element.virtualPage;
    return {
      url: imageUrls.get(vp.physicalPage.index) || '',
      physicalIndex: vp.physicalPage.index,
      virtualIndex: vp.virtualIndex,
      splitHalf: vp.isDivided ? (vp.part === 0 ? 'left' : 'right') : null,
      rotation: vp.rotation,
      width: vp.physicalPage.size.width,
      height: vp.physicalPage.size.height,
    };
  });
  
  return {
    id: `frame-${pageFrame.frameRange.index}`,
    images,
    layout: pageFrame.elements.length > 1 ? 'double' : 'single',
  };
}

/**
 * 当前帧 store
 */
export const currentFrameStore = derived(
  bookStore2,
  ($state) => {
    // 这里需要结合图片 URL 缓存
    // 暂时返回空帧，后续集成 NeoImageLoader
    return emptyFrame;
  }
);
```

### 预期效果
- 统一的帧数据格式
- 从 `bookStore2` 自动派生帧数据
- 类型安全

---

## Phase 3: 手势层

### 目标
创建独立的手势层，处理所有用户交互。

### 涉及文件

```
src/lib/viewer/
├── layers/
│   └── GestureLayer.svelte  # 新建
└── GestureHandler.ts        # 已存在，可能需要修改
```

### 步骤

#### 3.1 创建 `GestureLayer.svelte`

```svelte
<!-- src/lib/viewer/layers/GestureLayer.svelte -->
<script lang="ts">
  import { GestureHandler, type GestureEvents } from '../GestureHandler';
  import { onMount, onDestroy } from 'svelte';
  
  let {
    // 是否为视频模式（视频模式下只处理边缘区域）
    isVideoMode = false,
    // 点击区域配置
    tapZones = { left: 0.3, right: 0.7 },
    // 事件回调
    onTapLeft,
    onTapRight,
    onTapCenter,
    onPan,
    onPinch,
  }: {
    isVideoMode?: boolean;
    tapZones?: { left: number; right: number };
    onTapLeft?: () => void;
    onTapRight?: () => void;
    onTapCenter?: () => void;
    onPan?: (delta: { x: number; y: number }) => void;
    onPinch?: (scale: number) => void;
  } = $props();
  
  let layerRef: HTMLDivElement | null = $state(null);
  let handler: GestureHandler | null = null;
  
  const gestureEvents: GestureEvents = {
    onTap: (point) => {
      if (!layerRef) return;
      const rect = layerRef.getBoundingClientRect();
      const relX = (point.x - rect.left) / rect.width;
      
      if (relX < tapZones.left) {
        onTapLeft?.();
      } else if (relX > tapZones.right) {
        onTapRight?.();
      } else {
        onTapCenter?.();
      }
    },
    onPan: (delta) => {
      onPan?.(delta);
    },
  };
  
  onMount(() => {
    if (layerRef) {
      handler = new GestureHandler(layerRef, gestureEvents, {
        enableZoom: false,
      });
    }
  });
  
  onDestroy(() => {
    handler?.destroy();
  });
</script>

<div 
  class="gesture-layer"
  class:video-mode={isVideoMode}
  bind:this={layerRef}
/>

<style>
  .gesture-layer {
    position: absolute;
    inset: 0;
    z-index: 90;
    /* 默认捕获所有事件 */
  }
  
  /* 视频模式：只在边缘区域捕获事件 */
  .gesture-layer.video-mode {
    /* 使用伪元素创建边缘区域 */
    pointer-events: none;
  }
  
  .gesture-layer.video-mode::before,
  .gesture-layer.video-mode::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 20%;
    pointer-events: auto;
  }
  
  .gesture-layer.video-mode::before {
    left: 0;
  }
  
  .gesture-layer.video-mode::after {
    right: 0;
  }
</style>
```

#### 3.2 在 StackViewer 中使用

```svelte
<GestureLayer
  isVideoMode={isVideo}
  onTapLeft={handlePrevPage}
  onTapRight={handleNextPage}
  onPan={(delta) => localPan = { x: localPan.x + delta.x, y: localPan.y + delta.y }}
/>
```

### 预期效果
- 手势处理与显示分离
- 视频模式下不阻挡视频控件
- 可配置的点击区域

---

## Phase 4: 信息层

### 目标
显示页面信息、进度条、加载状态。

### 涉及文件

```
src/lib/viewer/
└── layers/
    └── InfoLayer.svelte  # 新建
```

### 步骤

#### 4.1 创建 `InfoLayer.svelte`

```svelte
<!-- src/lib/viewer/layers/InfoLayer.svelte -->
<script lang="ts">
  let {
    currentIndex = 0,
    totalPages = 0,
    isLoading = false,
    isDivided = false,
    showPageInfo = true,
    showProgress = true,
  }: {
    currentIndex?: number;
    totalPages?: number;
    isLoading?: boolean;
    isDivided?: boolean;
    showPageInfo?: boolean;
    showProgress?: boolean;
  } = $props();
  
  let progress = $derived(totalPages > 0 ? ((currentIndex + 1) / totalPages) * 100 : 0);
</script>

<div class="info-layer">
  <!-- 页面信息 -->
  {#if showPageInfo && totalPages > 0}
    <div class="page-info">
      <span>{currentIndex + 1} / {totalPages}</span>
      {#if isDivided}
        <span class="badge">分割</span>
      {/if}
    </div>
  {/if}
  
  <!-- 加载指示器 -->
  {#if isLoading}
    <div class="loading-indicator">
      <div class="spinner" />
    </div>
  {/if}
  
  <!-- 进度条 -->
  {#if showProgress && totalPages > 0}
    <div class="progress-bar">
      <div class="progress-fill" style:width="{progress}%" />
    </div>
  {/if}
</div>

<style>
  .info-layer {
    position: absolute;
    inset: 0;
    z-index: 70;
    pointer-events: none;
  }
  
  .page-info {
    position: absolute;
    bottom: 8px;
    right: 8px;
    padding: 2px 8px;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    color: white;
    font-size: 12px;
    display: flex;
    gap: 4px;
    align-items: center;
  }
  
  .badge {
    background: rgba(255, 255, 255, 0.2);
    padding: 0 4px;
    border-radius: 2px;
    font-size: 10px;
  }
  
  .loading-indicator {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
  
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: rgba(255, 255, 255, 0.2);
  }
  
  .progress-fill {
    height: 100%;
    background: var(--primary, #3b82f6);
    transition: width 0.3s ease;
  }
</style>
```

### 预期效果
- 右下角显示页码
- 底部显示进度条
- 加载时显示 spinner

---

## Phase 5: 分割和旋转

### 目标
在 `CurrentFrameLayer` 中正确处理分割和旋转。

### 涉及文件

```
src/lib/viewer/
├── layers/
│   └── CurrentFrameLayer.svelte  # 修改
└── renderers/
    └── ImageRenderer.svelte      # 已存在，可能需要修改
```

### 关键代码

#### 5.1 分割样式计算

```typescript
// 计算裁剪路径
function getClipPath(splitHalf: 'left' | 'right' | null): string {
  if (splitHalf === 'left') {
    return 'inset(0 50% 0 0)';  // 裁掉右半
  } else if (splitHalf === 'right') {
    return 'inset(0 0 0 50%)';  // 裁掉左半
  }
  return 'none';
}

// 计算位移补偿（分割后图片需要移动到中心）
function getSplitTransform(splitHalf: 'left' | 'right' | null): string {
  if (splitHalf === 'left') {
    return 'translateX(25%)';  // 向右移动 25%
  } else if (splitHalf === 'right') {
    return 'translateX(-25%)'; // 向左移动 25%
  }
  return '';
}
```

#### 5.2 旋转样式计算

```typescript
// 计算旋转变换
function getRotationTransform(rotation: 0 | 90 | 180 | 270): string {
  if (rotation === 0) return '';
  return `rotate(${rotation}deg)`;
}

// 组合所有变换
function getImageTransform(img: FrameImage): string {
  const parts = [];
  
  // 分割位移
  const splitTransform = getSplitTransform(img.splitHalf);
  if (splitTransform) parts.push(splitTransform);
  
  // 旋转
  const rotationTransform = getRotationTransform(img.rotation || 0);
  if (rotationTransform) parts.push(rotationTransform);
  
  return parts.join(' ') || 'none';
}
```

### 预期效果
- 横向图正确分割成两个虚拟页
- 分割后的图片居中显示
- 自动旋转的图片正确旋转

---

## Phase 6: 超分层

### 目标
超分完成后，超分图片覆盖在原图上。

### 涉及文件

```
src/lib/viewer/
└── layers/
    └── UpscaleLayer.svelte  # 新建
```

### 步骤

#### 6.1 创建 `UpscaleLayer.svelte`

```svelte
<!-- src/lib/viewer/layers/UpscaleLayer.svelte -->
<script lang="ts">
  import type { Frame } from '../types';
  
  let {
    frame,
    transform = 'none',
    visible = true,
  }: {
    frame: Frame;
    transform?: string;
    visible?: boolean;
  } = $props();
</script>

{#if visible && frame.images.length > 0}
  <div 
    class="upscale-layer"
    style:transform={transform}
  >
    {#each frame.images as img, i (i)}
      <img
        src={img.url}
        alt="Upscaled {i}"
        class="frame-image"
        draggable="false"
      />
    {/each}
  </div>
{/if}

<style>
  .upscale-layer {
    position: absolute;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    /* 渐入动画 */
    animation: fadeIn 0.3s ease;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  .frame-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
  }
</style>
```

### 预期效果
- 超分完成后图片渐入显示
- 覆盖在原图上
- 与原图保持相同的变换

---

## Phase 7: 视频支持

### 目标
在当前帧层支持视频播放。

### 涉及文件

```
src/lib/viewer/
├── frames/
│   └── VideoFrame.svelte    # 新建
└── layers/
    └── CurrentFrameLayer.svelte  # 修改
```

### 关键代码

#### 7.1 判断是否为视频

```typescript
function isVideoFile(path: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
  return videoExtensions.some(ext => path.toLowerCase().endsWith(ext));
}
```

#### 7.2 在 CurrentFrameLayer 中条件渲染

```svelte
{#if isVideo}
  <VideoFrame 
    src={frame.images[0].url}
    onEnded={onVideoEnded}
  />
{:else}
  {#each frame.images as img, i (i)}
    <img ... />
  {/each}
{/if}
```

### 预期效果
- 视频文件使用 `<video>` 元素播放
- 视频控件可用
- 手势层不阻挡视频控件

---

## Phase 8: 进度条集成

### 目标
将现有的 `ImageViewerProgressBar` 集成到 StackViewer。

### 涉及文件

```
src/lib/components/viewer/
└── flow/
    └── ImageViewerProgressBar.svelte  # 已存在

src/lib/viewer/
└── layers/
    └── InfoLayer.svelte  # 修改
```

### 关键代码

#### 8.1 在 InfoLayer 中使用现有进度条

```svelte
<script lang="ts">
  import ImageViewerProgressBar from '$lib/components/viewer/flow/ImageViewerProgressBar.svelte';
</script>

<div class="info-layer">
  <!-- 使用现有进度条组件 -->
  <ImageViewerProgressBar
    showProgressBar={showProgress}
    totalPages={totalPages}
    currentPageIndex={currentIndex}
  />
</div>
```

### 预期效果
- 复用现有进度条组件
- 保持一致的样式

---

## 迁移检查清单

### 功能对齐

- [ ] 单页显示
- [ ] 双页显示
- [ ] 全景模式
- [ ] 横向分割
- [ ] 自动旋转
- [ ] 缩放
- [ ] 旋转
- [ ] 平移
- [ ] 点击翻页
- [ ] 拖拽平移
- [ ] 页面信息
- [ ] 进度条
- [ ] 加载指示器
- [ ] 超分显示
- [ ] 视频播放

### 测试用例

1. **单页模式**
   - 打开一本漫画
   - 确认单页正常显示
   - 点击左右区域翻页

2. **横向分割**
   - 开启"分割横向页面"
   - 打开包含横向图的漫画
   - 确认横向图被分成两页

3. **自动旋转**
   - 开启"自动旋转"
   - 打开包含横向图的漫画
   - 确认横向图旋转 90 度显示

4. **双页模式**
   - 切换到双页模式
   - 确认两页并排显示
   - 确认 RTL 模式下顺序正确

5. **超分**
   - 触发超分
   - 确认超分完成后图片更新

---

## 常见问题

### Q: 为什么图片闪屏？
A: 检查预加载层是否正确加载了前后页。确保 `prevFrame` 和 `nextFrame` 的 URL 有效。

### Q: 分割后图片不居中？
A: 检查 `translateX` 补偿是否正确应用。分割左半需要 `translateX(25%)`，右半需要 `translateX(-25%)`。

### Q: 手势与视频控件冲突？
A: 确保 `GestureLayer` 在视频模式下使用 `pointer-events: none`，只在边缘区域捕获事件。

### Q: 超分层不显示？
A: 检查 `upscaledFrame` 是否有有效的图片 URL，以及 `visible` 属性是否为 `true`。

---

## 参考资料

- [NeeView 源码](https://github.com/neelabo/NeeView)
- [Svelte 5 文档](https://svelte.dev/docs)
- [CSS clip-path](https://developer.mozilla.org/en-US/docs/Web/CSS/clip-path)
- [CSS transform](https://developer.mozilla.org/en-US/docs/Web/CSS/transform)
