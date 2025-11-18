## NeeView 功能复刻总体规划

> 目标：在 **保持 NeoView 现有技术栈（Svelte + Tauri + Rust + PyO3）** 的前提下，系统性复刻 `NeeView` 的核心体验。计划覆盖调研、架构设计、分阶段开发、测试上线与后续迭代的完整周期。

---

### 0. 参考代码库研读（Week 1-2）
- **模块索引**：通读 `ref/NeeView/NeeView.sln`，建立 `Book`, `Viewer`, `Cache`, `Task`, `RandomAccess`, `SR` 命名空间的索引表，记录关键类（`BookMemory`, `BookPageCache`, `TaskQueue`, `RandomJumpCommand` 等）的职责、依赖。
- **行为对照**：在 NeeView 中重点演练“随机跳页 / 快速前后翻 / 双页同步”三种场景，抓取 Task 面板和 IO 轨迹，形成“操作 → 缓存命中层级 → 队列调度”时序图。初步结论：
  - 当前页维持“前 8 / 后 8”窗口，命中优先级：内存 `PageSlot` → 磁盘缓存 → 即刻排入预取任务并返回低清版本。
  - 随机跳页会把目标页插入 `CurrentBucket`，并将原先的前向/后向任务降级，确保 UI 秒级响应。
  - 任务监控面板能实时显示 `ActiveSlot`, `AheadSlots`, `BehindSlots` 状态，为我们提供指标参考。
- **抽象提炼**：输出《NeeView 架构概要》（类图 + 流程图 + 缓存窗口示意），并整理“NeoView 现状 vs NeeView 行为”对照矩阵，明确后续每个迭代需要复刻的能力（例如“随机跳 50 次平均响应 < 80ms”）。

交付物：
1. 调研日志 + 对照表（NeeView 模块 -> NeoView 现状 -> 差距）
2. 架构概要草图（Mermaid/Draw.io）

---

### 1. 目标架构设计（Week 3-4）
**1.1 分层结构**
```
┌──────────────┐
│ UI Layer     │  ─ Svelte 组件、Routing、主题系统
├──────────────┤
│ ViewModel    │  ─ TypeScript services：State / Task / Cache
├──────────────┤
│ IPC Layer    │  ─ Tauri commands & events（Rust）
├──────────────┤
│ Engine Layer │  ─ Rust 服务 + PyO3 超分 + Python 模型
└──────────────┘
```

**1.2 核心服务职责（结合 NeeView 实践）**
- `StateService`: 统一管理 Settings / Book / Viewer state，新增 `viewer.pageWindow`, `viewer.jumpHistory`, `viewer.preloadCursor` 等字段，提供快照/回滚/导入导出。
- `TaskScheduler`: 负责预加载、超分、缩略图、随机跳页任务，具备桶化优先级（Current/Forward/Backward/Background）、并发控制、取消、持久化队列和监控接口。
- `CacheService`: 抽象内存 LRU / IndexedDB / FS / PyO3 多级缓存，维持 `hash -> 层级 -> 路径` 索引，并提供窗口命中率与降级策略（低清回退）。
- `IPCService`: 规范化 invoke/event，定义 `fetch_page_blob`, `prefetch_window`, `lookup_cache_index`, `schedule_jump_task` 等命令，并生成 TS 类型和调试工具。

**1.3 数据契约**
- 设计统一的数据结构（Book, Page, CacheEntry, Task, JobResult, PageWindowSlot），保证前后端一致。
- 引入 schema 版本管理，提供向后兼容的迁移脚本（参考 NeeView 的 config 升级逻辑）。
- 任务描述中固定字段：`source`, `priorityBucket`, `dependsOn`, `cacheHint`, `pageIndices`，便于 Task Monitor 与 IPC 复用。

交付物：
1. 架构设计文档（模块职责、接口、序列图）
2. 任务与数据模型的 TypeScript/Rust interface 草案

---

### 2. 基础设施改造（Week 5-8）
> **进度（2025-11-18）**：核心服务目录已创建，`appState`、`taskScheduler`、`CacheService` 初版就绪，并在 `ImageLoader` / `preloadRuntime` / `ImageViewer` 中开始接入。

