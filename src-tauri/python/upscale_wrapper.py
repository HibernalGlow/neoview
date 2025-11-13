"""
NeoView Upscale Wrapper
使用 sr_vulkan 进行图像超分的 Python 包装模块
此模块将被 Rust 通过 PyO3 调用
"""

import sys
import os
from typing import Optional, Tuple, Dict, Any
import threading
import queue
import time

# 尝试导入 sr_vulkan 模块
try:
    from sr_vulkan import sr_vulkan as sr
    SR_AVAILABLE = True
except ImportError:
    SR_AVAILABLE = False
    print("警告: sr_vulkan 模块未找到，超分功能将不可用")


class UpscaleTask:
    """超分任务"""
    def __init__(self, task_id: int):
        self.task_id = task_id
        self.image_data = None
        self.result_data = None
        self.status = "pending"  # pending, processing, completed, failed
        self.error = None
        self.tick = 0.0
        self.model = 0
        self.scale = 2
        self.width = 0
        self.height = 0
        self.format = ""
        self.tile_size = 0
        self.noise_level = 0


class UpscaleManager:
    """超分管理器 - 单例模式"""
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
            
        self.tasks = {}
        self.task_id_counter = 0
        self.result_queue = queue.Queue()
        self.processing_thread = None
        self.running = False
        self.lock = threading.Lock()
        self.sr_initialized = False
        
        if SR_AVAILABLE:
            self._init_sr_vulkan()
            if self.sr_initialized:
                self._start_processing_thread()
    
    def _init_sr_vulkan(self):
        """初始化 sr_vulkan"""
        try:
            print("🔍 初始化 sr_vulkan...")
            
            # 初始化 sr_vulkan
            sts = sr.init()
            print(f"📊 sr.init() 返回: {sts}")
            
            is_cpu_model = False
            if sts < 0:
                print("⚠️ GPU 模式失败，使用 CPU 模式")
                is_cpu_model = True
            
            # 获取 GPU 信息
            gpu_list = sr.getGpuInfo()
            print(f"📊 GPU 列表: {gpu_list}")
            
            # 设置 GPU (使用第一个 GPU)
            gpu_id = 0
            if not is_cpu_model and gpu_list and len(gpu_list) > 0:
                gpu_id = 0
                print(f"🎯 使用 GPU {gpu_id}")
            else:
                gpu_id = -1  # CPU 模式
                print("🎯 使用 CPU 模式")
            
            # 初始化设置
            sts = sr.initSet(gpuId=gpu_id)
            print(f"📊 sr.initSet(gpuId={gpu_id}) 返回: {sts}")
            
            if sts >= 0:
                self.sr_initialized = True
                print("✅ sr_vulkan 初始化成功")
            else:
                print(f"❌ sr_vulkan 初始化失败: {sts}")
                self.sr_initialized = False
                
        except Exception as e:
            print(f"❌ sr_vulkan 初始化异常: {e}")
            self.sr_initialized = False
    
    def _start_processing_thread(self):
        """启动处理线程"""
        if self.processing_thread is not None:
            return
            
        self.running = True
        self.processing_thread = threading.Thread(target=self._process_results, daemon=True)
        self.processing_thread.start()
    
    def _process_results(self):
        """处理超分结果的线程"""
        while self.running:
            try:
                if not SR_AVAILABLE:
                    time.sleep(0.1)
                    continue
                
                # 从 sr_vulkan 获取结果
                result = sr.load(0)
                if result is None:
                    time.sleep(0.01)
                    continue
                
                data, format_str, task_id, tick = result
                
                with self.lock:
                    if task_id in self.tasks:
                        task = self.tasks[task_id]
                        task.result_data = data
                        task.tick = tick
                        
                        if data and len(data) > 0:
                            task.status = "completed"
                        else:
                            task.status = "failed"
                            task.error = "超分返回空数据"
                        
                        # 将结果放入队列供外部获取
                        self.result_queue.put(task_id)
                        
            except Exception as e:
                print(f"处理结果时出错: {e}")
                time.sleep(0.1)
    
    def add_task(
        self,
        image_data: bytes,
        model: int = 0,
        scale: int = 2,
        width: int = 0,
        height: int = 0,
        format_str: str = "",
        tile_size: int = 0,
        noise_level: int = 0
    ) -> int:
        """
        添加超分任务
        
        Args:
            image_data: 图像二进制数据
            model: 模型编号 (0-6)
            scale: 缩放倍数 (2 或 4)
            width: 目标宽度 (0 表示使用 scale)
            height: 目标高度 (0 表示使用 scale)
            format_str: 输出格式
            tile_size: tile 大小 (0 表示自动)
            noise_level: 降噪等级 (-1, 0, 1, 2, 3)
        
        Returns:
            任务 ID
        """
        if not SR_AVAILABLE:
            raise RuntimeError("sr_vulkan 模块不可用")
        
        if not self.sr_initialized:
            raise RuntimeError("sr_vulkan 未初始化")
        
        with self.lock:
            self.task_id_counter += 1
            task_id = self.task_id_counter
            
            task = UpscaleTask(task_id)
            task.image_data = image_data
            task.model = model
            task.scale = scale
            task.width = width
            task.height = height
            task.format = format_str
            task.tile_size = tile_size
            task.noise_level = noise_level
            task.status = "processing"
            
            self.tasks[task_id] = task
        
        try:
            # 调用 sr_vulkan 添加任务
            # 确保 tile_size 是有效值
            valid_tile_sizes = [0, 64, 128, 256, 512]
            if tile_size not in valid_tile_sizes:
                print(f"⚠️ 无效的 tile_size: {tile_size}，使用默认值 0")
                tile_size = 64
            
            print(f"🔍 Python add_task 调用 sr.add:")
            print(f"  image_data len: {len(image_data)}")
            print(f"  model: {model}")
            print(f"  task_id: {task_id}")
            print(f"  width: {width}")
            print(f"  height: {height}")
            print(f"  scale: {scale}")
            print(f"  format_str: {format_str}")
            print(f"  tile_size: {tile_size}")
            print(f"  noise_level: {noise_level}")
            
            if width > 0 and height > 0:
                # 使用指定尺寸
                print("📏 使用指定尺寸模式")
                status = sr.add(
                    image_data,
                    model,
                    task_id,
                    width,
                    height,
                    format=format_str,
                    tileSize=tile_size
                )
            else:
                # 使用缩放倍数
                print("📏 使用缩放倍数模式")
                try:
                    status = sr.add(
                        image_data,
                        model,
                        task_id,
                        scale,
                        format=format_str,
                        tileSize=tile_size
                    )
                    print(f"📊 sr.add 返回 status: {status}")
                    
                    if status <= 0:
                        error = sr.getLastError() if hasattr(sr, 'getLastError') else f"未知错误 (status={status})"
                        print(f"❌ sr.add 失败: {error}")
                        # 尝试使用默认参数重试
                        print("🔄 尝试使用默认 tileSize=0 重试...")
                        status = sr.add(
                            image_data,
                            model,
                            task_id,
                            scale,
                            format=format_str,
                            tileSize=0
                        )
                        print(f"📊 sr.add 默认参数返回 status: {status}")
                        if status <= 0:
                            error2 = sr.getLastError() if hasattr(sr, 'getLastError') else f"未知错误 (status={status})"
                            print(f"❌ sr.add 默认参数也失败: {error2}")
                            raise RuntimeError(f"添加任务失败: {error2}")
                        else:
                            print("✅ sr.add 默认参数成功")
                    else:
                        print("✅ sr.add 调用成功")
                except Exception as e:
                    print(f"❌ sr.add 调用失败: {e}")
                    print(f"❌ 错误类型: {type(e).__name__}")
                    # 尝试使用默认参数重试
                    print("🔄 尝试使用默认 tileSize=0 重试...")
                    try:
                        status = sr.add(
                            image_data,
                            model,
                            task_id,
                            scale,
                            format=format_str,
                            tileSize=0
                        )
                        print(f"✅ sr.add 默认参数调用成功，status: {status}")
                    except Exception as e2:
                        print(f"❌ sr.add 默认参数也失败: {e2}")
                        raise e
            
            if status <= 0:
                error = sr.getLastError() if hasattr(sr, 'getLastError') else "未知错误"
                with self.lock:
                    task.status = "failed"
                    task.error = f"添加任务失败: {error}"
                raise RuntimeError(task.error)
            
            return task_id
            
        except Exception as e:
            with self.lock:
                if task_id in self.tasks:
                    self.tasks[task_id].status = "failed"
                    self.tasks[task_id].error = str(e)
            raise
    
    def get_task_status(self, task_id: int) -> Optional[Dict[str, Any]]:
        """获取任务状态"""
        with self.lock:
            if task_id not in self.tasks:
                return None
            
            task = self.tasks[task_id]
            return {
                "task_id": task.task_id,
                "status": task.status,
                "error": task.error,
                "tick": task.tick
            }
    
    def get_task_result(self, task_id: int) -> Optional[bytes]:
        """获取任务结果"""
        with self.lock:
            if task_id not in self.tasks:
                return None
            
            task = self.tasks[task_id]
            if task.status != "completed":
                return None
            
            return task.result_data
    
    def wait_for_task(self, task_id: int, timeout: float = 60.0) -> bool:
        """
        等待任务完成
        
        Args:
            task_id: 任务 ID
            timeout: 超时时间（秒）
        
        Returns:
            是否成功完成
        """
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            status = self.get_task_status(task_id)
            if status is None:
                return False
            
            if status["status"] == "completed":
                return True
            elif status["status"] == "failed":
                return False
            
            time.sleep(0.1)
        
        return False
    
    def remove_task(self, task_id: int):
        """移除任务"""
        with self.lock:
            if task_id in self.tasks:
                del self.tasks[task_id]
        
        if SR_AVAILABLE:
            try:
                sr.remove([task_id])
            except:
                pass
    
    def cancel_tasks(self, task_ids: list):
        """取消多个任务"""
        with self.lock:
            for task_id in task_ids:
                if task_id in self.tasks:
                    del self.tasks[task_id]
        
        if SR_AVAILABLE:
            try:
                sr.remove(task_ids)
            except:
                pass
    
    def cleanup(self):
        """清理资源"""
        self.running = False
        if self.processing_thread:
            self.processing_thread.join(timeout=2.0)
        
        with self.lock:
            self.tasks.clear()


