# 悬停滚动（Hover Pan）问题总结

## 目标
实现悬停滚动功能：鼠标移动到视口边缘时，图片跟随滚动，但图片边缘永远不能进入视口内部（不露出背景）。

---

## 已尝试的方案

### 方案 1：直接使用 transform-origin
**原理**：通过改变 `transform-origin` 来移动缩放中心点，从而实现平移效果。

**实现**：
```css
transform-origin: ${viewPositionX}% ${viewPositionY}%;
transform: scale(${scale});
```

**问题**：
- `viewPositionX/Y` 范围是 0-100，直接用于 `transform-origin` 会导致图片边缘进入视口
- 需要计算安全范围来限制 `transform-origin` 的值

---

### 方案 2：transform-origin + 边界计算（当前方案）
**原理**：计算图片溢出量，限制 `transform-origin` 在安全范围内。

**实现**：
```typescript
// 缩放后的图片尺寸
const scaledWidth = imageSize.width * scale;
const scaledHeight = imageSize.height * scale;

// 计算溢出量（单侧）
const overflowX = (scaledWidth - viewportSize.width) / 2;
const overflowY = (scaledHeight - viewportSize.height) / 2;

if (overflowX > 0) {
  const rangeX = (overflowX / scaledWidth) * 100;
  const minX = 50 - rangeX;
  const maxX = 50 + rangeX;
  // 将 viewPositionX (0-100) 映射到 (minX-maxX)
  safeX = minX + (viewPositionX / 100) * (maxX - minX);
}
```

**问题**：
- 上下滚动范围很小或几乎无法滚动
- 可能是 `imageSize` 或 `scale` 传递不正确
- 边界计算公式可能有误

---

### 方案 3：原生滚动容器（类似全景模式）
**原理**：使用 `overflow: auto` 的容器，通过 `scrollLeft/scrollTop` 控制滚动位置。

**实现**：
```svelte
<div class="scroll-container" bind:this={containerRef}>
  <div class="inner-container" style:transform={transformStyle}>
    <img ... />
  </div>
</div>

$effect(() => {
  const maxScrollX = containerRef.scrollWidth - containerRef.clientWidth;
  containerRef.scrollLeft = (viewPositionX / 100) * maxScrollX;
});
```

**问题**：
- 用户拒绝此方案，要求使用 transform-origin

---

### 方案 4：translate 平移
**原理**：使用 `transform: translate()` 来平移图片。

**实现**：
```typescript
const translateX = (viewPositionX - 50) / 100 * overflowX * 2;
transform: scale(${scale}) translate(${translateX}px, ${translateY}px);
```

**问题**：
- 用户拒绝此方案，要求使用 transform-origin

---

## 当前代码状态

### HoverLayer.svelte
- 使用增量式速度滚动
- 有死区（中心区域不响应）
- 有 `reset()` 方法用于翻页重置
- 输出 `viewPositionX/Y` 范围 0-100

### CurrentFrameLayer.svelte
- 接收 `viewPositionX/Y`、`viewportSize`、`imageSize`、`scale`
- 计算 `safeOrigin` 来限制 transform-origin
- 应用 `transform-origin` 和 `transform: scale()`

### StackView.svelte
- 管理 `viewPositionX/Y` 状态
- 翻页时调用 `hoverLayerRef.reset()` 重置位置
- 传递 `effectiveScale`（包含 modeScale）给 CurrentFrameLayer

---

## 待解决问题

1. **边界计算不正确**：上下滚动范围很小
2. **imageSize 可能不准确**：需要确认 `imageStore.state.dimensions` 是否是正确的图片原始尺寸
3. **scale 计算**：`effectiveScale` vs `manualScale` 的区别
4. **transform-origin 工作原理**：需要更深入理解 transform-origin 与 scale 的交互

---

## 现状再评估（2025-12-01）

### transform-origin 路线存在的根本问题

1. 当前 `CurrentFrameLayer.svelte` 通过 `safeOrigin` 将 0-100 的 `viewPositionXY` 映射到限定区间（`minX/maxX`）（@neoview-tauri/src/lib/stackview/layers/CurrentFrameLayer.svelte#46-92）。该映射假设“控制 transform-origin 即等价于在溢出范围内平移”，但实际上 `transform-origin` 只是改变缩放支点，无法提供线性、可控的平移量，导致上下方向几乎无效。
2. `safeOrigin` 的上下限依赖 `overflow / scaledSize` 比例，当图片与视口尺寸接近时，允许的 origin 区间窄化到几个百分点，鼠标输入被严重压缩，即使 HoverLayer 仍在输出 0-100 范围。
3. HoverLayer 仅检测“是否存在溢出”就立刻输出完整 0-100 范围（@neoview-tauri/src/lib/stackview/layers/HoverLayer.svelte#55-80）。当 vertical 溢出很小但仍被判定为 true 时，CurrentFrameLayer 的压缩映射就导致看起来“几乎不能滚动”。
4. 同时控制 scale 与 origin 让调试变得困难——任何 scale 调整都会改变 origin 映射曲线，HoverLayer 无法得知这一点，所以用户体验一直不稳定。