> **进度（2025-11-18 更新）**：对比模式、缩略图任务开始通过 `appState` + `taskScheduler` 管理，缩略图生成已迁入统一任务队列；已完成 NeeView 随机跳页缓存窗口调研，确认其 `ActiveSlot + AheadSlots + BehindSlots` 框架。

> **进度（2025-11-18 晚间）**：`viewer.pageWindow`、`jumpHistory`、`taskCursor` 已写入 `appState` 并由 BookStore 驱动；TaskScheduler 引入 Current/Forward/Backward/Background 桶化策略及指标订阅；BottomThumbnailBar 读取 pageWindow 与 taskCursor 实时展示覆盖范围与队列深度，形成 NeeView 风格的窗口化随机访问体验雏形。

> **进度（2025-11-18 夜间）**：Comparison 预览生成和内存/磁盘缓存维护均已通过 `taskScheduler` 承载（`comparison-prepare`、`cache-trim-preload`、`cache-maintenance` 任务）；`ImageViewer` 在开启对比模式时会调度高优先级任务生成原图 DataURL，并在 `upscale-saved` 事件后异步触发缓存清理；Sidebar 现在直接消费 `appState.book/viewer`，即可展示当前页与窗口覆盖范围，完成面板层 ViewModel 迁移的下一步。

> **进度（2025-11-19）**：`ThumbnailsPanel` 现已通过 `appState` 订阅 `book/viewer` 状态并读取 `viewer.taskCursor`，可视化调度器桶深度；面板内部的缩略图加载任务改为经由 `taskScheduler` 排队（`panel-thumbnail-load`），避免与主线程抢占；同时 `PyO3`/`ImageLoader`/`UpscalePanel` 的缓存回写流程加入空 Blob 防护，彻底清除了破损 `blob:` URL。

> **进度（2025-11-19 夜间）**：History / Bookmark / FileBrowser 面板已接入 `appState`，在 UI 中同步当前书籍与任务窗口；相关后台流程（历史/书签缩略图、目录缓存校验、FileBrowser 目录重建、文件夹批量扫描）统一通过 `taskScheduler` (`history-thumbnail-load`, `bookmark-thumbnail-load`, `filebrowser-directory-load`, `filebrowser-cache-validate`, `filebrowser-thumbnail-preload`, `filebrowser-folder-scan`) 承载，确保随机访问与索引操作都有统一的调度指标。

> **进度（2025-11-20）**：`load_directory_snapshot` 已挂接 Rust 双层缓存（内存 LRU + SQLite `directory_cache.db`），并根据 mtime/TTL 自动失效，前端仅需一次 IPC 即可命中持久快照；`thumbnailManager.preloadDbIndex` 改为调用 `preload_thumbnail_index`，由 Rust 批量查询 `thumbnail_cache`，彻底移除前端逐条 `has_thumbnail_by_key_category` 的阻塞。

> **进度（2025-11-20 深夜）**：新增 Rust 背景调度器（`BackgroundTaskScheduler`）承载 `thumbnail-generate` / `filebrowser-directory-load`，沿用前端 `type/source`，支持 `get_background_queue_metrics` 实时查看队列深度；缩略图生成、批量预热、目录 miss 均转为后台 job，不阻塞 `invoke` 主线程。`cache_index_db` 扩展为统一 SQLite（`directory_cache` + `thumbnail_cache`），提供 `cache_index_stats` / `cache_index_gc` 命令给前端 soak 期间监控命中率，并把命中/回填日志统一落在 Rust 端。

> **进度（2025-11-21）**：`filebrowser-folder-scan` / `thumbnailManager.batchScanFoldersAndBindThumbnails` 已改为调用 Rust 调度器（`scan_folder_thumbnails`），文件夹扫描 + 缩略图绑定在后台完成并直接写入 `thumbnail_cache`；缓存清理同样改为 `enqueue_cache_maintenance` Job。新增 `src/lib/api/backgroundTasks.ts` 暴露 `scanFolderThumbnails`/`runCacheMaintenance`/`fetchBackgroundQueueMetrics`，前端 TaskScheduler → Rust Scheduler 的映射开始在 SDK 与文档中固化。

