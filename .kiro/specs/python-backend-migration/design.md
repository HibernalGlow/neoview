# Design Document: Python Backend Migration

## Overview

将 neoview-tauri 的 Rust 后端核心功能迁移到 Python FastAPI 后端。采用 aestivus 项目验证过的架构模式，通过 HTTP API 提供文件服务、压缩包处理、缩略图生成等功能。

### Rust 后端功能清单（需迁移）

根据对 `src-tauri/src/commands/` 和 `src-tauri/src/core/` 的完整分析，需要迁移以下功能：

| 模块 | Rust 命令 | 迁移优先级 |
|------|----------|-----------|
| **文件系统** | read_directory, browse_directory, list_subfolders, get_file_info, get_file_metadata, path_exists, read_text_file, create_directory, delete_path, rename_path, move_to_trash | P0 |
| **目录快照** | load_directory_snapshot, batch_load_directory_snapshots, get_images_in_directory | P0 |
| **流式加载** | stream_directory_v2, stream_search_v2, cancel_directory_stream_v2, cancel_streams_for_path, get_active_stream_count | P0 |
| **压缩包** | list_archive_contents, load_image_from_archive, extract_image_to_temp, delete_archive_entry | P0 |
| **图片加载** | load_image, load_image_base64, get_image_dimensions | P0 |
| **图像元数据** | get_image_metadata (支持普通文件和压缩包内文件) | P0 |
| **缩略图** | generate_file_thumbnail, generate_archive_thumbnail, generate_video_thumbnail, batch_preload_thumbnails, load_thumbnail_from_db | P0 |
| **缩略图V3** | init_thumbnail_service_v3, request_visible_thumbnails_v3, get_cached_thumbnails_v3, preload_directory_thumbnails_v3 | P1 |
| **书籍管理** | open_book, close_book, get_current_book, navigate_to_page, next_page, previous_page, set_book_sort_mode | P0 |
| **页面管理** | pm_open_book, pm_goto_page, pm_get_page, pm_preload_thumbnails, pf_build_frame, pf_update_context | P1 |
| **视频** | load_video, extract_video_to_temp, generate_video_thumbnail, get_video_duration, is_video_file | P1 |
| **超分服务** | upscale_service_init, upscale_service_request, upscale_service_get_stats, upscale_service_cancel_page | P1 |
| **EPUB** | EbookManager::get_epub_image, EPUB 结构解析 | P2 |
| **EMM 元数据** | save_emm_json, get_emm_json, batch_save_emm_json | P2 |
| **系统** | check_ffmpeg_available, 健康检查 | P0 |

### 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|
| Web 框架 | FastAPI | 高性能异步、自动 OpenAPI 文档、类型提示 |
| ASGI 服务器 | uvicorn | 高性能、支持 HTTP/2 |
| 图片处理 (Windows) | WIC (ctypes) | Windows 原生 C API、硬件加速、释放 GIL |
| 图片处理 (跨平台) | pillow-simd / Pillow | SIMD 优化的 C 扩展、释放 GIL |
| JPEG 解码 | turbojpeg (libjpeg-turbo) | C 库、SIMD 优化、释放 GIL |
| WebP/AVIF/JXL | pillow-avif-plugin, pillow-jxl-plugin | C 库绑定、释放 GIL |
| 压缩包 ZIP | zipfile | 标准库 C 实现 |
| 压缩包 RAR | rarfile + unrar.dll | Python 库 + C DLL |
| 压缩包 7z | py7zr (lzma C 扩展) | LZMA 使用 C 扩展 |
| 缓存 | SQLite (sqlite3) | C 扩展、释放 GIL |
| 视频帧 | PyAV (FFmpeg 绑定) | Rust/C 绑定、无需外部进程 |
| JSON 序列化 | orjson (Rust) | Rust 扩展、比 json 快 10x |
| 自然排序 | natsort | 纯 Python，排序操作快 |
| 并行处理 | ThreadPoolExecutor | Rust/C 扩展释放 GIL |
| Python 版本 | 3.11+ | 稳定、性能优化 |

### 现有 Rust/C 扩展库（不造轮子）

| 库 | 功能 | 语言 | PyPI |
|----|------|------|------|
| **orjson** | JSON 序列化（比 json 快 10x） | Rust | `pip install orjson` |
| **pydantic** | 数据验证（v2 使用 Rust 核心） | Rust | `pip install pydantic` |
| **PyAV** | FFmpeg 视频处理 | C | `pip install av` |
| **turbojpeg** | JPEG 编解码 | C | `pip install PyTurboJPEG` |
| **pillow-simd** | 图片处理（SIMD 优化） | C | `pip install pillow-simd` |
| **aiofiles** | 异步文件 I/O | Python | `pip install aiofiles` |

### GIL 绕过策略（不造轮子）

