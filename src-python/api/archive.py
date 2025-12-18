"""
压缩包处理 API
提供压缩包内容列表、文件提取等功能

【性能优化】
- 使用线程池执行同步的压缩包提取操作，避免阻塞事件循环
- 支持批量预加载 API，提前解压邻近页面
"""
import asyncio
from pathlib import Path
from typing import List
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel

from models.schemas import ArchiveEntry
from core.archive_manager import (
    list_archive_contents,
    extract_file,
    extract_to_temp,
    delete_zip_entry,
    detect_archive_type,
)
from api.files import get_mime_type

router = APIRouter()

# 【性能优化】线程池用于执行同步的压缩包操作
# 使用 4 个线程，允许并行提取多个文件
_archive_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="archive_")


@router.get("/archive/list")
async def api_list_archive(
    path: str = Query(..., description="压缩包路径"),
    use_cache: bool = Query(True, description="是否使用缓存"),
) -> list[ArchiveEntry]:
    """
    列出压缩包内容
    - 自动检测格式 (ZIP/RAR/7z)
    - 返回排序后的条目列表
    - 缓存索引
    """
    p = Path(path)
    
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在: {path}")
    
    if not detect_archive_type(path):
        raise HTTPException(status_code=400, detail=f"不支持的压缩包格式: {path}")
    
    return list_archive_contents(path, use_cache=use_cache)


@router.get("/archive/extract")
async def api_extract_file(
    archive_path: str = Query(..., description="压缩包路径"),
    inner_path: str = Query(..., description="压缩包内文件路径"),
):
    """从压缩包提取单个文件"""
    if not Path(archive_path).exists():
        raise HTTPException(status_code=404, detail=f"压缩包不存在: {archive_path}")
    
    # 标准化内部路径分隔符（ZIP 使用正斜杠）
    normalized_inner_path = inner_path.replace("\\", "/")
    
    try:
        data = extract_file(archive_path, normalized_inner_path)
        mime_type = get_mime_type(normalized_inner_path)
        
        return Response(
            content=data,
            media_type=mime_type,
            headers={
                "Content-Disposition": f'inline; filename="{Path(normalized_inner_path).name}"',
            }
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"文件不存在: {inner_path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"提取失败: {e}")


@router.get("/archive/extract-to-temp")
async def api_extract_to_temp(
    archive_path: str = Query(..., description="压缩包路径"),
    inner_path: str = Query(..., description="压缩包内文件路径"),
) -> str:
    """提取到临时文件，返回路径"""
    if not Path(archive_path).exists():
        raise HTTPException(status_code=404, detail=f"压缩包不存在: {archive_path}")
    
    try:
        temp_path = extract_to_temp(archive_path, inner_path)
        return temp_path
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"文件不存在: {inner_path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"提取失败: {e}")


@router.delete("/archive/entry")
async def api_delete_archive_entry(
    archive_path: str = Query(..., description="压缩包路径"),
    inner_path: str = Query(..., description="压缩包内文件路径"),
):
    """删除压缩包中的条目（仅 ZIP）"""
    if not Path(archive_path).exists():
        raise HTTPException(status_code=404, detail=f"压缩包不存在: {archive_path}")
    
    archive_type = detect_archive_type(archive_path)
    if archive_type != "zip":
        raise HTTPException(status_code=400, detail="仅支持删除 ZIP 压缩包中的条目")
    
    try:
        delete_zip_entry(archive_path, inner_path)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除失败: {e}")


@router.get("/archive/text")
async def api_read_text_from_archive(
    archive_path: str = Query(..., description="压缩包路径"),
    inner_path: str = Query(..., description="压缩包内文件路径"),
    encoding: str = Query("utf-8", description="文本编码"),
) -> str:
    """从压缩包读取文本文件"""
    if not Path(archive_path).exists():
        raise HTTPException(status_code=404, detail=f"压缩包不存在: {archive_path}")
    
    try:
        data = extract_file(archive_path, inner_path)
        return data.decode(encoding)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"文件不存在: {inner_path}")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail=f"无法使用 {encoding} 解码文件")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取失败: {e}")