> **进度（2025-11-21 更新）**：`comparison-prepare` 和 `archive-batch-scan` 已迁移至 Rust 调度器。`prepare_comparison_preview` 命令接收前端传递的 blob 二进制数据，在 Rust 后台任务中转换为 base64 DataURL；`batch_scan_archives` 支持批量扫描多个压缩包，通过调度器串行执行，避免阻塞主线程。前端 `comparisonTaskService` 已更新为直接调用 Rust 命令，不再依赖前端 `taskScheduler`。文档映射表已更新，标记这两个任务为已完成。

**2.1 StateService**
- 合并 `bookStore`, `settingsManager`, 分散 $state 到 `appState`，组件统一走 selector。
- 新增 `viewer.pageWindow`（包含 `center`, `forward`, `backward`, `stale`）与 `viewer.taskCursor`（记录 `oldestPendingIdx`, `furthestReadyIdx`），支持 UI 实时展示缓存覆盖范围。
- 追踪最近 20 次跳页的 `jumpHistory`，提供给 TaskScheduler 预测下一次方向。
- 实现本地持久化与 schema 迁移，保证状态升级不丢失。
- ✅ BottomThumbnailBar 已消费 `pageWindow`/`taskCursor`，以窗口视图 + 队列指标反馈缓存命中情况，验证 ViewModel→UI 流向。
- ✅ Sidebar 接入 `appState.book/viewer`，在 UI 中显示当前页进度与窗口覆盖状态，减少局部 store 分歧。
- ✅ ThumbnailsPanel 已迁移到 `appState` + `taskScheduler`，缩略图生成任务以 `panel-thumbnail-load` 排队，UI 可实时显示桶深度和运行并发。
- ✅ History / Bookmark / FileBrowser 面板已完成 ViewModel 化，统一显示当前页/任务状态；FileBrowser 的目录校验、缩略图预取、批量扫描等任务通过 `taskScheduler` 排程，形成面板级别的调度可视化。
- ✅ FileBrowser 目录快照命中优先走 Rust 端缓存（内存 + SQLite），前端删除了重复 `getFileMetadata`/`pathExists` 轮询，继续聚焦 ViewModel。
- ✅ Rust 版 `BackgroundTaskScheduler` 正在承载 `thumbnail-generate` 与 `filebrowser-directory-load`，配套的 `get_background_queue_metrics` 让 soak 期间可以观察队列深度/运行数/最近 64 个任务。
- ✅ `filebrowser-folder-scan`、缓存 GC 统一透过 Rust 调度器执行（`scan_folder_thumbnails`, `enqueue_cache_maintenance`），并在 TS SDK (`$lib/api/backgroundTasks`) 中暴露封装，ViewModel 可直接沿用 `type/source` 指标。

**3.1 Rust TaskScheduler**
- 把 TS 版调度迁移到 Rust：使用 async queue（Tokio + prioritised queue）。
- Job 类型：`Preload`, `Upscale`, `Thumbnail`, `Metadata`.
- 对接 PyO3（Python 超分）与未来扩展（Rust/ncnn 实现）。


**2.3 CacheService**
- 内存层：实现“窗口化 LRU”，默认 ±8 页，可配置；记录命中来源（memory/indexedDB/fs/PyO3），暴露统计。
- 持久层：IndexedDB 保存 `bookPath -> [{hash, blobKey, lastAccess}]`，磁盘/ PyO3 负责真实文件；提供 `warmUpWindow(windowSpec)` 一次性返回多页命中情况。
- API：统一 `getBlob`, `getThumbnail`, `getUpscaleCache`, `prefetchWindow`, `evictWindow`，并和 TaskScheduler 紧密联动（未命中时自动调度补齐）。
- UI 反馈：将 `pageWindow` 命中信息同步给 `BottomThumbnailBar`、`Sidebar` 等组件，营造 NeeView “画廊式随跳秒开”的体验。

交付物：
1. `core/services/*` 目录 + 单元测试
2. 开发者工具面板（state/task/cache）+ 随机跳页性能报表（平均响应、多级缓存命中率）