1. **使用现有 Rust/C 扩展**：orjson、PyAV、turbojpeg 等成熟库
2. **ThreadPoolExecutor**：Rust/C 扩展释放 GIL，线程池可并行
3. **异步 I/O**：aiofiles 文件读写、asyncio 网络
4. **避免外部进程**：使用 Python 绑定库替代命令行调用

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Tauri Desktop App                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 Svelte Frontend                      │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐             │   │
│  │  │ Viewer  │  │ Browser │  │ Upscale │             │   │
│  │  └────┬────┘  └────┬────┘  └────┬────┘             │   │
│  │       │            │            │                   │   │
│  │       └────────────┼────────────┘                   │   │
│  │                    │ HTTP API                       │   │
│  └────────────────────┼────────────────────────────────┘   │
│                       │                                     │
│  ┌────────────────────▼────────────────────────────────┐   │
│  │              Python FastAPI Backend                  │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │   │
│  │  │  Files   │ │ Archive  │ │Thumbnail │            │   │
│  │  │  API     │ │   API    │ │   API    │            │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘            │   │
│  │       │            │            │                   │   │
│  │  ┌────▼────────────▼────────────▼────┐             │   │
│  │  │           Core Services           │             │   │
│  │  │  ┌─────────┐  ┌─────────────────┐ │             │   │
│  │  │  │ Image   │  │ Archive Manager │ │             │   │
│  │  │  │ Decoder │  │ (ZIP/RAR/7z)    │ │             │   │
│  │  │  └─────────┘  └─────────────────┘ │             │   │
│  │  │  ┌─────────┐  ┌─────────────────┐ │             │   │
│  │  │  │Thumbnail│  │  Cache Manager  │ │             │   │
│  │  │  │Generator│  │  (SQLite)       │ │             │   │
│  │  │  └─────────┘  └─────────────────┘ │             │   │
│  │  └───────────────────────────────────┘             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Tauri Rust Shell (Minimal)              │   │
│  │  - Window management                                 │   │
│  │  - Python process lifecycle                          │   │
│  │  - System tray                                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Files API (`api/files.py`)

```python
@router.get("/file")
async def serve_file(path: str) -> FileResponse | StreamingResponse:
    """
    提供本地文件访问
    - 小文件 (<10MB): FileResponse
    - 大文件 (>=10MB): StreamingResponse with mmap
    - JXL 格式: 解码为 PNG 返回
    对应 Rust: load_image, load_image_base64
    """

@router.get("/dimensions")
async def get_dimensions(path: str) -> dict:
    """获取图片尺寸，不加载完整图片
    对应 Rust: get_image_dimensions
    """

@router.get("/file/info")
async def get_file_info(path: str) -> FileInfo:
    """获取文件元数据
    对应 Rust: get_file_info, get_file_metadata
    """

@router.get("/file/exists")
async def path_exists(path: str) -> bool:
    """检查路径是否存在
    对应 Rust: path_exists
    """

@router.get("/file/text")
async def read_text_file(path: str) -> str:
    """读取文本文件
    对应 Rust: read_text_file
    """

@router.post("/file/mkdir")
async def create_directory(path: str) -> None:
    """创建目录
    对应 Rust: create_directory
    """

@router.delete("/file")
async def delete_path(path: str) -> None:
    """删除文件或目录
    对应 Rust: delete_path
    """

@router.post("/file/rename")
async def rename_path(from_path: str, to_path: str) -> None:
    """重命名
    对应 Rust: rename_path
    """

@router.post("/file/trash")
async def move_to_trash(path: str) -> None:
    """移动到回收站
    对应 Rust: move_to_trash
    """
```

### 2. Directory API (`api/directory.py`)

```python
@router.get("/directory/list")
async def list_directory(path: str, excluded_paths: list[str] | None = None) -> list[FileEntry]:
    """
    列出目录内容
    - 自然排序 (natsort)
    - 过滤支持的格式
    - 返回元数据
    对应 Rust: read_directory, browse_directory
    """

@router.get("/directory/subfolders")
async def list_subfolders(path: str) -> list[SubfolderItem]:
    """快速列出子文件夹（用于 FolderTree）
    对应 Rust: list_subfolders
    """

@router.get("/directory/snapshot")
async def load_directory_snapshot(path: str) -> DirectorySnapshotResponse:
    """加载目录快照（带缓存）
    对应 Rust: load_directory_snapshot
    """

@router.post("/directory/batch-snapshot")
async def batch_load_directory_snapshots(paths: list[str]) -> list[BatchDirectorySnapshotResult]:
    """批量加载目录快照
    对应 Rust: batch_load_directory_snapshots
    """

@router.get("/directory/images")
async def get_images_in_directory(path: str, recursive: bool = False) -> list[str]:
    """获取目录中的所有图片
    对应 Rust: get_images_in_directory
    """
```

