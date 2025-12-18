"""
压缩包管理器
支持 ZIP/RAR/7z 格式的读取和提取
"""
import os
import zipfile
import tempfile
from pathlib import Path
from typing import Optional
from natsort import natsorted, ns
from cachetools import TTLCache

from models.schemas import ArchiveEntry
from core.fs_manager import is_image_file, is_video_file

# 压缩包索引缓存 (最多 100 个，TTL 1 小时)
_archive_cache: TTLCache = TTLCache(maxsize=100, ttl=3600)


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
                    is_dir=info.is_dir(),
                    is_image=is_image_file(name),
                    entry_index=idx,
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
                    is_dir=info.is_dir(),
                    is_image=is_image_file(name),
                    entry_index=idx,
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
                    is_dir=False,
                    is_image=is_image_file(name),
                    entry_index=idx,
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
                        is_dir=False,
                        is_image=is_image_file(name),
                        entry_index=idx,
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
        entry.entry_index = idx
    
    # 缓存
    if use_cache:
        _archive_cache[path] = entries
    
    return entries


def extract_from_zip(archive_path: str, inner_path: str) -> bytes:
    """从 ZIP 提取文件"""
    with zipfile.ZipFile(archive_path, 'r') as zf:
        return zf.read(inner_path)


def extract_from_rar(archive_path: str, inner_path: str) -> bytes:
    """从 RAR 提取文件"""
    import rarfile
    with rarfile.RarFile(archive_path) as rf:
        return rf.read(inner_path)


def extract_from_7z(archive_path: str, inner_path: str) -> bytes:
    """从 7z 提取文件"""
    import py7zr
    with py7zr.SevenZipFile(archive_path, 'r') as zf:
        data = zf.read([inner_path])
        if inner_path in data:
            return data[inner_path].read()
    raise FileNotFoundError(f"文件不存在: {inner_path}")


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
    if path:
        _archive_cache.pop(path, None)
    else:
        _archive_cache.clear()