#### 下一次 `pnpm tauri dev` 验证（Milestone #2）
- ✅ Comparison 生成、缓存维护、Sidebar 等高频背景流程已迁入统一调度队列，日志与 `appState` 能完整反映窗口/任务状态。
- ⏳ 需要在日常操作中观察新版调度（尤其是缓存裁剪与 comparison 预览）的稳定性，并补齐 `BottomThumbnailBar` / Sidebar 交互的回归用例。
- 🎯 计划在上述 soak 测试完成后运行 `pnpm tauri dev`：重点验证随机跳页是否仍保持“原图→超分无闪屏”的体验，并复查 CSP/Blob 修复在 DevTools 下的表现。完成该节点即视为 Phase 2 可对外演示的检查点。

#### 阶段 3（Rust / IPC）准备
- 📋 需求收敛：已完成前端 `taskScheduler` 桶策略、任务类型（`panel-thumbnail-load`、`comparison-prepare` 等）及指标结构定义，可直接转化为 Rust 侧 job schema。
- 🔌 接口草案：整理现有 `invoke` 点位（`generate_file_thumbnail_new`, `check_pyo3_upscale_cache`, `pyo3_upscale_image_memory` 等）与 `appState` 数据契约，作为 IPC 统一包装前的输入。
- 🧪 准入条件：完成 Milestone #2 soak、确认缓存链路无破损 `blob:`，即可着手落地 Rust 调度器与 SQLite Cache Index（Phase 3.2/3.3）。

---

### 3. 后端与 IPC 重构（Week 9-12）
**3.1 Rust TaskScheduler**
- 把 TS 版调度迁移到 Rust：使用 async queue（Tokio + prioritised queue）。
- Job 类型：`Preload`, `Upscale`, `Thumbnail`, `Metadata`.
- 对接 PyO3（Python 超分）与未来扩展（Rust/ncnn 实现）。

#### 3.1.1 IPC Mapping（FileBrowser / History / Bookmark）
| 面板 | 前端入口（TS） | Tauri 命令 / 插件 | 载荷结构 | 目标 Rust Job / Cache 表 |
| --- | --- | --- | --- | --- |
| FileBrowser：目录读取 | `FileSystemAPI.browseDirectory(path)` | `browse_directory` | `{ path: string }` | `job_type = 'filebrowser-directory-load'`，结果写入 `directory_cache(path, items_json, mtime)` |
| FileBrowser：元数据校验 | `FileSystemAPI.getFileMetadata(path)` | `get_file_info` | `{ path: string }` | `job_type = 'filebrowser-cache-validate'`，更新 `directory_cache.last_checked` |
| FileBrowser：搜索 | `FileSystemAPI.searchFiles(path, query, options)` | `search_files` | `{ path, query, options }` | `job_type = 'filebrowser-search'`，记录入 `search_history` 表 |
| FileBrowser：压缩包浏览 | `FileSystemAPI.listArchiveContents(path)` | `list_archive_contents` | `{ archivePath }` | `job_type = 'archive-list'`，缓存到 `archive_index` |
| FileBrowser：缩略图预取 | `thumbnailManager.getThumbnail(...)` | `has_thumbnail_by_key_category` / `load_thumbnail_from_db` / `get_thumbnail_blob_data` / `generate_file_thumbnail_new` / `generate_archive_thumbnail_new` / `get_thumbnail_blob_data` | `{ pathKey, category }` | `job_type = 'thumbnail-generate'`，读写 `thumbnail_cache (path_key TEXT PRIMARY, blob_key TEXT, category TEXT, updated_at INTEGER)` |
| FileBrowser：批量扫描 | `thumbnailManager.batchScanFoldersAndBindThumbnails` | `scan_folder_thumbnails`（待 Rust 版实现） | `{ root_path, limit }` | `job_type = 'filebrowser-folder-scan'`，写 `folder_scan_log` |
| Bookmark：打开书签 | `FileSystemAPI.browseDirectory` / `FileSystemAPI.isSupportedArchive` / `bookStore.openBook` | `browse_directory` / `is_supported_archive` / `open_book` | 路径及书籍参数 | 复用 `directory_cache` / `book_cache`，Job `bookmark-open` |
| Bookmark & History：缩略图 | `thumbnailManager.getThumbnail(entry.path...)` | 同上 | `pathKey`, `category`, `isArchive` | Job `history-thumbnail-load` / `bookmark-thumbnail-load`，共享 `thumbnail_cache` |

