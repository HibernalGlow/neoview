# NeoView Tauri 性能彻底优化方案

## 目标

本方案针对两个核心问题：

1. 翻页时主图会短暂发黑或闪空。
2. 当前图片加载架构存在重复缓存、重复解码、重复过渡和过多状态源，整体性能浪费明显。

目标不是做局部补丁，而是把阅读器主链路收敛为一条清晰、可度量、可维护的高性能路径。

## 当前架构结论

当前实际阅读主链路不是旧的 `pageStore`，而是：

- `src/lib/stackview/StackView.svelte`
- `src/lib/stackview/stores/imageStore.svelte.ts`
- `src/lib/stackview/utils/stackImageLoader.ts`
- `src/lib/components/viewer/flow/imageLoaderCore.ts`
- `src/lib/stackview/components/FrameImage.svelte`
- `src/lib/stackview/layers/CurrentFrameLayer.svelte`

同时项目里还并存几套历史方案：

- `pageStore + pageManager`
- `viewer/flow/*`
- `stackview/*`
- `bitmapCache`
- `preDecodeCache`
- `renderQueue`

这导致“能跑”的链路和“还留着但未完全退场”的链路叠在一起，代码量大、状态多、排障困难。

## 根因诊断

### 1. 黑屏/闪空的直接原因

#### 1.1 当前帧数据依赖 `currentUrl`，而不是“旧图保留直到新图 ready”

`StackView.svelte` 中当前帧的构建逻辑是：

- `currentFrameData` 在 `!currentUrl` 时直接返回 `emptyFrame`
- 见 `src/lib/stackview/StackView.svelte:564-610`

这意味着一旦 `currentUrl` 还没就绪，当前层就可能直接没有图，UI 只能显示背景层。

#### 1.2 `FrameImage.svelte` 自己又做了一次延迟切换

`FrameImage.svelte` 内部存在 `settledUrl` 机制：

- 非预解码命中时默认延迟 `60ms` 才切换到新图
- 见 `src/lib/stackview/components/FrameImage.svelte:146-177`

这会把“已经可显示”的时机继续往后推，直接放大翻页闪空概率。

#### 1.3 `img` 模式下仍然带缩略图占位 + 主图淡入

`FrameImage.svelte` 里：

- `showThumbnail` 初始为 `true`
- 主图 `onload` 后才隐藏缩略图
- fade 模式下 `frame-image.loading { opacity: 0; }`
- 见 `src/lib/stackview/components/FrameImage.svelte:179-188, 227-243, 275-280`

也就是说翻页过程可能变成：

1. 旧图消失
2. 缩略图/背景出现
3. 主图延迟挂载
4. 主图再淡入

这正是“黑一下才出图”的典型来源。

#### 1.4 外层翻页动画和内层图片淡入叠加

`CurrentFrameLayer.svelte` 已经提供了完整的页面过渡动画：

- fade / slide / zoom / flip
- 见 `src/lib/stackview/layers/CurrentFrameLayer.svelte`

但 `FrameImage.svelte` 又自己做了一层图像级淡入。两层动画叠加后，视觉上容易出现：

- 过渡时间被拉长
- 透明帧叠加
- 旧图已经离场，新图仍未完全显示

### 2. 翻页性能浪费的直接原因

#### 2.1 同一页存在多层缓存，职责重叠

当前至少有这些缓存：

- `ImageLoaderCore.blobCache`
- `stackImageLoader.dimensionsCache`
- `preDecodeCache`
- `bitmapCache`
- `imagePool` 的同步包装
- 背景色缓存
- 缩放比例缓存

其中真正主链正在使用的是：

- `ImageLoaderCore.blobCache`
- `stackImageLoader.dimensionsCache`
- `preDecodeCache`

而 `bitmapCache` 目前没有成为主渲染通道的一部分，属于半接入状态。

#### 2.2 `preDecodeCache` 用 `HTMLImageElement.decode()`，不是最终渲染形态

`preDecodeCache` 缓存的是：

- `HTMLImageElement`
- `url`
- 宽高