### 3. Archive API (`api/archive.py`)

```python
@router.get("/archive/list")
async def list_archive(path: str) -> list[ArchiveEntry]:
    """
    列出压缩包内容
    - 自动检测格式 (ZIP/RAR/7z)
    - 返回排序后的条目列表
    - 缓存索引
    对应 Rust: list_archive_contents
    """

@router.get("/archive/extract")
async def extract_file(archive_path: str, inner_path: str) -> Response:
    """从压缩包提取单个文件
    对应 Rust: load_image_from_archive, load_image_from_archive_binary
    """

@router.get("/archive/extract-to-temp")
async def extract_to_temp(archive_path: str, inner_path: str) -> str:
    """提取到临时文件，返回路径
    对应 Rust: extract_image_to_temp
    """

@router.delete("/archive/entry")
async def delete_archive_entry(archive_path: str, inner_path: str) -> None:
    """删除压缩包中的条目（仅 ZIP）
    对应 Rust: delete_archive_entry
    """
```

### 4. Thumbnail API (`api/thumbnail.py`)

```python
@router.get("/thumbnail")
async def get_thumbnail(
    path: str, 
    inner_path: str | None = None,
    max_size: int = 256
) -> Response:
    """
    获取缩略图
    - 检查 SQLite 缓存
    - 生成 WebP 格式缩略图
    - 支持文件/压缩包/视频
    对应 Rust: generate_file_thumbnail_new, generate_archive_thumbnail_new
    """

@router.post("/thumbnail/batch")
async def batch_preload_thumbnails(paths: list[str]) -> dict[str, str]:
    """批量预加载缩略图
    对应 Rust: batch_preload_thumbnails
    """

@router.get("/thumbnail/cached")
async def get_cached_thumbnails(paths: list[str]) -> dict[str, bytes | None]:
    """从缓存获取缩略图
    对应 Rust: load_thumbnail_from_db, batch_load_thumbnails_from_db
    """

@router.post("/thumbnail/visible")
async def request_visible_thumbnails(
    directory: str,
    visible_paths: list[str],
    center_index: int
) -> None:
    """请求可见区域缩略图（V3 服务）
    对应 Rust: request_visible_thumbnails_v3
    """

@router.delete("/thumbnail/cache")
async def clear_thumbnail_cache() -> None:
    """清除缩略图缓存
    对应 Rust: clear_thumbnail_cache_v3
    """

@router.get("/thumbnail/stats")
async def get_thumbnail_stats() -> dict:
    """获取缓存统计
    对应 Rust: get_thumbnail_cache_stats_v3, get_thumbnail_db_stats_v3
    """
```

### 5. Book API (`api/book.py`)

```python
@router.post("/book/open")
async def open_book(path: str) -> BookInfo:
    """打开书籍（文件夹/压缩包/EPUB）
    对应 Rust: open_book
    """

@router.post("/book/close")
async def close_book() -> None:
    """关闭当前书籍
    对应 Rust: close_book
    """

@router.get("/book/current")
async def get_current_book() -> BookInfo | None:
    """获取当前书籍信息
    对应 Rust: get_current_book
    """

@router.post("/book/navigate")
async def navigate_to_page(page_index: int) -> None:
    """跳转到指定页
    对应 Rust: navigate_to_page
    """

@router.post("/book/next")
async def next_page() -> int:
    """下一页
    对应 Rust: next_page
    """

@router.post("/book/previous")
async def previous_page() -> int:
    """上一页
    对应 Rust: previous_page
    """

@router.post("/book/sort")
async def set_sort_mode(sort_mode: str) -> BookInfo:
    """设置排序模式
    对应 Rust: set_book_sort_mode
    """
```

### 6. Video API (`api/video.py`)

```python
@router.get("/video/file")
async def load_video(path: str) -> str:
    """返回视频路径（前端用 HTTP URL 加载）
    对应 Rust: load_video
    """

@router.get("/video/extract-to-temp")
async def extract_video_to_temp(archive_path: str, inner_path: str) -> str:
    """从压缩包提取视频到临时文件
    对应 Rust: extract_video_to_temp
    """

@router.get("/video/thumbnail")
async def generate_video_thumbnail(path: str, time_seconds: float = 10.0) -> str:
    """生成视频缩略图（返回 base64）
    对应 Rust: generate_video_thumbnail
    """

@router.get("/video/duration")
async def get_video_duration(path: str) -> float:
    """获取视频时长
    对应 Rust: get_video_duration
    """

@router.get("/video/check")
async def is_video_file(path: str) -> bool:
    """检查是否为视频文件
    对应 Rust: is_video_file
    """
```

### 7. Upscale API (`api/upscale.py`)

