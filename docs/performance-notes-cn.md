# 性能优化笔记（NeoView Tauri 复刻）

## 总览
- 主要瓶颈集中在缩略图链路（请求队列、缓存、后台预热）、大目录加载（一次性拉取 + 排序 + 渲染）、翻页/预取缺少取消与背压，以及后端线程/路径配置的硬编码。
- 目标：避免无界工作队列与内存占用、降低 IPC 与 blob URL 生成、把目录/缩略图/页面加载改为可取消、分批、按可视区优先的流式流程。

## 前端问题与优化方向
1. 缩略图请求无上限：在 [src/lib/stores/thumbnailStoreV3.svelte.ts](src/lib/stores/thumbnailStoreV3.svelte.ts) 中，`pendingPathsSet` + 8ms 节流会把可见区外的大量路径一次性塞进 IPC 请求（动态预取可达 200+ 页），缺少批大小和队列上限。建议：按可见区窗口 + 小预取环（如可见±50），分批（如 64/批）并在目录切换/滚动时丢弃旧批次。
2. 缩略图缓存无淘汰：同文件使用 `SvelteMap`/`Map` 存储 blob URL，没有 LRU/TTL，也未统一 revoke。建议：内存侧增加 LRU（按计数或内存估算），对 `blob:`/`data:` URL 在淘汰时调用 `URL.revokeObjectURL`，优先使用 `neoview://` 协议 URL 以减少 blob 创建。
3. 后台缩略图加载扩散：翻页缩略图服务 [src/lib/services/thumbnailService.ts](src/lib/services/thumbnailService.ts) 的后台循环每 200ms 扩大半径直到全书，未与视口/方向绑定，也未向后端发送取消信号。建议：
   - 拆分「当前视口」与「前视/后视」两条小队列（参考 NeeView view/ahead JobClient），翻页时取消旧队列。
   - 背景半径上限（如 2×屏幕页数）并在停留稳定后再扩圈。
4. 目录缩略图与页面缩略图重复生成：文件浏览缩略图 V3 与翻页缩略图各自生成/缓存，复用仅靠 `getThumbnailUrl`。建议：以 V3 DB/协议为唯一源，页面缩略图优先查 V3 缓存（protocol URL），失败再触发生成。
5. 目录加载一次性拉满：文件列表在 [src/lib/stores/fileBrowser.svelte.ts](src/lib/stores/fileBrowser.svelte.ts) 中使用 `FileSystemAPI.loadDirectorySnapshot` 整包返回并排序，再渲染全部 items/visibleItems。大目录会阻塞主线程和内存。建议：
   - 后端改流式列目录（已有 `directory_stream` 状态可用），前端虚拟列表先渲染首屏，再分批 append。
   - 排序在后端分批完成或使用增量排序；随机排序的种子缓存可保留。
6. 目录缩略图 Map 无上限：`thumbnails: Map<string, string>` 仅在换目录时重置，没有容量或按文件夹范围的分段清理，blob URL 不 revoke。建议：按目录分片 + LRU + revoke；或对协议 URL 不存 blob，直接存 `neoview://`。
7. 页面预取缺少取消：翻页主图在 [src/lib/stackview/stores/imageStore.svelte.ts](src/lib/stackview/stores/imageStore.svelte.ts) 触发 `imagePool.preloadRange`/`stackImageLoader.triggerLayeredPreload`，但快速跳书/跳页时未强制取消旧请求（依赖内部实现）。建议：显式引入可取消 token，切书/切页时中断旧 preload。
8. Protocol 使用不一致：图片读取 [src/lib/components/viewer/flow/imageReader.ts](src/lib/components/viewer/flow/imageReader.ts) 对归档走 `neoview://`，但目录缩略图/部分 UI 仍用 `asset://` 或 blob URL。建议统一能用协议的路径（缩略图、图标、预览）走 `neoview://`，减少 IPC 和 blob 复制。