见 `src/lib/stackview/stores/preDecodeCache.svelte.ts`

但真正渲染有两种模式：

- `img`
- `canvas`

这意味着：

- `img` 模式下它只是“浏览器可能已经解码过”
- `canvas` 模式下仍然不是最优中间产物

真正适合统一渲染的缓存形态应该是：

- `ImageBitmap`
- 或协议 URL 直接交给浏览器解码，但只保留一层

#### 2.3 当前主链仍可能重复取尺寸、重复算背景色、重复预加载

`stackImageLoader.loadPage()` 在 `core.loadPage()` 之后，还会补做：

- `getImageDimensions(blob)`
- `getImageDimensionsFromUrl(url)`
- `computeAutoBackgroundColor(url)`

见 `src/lib/stackview/utils/stackImageLoader.ts:231-319`

即使这些结果部分可缓存，链路仍偏长，且前后职责分散。

#### 2.4 旧预加载逻辑和新分层预加载逻辑并存

在 `imageStore.loadCurrentPage()` 里同时存在：

- `stackImageLoader.triggerLayeredPreload(currentIndex)`
- `imagePool.preloadRange(currentIndex, 4)`

见 `src/lib/stackview/stores/imageStore.svelte.ts:197-200, 222-224, 270-273, 302-303`

这说明预加载至少有两套策略同时跑，容易造成：

- 重复任务
- 重复解码
- 主线程和 IO 争抢

### 3. 架构问题的本质

当前问题不是“某个函数慢”，而是三件事叠加：

1. 状态源过多
2. 缓存层过多
3. 过渡层过多

对于阅读器这类高频切页场景，任何一层多余逻辑都会被持续放大。

## 总体优化原则

### 原则 1

翻页时永远保留上一帧，直到下一帧 ready。

不要出现“先把旧图撤掉，再等新图”的状态。

### 原则 2

只保留一条主渲染通道。

建议收敛为：

- `Blob/Protocol -> ImageBitmap -> Canvas`

或保守版：

- `Blob/Protocol -> img`

但不能两条都长期并行维护。

### 原则 3

一类信息只保留一个权威来源。

例如：

- 页图二进制缓存：1 层
- 页图尺寸缓存：1 层
- 预解码缓存：1 层
- 预加载调度器：1 套

### 原则 4

主图优先级绝对高于缩略图、背景色、超分预取、周边预加载。

所有后台任务都必须让路给当前页首帧。

## 建议的最终目标架构

### 推荐方案：Canvas 单通道

建议长期收敛到：

1. `bookStore` 只负责页码和书本状态，不负责图像资源生命周期。
2. `stackImageLoader` 成为唯一页面资源协调器。
3. `ImageLoaderCore` 负责底层 IO 和 Blob 缓存。
4. `bitmapCache` 升级为唯一预解码缓存。
5. `FrameImage` 统一使用 `CanvasImage` 渲染。
6. `preDecodeCache` 退役，或仅作为兼容层过渡使用。

理由：

- `CanvasImage` 已经具备“先绘新图再释放旧 bitmap”的正确方向。
- `ImageBitmap` 更适合作为稳定、可控的预解码结果。
- 可以明确把“解码”和“绘制”从 DOM `<img>` 行为里拿出来，减少浏览器黑盒因素。

### 保守方案：先保留 img，但先做单通道与无闪屏

如果短期不想全面切 Canvas，则先做到：

1. `img` 模式作为唯一渲染模式。
2. 取消 `CanvasImage` 路径的默认使用。
3. 去掉 `settledUrl` 延迟。
4. 去掉图片级 fade。
5. 保留旧图直到新图 `onload/decode` 完成。

这能先把“黑一下”问题解决到可接受水平。

## 分阶段改造方案

## Phase 0：先打点，拿到真实数据

目标：先确认当前链路各阶段耗时，不再靠感觉改。

新增指标：

- `flip_input_ms`
- `page_state_commit_ms`
- `resource_ready_ms`
- `decode_ready_ms`
- `first_paint_ms`
- `old_frame_retained_ms`
- `preload_queue_depth`
- `main_thread_long_task_count`