```python
@router.post("/upscale/init")
async def upscale_init() -> None:
    """初始化超分服务
    对应 Rust: upscale_service_init
    """

@router.post("/upscale/request")
async def upscale_request(request: UpscaleRequest) -> str:
    """请求超分，返回 task_id
    对应 Rust: upscale_service_request
    """

@router.get("/upscale/status/{task_id}")
async def get_upscale_status(task_id: str) -> dict:
    """查询任务状态
    对应 Rust: upscale_service_get_stats
    """

@router.post("/upscale/cancel/{task_id}")
async def cancel_upscale(task_id: str) -> None:
    """取消超分任务
    对应 Rust: upscale_service_cancel_page
    """

@router.websocket("/upscale/ws")
async def upscale_websocket(websocket: WebSocket):
    """WebSocket 推送任务进度"""

@router.post("/upscale/conditions")
async def update_conditions(conditions: UpscaleConditions) -> None:
    """更新超分条件
    对应 Rust: upscale_service_update_conditions
    """
```

### 8. System API (`api/system.py`)

```python
@router.get("/health")
async def health_check() -> dict:
    """健康检查"""

@router.get("/system/ffmpeg")
async def check_ffmpeg() -> bool:
    """检查 FFmpeg 是否可用
    对应 Rust: check_ffmpeg_available
    """
```

### 9. Stream API (`api/stream.py`)

```python
@router.websocket("/stream/directory")
async def stream_directory(
    websocket: WebSocket,
    path: str,
    batch_size: int = 15,
    skip_hidden: bool = True
):
    """
    流式目录加载（WebSocket）
    - 首批 200ms 内返回
    - 支持取消
    - 返回进度信息
    对应 Rust: stream_directory_v2
    """

@router.websocket("/stream/search")
async def stream_search(
    websocket: WebSocket,
    path: str,
    query: str,
    batch_size: int = 15
):
    """
    流式搜索（WebSocket）
    - 边搜索边返回结果
    - 支持取消
    对应 Rust: stream_search_v2
    """

@router.post("/stream/cancel/{stream_id}")
async def cancel_stream(stream_id: str) -> bool:
    """取消流
    对应 Rust: cancel_directory_stream_v2
    """
```

### 10. Metadata API (`api/metadata.py`)

```python
@router.get("/metadata/image")
async def get_image_metadata(
    path: str,
    inner_path: str | None = None
) -> ImageMetadataResponse:
    """
    获取图像元数据
    - 支持普通文件和压缩包内文件
    - 返回尺寸、格式、时间等信息
    对应 Rust: get_image_metadata
    """
```

### 11. EPUB API (`api/epub.py`)

```python
@router.get("/epub/list")
async def list_epub_contents(path: str) -> list[EpubEntry]:
    """
    列出 EPUB 内容
    - 解析 EPUB 结构
    - 返回图片列表（按阅读顺序）
    对应 Rust: EbookManager
    """

@router.get("/epub/image")
async def get_epub_image(path: str, inner_path: str) -> Response:
    """
    获取 EPUB 内图片
    对应 Rust: EbookManager::get_epub_image
    """
```

### 12. EMM Metadata API (`api/emm.py`)

```python
@router.get("/emm/metadata")
async def load_emm_metadata(
    db_path: str,
    hash: str,
    translation_db_path: str | None = None
) -> EMMMetadata | None:
    """
    读取 EMM 数据库中的元数据
    对应 Rust: load_emm_metadata
    """

@router.get("/emm/metadata-by-path")
async def load_emm_metadata_by_path(
    db_path: str,
    file_path: str,
    translation_db_path: str | None = None
) -> EMMMetadata | None:
    """
    通过文件路径读取 EMM 元数据
    对应 Rust: load_emm_metadata_by_path
    """

@router.get("/emm/collect-tags")
async def load_emm_collect_tags(setting_path: str) -> list[EMMCollectTag]:
    """
    读取收藏标签配置
    对应 Rust: load_emm_collect_tags
    """

@router.get("/emm/databases")
async def find_emm_databases() -> list[str]:
    """
    查找 EMM 主数据库路径
    对应 Rust: find_emm_databases
    """

@router.get("/emm/translation-dict")
async def load_emm_translation_dict(file_path: str) -> dict:
    """
    读取 EMM 翻译字典
    对应 Rust: load_emm_translation_dict
    """

@router.post("/emm/search-by-tags")
async def search_by_tags_from_emm(
    db_paths: list[str],
    search_tags: list[tuple[str, str, str]],
    enable_mixed_gender: bool = False,
    base_path: str | None = None
) -> list[str]:
    """
    从 EMM 数据库搜索标签
    对应 Rust: search_by_tags_from_emm
    """
```

## Data Models

### ArchiveEntry

