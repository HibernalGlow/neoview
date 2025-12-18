"""
文件系统管理器
提供目录浏览、自然排序、扩展名过滤等功能
"""
import os
import stat
from pathlib import Path
from typing import Optional
from natsort import natsorted, ns
from cachetools import TTLCache

from models.schemas import FileEntry, SubfolderItem, DirectorySnapshotResponse

# 支持的图片扩展名
IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".avif", ".jxl",
    ".tiff", ".tif", ".ico", ".svg", ".heic", ".heif"
}

# 支持的压缩包扩展名
ARCHIVE_EXTENSIONS = {".zip", ".rar", ".7z", ".cbz", ".cbr", ".cb7"}

# 支持的视频扩展名
VIDEO_EXTENSIONS = {
    ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm",
    ".m4v", ".mpg", ".mpeg", ".3gp"
}

# 支持的电子书扩展名
EPUB_EXTENSIONS = {".epub"}

# 目录快照缓存 (最多 100 个目录，TTL 1 小时)
_snapshot_cache: TTLCache = TTLCache(maxsize=100, ttl=3600)


def is_image_file(path: str) -> bool:
    """检查是否为图片文件"""
    return Path(path).suffix.lower() in IMAGE_EXTENSIONS


def is_archive_file(path: str) -> bool:
    """检查是否为压缩包文件"""
    return Path(path).suffix.lower() in ARCHIVE_EXTENSIONS


def is_video_file(path: str) -> bool:
    """检查是否为视频文件"""
    return Path(path).suffix.lower() in VIDEO_EXTENSIONS


def is_epub_file(path: str) -> bool:
    """检查是否为 EPUB 文件"""
    return Path(path).suffix.lower() in EPUB_EXTENSIONS


def is_supported_file(path: str) -> bool:
    """检查是否为支持的文件类型"""
    return is_image_file(path) or is_archive_file(path) or is_video_file(path) or is_epub_file(path)


def natural_sort_entries(entries: list[FileEntry]) -> list[FileEntry]:
    """
    自然排序文件条目
    目录优先，然后按名称自然排序
    """
    dirs = [e for e in entries if e.isDir]
    files = [e for e in entries if not e.isDir]
    
    sorted_dirs = natsorted(dirs, key=lambda x: x.name.lower(), alg=ns.IGNORECASE)
    sorted_files = natsorted(files, key=lambda x: x.name.lower(), alg=ns.IGNORECASE)
    
    return sorted_dirs + sorted_files


def natural_sort_strings(items: list[str]) -> list[str]:
    """自然排序字符串列表"""
    return natsorted(items, alg=ns.IGNORECASE)


def get_file_entry(path: str) -> Optional[FileEntry]:
    """获取单个文件的 FileEntry"""
    try:
        p = Path(path)
        if not p.exists():
            return None
        
        st = p.stat()
        is_dir = p.is_dir()
        
        return FileEntry(
            name=p.name,
            path=str(p.absolute()),
            size=st.st_size if not is_dir else 0,
            modified=int(st.st_mtime),
            created=int(st.st_ctime) if hasattr(st, 'st_ctime') else None,
            isDir=is_dir,
            isImage=is_image_file(path) if not is_dir else False,
            isArchive=is_archive_file(path) if not is_dir else False,
            isVideo=is_video_file(path) if not is_dir else False,
            isEpub=is_epub_file(path) if not is_dir else False,
        )
    except (OSError, PermissionError):
        return None