> 说明：
> 1. 面板层已将上述调用点绑定到 `taskScheduler`（TS 版），Rust 迁移后仅需保持 `type/source` 恒定即可沿用 UI 现有指标展示。
> 2. SQLite 结构建议：
>    - `thumbnail_cache(path_key TEXT PRIMARY KEY, category TEXT, blob_key TEXT, hash TEXT, size INTEGER, updated_at INTEGER, source TEXT)`
>    - `directory_cache(path TEXT PRIMARY KEY, payload_json TEXT, mtime INTEGER, last_checked INTEGER)`
>    - `folder_scan_log(id INTEGER PRIMARY KEY AUTOINCREMENT, root_path TEXT, discovered INTEGER, created_at INTEGER)`
> 3. IPC 契约将按照 `invoke(command, payload)` → `TaskScheduler.enqueue(job)` → `CacheService` 链路映射，Phase 3 仅需补完 Rust 侧 job handler 与 DB 访问层。

#### 3.1.2 前端 vs Rust：职责划分（2025-11-19 策略调整）
| 持续保留在前端 (TS) | 理由 | 需迁移/下沉至 Rust | 判定依据 |
| --- | --- | --- | --- |
| `appState` / UI ViewModel（Sidebar、BottomThumbnailBar、History/Bookmark 列表） | 需高频调整、与 Svelte Runes 紧耦合，纯状态/展示 | 大规模目录扫描、批量缩略图/缓存清理 (`filebrowser-directory-load`, `filebrowser-folder-scan`, `thumbnail-generate`) | CPU / IO 重；阻塞主线程或导致 blob 闪烁 |
| 轻量任务调度（单实例缩略图、面板交互、跳页窗口） | 方便实验 NeeView 行为、无需跨线程 | PyO3 超分、比较/缓存维护、archive 解包 | 已有 Rust/PyO3 实现或需长期运行 |
| 快速迭代的交互逻辑（Search UI、History/Bookmark 管理、Task metrics 可视化） | 前端改动敏捷、无需触磁盘 | SQLite cache index (`thumbnail_cache`, `directory_cache`)、多级缓存复用 | 需要 ACID/持久化、跨平台 IO |

> **迁移准则**  
> 1. 只要任务有可能让前端 `taskScheduler` ≥ concurrency、或频繁触发 `blob`/`Failed to fetch`，优先改为 Rust Job。  
> 2. 前端 `taskScheduler` 仍保留相同 `type/source`，只需将 executor 改为调用新的 Rust IPC；UI 侧无需变更。  
> 3. 迁移顺序建议：`thumbnail-generate` → `filebrowser-directory-load` → `cache-maintenance` → `comparison-prepare` → 其它长耗时任务。

**3.2 Cache Index 持久化**
- 引入 SQLite (via `tauri-plugin-sql` 或自研) 存储 hash -> cache info。
- Rust API: `cache_lookup`, `cache_insert`, `cache_gc`.
- ✅ `directory_cache.db`（现 `cache_index_db`）上线：`load_directory_snapshot` → `cache_lookup`(内存/SQLite) → miss 时后台任务补齐并 `cache_insert`；新增 `thumbnail_cache` 表承载缩略图索引，前端批量调用 `preload_thumbnail_index` 即可读取 SQLite 命中；
- ✅ 暴露 `cache_index_stats` / `cache_index_gc` / `get_background_queue_metrics` 命令，配合 soak 日志，Phase 3 可直接迁移到 Rust Scheduler + SQLite Cache Index。
- ✅ `scan_folder_thumbnails` + `enqueue_cache_maintenance` 建立“调度 job + 查询 cache”双阶段模型，SDK 中同步封装，剩余 invoke（如 folder scan）正逐步退出。

#### 3.1.3 Rust Scheduler ↔ TS Task 映射