```python
@dataclass
class ArchiveEntry:
    name: str           # 文件名
    path: str           # 完整路径（压缩包内）
    size: int           # 解压后大小
    is_dir: bool        # 是否目录
    is_image: bool      # 是否图片
    entry_index: int    # 条目索引
    modified: int | None  # 修改时间戳
```

### FileEntry (FsItem)

```python
@dataclass
class FileEntry:
    name: str
    path: str
    size: int
    modified: int       # Unix 时间戳
    created: int | None # 创建时间
    is_dir: bool
    is_image: bool
    is_archive: bool
    is_video: bool
    is_epub: bool
```

### FileInfo

```python
@dataclass
class FileInfo:
    name: str
    path: str
    is_directory: bool
    size: int | None
    modified: str | None  # Unix 时间戳字符串
```

### SubfolderItem

```python
@dataclass
class SubfolderItem:
    path: str
    name: str
    has_children: bool  # 是否有子目录
```

### DirectorySnapshotResponse

```python
@dataclass
class DirectorySnapshotResponse:
    items: list[FileEntry]
    mtime: int | None   # 目录修改时间
    cached: bool        # 是否来自缓存
```

### BookInfo

```python
@dataclass
class BookInfo:
    path: str
    name: str
    book_type: str      # "folder" | "archive" | "epub"
    pages: list[PageInfo]
    current_page: int
    total_pages: int
```

### PageInfo

```python
@dataclass
class PageInfo:
    path: str           # 文件路径或压缩包内路径
    name: str
    index: int
    width: int | None
    height: int | None
```

### UpscaleRequest

```python
@dataclass
class UpscaleRequest:
    image_path: str
    book_path: str | None
    page_index: int
    model: str
    scale: int
```

### ImageMetadataResponse

```python
@dataclass
class ImageMetadataResponse:
    path: str
    inner_path: str | None
    name: str
    size: int | None
    created_at: str | None  # ISO 8601 格式
    modified_at: str | None
    width: int | None
    height: int | None
    format: str | None      # "jpeg", "png", "webp", etc.
    color_depth: str | None
```

### StreamBatch

```python
@dataclass
class StreamBatch:
    items: list[FileEntry]
    batch_index: int

@dataclass
class StreamProgress:
    loaded: int
    estimated_total: int | None
    elapsed_ms: int

@dataclass
class StreamComplete:
    total_items: int
    skipped_items: int
    elapsed_ms: int
    from_cache: bool
```

### EpubEntry

```python
@dataclass
class EpubEntry:
    path: str           # EPUB 内路径
    name: str
    media_type: str     # MIME 类型
    order: int          # 阅读顺序
```

### ThumbnailCache (SQLite Schema)

