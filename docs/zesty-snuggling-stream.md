# NeoView 性能逼近 NeeView 优化方案

## Context

NeoView 是基于 Tauri 2.10 (Rust + Svelte 5) 的图像查看器，参考了 NeeView (C# WPF) 的架构设计。当前存在若干性能瓶颈导致与 NeeView 的体验差距：base64 IPC 传输开销(+33%)、全分辨率解码浪费、多层缓存冗余(3-5x 内存)、预加载策略简单等。本方案通过 8 个阶段的优化，目标是将翻页延迟、内存占用、滚动流畅度提升至接近 NeeView 的水平。

## 优化阶段总览

| 阶段               | 优先级  | 预估工时 | 预期收益                           |
| ------------------ | ------- | -------- | ---------------------------------- |
| P0: 协议默认切换   | P0 立即 | 2天      | 消除 33% 传输开销，翻页延迟 -30%   |
| P1: 按需分辨率解码 | P1 高   | 2-3天    | 大图内存 -85%，解码 CPU -70%       |
| P2: 缓存层整合     | P1 高   | 2天      | 内存占用 -60~70%                   |
| P3: 渐进式预加载   | P1 高   | 1-2天    | 翻页命中率 +40%                    |
| P4: 缩略图系统整合 | P2 中   | 2天      | 减少代码复杂度，缩略图生成效率提升 |
| P5: mmap I/O 扩展  | P2 中   | 1天      | 大文件读取速度 +20%                |
| P6: DOM 渲染优化   | P3 低   | 1天      | 滚动流畅度提升                     |
| P7: 压缩包索引预建 | P3 低   | 0.5天    | 存档首图加载 -100~300ms            |

---

## P0: 默认切换到 neoview:// 协议 [消除传输瓶颈]

### 问题

当前默认使用 base64 模式通过 Tauri invoke 传输图像数据，base64 编码增加 33% 体积 + 编解码 CPU 消耗。`neoview://` 自定义协议已完整实现（`custom_protocol.rs`）且带有多级缓存（mini_moka LRU、mmap、archive image cache），但未被充分利用。

### 改动文件

**1. `src/lib/stores/pageTransferMode.svelte.ts`**

- 将默认值从 `'base64'` 改为 `'protocol'`
- 添加 localStorage 迁移：已保存 `'binary'` 的用户自动升级到 `'protocol'`

**2. `src/lib/api/pageManager.ts`**

- `gotoPage()` / `getPage()` 在 protocol 模式下不返回 base64 数据，返回 `{ type: 'protocol', url: string }`
- 前端直接使用 `neoview://` URL 作为 `<img src>`

**3. `src/lib/stackview/StackView.svelte`**

- 当前页面 `<img>` 的 src 直接使用 protocol URL
- 移除 base64 解码和 Blob URL 创建逻辑

**4. `src/lib/stackview/stores/imageStore.svelte.ts`**

- `loadImage()` 在 protocol 模式下跳过 base64→Blob 转换
- 保留 `ImageBitmap` 解码用于预计算尺寸（使用 `decodeImageBitmap` 但仅取尺寸后释放）

**5. `src/lib/services/imagePool.ts`**

- protocol 模式下，前端的图片缓存降级为仅缓存元数据（尺寸、缩放比）
- 不再缓存 Blob URL（浏览器 HTTP 缓存 + 协议处理器缓存已足够）

### 验证

- 打开一本书，翻页 20+ 页，观察 DevTools Network 面板中 `neoview://` 请求
- 用 Performance 面板测量翻页延迟（目标：<100ms 感知延迟）
- 确认内存占用（任务管理器）相比之前降低

---

## P1: 服务端按显示分辨率解码 [减少大图开销]

### 问题

当前总是全分辨率解码后发送给前端，浏览器 CSS 缩放显示。8000x6000 图在 1920x1080 视口显示时浪费 ~85% 解码工作和内存。

### 改动文件

**1. `src-tauri/src/core/image_decoder/unified.rs`**

- 给 `decode()` 方法添加 `target_width: Option<u32>, target_height: Option<u32>` 参数
- 当指定目标尺寸时，各后端在解码阶段就缩放到目标大小

**2. `src-tauri/src/core/image_decoder/backends/wic.rs`**

- WIC 原生支持 `decode_and_scale_with_wic(data, target_w, target_h)` —— 已有此函数
- 确认其在 unified decoder 中被正确调用

**3. `src-tauri/src/core/image_decoder/backends/image_crate.rs`**

- `image` crate 的 `resize_to_fill` 或 `thumbnail` 作为 fallback
- 优先使用 Lanczos3 滤镜

**4. `src-tauri/src/core/custom_protocol.rs`** (P0 基础上扩展)

- 协议 URL 支持查询参数：`neoview://image/{book_hash}/{index}?w=1920&h=1080`
- `handle_archive_image()` / `handle_file_image()` 解析 `w`/`h` 参数
- 传递目标尺寸给 unified decoder

**5. `src/lib/stackview/stores/imageStore.svelte.ts`**

- 计算当前视口需要的显示分辨率（考虑 devicePixelRatio 和缩放级别）
- 构造带 `?w=X&h=Y` 的 protocol URL

### 验证

- 打开超大图片（8000x6000+），内存占用应显著降低
- 对比全分辨率 vs 按需解码的视觉质量（Lanczos3 应无明显差异）
- Performance 面板确认解码时间减少

---

## P2: 缓存层整合 [减少内存冗余]

### 问题

同一图像数据可同时存在于 MemoryPool + ImageCache + LruImageCache + BlobRegistry + 前端 imagePool，实际内存占用是原始数据的 3-5 倍。

### 改动文件

**1. `src-tauri/src/core/lru_image_cache.rs` + `src-tauri/src/core/app_context.rs`**

- `LruImageCache` 仅被 `AppContext` 使用，`AppContext` 无任何 Tauri state 引用 —— 确认为死代码
- 删除 `lru_image_cache.rs` 和 `app_context.rs`
- 从 `lib.rs` 移除相关初始化

**2. `src-tauri/src/core/image_cache.rs`**

- 仅服务旧版命令（`image_commands.rs`、`book_commands.rs`），不走 PageContentManager 热路径
- 默认大小从 256MB 降到 64MB，添加 `#[deprecated]` 注释

**3. `src-tauri/src/core/image_loader.rs`**

- `ImageLoader` 默认缓存从 512MB 降到 128MB（同原因：仅服务旧版命令）

**4. `src-tauri/src/core/page_manager/memory_pool.rs`**

- 保持 512MB 默认（这是真正的热路径缓存）
- 已有距离感知驱逐策略 —— 无需改动核心逻辑
- 可选：添加内存压力信号（Windows `GlobalMemoryStatusEx`），系统内存不足时主动缩减

**5. `src/lib/services/imagePool.ts`**

- 全局 imagePool 默认从 512MB 降到 32MB
- protocol 模式下仅作为元数据缓存，不再存储 Blob

**6. `src/lib/stackview/stores/imagePool.svelte.ts`**

- `bitmapCache`：从无限制降到仅缓存当前+下一页 2 个 `ImageBitmap`
- `preDecodeCache`：移除（protocol URL 由浏览器缓存，无需前端预解码）

### 验证

- 打开 100 页漫画压缩包，翻页浏览全部页面
- 任务管理器观察内存峰值，应与 NeeView 打开同文件时接近
- 确认缓存驱逐日志正常（debug 级别日志）

---

## P3: 方向感知渐进式预加载 [提升翻页命中率]

### 问题

当前预加载是简单的 ±5 页批量提交，无阅读方向优先、无内存压力检查、取消逻辑粗糙。

### 改动文件

**1. `src-tauri/src/core/page_manager/mod.rs`**

- 替换 `submit_preload_jobs()` (line 658) 为渐进式预加载：

```
预加载顺序（假设向右阅读）：
  +1(最高优先) → -1 → +2 → -2 → +3 → -3 → +4 → +5

优先级映射：
  +1     → JobPriority::PreloadHigh   (priority 8)
  -1     → JobPriority::PreloadNormal (priority 6)
  +2/+3  → JobPriority::PreloadLow    (priority 4)
  +4/+5  → JobPriority::PreloadIdle   (priority 2)
```

- 每个预加载任务前检查内存压力：
  - MemoryPool 使用率 > 90% 且无可驱逐页面 → 跳过
  - 系统可用内存 < 500MB → 跳过

**2. `src-tauri/src/core/page_manager/book_context.rs`**

- 添加 `progressive_preload_range()` 方法替代现有的 `preload_range()`
- 输入：当前索引、阅读方向、最大范围
- 输出：按方向优先排序的索引列表

**3. `src-tauri/src/core/job_engine/job.rs`**

- 添加 `JobPriority::PreloadHigh`(8)、`PreloadNormal`(6)、`PreloadLow`(4)、`PreloadIdle`(2)
- `cancel_book_preloads()` 方法：仅取消预加载类 Job，保留当前页 Job

**4. `src-tauri/src/core/page_manager/mod.rs`** goto_page() 中

- 大幅跳页时（跳转距离 > PRELOAD_RANGE）取消所有旧范围的预加载
- `self.job_engine.cancel_book_preloads(&book_path).await`

**5. `src/lib/services/preloader.ts`**

- 前端 preloader 与后端预加载配合
- protocol 模式下，前端触发后端预加载（通过 `trigger_preload` IPC），同时让浏览器预取邻居 protocol URL

### 验证

- 连续快速翻页 20 次，观察缓存命中率（debug 日志）
- 大幅跳页（1→50），确认无多余预加载
- 内存压力测试：打开多个大压缩包，确认预加载自动抑制

---

## P4: 缩略图系统整合 [简化架构]

### 问题

存在两套并行的缩略图系统：旧版（ThumbnailState + ThumbnailDb + BlobRegistry）和 V3（ThumbnailServiceV3），功能重叠，维护成本高。

### 改动文件

**1. `src-tauri/src/core/custom_protocol.rs`** `handle_thumbnail()` (line 775)

- 移除旧版 DB fallback（lines 797-819）
- 仅查询 V3：`v3_state.service.lookup_thumbnail(key)`
- 未命中直接返回 404，触发异步生成

**2. `src-tauri/src/commands/thumbnail_commands/`**

- `generation.rs`、`retrieval.rs`、`batch_ops.rs` 内部切换为委托到 V3
- 旧版 `ThumbnailDb` 保留用于存量数据迁移

**3. `src-tauri/src/core/thumbnail_service_v3/cache.rs`**

- 添加延迟批量写入：累积 50 条或 500ms 后一次性 flush SQLite
- 参考 NeeView 的 `DelayAction` 模式

**4. `src-tauri/src/lib.rs`**

- 将 `ThumbnailServiceV3` 初始化为唯一的缩略图服务 state
- 标记 `ThumbnailState` 为 deprecated（保留一个版本以兼容旧数据）

### 验证

- 文件浏览器快速滚动 500+ 缩略图，确认全部由 V3 服务
- 新生成的缩略图正确持久化到 SQLite
- 重启应用后缩略图仍然命中

---

## P5: 扩展 mmap 文件 I/O [加速读取]

### 问题

部分代码仍使用 `std::fs::read()` 同步读取，小文件也没利用 mmap 的零拷贝优势。

### 改动文件

**1. `src-tauri/src/core/page_manager/mod.rs`** `load_page_data()` (line 572)

- `Directory/SingleImage` 分支改用 mmap：

```rust
BookType::Directory | BookType::SingleImage => {
    let data = mmap_cache.get_or_create(Path::new(&page_info.inner_path))
        .map(|mmap| mmap.as_slice().to_vec())?;
    // ...
}
```

- 需要给 PageContentManager 注入 `MmapCache` 引用（构造时传入）

**2. `src-tauri/src/core/image_loader.rs`**

- 大文件阈值从 10MB 降到 1MB
- `DEFAULT_LARGE_FILE_THRESHOLD: u64 = 1 * 1024 * 1024`

**3. `src-tauri/src/core/mmap_archive.rs`** (确认现有实现)

- 确认 `ArchiveManager` 对 >10MB 的压缩包使用 mmap 读取
- 如果未使用，添加 mmap 路径

### 验证

- Process Monitor 观察文件 I/O 模式，确认使用 mmap
- 对比 `fs::read` vs mmap 的加载时间（debug 日志已有计时）

---

## P6: DOM 渲染优化 [提升滚动流畅度]

### 问题

StackView 基于 DOM，翻页时创建/销毁 DOM 元素，未利用 CSS containment 优化。

### 改动文件

**1. `src/lib/stackview/StackView.svelte`** `<style>` 块

```css
.neoview-page-container {
	content-visibility: auto;
	contain-intrinsic-size: auto 500px;
}
.neoview-page-container.active {
	content-visibility: visible;
	will-change: transform;
}
.neoview-page-container.inactive {
	contain: strict;
}
```

**2. `src/lib/stackview/stores/imageStore.svelte.ts`**

- 当前页加载时，预创建 ±1 页的 DOM 骨架（空 `<div>` + 尺寸占位）
- 翻页时直接填充预创建的节点，避免 DOM 创建开销

**3. `src/lib/stackview/layers/CurrentFrameLayer.svelte`**

- 图片的 `will-change: transform` 仅在动画/缩放期间启用
- 缩放/平移结束后通过 `requestIdleCallback` 移除 `will-change`

### 验证

- Chrome DevTools Performance 面板录制翻页操作
- 确认无 Layout Shift（CLS）
- 确认 `content-visibility: auto` 生效（Rendering 面板中可见跳过绘制区域）

---

## P7: 压缩包索引预建 [优化首图加载]

### 问题

协议处理器的压缩包元数据缓存是懒加载的（首次图片请求时才构建）。对大型压缩包，首图加载有 100-300ms 的额外延迟。

### 改动文件

**1. `src-tauri/src/commands/image_data_commands.rs`** (或对应的 pm_open_book 命令)

- 打开压缩包书籍后，立即调用 `protocol_state.get_or_cache_metadata()` 预热缓存
- `try_schedule_archive_prefetch_neighbors()` 已在 protocol handler 中调用，预热后首图直接命中

**2. `src-tauri/src/core/custom_protocol.rs`**

- `get_or_cache_metadata()` (line 348) 已有的缓存逻辑无需修改
- 确认 `list_contents()` 使用了 `rkyv_index` 快速索引

### 验证

- 打开包含 500+ 文件的 CBZ 压缩包
- 测量首张图片显示时间（目标：<200ms）
- 翻页延迟应保持稳定（后续图片均命中缓存）

---

## 风险与缓解

| 风险                                      | 影响 | 缓解措施                                 |
| ----------------------------------------- | ---- | ---------------------------------------- |
| Protocol URL 默认切换导致 base64 用户断链 | 中   | localStorage 迁移逻辑 + 保留 base64 选项 |
| 按需解码输出格式变更                      | 低   | 统一输出 WebP，设置正确 MIME             |
| 缓存合并后旧版命令性能下降                | 低   | 旧版命令非热路径，64MB 足够              |
| 协议缓存 stale（文件变更后未失效）        | 中   | `invalidate_cache` 命令在文件操作后调用  |

## 验证总则

1. **基准测试**：优化前后对同一本书（100页漫画 CBZ + 500图文件夹）测量：
   - 启动到首图时间
   - 连续翻页延迟（P50/P95/P99）
   - 内存峰值
   - 快速滚动缩略图的帧率
2. **对比 NeeView**：在相同机器上对比相同文件的翻页体感
3. **回归检查**：运行现有 Rust 测试（`cargo test`）+ 前端 typecheck（`pnpm check`）
