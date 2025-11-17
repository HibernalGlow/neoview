"""
NeoView Upscale Wrapper
使用 sr_vulkan 进行图像超分的 Python 包装模块
此模块将被 Rust 通过 PyO3 调用
"""

import sys
import os
from typing import Optional, Tuple, Dict, Any, Union, List
import io

import threading
import queue
import time

# 尝试导入 sr_vulkan 模块
try:
    from sr_vulkan import sr_vulkan as sr
    SR_AVAILABLE = True
    print("✅ sr_vulkan 模块导入成功")
except ImportError:
    SR_AVAILABLE = False
    sr = None
    print("警告: sr_vulkan 模块未找到，超分功能将不可用")

# 优先尝试使用 PyVips 进行高性能解码
try:
    import pyvips
    PYVIPS_AVAILABLE = True
    print("✅ PyVips 模块导入成功")
except ImportError:
    PYVIPS_AVAILABLE = False
    print("⚠️ PyVips 未找到，将回退到 Pillow 解码")

# 回退方案：Pillow
try:
    from PIL import Image
    import pillow_avif  # noqa: F401
    import pillow_jxl   # noqa: F401
    PIL_AVAILABLE = True
    print("✅ Pillow 模块导入成功")
except ImportError:
    PIL_AVAILABLE = False
    print("警告: Pillow 模块未找到，格式转换功能将受限")

# 不支持的格式需要转换
UNSUPPORTED_FORMATS = {
    b'\x00\x00\x00\x0cjxl ': 'JXL',  # JPEG XL
    # AVIF 格式标识符（ftypavif 或 ftypavis）
    b'ftypavif': 'AVIF',
    b'ftypavis': 'AVIF',
}

def _needs_transcode(image_data: bytes) -> bool:
    """检测图像是否需要转换为 PNG"""
    if len(image_data) < 12:
        return False
    
    # 检测 JXL 格式
    if image_data[:12] == b'\x00\x00\x00\x0cjxl ':
        return True
    
    # 检测 AVIF 格式（ftyp box）
    if image_data[4:12] in (b'ftypavif', b'ftypavis'):
        return True
    
    return False

def _encode_webp(image_data: bytes, *, quality: int, lossless: bool) -> bytes:
    """使用指定质量编码为 WebP"""
    if PYVIPS_AVAILABLE:
        try:
            image = pyvips.Image.new_from_buffer(image_data, "", access="sequential")
            return image.write_to_buffer(".webp", Q=quality, lossless=int(lossless))
        except Exception as e:
            print(f"⚠️ PyVips WebP 编码失败，回退到 Pillow: {e}")
    
    if not PIL_AVAILABLE:
        raise RuntimeError("缺少 PyVips/Pillow 解码能力，无法编码 WebP")
    
    try:
        with Image.open(io.BytesIO(image_data)) as img:
            if img.mode in ('RGBA', 'LA', 'P'):
                img = img.convert('RGB')
            elif img.mode not in ('RGB', 'L'):
                img = img.convert('RGB')
            
            with io.BytesIO() as buf:
                img.save(buf, format='WEBP', lossless=lossless, quality=quality, method=6)
                return buf.getvalue()
    except Exception as e:
        raise RuntimeError(f"WebP 编码失败: {str(e)}")

