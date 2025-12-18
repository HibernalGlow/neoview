"""
流式加载 API
提供 WebSocket 流式目录加载和搜索
"""
import orjson
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from models.schemas import StreamBatch, StreamProgress, StreamComplete
from core.stream_manager import (
    stream_directory,
    stream_search,
    cancel_stream,
    get_active_stream_count,
)

router = APIRouter()


@router.websocket("/stream/directory")
async def ws_stream_directory(
    websocket: WebSocket,
    path: str = Query(...),
    batch_size: int = Query(15),
    skip_hidden: bool = Query(True),
):
    """
    流式目录加载（WebSocket）
    - 首批 200ms 内返回
    - 支持取消
    - 返回进度信息
    """
    await websocket.accept()
    
    try:
        async for item in stream_directory(path, batch_size, skip_hidden):
            if isinstance(item, StreamBatch):
                await websocket.send_json({
                    "type": "batch",
                    "data": orjson.loads(orjson.dumps(item.model_dump())),
                })
            elif isinstance(item, StreamProgress):
                await websocket.send_json({
                    "type": "progress",
                    "data": item.model_dump(),
                })
            elif isinstance(item, StreamComplete):
                await websocket.send_json({
                    "type": "complete",
                    "data": item.model_dump(),
                })
    except WebSocketDisconnect:
        pass
    finally:
        await websocket.close()


@router.websocket("/stream/search")
async def ws_stream_search(
    websocket: WebSocket,
    path: str = Query(...),
    query: str = Query(...),
    batch_size: int = Query(15),
    recursive: bool = Query(True),
):
    """
    流式搜索（WebSocket）
    - 边搜索边返回结果
    - 支持取消
    """
    await websocket.accept()
    
    try:
        async for item in stream_search(path, query, batch_size, recursive):
            if isinstance(item, StreamBatch):
                await websocket.send_json({
                    "type": "batch",
                    "data": orjson.loads(orjson.dumps(item.model_dump())),
                })
            elif isinstance(item, StreamProgress):
                await websocket.send_json({
                    "type": "progress",
                    "data": item.model_dump(),
                })
            elif isinstance(item, StreamComplete):
                await websocket.send_json({
                    "type": "complete",
                    "data": item.model_dump(),
                })
    except WebSocketDisconnect:
        pass
    finally:
        await websocket.close()


@router.post("/stream/cancel/{stream_id}")
async def api_cancel_stream(stream_id: str) -> bool:
    """取消流"""
    return cancel_stream(stream_id)


@router.get("/stream/active-count")
async def api_get_active_stream_count() -> int:
    """获取活跃流数量"""
    return get_active_stream_count()
