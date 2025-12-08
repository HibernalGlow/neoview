//! NeoView - PyO3 Colorizer Module
//! 使用 PyO3 内联 Python 代码实现漫画上色功能
//! 基于 manga-colorization-v2 模型

use pyo3::prelude::*;
use pyo3::types::{PyBytes, PyModule};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, Once};

static COLORIZER_INIT: Once = Once::new();
static mut COLORIZER_PYTHON_INITIALIZED: bool = false;

/// 确保 Python 解释器已初始化
fn ensure_python_initialized() {
    unsafe {
        COLORIZER_INIT.call_once(|| {
            pyo3::prepare_freethreaded_python();
            COLORIZER_PYTHON_INITIALIZED = true;
        });
    }
}

/// 上色模型配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColorizeModel {
    /// 模型名称
    pub model_name: String,
    /// 上色尺寸 (推荐 576 以下，需为 32 的倍数)
    pub colorization_size: i32,
    /// 降噪强度 (0-255, 默认 25)
    pub denoise_sigma: i32,
}

impl Default for ColorizeModel {
    fn default() -> Self {
        Self {
            model_name: "manga_colorization_v2".to_string(),
            colorization_size: 576,
            denoise_sigma: 25,
        }
    }
}

/// 上色缓存统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColorizeCacheStats {
    pub total_files: i32,
    pub total_size: i64,
    pub cache_dir: String,
}

/// 内联的 Python 上色代码
const COLORIZE_PYTHON_CODE: &str = r#"
import os
import sys
import io
import numpy as np
from PIL import Image

# 使用独立模块存储全局状态，避免代码重新执行时丢失
_STATE_MODULE_NAME = '_neoview_colorizer_state'
if _STATE_MODULE_NAME not in sys.modules:
    import types
    _state_mod = types.ModuleType(_STATE_MODULE_NAME)
    _state_mod.colorizer = None
    _state_mod.denoiser = None
    _state_mod.device = None
    _state_mod.model_dir = None
    sys.modules[_STATE_MODULE_NAME] = _state_mod

_state = sys.modules[_STATE_MODULE_NAME]

def set_model_dir(model_dir):
    """设置模型目录"""
    _state.model_dir = model_dir
    # 添加到 Python 路径
    if model_dir not in sys.path:
        sys.path.insert(0, model_dir)

def check_available():
    """检查上色功能是否可用"""
    try:
        import torch
        return True
    except ImportError:
        return False

def check_models_exist(model_dir):
    """检查模型文件是否存在"""
    generator_path = os.path.join(model_dir, "generator.zip")
    denoiser_path = os.path.join(model_dir, "net_rgb.pth")
    return os.path.exists(generator_path) and os.path.exists(denoiser_path)

def load_model(model_dir, device_str="cuda"):
    """加载上色模型"""
    import torch
    
    _state.model_dir = model_dir
    _state.device = device_str if torch.cuda.is_available() and device_str == "cuda" else "cpu"
    
    print(f"[Colorizer] Loading model on device: {_state.device}")
    print(f"[Colorizer] Model directory: {model_dir}")
    
    # 检查模型文件
    generator_path = os.path.join(model_dir, "generator.zip")
    denoiser_path = os.path.join(model_dir, "net_rgb.pth")
    
    if not os.path.exists(generator_path):
        raise FileNotFoundError(f"Generator model not found: {generator_path}")
    if not os.path.exists(denoiser_path):
        raise FileNotFoundError(f"Denoiser model not found: {denoiser_path}")
    
    # 动态导入模型架构
    try:
        from manga_colorization_v2_utils.networks.models import Colorizer
        from manga_colorization_v2_utils.denoising.denoiser import FFDNetDenoiser
    except ImportError as e:
        print(f"[Colorizer] Import error: {e}")
        print(f"[Colorizer] sys.path: {sys.path}")
        raise ImportError(f"Cannot import colorization modules. Please ensure manga_colorization_v2_utils is in {model_dir}")
    
    # 加载 Generator
    _state.colorizer = Colorizer().to(_state.device)
    _state.colorizer.generator.load_state_dict(
        torch.load(generator_path, map_location=_state.device)
    )
    _state.colorizer = _state.colorizer.eval()
    
    # 加载 Denoiser
    _state.denoiser = FFDNetDenoiser(_state.device, _weights_dir=model_dir)
    
    print("[Colorizer] Model loaded successfully")
    return True

def unload_model():
    """卸载模型释放内存"""
    import torch
    
    if _state.colorizer is not None:
        del _state.colorizer
        _state.colorizer = None
    if _state.denoiser is not None:
        del _state.denoiser
        _state.denoiser = None
    
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    
    print("[Colorizer] Model unloaded")
    return True

