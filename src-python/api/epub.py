"""
EPUB API
提供 EPUB 电子书解析和图片提取功能
"""
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from models.schemas import EpubEntry
from core.epub_manager import list_epub_images, get_epub_image

router = APIRouter()


@router.get("/epub/list")
async def api_list_epub_contents(
    path: str = Query(..., description="EPUB 文件路径")
) -> list[EpubEntry]:
    """
    列出 EPUB 内容
    - 解析 EPUB 结构
    - 返回图片列表（按阅读顺序）
    """
    p = Path(path)
    
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在: {path}")
    
    if p.suffix.lower() != ".epub":
        raise HTTPException(status_code=400, detail=f"不是 EPUB 文件: {path}")
    
    return list_epub_images(path)


@router.get("/epub/image")
async def api_get_epub_image(
    path: str = Query(..., description="EPUB 文件路径"),
    inner_path: str = Query(..., description="EPUB 内图片路径"),
):
    """获取 EPUB 内图片"""
    p = Path(path)
    
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在: {path}")
    
    try:
        data = get_epub_image(path, inner_path)
        
        # 根据扩展名确定 MIME 类型
        ext = Path(inner_path).suffix.lower()
        mime_types = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".svg": "image/svg+xml",
        }
        mime_type = mime_types.get(ext, "application/octet-stream")
        
        return Response(
            content=data,
            media_type=mime_type,
        )
    except KeyError:
        raise HTTPException(status_code=404, detail=f"图片不存在: {inner_path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取失败: {e}")
