# NeoView

<p align="center">
  <img src="./src-tauri/icons/128x128.png" width="96" alt="NeoView 图标" />
</p>

<p align="center">简体中文 · <a href="./readme_en.md">English</a></p>

本地优先的桌面图片 / 漫画查看器：**Tauri 2 + Svelte 5 + Rust**，规划中的超分链路走 **PyO3** 调 Python 模型。
目标是把 [NeeView](https://github.com/neelabo/NeeView) 的阅读体验搬到现代技术栈上，并针对**大体积本地图库**重做缩略图与目录缓存。

- **下载**：Windows 安装包（`.msi` / `setup.exe`）在 [releases](https://github.com/HibernalGlow/neoview/releases) 提供；开发与打包都主要在 Windows 上。
- **包管理器是 pnpm**：仓库里是 `pnpm-lock.yaml` + `pnpm-workspace.yaml`，CI 跑 `pnpm install --frozen-lockfile`。
- **代码位置**：前端在仓库根的 `src/`，Rust 侧在 `src-tauri/`，没有嵌套的子工程目录。

## 功能概览

- **高性能本地图库浏览**
  - 支持文件夹 / 压缩包浏览
  - 历史记录、书签、文件浏览器面板
- **多视图模式（进行中）**
  - 单页、双页、纵向滚动、全景模式等
  - 随机跳页窗口、预加载窗口等体验对齐 NeeView
- **缩略图系统**
  - Rust + SQLite 持久化索引（`directory_cache` / `thumbnail_cache`）
  - 批量查询、虚拟列表优先加载、预测性加载、LRU 内存缓存
  - 后台任务队列统一调度缩略图生成与缓存维护
- **主题与外观**
  - 内置多套预设主题（Amethyst Haze / Ocean Breeze / Forest Mist / Sunset Glow）
  - 支持从 [tweakcn.com](https://tweakcn.com/editor/theme) 导入自定义主题
  - 跟随系统 / 浅色 / 深色模式切换
  - 支持 UI 组件（弹窗、菜单）背景磨砂/模糊效果
- **超分与图像处理（规划中）**
  - 通过 PyO3 调用 Python 模型（如 RealCUGAN / Waifu2x 等）
  - 计划支持多模型管理与比较模式
- **智能语音控制**
  - 基于 Web Speech API 的实时语音指令系统
  - 支持自然语言控制翻页、缩放、视图切换、文件导航等
  - 可视化语音状态悬浮窗与指令反馈

更多设计背景见文末「进阶文档」。

## 技术栈

- **前端**
  - [Svelte 5](https://svelte.dev/) + [Vite 6](https://vitejs.dev/)
  - [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn-svelte](https://next.shadcn-svelte.com/)
- **客户端壳层**
  - [Tauri 2](https://tauri.app/)（配置见 `src-tauri/tauri.conf.json`）
- **后端 / 引擎（Rust）**
  - 缩略图 / 目录缓存：`image`, `jxl-oxide`, `zip`, `rusqlite`, `walkdir` 等
  - 后台任务队列与调度器：自定义 `BackgroundTaskScheduler`
  - CLI / 文件系统插件：`tauri-plugin-cli`, `tauri-plugin-fs`, `ffmpeg-sidecar`
- **其他**
  - `PyO3` + Python 生态：用于超分与模型推理（需单独安装 Python 与模型）

## 目录结构（简要）

都在仓库根目录：

- `src/`  
  Svelte 5 前端代码（面板、查看器、状态管理、缩略图管理、主题系统等）。
- `src-tauri/`  
  Tauri 2 + Rust 后端：命令定义（`commands/thumbnail_commands`、`commands/benchmark_commands` 等）、缩略图与目录缓存、后台调度器。
- `docs/`  
  面向开发者的设计文档，清单见文末「进阶文档」。
- `scripts/`  
  辅助脚本：`thumbnail_batch_cli.py`（缩略图批量预生成）、`bump_version.py`、`batch_model_benchmark.py`。

## 环境要求

请先确保本机满足 Tauri 2 的官方先决条件。

- **Node.js**：建议 20+（推荐通过 nvm / nvm-windows 安装）
- **pnpm**：前端包管理器（仓库里是 `pnpm-lock.yaml` + `pnpm-workspace.yaml`）
- **Rust**：通过 [rustup](https://www.rust-lang.org/) 安装最新版 Rust
- **Windows 额外依赖**（推荐，因为本项目主要在 Windows 上开发调试）
  - 安装 Visual Studio / Build Tools，并勾选「Desktop development with C++」
- **可选**
  - Python 3.12+（用于缩略图批量 CLI 与后续超分模型）
  - `ffmpeg`（生成视频缩略图时使用）

## 快速开始

在仓库根目录执行以下步骤。

### 1. 安装依赖

```bash
pnpm install
```

首次安装会拉取前端依赖与 Tauri CLI。

### 2. 启动开发环境

仅启动前端 Vite 开发服务器：

```bash
pnpm dev
```

启动完整的 Tauri 桌面应用（会自动调用 `pnpm dev` 并挂载到 Tauri 窗口）：

```bash
pnpm tauri dev
```

默认开发地址为 `http://localhost:1420`（见 `src-tauri/tauri.conf.json`）。

### 3. 构建与打包

仅构建前端静态资源（输出到 `dist/`）：

```bash
pnpm build
```

构建桌面应用安装包 / 可执行文件：

```bash
pnpm tauri build
```

Tauri 会针对当前平台生成安装包与可执行程序。

## 常用脚本

`package.json` 中提供了以下脚本（用 **pnpm** 调用）：

- `pnpm dev`  
  启动 Vite 开发服务器。
- `pnpm build`  
  构建前端静态资源。
- `pnpm preview`  
  本地预览已构建的前端。
- `pnpm check`  
  使用 `svelte-check` 与 `tsc` 做类型检查。
- `pnpm format`  
  使用 Prettier 格式化项目。
- `pnpm lint`  
  使用 Prettier + ESLint 检查代码风格。
- `pnpm tauri dev` / `pnpm tauri build`  
  通过 Tauri CLI 启动开发桌面应用 / 打包发行版。
- `pnpm run test:rust:stream`  
  运行目录流自动测试（包含临时数据集性能 smoke 测试 + 真实数据集测试）。
- `pnpm run test:rust:stream:real`  
  仅运行真实数据集测试（默认目录 `E:\1Hub\EH`）。
- `pnpm run test:rust:stream:bench`  
  单线程稳定模式运行目录流性能测试，便于前后版本对比。
- `pnpm run test:rust:stream:sweep`  
  对阅读体验相关参数做组合测试（批次大小、隐藏文件过滤），输出排名。
- `pnpm run test:reading:sweep`  
  对前端阅读体验参数做组合测试（预加载窗口、IPC 批处理），输出排名。
- `pnpm run test:perf:balanced`  
  一键运行平衡档性能回归（固定样本 + 5 轮统计）。
- `pnpm run test:perf:aggressive`  
  一键运行激进档性能回归（固定样本 + 10 轮统计 + 平均吞吐门槛）。

### 真实数据集测试（可自定义）

默认使用 `E:\1Hub\EH` 作为测试目录；你可以通过环境变量覆盖：

```bash
# PowerShell
$env:NEOVIEW_TEST_DATASET_DIR = "E:\\1Hub\\EH"
$env:NEOVIEW_TEST_TIMEOUT_SECS = "90"
$env:NEOVIEW_TEST_SAMPLE_COUNT = "3"
$env:NEOVIEW_TEST_MIN_DIRECT_CHILDREN = "20"
$env:NEOVIEW_TEST_SAMPLE_SEED = "20260327"
$env:NEOVIEW_TEST_SAMPLE_LIST_FILE = ".cache/perf_samples.txt"
$env:NEOVIEW_TEST_RUNS = "10"
$env:NEOVIEW_TEST_BATCH_SIZES = "10,15,24,32,50"
$env:NEOVIEW_TEST_SKIP_HIDDEN_MODES = "true,false"
$env:NEOVIEW_STREAM_REAL_MIN_AVG_ITEMS_PER_SEC = "5000"
pnpm run test:rust:stream:real
```

- `NEOVIEW_TEST_DATASET_DIR`：真实测试目录路径（可自定义）
- `NEOVIEW_TEST_TIMEOUT_SECS`：测试超时秒数（默认 60）
- `NEOVIEW_TEST_SAMPLE_COUNT`：从目录内部随机抽取的子目录样本数（默认 3）
- `NEOVIEW_TEST_MIN_DIRECT_CHILDREN`：候选子目录的最小直接子项数量（默认 20）
- `NEOVIEW_TEST_SAMPLE_SEED`：随机抽样固定种子（默认 `20260327`）
- `NEOVIEW_TEST_SAMPLE_LIST_FILE`：样本列表文件路径（存在则直接复用，不存在则生成导出）
- `NEOVIEW_TEST_RUNS`：真实数据集测试重复运行次数（用于 avg/p95 统计，默认 1）
- `NEOVIEW_TEST_BATCH_SIZES`：参数 sweep 时测试的批次大小列表（逗号分隔）
- `NEOVIEW_TEST_SKIP_HIDDEN_MODES`：参数 sweep 时测试的隐藏文件过滤模式（`true,false`）
- `NEOVIEW_STREAM_REAL_MIN_AVG_ITEMS_PER_SEC`：真实数据集多轮平均吞吐下限（低于则失败）

如果目录不存在，真实数据集测试会自动跳过，不会导致测试失败。

测试输出会包含性能指标，例如：

```text
[PERF][real] dataset=E:\1Hub\EH items=12345 batches=280 elapsed_ms=950 throughput=12994.74 items/s
```

真实数据集测试会先在 `NEOVIEW_TEST_DATASET_DIR` 内部递归发现候选子目录，然后随机抽样执行扫描；输出包括每个样本和 aggregate 汇总指标，避免只测顶层目录导致结果失真。

如果设置了 `NEOVIEW_TEST_SAMPLE_LIST_FILE`，测试会把本轮样本集导出到该文件；后续运行将直接复用，保证对比稳定。

如果你要挑默认参数，建议直接运行：

```bash
pnpm run test:rust:stream:sweep
```

输出会给出每组参数的 aggregate 吞吐和 best->worst 排名，可直接用于决定 `batch_size` 与 `skip_hidden` 的默认组合。

同时，前端阅读参数也提供 sweep：

```bash
pnpm run test:reading:sweep
```

该测试会输出两组排名：

- Preloader：`preloadAhead/preloadBehind` 组合在模拟翻页序列下的命中率与预加载成本。
- IPCBatcher：`batchWindowMs/maxBatchSize` 组合在请求波峰场景下的 P95 延迟与吞吐。

推荐一键档位：

```bash
pnpm run test:perf:balanced
pnpm run test:perf:aggressive
```

这两个脚本会统一固定样本集并串行执行目录 real/sweep 与阅读 sweep，直接用于版本前后对比。

你也可以设置基线吞吐来自动检测回归：

```bash
# PowerShell 示例：设置真实数据集基线吞吐
$env:NEOVIEW_STREAM_REAL_BASELINE_ITEMS_PER_SEC = "12000"
pnpm run test:rust:stream:real
```

可用基线环境变量：

- `NEOVIEW_STREAM_SMOKE_BASELINE_ITEMS_PER_SEC`
- `NEOVIEW_STREAM_REAL_BASELINE_ITEMS_PER_SEC`

当当前吞吐低于基线时，测试会失败并提示 regression。

## 缩略图批量 CLI（可选）

为了在首次打开大型图库时避免卡顿，可以使用独立 CLI 预先生成缩略图并写入数据库。  
脚本是 `scripts/thumbnail_batch_cli.py`，这里仅给出简要概览。

### 依赖

- Python 3.12+
- Pillow：`pip install pillow`
- 可选：`ffmpeg`（启用 `--videos` 时用于抽帧）

### 基本用法示例

```bash
# 使用 uv（推荐）：
uv run python scripts/thumbnail_batch_cli.py D:/Comics/Series1 \
  --thumbnail-root D:/NeoView/cache/thumbnails \
  --library-root D:/Comics \
  --recursive --archives --videos --yes
```

核心参数说明：

- `scan_dir`：要扫描的根目录
- `--thumbnail-root`：缩略图与数据库目录
- `--library-root`：用于计算逻辑路径的根目录
- `--recursive`：递归扫描子目录
- `--archives` / `--videos`：处理压缩包 / 视频文件
- `--dry-run`：仅打印将执行的操作，不真正写入

## 进阶文档与架构

仓库内的设计文档（`docs/`）：

- `NeeView 架构与功能综合分析报告.md` —— NeeView 的功能拆解，即本项目的复刻基准。
- `NeoView-Tauri 项目综合研究报告.md` —— 当前实现的整体研究：模块划分与完成度。
- `TAURI_PERFORMANCE_OPTIMIZATION_PLAN.md` —— 缩略图批量加载、虚拟列表、预测性加载、LRU 缓存的性能路线。
- `IMAGE_TRIM_SYSTEM_DESIGN.md` —— 图像裁剪子系统设计。
- `READER_BACKEND_MIGRATION_EXECUTION_BRIEF.md` —— 阅读后端迁移的执行说明。

这些文档主要面向参与开发 / 重构的贡献者。

## 当前状态

本项目仍处于快速迭代阶段，最新版本 `6.1.6`（Windows 安装包见 releases）。部分 NeeView 特性仍在实现或打磨中，例如：

- 双页 / 全景模式的完整交互与性能优化
- Library / 书架视图与更多格式支持（7z / rar / epub / pdf 等）
- 多开与多标签模式
- 超分模型管理与比较模式

如果你只作为用户体验图片/漫画浏览功能，当前版本已经可以日常使用；  
如果你希望参与开发，建议从 `docs/NeoView-Tauri 项目综合研究报告.md` 与 `docs/TAURI_PERFORMANCE_OPTIMIZATION_PLAN.md` 开始读。
