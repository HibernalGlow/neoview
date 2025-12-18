"""
目录浏览 API
提供目录列表、子文件夹、快照等功能
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from models.schemas import FileEntry, SubfolderItem, DirectorySnapshotResponse, BatchDirectorySnapshotResult
from core.fs_manager import (
    list_directory,
    list_subfolders,
    get_images_in_directory,
    load_directory_snapshot,
)

router = APIRouter()


class BatchSnapshotRequest(BaseModel):
    """批量快照请求"""
    paths: list[str]


@router.get("/directory/list")
async def api_list_directory(
    path: str = Query(..., description="目录路径"),
    filter_supported: bool = Query(True, description="是否过滤支持的格式"),
    excluded_paths: Optional[str] = Query(None, description="排除的路径，逗号分隔"),
) -> list[FileEntry]:
    """
    列出目录内容
    - 自然排序 (natsort)
    - 过滤支持的格式
    - 返回元数据
    """
    excluded = excluded_paths.split(",") if excluded_paths else None
    return list_directory(path, filter_supported=filter_supported, excluded_paths=excluded)


@router.get("/directory/subfolders")
async def api_list_subfolders(
    path: str = Query(..., description="目录路径")
) -> list[SubfolderItem]:
    """快速列出子文件夹（用于 FolderTree）"""
    return list_subfolders(path)


@router.get("/directory/snapshot")
async def api_load_directory_snapshot(
    path: str = Query(..., description="目录路径"),
    use_cache: bool = Query(True, description="是否使用缓存"),
) -> DirectorySnapshotResponse:
    """加载目录快照（带缓存）"""
    return load_directory_snapshot(path, use_cache=use_cache)


@router.post("/directory/batch-snapshot")
async def api_batch_load_directory_snapshots(
    request: BatchSnapshotRequest
) -> list[BatchDirectorySnapshotResult]:
    """批量加载目录快照"""
    results = []
    for path in request.paths:
        try:
            snapshot = load_directory_snapshot(path)
            results.append(BatchDirectorySnapshotResult(
                path=path,
                snapshot=snapshot,
                error=None,
            ))
        except Exception as e:
            results.append(BatchDirectorySnapshotResult(
                path=path,
                snapshot=None,
                error=str(e),
            ))
    return results


@router.get("/directory/images")
async def api_get_images_in_directory(
    path: str = Query(..., description="目录路径"),
    recursive: bool = Query(False, description="是否递归"),
) -> list[str]:
    """获取目录中的所有图片"""
    return get_images_in_directory(path, recursive=recursive)
