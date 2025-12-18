"""
文件服务 API
提供本地文件访问、元数据获取、文件操作等功能
"""
import os
import mmap
import mimetypes
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse, Response
from send2trash import send2trash
from PIL import Image
import io

from pydantic import BaseModel
from models.schemas import FileInfo

router = APIRouter()

# 大文件阈值 (10MB)
LARGE_FILE_THRESHOLD = 10 * 1024 * 1024

# MIME 类型映射
MIME_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".jxl": "image/jxl",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
    ".heic": "image/heic",
    ".heif": "image/heif",
}


def get_mime_type(path: str) -> str:
    """获取文件 MIME 类型"""
    ext = Path(path).suffix.lower()
    if ext in MIME_TYPES:
        return MIME_TYPES[ext]
    mime, _ = mimetypes.guess_type(path)
    return mime or "application/octet-stream"


def stream_large_file(path: str, chunk_size: int = 65536):
    """使用 mmap 流式读取大文件"""
    with open(path, 'rb') as f:
        mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        try:
            while True:
                chunk = mm.read(chunk_size)
                if not chunk:
                    break
                yield chunk
        finally:
            mm.close()


@router.get("/file")
async def serve_file(path: str = Query(..., description="文件路径")):
    """
    提供本地文件访问
    - 小文件 (<10MB): FileResponse
    - 大文件 (>=10MB): StreamingResponse with mmap
    - JXL 格式: 解码为 PNG 返回
    """
    p = Path(path)
    
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在: {path}")
    
    if not p.is_file():
        raise HTTPException(status_code=400, detail=f"不是文件: {path}")
    
    file_size = p.stat().st_size
    mime_type = get_mime_type(path)
    
    # JXL 格式需要解码为 PNG
    if p.suffix.lower() == ".jxl":
        try:
            img = Image.open(path)
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            buffer.seek(0)
            return Response(
                content=buffer.getvalue(),
                media_type="image/png",
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"JXL 解码失败: {e}")
    
    # 大文件使用流式响应
    if file_size >= LARGE_FILE_THRESHOLD:
        return StreamingResponse(
            stream_large_file(path),
            media_type=mime_type,
            headers={
                "Content-Length": str(file_size),
                "Accept-Ranges": "bytes",
            }
        )
    
    # 小文件直接返回
    return FileResponse(
        path=path,
        media_type=mime_type,
        filename=p.name,
    )


@router.get("/file/info")
async def get_file_info(path: str = Query(..., description="文件路径")) -> FileInfo:
    """获取文件元数据"""
    p = Path(path)
    
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"路径不存在: {path}")
    
    st = p.stat()
    
    return FileInfo(
        name=p.name,
        path=str(p.absolute()),
        is_directory=p.is_dir(),
        size=st.st_size if p.is_file() else None,
        modified=str(int(st.st_mtime)),
    )


@router.get("/file/exists")
async def path_exists(path: str = Query(..., description="路径")) -> bool:
    """检查路径是否存在"""
    return Path(path).exists()


@router.get("/dimensions")
async def get_dimensions(path: str = Query(..., description="图片路径")) -> dict:
    """获取图片尺寸，不加载完整图片"""
    p = Path(path)
    
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在: {path}")
    
    try:
        with Image.open(path) as img:
            return {"width": img.width, "height": img.height}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"无法读取图片尺寸: {e}")


@router.get("/file/text")
async def read_text_file(
    path: str = Query(..., description="文件路径"),
    encoding: str = Query("utf-8", description="编码")
) -> str:
    """读取文本文件"""
    p = Path(path)
    
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在: {path}")
    
    try:
        return p.read_text(encoding=encoding)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取失败: {e}")


class PathRequest(BaseModel):
    """路径请求"""
    path: str


@router.post("/file/mkdir")
async def create_directory(request: PathRequest):
    """创建目录"""
    try:
        p = Path(request.path)
        # 检查目标路径是否是已存在的文件，防止覆盖文件
        if p.exists() and p.is_file():
            raise HTTPException(status_code=400, detail=f"目标路径是一个文件，无法创建目录: {request.path}")
        p.mkdir(parents=True, exist_ok=True)
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建目录失败: {e}")


@router.delete("/file")
async def delete_path(path: str = Query(..., description="路径")):
    """删除文件或目录"""
    p = Path(path)
    
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"路径不存在: {path}")
    
    try:
        if p.is_dir():
            import shutil
            shutil.rmtree(path)
        else:
            p.unlink()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除失败: {e}")


class RenameRequest(BaseModel):
    """重命名请求"""
    from_path: str
    to_path: str


@router.post("/file/rename")
async def rename_path(request: RenameRequest):
    """重命名文件或目录"""
    p = Path(request.from_path)
    
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"路径不存在: {request.from_path}")
    
    try:
        p.rename(request.to_path)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重命名失败: {e}")


@router.post("/file/trash")
async def move_to_trash(request: PathRequest):
    """移动到回收站"""
    p = Path(request.path)
    
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"路径不存在: {request.path}")
    
    try:
        send2trash(request.path)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"移动到回收站失败: {e}")



class WriteFileRequest(BaseModel):
    """写入文件请求"""
    path: str
    content: str
    encoding: str = "utf-8"


@router.post("/file/write")
async def write_text_file(request: WriteFileRequest):
    """写入文本文件"""
    try:
        p = Path(request.path)
        # 检查目标路径是否是已存在的目录，防止覆盖目录
        if p.exists() and p.is_dir():
            raise HTTPException(status_code=400, detail=f"目标路径是一个目录，无法写入: {request.path}")
        # 确保父目录存在
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(request.content, encoding=request.encoding)
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"写入失败: {e}")


class CopyMoveRequest(BaseModel):
    """复制/移动请求"""
    from_path: str
    to_path: str


@router.post("/file/copy")
async def copy_path(request: CopyMoveRequest):
    """复制文件或目录"""
    import shutil
    
    p = Path(request.from_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"路径不存在: {request.from_path}")
    
    try:
        if p.is_dir():
            shutil.copytree(request.from_path, request.to_path)
        else:
            shutil.copy2(request.from_path, request.to_path)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"复制失败: {e}")


@router.post("/file/move")
async def move_path(request: CopyMoveRequest):
    """移动文件或目录"""
    import shutil
    
    p = Path(request.from_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"路径不存在: {request.from_path}")
    
    try:
        shutil.move(request.from_path, request.to_path)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"移动失败: {e}")