def resize_pad(img, size):
    """调整图像大小并填充到指定尺寸"""
    import cv2
    
    h, w = img.shape[:2]
    
    # 计算缩放比例
    scale = size / max(h, w)
    new_h, new_w = int(h * scale), int(w * scale)
    
    # 缩放
    resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    
    # 填充到 size x size
    pad_h = size - new_h
    pad_w = size - new_w
    
    padded = np.zeros((size, size, img.shape[2] if len(img.shape) > 2 else 1), dtype=img.dtype)
    padded[:new_h, :new_w] = resized if len(img.shape) > 2 else resized[..., np.newaxis]
    
    return padded, (pad_h, pad_w)

def colorize_image(image_data, colorization_size=576, denoise_sigma=25):
    """
    对图像进行上色
    
    Args:
        image_data: 图像字节数据 (PNG/JPG/WebP)
        colorization_size: 上色处理尺寸 (需为32的倍数，推荐576以下)
        denoise_sigma: 降噪强度 (0-255)
    
    Returns:
        上色后的图像字节数据 (WebP格式)
    """
    import torch
    import cv2
    from torchvision.transforms import ToTensor
    
    if _state.colorizer is None:
        raise RuntimeError("Colorizer model not loaded. Call load_model() first.")
    
    # 解码图像
    img_array = np.frombuffer(image_data, dtype=np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_UNCHANGED)
    
    if img is None:
        raise ValueError("Failed to decode image")
    
    # 转换为 RGBA
    if len(img.shape) == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2RGBA)
    elif img.shape[2] == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGBA)
    elif img.shape[2] == 4:
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2RGBA)
    
    original_size = (img.shape[1], img.shape[0])  # (width, height)
    
    # 计算处理尺寸 (需为32的倍数)
    max_size = min(*img.shape[:2])
    max_size -= max_size % 32
    if colorization_size > 0:
        size = min(max_size, colorization_size - (colorization_size % 32))
    else:
        size = min(max_size, 576)
    
    # 保存原始形状
    img_shape_before = img.shape[:2]
    
    # 降噪处理
    if 0 <= denoise_sigma <= 255:
        img = _state.denoiser.get_denoised_image(img, sigma=denoise_sigma)
    
    # 恢复尺寸
    if img.shape[:2] != img_shape_before:
        img = cv2.resize(img, (img_shape_before[1], img_shape_before[0]), interpolation=cv2.INTER_LINEAR)
    
    # 调整大小并填充
    img, current_pad = resize_pad(img, size)
    
    # 转换为 Tensor
    transform = ToTensor()
    current_image = transform(img).unsqueeze(0).to(_state.device)
    current_hint = torch.zeros(1, 4, current_image.shape[2], current_image.shape[3]).float().to(_state.device)
    
    # 推理
    with torch.no_grad():
        fake_color, _ = _state.colorizer(torch.cat([current_image, current_hint], 1))
        fake_color = fake_color.detach()
    
    # 后处理
    result = fake_color[0].detach().cpu().permute(1, 2, 0) * 0.5 + 0.5
    
    # 移除填充
    if current_pad[0] != 0:
        result = result[:-current_pad[0]]
    if current_pad[1] != 0:
        result = result[:, :-current_pad[1]]
    
    # 转换为图像
    colored_image = result.numpy() * 255
    colored_img_pil = Image.fromarray(colored_image.astype(np.uint8))
    
    # 恢复原始尺寸
    if colored_img_pil.size != original_size:
        colored_img_pil = colored_img_pil.resize(original_size, Image.Resampling.LANCZOS)
    
    # 编码为 WebP
    output_buffer = io.BytesIO()
    colored_img_pil.save(output_buffer, format="WEBP", quality=90)
    
    return output_buffer.getvalue()

def is_model_loaded():
    """检查模型是否已加载"""
    return _state.colorizer is not None
"#;

/// PyO3 上色管理器
#[derive(Clone)]
pub struct PyO3Colorizer {
    /// 模型目录
    model_dir: PathBuf,
    /// 缓存目录
    cache_dir: PathBuf,
    /// 是否已初始化
    initialized: Arc<Mutex<bool>>,
    /// 是否已加载模型
    model_loaded: Arc<Mutex<bool>>,
}

impl PyO3Colorizer {
    /// 创建新的上色管理器
    pub fn new(model_dir: PathBuf, cache_dir: PathBuf) -> Result<Self, String> {
        ensure_python_initialized();

        // 创建缓存目录
        if let Err(e) = fs::create_dir_all(&cache_dir) {
            eprintln!("创建上色缓存目录失败: {}", e);
        }

        Ok(Self {
            model_dir,
            cache_dir,
            initialized: Arc::new(Mutex::new(false)),
            model_loaded: Arc::new(Mutex::new(false)),
        })
    }

