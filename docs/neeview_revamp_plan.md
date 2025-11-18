## NeeView 功能复刻总体规划

> 目标：在 **保持 NeoView 现有技术栈（Svelte + Tauri + Rust + PyO3）** 的前提下，系统性复刻 `NeeView` 的核心体验。计划覆盖调研、架构设计、分阶段开发、测试上线与后续迭代的完整周期。

---

### 0. 参考代码库研读（Week 1-2）
- **模块索引**：通读 `ref/NeeView/NeeView.sln` 相关项目，建立对 `Book`, `Viewer`, `Cache`, `Task`, `Plugin`, `SR` 等核心命名空间的映射表。
- **行为对照**：在 NeeView 运行环境中记录 UI/交互、配置项、性能指标，并与 NeoView 现功能做矩阵对比。
- **抽象提炼**：输出一份《NeeView 架构概要》文档（类图 + 流程图），作为后续复刻的蓝图。

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
│ ViewModel    │  ─ TypeScript services：State / Task / Cache / Plugin
├──────────────┤
│ IPC Layer    │  ─ Tauri commands & events（Rust）
├──────────────┤
│ Engine Layer │  ─ Rust 服务 + PyO3 超分 + Python 模型
└──────────────┘
```

**1.2 核心服务职责**
- `StateService`: 统一管理 Settings / Book / Viewer state，支持快照、回滚、导入导出。
- `TaskScheduler`: 负责预加载、超分、缩略图等后台任务，支持优先级、并发、取消、持久化队列。
- `CacheService`: 抽象内存 / IndexedDB / SQLite / FS 多级缓存，维持 hash -> 模型 -> 路径索引。
- `PluginService`: 预留 JS 插件入口，结合 NeeView 的脚本/插件机制。
- `IPCService`: 规范化所有 invoke/event 接口，附带 TS 类型定义与调试工具。

**1.3 数据契约**
- 设计统一的数据结构（Book, Page, CacheEntry, Task, JobResult），保证前后端一致。
- 引入 schema 版本管理，提供向后兼容的迁移脚本（参考 NeeView 的 config 升级逻辑）。

交付物：
1. 架构设计文档（模块职责、接口、序列图）
2. 任务与数据模型的 TypeScript/Rust interface 草案

---

### 2. 基础设施改造（Week 5-8）
**2.1 StateService**
- 把 `bookStore`, `settingsManager`, 各种 $state 合并到统一的 `appState`.
- 提供 `appState.subscribe(selector, listener)` API；Svelte 组件改为消费 selector。
- 实现 state persistence（localStorage/IndexedDB）+ 版本迁移。

**2.2 TaskScheduler（前端版）**
- 初版先在 TS 侧实现队列：FIFO + 优先级 + 并发控制。
- 处理 `preloadNextPages`, `triggerAutoUpscale`, `thumbnail` 等任务，统一去重与状态机。
- 提供开发者面板显示任务队列（类似 NeeView 的 “任务监视器”）。

**2.3 CacheService**
- 实现内存 LRU（Map + 双向链表）＋ IndexedDB （持久化 Blob 索引）。
- 统一封装 `getBlob`, `getBitmap`, `getThumbnail`, `getUpscaleCache`。
- 加入缓存监控接口（容量、命中率、清理）。

交付物：
1. `core/services/*` 目录 + 单元测试
2. 开发者工具面板（显示 state / task / cache）

---

### 3. 后端与 IPC 重构（Week 9-12）
**3.1 Rust TaskScheduler**
- 把 TS 版调度迁移到 Rust：使用 async queue（Tokio + prioritised queue）。
- Job 类型：`Preload`, `Upscale`, `Thumbnail`, `Metadata`.
- 对接 PyO3（Python 超分）与未来扩展（Rust/ncnn 实现）。

**3.2 Cache Index 持久化**
- 引入 SQLite (via `tauri-plugin-sql` 或自研) 存储 hash -> cache info。
- Rust API: `cache_lookup`, `cache_insert`, `cache_gc`.

**3.3 IPC 规范**
- 所有命令集中管理（`src-tauri/src/api/mod.rs`），生成 TS 类型（使用 `ts-rs` 或手写声明）。
- 提供 Mock Server 以支持前端单测，不依赖真实 Tauri 环境。

交付物：
1. Rust scheduler + IPC 接口 + TS SDK
2. Cache 管理 CLI（清理、索引、统计）

---

### 4. 功能复刻阶段（Week 13-24）
**4.1 浏览器/视图功能**
- 多视图模式：单页/双页/纵向滚动/书脊翻页（参考 NeeView `BookPanel`）。
- 多窗口/多面板布局：实现 dock/undock、面板记忆、快捷键切换。
- 书签、收藏、阅读进度历史。

**4.2 文件/书籍管理**
- `BookSource` 抽象：Folder, Archive, Susie, Remote。
- 扩展格式支持（7z, rar, zip, epub, pdf），借鉴 NeeView 的扩展管线或复用其解码 DLL（通过 Tauri plugin 调用）。
- Library/书架视图：分类、搜索、标签。

**4.3 超分 & 图像处理**
- 多模型管理（RealCUGAN, Waifu2x, 模型热插拔），支持 GPU/CPU fallback。
- SR Pipeline：任务依赖、缓存写入、模型/参数配置集。
- 图像滤镜、对比、同步视图（参考 NeeView 的比较模式）。

**4.4 插件/脚本系统**
- 前端 JS 插件机制（Manifest + 权限 + 事件 API）。
- 后端命令注册（允许 Rust/Python 扩展）。
- 兼容 NeeView 脚本思路：提供 CLI + REST API 触发动作。

交付物：
1. 浏览器/面板功能的 MVP + UX 复刻文档
2. 插件 SDK & 示例

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
- 文档化：用户手册、开发者文档、插件指南、API 参考（对标 NeeView 的 doc）。
- 社区体系：Issue 模板、Roadmap、贡献指南、模型/插件仓库。
- 长期规划：Web 端/移动端客户端、云同步、AI 功能扩展等。

---

### 附录：资源与协作
- 参考路径：`ref/NeeView/**/*`, `NeeView docs`.
- 建议建立双周评审机制：展示当前复刻程度、阻碍、架构讨论。
- 每个阶段输出验收 Checklist，确保可度量、可回归。