### 保留容器平移路线但优化实现

既然 transform-origin 难以提供稳定体验，可以直接回到“移动容器”思路，但做得更干净：

1. **拆分缩放与平移职责**：
   - 外层容器负责 `overflow: hidden;`。
   - 内层 `figure`/`div` 始终以 `transform-origin: 50% 50%` 进行 `scale()`；平移由 `translate3d()` 完成。
2. **将 HoverLayer 输出重解释为 [-1, 1] 的归一化偏移**：
   ```ts
   const normalizedX = (viewPositionX - 50) / 50; // -1~1
   const overflowX = Math.max(0, (scaledWidth - viewportSize.width) / 2);
   const offsetX = normalizedX * overflowX; // px
   ```
   offsetY 同理，未溢出时直接置 0。
3. **把 scale 拆分为“模式缩放 × 用户缩放”**，并在 CurrentFrameLayer 内一次性算出 `scaledWidth/Height`，避免 HoverLayer 对尺寸做二次猜测。
4. **容器移动的优势**：
   - 平移范围与溢出量线性相关，鼠标响应不会再被“安全区”压缩。
   - 继续使用 HoverLayer 的速度曲线，无需额外事件。
   - 视觉上等价于动画容器，且实现符合“图片边缘不露背景”的要求。

### 模块化实现建议

1. 在 `CurrentFrameLayer` 内新增派生值：
   ```ts
   const overflow = {
     x: Math.max(0, (scaledWidth - viewport.width) / 2),
     y: Math.max(0, (scaledHeight - viewport.height) / 2),
   };
   const offset = {
     x: overflow.x * ((viewPositionX - 50) / 50),
     y: overflow.y * ((viewPositionY - 50) / 50),
   };
   ```
   然后把 `offset` 通过 `translate3d(${-offset.x}px, ${-offset.y}px, 0)`（注意符号方向）应用到一个内层包裹元素。
2. HoverLayer 仅需知道是否溢出，用 `calculateBounds` 把“输出区间”缩小到存在溢出轴，而不是永远输出 0-100，这样翻页重置后不会再有“看起来卡住”的错觉。
3. 把日志扩展为“offset/overflow/scale”三组数据，方便验证 hover 输入与实际偏移是否一致。

> 若仍要保留 transform-origin，可在容器平移实现稳定后再尝试“将 origin 设为 `50% + offset / scaledWidth * 100`”的同步方案，此时 origin 仅用于补偿微小误差，而不再承担主要滚动责任。

---

## 调试信息

已添加日志输出：
```
[CurrentFrameLayer] safeOrigin: X Y viewPos: X Y overflow: X Y scaled: WxH viewport: WxH
```

需要查看：
1. `overflow` 值是否正确（应该是正数表示图片比视口大）
2. `scaled` 尺寸是否正确
3. `viewport` 尺寸是否正确
4. `safeOrigin` 范围是否合理

---

## 下一步建议

1. **先运行并查看日志**：确认各个值是否正确
2. **检查 imageSize 来源**：确保是图片原始尺寸，不是 CSS 限制后的尺寸
3. **简化测试**：先用固定值测试 transform-origin 的效果
4. **考虑 CSS 布局影响**：`max-width: 100%` 等 CSS 可能影响实际渲染尺寸

5. **优先实现容器平移**：用上面的 offset 方案确认交互体验，再决定是否继续研究 transform-origin
6. **验证 imageSize 来源**：改成在 `onImageLoad` 时记录 `naturalWidth/Height`，统一透传给 HoverLayer 与 CurrentFrameLayer

---

## 小尺寸图片仍无法滚动时的补充方案（多选）

1. **自适应虚拟溢出（Virtual Overflow）**
   - 即使真实尺寸小于视口，也人为添加一个最小缓冲（例如 `virtualOverflow = max(overflow, viewport * 0.05)`）。
   - HoverLayer 仍输出 -1~1 的位置，CurrentFrameLayer 将虚拟溢出转换为 `translate3d`，不会改变 scale 或视图模式。

2. **自动最小缩放阈值**
   - 当检测到 hover 想滚但 `overflow === 0` 时，在 StackView 中临时把 `manualScale` 提升至 `minHoverScale = viewport / image * 1.05`。
   - 只在启用 hover-scroll 且用户真的触发边缘时执行，避免影响普通浏览。

3. **混合模式（Translate + Origin）**
   - 水平仍使用容器平移；垂直无溢出时，将 `safeOrigin` 设为 `50% ± virtualRange`，制造轻微倾斜防止完全静止。
   - Origin 仅承担“补偿”角色，不再决定主体滚动，兼容缩放/视图模式。