验收：

- 能按页打印每次翻页的完整时间线
- 能区分 cache hit / blob hit / decoded hit / cold load

## Phase 1：立即止血，解决黑屏

这是优先级最高的一阶段，建议先做。

### 1.1 移除 `FrameImage.svelte` 的 60ms `settledUrl` 延迟

现状：

- `src/lib/stackview/components/FrameImage.svelte:162-172`

改法：

- 默认 `settleDelay = 0`
- 如确实需要节流，只允许在后台预载组件中使用，不允许用于当前帧主图

### 1.2 禁用图片级 fade，只保留页面层过渡

现状：

- `shouldFadeOnLoad`
- `frame-image.loading { opacity: 0 }`

改法：

- 当前页主图禁止图片级淡入
- 只保留 `CurrentFrameLayer` 的 page transition

### 1.3 当前页切换时保留旧帧，直到新帧 ready

当前问题：

- `currentUrl` 一旦还没就绪，`currentFrameData` 可能变空

改法：

- 在 `imageStore` 中增加：
  - `displayedUrl`
  - `pendingUrl`
  - `displayedFrameToken`
- 新页 ready 前不覆盖 `displayedUrl`
- 新页完成后原子切换

目标效果：

- 永远是“旧图停留 -> 新图出现”
- 不能出现“空层 -> 新图”

### 1.4 缩略图占位不能覆盖当前帧主图切换

改法：

- 当前页已有旧图时，不显示缩略图占位
- 缩略图只用于首次打开书本、完全冷启动、或明显慢路径 fallback

## Phase 2：收敛缓存体系

### 2.1 明确保留的缓存

建议最终只保留：

- `BlobCache`：原始资源缓存
- `BitmapCache`：解码后缓存
- `DimensionsCache`：尺寸缓存

其余合并或退役：

- `preDecodeCache` 逐步退役
- `imagePool` 保留为轻量 facade，不再拥有自己的逻辑
- `backgroundColorCache` 保留，但改为后台低优先级

### 2.2 把 `preDecodeCache` 从 `HTMLImageElement` 改为 `ImageBitmap`

如果不直接退役，则至少要改成：

- 解码结果缓存 `ImageBitmap`
- 不再缓存 `HTMLImageElement`

原因：

- `img.decode()` 不是最终渲染资产
- `ImageBitmap` 更适合 Canvas 主通道
- 内存与释放行为更可控

### 2.3 `bitmapCache` 成为唯一预解码层

当前 `bitmapCache` 已存在，但没成为主链。

建议：

- `stackImageLoader.preloadWithDecode()` 改走 `bitmapCache`
- `CanvasImage` 优先从 `bitmapCache` 取
- 命中后直接绘制，不再重新 decode

## Phase 3：收敛加载和调度

### 3.1 只保留一套预加载调度器

当前并存：

- `triggerLayeredPreload`
- `preloadRange`

建议：

- 保留 `renderQueue`
- 移除 `imagePool.preloadRange(currentIndex, 4)` 这种旧式补刀逻辑

### 3.2 任务优先级重排

优先级必须固定为：

1. 当前页主图资源
2. 当前页主图解码
3. 双页模式第二张图
4. 下一页
5. 上一页
6. 缩略图
7. 背景色分析
8. 超分预取

### 3.3 所有后台任务必须可取消

要求：

- 页码变化后，上一页未完成的非关键任务立即取消
- 切书后所有旧书任务必须失效
- `renderQueue`、背景色、超分预载都要带 token/cancel

## Phase 4：统一渲染模式

### 4.1 默认切到 Canvas 主渲染

建议：

- 设置层面把默认渲染模式切到 `canvas`
- `img` 模式只保留为兼容调试模式

### 4.2 当前帧渲染流程改成“双缓冲”

推荐实现：

1. 后台加载并解码新页 bitmap
2. 离屏或隐藏 canvas 完成绘制
3. 一次性切换前台 canvas
4. 再释放旧 bitmap

这能彻底避免翻页闪黑。

### 4.3 双页模式合成逻辑前移

