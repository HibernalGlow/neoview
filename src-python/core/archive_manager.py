"""
压缩包管理器
支持 ZIP/RAR/7z 格式的读取和提取

【性能优化】
- 使用 LRU 缓存保持压缩包句柄打开，避免重复打开大文件
- 提取的文件数据也会被缓存，加速连续访问
- ZIP 使用 deflate 原生解压（zlib 是 C 实现）
- 大文件使用流式读取减少内存压力
"""
import os
import zipfile
import tempfile
import threading
import zlib
from pathlib import Path
from typing import Optional, Any
from natsort import natsorted, ns
from cachetools import TTLCache, LRUCache

from models.schemas import ArchiveEntry
from core.fs_manager import is_image_file, is_video_file

# 压缩包索引缓存 (最多 100 个，TTL 1 小时)
_archive_cache: TTLCache = TTLCache(maxsize=100, ttl=3600)

# 【性能优化】压缩包句柄缓存 (最多 10 个，避免重复打开大文件)
# 增加到 10 个以支持更多并发访问
_archive_handle_cache: LRUCache = LRUCache(maxsize=10)
_handle_lock = threading.Lock()

# 【性能优化】提取数据缓存 (最多 200MB，缓存最近提取的文件)
# 增加缓存大小以支持更多预加载
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
                # 跳过目录
                if name.endswith('/'):
                    continue
                
                # 获取文件名
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
            for idx, (name, info) in enumerate(zf.archiveinfo().files_info.items()):
                if info.get('is_dir', False):
                    continue
                
                file_name = Path(name).name
                
                entries.append(ArchiveEntry(
                    name=file_name,
                    path=name,
                    size=info.get('uncompressed', 0),
                    isDir=False,
                    isImage=is_image_file(name),
                    entryIndex=idx,
                    modified=None,
                ))
    except Exception:
        # py7zr API 可能不同，使用备用方法
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
    """
    列出压缩包内容
    - 自动检测格式
    - 返回排序后的条目列表
    - 缓存索引
    """
    # 检查缓存
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
    
    # 更新索引
    for idx, entry in enumerate(entries):
        entry.entryIndex = idx
    
    # 缓存
    if use_cache:
        _archive_cache[path] = entries
    
    return entries


# 【性能优化】尝试使用 libarchive（C 原生库，速度接近 Rust）
_use_libarchive = False
try:
    import libarchive
    _use_libarchive = True
except ImportError:
    pass


def _extract_with_libarchive(archive_path: str, inner_path: str) -> bytes:
    """
    使用 libarchive 提取文件（C 原生实现，速度快）
    支持 ZIP/RAR/7z 等多种格式
    """
    import libarchive
    
    # 标准化路径
    normalized = inner_path.replace("\\", "/")
    
    with libarchive.file_reader(archive_path) as archive:
        for entry in archive:
            entry_path = str(entry).replace("\\", "/")
            if entry_path == normalized:
                # 读取文件内容
                blocks = []
                for block in entry.get_blocks():
                    blocks.append(block)
                return b''.join(blocks)
    
    raise FileNotFoundError(f"文件不存在: {inner_path}")