4. **拖拽 fallback**
   - 提供快捷键/按钮切换到拖拽模式（按住右键或空格），直接更新 `viewPosition`，不依赖 overflow。
   - 与方案 1/2 组合，可在 UI 上给出状态提示。

> 推荐优先实现方案 1（虚拟溢出），因为它最不干扰缩放与视图模式；方案 2 和 4 作为可选增强，方案 3 用于进一步平滑体验。

---

## 终极方案：拖拽平移 + 悬停模拟拖拽

### 核心思想

**悬停滚动 = 模拟持续拖拽**，与手动拖拽共享同一套平移和边界逻辑。

### 设计目标

1. **统一平移模型**：拖拽和悬停共用 `panOffset`（像素偏移），由 `translate3d` 实现。  
2. **边界限制统一**：无论拖拽还是悬停，都使用相同的边界计算，确保图片边缘不露出背景。  
3. **悬停 = 自动拖拽**：HoverLayer 输出"拖拽方向+速度"，StackView 按帧累加到 `panOffset`。  
4. **简单可控**：只需要维护一个 `panOffset` 状态，翻页/缩放时重置为 0。

### 核心算法

1. **HoverLayer**
   - 输出 `position = { x: -1..1, y: -1..1 }`（将 0-100 映射到 -1/1），并暴露“是否触达边缘”状态。  
   - 仅在某轴存在“可滚动”时才释放该轴速度；判断依据来自 `contentSize > viewportSize` 或 `virtualOverflow > 0`。

2. **StackView**
   - 维护 `displaySize = naturalSize * effectiveScale`。  
   - 计算 `realOverflow = max(0, (displaySize - viewport)/2)`。  
   - 当 HoverLayer 报告“想滚但 realOverflow=0”时，根据配置：  
     1. 注入 `virtualOverflow = viewport * minBufferRatio`；
     2. 或将 `manualScale = max(manualScale, minHoverScale)` 以制造真实溢出。  
   - 将 `overflow = realOverflow || virtualOverflow`、`displaySize`、`viewport` 一次性传入 CurrentFrameLayer。

3. **CurrentFrameLayer**
   - 外层容器：`translate3d(-offset.x, -offset.y, 0)`，offset = overflow * normalizedPosition。  
   - 内层内容：`scale(effectiveScale) rotate(rotation)`，`transform-origin: 50% 50%` 固定。  
   - 记录日志 `[HoverPan] overflow={overflow} offset={offset} viewPos={viewPosition}` 供调试。  
   - 当 `virtualOverflow` 生效时，在 UI 提示“扩展滚动模式”。

4. **拖拽 fallback（可选）**
   - HoverLayer 暂停时允许 GestureLayer 接管：拖拽直接修改 `viewPosition`，与 hover 共享状态。  
   - 右键/空格触发，松开后恢复 hover。

### 落地步骤

1. **类型/数据流**：
   - `HoverLayer` 新增 `contentSize`, `virtualOverflow`, `onEdgeStateChange` props。  
   - `StackView` 统一管理 `displaySize` 与 `overflowState`，翻页或缩放时触发 HoverLayer `reset()`。

2. **算法实现**：
   1. 先实现“容器 translate + 固定 origin”主干（已在试验分支验证）。
   2. 添加 `virtualOverflow` 配置，默认 5% 视口；在 CurrentFrameLayer 中与真实溢出择大。  
   3. 为 HoverLayer 的 `calculateBounds` 传入 `overflow > 0` 的布尔值，避免无意义的轴滚动。  
   4. 可选：在 StackView 中检测 `hoverEdgeReached && overflow===0` 时触发自动最小缩放。

3. **交互提示 & QA**：
   - 新增 HUD/InfoLayer 提示：`Hover Pan: extended mode`。  
   - 编写测试用例/Story：
     1. 大于视口（正常滚动）；
     2. 稍大（验证线性响应）；
     3. 小图（虚拟溢出）；
     4. 双页/不同 orientation；
     5. 手动缩放切换。

4. **配置项**：
   - `hoverScroll.minVirtualOverflowRatio`（默认 0.05）。  
   - `hoverScroll.autoScaleThresholdEnabled`（默认 false）。  
   - `hoverScroll.enableDragFallback`（默认 true）。

### 行动项

1. 将上述算法落地到 `CurrentFrameLayer` / `StackView` / `HoverLayer`，并删除旧 `safeOrigin` 逻辑。  
2. 把 `displaySize`/`overflowState` 写入调试日志，方便与 HoverLayer 对照。  
3. InfoLayer/HUD 增加状态提示。  
4. 根据配置添加设置面板项与 defaults。  
5. 完成后运行 `yarn build` 验证。