```sql
-- 缩略图缓存表
CREATE TABLE thumbnails (
    path_key TEXT PRIMARY KEY,
    file_size INTEGER,
    ghash INTEGER,
    data BLOB,
    created_at INTEGER,
    accessed_at INTEGER,
    category TEXT       -- "file" | "archive" | "folder" | "video"
);
CREATE INDEX idx_accessed_at ON thumbnails(accessed_at);
CREATE INDEX idx_category ON thumbnails(category);

-- 目录快照缓存表
CREATE TABLE directory_snapshots (
    path TEXT PRIMARY KEY,
    mtime INTEGER,
    items_json TEXT,    -- JSON 序列化的 FileEntry 列表
    created_at INTEGER
);

-- 失败记录表（避免重复尝试）
CREATE TABLE failed_thumbnails (
    path_key TEXT PRIMARY KEY,
    error TEXT,
    failed_at INTEGER
);

-- EMM 元数据缓存表
CREATE TABLE emm_json_cache (
    path TEXT PRIMARY KEY,
    json_data TEXT,
    created_at INTEGER
);
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. 
Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: MIME Type Correctness
*For any* file path with a known extension, the returned Content-Type header should match the expected MIME type for that extension.
**Validates: Requirements 1.1**

### Property 2: Archive Extraction Round-trip
*For any* archive (ZIP/RAR/7z) containing files, extracting a file via API and comparing with original content should produce identical bytes.
**Validates: Requirements 2.2, 2.3, 2.4**

### Property 3: Archive List Sorting
*For any* archive containing files with numeric names (e.g., "1.jpg", "2.jpg", "10.jpg"), the returned list should be in natural sort order (1, 2, 10) not lexicographic order (1, 10, 2).
**Validates: Requirements 2.6**

### Property 4: Thumbnail Size Constraint
*For any* generated thumbnail, both width and height should be less than or equal to the specified max_size (default 256).
**Validates: Requirements 3.1**

### Property 5: Directory Listing Metadata
*For any* directory listing result, each entry should contain all required metadata fields (name, path, size, modified, is_dir, is_image, is_archive, is_video).
**Validates: Requirements 7.1**

### Property 6: Image Dimensions Accuracy
*For any* image file, the dimensions returned by the API should match the actual image dimensions.
**Validates: Requirements 7.2**

### Property 7: Directory Natural Sorting
*For any* directory containing files with numeric names, the returned list should be in natural sort order.
**Validates: Requirements 7.3**

### Property 8: Extension Filtering
*For any* directory listing, only files with supported extensions (images, archives, videos) should be included when filtering is enabled.
**Validates: Requirements 7.4**

### Property 9: Book Page Consistency
*For any* opened book, the pages list should be sorted according to the current sort mode, and page indices should be contiguous from 0 to total_pages-1.
**Validates: Requirements (Book Management)**

### Property 10: Thumbnail Cache Consistency
*For any* cached thumbnail, loading it again should return identical bytes, and the cache should be invalidated when the source file is modified (mtime changes).
**Validates: Requirements 3.4, 3.5**

### Property 11: Directory Snapshot Cache Validity
*For any* directory snapshot, if the directory mtime has not changed, the cached snapshot should be returned; if mtime changed, a fresh snapshot should be generated.
**Validates: Requirements (Directory Caching)**

### Property 12: Stream Batch Ordering
*For any* directory stream, batches should be delivered in order (batch_index 0, 1, 2, ...) and all items should be unique across batches.
**Validates: Requirements 8.1**

### Property 13: Stream First Batch Latency
*For any* directory stream request, the first batch should be delivered within 200ms of request initiation.
**Validates: Requirements 8.2**

### Property 14: Image Metadata Completeness
*For any* image file, the metadata response should contain at least path, name, and size fields; width and height should be present for valid image files.
**Validates: Requirements 9.1**

### Property 15: EPUB Image Order
*For any* EPUB file, the images returned should be in the same order as defined in the EPUB spine/manifest.
**Validates: Requirements 10.3**

## Error Handling

### HTTP Status Codes

| 状态码 | 场景 |
|--------|------|
| 200 | 成功 |
| 404 | 文件/路径不存在 |
| 400 | 参数错误 |
| 415 | 不支持的格式 |
| 500 | 服务器内部错误 |

### Error Response Format

```python
class ErrorResponse(BaseModel):
    error: str
    detail: str | None = None
    path: str | None = None
```

## Testing Strategy

### 单元测试

- 使用 pytest + pytest-asyncio
- Mock 文件系统操作
- 测试各个 API 端点

### 属性测试

- 使用 hypothesis 库
- 生成随机文件名、路径、压缩包内容
- 验证 Correctness Properties

### 集成测试

- 使用 TestClient 测试完整 API 流程
- 测试缓存行为
- 测试并发请求

### 性能测试

- 使用 locust 进行负载测试
- 对比 Rust 后端性能基准
- 目标：延迟增加不超过 50%

### 属性测试框架

```python
from hypothesis import given, strategies as st

@given(st.text(min_size=1, max_size=100))
def test_mime_type_correctness(filename: str):
    """Property 1: MIME type should match extension"""
    # 测试实现
```

每个属性测试需要：
- 使用 hypothesis 生成测试数据
- 运行至少 100 次迭代
- 标注对应的 Correctness Property


## Performance Optimization Strategies

### 1. 文件 I/O 优化

```python
import mmap
from concurrent.futures import ProcessPoolExecutor

# 大文件使用 mmap
LARGE_FILE_THRESHOLD = 10 * 1024 * 1024  # 10MB

async def serve_large_file(path: str):
    with open(path, 'rb') as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        return StreamingResponse(
            iter(lambda: mm.read(65536), b''),
            media_type=guess_mime(path)
        )
```

### 2. 图片解码优化（使用现有库）

```python
import platform
import ctypes
from ctypes import wintypes