现在双页第二张图经常晚于第一张到达，容易导致布局抖动。

建议：

- `double` 模式下，frame ready 的定义应是：
  - 单图页：主图 ready
  - 真双页：两图都 ready，或先以明确占位尺寸合成

不能让 frame 在“半成品 URL 状态”下多次重构。

## Phase 5：删除历史分叉

这是必须做的，否则半年后还会回到同样问题。

### 5.1 明确废弃模块

梳理并标记：

- 旧 `pageStore`
- 旧 `viewer/flow` 中仅用于历史实验的路径
- `preDecodeCache` 旧接口
- 未接入主链的 bitmap 逻辑

### 5.2 给主链加边界

建议约束：

- `StackView` 只能通过 `imageStore` 取图
- `imageStore` 只能通过 `stackImageLoader` 协调资源
- `stackImageLoader` 只能通过一个底层 loader 取数据

任何新功能都不能绕开这条边界直接加一套缓存。

## 推荐执行顺序

### 第一周

1. 打点
2. 去掉 `settledUrl` 延迟
3. 去掉图片级 fade
4. 保留旧帧直到新帧 ready

预期收益：

- 黑屏问题基本消失
- 翻页主观感受大幅改善

### 第二周

1. 干掉重复 `preloadRange`
2. 统一预加载调度器
3. 统一取消机制
4. 降低背景色和缩略图优先级

预期收益：

- 主线程抢占减少
- 快速连续翻页更加稳定

### 第三周到第四周

1. 把 `bitmapCache` 接为主预解码层
2. `CanvasImage` 升级为主渲染
3. `preDecodeCache` 退役
4. 清理旧链路

预期收益：

- 真正完成架构收敛
- 后续做超分、双页、全景都更稳

## 关键代码改造清单

### 需要优先改的文件

- `src/lib/stackview/components/FrameImage.svelte`
- `src/lib/stackview/stores/imageStore.svelte.ts`
- `src/lib/stackview/StackView.svelte`
- `src/lib/stackview/utils/stackImageLoader.ts`
- `src/lib/stackview/stores/renderQueue.ts`
- `src/lib/stackview/components/CanvasImage.svelte`
- `src/lib/stackview/stores/bitmapCache.svelte.ts`

### 需要逐步退役或降级的文件

- `src/lib/stackview/stores/preDecodeCache.svelte.ts`
- `src/lib/stackview/stores/imagePool.svelte.ts`
- `src/lib/components/viewer/flow/*` 中未被主链真实依赖的分支
- `src/lib/stores/pageStore.svelte.ts`

## 验收指标

优化完成后，建议以以下指标验收：

### 主观体验

- 快速翻页时不再出现黑帧
- 连续翻页时画面稳定，不抖、不闪、不先糊后清
- 双页模式下第二张图不再明显迟到

### 客观指标

- 热缓存翻页首帧时间 `< 16ms`
- Blob 缓存命中翻页首帧时间 `< 40ms`
- 冷加载翻页首帧时间 `< 120ms`
- 快速连续翻页时主线程 long task 数明显下降
- 内存峰值可控且不会无限上涨

## 最小可行落地建议

如果只能先做一轮，我建议先做这 4 项：

1. 删除 `FrameImage.svelte` 的 `60ms settledUrl` 延迟。
2. 禁用图片级 fade，只保留页面层动画。
3. 在 `imageStore` 中引入“旧帧保留直到新帧 ready”的双缓冲状态。
4. 移除 `imagePool.preloadRange(currentIndex, 4)`，只保留一套分层预加载。

这 4 项完成后，黑屏问题大概率就会从“明显可感知”降到“基本消失”，同时也为后续彻底收敛架构打好基础。

## 结论

当前性能问题的本质不是 Tauri 本身慢，而是阅读器链路里存在：

- 资源切换时机错误
- 多层缓存重叠
- 多套加载器并存
- 多层动画叠加

短期先修“切页不黑”，长期必须把渲染通道、预解码通道、预加载调度器都收敛成单一主线。只有这样，后续继续加双页、全景、超分、动图时性能才不会继续塌。