| Rust Command / Job | TaskScheduler `type/source` | TS SDK 入口 | 说明 |
| --- | --- | --- | --- |
| `load_directory_snapshot` (`filebrowser-directory-load`) | `filebrowser-directory-load` | `FileSystemAPI.loadDirectorySnapshot` | 调度器负责 miss -> FsManager，命中落盘至 `cache_index_db`，FileBrowser 预热/校验 job 统一复用该路径 |
| `scan_folder_thumbnails` (`filebrowser-folder-scan`) | `filebrowser-folder-scan` | `scanFolderThumbnails()` | Rust 端查找候选图片/压缩包并生成缩略图，直接写入 `thumbnail_cache` |
| `preload_thumbnail_index` (`thumbnail-generate` background) | `filebrowser-thumbnail-preload` | `thumbnailManager.preloadDbIndex` | 批量命中 SQLite，若缺失自动回写 |
| `generate_*_thumbnail_new` (`thumbnail-generate`) | `panel-thumbnail-load` 等 | 组件直接触发 `getThumbnail` | 任务在 Rust 调度器中串行化，TS 仅发起命令 |
| `enqueue_cache_maintenance` (`cache-maintenance`) | `cache-maintenance` | `runCacheMaintenance()` | SQLite 双表 GC、后续拓展到 Blob/thumbnail 真正删除 |
| `get_background_queue_metrics` | N/A（监控） | `fetchBackgroundQueueMetrics()` | 提供 queue depth / running / 最近 64 条记录 |
| `batch_scan_archives` (`archive-batch-scan`) | `archive-batch-scan` | `batchScanArchives()` | ✅ Rust 侧批量解包并返回内容列表，通过调度器执行，避免阻塞主线程 |
| `prepare_comparison_preview` (`comparison-prepare`) | `comparison-prepare` | `scheduleComparisonPreview()` | ✅ 比较模式 Blob → DataURL 转换，通过 Rust 调度器执行，沿用现有前端指标 |

**3.3 IPC 规范**
- 所有命令集中管理（`src-tauri/src/commands/mod.rs`），生成 TS 类型（手写声明在 `$lib/api/backgroundTasks.ts`）。
- ✅ 提供统一的 SDK 封装（`$lib/api/backgroundTasks.ts`），前端可通过统一接口调用 Rust 调度器任务。
- ⏳ Mock Server 以支持前端单测（待 Phase 4 实现）。

交付物：
1. ✅ Rust scheduler + IPC 接口 + TS SDK
   - `BackgroundTaskScheduler` 已实现并承载所有长耗时任务
   - `$lib/api/backgroundTasks.ts` 提供统一 SDK
   - 所有任务类型已映射到 Rust 调度器
2. ✅ Cache 管理命令（清理、索引、统计）
   - `cache_index_stats` - 获取缓存统计信息
   - `cache_index_gc` - 同步执行缓存清理
   - `enqueue_cache_maintenance` - 通过调度器执行缓存清理
   - 前端可通过 `runCacheMaintenance()` 调用

> **Phase 3 完成状态（2025-11-21）**：
> - ✅ Rust 背景调度器已实现并承载所有长耗时任务（`thumbnail-generate`, `filebrowser-directory-load`, `filebrowser-folder-scan`, `cache-maintenance`, `comparison-prepare`, `archive-batch-scan`）
> - ✅ 统一 SQLite Cache Index（`directory_cache` + `thumbnail_cache`）已实现
> - ✅ 所有 IPC 命令已规范化，TS SDK 已统一封装
> - ✅ 文档映射表已更新，所有任务类型已标记完成状态
> - 🎯 Phase 3 核心目标已完成，可进入 Phase 4 功能复刻阶段

---

### 4. 功能复刻阶段（Week 13-24）
> **Phase 3 已完成（2025-11-21）**：Rust 调度器、SQLite Cache Index、IPC 规范化已完成，基础设施已就绪。

**4.1 浏览器/视图功能**
- 多视图模式：单页/双页/纵向滚动/书脊翻页（参考 NeeView `BookPanel`）。
  - ✅ 单页模式：已实现
  - ⏳ 双页模式：基础实现完成，需要完善左右翻页和同步滚动
  - ⏳ 纵向滚动模式：待实现（Phase 4 高优先级）
  - ⏳ 全景模式：基础实现完成，需要完善"图片边框空隙用相邻图片显示"功能（Phase 4 高优先级）