# Windows 优先使用 WIC（硬件加速、原生格式支持）
if platform.system() == 'Windows':
    from comtypes import GUID
    from comtypes.client import CreateObject
    
    class WICDecoder:
        """Windows Imaging Component 解码器"""
        
        def __init__(self):
            self.factory = CreateObject(
                '{CACAF262-9370-4615-A13B-9F5539DA4C0A}',  # CLSID_WICImagingFactory
                interface=IWICImagingFactory
            )
        
        def decode(self, data: bytes) -> tuple[bytes, int, int]:
            """解码图片，返回 (BGRA 数据, 宽度, 高度)"""
            stream = self.factory.CreateStream()
            stream.InitializeFromMemory(data, len(data))
            decoder = self.factory.CreateDecoderFromStream(stream, None, 0)
            frame = decoder.GetFrame(0)
            width, height = frame.GetSize()
            
            # 转换为 BGRA 格式
            converter = self.factory.CreateFormatConverter()
            converter.Initialize(frame, GUID_WICPixelFormat32bppBGRA, 0, None, 0.0, 0)
            
            stride = width * 4
            buffer = (ctypes.c_byte * (stride * height))()
            converter.CopyPixels(None, stride, len(buffer), buffer)
            
            return bytes(buffer), width, height
        
        def generate_thumbnail(self, data: bytes, max_size: int) -> bytes:
            """使用 WIC 生成缩略图"""
            stream = self.factory.CreateStream()
            stream.InitializeFromMemory(data, len(data))
            decoder = self.factory.CreateDecoderFromStream(stream, None, 0)
            frame = decoder.GetFrame(0)
            
            width, height = frame.GetSize()
            scale = min(max_size / width, max_size / height, 1.0)
            new_width = int(width * scale)
            new_height = int(height * scale)
            
            # 使用 WIC 缩放（高质量）
            scaler = self.factory.CreateBitmapScaler()
            scaler.Initialize(frame, new_width, new_height, 
                            WICBitmapInterpolationModeHighQualityCubic)
            
            # 编码为 WebP
            output_stream = self.factory.CreateStream()
            encoder = self.factory.CreateEncoder(GUID_ContainerFormatWebp, None)
            encoder.Initialize(output_stream, WICBitmapEncoderNoCache)
            frame_encode = encoder.CreateNewFrame(None)
            frame_encode.Initialize(None)
            frame_encode.WriteSource(scaler, None)
            frame_encode.Commit()
            encoder.Commit()
            
            return output_stream.GetData()
    
    wic_decoder = WICDecoder()
    
    def decode_image(data: bytes) -> tuple[bytes, int, int]:
        return wic_decoder.decode(data)
    
    def generate_thumbnail(data: bytes, max_size: int) -> bytes:
        return wic_decoder.generate_thumbnail(data, max_size)

else:
    # 非 Windows 平台回退到 Pillow + turbojpeg
    from turbojpeg import TurboJPEG
    from PIL import Image
    import io
    
    jpeg = TurboJPEG()
    
    def decode_image(data: bytes) -> tuple[bytes, int, int]:
        """使用 Pillow 解码"""
        img = Image.open(io.BytesIO(data))
        img = img.convert('RGBA')
        return img.tobytes(), img.width, img.height
    
    def generate_thumbnail(data: bytes, max_size: int) -> bytes:
        """使用 Pillow 生成缩略图"""
        img = Image.open(io.BytesIO(data))
        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        img.save(buffer, format='WEBP', quality=85)
        return buffer.getvalue()
```

### 3. 压缩包优化（无外部进程）

```python
# ZIP: 使用标准库（C 实现，释放 GIL）
import zipfile

def extract_from_zip(archive: str, inner: str) -> bytes:
    with zipfile.ZipFile(archive, 'r') as zf:
        return zf.read(inner)

# RAR: 使用 rarfile + unrar.dll（无需命令行）
import rarfile
rarfile.UNRAR_TOOL = None  # 强制使用 unrar.dll

def extract_from_rar(archive: str, inner: str) -> bytes:
    with rarfile.RarFile(archive) as rf:
        return rf.read(inner)

# 7z: 使用 py7zr（LZMA C 扩展加速）
import py7zr

def extract_from_7z(archive: str, inner: str) -> bytes:
    with py7zr.SevenZipFile(archive, 'r') as zf:
        data = zf.read([inner])
        return data[inner].read()
```

### 4. 缓存策略

```python
from functools import lru_cache
from cachetools import TTLCache

# 内存缓存：压缩包索引
archive_index_cache = TTLCache(maxsize=100, ttl=3600)

# 磁盘缓存：缩略图（SQLite）
# 使用 WAL 模式提高并发性能
conn = sqlite3.connect('thumbnails.db')
conn.execute('PRAGMA journal_mode=WAL')
conn.execute('PRAGMA synchronous=NORMAL')

# 目录快照缓存：内存 LRU + SQLite 持久化
directory_cache = LRUCache(maxsize=50)
```

### 5. 并发处理（使用现有库）

```python
from concurrent.futures import ThreadPoolExecutor
import asyncio
import aiofiles
from os import cpu_count

# 线程池：Rust/C 扩展释放 GIL，线程池可并行
thread_pool = ThreadPoolExecutor(max_workers=cpu_count() * 2)

# 缩略图生成：使用线程池
async def generate_thumbnail_async(path: str) -> bytes:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(thread_pool, generate_thumbnail_sync, path)

# 文件读取：使用 aiofiles
async def read_file_async(path: str) -> bytes:
    async with aiofiles.open(path, 'rb') as f:
        return await f.read()

# RAR 解压：使用 rarfile 库
import rarfile

async def extract_rar_async(archive: str, inner: str) -> bytes:
    def _extract():
        with rarfile.RarFile(archive) as rf:
            return rf.read(inner)
    return await asyncio.get_event_loop().run_in_executor(thread_pool, _extract)

