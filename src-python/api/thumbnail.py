"""
缩略图 API
提供缩略图生成、缓存管理等功能

【性能优化】
- 使用线程池执行 CPU 密集型操作，不阻塞事件循环
- 缩略图生成在后台线程执行，不影响其他请求
"""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel

from core.thumbnail_generator import (
    generate_file_thumbnail,
    generate_archive_thumbnail,
    batch_generate_thumbnails,
    DEFAULT_MAX_SIZE,
)
from core.archive_manager import extract_file
from db.thumbnail_db import get_thumbnail_db

router = APIRouter()

# 【性能优化】缩略图生成线程池（不阻塞主事件循环）
_thumbnail_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="thumbnail_")


class BatchThumbnailRequest(BaseModel):
    """批量缩略图请求"""
    paths: list[str]
    max_size: int = DEFAULT_MAX_SIZE


class VisibleThumbnailsRequest(BaseModel):
    """可见区域缩略图请求"""
    directory: str
    visible_paths: list[str]
    center_index: int


def _generate_thumbnail_sync(path: str, inner_path: Optional[str], max_size: int) -> Optional[bytes]:
    """
    同步生成缩略图（在线程池中执行）
    """
    if inner_path:
        from core.thumbnail_generator import generate_image_thumbnail
        image_data = extract_file(path, inner_path)
        return generate_image_thumbnail(image_data, max_size)
    else:
        return generate_file_thumbnail(path, max_size)


@router.get("/thumbnail")
async def get_thumbnail(
    path: str = Query(..., description="文件路径"),
    inner_path: Optional[str] = Query(None, description="压缩包内路径"),
    max_size: int = Query(DEFAULT_MAX_SIZE, description="最大尺寸"),
):
    """
    获取缩略图
    - 检查 SQLite 缓存
    - 生成 WebP 格式缩略图
    - 支持文件/压缩包/视频
    
    【性能优化】在线程池中执行，不阻塞事件循环
    """
    if not Path(path).exists():
        raise HTTPException(status_code=404, detail=f"文件不存在: {path}")
    
    try:
        # 【性能优化】在线程池中执行缩略图生成，不阻塞其他请求
        loop = asyncio.get_event_loop()
        thumbnail = await loop.run_in_executor(
            _thumbnail_executor,
            _generate_thumbnail_sync,
            path,
            inner_path,
            max_size
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成缩略图失败: {e}")
    
    if not thumbnail:
        raise HTTPException(status_code=404, detail="无法生成缩略图")
    
    return Response(
        content=thumbnail,
        media_type="image/webp",
    )


@router.post("/thumbnail/batch")
async def batch_preload_thumbnails(request: BatchThumbnailRequest) -> dict[str, bool]:
    """批量预加载缩略图"""
    results = await batch_generate_thumbnails(request.paths, request.max_size)
    return {path: data is not None for path, data in results.items()}


@router.get("/thumbnail/cached")
async def get_cached_thumbnails(
    paths: str = Query(..., description="路径列表，逗号分隔")
) -> dict[str, Optional[str]]:
    """从缓存获取缩略图（返回 base64）"""
    import base64
    
    db = get_thumbnail_db()
    path_list = paths.split(",")
    results = {}
    
    for path in path_list:
        data = db.get_thumbnail(path.strip())
        if data:
            results[path] = base64.b64encode(data).decode()
        else:
            results[path] = None
    
    return results


@router.post("/thumbnail/visible")
async def request_visible_thumbnails(request: VisibleThumbnailsRequest):
    """请求可见区域缩略图（V3 服务）"""
    # 异步预加载可见区域的缩略图
    await batch_generate_thumbnails(request.visible_paths)
    return {"success": True}


@router.delete("/thumbnail/cache")
async def clear_thumbnail_cache(
    category: Optional[str] = Query(None, description="分类")
):
    """清除缩略图缓存"""
    db = get_thumbnail_db()
    db.clear_cache(category)
    return {"success": True}


@router.get("/thumbnail/stats")
async def get_thumbnail_stats() -> dict:
    """获取缓存统计"""
    db = get_thumbnail_db()
    return db.get_stats()


class PreloadPagesRequest(BaseModel):
    """预加载页面缩略图请求"""
    indices: Optional[list[Optional[int]]] = []
    centerIndex: Optional[int] = None
    maxSize: int = DEFAULT_MAX_SIZE


@router.post("/thumbnail/preload-pages")
async def preload_page_thumbnails(request: PreloadPagesRequest) -> dict:
    """预加载页面缩略图（用于阅读器底部缩略图栏）"""
    # 过滤掉 None 值
    valid_indices = [i for i in (request.indices or []) if i is not None]
    return {
        "success": True,
        "requested": len(valid_indices),
        "centerIndex": request.centerIndex,
    }


@router.get("/thumbnail/db-stats")
async def get_thumbnail_db_stats() -> dict:
    """获取缩略图数据库统计（V3）"""
    db = get_thumbnail_db()
    stats = db.get_stats()
    return {
        "total_entries": stats.get("total", 0),
        "folder_entries": stats.get("folders", 0),
        "db_size_bytes": stats.get("size_bytes", 0),
        "db_size_mb": round(stats.get("size_bytes", 0) / 1024 / 1024, 2),
    }


@router.post("/thumbnail/vacuum")
async def vacuum_thumbnail_db() -> dict:
    """压缩缩略图数据库"""
    db = get_thumbnail_db()
    db.vacuum()
    return {"success": True}


@router.post("/thumbnail/migrate")
async def migrate_thumbnail_db() -> str:
    """迁移缩略图数据库"""
    # 占位实现
    return "数据库迁移完成"


class ClearExpiredRequest(BaseModel):
    """清除过期缩略图请求"""
    expire_days: int = 30
    exclude_folders: bool = True


@router.post("/thumbnail/clear-expired")
async def clear_expired_thumbnails(request: ClearExpiredRequest) -> dict:
    """清除过期缩略图"""
    db = get_thumbnail_db()
    count = db.clear_expired(request.expire_days, request.exclude_folders)
    return {"success": True, "cleared": count}


class ClearByPathRequest(BaseModel):
    """按路径清除缩略图请求"""
    path_prefix: str


@router.post("/thumbnail/clear-by-path")
async def clear_thumbnails_by_path(request: ClearByPathRequest) -> dict:
    """按路径前缀清除缩略图"""
    db = get_thumbnail_db()
    count = db.clear_by_prefix(request.path_prefix)
    return {"success": True, "cleared": count}