# 全局管理器实例
_manager = None


def get_manager() -> UpscaleManager:
    """获取全局管理器实例"""
    global _manager
    if _manager is None:
        _manager = UpscaleManager()
    return _manager


def get_sr_available() -> bool:
    """检查 sr_vulkan 是否可用"""
    return SR_AVAILABLE and get_manager().sr_initialized


def upscale_image(
    image_data: bytes,
    model: int = 0,
    scale: int = 2,
    tile_size: int = 0,
    noise_level: int = 0,
    timeout: float = 60.0
) -> Tuple[Optional[bytes], Optional[str]]:
    """
    超分图像（同步接口）
    
    Args:
        image_data: 图像二进制数据
        model: 模型编号
        scale: 缩放倍数
        tile_size: tile 大小
        noise_level: 降噪等级
        timeout: 超时时间
    
    Returns:
        (结果数据, 错误信息)
    """
    if not SR_AVAILABLE:
        return None, "sr_vulkan 模块不可用"
    
    manager = get_manager()
    
    try:
        # 添加任务
        task_id = manager.add_task(
            image_data=image_data,
            model=model,
            scale=scale,
            width=0,
            height=0,
            format_str="",
            tile_size=tile_size,
            noise_level=noise_level
        )
        
        # 等待完成
        if not manager.wait_for_task(task_id, timeout):
            status = manager.get_task_status(task_id)
            error = status.get("error") if status else "任务超时"
            manager.remove_task(task_id)
            return None, error
        
        # 获取结果
        result = manager.get_task_result(task_id)
        manager.remove_task(task_id)
        
        if result is None:
            return None, "获取结果失败"
        
        return result, None
        
    except Exception as e:
        return None, str(e)


