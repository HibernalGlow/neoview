"""
超分服务 API
提供图片超分辨率放大功能
"""
import uuid
import asyncio
from typing import Optional
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from models.schemas import UpscaleRequest, UpscaleConditions, UpscaleStatus

router = APIRouter()

# 任务队列
_tasks: dict[str, UpscaleStatus] = {}
_conditions = UpscaleConditions()
_executor = ThreadPoolExecutor(max_workers=2)

# WebSocket 连接
_websocket_clients: list[WebSocket] = []


class UpscaleTaskRequest(BaseModel):
    """超分任务请求"""
    image_path: str
    book_path: Optional[str] = None
    page_index: int = 0
    model: str = "realesrgan-x4plus"
    scale: int = 4


@router.post("/upscale/init")
async def upscale_init():
    """初始化超分服务"""
    # 这里可以加载模型等初始化操作
    return {"success": True}


@router.post("/upscale/request")
async def upscale_request(request: UpscaleTaskRequest) -> str:
    """请求超分，返回 task_id"""
    if not Path(request.image_path).exists():
        raise HTTPException(status_code=404, detail=f"文件不存在: {request.image_path}")
    
    task_id = str(uuid.uuid4())
    
    _tasks[task_id] = UpscaleStatus(
        task_id=task_id,
        status="pending",
        progress=0.0,
    )
    
    # 启动异步任务
    asyncio.create_task(_process_upscale(task_id, request))
    
    return task_id


async def _process_upscale(task_id: str, request: UpscaleTaskRequest):
    """处理超分任务"""
    try:
        _tasks[task_id].status = "processing"
        await _broadcast_status(task_id)
        
        # 模拟超分处理（实际应调用超分模型）
        for i in range(10):
            await asyncio.sleep(0.5)
            _tasks[task_id].progress = (i + 1) * 10
            await _broadcast_status(task_id)
        
        # 完成
        _tasks[task_id].status = "completed"
        _tasks[task_id].progress = 100
        _tasks[task_id].result_path = request.image_path  # 实际应返回超分后的路径
        await _broadcast_status(task_id)
        
    except Exception as e:
        _tasks[task_id].status = "failed"
        _tasks[task_id].error = str(e)
        await _broadcast_status(task_id)


async def _broadcast_status(task_id: str):
    """广播任务状态"""
    if task_id not in _tasks:
        return
    
    status = _tasks[task_id]
    message = {
        "type": "upscale_status",
        "data": status.model_dump(),
    }
    
    for ws in _websocket_clients[:]:
        try:
            await ws.send_json(message)
        except Exception:
            _websocket_clients.remove(ws)


@router.get("/upscale/status/{task_id}")
async def get_upscale_status(task_id: str) -> UpscaleStatus:
    """查询任务状态"""
    if task_id not in _tasks:
        raise HTTPException(status_code=404, detail=f"任务不存在: {task_id}")
    
    return _tasks[task_id]


@router.post("/upscale/cancel/{task_id}")
async def cancel_upscale(task_id: str):
    """取消超分任务"""
    if task_id not in _tasks:
        raise HTTPException(status_code=404, detail=f"任务不存在: {task_id}")
    
    _tasks[task_id].status = "cancelled"
    await _broadcast_status(task_id)
    
    return {"success": True}


@router.websocket("/upscale/ws")
async def upscale_websocket(websocket: WebSocket):
    """WebSocket 推送任务进度"""
    await websocket.accept()
    _websocket_clients.append(websocket)
    
    try:
        while True:
            # 保持连接
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in _websocket_clients:
            _websocket_clients.remove(websocket)


@router.post("/upscale/conditions")
async def update_conditions(conditions: UpscaleConditions):
    """更新超分条件"""
    global _conditions
    _conditions = conditions
    return {"success": True}


@router.get("/upscale/conditions")
async def get_conditions() -> UpscaleConditions:
    """获取超分条件"""
    return _conditions