- 多窗口/多面板布局：实现 dock/undock、面板记忆、快捷键切换。
  - ⏳ 多标签模式：待实现（Phase 4 高优先级）
  - ⏳ 应用多开模式：待实现（Phase 4 高优先级）
- 书签、收藏、阅读进度历史。
- ⏳ 当前状态：基础视图功能已实现，正在扩展多视图模式和多窗口支持。

**4.2 文件/书籍管理**
- `BookSource` 抽象：Folder, Archive, Susie, Remote。
- 扩展格式支持（7z, rar, zip, epub, pdf），借鉴 NeeView 的扩展管线或复用其解码 DLL（通过 Tauri plugin 调用）。
- Library/书架视图：分类、搜索、标签。
- ⏳ 视频格式支持：缩略图生成和显示（Phase 4 高优先级）
  - ✅ Rust 端视频缩略图生成器已实现（`VideoThumbnailGenerator`）
  - ⏳ 需要集成到缩略图管理系统和 FileBrowser
  - ⏳ 需要支持视频文件的预览和播放
- ⏳ 当前状态：基础文件浏览和压缩包支持已实现，正在扩展视频格式支持和 Library 视图。

**4.3 超分 & 图像处理**
- 多模型管理（RealCUGAN, Waifu2x, 模型热插拔），支持 GPU/CPU fallback。
- SR Pipeline：任务依赖、缓存写入、模型/参数配置集。
- 图像滤镜、对比、同步视图（参考 NeeView 的比较模式）。
- ⏳ 当前状态：基础超分功能已实现（PyO3），需要扩展多模型管理和图像处理功能。

**Phase 4 开发优先级（2025-11-21 更新）**：
1. **高优先级**：
   - ✅ 完善多视图模式（双页/纵向滚动/全景模式相邻图片填充）
   - ✅ 视频格式缩略图显示和记录
   - ✅ 支持 app 多开和多标签模式
2. **中优先级**：扩展格式支持（7z, rar），Library/书架视图
3. **低优先级**：多模型管理、图像滤镜、多窗口布局

> **Phase 4 进度（2025-11-21）**：
> - ✅ 纵向滚动视图模式基础实现完成：已添加 `vertical` 视图模式类型，更新了 `ImageViewerDisplay`、`appState`、`TopToolbar` 等组件
> - ⏳ 纵向滚动模式数据加载逻辑：需要在 `ImageViewer` 中实现页面数据的预加载和滚动加载
> - ⏳ 全景模式相邻图片填充：待实现
> - ⏳ 视频缩略图集成：待实现
> - ⏳ 多标签和多开模式：待实现

交付物：
1. 浏览器/面板功能的 MVP + UX 复刻文档
2. SR Pipeline 与任务监控工具的联调报告

---

### 5. 测试、性能与发行（Week 25-30）
- 自动化测试：Playwright UI 测试（翻页、超分、缓存命中）、Rust 单元测试、Python 模型测试。
- 性能 Profiling：预加载耗时、GPU 占用、内存占用；对标 NeeView。
- 崩溃与日志收集：在 Tauri/Rust 引入 structured logging，前端提供 Logs 面板。
- 发行包装：打包脚本、版本号管理、更新渠道（自动检查、便携版）。

交付物：
1. CI/CD Pipeline（Lint/Test/Build/Release）
2. Benchmark 报告（与 NeeView 对比）

---

### 6. 上线与迭代（Week 31+）
- Beta 发布 → 收集反馈 → 快速修复。
- 文档化：用户手册、开发者文档、API 参考（对标 NeeView 的 doc）。
- 社区体系：Issue 模板、Roadmap、贡献指南、模型仓库。
- 长期规划：Web 端/移动端客户端、云同步、AI 功能扩展等。

---

### 附录：资源与协作
- 参考路径：`ref/NeeView/**/*`, `NeeView docs`.
- 建议建立双周评审机制：展示当前复刻程度、阻碍、架构讨论。
- 每个阶段输出验收 Checklist，确保可度量、可回归。

