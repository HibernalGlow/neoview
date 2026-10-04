# NeoView

<p align="center">
  <img src="./src-tauri/icons/128x128.png" width="96" alt="NeoView icon" />
</p>

<p align="center"><a href="./README.md">简体中文</a> &middot; English</p>

A local-first desktop image / manga viewer on **Tauri 2 + Svelte 5 + Rust**, with super-resolution planned through **PyO3**.
The goal is NeeView's reading feel on a modern stack, with the thumbnail and directory cache rebuilt for **large local libraries**.

- **Download**: Windows installers (`.msi` / `setup.exe`) on [releases](https://github.com/HibernalGlow/neoview/releases); development and packaging are Windows-first.
- **Package manager is pnpm**: `pnpm-lock.yaml` + `pnpm-workspace.yaml`, and CI runs `pnpm install --frozen-lockfile`.
- **Layout**: frontend in `src/`, Rust in `src-tauri/`, both at the repository root. There is no nested project directory.

## Feature Overview

- **High-performance local library browsing**
  - Browse folders / archives
  - History, bookmarks, file browser panel
- **Multiple view modes (in progress)**
  - Single page, two-page spread, vertical scroll, panorama
  - Random jump window and preload window, matched to NeeView
- **Thumbnail system**
  - Rust + SQLite persistent index (`directory_cache` / `thumbnail_cache`)
  - Batch queries, virtual list priority loading, predictive loading, LRU memory cache
  - Centralized background task queue for thumbnail generation and cache maintenance
- **Themes and appearance**
  - Multiple built-in themes (Amethyst Haze / Ocean Breeze / Forest Mist / Sunset Glow)
  - Import custom themes from [tweakcn.com](https://tweakcn.com/editor/theme)
  - System / light / dark mode switching
- **Super-resolution & image processing (planned)**
  - Call Python models (e.g. RealCUGAN / Waifu2x) via PyO3
  - Planned multi-model management and comparison mode

## Tech Stack

- **Frontend**
  - [Svelte 5](https://svelte.dev/) + [Vite 6](https://vitejs.dev/)
  - [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn-svelte](https://next.shadcn-svelte.com/)
- **Client shell**
  - [Tauri 2](https://tauri.app/) (see `src-tauri/tauri.conf.json`)
- **Backend / engine (Rust)**
  - Thumbnails / directory cache: `image`, `jxl-oxide`, `zip`, `rusqlite`, `walkdir`, etc.
  - Background task queue and scheduler: custom `BackgroundTaskScheduler`
  - CLI / filesystem plugins: `tauri-plugin-cli`, `tauri-plugin-fs`, `ffmpeg-sidecar`
- **Others**
  - `PyO3` + Python ecosystem for super-resolution and inference (Python and models required)

## Directory Structure (brief)

Both at the repository root:

- `src/`  
  Svelte 5 frontend code (panels, viewer, state management, thumbnails, theme system, etc.).
- `src-tauri/`  
  Tauri 2 + Rust backend: commands (e.g. `commands/thumbnail_commands`, `commands/benchmark_commands`), thumbnail and directory cache, background scheduler.
- `docs/`  
  Developer-facing design docs, listed under "Status / further reading" below.
- `scripts/`  
  Helper scripts: `thumbnail_batch_cli.py`, `bump_version.py`, `batch_model_benchmark.py`.

## Requirements

Please make sure your system satisfies the official Tauri 2 prerequisites.

- **Node.js**: 20+ (recommended via nvm / nvm-windows)
- **pnpm**: the frontend package manager (`pnpm-lock.yaml` + `pnpm-workspace.yaml`)
- **Rust**: latest via [rustup](https://www.rust-lang.org/)
- **Windows extra dependencies** (recommended, main development platform)
  - Install Visual Studio / Build Tools with "Desktop development with C++"
- **Optional**
  - Python 3.12+ (for thumbnail batch CLI and later super-resolution models)
  - `ffmpeg` (for video thumbnails)

## Quick Start

From the repository root:

### 1. Install dependencies

```bash
pnpm install
```

This installs frontend dependencies and the Tauri CLI.

### 2. Start development

```bash
# Vite dev server only
pnpm dev

# Full Tauri desktop app (runs `pnpm dev` internally)
pnpm tauri dev
```

Default dev URL: `http://localhost:1420` (see `src-tauri/tauri.conf.json`).

### 3. Build and bundle

```bash
# Frontend build only (outputs to `dist/`)
pnpm build

# Desktop app bundles / executables
pnpm tauri build
```

Tauri will create platform-specific installers / executables.

## Common Scripts

All scripts in `package.json` are run via **pnpm**:

- `pnpm dev` — start the Vite dev server.
- `pnpm build` — build frontend assets.
- `pnpm preview` — preview the built frontend.
- `pnpm check` — type checking via `svelte-check` and `tsc`.
- `pnpm format` — format using Prettier.
- `pnpm lint` — lint with Prettier + ESLint.
- `pnpm tauri dev` / `pnpm tauri build` — use the Tauri CLI to run or package the desktop app.
- `pnpm run test:rust:stream` / `test:rust:stream:sweep` / `test:reading:sweep` / `test:perf:balanced` — Rust and frontend performance suites; see the Chinese README for the environment variables they read.

## Thumbnail Batch CLI (optional)

To avoid stutter when opening a large library for the first time, you can pre-generate thumbnails and write them to the database.  
The script is `scripts/thumbnail_batch_cli.py`.

Basic usage example:

```bash
# Using uv (recommended):
uv run python scripts/thumbnail_batch_cli.py D:/Comics/Series1 \
  --thumbnail-root D:/NeoView/cache/thumbnails \
  --library-root D:/Comics \
  --recursive --archives --videos --yes
```

Key parameters:

- `scan_dir`: root directory to scan
- `--thumbnail-root`: thumbnail and database directory
- `--library-root`: root directory used for logical paths
- `--recursive`: scan subdirectories
- `--archives` / `--videos`: process archives / videos
- `--dry-run`: print actions without writing

## Status

The latest release is `6.1.6`. Some NeeView features are still being implemented or refined, for example:

- Full two-page / panorama interaction and performance optimization
- Library / bookshelf view and more formats (7z / rar / epub / pdf, etc.)
- Multi-window and multi-tab mode
- Super-resolution model management and comparison

For everyday image / manga viewing, the current version is already usable.

Design docs in `docs/`: `NeeView 架构与功能综合分析报告.md` (the NeeView feature breakdown this project targets), `NeoView-Tauri 项目综合研究报告.md` (current implementation survey), `TAURI_PERFORMANCE_OPTIMIZATION_PLAN.md`, `IMAGE_TRIM_SYSTEM_DESIGN.md`, `READER_BACKEND_MIGRATION_EXECUTION_BRIEF.md`.
