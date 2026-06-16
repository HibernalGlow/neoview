# NeoView Reader 后端主导迁移执行简报

本文档不是总方案复述，而是给后续实现者直接执行的迁移约束。

配套总方案见：[TAURI_PERFORMANCE_OPTIMIZATION_PLAN.md](/d:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/docs/TAURI_PERFORMANCE_OPTIMIZATION_PLAN.md)。

## 1. 目标

下一阶段目标不是继续修补前端加载链，而是把阅读器收敛为：

- 前端只做 UI、输入、动画、显示图像。
- 后端负责页内容构建、缓存、预加载、解码、尺寸、资源就绪判断。
- 主链路只有一套。
- 被替代的旧系统必须删除，不允许新老并存。

这份文档的核心要求只有一句话：

> 前端除了 UI 和显示图，别的都不要干。

## 2. 硬约束

后续实现必须同时满足下面 8 条，缺一不可。

1. `StackView` 到最终图像显示只能经过一条主链。
2. 前端不得再拥有独立的预加载调度系统。
3. 前端不得再拥有独立的预解码缓存系统。
4. 前端不得再拥有独立的尺寸探测主流程。
5. 前端不得再拥有独立的背景色分析主流程。
6. 当前页资源 ready 的定义必须由后端给出，不再由前端多个组件各自猜测。
7. 新后端链路接入后，旧前端资源链必须同步摘除并删除。
8. 任何“先保留旧系统备用，后面再删”的提交，都视为未完成。

## 3. 当前仓库里的真实情况

当前阅读热路径主要在这些文件：

- [src/lib/stackview/StackView.svelte](/d:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/src/lib/stackview/StackView.svelte)
- [src/lib/stackview/stores/imageStore.svelte.ts](/d:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/src/lib/stackview/stores/imageStore.svelte.ts)
- [src/lib/stackview/utils/stackImageLoader.ts](/d:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/src/lib/stackview/utils/stackImageLoader.ts)
- [src/lib/components/viewer/flow/imageLoaderCore.ts](/d:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/src/lib/components/viewer/flow/imageLoaderCore.ts)
- [src/lib/stackview/components/FrameImage.svelte](/d:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/src/lib/stackview/components/FrameImage.svelte)
- [src/lib/stackview/layers/CurrentFrameLayer.svelte](/d:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/src/lib/stackview/layers/CurrentFrameLayer.svelte)

同时又并存多套历史系统或半退役系统：

- [src/lib/stores/pageStore.svelte.ts](/d:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/src/lib/stores/pageStore.svelte.ts)
- [src/lib/components/viewer/flow](/d:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/src/lib/components/viewer/flow)
- [src/lib/stackview/stores/preDecodeCache.svelte.ts](/d:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/src/lib/stackview/stores/preDecodeCache.svelte.ts)
- [src/lib/stackview/stores/renderQueue.ts](/d:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/src/lib/stackview/stores/renderQueue.ts)
- [src/lib/stackview/stores/imagePool.svelte.ts](/d:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/src/lib/stackview/stores/imagePool.svelte.ts)
- [src/lib/stackview/stores/bitmapCache.svelte.ts](/d:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/src/lib/stackview/stores/bitmapCache.svelte.ts)

现状说明：

- `FrameImage.svelte` 和 `imageStore.svelte.ts` 里已经有一部分 Phase 1 止血修复。
- 但整体设计仍然是“前端承担过多资源责任”，这正是下一阶段必须推倒重整的部分。

## 4. 参考项目真正该学什么

### 4.1 参考 `ref/NeeView`

应该学习的是后端职责划分，不是界面。

当前仓库里已经有可利用基础：

- [src-tauri/src/lib.rs](/d:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/src-tauri/src/lib.rs)
- [src-tauri/src/core/page_manager/mod.rs](/d:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/src-tauri/src/core/page_manager/mod.rs)

已经存在的后端能力：

- Custom Protocol
- `PageContentManager`
- `JobEngine`
- `MemoryPool`
- 书籍切换时的任务取消和缓存清理基础

这说明仓库并不是“没有后端基础”，而是“前端历史链路还没彻底交权”。

### 4.2 参考 `ref/OpenComic`

应该学习的是单主链，而不是实现细节逐行照抄。

关键参考点：

- [ref/OpenComic/scripts/reading.js](/d:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/ref/OpenComic/scripts/reading.js)
- [ref/OpenComic/scripts/reading/render.js](/d:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/ref/OpenComic/scripts/reading/render.js)
- [ref/OpenComic/scripts/threads.js](/d:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/ref/OpenComic/scripts/threads.js)
- [ref/OpenComic/templates/reading.content.right.images.html](/d:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/ref/OpenComic/templates/reading.content.right.images.html)

