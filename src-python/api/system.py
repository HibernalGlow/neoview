"""
系统 API
提供系统信息、健康检查等功能
"""
import shutil
from fastapi import APIRouter

router = APIRouter()


@router.get("/system/ffmpeg")
async def check_ffmpeg() -> bool:
    """检查 FFmpeg 是否可用"""
    # 检查 ffmpeg 命令是否存在
    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path:
        return True
    
    # 检查 PyAV 是否可用
    try:
        import av
        return True
    except ImportError:
        return False


@router.get("/system/info")
async def get_system_info() -> dict:
    """获取系统信息"""
    import platform
    import sys
    
    return {
        "python_version": sys.version,
        "platform": platform.platform(),
        "machine": platform.machine(),
    }