def _transcode_to_webp(image_data: bytes) -> bytes:
    """将不受支持的格式转换为有损 WebP 以减小体积"""
    try:
        return _encode_webp(image_data, quality=80, lossless=False)
    except Exception as e:
        raise RuntimeError(f"图像格式转换失败: {str(e)}")


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
        self.lossy_webp = False


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
        self.model_id_map: Dict[str, int] = {}
        self.job_key_map: Dict[str, int] = {}
        self.task_key_map: Dict[int, str] = {}
        self.cancel_flags: Dict[int, threading.Event] = {}
        
        if SR_AVAILABLE:
            self._init_sr_vulkan()
            if self.sr_initialized:
                self._start_processing_thread()
    
    def _init_sr_vulkan(self):
        """初始化 sr_vulkan"""
        try:
            print("🔍 初始化 sr_vulkan...")
            
            # 步骤1: 基础初始化
            sts = sr.init()
            print(f"📊 sr.init() 返回: {sts}")
            
            if sts < 0:
                print("⚠️ GPU 初始化返回负值 (可能使用 CPU 模式): {sts}")
            
            # 启用调试模式
            try:
                sr.setDebug(True)
                print("✅ 已启用 sr_vulkan 调试模式")
            except:
                print("⚠️ setDebug 方法不可用")
            
            # 获取 GPU 信息
            try:
                gpu_info = sr.getGpuInfo()
                print(f"📊 GPU 信息: {gpu_info}")
            except Exception as e:
                print(f"⚠️ 无法获取 GPU 信息: {e}")
                gpu_info = None
            
            # 步骤2: 设置 GPU 和线程数 (关键!会加载模型)
            # 参考 picacg-qt: sr.initSet(config.Encode, config.UseCpuNum)
            # 使用第一个 GPU (ID=0) 或 CPU 模式 (ID=-1)
            gpu_id = 0
            if gpu_info and str(gpu_info).strip():
                print(f"🎯 使用 GPU {gpu_id}")
            else:
                gpu_id = -1  # CPU 模式
                print("🎯 使用 CPU 模式")
            
            print(f"🔍 调用 sr.initSet({gpu_id}, 0)...")
            init_set_result = sr.initSet(gpu_id, 0)  # 0 = 自动线程数
            print(f"📊 sr.initSet() 返回: {init_set_result}")
            
            if init_set_result >= 0:
                self.sr_initialized = True
                print("✅ sr_vulkan 初始化成功")
                
                # 获取版本信息
                try:
                    version = sr.getVersion()
                    print(f"📋 sr_vulkan 版本: {version}")
                except:
                    print("⚠️ 无法获取版本信息")

                # 动态读取所有模型常量
                try:
                    self._discover_models()
                except Exception as discover_error:
                    print(f"⚠️ 读取模型常量失败: {discover_error}")
            else:
                print(f"❌ sr_vulkan 初始化失败: {init_set_result}")
                self.sr_initialized = False
                
        except Exception as e:
            print(f"❌ sr_vulkan 初始化异常: {e}")
            self.sr_initialized = False

    def _discover_models(self):
        """扫描 sr_vulkan 模块，提取所有 MODEL_* 常量"""
        if not SR_AVAILABLE:
            return

        print("🔍 开始扫描 sr_vulkan 模型常量...")
        self.model_id_map.clear()

        try:
            attr_names = dir(sr)
            model_names = [name for name in attr_names if name.startswith("MODEL_")]
            print(f"📋 检测到模型常量数量: {len(model_names)}")

            for name in sorted(model_names):
                try:
                    value = getattr(sr, name)
                    model_id = int(value)
                    self.model_id_map[name] = model_id
                except Exception as attr_err:
                    print(f"⚠️ 读取模型常量 {name} 失败: {attr_err}")

            if self.model_id_map:
                preview = list(self.model_id_map.items())[:10]
                print("✅ 模型常量加载成功，示例:")
                for entry in preview:
                    print(f"   - {entry[0]} = {entry[1]}")
            else:
                print("⚠️ 未从 sr_vulkan 读取到任何模型常量")
        except Exception as e:
            print(f"❌ 扫描模型常量时出错: {e}")
            raise

    def _resolve_model(self, model: Union[int, str]) -> Tuple[int, str]:
        """将传入的模型参数解析为 (model_id, model_name)"""
        default_name = "MODEL_WAIFU2X_CUNET_UP2X"

        if SR_AVAILABLE and not self.model_id_map:
            try:
                self._discover_models()
            except Exception as e:
                print(f"⚠️ 无法刷新模型列表，使用默认模型: {e}")

        model_map = self.model_id_map

        def fallback() -> Tuple[int, str]:
            default_id = model_map.get(default_name, 0) if model_map else 0
            print(f"⚠️ 使用默认模型 {default_name} (ID={default_id})")
            return default_id, default_name

        if isinstance(model, str):
            normalized = model.strip()
            if not normalized:
                return fallback()

            if normalized in model_map:
                return model_map[normalized], normalized

            for name, model_id in model_map.items():
                if name.lower() == normalized.lower():
                    return model_id, name

            try:
                numeric = int(normalized)
                # 如果恰好匹配某个模型ID，则返回对应名称
                for name, model_id in model_map.items():
                    if model_id == numeric:
                        return model_id, name
                print(f"⚠️ 字符串模型 '{model}' 被解析为数字 {numeric}")
                return numeric, default_name
            except ValueError:
                print(f"⚠️ 未识别的模型字符串: {model}")
                return fallback()

        if isinstance(model, int):
            if model_map:
                # 优先按模型ID匹配
                for name, model_id in model_map.items():
                    if model_id == model:
                        return model_id, name

                # 再按索引匹配
                keys = sorted(model_map.keys())
                if 0 <= model < len(keys):
                    name = keys[model]
                    return model_map[name], name

            # 直接返回数值，名称使用默认
            print(f"⚠️ 直接使用数值模型 ID: {model}")
            return model, default_name

        print(f"⚠️ 未知类型的模型参数: {type(model)}")
        return fallback()
    
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
                
                # result 是元组: (data, format, taskId, tick)
                data, format_str, returned_task_id, tick = result
                
                print(f"🔍 收到超分结果:")
                print(f"  returned_task_id: {returned_task_id}")
                print(f"  format_str: {format_str}")
                print(f"  tick: {tick}")
                print(f"  data len: {len(data) if data else 0}")
                
                # 检查结果图像尺寸
                if data and len(data) > 0:
                    try:
                        from PIL import Image
                        import io
                        img = Image.open(io.BytesIO(data))
                        print(f"  📐 结果图像尺寸: {img.size[0]}x{img.size[1]}")
                        print(f"  🎨 结果图像模式: {img.mode}")
                    except Exception as e:
                        print(f"  ⚠️ 无法读取结果图像信息: {e}")
                
                with self.lock:
                    # 🔥 关键修复：验证 taskId 匹配
                    if returned_task_id in self.tasks:
                        task = self.tasks[returned_task_id]
                    #     if task.lossy_webp and data and len(data) > 0:
                    #         try:
                    #             data = _encode_webp(data, quality=85, lossless=False)
                    #             print(f"🎯 任务 {returned_task_id} 结果已重新编码为 85 质量 WebP")
                    #         except Exception as encode_err:
                    #             print(f"⚠️ 结果 WebP 重新编码失败，使用原始数据: {encode_err}")
                        task.result_data = data
                        task.tick = tick
                        
                        if data and len(data) > 0:
                            task.status = "completed"
                            print(f"✅ 任务 {returned_task_id} 完成")
                        else:
                            task.status = "failed"
                            task.error = "超分返回空数据"
                            print(f"❌ 任务 {returned_task_id} 失败: 返回空数据")
                        
                        # 将结果放入队列供外部获取
                        self.result_queue.put(returned_task_id)
                    else:
                        # 🔧 优化：记录不匹配的任务ID，可能是之前被取消的任务
                        print(f"⚠️ 收到未知任务ID {returned_task_id} 的结果，可能是已取消任务，丢弃")
                        
            except Exception as e:
                print(f"处理结果时出错: {e}")
                time.sleep(0.1)
    
    def add_task(
        self,
        image_data: bytes,
        model: Union[int, str] = 0,
        scale: int = 2,
        width: int = 0,
        height: int = 0,
        format_str: str = "",
        tile_size: int = 0,
        noise_level: int = 0,
        job_key: Optional[str] = None
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
            
            cancel_event = threading.Event()
            self.cancel_flags[task_id] = cancel_event
            if job_key:
                self.job_key_map[job_key] = task_id
                self.task_key_map[task_id] = job_key
            task.status = "processing"
            
            self.tasks[task_id] = task

        try:
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
            
            # 检测并转换不支持的格式
            processed_data = image_data
            if _needs_transcode(image_data):
                print(f"🔄 检测到不支持的格式，正在转换")
                try:
                    processed_data = _transcode_to_webp(image_data)
                    print(f"✅ 格式转换完成，新数据大小: {len(processed_data)} bytes")
                    with self.lock:
                        if task_id in self.tasks:
                            self.tasks[task_id].lossy_webp = True
                except RuntimeError as e:
                    print(f"❌ 格式转换失败: {e}")
                    with self.lock:
                        task.status = "failed"
                        task.error = str(e)
                    raise
            
            # 获取模型常量值
            model_id, model_name = self._resolve_model(model)
            
            # 根据 sr_vulkan API 规范调用 sr.add()
            # 参数顺序: data, model, taskId, scale/width, height(可选), format, tileSize
            if width > 0 and height > 0:
                # 使用指定尺寸模式
                print("📏 使用指定尺寸模式")
                status = sr.add(
                    processed_data,
                    model_id,
                    task_id,
                    width,
                    height,
                    format=format_str,
                    tileSize=tile_size
                )
            else:
                # 使用缩放倍数模式
                print("📏 使用缩放倍数模式")
                status = sr.add(
                    processed_data,
                    model_id,
                    task_id,
                    scale,
                    format=format_str,
                    tileSize=tile_size
                )
            
            print(f"📊 sr.add 返回 status: {status}")
            print(f"🔍 sr.add 状态说明: status > 0 表示成功添加到队列")
            
            # 检查任务队列状态
            try:
                if hasattr(sr, 'getCount'):
                    count = sr.getCount()
                    print(f"📊 当前任务队列数量: {count}")
            except:
                pass
            
            # 🔥 关键修复：检查 procId 是否为错误码（负数表示错误）
            if status <= 0:
                error = sr.getLastError() if hasattr(sr, 'getLastError') else f"未知错误 (status={status})"
                print(f"❌ sr.add 失败: {error}")
                
                # 尝试使用默认 tileSize=0 重试
                print("🔄 尝试使用默认 tileSize=0 重试...")
                try:
                    if width > 0 and height > 0:
                        status = sr.add(
                            image_data,
                            model_id,
                            task_id,
                            width,
                            height,
                            format=format_str,
                            tileSize=0
                        )
                    else:
                        status = sr.add(
                            image_data,
                            model_id,
                            task_id,
                            scale,
                            format=format_str,
                            tileSize=0
                        )
                    print(f"📊 sr.add 默认参数返回 status: {status}")
                    
                    if status <= 0:
                        error2 = sr.getLastError() if hasattr(sr, 'getLastError') else f"未知错误 (status={status})"
                        print(f"❌ sr.add 默认参数也失败: {error2}")
                        with self.lock:
                            task.status = "failed"
                            task.error = f"添加任务失败: {error2}"
                        raise RuntimeError(task.error)
                    else:
                        print("✅ sr.add 默认参数成功")
                except Exception as retry_e:
                    print(f"❌ 重试失败: {retry_e}")
                    with self.lock:
                        task.status = "failed"
                        task.error = str(retry_e)
                    raise
            else:
                print("✅ sr.add 调用成功")
            
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
            cancel_event = self.cancel_flags.get(task_id)
            if cancel_event and cancel_event.is_set():
                self.remove_task(task_id)
                raise RuntimeError("任务被取消")
            
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
            self.cancel_flags.pop(task_id, None)
            job_key = self.task_key_map.pop(task_id, None)
            if job_key and job_key in self.job_key_map:
                del self.job_key_map[job_key]
        
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
                self.cancel_flags.pop(task_id, None)
                job_key = self.task_key_map.pop(task_id, None)
                if job_key and job_key in self.job_key_map:
                    del self.job_key_map[job_key]
        
        if SR_AVAILABLE:
            try:
                sr.remove(task_ids)
            except:
                pass

    def request_cancel_task(self, task_id: int) -> bool:
        """请求取消指定任务"""
        with self.lock:
            event = self.cancel_flags.get(task_id)
            if event:
                event.set()
        if SR_AVAILABLE:
            try:
                sr.remove([task_id])
            except Exception as e:
                print(f"⚠️ sr.remove 调用失败: {e}")
        return True

    def request_cancel_by_key(self, job_key: str) -> bool:
        """根据 job_key 取消任务"""
        with self.lock:
            task_id = self.job_key_map.get(job_key)
        if task_id is None:
            return False
        return self.request_cancel_task(task_id)
    
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
    manager = get_manager()
    # 如果还未初始化，尝试初始化
    if not manager.sr_initialized and SR_AVAILABLE:
        try:
            manager._init_sr_vulkan()
        except Exception as e:
            print(f"❌ 自动初始化 sr_vulkan 失败: {e}")
    return SR_AVAILABLE and manager.sr_initialized


def upscale_image(
    image_data: bytes,
    model: Union[int, str] = 0,
    scale: int = 2,
    tile_size: int = 0,
    noise_level: int = 0,
    timeout: float = 60.0,
    width: int = 0,
    height: int = 0,
    job_key: Optional[str] = None
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
        width: 目标宽度 (0 表示使用 scale)
        height: 目标高度 (0 表示使用 scale)
    
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
            width=width,
            height=height,
            format_str="",
            tile_size=tile_size,
            noise_level=noise_level,
            job_key=job_key
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


def cancel_upscale_job(job_key: str) -> bool:
    """供 PyO3 调用的任务取消接口"""
    manager = get_manager()
    return manager.request_cancel_by_key(job_key)


def _get_manager_model_map() -> Dict[str, int]:
    manager = get_manager()
    if manager.model_id_map:
        return manager.model_id_map

    if SR_AVAILABLE and not manager.model_id_map:
        try:
            manager._discover_models()
        except Exception as e:
            print(f"❌ 无法刷新模型列表: {e}")

    return manager.model_id_map


def get_model_id(model: Union[str, int]) -> int:
    """根据模型名称或索引获取模型 ID"""
    model_map = _get_manager_model_map()

    if isinstance(model, int):
        # 如果传入的是索引，尝试按排序获取
        if model_map:
            try:
                key = sorted(model_map.keys())[model]
                return model_map[key]
            except Exception:
                pass
        return model  # 直接返回

    if isinstance(model, str):
        normalized = model.strip()
        if not normalized:
            return 0

        # 直接匹配模型常量名称
        if normalized in model_map:
            return model_map[normalized]

        # 忽略大小写匹配
        for name, model_id in model_map.items():
            if name.lower() == normalized.lower():
                return model_id

        # 尝试解析为整数文字
        try:
            return int(normalized)
        except ValueError:
            pass

    return 0


def get_model_name(model: Union[str, int]) -> str:
    """根据输入参数返回规范化的模型常量名"""
    model_map = _get_manager_model_map()

    if isinstance(model, str):
        normalized = model.strip()
        if normalized in model_map:
            return normalized

        for name in model_map:
            if name.lower() == normalized.lower():
                return name

    if isinstance(model, int) and model_map:
        keys = sorted(model_map.keys())
        if 0 <= model < len(keys):
            return keys[model]

    return "MODEL_WAIFU2X_CUNET_UP2X"


def get_available_models(refresh: bool = False) -> List[str]:
    """获取可用的模型常量名称列表"""
    if not SR_AVAILABLE:
        return []

    manager = get_manager()

    if not manager.sr_initialized:
        try:
            manager._init_sr_vulkan()
        except Exception as exc:
            print(f"❌ 初始化 sr_vulkan 失败，无法获取模型列表: {exc}")
            return []

    if refresh or not manager.model_id_map:
        try:
            manager._discover_models()
        except Exception as exc:
            print(f"❌ 刷新模型列表失败: {exc}")
            return []

    return sorted(manager.model_id_map.keys())


if __name__ == "__main__":
    # 测试代码
    available = get_sr_available()
    print(f"SR Vulkan 可用: {available}")
    
    if available:
        # 这里可以添加测试代码
        pass