真正值得借鉴的是：

- 布局先确定，再填图。
- 队列只有一套。
- 旧队列会被清空，不会长时间并存。
- 显示层不自己维护多套长期缓存系统。

## 5. 目标架构

## 5.1 前端允许做的事

前端只允许保留这些职责：

- 阅读器 UI 状态
- 输入处理
- 手势和翻页动画
- frame 布局显示
- 图像显示组件
- 叠加层显示
- 调试面板显示

## 5.2 前端禁止再做的事

前端禁止继续承担这些职责：

- 资源预加载调度
- 资源优先级决策
- 页面 ready 判定
- 主缓存淘汰策略
- 预解码缓存生命周期
- 尺寸探测主流程
- 背景色分析主流程
- 多套 URL/Blob/Bitmap 切换策略

## 5.3 后端必须接管的事

后端必须成为下面这些职责的唯一权威来源：

- 当前页和邻近页资源调度
- 书籍级取消 token
- Blob 或协议资源缓存
- 解码产物缓存
- 尺寸结果
- 背景色结果
- 双页合成所需元数据
- frame ready 判定
- 邻近页预加载窗口

## 6. 推荐的最终主链

建议最终收敛为：

1. 前端告知当前阅读上下文。
2. 后端根据页码、模式、视口构建 `FrameSnapshot`。
3. 后端通过 `neoview://` 或等价协议暴露当前 frame 所需资源。
4. 前端只接收 `FrameSnapshot` 并显示。
5. 前端在新 frame ready 之前继续显示旧 frame。
6. 新 frame ready 后一次性切换显示。

建议定义统一后端输出模型：

```ts
type FrameSnapshot = {
  frameId: string;
  bookId: string;
  pageMode: 'single' | 'double' | 'panorama';
  primaryPageIndices: number[];
  displayItems: Array<{
    pageIndex: number;
    src: string;
    width: number;
    height: number;
    backgroundColor?: string | null;
  }>;
  ready: boolean;
  transitionKey: string;
};
```

约束：

- `ready=false` 时前端不能清空旧 frame。
- `ready=true` 才允许切换。
- 前端不再自己拼接“也许能显示”的 URL 状态。

## 7. 模块边界重划

## 7.1 可以保留，但必须瘦身的前端模块

- `StackView.svelte`
  - 只保留阅读布局、层切换、交互。
- `imageStore.svelte.ts`
  - 只保留 display state，不保留资源策略。
- `FrameImage.svelte`
  - 只保留图像显示。
- `CanvasImage.svelte`
  - 只保留绘制，不保留资源调度。
- `CurrentFrameLayer.svelte`
  - 只保留页面过渡和当前帧展示。

## 7.2 必须后移到后端的职责

这些职责必须逐步移出前端：

- `stackImageLoader.ts` 中的预加载、预解码、尺寸、背景色协调
- `imageLoaderCore.ts` 中作为前端资源总入口的角色
- `renderQueue.ts` 中的前端优先级调度
- `preDecodeCache.svelte.ts` 中的前端预解码体系
- `imagePool.svelte.ts` 中的缓存和调度主体逻辑

## 7.3 后端建议承接点

建议以后端这些模块为承接中心：

- `src-tauri/src/core/page_manager/*`
- `src-tauri/src/core/custom_protocol/*`
- `src-tauri/src/core/job_engine/*`
- `src-tauri/src/core/page_manager/memory_pool/*`

如果后端接口缺字段，应补后端接口，不应反向在前端补一个新 store 兜底。

## 8. 必须删除的旧系统

下面这些内容不能作为“长期备用系统”留在仓库里。

### 第一批必须从热路径摘掉

- `src/lib/stackview/stores/preDecodeCache.svelte.ts`
- `src/lib/stackview/stores/renderQueue.ts`
- `src/lib/stackview/stores/imagePool.svelte.ts` 中的调度逻辑
- `src/lib/components/viewer/flow/imageLoaderCore.ts` 的前端主入口角色
- `src/lib/stackview/utils/stackImageLoader.ts` 中的前端资源协调职责

### 第二批必须删除或彻底降为兼容壳

- `src/lib/stores/pageStore.svelte.ts`
- `src/lib/components/viewer/flow/*` 中与阅读主链重复的逻辑
- `src/lib/stackview/stores/bitmapCache.svelte.ts` 中未成为唯一主链的分叉实现

### 第三批需要跟着删的周边引用

重点检查这些调试/卡片组件，避免它们把旧系统继续拴在项目里：

