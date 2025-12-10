# NeoView (Tauri + Svelte 5)

![NeoView 图标](./src-tauri/icons/128x128.png)

[![zread](https://img.shields.io/badge/Ask_Zread-_.svg?style=flat&color=00b0aa&labelColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQuOTYxNTYgMS42MDAxSDIuMjQxNTZDMS44ODgxIDEuNjAwMSAxLjYwMTU2IDEuODg2NjQgMS42MDE1NiAyLjI0MDFWNC45NjAxQzEuNjAxNTYgNS4zMTM1NiAxLjg4ODEgNS42MDAxIDIuMjQxNTYgNS42MDAxSDQuOTYxNTZDNS4zMTUwMiA1LjYwMDEgNS42MDE1NiA1LjMxMzU2IDUuNjAxNTYgNC45NjAxVjIuMjQwMUM1LjYwMTU2IDEuODg2NjQgNS4zMTUwMiAxLjYwMDEgNC45NjE1NiAxLjYwMDFaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00Ljk2MTU2IDEwLjM5OTlIMi4yNDE1NkMxLjg4ODEgMTAuMzk5OSAxLjYwMTU2IDEwLjY4NjQgMS42MDE1NiAxMS4wMzk5VjEzLjc1OTlDMS42MDE1NiAxNC4xMTM0IDEuODg4MSAxNC4zOTk5IDIuMjQxNTYgMTQuMzk5OUg0Ljk2MTU2QzUuMzE1MDIgMTQuMzk5OSA1LjYwMTU2IDE0LjExMzQgNS42MDE1NiAxMy43NTk5VjExLjAzOTlDNS42MDE1NiAxMC42ODY0IDUuMzE1MDIgMTAuMzk5OSA0Ljk2MTU2IDEwLjM5OTlaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik0xMy43NTg0IDEuNjAwMUgxMS4wMzg0QzEwLjY4NSAxLjYwMDEgMTAuMzk4NCAxLjg4NjY0IDEwLjM5ODQgMi4yNDAxVjQuOTYwMUMxMC4zOTg0IDUuMzEzNTYgMTAuNjg1IDUuNjAwMSAxMS4wMzg0IDUuNjAwMUgxMy43NTg0QzE0LjExMTkgNS42MDAxIDE0LjM5ODQgNS4zMTM1NiAxNC4zOTg0IDQuOTYwMVYyLjI0MDFDMTQuMzk4NCAxLjg4NjY0IDE0LjExMTkgMS42MDAxIDEzLjc1ODQgMS42MDAxWiIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNCAxMkwxMiA0TDQgMTJaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00IDEyTDEyIDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K&logoColor=ffffff)](https://zread.ai/HibernalGlow/neoview)

[English README](./readme_en.md)

NeoView 是一个桌面端图片 / 漫画查看器应用。
本目录基于 **Tauri 2 + Svelte 5 + Rust + PyO3**，目标是在现代技术栈上复刻 [NeeView](https://github.com/neelabo/NeeView)阅读器的核心体验，同时针对大体积本地图库做了大量性能优化（缩略图缓存、批量加载、后台任务调度等）。

## 功能概览

- **高性能本地图库浏览**
  - 支持文件夹 / 压缩包浏览
  - 历史记录、书签、文件浏览器面板
- **多视图模式（进行中）**
  - 单页、双页、纵向滚动、全景模式等
  - 随机跳页窗口、预加载窗口等体验
  - 随机跳页窗口、预加载窗口等体验对齐 NeeView（详见 `docs/neeview_revamp_plan.md`）
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

更多架构与规划请参考：`docs/neeview_revamp_plan.md`。

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

位于 `neoview/neoview-tauri` 目录下：

- `src/`  
  Svelte 5 前端代码（面板、查看器、状态管理、缩略图管理、主题系统等）。
- `src-tauri/`  
  Tauri 2 + Rust 后端：命令定义、缩略图与目录缓存、后台调度器等。
- `docs/`  
  面向开发者的设计文档：
  - `neeview_revamp_plan.md`：NeeView 功能复刻总体规划与阶段进度
  - `thumbnail-optimization.md` / `THUMBNAIL_OPTIMIZATION_FEATURES.md`：缩略图加载与缓存优化
  - `THEME_SYSTEM.md` / `THEME_SETTINGS.md`：主题系统与外观设置说明
- `docs/THUMBNAIL_BATCH_CLI.md`  
  缩略图批量 CLI 工具说明。
- `scripts/`  
  辅助脚本（例如 `thumbnail_batch_cli.py`）。
- `ref/`  
  参考实现与历史项目快照（如早期 Tauri 模板、Rust 版本 demo 等）。

## 环境要求

请先确保本机满足 Tauri 2 的官方先决条件。

- **Node.js**：建议 20+（推荐通过 nvm / nvm-windows 安装）
- **Yarn**：作为前端包管理器
  - Node 16+ 可直接使用 `corepack enable` 启用 Yarn
- **Rust**：通过 [rustup](https://www.rust-lang.org/) 安装最新版 Rust
- **Windows 额外依赖**（推荐，因为本项目主要在 Windows 上开发调试）
  - 安装 Visual Studio / Build Tools，并勾选「Desktop development with C++」
- **可选**
  - Python 3.12+（用于缩略图批量 CLI 与后续超分模型）
  - `ffmpeg`（生成视频缩略图时使用）

## 快速开始

在 `neoview/neoview-tauri` 目录中执行以下步骤。

### 1. 安装依赖

```bash
## 推荐
yarn

## 或显式
yarn install
```

首次安装会拉取前端依赖与 Tauri CLI。

### 2. 启动开发环境

仅启动前端 Vite 开发服务器：

```bash
yarn dev
```

启动完整的 Tauri 桌面应用（会自动调用 `yarn dev` 并挂载到 Tauri 窗口）：

```bash
yarn tauri dev
```

默认开发地址为 `http://localhost:1420`（见 `src-tauri/tauri.conf.json`）。

### 3. 构建与打包

仅构建前端静态资源（输出到 `dist/`）：

```bash
yarn build
```

构建桌面应用安装包 / 可执行文件：

```bash
yarn tauri build
```

Tauri 会针对当前平台生成安装包与可执行程序。

## 常用脚本

`package.json` 中提供了以下脚本（全部通过 **Yarn** 调用）：

- `yarn dev`  
  启动 Vite 开发服务器。
- `yarn build`  
  构建前端静态资源。
- `yarn preview`  
  本地预览已构建的前端。
- `yarn check`  
  使用 `svelte-check` 与 `tsc` 做类型检查。
- `yarn format`  
  使用 Prettier 格式化项目。
- `yarn lint`  
  使用 Prettier + ESLint 检查代码风格。
- `yarn tauri dev` / `yarn tauri build`  
  通过 Tauri CLI 启动开发桌面应用 / 打包发行版。

## 缩略图批量 CLI（可选）

为了在首次打开大型图库时避免卡顿，可以使用独立 CLI 预先生成缩略图并写入数据库。  
详细说明见 `docs/THUMBNAIL_BATCH_CLI.md`，这里仅给出简要概览。

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

如果你希望深入理解 NeoView 的内部结构与 NeeView 复刻计划，可以阅读：

- `docs/neeview_revamp_plan.md`  
  完整的阶段规划、架构设计与当前完成度说明。
- `docs/thumbnail-optimization.md` / `docs/THUMBNAIL_OPTIMIZATION_FEATURES.md`  
  缩略图批量加载、虚拟列表、预测性加载、LRU 缓存等实现细节。
- `docs/THEME_SYSTEM.md` / `docs/THEME_SETTINGS.md`  
  主题系统设计、颜色变量与 tweakcn 集成。

这些文档主要面向参与开发 / 重构的贡献者。

## 当前状态

本项目仍处于快速迭代阶段，部分 NeeView 特性仍在实现或打磨中，例如：

- 双页 / 全景模式的完整交互与性能优化
- Library / 书架视图与更多格式支持（7z / rar / epub / pdf 等）
- 多开与多标签模式
- 超分模型管理与比较模式

如果你只作为用户体验图片/漫画浏览功能，当前版本已经可以日常使用；  
如果你希望参与开发，建议从 `docs/neeview_revamp_plan.md` 与缩略图 / 主题相关文档开始阅读。
