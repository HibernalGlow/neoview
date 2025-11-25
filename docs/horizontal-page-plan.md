# 横向页面拆分 + 双页显示 + 自动旋转 实施方案

> 目标：在保持现有书籍/查看器结构的基础上，引入“虚拟拆分页”流水线，推动 ImageViewer / ImageViewerDisplay / imageLoader 等模块动态拆分横向页面、遵守阅读方向和双页策略，并串联自动旋转逻辑。

## 1. 状态扩展：bookStore（`src/lib/stores/book.svelte.ts`）

### 1.1 新增类型与状态
- `VirtualPageSlice = 'full' | 'left' | 'right'`
- `interface VirtualPageInfo { pageIndex: number; slice: VirtualPageSlice; isSplit: boolean; }`
- `virtualPagesState = $state<VirtualPageInfo[]>([])`
- `currentVirtualIndexState = $state(0)`
- `virtualIndexByPage = new Map<number, { start: number; count: number }>()`
- `splitHorizontalPagesEnabled = settingsManager.getSettings().view.pageLayout?.splitHorizontalPages ?? false`

### 1.2 构造函数监听设置
```ts
constructor() {
  settingsManager.addListener((next) => {
    const enabled = next.view.pageLayout?.splitHorizontalPages ?? false;
    if (enabled !== this.splitHorizontalPagesEnabled) {
      this.splitHorizontalPagesEnabled = enabled;
      this.rebuildVirtualPages();
    }
  });
}
```

### 1.3 重建虚拟页列表（核心）
```ts
private rebuildVirtualPages() {
  const book = this.state.currentBook;
  if (!book || !Array.isArray(book.pages)) {
    this.virtualPagesState = [];
    this.currentVirtualIndexState = 0;
    this.virtualIndexByPage = new Map();
    return;
  }

  const splitEnabled = this.splitHorizontalPagesEnabled;
  const nextPages: VirtualPageInfo[] = [];
  const nextMap = new Map<number, { start: number; count: number }>();

  book.pages.forEach((page, arrayIndex) => {
    const pageIndex = typeof page.index === 'number' ? page.index : arrayIndex;
    const dims = { width: page.width, height: page.height };
    const shouldSplit = splitEnabled && isHorizontalByDimensions(dims);
    const start = nextPages.length;

    if (shouldSplit) {
      nextPages.push({ pageIndex, slice: 'left', isSplit: true });
      nextPages.push({ pageIndex, slice: 'right', isSplit: true });
      nextMap.set(pageIndex, { start, count: 2 });
    } else {
      nextPages.push({ pageIndex, slice: 'full', isSplit: false });
      nextMap.set(pageIndex, { start, count: 1 });
    }
  });

  const prevVirtual = this.currentVirtualPage;
  this.virtualPagesState = nextPages;
  this.virtualIndexByPage = nextMap;

  if (prevVirtual) {
    const restored = this.findVirtualIndex(prevVirtual.pageIndex, prevVirtual.slice);
    if (restored != null) {
      this.currentVirtualIndexState = restored;
      return;
    }
  }

  const meta = this.virtualIndexByPage.get(book.currentPage);
  this.currentVirtualIndexState = meta ? meta.start : 0;
}
```

### 1.4 Getter & 导航 API
```ts
get virtualPageCount() {
  return this.virtualPagesState.length || this.totalPages;
}

get currentVirtualPageIndex() {
  if (!this.virtualPagesState.length) return this.currentPageIndex;
  return Math.min(this.currentVirtualIndexState, this.virtualPagesState.length - 1);
}

get currentVirtualPage() {
  return this.virtualPagesState[this.currentVirtualPageIndex] ?? null;
}

async stepVirtual(delta: number) {
  if (!delta || !this.virtualPagesState.length) return this.currentVirtualPageIndex;
  const target = clamp(this.currentVirtualPageIndex + delta, 0, this.virtualPagesState.length - 1);
  const virtual = this.virtualPagesState[target];
  if (!virtual) return this.currentVirtualPageIndex;

  if (this.state.currentBook?.currentPage !== virtual.pageIndex) {
    await this.navigateToPage(virtual.pageIndex, { virtualSlice: virtual.slice });
  } else {
    this.currentVirtualIndexState = target;
  }
  return this.currentVirtualPageIndex;
}
```
配套：`goToVirtualPage()`、`nextVirtualPage(step)`、`previousVirtualPage(step)`、`setVirtualIndexForPage()`、`findVirtualIndex()`。

### 1.5 与现有 API 对齐
- `navigateToPage(index, { virtualSlice })`：成功后调用 `setVirtualIndexForPage(index, virtualSlice)`。
- `nextPage()` / `previousPage()` 内部改为 `return await this.stepVirtual(±1)`（兼容 step 参数供双页调用）。
- `updatePageDimensions()` 成功写入宽高后执行 `rebuildVirtualPages()`，确保尺寸变化驱动拆分判定。
- `syncAppStateBookSlice()` 计算 `viewer.pageWindow` 时改用虚拟索引与虚拟总数。

## 2. 查看器主逻辑（`src/lib/components/viewer/ImageViewer.svelte`）

### 2.1 翻页与输入
- `handleNextPage/handlePreviousPage`：根据 `$viewerState.viewMode` 计算逻辑步长（单页=1，双页=2），结合阅读方向调用 `bookStore.stepVirtual(step)`。
- `handlePageLeft/handlePageRight` 以及滚轮/键盘命令同理，通过虚拟索引控制。`bookStore.canNextPage` 等判断条件改为比较 `currentVirtualPageIndex` 与 `virtualPageCount - 1`。