- `src/lib/cards/info/PreloadStatusCard.svelte`
- `src/lib/cards/pageList/PageIndexBadge.svelte`
- `src/lib/stackview/stores/upscaleStore.svelte.ts` 中对旧预解码接口的依赖
- `src/lib/stackview/stores/panoramaStore.svelte.ts` 中旧 preload 入口

原则：

- 旧系统不能只是不再调用。
- 旧系统必须从主链断开后继续删除文件、删接口、删调试入口。

## 9. 分阶段执行要求

## Phase A: 建立后端唯一 frame 接口

目标：

- 后端能返回统一 `FrameSnapshot`
- 前端不再直接拼装页面资源状态

要求：

- `imageStore` 只维护当前显示的 `FrameSnapshot`
- 允许保留旧显示组件，但不允许保留旧资源决策

完成标志：

- 前端切页时只发“我要第 N 页”
- 后端返回“这是当前 frame”

## Phase B: 切协议主链

目标：

- 当前页显示资源统一走 `neoview://` 或等价后端协议路径

要求：

- 取消前端多处 Blob/Object URL 生成主流程
- 取消前端自己决定 `preDecodedUrl` / `cachedUrl` / `originalUrl` 的逻辑

完成标志：

- `FrameImage` 接收的是后端给的最终显示资源，不是自己拼出来的多候选 URL

## Phase C: 后端接管预加载与解码

目标：

- 后端成为唯一调度器

要求：

- 只保留一套任务优先级
- 当前页优先级绝对最高
- 切书和翻页都能取消旧任务

完成标志：

- 前端不再有 `renderQueue`
- 前端不再有 `preDecodeCache`
- 前端不再有第二套 preload 窗口

## Phase D: 删除旧系统

目标：

- 彻底清仓，不留半退役系统

要求：

- 先删调用
- 再删导出
- 再删文件
- 再删调试入口

完成标志：

- 搜索旧模块名时，只剩文档或测试

## 10. 给实现者的禁止事项

后续改造过程中，禁止出现下面这些做法：

- 新增一个 `xxxCache2`、`xxxQueue2`、`nextImageLoader` 一类并行系统
- 用“兼容模式”名义长期保留旧热路径
- 后端缺字段时，先在前端再补一层 store
- 把问题继续拆到 `FrameImage`、`CanvasImage`、`imageStore` 各自补丁
- 保留老调试卡片继续依赖老缓存接口
- 继续让前端决定资源 ready 与否

如果实现者发现后端接口不够用，正确做法只有一个：

- 补后端接口，不补前端新状态机

## 11. 交付验收命令

下面这些命令是删旧验收的一部分。

### 11.1 搜旧系统是否仍在热路径

```powershell
rg -n "preDecodeCache|renderQueue|imagePool\.preloadRange|triggerLayeredPreload|getPreDecodedUrl" src
```

要求：

- 最终结果只能剩测试、注释、迁移文档。

```powershell
rg -n "pageStore|imageLoaderCore|stackImageLoader" src
```

要求：

- `pageStore` 不再出现在阅读主链。
- `imageLoaderCore` 和 `stackImageLoader` 不再承担前端资源总控职责。

```powershell
rg -n "PreloadStatusCard|PageIndexBadge" src
```

要求：

- 调试卡片如果继续存在，不能再依赖旧缓存体系。

### 11.2 验证构建和类型

```powershell
pnpm run check
```

要求：

- 不能靠注释掉功能硬过。

### 11.3 验证调用图收口

实现者应人工确认 `StackView` 到显示图像只剩下面这条链：

```text
StackView
  -> imageStore(display-only)
  -> backend frame api
  -> protocol url / final display asset
  -> FrameImage / CanvasImage
```

如果还能追到：

- `preDecodeCache`
- `renderQueue`
- `imagePool.preloadRange`
- `viewer/flow` 平行加载器

则视为迁移失败。

## 12. 建议的文档化要求

实现完成后，提交说明里必须明确写清：

1. 新的唯一主链是什么。
2. 前端还保留了哪些职责。
3. 后端接管了哪些职责。
4. 删掉了哪些旧模块。
5. 哪些组件只是过渡壳，预计何时删除。

如果做不到第 4 条，这次迁移就不算完成。

## 13. 最终完成标准

只有同时满足下面条件，才算这一阶段真正完成：

1. 翻页时不再黑帧或空帧。
2. 前端不再承担资源调度主逻辑。
3. 后端成为唯一资源权威来源。
4. 旧系统已经从主链删除。
5. 搜索仓库时看不到多套阅读资源系统长期并存。

这份文档对应的不是“优化建议”，而是“迁移完成标准”。
