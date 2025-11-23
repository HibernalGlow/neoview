# NeoView (Tauri + Svelte 5)

![NeoView Icon](./src-tauri/icons/128x128.png)

[![zread](https://img.shields.io/badge/Ask_Zread-_.svg?style=flat&color=00b0aa&labelColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQuOTYxNTYgMS42MDAxSDIuMjQxNTZDMS44ODgxIDEuNjAwMSAxLjYwMTU2IDEuODg2NjQgMS42MDE1NiAyLjI0MDFWNC45NjAxQzEuNjAxNTYgNS4zMTM1NiAxLjg4ODEgNS42MDAxIDIuMjQxNTYgNS42MDAxSDQuOTYxNTZDNS4zMTUwMiA1LjYwMDEgNS42MDE1NiA1LjMxMzU2IDUuNjAxNTYgNC45NjAxVjIuMjQwMUM1LjYwMTU2IDEuODg2NjQgNS4zMTUwMiAxLjYwMDEgNC45NjE1NiAxLjYwMDFaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00Ljk2MTU2IDEwLjM5OTlIMi4yNDE1NkMxLjg4ODEgMTAuMzk5OSAxLjYwMTU2IDEwLjY4NjQgMS42MDE1NiAxMS4wMzk5VjEzLjc1OTlDMS42MDE1NiAxNC4xMTM0IDEuODg4MSAxNC4zOTk5IDIuMjQxNTYgMTQuMzk5OUg0Ljk2MTU2QzUuMzE1MDIgMTQuMzk5OSA1LjYwMTU2IDE0LjExMzQgNS42MDE1NiAxMy43NTk5VjExLjAzOTlDNS42MDE1NiAxMC42ODY0IDUuMzE1MDIgMTAuMzk5OSA0Ljk2MTU2IDEwLjM5OTlaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik0xMy43NTg0IDEuNjAwMUgxMS4wMzg0QzEwLjY4NSAxLjYwMDEgMTAuMzk4NCAxLjg4NjY0IDEwLjM5ODQgMi4yNDAxVjQuOTYwMUMxMC4zOTg0IDUuMzEzNTYgMTAuNjg1IDUuNjAwMSAxMS4wMzg0IDUuNjAwMUgxMy43NTg0QzE0LjExMTkgNS42MDAxIDE0LjM5ODQgNS4zMTM1NiAxNC4zOTg0IDQuOTYwMVYyLjI0MDFDMTQuMzk4NCAxLjg4NjY0IDE0LjExMTkgMS42MDAxIDEzLjc1ODQgMS42MDAxWiIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNCAxMkwxMiA0TDQgMTJaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00IDEyTDEyIDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K&logoColor=ffffff)](https://zread.ai/HibernalGlow/neoview)

NeoView is a desktop image / manga viewer.
This directory is built with **Tauri 2 + Svelte 5 + Rust + PyO3**. The goal is to recreate the core experience of the [NeeView](https://github.com/neelabo/NeeView) reader on a modern stack, with heavy optimizations for large local libraries (thumbnail cache, batch loading, background task scheduler, etc.).

## Feature Overview

- **High-performance local library browsing**
  - Browse folders / archives
  - History, bookmarks, file browser panel
- **Multiple view modes (in progress)**
  - Single page, two-page spread, vertical scroll, panorama
  - Random jump window, preload window (aligned with NeeView, see `docs/neeview_revamp_plan.md`)
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

Under `neoview/neoview-tauri`:

- `src/`  
  Svelte 5 frontend code (panels, viewer, state management, thumbnails, theme system, etc.).
- `src-tauri/`  
  Tauri 2 + Rust backend: commands, thumbnail and directory cache, background scheduler, etc.
- `docs/`  
  Developer-facing design docs:
  - `neeview_revamp_plan.md`: NeoView x NeeView revamp roadmap and progress
  - `thumbnail-optimization.md` / `THUMBNAIL_OPTIMIZATION_FEATURES.md`: thumbnail loading and cache optimizations
  - `THEME_SYSTEM.md` / `THEME_SETTINGS.md`: theme system and appearance settings
- `docs/THUMBNAIL_BATCH_CLI.md`  
  Thumbnail batch CLI usage.
- `scripts/`  
  Helper scripts (e.g. `thumbnail_batch_cli.py`).
- `ref/`  
  Reference implementations and historical snapshots.

## Requirements

Please make sure your system satisfies the official Tauri 2 prerequisites.

- **Node.js**: 20+ (recommended via nvm / nvm-windows)
- **Yarn**: used as the frontend package manager  
  - On Node 16+, run `corepack enable` to enable Yarn
- **Rust**: latest via [rustup](https://www.rust-lang.org/)
- **Windows extra dependencies** (recommended, main development platform)
  - Install Visual Studio / Build Tools with "Desktop development with C++"
- **Optional**
  - Python 3.12+ (for thumbnail batch CLI and later super-resolution models)
  - `ffmpeg` (for video thumbnails)

## Quick Start

In `neoview/neoview-tauri`:

### 1. Install dependencies

```bash
# Recommended
yarn

# Or explicitly
yarn install
```

This installs frontend dependencies and the Tauri CLI.

### 2. Start development

```bash
# Vite dev server only
yarn dev

# Full Tauri desktop app (will run `yarn dev` inside)
yarn tauri dev
```

Default dev URL: `http://localhost:1420` (see `src-tauri/tauri.conf.json`).

### 3. Build and bundle

```bash
# Frontend build only (outputs to `dist/`)
yarn build

# Desktop app bundles / executables
yarn tauri build
```

Tauri will create platform-specific installers / executables.

## Common Scripts

All scripts in `package.json` are run via **Yarn**:

- `yarn dev`  
  Start the Vite dev server.
- `yarn build`  
  Build frontend assets.
- `yarn preview`  
  Preview the built frontend.
- `yarn check`  
  Type checking via `svelte-check` and `tsc`.
- `yarn format`  
  Format using Prettier.
- `yarn lint`  
  Lint with Prettier + ESLint.
- `yarn tauri dev` / `yarn tauri build`  
  Use the Tauri CLI to start the desktop app in dev / build installers.

## Thumbnail Batch CLI (optional)

To avoid stutter when opening a large library for the first time, you can pre-generate thumbnails and write them to the database.  
See `docs/THUMBNAIL_BATCH_CLI.md` for full details.

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

The project is under active development. Some NeeView features are still being implemented or refined, for example:

- Full two-page / panorama interaction and performance optimization
- Library / bookshelf view and more formats (7z / rar / epub / pdf, etc.)
- Multi-window and multi-tab mode
- Super-resolution model management and comparison

For everyday image / manga viewing, the current version is already usable.  
If you want to contribute, start with `docs/neeview_revamp_plan.md` and the thumbnail / theme docs.