    /// 检查上色功能是否可用 (PyTorch 是否安装)
    pub fn check_availability(&self) -> Result<bool, String> {
        Python::with_gil(|py| {
            // 执行内联 Python 代码
            let colorize_module = PyModule::from_code_bound(
                py,
                COLORIZE_PYTHON_CODE,
                "colorize_module.py",
                "colorize_module",
            )
            .map_err(|e| format!("加载上色模块失败: {}", e))?;

            let result: bool = colorize_module
                .getattr("check_available")
                .map_err(|e| format!("获取 check_available 失败: {}", e))?
                .call0()
                .map_err(|e| format!("调用 check_available 失败: {}", e))?
                .extract()
                .map_err(|e| format!("提取结果失败: {}", e))?;

            Ok(result)
        })
    }

    /// 检查模型文件是否存在
    pub fn check_models_exist(&self) -> Result<bool, String> {
        Python::with_gil(|py| {
            let colorize_module = PyModule::from_code_bound(
                py,
                COLORIZE_PYTHON_CODE,
                "colorize_module.py",
                "colorize_module",
            )
            .map_err(|e| format!("加载上色模块失败: {}", e))?;

            let model_dir_str = self
                .model_dir
                .to_str()
                .ok_or_else(|| "模型目录路径无效".to_string())?;

            let result: bool = colorize_module
                .getattr("check_models_exist")
                .map_err(|e| format!("获取 check_models_exist 失败: {}", e))?
                .call1((model_dir_str,))
                .map_err(|e| format!("调用 check_models_exist 失败: {}", e))?
                .extract()
                .map_err(|e| format!("提取结果失败: {}", e))?;

            Ok(result)
        })
    }

    /// 初始化并加载模型
    pub fn load_model(&self, device: &str) -> Result<(), String> {
        let mut model_loaded = self
            .model_loaded
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;

        if *model_loaded {
            println!("✅ 上色模型已加载");
            return Ok(());
        }

        Python::with_gil(|py| {
            let colorize_module = PyModule::from_code_bound(
                py,
                COLORIZE_PYTHON_CODE,
                "colorize_module.py",
                "colorize_module",
            )
            .map_err(|e| format!("加载上色模块失败: {}", e))?;

            let model_dir_str = self
                .model_dir
                .to_str()
                .ok_or_else(|| "模型目录路径无效".to_string())?;

            // 设置模型目录
            colorize_module
                .getattr("set_model_dir")
                .map_err(|e| format!("获取 set_model_dir 失败: {}", e))?
                .call1((model_dir_str,))
                .map_err(|e| format!("调用 set_model_dir 失败: {}", e))?;

            // 加载模型
            colorize_module
                .getattr("load_model")
                .map_err(|e| format!("获取 load_model 失败: {}", e))?
                .call1((model_dir_str, device))
                .map_err(|e| format!("加载上色模型失败: {}", e))?;

            Ok::<(), String>(())
        })?;

        *model_loaded = true;
        let mut initialized = self
            .initialized
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        *initialized = true;

        println!("✅ 上色模型加载成功");
        Ok(())
    }

    /// 卸载模型释放内存
    pub fn unload_model(&self) -> Result<(), String> {
        let mut model_loaded = self
            .model_loaded
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;

        if !*model_loaded {
            return Ok(());
        }

        Python::with_gil(|py| {
            let colorize_module = PyModule::from_code_bound(
                py,
                COLORIZE_PYTHON_CODE,
                "colorize_module.py",
                "colorize_module",
            )
            .map_err(|e| format!("加载上色模块失败: {}", e))?;

            colorize_module
                .getattr("unload_model")
                .map_err(|e| format!("获取 unload_model 失败: {}", e))?
                .call0()
                .map_err(|e| format!("卸载模型失败: {}", e))?;

            Ok::<(), String>(())
        })?;

        *model_loaded = false;
        println!("✅ 上色模型已卸载");
        Ok(())
    }

    /// 检查模型是否已加载
    pub fn is_model_loaded(&self) -> bool {
        self.model_loaded
            .lock()
            .map(|guard| *guard)
            .unwrap_or(false)
    }

