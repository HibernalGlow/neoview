"""
流式加载管理器
提供目录流式扫描、搜索等功能
"""
import asyncio
import time
import uuid
from pathlib import Path
from typing import Optional, AsyncGenerator
from dataclasses import dataclass

from models.schemas import FileEntry, StreamBatch, StreamProgress, StreamComplete
from core.fs_manager import (
    is_supported_file,
    is_image_file,
    is_archive_file,
    is_video_file,
    is_epub_file,
    natural_sort_strings,
)


@dataclass
class StreamState:
    """流状态"""
    stream_id: str
    cancelled: bool = False
    started_at: float = 0.0


# 活跃的流
_active_streams: dict[str, StreamState] = {}


def create_stream() -> StreamState:
    """创建新的流"""
    stream_id = str(uuid.uuid4())
    state = StreamState(stream_id=stream_id, started_at=time.time())
    _active_streams[stream_id] = state
    return state


def cancel_stream(stream_id: str) -> bool:
    """取消流"""
    if stream_id in _active_streams:
        _active_streams[stream_id].cancelled = True
        return True
    return False


def remove_stream(stream_id: str):
    """移除流"""
    _active_streams.pop(stream_id, None)


def get_active_stream_count() -> int:
    """获取活跃流数量"""
    return len(_active_streams)


async def stream_directory(
    path: str,
    batch_size: int = 15,
    skip_hidden: bool = True,
    filter_supported: bool = True,
) -> AsyncGenerator[StreamBatch | StreamProgress | StreamComplete, None]:
    """
    流式目录扫描
    - 首批 200ms 内返回
    - 支持取消
    - 返回进度信息
    """
    state = create_stream()
    
    try:
        p = Path(path)
        if not p.is_dir():
            yield StreamComplete(
                total_items=0,
                skipped_items=0,
                elapsed_ms=0,
                from_cache=False,
            )
            return
        
        batch: list[FileEntry] = []
        batch_index = 0
        total_items = 0
        skipped_items = 0
        first_batch_sent = False
        
        # 收集所有文件名用于排序
        all_items: list[tuple[str, Path]] = []
        
        for item in p.iterdir():
            if state.cancelled:
                break
            
            # 跳过隐藏文件
            if skip_hidden and item.name.startswith('.'):
                skipped_items += 1
                continue
            
            all_items.append((item.name, item))
        
        # 自然排序
        sorted_items = sorted(all_items, key=lambda x: x[0].lower())
        
        for name, item in sorted_items:
            if state.cancelled:
                break
            
            try:
                is_dir = item.is_dir()
                
                # 过滤不支持的文件
                if filter_supported and not is_dir and not is_supported_file(str(item)):
                    skipped_items += 1
                    continue
                
                st = item.stat()
                
                entry = FileEntry(
                    name=item.name,
                    path=str(item.absolute()),
                    size=st.st_size if not is_dir else 0,
                    modified=int(st.st_mtime),
                    created=int(st.st_ctime) if hasattr(st, 'st_ctime') else None,
                    is_dir=is_dir,
                    is_image=is_image_file(str(item)) if not is_dir else False,
                    is_archive=is_archive_file(str(item)) if not is_dir else False,
                    is_video=is_video_file(str(item)) if not is_dir else False,
                    is_epub=is_epub_file(str(item)) if not is_dir else False,
                )
                
                batch.append(entry)
                total_items += 1
                
                # 发送批次
                if len(batch) >= batch_size:
                    yield StreamBatch(items=batch, batch_index=batch_index)
                    batch = []
                    batch_index += 1
                    first_batch_sent = True
                    
                    # 发送进度
                    elapsed_ms = int((time.time() - state.started_at) * 1000)
                    yield StreamProgress(
                        loaded=total_items,
                        estimated_total=None,
                        elapsed_ms=elapsed_ms,
                    )
                    
                    # 让出控制权
                    await asyncio.sleep(0)
                    
            except (OSError, PermissionError):
                skipped_items += 1
                continue
        
        # 发送剩余批次
        if batch:
            yield StreamBatch(items=batch, batch_index=batch_index)
        
        # 发送完成
        elapsed_ms = int((time.time() - state.started_at) * 1000)
        yield StreamComplete(
            total_items=total_items,
            skipped_items=skipped_items,
            elapsed_ms=elapsed_ms,
            from_cache=False,
        )
        
    finally:
        remove_stream(state.stream_id)


async def stream_search(
    path: str,
    query: str,
    batch_size: int = 15,
    recursive: bool = True,
) -> AsyncGenerator[StreamBatch | StreamProgress | StreamComplete, None]:
    """
    流式搜索
    - 边搜索边返回结果
    - 支持取消
    """
    state = create_stream()
    query_lower = query.lower()
    
    try:
        p = Path(path)
        if not p.is_dir():
            yield StreamComplete(
                total_items=0,
                skipped_items=0,
                elapsed_ms=0,
                from_cache=False,
            )
            return
        
        batch: list[FileEntry] = []
        batch_index = 0
        total_items = 0
        skipped_items = 0
        
        # 遍历目录
        iterator = p.rglob('*') if recursive else p.iterdir()
        
        for item in iterator:
            if state.cancelled:
                break
            
            # 跳过隐藏文件
            if any(part.startswith('.') for part in item.parts):
                continue
            
            # 匹配查询
            if query_lower not in item.name.lower():
                continue
            
            try:
                is_dir = item.is_dir()
                
                # 只返回支持的文件
                if not is_dir and not is_supported_file(str(item)):
                    continue
                
                st = item.stat()
                
                entry = FileEntry(
                    name=item.name,
                    path=str(item.absolute()),
                    size=st.st_size if not is_dir else 0,
                    modified=int(st.st_mtime),
                    created=int(st.st_ctime) if hasattr(st, 'st_ctime') else None,
                    is_dir=is_dir,
                    is_image=is_image_file(str(item)) if not is_dir else False,
                    is_archive=is_archive_file(str(item)) if not is_dir else False,
                    is_video=is_video_file(str(item)) if not is_dir else False,
                    is_epub=is_epub_file(str(item)) if not is_dir else False,
                )
                
                batch.append(entry)
                total_items += 1
                
                # 发送批次
                if len(batch) >= batch_size:
                    yield StreamBatch(items=batch, batch_index=batch_index)
                    batch = []
                    batch_index += 1
                    
                    # 发送进度
                    elapsed_ms = int((time.time() - state.started_at) * 1000)
                    yield StreamProgress(
                        loaded=total_items,
                        estimated_total=None,
                        elapsed_ms=elapsed_ms,
                    )
                    
                    # 让出控制权
                    await asyncio.sleep(0)
                    
            except (OSError, PermissionError):
                skipped_items += 1
                continue
        
        # 发送剩余批次
        if batch:
            yield StreamBatch(items=batch, batch_index=batch_index)
        
        # 发送完成
        elapsed_ms = int((time.time() - state.started_at) * 1000)
        yield StreamComplete(
            total_items=total_items,
            skipped_items=skipped_items,
            elapsed_ms=elapsed_ms,
            from_cache=False,
        )
        
    finally:
        remove_stream(state.stream_id)
