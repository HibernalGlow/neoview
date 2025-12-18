"""
视频处理 API
提供视频信息、缩略图生成等功能
"""
import base64
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from core.fs_manager import is_video_file, VIDEO_EXTENSIONS
from core.archive_manager import extract_to_temp
from core.thumbnail_generator import generate_video_thumbnail_sync

router = APIRouter()


@router.get("/video/file")
async def load_video(path: str = Query(..., description="视频路径")) -> str:
    """返回视频路径（前端用 HTTP URL 加载）"""
    p = Path(path)
    
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在: {path}")
    
    if not is_video_file(path):
        raise HTTPException(status_code=400, detail=f"不是视频文件: {path}")
    
    return str(p.absolute())


@router.get("/video/extract-to-temp")
async def extract_video_to_temp(
    archive_path: str = Query(..., description="压缩包路径"),
    inner_path: str = Query(..., description="压缩包内视频路径"),
) -> str:
    """从压缩包提取视频到临时文件"""
    if not Path(archive_path).exists():
        raise HTTPException(status_code=404, detail=f"压缩包不存在: {archive_path}")
    
    try:
        temp_path = extract_to_temp(archive_path, inner_path)
        return temp_path
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"文件不存在: {inner_path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"提取失败: {e}")


@router.get("/video/thumbnail")
async def generate_video_thumbnail(
    path: str = Query(..., description="视频路径"),
    time_seconds: float = Query(1.0, description="截取时间（秒）"),
    max_size: int = Query(256, description="最大尺寸"),
) -> str:
    """生成视频缩略图（返回 base64）"""
    p = Path(path)
    
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在: {path}")
    
    thumbnail = generate_video_thumbnail_sync(path, max_size, time_seconds)
    
    if not thumbnail:
        raise HTTPException(status_code=500, detail="无法生成视频缩略图")
    
    return base64.b64encode(thumbnail).decode()


@router.get("/video/duration")
async def get_video_duration(path: str = Query(..., description="视频路径")) -> float:
    """获取视频时长"""
    p = Path(path)
    
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在: {path}")
    
    try:
        import av
        container = av.open(path)
        duration = container.duration / 1000000.0 if container.duration else 0.0
        container.close()
        return duration
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取时长失败: {e}")


@router.get("/video/check")
async def api_is_video_file(path: str = Query(..., description="文件路径")) -> bool:
    """检查是否为视频文件"""
    return is_video_file(path)
