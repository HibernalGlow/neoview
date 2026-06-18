Now I have a comprehensive picture. Here's the full summary:

---

## NeoView-Tauri 项目综合研究报告

### 一、项目概述

NeoView 是一个高性能桌面端**图片/漫画查看器**，目标是在现代技术栈上复刻 [NeeView](https://github.com/neelabo/NeeView) 的核心体验，同时针对大体积本地图库做了大量性能优化。

**技术栈：** Tauri 2 + Svelte 5 (Runes) + Rust + Vite 6 + Tailwind CSS 4 + shadcn-svelte + PyO3

---

### 二、核心功能

| 领域              | 功能                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------- |
| **图库浏览**      | 文件夹/压缩包浏览、历史记录、书签、文件浏览器面板                                     |
| **多视图模式**    | 单页、双页、纵向滚动、全景模式、横向页面分割                                          |
| **缩略图系统**    | Rust+SQLite 持久化、批量查询、虚拟列表优先加载、LRU 内存缓存、V3 架构（复刻 NeeView） |
| **主题**          | 多套预设主题、tweakcn 导入、深色/浅色/跟随系统、磨砂模糊效果                          |
| **超分/图像处理** | PyO3 调用 Python 模型（RealCUGAN/Waifu2x）、多模型管理                                |
| **语音控制**      | Web Speech API 实时语音指令（翻页、缩放、视图切换等）                                 |
| **视频支持**      | 视频文件播放、背景视频、幻灯片模式                                                    |
| **卡片窗口系统**  | 独立弹出窗口（卡片式管理）                                                            |
| **自定义协议**    | `neoview://` 协议绕过 invoke 直接传输二进制数据                                       |

---

### 三、Store 体系（状态管理）

项目使用 **Svelte 5 Runes** 模式 (`.svelte.ts` 文件)，stores 目录含约 **60+ 个状态文件**：

| 分类            | Store 文件                                                                                                                                                                                                                                                       | 用途                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **核心阅读**    | [book.svelte.ts](src/lib/stores/book.svelte.ts), [pageStore.svelte.ts](src/lib/stores/pageStore.svelte.ts), [pageFrame.svelte.ts](src/lib/stores/pageFrame.svelte.ts)                                                                                            | 书籍打开/翻页、页面状态、页面帧管理         |
| **导航与历史**  | [bookmark.svelte.ts](src/lib/stores/bookmark.svelte.ts), [history.svelte.ts](src/lib/stores/history.svelte.ts), [unifiedHistory.svelte.ts](src/lib/stores/unifiedHistory.svelte.ts)                                                                              | 书签、阅读历史                              |
| **文件浏览**    | [fileBrowser.svelte.ts](src/lib/stores/fileBrowser.svelte.ts), [folderTreeCache.ts](src/lib/stores/folderTreeCache.ts), [folderTreePin.svelte.ts](src/lib/stores/folderTreePin.svelte.ts), [folderSizeCache.svelte.ts](src/lib/stores/folderSizeCache.svelte.ts) | 文件浏览器、文件夹树缓存/固定               |
| **UI 布局**     | [ui.svelte.ts](src/lib/stores/ui.svelte.ts), [sidebarConfig.svelte.ts](src/lib/stores/sidebarConfig.svelte.ts), [cardConfig.svelte.ts](src/lib/stores/cardConfig.svelte.ts)                                                                                      | 侧边栏、面板配置、卡片管理                  |
| **缩略图**      | [thumbnailStoreV3.svelte.ts](src/lib/stores/thumbnailStoreV3.svelte.ts), [thumbnailCache.svelte.ts](src/lib/stores/thumbnailCache.svelte.ts)                                                                                                                     | V3 缩略图系统（复刻 NeeView 架构）          |
| **视图状态**    | [viewState.svelte.ts](src/lib/stores/viewState.svelte.ts), [viewContext.svelte.ts](src/lib/stores/viewContext.svelte.ts), [panorama.svelte.ts](src/lib/stores/panorama.svelte.ts)                                                                                | 视图模式/缩放/旋转、全景模式                |
| **快捷键**      | [keybindings/](src/lib/stores/keybindings/), [keyboard.svelte.ts](src/lib/stores/keyboard.svelte.ts)                                                                                                                                                             | 键盘绑定系统                                |
| **超分**        | [upscale/](src/lib/stores/upscale/)                                                                                                                                                                                                                              | 超分模型管理与状态                          |
| **视频/幻灯片** | [video.svelte.ts](src/lib/stores/video.svelte.ts), [slideshow.svelte.ts](src/lib/stores/slideshow.svelte.ts)                                                                                                                                                     | 视频播放、幻灯片控制                        |
| **AI**          | [ai/](src/lib/stores/ai/), [aiApiConfig.svelte.ts](src/lib/stores/aiApiConfig.svelte.ts)                                                                                                                                                                         | AI 集成（Ollama）                           |
| **语音**        | [voice/](src/lib/stores/voice/)                                                                                                                                                                                                                                  | 语音控制                                    |
| **翻译**        | [translation/](src/lib/stores/translation/)                                                                                                                                                                                                                      | 翻译功能                                    |
| **设置**        | [bookSettings.svelte.ts](src/lib/stores/bookSettings.svelte.ts), [settingsOverlay.svelte.ts](src/lib/stores/settingsOverlay.svelte.ts), [settingsManager/](src/lib/stores/settingsManager/)                                                                      | 各种持久化设置                              |
| **其他**        | [filterStore.svelte.ts](src/lib/stores/filterStore.svelte.ts), [loadModeStore.svelte.ts](src/lib/stores/loadModeStore.svelte.ts), [pipelineLatency.svelte.ts](src/lib/stores/pipelineLatency.svelte.ts), [gistSync.svelte.ts](src/lib/stores/gistSync.svelte.ts) | 颜色滤镜、加载模式、性能延迟监控、Gist 同步 |

---

### 四、组件体系

#### 布局层 ([src/lib/components/layout/](src/lib/components/layout/))

`MainLayout` → `TitleBar` + `TopToolbar` + `LeftSidebar` / `RightSidebar` + `BottomThumbnailBar` + `StatusBar`，支持自动隐藏工具栏和缩略图栏。

#### 面板层 ([src/lib/components/panels/](src/lib/components/panels/))

约 **40+ 面板组件**，包括：

- 浏览：`BookPageListPanel`, `BookmarkPanel`, `HistoryPanel`, `PlaylistPanel`
- 文件：`folderPanel/`（含独立 stores）, `file/`
- 设置：`SettingsPanel`, `GeneralSettingsPanel`, `ImageSettingsPanel`, `ViewSettingsPanel`, `PerformanceSettingsPanel`, `SystemSettingsPanel`, `ThemePanel` 等
- 功能：`UpscalePanel`（超分）, `AiPanel`, `DataInsightsPanel`, `BenchmarkPanel`, `InfoPanel`, `ImagePropertiesPanel`
- 管理：`SidebarManagementPanel`, `GistSyncPanel`, `StartupConfigPanel`

#### 查看器层 ([src/lib/viewer/](src/lib/viewer/) + [src/lib/components/viewer/](src/lib/components/viewer/))

- `NeoViewer.svelte` — 新一代查看器主组件（手势、缩放、旋转、裁剪）
- `ImageRenderer.svelte` — 底层图片渲染（CSS transform + clip-path）
- `GestureHandler.ts` — 手势处理器（触摸、鼠标、双击）
- `BackgroundVideo.svelte`, `VideoPlayer/`, `Magnifier.svelte`, `SlideshowControl.svelte`

#### 核心引擎 ([src/lib/core/](src/lib/core/))

- `bookManager.ts` — 门面类，协调各模块
- `virtualPageList.ts` — NeeView 风格虚拟页面系统（横向页面分割→两个虚拟页面）
- `pageFrameManager.ts` — 页面帧管理（双页模式）
- `preloadPipeline.ts` — 预加载管道
- `viewerController.ts` — 查看器控制器
- `windows/` — 卡片窗口管理系统
- `ipc/`, `cache/`, `imageData/`, `state/`, `tabs/`, `tasks/`

---

### 五、Viewer 架构

项目文档分析了 4 种架构方案，**采用方案 A「层叠式 (Stack-based)」**：

```
┌─ Viewer Container ──────────────────────────┐
│  Layer 4: 超分层 (z=4, 可选覆盖)             │
│  Layer 3: 当前页 (z=3, 可见)                 │
│  Layer 2: 后页   (z=2, opacity:0, 预加载)    │
│  Layer 1: 前页   (z=1, opacity:0, 预加载)    │
└─────────────────────────────────────────────┘
```

**优势：** 无闪屏翻页（图片已预加载，切换仅改 z-index/opacity）、超分无缝叠加、CSS 动画过渡。

**页面系统（NeeView 风格）：**

- **PhysicalPage** → 实际图片文件
- **VirtualPage** → 显示单位（完整页 / 横向页的左半/右半，通过 `clip-path: inset()` 裁剪，不复制数据）
- **PageFrame** → 当前帧（可含多个 VirtualPage，支持双页模式）

---

### 六、Rust 后端能力 ([src-tauri/src/](src-tauri/src/))

#### 核心模块 (`core/`, 约 60+ 模块)

| 模块                                                                                                     | 功能                                                           |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **archive**/`archive_manager`/`streaming_archive`/`mmap_archive`                                         | 压缩包管理（ZIP/RAR/7z 等）、流式解压、内存映射                |
| **page_manager**                                                                                         | 页面内容管理（PageContentManager）、内存池、FileProxy 临时文件 |
| **image_decoder**/`image_loader`/`image_cache`/`lru_image_cache`                                         | 图片解码（含 JXL/AVIF）、加载、LRU 缓存                        |
| **thumbnail_service_v3**/`thumbnail_db`/`thumbnail_generator`                                            | V3 缩略图服务、SQLite 数据库、缩略图生成                       |
| **directory_cache**/`directory_stream`/`file_indexer`                                                    | 目录缓存、流式目录扫描、文件索引                               |
| **job_engine**                                                                                           | 任务引擎（优先级队列、工作线程调度）                           |
| **background_scheduler**                                                                                 | 后台任务调度器（缩略图生成、缓存维护等）                       |
| **custom_protocol**                                                                                      | `neoview://` 自定义协议，绕过 Tauri invoke 直接传输二进制数据  |
| **blob_registry**                                                                                        | Blob 注册表（内存中的二进制数据管理）                          |
| **dimension_cache**/`dimension_scanner`                                                                  | 图片尺寸缓存与批量扫描                                         |
| **upscale**/`upscale_scheduler`/`upscale_service`/`generic_upscaler`/`pyo3_upscaler`/`sr_vulkan_manager` | 超分调度、PyO3 Python 桥接、SR-Vulkan 管理                     |
| **book_manager**/`data_source`                                                                           | 书籍管理、数据源                                               |
| **buffer_pool**/`request_dedup`/`fast_path`/`batch_write`                                                | 缓冲池、请求去重、快速路径、批量写入等性能优化                 |
| **shell_thumbnail**/`wic_decoder`                                                                        | Windows Shell 缩略图、WIC 解码器                               |
| **video_thumbnail**/`video_exts`                                                                         | 视频缩略图（ffmpeg sidecar）、视频格式识别                     |
| **ebook**                                                                                                | 电子书支持                                                     |
| **explorer_context_menu**                                                                                | Windows 资源管理器右键菜单集成                                 |

#### Tauri 命令 (`commands/`, 30+ 命令文件)

涵盖：文件系统、压缩包缓存、图片数据/命令、缩略图（V3）、页面管理、超分（通用/PyO3/调度/设置）、视频、流式传输、系统监控、任务队列、Ollama AI、EMM 元数据、启动配置、基准测试、协议注册等。

---

### 七、TODO 与待实现项

根据 [docs/NEOVIEW_TODO.md](docs/NEOVIEW_TODO.md)，主要待办：

| 优先级 | 功能                                                         | 状态             |
| ------ | ------------------------------------------------------------ | ---------------- |
| 🔴 高  | PageContent 多态设计（Bitmap/Media/Animated/Archive Loader） | 设计完成，待实现 |
| 🔴 高  | 压缩包内视频处理（FileProxy 临时文件回退）                   | 部分实现         |
| 🔴 高  | 内存压力处理（BookMemoryService 式驱逐）                     | 待实现           |
| 中     | 嵌套压缩包展开                                               | 只有检测日志     |
| 低     | PDF/SVG 支持                                                 | 不支持           |
| 低     | 动图支持（GIF/APNG/WebP）                                    | 浏览器自动处理   |

根据 [TODO.md](TODO.md)，还有大量 NeeView UI 细节待实现：

- 页面移动超过尾页行为（无变化/下一本/循环/无缝循环）
- 触控功能（单点/多点触控、捏合缩放/旋转）
- 幻灯片（循环、计时器、鼠标重置间隔）
- 自动隐藏面板（焦点模式、显示/隐藏时间、面板宽度）
- 列表项目样式、弹窗详情
- 各种持久化设置的完善

---

### 八、架构总结图

```
┌─── 前端 (Svelte 5 + Vite) ────────────────────────────────────┐
│  App.svelte → MainLayout                                       │
│    ├─ TopToolbar / TitleBar                                    │
│    ├─ LeftSidebar (面板: 文件夹/书签/历史/设置/超分/AI...)       │
│    ├─ NeoViewer (层叠式: prev→current→next→upscale)            │
│    ├─ RightSidebar                                             │
│    └─ BottomThumbnailBar (V3 缩略图)                           │
│  Stores: 60+ .svelte.ts 文件 (Svelte 5 Runes)                 │
│  Core: bookManager + virtualPageList + pageFrameManager        │
│         + preloadPipeline + viewerController                   │
├─── Tauri IPC + neoview:// 协议 ────────────────────────────────┤
│  Rust 后端                                                     │
│    ├─ 压缩包引擎 (ZIP/RAR/7z, 流式/mmap)                      │
│    ├─ 图片解码器 (JXL/AVIF/WebP/常规, WIC)                     │
│    ├─ 缩略图服务 V3 (SQLite + LRU + 后台调度)                  │
│    ├─ 页面管理器 (内存池 + 优先级加载)                          │
│    ├─ 超分引擎 (PyO3 → Python / SR-Vulkan)                    │
│    ├─ Job Engine (优先级队列 + 工作线程)                        │
│    └─ 目录缓存/流式扫描/文件索引                                │
└────────────────────────────────────────────────────────────────┘
```

这是一个**功能丰富、架构复杂**的桌面图像查看器项目，已实现主要阅读流程和核心性能优化，正在向完全复刻 NeeView 体验的方向持续迭代。