def list_directory(
    path: str,
    filter_supported: bool = True,
    excluded_paths: Optional[list[str]] = None
) -> list[FileEntry]:
    """
    列出目录内容
    - 自然排序
    - 可选过滤支持的格式
    """
    entries = []
    excluded = set(excluded_paths or [])
    
    try:
        p = Path(path)
        if not p.is_dir():
            return []
        
        for item in p.iterdir():
            # 跳过隐藏文件
            if item.name.startswith('.'):
                continue
            
            # 跳过排除的路径
            if str(item.absolute()) in excluded:
                continue
            
            try:
                st = item.stat()
                is_dir = item.is_dir()
                
                # 如果启用过滤，跳过不支持的文件
                if filter_supported and not is_dir and not is_supported_file(str(item)):
                    continue
                
                # 计算文件夹统计
                folder_count = None
                image_count = None
                archive_count = None
                video_count = None
                
                if is_dir:
                    try:
                        folder_count = 0
                        image_count = 0
                        archive_count = 0
                        video_count = 0
                        for sub in item.iterdir():
                            if sub.name.startswith('.'):
                                continue
                            if sub.is_dir():
                                folder_count += 1
                            elif is_image_file(str(sub)):
                                image_count += 1
                            elif is_archive_file(str(sub)):
                                archive_count += 1
                            elif is_video_file(str(sub)):
                                video_count += 1
                    except (OSError, PermissionError):
                        pass
                
                entry = FileEntry(
                    name=item.name,
                    path=str(item.absolute()),
                    size=st.st_size if not is_dir else 0,
                    modified=int(st.st_mtime),
                    created=int(st.st_ctime) if hasattr(st, 'st_ctime') else None,
                    isDir=is_dir,
                    isImage=is_image_file(str(item)) if not is_dir else False,
                    isArchive=is_archive_file(str(item)) if not is_dir else False,
                    isVideo=is_video_file(str(item)) if not is_dir else False,
                    isEpub=is_epub_file(str(item)) if not is_dir else False,
                    folderCount=folder_count,
                    imageCount=image_count,
                    archiveCount=archive_count,
                    videoCount=video_count,
                )
                entries.append(entry)
            except (OSError, PermissionError):
                continue
    except (OSError, PermissionError):
        return []
    
    return natural_sort_entries(entries)


def list_subfolders(path: str) -> list[SubfolderItem]:
    """快速列出子文件夹"""
    subfolders = []
    
    try:
        p = Path(path)
        if not p.is_dir():
            return []
        
        for item in p.iterdir():
            if item.name.startswith('.'):
                continue
            
            if item.is_dir():
                # 检查是否有子目录
                has_children = False
                try:
                    for sub in item.iterdir():
                        if sub.is_dir() and not sub.name.startswith('.'):
                            has_children = True
                            break
                except (OSError, PermissionError):
                    pass
                
                subfolders.append(SubfolderItem(
                    path=str(item.absolute()),
                    name=item.name,
                    has_children=has_children,
                ))
    except (OSError, PermissionError):
        return []
    
    return natsorted(subfolders, key=lambda x: x.name.lower(), alg=ns.IGNORECASE)


def get_images_in_directory(path: str, recursive: bool = False) -> list[str]:
    """获取目录中的所有图片路径"""
    images = []
    
    try:
        p = Path(path)
        if not p.is_dir():
            return []
        
        if recursive:
            for item in p.rglob('*'):
                if item.is_file() and is_image_file(str(item)):
                    images.append(str(item.absolute()))
        else:
            for item in p.iterdir():
                if item.is_file() and is_image_file(str(item)):
                    images.append(str(item.absolute()))
    except (OSError, PermissionError):
        return []
    
    return natural_sort_strings(images)


def load_directory_snapshot(path: str, use_cache: bool = True) -> DirectorySnapshotResponse:
    """
    加载目录快照（带缓存）
    """
    try:
        p = Path(path)
        if not p.is_dir():
            return DirectorySnapshotResponse(items=[], mtime=None, cached=False)
        
        mtime = int(p.stat().st_mtime)
        cache_key = path
        
        # 检查缓存
        if use_cache and cache_key in _snapshot_cache:
            cached = _snapshot_cache[cache_key]
            if cached.mtime == mtime:
                return DirectorySnapshotResponse(
                    items=cached.items,
                    mtime=cached.mtime,
                    cached=True,
                )
        
        # 生成新快照
        items = list_directory(path, filter_supported=True)
        snapshot = DirectorySnapshotResponse(
            items=items,
            mtime=mtime,
            cached=False,
        )
        
        # 更新缓存
        _snapshot_cache[cache_key] = snapshot
        
        return snapshot
    except (OSError, PermissionError):
        return DirectorySnapshotResponse(items=[], mtime=None, cached=False)


def invalidate_snapshot_cache(path: Optional[str] = None):
    """清除目录快照缓存"""
    if path:
        _snapshot_cache.pop(path, None)
    else:
        _snapshot_cache.clear()