## 后端问题与优化方向
1. 线程与路径硬编码：在 [src-tauri/src/commands/thumbnail_v3_commands.rs](src-tauri/src/commands/thumbnail_v3_commands.rs) 初始化时，数据库目录默认写死到 `D:\temp\neoview`，线程池与 archive 并发固定为 8/4。改为：使用 app data 路径，线程数基于 `available_parallelism`，并允许用户配置。
2. 目录预热阻塞：同文件的 `preload_directory_thumbnails_v3` 递归 `read_dir` 并收集所有路径后才投递，阻塞命令线程且无早停。改为：
   - 在工作线程/async 任务里流式遍历；
   - 绑定可见区或最大预取数量，支持取消；
   - 当目录变化立即清空/终止。
3. 缩略图服务配置未复用动态默认：`ThumbnailServiceConfig` 在 [src-tauri/src/core/thumbnail_service_v3/config.rs](src-tauri/src/core/thumbnail_service_v3/config.rs) 已按核数动态设 worker/memory，但命令里又自建固定值，导致配置漂移。建议统一使用 Default + 用户覆写参数。
4. 缓存/队列缺少上限暴露：内存 LRU 仅按条数（默认 1024）而非字节；保存队列阈值固定 50。建议：
   - 按字节预算（估算平均 30–50KB/缩略图）控制 LRU。
   - 保存队列与 IPC 批次都按大小与数量双阈值限制。
5. 目录切换取消：`request_visible_thumbnails` 在 [src-tauri/src/core/thumbnail_service_v3/mod.rs](src-tauri/src/core/thumbnail_service_v3/mod.rs) 仅清空任务队列，未通知工作线程终止当前生成。建议向 worker 传递代际 token/取消标记，处理中途检测并丢弃旧任务。

## NeeView（WPF 参考）可移植的策略
- 双队列背压：视口队列 + 前瞻队列，翻页/方向变更即取消旧队列；每队列设最大并发与深度。
- 任务优先级：视口中心优先，其次同向 prefetch，反向延迟；新导航提升优先级。
- 资源复用：统一的缩略图数据库 + 内存 LRU，避免文件浏览与页面阅读重复生成。
- 文件流式加载：大目录分页/流式迭代，避免一次性 materialize。

## 建议的落地顺序（含测试思路）
1. 缩略图请求与缓存：为 V3 请求加批次/上限 + LRU/URL revoke，并统一协议 URL；调整后台缩略图半径与取消机制。
   - 测试：前端用大目录/快滚动场景比对缩略图到达延迟与内存占用，记录 IPC 调用次数；后端用同批目录压测生成队列长度和 worker 活跃数（可加 metrics log）。
2. 目录加载流式化：前后端改为流式列目录 + 虚拟列表，减少主线程排序/渲染压力。
   - 测试：前端用 1w+ 文件目录滚动，观察首屏时间、长列表 FPS；后端统计 stream 分批耗时与内存峰值，对比一次性快照方案。
3. 后端配置与线程：迁移缩略图数据库路径到 app data，线程/并发与 LRU 容量改为动态 + 用户可调。
   - 测试：在 4C/8C/16C 环境跑同一目录缩略图生成基准，记录总耗时、CPU 占用与 DB 大小；验证 app data 路径写入权限与清理策略。
4. 预取与取消：为页面/缩略图预取补充可取消 token 与方向感知的 ahead loader，避免快速跳转时的无效工作。
   - 测试：前端做快速翻页/跳书场景，统计被取消的请求数、实际完成的预取数、主图首帧时间；后端日志验证取消是否及时中断队列。

> Tauri 测试建议：
- 单元/集成：前端用 Vitest + jsdom 覆盖队列/缓存逻辑；后端 Rust 用 cargo test 针对服务模块（队列、LRU、路径配置）。
- 端到端：可用 Playwright 驱动打包或 dev server，再配合 tauri-driver 做窗口级交互；性能基准可在 Tauri 后端输出 metrics/trace（如 tracing + tokio-console），前端用 Performance API 采样首屏/滚动/翻页时间。
- 流式目录压测：已新增 `src-tauri/tests/directory_stream_perf.rs`，命令 `cargo test -j1 directory_stream_perf -- --nocapture`，用于验证 2k+ 文件目录的分批完成与 5s 超时约束，可根据需要放大文件数做回归。
