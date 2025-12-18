"""
缩略图生成器
支持图片、压缩包、视频的缩略图生成
"""
import io
from pathlib import Path
from typing import Optional
from PIL import Image
from concurrent.futures import ThreadPoolExecutor
import asyncio

from core.fs_manager import is_image_file, is_video_file, is_archive_file
from core.archive_manager import list_archive_contents, extract_file
from db.thumbnail_db import get_thumbnail_db

# 线程池
_executor = ThreadPoolExecutor(max_workers=4)

# 默认缩略图大小
DEFAULT_MAX_SIZE = 256


def generate_image_thumbnail(
    image_data: bytes,
    max_size: int = DEFAULT_MAX_SIZE,
    quality: int = 85
) -> bytes:
    """从图片数据生成 WebP 缩略图"""
    img = Image.open(io.BytesIO(image_data))
    
    # 转换为 RGB（处理 RGBA、P 等模式）
    if img.mode in ('RGBA', 'LA', 'P'):
        background = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'P':
            img = img.convert('RGBA')
        background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
        img = background
    elif img.mode != 'RGB':
        img = img.convert('RGB')
    
    # 缩放
    img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    
    # 保存为 WebP
    buffer = io.BytesIO()
    img.save(buffer, format='WEBP', quality=quality)
    return buffer.getvalue()


def generate_file_thumbnail(
    path: str,
    max_size: int = DEFAULT_MAX_SIZE
) -> Optional[bytes]:
    """生成文件缩略图"""
    p = Path(path)
    
    if not p.exists():
        return None
    
    db = get_thumbnail_db()
    st = p.stat()
    path_key = str(p.absolute())
    
    # 检查缓存
    cached = db.get_thumbnail_if_valid(path_key, st.st_size, int(st.st_mtime))
    if cached:
        return cached
    
    # 检查是否为失败记录
    if db.is_failed(path_key):
        return None
    
    try:
        if is_image_file(path):
            # 图片文件
            with open(path, 'rb') as f:
                image_data = f.read()
            thumbnail = generate_image_thumbnail(image_data, max_size)
            
        elif is_archive_file(path):
            # 压缩包 - 使用第一张图片
            thumbnail = generate_archive_thumbnail(path, max_size)
            if not thumbnail:
                return None
                
        elif is_video_file(path):
            # 视频 - 提取帧
            thumbnail = generate_video_thumbnail_sync(path, max_size)
            if not thumbnail:
                return None
        else:
            return None
        
        # 保存到缓存
        category = "archive" if is_archive_file(path) else "video" if is_video_file(path) else "file"
        db.save_thumbnail(path_key, thumbnail, st.st_size, int(st.st_mtime), category)
        
        return thumbnail
        
    except Exception as e:
        db.mark_failed(path_key, str(e))
        return None


def generate_archive_thumbnail(
    archive_path: str,
    max_size: int = DEFAULT_MAX_SIZE
) -> Optional[bytes]:
    """生成压缩包缩略图（使用第一张图片）"""
    entries = list_archive_contents(archive_path)
    
    # 找到第一张图片
    for entry in entries:
        if entry.is_image:
            try:
                image_data = extract_file(archive_path, entry.path)
                return generate_image_thumbnail(image_data, max_size)
            except Exception:
                continue
    
    return None


def generate_video_thumbnail_sync(
    path: str,
    max_size: int = DEFAULT_MAX_SIZE,
    time_seconds: float = 1.0
) -> Optional[bytes]:
    """生成视频缩略图（同步）"""
    try:
        import av
        
        container = av.open(path)
        stream = container.streams.video[0]
        
        # 跳转到指定时间
        target_pts = int(time_seconds / stream.time_base)
        container.seek(target_pts, stream=stream)
        
        # 获取一帧
        for frame in container.decode(video=0):
            img = frame.to_image()
            
            # 转换为 RGB
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            # 缩放
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
            
            # 保存为 WebP
            buffer = io.BytesIO()
            img.save(buffer, format='WEBP', quality=85)
            container.close()
            return buffer.getvalue()
        
        container.close()
    except Exception:
        pass
    
    return None


async def generate_thumbnail_async(
    path: str,
    max_size: int = DEFAULT_MAX_SIZE
) -> Optional[bytes]:
    """异步生成缩略图"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, generate_file_thumbnail, path, max_size)


async def batch_generate_thumbnails(
    paths: list[str],
    max_size: int = DEFAULT_MAX_SIZE
) -> dict[str, Optional[bytes]]:
    """批量生成缩略图"""
    tasks = [generate_thumbnail_async(path, max_size) for path in paths]
    results = await asyncio.gather(*tasks)
    return dict(zip(paths, results))