    /// 执行上色处理 (内存流版本)
    pub fn colorize_image_memory(
        &self,
        image_data: &[u8],
        model: &ColorizeModel,
    ) -> Result<Vec<u8>, String> {
        // 确保模型已加载
        if !self.is_model_loaded() {
            // 尝试自动加载 (暂时用 CPU，CUDA 有兼容问题)
            self.load_model("cpu")?;
        }

        println!("🎨 开始上色处理");
        println!("  📏 上色尺寸: {}", model.colorization_size);
        println!("  🔊 降噪强度: {}", model.denoise_sigma);
        println!(
            "  📊 输入数据大小: {} bytes ({:.2} MB)",
            image_data.len(),
            image_data.len() as f64 / 1024.0 / 1024.0
        );

        let result = Python::with_gil(|py| {
            let colorize_module = PyModule::from_code_bound(
                py,
                COLORIZE_PYTHON_CODE,
                "colorize_module.py",
                "colorize_module",
            )
            .map_err(|e| format!("加载上色模块失败: {}", e))?;

            let py_bytes = PyBytes::new_bound(py, image_data);

            let result = colorize_module
                .getattr("colorize_image")
                .map_err(|e| format!("获取 colorize_image 失败: {}", e))?
                .call1((py_bytes, model.colorization_size, model.denoise_sigma))
                .map_err(|e| format!("上色处理失败: {}", e))?;

            let output_data: Vec<u8> = result
                .extract()
                .map_err(|e| format!("提取结果失败: {}", e))?;

            Ok::<Vec<u8>, String>(output_data)
        })?;

        println!("✅ 上色处理完成");
        println!(
            "  📊 输出数据大小: {} bytes ({:.2} MB)",
            result.len(),
            result.len() as f64 / 1024.0 / 1024.0
        );

        Ok(result)
    }

    /// 保存上色结果到缓存
    pub fn save_colorize_cache(
        &self,
        image_hash: &str,
        model: &ColorizeModel,
        result_data: &[u8],
    ) -> Result<PathBuf, String> {
        // 确保缓存目录存在
        if let Err(e) = fs::create_dir_all(&self.cache_dir) {
            eprintln!("创建缓存目录失败: {}", e);
        }

        // 生成缓存文件名: hash_colorize[size_sigma].webp
        let cache_filename = format!(
            "{}_colorize[{}_{}].webp",
            image_hash, model.colorization_size, model.denoise_sigma
        );
        let cache_path = self.cache_dir.join(cache_filename);

        fs::write(&cache_path, result_data).map_err(|e| format!("保存缓存文件失败: {}", e))?;

        println!("💾 上色结果已缓存: {}", cache_path.display());
        Ok(cache_path)
    }

    /// 检查缓存是否存在
    pub fn check_cache(&self, image_hash: &str, model: &ColorizeModel) -> Option<PathBuf> {
        let cache_filename = format!(
            "{}_colorize[{}_{}].webp",
            image_hash, model.colorization_size, model.denoise_sigma
        );
        let cache_path = self.cache_dir.join(cache_filename);

        if cache_path.exists() {
            println!("💾 找到上色缓存: {}", cache_path.display());
            Some(cache_path)
        } else {
            None
        }
    }

    /// 获取缓存路径
    pub fn get_cache_path(&self, image_hash: &str, model: &ColorizeModel) -> PathBuf {
        let cache_filename = format!(
            "{}_colorize[{}_{}].webp",
            image_hash, model.colorization_size, model.denoise_sigma
        );
        self.cache_dir.join(cache_filename)
    }

    /// 获取缓存统计
    pub fn get_cache_stats(&self) -> Result<ColorizeCacheStats, String> {
        let mut total_files = 0;
        let mut total_size = 0i64;

        if let Ok(entries) = fs::read_dir(&self.cache_dir) {
            for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                    if entry
                        .file_name()
                        .to_string_lossy()
                        .contains("_colorize[")
                    {
                        total_files += 1;
                        total_size += metadata.len() as i64;
                    }
                }
            }
        }

        Ok(ColorizeCacheStats {
            total_files,
            total_size,
            cache_dir: self.cache_dir.to_string_lossy().to_string(),
        })
    }

    /// 清理缓存
    pub fn cleanup_cache(&self, max_age_days: u32) -> Result<usize, String> {
        let mut removed = 0;
        let max_age = std::time::Duration::from_secs((max_age_days as u64) * 86400);

        if let Ok(entries) = fs::read_dir(&self.cache_dir) {
            for entry in entries.flatten() {
                if !entry
                    .file_name()
                    .to_string_lossy()
                    .contains("_colorize[")
                {
                    continue;
                }
                if let Ok(metadata) = entry.metadata() {
                    if let Ok(modified) = metadata.modified() {
                        if let Ok(elapsed) = modified.elapsed() {
                            if elapsed > max_age {
                                let _ = fs::remove_file(entry.path());
                                removed += 1;
                            }
                        }
                    }
                }
            }
        }

        Ok(removed)
    }

    /// 获取模型目录
    pub fn get_model_dir(&self) -> &Path {
        &self.model_dir
    }

    /// 获取缓存目录
    pub fn get_cache_dir(&self) -> &Path {
        &self.cache_dir
    }
}