def upscale_image_async(
    image_data: bytes,
    model: int = 0,
    scale: int = 2,
    tile_size: int = 0,
    noise_level: int = 0
) -> int:
    """
    超分图像（异步接口）
    
    Returns:
        任务 ID
    """
    if not SR_AVAILABLE:
        raise RuntimeError("sr_vulkan 模块不可用")
    
    manager = get_manager()
    return manager.add_task(
        image_data=image_data,
        model=model,
        scale=scale,
        width=0,
        height=0,
        format_str="",
        tile_size=tile_size,
        noise_level=noise_level
    )


# 模型名称映射
MODEL_NAMES = {
    0: "cunet",
    1: "photo",
    2: "anime_style_art_rgb",
    3: "upconv_7_anime_style_art_rgb",
    4: "upconv_7_photo",
    5: "upresnet10",
    6: "swin_unet_art_scan"
}


def get_model_id(model_name: str) -> int:
    """根据模型名称获取模型 ID"""
    model_name_lower = model_name.lower()
    
    for model_id, name in MODEL_NAMES.items():
        if name.lower() == model_name_lower:
            return model_id
    
    # 尝试直接解析为数字
    try:
        return int(model_name)
    except:
        return 0  # 默认返回 0


if __name__ == "__main__":
    # 测试代码
    print(f"SR Vulkan 可用: {is_available()}")
    
    if is_available():
        # 这里可以添加测试代码
        pass