### 2.2 当前页面 & 预加载
```ts
const activeVirtual = bookStore.currentVirtualPage;
const realPageIndex = activeVirtual?.pageIndex ?? bookStore.currentPageIndex;
preloadManager.loadImageAt(realPageIndex);
```
- Panorama / 比较模式 / Upscale 依旧使用真实页索引，但来源统一通过 `activeVirtual`。
- `preloadManager` 需要新增 API：根据虚拟索引范围计算真实页集合，交给 `imageLoader`（参考第 4 节）。

### 2.3 自动旋转
```ts
import { computeAutoRotateAngle } from '$lib/utils/pageLayout';

$effect(() => {
  const dims = currentImageDimensions;
  const mode = settings.view.autoRotate?.mode ?? 'none';
  const autoAngle = computeAutoRotateAngle(mode, dims);
  autoRotationAngle.set(autoAngle ?? 0); // autoRotationAngle 可为本地 state
});
```
- `rotationAngle` 最终值 = `manualRotationAngle + autoRotationAngle`。视具体 store 结构，可在 `rotationAngle` store 内合并，或在 `ImageViewer` 将 auto offset 加在传入 Display 之前。

### 2.4 传递虚拟片段信息
```svelte
<ImageViewerDisplay
  {imageData}
  {imageData2}
  viewMode={$viewerState.viewMode}
  rotationAngle={effectiveRotation}
  currentVirtualSlice={activeVirtual?.slice ?? 'full'}
  currentVirtualIsSplit={Boolean(activeVirtual?.isSplit)}
  treatHorizontalAsDoublePage={settings.view.pageLayout?.treatHorizontalAsDoublePage ?? false}
/>
```

## 3. 图像展示层（`src/lib/components/viewer/flow/ImageViewerDisplay.svelte`）

### 3.1 新增 props
```ts
let {
  currentVirtualSlice = 'full',
  currentVirtualIsSplit = false,
  treatHorizontalAsDoublePage = false,
  // ...existing props
} = $props();
```

### 3.2 双页模式逻辑调整
```svelte
{:else if viewMode === 'double'}
  {#if currentVirtualIsSplit && treatHorizontalAsDoublePage}
    <div class="flex items-center gap-4">
      {#if (currentVirtualSlice === 'right') === (readingDirection === 'right-to-left')}
        <div class="flex-1" />
        <img src={currentSrc(upscaledImageData, imageData) ?? ''} ... />
      {:else}
        <img src={currentSrc(upscaledImageData, imageData) ?? ''} ... />
        <div class="flex-1" />
      {/if}
    </div>
  {:else}
    <!-- 原有双页渲染 -->
  {/if}
```
- 当拆分页只展示半张图时，另一侧用空 div 占位保持排版。

## 4. 预加载 & Loader（`imageLoader.ts` / `preloadManager.svelte.ts`）

### 4.1 PreloadManager 接入虚拟索引
- 新增 `resolveVirtualRange(centerVirtualIndex: number, radius: number)`：
```ts
function resolveVirtualRange(center: number, radius: number) {
  const targets = new Set<number>();
  for (let offset = -radius; offset <= radius; offset++) {
    const virtual = bookStore.getVirtualPageInfo(center + offset);
    if (virtual) targets.add(virtual.pageIndex);
  }
  return [...targets].sort((a, b) => a - b);
}
```
- `loadCurrentImage()`、`preloadAround()` 调用 `resolveVirtualRange()`，将去重后的真实页索引传给 `imageLoader.load(pageIndex)`。

### 4.2 imageLoader 兼容
- Loader 本身使用真实页索引，无需感知虚拟页；但为避免同一真实页被重复请求，可在 `preloadManager` 层面排重。
- 当 `currentVirtualIsSplit` 时，`imageData`/`imageData2` 都指向同一真实页 Blob，按 slice 排列即可。

## 5. UI 展示（TopToolbar / StatusBar / ProgressBar 等）

- 全部页码显示改用 `bookStore.currentVirtualPageIndex + 1`、`bookStore.virtualPageCount`。
- 进度条百分比也基于虚拟总数，确保拆分页的阅读进度精准。

```svelte
<span>
  {bookStore.currentVirtualPageIndex + 1} / {bookStore.virtualPageCount}
</span>
```

## 6. 自动旋转设置联动
- 设置项已存在：`settings.view.autoRotate.mode`。
- `computeAutoRotateAngle()` 返回值叠加在 viewer 渲染前。
- 若用户手动旋转，则更新 `manualRotationAngle`，但不覆盖 auto 部分。

## 7. 测试建议
1. **分割开关**：同一本书在 `splitHorizontalPages` on/off 下，虚拟页数、翻页顺序应不同。
2. **双页合并**：打开 `treatHorizontalAsDoublePage` 时，横向页在双页模式中独占一屏。
3. **阅读方向**：左开/右开下翻页顺序正确，且拆分后的左右半页匹配阅读方向。
4. **自动旋转**：切换 `autoRotate` 模式观察角度变化，并验证 forced 模式始终生效。
5. **预加载**：翻页后仍能立即展示图像，说明 loader/preload 使用真实页索引无误。

---
以上方案与代码片段可直接套入当前工程；如需我进一步代为修改源码，请告知优先顺序。
