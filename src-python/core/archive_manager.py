"""
压缩包管理器
支持 ZIP/RAR/7z 格式的读取和提取

【性能优化】
- 使用 LRU 缓存保持压缩包句柄打开，避免重复打开大文件
- 提取的文件数据缓存，加速连续访问
- ZIP 使用 zlib（C 实现）解压
- 支持流式响应，边解压边传输
"""
import os
import zipfile
import tempfile
import threading
from pathlib import Path
from typing import Optional, Generator
from natsort import natsorted, ns
from cachetools import TTLCache, LRUCache

from models.schemas import ArchiveEntry
from core.fs_manager import is_image_file, is_video_file

# 压缩包索引缓存 (最多 100 个，TTL 1 小时)
_archive_cache: TTLCache = TTLCache(maxsize=100, ttl=3600)

# 【性能优化】压缩包句柄缓存 (最多 10 个，避免重复打开大文件)
_archive_handle_cache: LRUCache = LRUCache(maxsize=10)
_handle_lock = threading.Lock()

# 【性能优化】提取数据缓存 (最多 200MB)
_extract_cache: LRUCache = LRUCache(maxsize=200)
_extract_cache_size = 0
_MAX_EXTRACT_CACHE_SIZE = 200 * 1024 * 1024  # 200MB


def _get_cached_zip_handle(path: str) -> zipfile.ZipFile:
    """获取缓存的 ZIP 句柄"""
    with _handle_lock:
        if path in _archive_handle_cache:
            return _archive_handle_cache[path]
        
        # 打开新句柄
        zf = zipfile.ZipFile(path, 'r')
        _archive_handle_cache[path] = zf
        return zf


def _close_archive_handles(path: Optional[str] = None):
    """关闭压缩包句柄"""
    with _handle_lock:
        if path:
            handle = _archive_handle_cache.pop(path, None)
            if handle:
                try:
                    handle.close()
                except Exception:
                    pass
        else:
            for handle in _archive_handle_cache.values():
                try:
                    handle.close()
                except Exception:
                    pass
            _archive_handle_cache.clear()


def detect_archive_type(path: str) -> Optional[str]:
    """检测压缩包类型"""
    ext = Path(path).suffix.lower()
    if ext in {".zip", ".cbz"}:
        return "zip"
    elif ext in {".rar", ".cbr"}:
        return "rar"
    elif ext in {".7z", ".cb7"}:
        return "7z"
    return None


def list_zip_contents(path: str) -> list[ArchiveEntry]:
    """列出 ZIP 压缩包内容"""
    entries = []
    try:
        with zipfile.ZipFile(path, 'r') as zf:
            for idx, info in enumerate(zf.infolist()):
                name = info.filename
                if name.endswith('/'):
                    continue
                
                file_name = Path(name).name
                
                entries.append(ArchiveEntry(
                    name=file_name,
                    path=name,
                    size=info.file_size,
                    isDir=info.is_dir(),
                    isImage=is_image_file(name),
                    entryIndex=idx,
                    modified=int(info.date_time[0] * 10000000 + info.date_time[1] * 100000 + 
                               info.date_time[2] * 1000 + info.date_time[3] * 100 + 
                               info.date_time[4] * 10 + info.date_time[5]) if info.date_time else None,
                ))
    except Exception:
        pass
    return entries


def list_rar_contents(path: str) -> list[ArchiveEntry]:
    """列出 RAR 压缩包内容"""
    entries = []
    try:
        import rarfile
        with rarfile.RarFile(path) as rf:
            for idx, info in enumerate(rf.infolist()):
                name = info.filename
                if info.is_dir():
                    continue
                
                file_name = Path(name).name
                
                entries.append(ArchiveEntry(
                    name=file_name,
                    path=name,
                    size=info.file_size,
                    isDir=info.is_dir(),
                    isImage=is_image_file(name),
                    entryIndex=idx,
                    modified=int(info.mtime.timestamp()) if info.mtime else None,
                ))
    except Exception:
        pass
    return entries


def list_7z_contents(path: str) -> list[ArchiveEntry]:
    """列出 7z 压缩包内容"""
    entries = []
    try:
        import py7zr
        with py7zr.SevenZipFile(path, 'r') as zf:
            for idx, name in enumerate(zf.getnames()):
                file_name = Path(name).name
                entries.append(ArchiveEntry(
                    name=file_name,
                    path=name,
                    size=0,
                    isDir=False,
                    isImage=is_image_file(name),
                    entryIndex=idx,
                    modified=None,
                ))
    except Exception:
        pass
    return entries


def list_archive_contents(path: str, use_cache: bool = True) -> list[ArchiveEntry]:
    """列出压缩包内容"""
    if use_cache and path in _archive_cache:
        return _archive_cache[path]
    
    archive_type = detect_archive_type(path)
    
    if archive_type == "zip":
        entries = list_zip_contents(path)
    elif archive_type == "rar":
        entries = list_rar_contents(path)
    elif archive_type == "7z":
        entries = list_7z_contents(path)
    else:
        entries = []
    
    # 自然排序
    entries = natsorted(entries, key=lambda x: x.path.lower(), alg=ns.IGNORECASE)
    
    for idx, entry in enumerate(entries):
        entry.entryIndex = idx
    
    if use_cache:
        _archive_cache[path] = entries
    
    return entries


# ============================================================================
# 流式提取 API
# ============================================================================

def extract_from_zip_stream(archive_path: str, inner_path: str, chunk_size: int = 65536) -> Generator[bytes, None, None]:
    """
    从 ZIP 流式提取文件
    【性能优化】边解压边传输，减少内存占用和首字节延迟
    """
    try:
        zf = _get_cached_zip_handle(archive_path)
        with zf.open(inner_path) as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                yield chunk
    except (KeyError, zipfile.BadZipFile, OSError):
        _close_archive_handles(archive_path)
        zf = _get_cached_zip_handle(archive_path)
        with zf.open(inner_path) as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                yield chunk