# 视频帧提取：使用 PyAV
import av

async def extract_video_frame_async(path: str, time_sec: float) -> bytes:
    def _extract():
        container = av.open(path)
        stream = container.streams.video[0]
        target_pts = int(time_sec / stream.time_base)
        container.seek(target_pts, stream=stream)
        for frame in container.decode(video=0):
            img = frame.to_image()
            buffer = io.BytesIO()
            img.save(buffer, format='PNG')
            return buffer.getvalue()
        return None
    return await asyncio.get_event_loop().run_in_executor(thread_pool, _extract)
```

### GIL 释放验证

所有 Rust/C 扩展库在执行时会释放 GIL：
- **orjson**: Rust 实现，释放 GIL
- **turbojpeg**: C 库，释放 GIL
- **Pillow**: C 扩展，释放 GIL
- **sqlite3**: C 扩展，释放 GIL
- **PyAV**: FFmpeg C 绑定，释放 GIL

### 6. 自然排序

```python
from natsort import natsorted, ns

def sort_entries(entries: list[FileEntry]) -> list[FileEntry]:
    # 目录优先，然后自然排序
    dirs = [e for e in entries if e.is_dir]
    files = [e for e in entries if not e.is_dir]
    return natsorted(dirs, key=lambda x: x.name.lower(), alg=ns.IGNORECASE) + \
           natsorted(files, key=lambda x: x.name.lower(), alg=ns.IGNORECASE)
```

## Project Structure

```
ImageAll/NeeWaifu/neoview/neoview-tauri/
├── src/                          # Svelte 前端（保持不变）
├── src-tauri/                    # Tauri 壳（精简）
│   ├── src/
│   │   ├── main.rs              # 仅窗口管理、Python 进程启动
│   │   └── tray.rs              # 系统托盘
│   └── tauri.conf.json          # 移除 assetProtocol 配置
└── src-python/                   # Python 后端（新增）
    ├── main.py                   # FastAPI 入口
    ├── api/
    │   ├── __init__.py
    │   ├── files.py             # 文件服务
    │   ├── directory.py         # 目录浏览
    │   ├── archive.py           # 压缩包处理
    │   ├── thumbnail.py         # 缩略图生成
    │   ├── book.py              # 书籍管理
    │   ├── video.py             # 视频处理
    │   ├── upscale.py           # 超分服务
    │   ├── system.py            # 系统 API
    │   ├── stream.py            # 流式目录/搜索（WebSocket）
    │   ├── metadata.py          # 图像元数据
    │   └── epub.py              # EPUB 电子书
    ├── core/
    │   ├── __init__.py
    │   ├── image_decoder.py     # 统一图片解码（WIC 优先）
    │   ├── wic_decoder.py       # Windows WIC 解码器封装
    │   ├── archive_manager.py   # 压缩包管理
    │   ├── thumbnail_generator.py
    │   ├── book_manager.py      # 书籍状态管理
    │   ├── cache.py             # 缓存管理
    │   ├── fs_manager.py        # 文件系统操作
    │   ├── stream_manager.py    # 流式加载管理
    │   └── epub_manager.py      # EPUB 解析
    ├── models/
    │   ├── __init__.py
    │   └── schemas.py           # Pydantic 模型
    ├── db/
    │   ├── __init__.py
    │   └── thumbnail_db.py      # SQLite 操作
    ├── tests/
    │   ├── __init__.py
    │   ├── test_files.py
    │   ├── test_archive.py
    │   ├── test_thumbnail.py
    │   ├── test_stream.py       # 流式加载测试
    │   ├── test_epub.py         # EPUB 测试
    │   └── conftest.py          # pytest fixtures
    ├── pyproject.toml
    └── requirements.txt
```

## Frontend Migration

### 前端适配层 (`src/lib/api/adapter.ts`)

```typescript
// 统一 API 适配器，支持 Tauri IPC 和 HTTP 两种模式
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/v1';

// 文件 URL 生成
export function getFileUrl(path: string): string {
  return `${API_BASE}/file?path=${encodeURIComponent(path)}`;
}

// 缩略图 URL 生成
export function getThumbnailUrl(path: string, innerPath?: string): string {
  let url = `${API_BASE}/thumbnail?path=${encodeURIComponent(path)}`;
  if (innerPath) {
    url += `&inner_path=${encodeURIComponent(innerPath)}`;
  }
  return url;
}

// API 调用封装
export async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, options);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}
```

### 图片加载迁移

```typescript
// 旧代码（Tauri IPC）
const data = await invoke('load_image', { path });
const blob = new Blob([new Uint8Array(data)]);
const url = URL.createObjectURL(blob);

// 新代码（HTTP）
const url = getFileUrl(path);
// 直接使用 URL，浏览器自动处理
```
