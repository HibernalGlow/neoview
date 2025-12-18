"""
图像元数据 API
提供图像尺寸、格式、时间等元数据
"""
import os
from pathlib import Path
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from PIL import Image
import io

from models.schemas import ImageMetadataResponse
from core.archive_manager import extract_file, detect_archive_type

router = APIRouter()


def get_image_format(path: str) -> Optional[str]:
    """获取图片格式"""
    ext = Path(path).suffix.lower()
    format_map = {
        ".jpg": "jpeg",
        ".jpeg": "jpeg",
        ".png": "png",
        ".gif": "gif",
        ".bmp": "bmp",
        ".webp": "webp",
        ".avif": "avif",
        ".jxl": "jxl",
        ".tiff": "tiff",
        ".tif": "tiff",
        ".ico": "ico",
        ".svg": "svg",
        ".heic": "heic",
        ".heif": "heif",
    }
    return format_map.get(ext)


def get_image_metadata_from_data(
    data: bytes,
    path: str,
    inner_path: Optional[str] = None
) -> ImageMetadataResponse:
    """从图片数据获取元数据"""
    try:
        img = Image.open(io.BytesIO(data))
        width, height = img.size
        format_str = img.format.lower() if img.format else get_image_format(inner_path or path)
        
        # 获取色深
        mode_depth = {
            "1": "1-bit",
            "L": "8-bit grayscale",
            "P": "8-bit palette",
            "RGB": "24-bit",
            "RGBA": "32-bit",
            "CMYK": "32-bit CMYK",
            "YCbCr": "24-bit YCbCr",
            "LAB": "24-bit LAB",
            "HSV": "24-bit HSV",
            "I": "32-bit integer",
            "F": "32-bit float",
        }
        color_depth = mode_depth.get(img.mode, img.mode)
        
        return ImageMetadataResponse(
            path=path,
            inner_path=inner_path,
            name=Path(inner_path or path).name,
            size=len(data),
            width=width,
            height=height,
            format=format_str,
            color_depth=color_depth,
        )
    except Exception:
        return ImageMetadataResponse(
            path=path,
            inner_path=inner_path,
            name=Path(inner_path or path).name,
            size=len(data),
            format=get_image_format(inner_path or path),
        )


@router.get("/metadata/image")
async def get_image_metadata(
    path: str = Query(..., description="文件路径"),
    inner_path: Optional[str] = Query(None, description="压缩包内路径"),
) -> ImageMetadataResponse:
    """
    获取图像元数据
    - 支持普通文件和压缩包内文件
    - 返回尺寸、格式、时间等信息
    """
    p = Path(path)
    
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在: {path}")
    
    # 压缩包内文件
    if inner_path:
        if not detect_archive_type(path):
            raise HTTPException(status_code=400, detail=f"不是压缩包: {path}")
        
        try:
            data = extract_file(path, inner_path)
            metadata = get_image_metadata_from_data(data, path, inner_path)
            
            # 添加压缩包的时间信息
            st = p.stat()
            metadata.created_at = datetime.fromtimestamp(st.st_ctime).isoformat()
            metadata.modified_at = datetime.fromtimestamp(st.st_mtime).isoformat()
            
            return metadata
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail=f"文件不存在: {inner_path}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"读取失败: {e}")
    
    # 普通文件
    try:
        st = p.stat()
        
        with open(path, 'rb') as f:
            data = f.read()
        
        metadata = get_image_metadata_from_data(data, path)
        metadata.size = st.st_size
        metadata.created_at = datetime.fromtimestamp(st.st_ctime).isoformat()
        metadata.modified_at = datetime.fromtimestamp(st.st_mtime).isoformat()
        
        return metadata
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取失败: {e}")
