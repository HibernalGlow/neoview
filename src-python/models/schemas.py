"""
Pydantic 数据模型定义
对应 Rust 后端的数据结构
"""
from pydantic import BaseModel, Field
from typing import Optional


class FileEntry(BaseModel):
    """文件条目 - 对应 FsItem"""
    name: str
    path: str
    size: int
    modified: int  # Unix 时间戳
    created: Optional[int] = None
    isDir: bool  # camelCase 匹配前端 FsItem
    isImage: bool
    isArchive: bool
    isVideo: bool
    isEpub: bool = False


class FileInfo(BaseModel):
    """文件信息"""
    name: str
    path: str
    is_directory: bool
    size: Optional[int] = None
    modified: Optional[str] = None  # Unix 时间戳字符串


class SubfolderItem(BaseModel):
    """子文件夹项"""
    path: str
    name: str
    has_children: bool  # 是否有子目录


class DirectorySnapshotResponse(BaseModel):
    """目录快照响应"""
    items: list[FileEntry]
    mtime: Optional[int] = None  # 目录修改时间
    cached: bool = False  # 是否来自缓存


class BatchDirectorySnapshotResult(BaseModel):
    """批量目录快照结果"""
    path: str
    snapshot: Optional[DirectorySnapshotResponse] = None
    error: Optional[str] = None


class ArchiveEntry(BaseModel):
    """压缩包条目"""
    name: str  # 文件名
    path: str  # 完整路径（压缩包内）
    size: int  # 解压后大小
    isDir: bool  # 是否目录 (camelCase 匹配前端)
    isImage: bool  # 是否图片
    entryIndex: int  # 条目索引
    modified: Optional[int] = None  # 修改时间戳


class PageInfo(BaseModel):
    """页面信息"""
    path: str  # 文件路径或压缩包内路径
    name: str
    index: int
    width: Optional[int] = None
    height: Optional[int] = None


class BookInfo(BaseModel):
    """书籍信息"""
    path: str
    name: str
    book_type: str  # "folder" | "archive" | "epub"
    pages: list[PageInfo]
    current_page: int
    total_pages: int


class ImageMetadataResponse(BaseModel):
    """图像元数据响应"""
    path: str
    inner_path: Optional[str] = None
    name: str
    size: Optional[int] = None
    created_at: Optional[str] = None  # ISO 8601 格式
    modified_at: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    format: Optional[str] = None  # "jpeg", "png", "webp", etc.
    color_depth: Optional[str] = None


class UpscaleRequest(BaseModel):
    """超分请求"""
    image_path: str
    book_path: Optional[str] = None
    page_index: int
    model: str
    scale: int


class UpscaleConditions(BaseModel):
    """超分条件"""
    enabled: bool = True
    min_width: int = 0
    min_height: int = 0
    max_width: int = 10000
    max_height: int = 10000


class UpscaleStatus(BaseModel):
    """超分状态"""
    task_id: str
    status: str  # "pending" | "processing" | "completed" | "failed"
    progress: float = 0.0
    result_path: Optional[str] = None
    error: Optional[str] = None


class StreamBatch(BaseModel):
    """流式批次"""
    items: list[FileEntry]
    batch_index: int


class StreamProgress(BaseModel):
    """流式进度"""
    loaded: int
    estimated_total: Optional[int] = None
    elapsed_ms: int


class StreamComplete(BaseModel):
    """流式完成"""
    total_items: int
    skipped_items: int
    elapsed_ms: int
    from_cache: bool


class EpubEntry(BaseModel):
    """EPUB 条目"""
    path: str  # EPUB 内路径
    name: str
    media_type: str  # MIME 类型
    order: int  # 阅读顺序


class ErrorResponse(BaseModel):
    """错误响应"""
    error: str
    detail: Optional[str] = None
    path: Optional[str] = None


# 导出所有模型
__all__ = [
    "FileEntry",
    "FileInfo",
    "SubfolderItem",
    "DirectorySnapshotResponse",
    "BatchDirectorySnapshotResult",
    "ArchiveEntry",
    "PageInfo",
    "BookInfo",
    "ImageMetadataResponse",
    "UpscaleRequest",
    "UpscaleConditions",
    "UpscaleStatus",
    "StreamBatch",
    "StreamProgress",
    "StreamComplete",
    "EpubEntry",
    "ErrorResponse",
]