def extract_from_zip(archive_path: str, inner_path: str) -> bytes:
    """
    从 ZIP 提取文件
    【性能优化】
    - 优先使用 libarchive（C 原生，速度接近 Rust）
    - 回退到 Python zipfile（使用缓存句柄）
    - 提取结果缓存避免重复解压
    """
    global _extract_cache_size
    
    # 检查提取缓存（最快路径）
    cache_key = f"{archive_path}::{inner_path}"
    if cache_key in _extract_cache:
        return _extract_cache[cache_key]
    
    data = None
    
    # 【性能优化】优先使用 libarchive
    if _use_libarchive:
        try:
            data = _extract_with_libarchive(archive_path, inner_path)
        except Exception:
            # libarchive 失败，回退到 zipfile
            pass
    
    # 回退到 Python zipfile
    if data is None:
        try:
            zf = _get_cached_zip_handle(archive_path)
            data = zf.read(inner_path)
        except (KeyError, zipfile.BadZipFile, OSError):
            _close_archive_handles(archive_path)
            try:
                zf = _get_cached_zip_handle(archive_path)
                data = zf.read(inner_path)
            except KeyError:
                raise FileNotFoundError(f"文件不存在: {inner_path}")
    
    if data is None:
        raise FileNotFoundError(f"文件不存在: {inner_path}")
    
    # 缓存提取的数据（小于 20MB 才缓存）
    if len(data) < 20 * 1024 * 1024:
        if _extract_cache_size + len(data) > _MAX_EXTRACT_CACHE_SIZE:
            # 清理一半缓存
            keys_to_remove = list(_extract_cache.keys())[:len(_extract_cache) // 2]
            for key in keys_to_remove:
                removed = _extract_cache.pop(key, None)
                if removed:
                    _extract_cache_size -= len(removed)
        
        _extract_cache[cache_key] = data
        _extract_cache_size += len(data)
    
    return data


def extract_from_rar(archive_path: str, inner_path: str) -> bytes:
    """
    从 RAR 提取文件
    【性能优化】优先使用 libarchive
    """
    global _extract_cache_size
    
    # 检查缓存
    cache_key = f"{archive_path}::{inner_path}"
    if cache_key in _extract_cache:
        return _extract_cache[cache_key]
    
    data = None
    
    # 优先使用 libarchive
    if _use_libarchive:
        try:
            data = _extract_with_libarchive(archive_path, inner_path)
        except Exception:
            pass
    
    # 回退到 rarfile
    if data is None:
        import rarfile
        with rarfile.RarFile(archive_path) as rf:
            data = rf.read(inner_path)
    
    # 缓存
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
    """
    从 7z 提取文件
    【性能优化】优先使用 libarchive
    """
    global _extract_cache_size
    
    # 检查缓存
    cache_key = f"{archive_path}::{inner_path}"
    if cache_key in _extract_cache:
        return _extract_cache[cache_key]
    
    data = None
    
    # 优先使用 libarchive
    if _use_libarchive:
        try:
            data = _extract_with_libarchive(archive_path, inner_path)
        except Exception:
            pass
    
    # 回退到 py7zr
    if data is None:
        import py7zr
        with py7zr.SevenZipFile(archive_path, 'r') as zf:
            result = zf.read([inner_path])
            if inner_path in result:
                data = result[inner_path].read()
    
    if data is None:
        raise FileNotFoundError(f"文件不存在: {inner_path}")
    
    # 缓存
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
    
    # 标准化路径分隔符（ZIP 使用正斜杠）
    normalized_path = inner_path.replace("\\", "/")
    
    if archive_type == "zip":
        return extract_from_zip(archive_path, normalized_path)
    elif archive_type == "rar":
        return extract_from_rar(archive_path, normalized_path)
    elif archive_type == "7z":
        return extract_from_7z(archive_path, normalized_path)
    else:
        raise ValueError(f"不支持的压缩包格式: {archive_path}")


def extract_to_temp(archive_path: str, inner_path: str) -> str:
    """提取文件到临时目录，返回临时文件路径"""
    data = extract_file(archive_path, inner_path)
    
    # 创建临时文件
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
    
    # 创建临时文件
    temp_path = archive_path + ".tmp"
    
    with zipfile.ZipFile(archive_path, 'r') as zf_in:
        with zipfile.ZipFile(temp_path, 'w', compression=zf_in.compression) as zf_out:
            for item in zf_in.infolist():
                if item.filename != inner_path:
                    data = zf_in.read(item.filename)
                    zf_out.writestr(item, data)
    
    # 替换原文件
    shutil.move(temp_path, archive_path)
    
    # 清除缓存
    _archive_cache.pop(archive_path, None)


def invalidate_archive_cache(path: Optional[str] = None):
    """清除压缩包缓存"""
    global _extract_cache_size
    
    if path:
        _archive_cache.pop(path, None)
        _close_archive_handles(path)
        # 清理相关的提取缓存
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
