"""
系统 API
提供系统信息、健康检查等功能
"""
import os
import shutil
import subprocess
from pathlib import Path
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


@router.get("/system/home-dir")
async def get_home_dir() -> str:
    """获取用户主目录"""
    return str(Path.home())


@router.get("/system/startup-config")
async def get_startup_config() -> dict:
    """获取启动配置"""
    # 返回默认配置
    return {
        "cacheDir": str(Path.home() / ".neoview" / "cache"),
        "thumbnailPath": str(Path.home() / ".neoview" / "thumbnails"),
        "lastOpenPath": None,
    }


@router.post("/system/startup-config")
async def save_startup_config(config: dict) -> dict:
    """保存启动配置"""
    # TODO: 实现配置持久化
    return {"success": True}


@router.post("/system/startup-config/field")
async def update_startup_config_field(field: str, value: str | None) -> dict:
    """更新启动配置字段"""
    # TODO: 实现配置持久化
    return {"success": True}


@router.post("/system/open")
async def open_with_system(path: str) -> dict:
    """在系统默认程序中打开文件"""
    import platform
    
    system = platform.system()
    try:
        if system == "Windows":
            os.startfile(path)
        elif system == "Darwin":
            subprocess.run(["open", path], check=True)
        else:
            subprocess.run(["xdg-open", path], check=True)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/system/show-in-explorer")
async def show_in_file_manager(path: str) -> dict:
    """在文件管理器中显示文件"""
    import platform
    
    system = platform.system()
    try:
        if system == "Windows":
            subprocess.run(["explorer", "/select,", path], check=True)
        elif system == "Darwin":
            subprocess.run(["open", "-R", path], check=True)
        else:
            # Linux: 打开父目录
            parent = str(Path(path).parent)
            subprocess.run(["xdg-open", parent], check=True)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