def extract_from_zip(archive_path: str, inner_path: str) -> bytes:
    """从 ZIP 提取文件（使用缓存）"""
    global _extract_cache_size
    
    cache_key = f"{archive_path}::{inner_path}"
    if cache_key in _extract_cache:
        return _extract_cache[cache_key]
    
    # 使用流式读取收集数据
    chunks = list(extract_from_zip_stream(archive_path, inner_path))
    data = b''.join(chunks)
    
    # 缓存（小于 20MB）
    if len(data) < 20 * 1024 * 1024:
        if _extract_cache_size + len(data) > _MAX_EXTRACT_CACHE_SIZE:
            keys_to_remove = list(_extract_cache.keys())[:len(_extract_cache) // 2]
            for key in keys_to_remove:
                removed = _extract_cache.pop(key, None)
                if removed:
                    _extract_cache_size -= len(removed)
        
        _extract_cache[cache_key] = data
        _extract_cache_size += len(data)
    
    return data


def extract_from_rar(archive_path: str, inner_path: str) -> bytes:
    """从 RAR 提取文件"""
    global _extract_cache_size
    
    cache_key = f"{archive_path}::{inner_path}"
    if cache_key in _extract_cache:
        return _extract_cache[cache_key]
    
    import rarfile
    with rarfile.RarFile(archive_path) as rf:
        data = rf.read(inner_path)
    
    if data and len(data) < 20 * 1024 * 1024:
        if _extract_cache_size + len(data) > _MAX_EXTRACT_CACHE_SIZE:
            keys_to_remove = list(_extract_cache.keys())[:len(_extract_cache) // 2]
            for key in keys_to_remove:
                removed = _extract_cache.pop(key, None)
                if removed:
                    _extract_cache_size -= len(removed)
        _extract_cache[cache_key] = data
        _extract_cache_size += len(data)
    
    return data


def extract_from_7z(archive_path: str, inner_path: str) -> bytes:
    """从 7z 提取文件"""
    global _extract_cache_size
    
    cache_key = f"{archive_path}::{inner_path}"
    if cache_key in _extract_cache:
        return _extract_cache[cache_key]
    
    import py7zr
    with py7zr.SevenZipFile(archive_path, 'r') as zf:
        result = zf.read([inner_path])
        if inner_path in result:
            data = result[inner_path].read()
        else:
            raise FileNotFoundError(f"文件不存在: {inner_path}")
    
    if len(data) < 20 * 1024 * 1024:
        if _extract_cache_size + len(data) > _MAX_EXTRACT_CACHE_SIZE:
            keys_to_remove = list(_extract_cache.keys())[:len(_extract_cache) // 2]
            for key in keys_to_remove:
                removed = _extract_cache.pop(key, None)
                if removed:
                    _extract_cache_size -= len(removed)
        _extract_cache[cache_key] = data
        _extract_cache_size += len(data)
    
    return data


def extract_file(archive_path: str, inner_path: str) -> bytes:
    """从压缩包提取文件"""
    archive_type = detect_archive_type(archive_path)
    normalized_path = inner_path.replace("\\", "/")
    
    if archive_type == "zip":
        return extract_from_zip(archive_path, normalized_path)
    elif archive_type == "rar":
        return extract_from_rar(archive_path, normalized_path)
    elif archive_type == "7z":
        return extract_from_7z(archive_path, normalized_path)
    else:
        raise ValueError(f"不支持的压缩包格式: {archive_path}")


def extract_file_stream(archive_path: str, inner_path: str) -> Generator[bytes, None, None]:
    """
    流式提取文件（仅 ZIP 支持真正的流式）
    其他格式回退到一次性读取
    """
    archive_type = detect_archive_type(archive_path)
    normalized_path = inner_path.replace("\\", "/")
    
    if archive_type == "zip":
        yield from extract_from_zip_stream(archive_path, normalized_path)
    else:
        # RAR/7z 不支持流式，一次性返回
        data = extract_file(archive_path, inner_path)
        yield data


def extract_to_temp(archive_path: str, inner_path: str) -> str:
    """提取文件到临时目录"""
    data = extract_file(archive_path, inner_path)
    
    suffix = Path(inner_path).suffix
    fd, temp_path = tempfile.mkstemp(suffix=suffix)
    try:
        os.write(fd, data)
    finally:
        os.close(fd)
    
    return temp_path


def delete_zip_entry(archive_path: str, inner_path: str):
    """删除 ZIP 压缩包中的条目"""
    import shutil
    
    temp_path = archive_path + ".tmp"
    
    with zipfile.ZipFile(archive_path, 'r') as zf_in:
        with zipfile.ZipFile(temp_path, 'w', compression=zf_in.compression) as zf_out:
            for item in zf_in.infolist():
                if item.filename != inner_path:
                    data = zf_in.read(item.filename)
                    zf_out.writestr(item, data)
    
    shutil.move(temp_path, archive_path)
    _archive_cache.pop(archive_path, None)


def invalidate_archive_cache(path: Optional[str] = None):
    """清除压缩包缓存"""
    global _extract_cache_size
    
    if path:
        _archive_cache.pop(path, None)
        _close_archive_handles(path)
        keys_to_remove = [k for k in _extract_cache.keys() if k.startswith(f"{path}::")]
        for key in keys_to_remove:
            removed = _extract_cache.pop(key, None)
            if removed:
                _extract_cache_size -= len(removed)
    else:
        _archive_cache.clear()
        _close_archive_handles()
        _extract_cache.clear()
        _extract_cache_size = 0
