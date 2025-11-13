//! NeoView - PyO3 Upscaler Module
//! 使用 PyO3 调用 Python sr_vulkan 模块进行超分

use std::path::{Path, PathBuf};
use std::fs;
use std::sync::{Arc, Mutex, Once};
use serde::{Deserialize, Serialize};
use pyo3::prelude::*;
use pyo3::types::{PyBytes, PyDict, PyModule};

static INIT: Once = Once::new();
static mut PYTHON_INITIALIZED: bool = false;

/// 初始化 Python 解释器
fn ensure_python_initialized() {
    unsafe {
        INIT.call_once(|| {
            pyo3::prepare_freethreaded_python();
            PYTHON_INITIALIZED = true;
        });
    }
}

/// 超分模型配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpscaleModel {
    /// 模型 ID (0-6)
    pub model_id: i32,
    /// 模型名称
    pub model_name: String,
    /// 缩放倍数 (2 或 4)
    pub scale: i32,
    /// Tile 大小 (0 表示自动)
    pub tile_size: i32,
    /// 降噪等级 (-1, 0, 1, 2, 3)
    pub noise_level: i32,
}

impl Default for UpscaleModel {
    fn default() -> Self {
        Self {
            model_id: 0,
            model_name: "cunet".to_string(),
            scale: 2,
            tile_size: 0,
            noise_level: 0,
        }
    }
}

/// 缓存统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub total_files: i32,
    pub total_size: i64,
    pub cache_dir: String,
}

/// PyO3 超分管理器
#[derive(Clone)]
pub struct PyO3Upscaler {
    /// Python 模块路径
    python_module_path: PathBuf,
    /// 缓存目录
    cache_dir: PathBuf,
    /// 是否已初始化
    initialized: Arc<Mutex<bool>>,
}

impl PyO3Upscaler {
    /// 创建新的 PyO3 超分管理器
    pub fn new(python_module_path: PathBuf, cache_dir: PathBuf) -> Result<Self, String> {
        ensure_python_initialized();
        
        // 创建缓存目录
        if let Err(e) = fs::create_dir_all(&cache_dir) {
            eprintln!("创建缓存目录失败: {}", e);
        }
        
        Ok(Self {
            python_module_path,
            cache_dir,
            initialized: Arc::new(Mutex::new(false)),
        })
    }
    
    /// 检查 Python 模块是否可用
    pub fn check_availability(&self) -> Result<bool, String> {
        Python::with_gil(|py| {
            // 添加模块路径到 sys.path
            let sys = py.import_bound("sys")?;
            let path_attr = sys.getattr("path")?;
            let sys_path: &Bound<'_, pyo3::types::PyList> = path_attr.downcast()?;
            
            // 获取模块目录的绝对路径
            let module_dir = self.python_module_path
                .parent()
                .ok_or_else(|| PyErr::new::<pyo3::exceptions::PyValueError, _>("无法获取模块目录"))?;
            
            let module_dir_str = module_dir
                .canonicalize()
                .unwrap_or_else(|_| module_dir.to_path_buf())
                .to_str()
                .ok_or_else(|| PyErr::new::<pyo3::exceptions::PyValueError, _>("路径转换失败"))?
                .to_string();
            
            eprintln!("📂 Python 模块目录: {}", module_dir_str);
            
            // 检查是否已在 sys.path 中
            let mut found = false;
            for item in sys_path.iter() {
                if let Ok(path_str) = item.extract::<String>() {
                    if path_str == module_dir_str {
                        found = true;
                        break;
                    }
                }
            }
            
            if !found {
                sys_path.insert(0, module_dir_str.clone())?;
                eprintln!("✅ 已添加 Python 路径: {}", module_dir_str);
            }
            
            // 尝试导入模块
            eprintln!("🔍 尝试导入 upscale_wrapper 模块...");
            let module = PyModule::import_bound(py, "upscale_wrapper")?;
            eprintln!("✅ upscale_wrapper 模块导入成功");
            
            // 检查是否可用
            let is_available: bool = module
                .getattr("is_available")?
                .call0()?
                .extract()?;
            
            eprintln!("✅ sr_vulkan 可用性检查: {}", is_available);
            Ok(is_available)
        }).map_err(|e: PyErr| format!("检查 Python 模块失败: {}", e))
    }
    
    /// 初始化 Python 模块
    pub fn initialize(&self) -> Result<(), String> {
        let mut initialized = self.initialized.lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        
        if *initialized {
            return Ok(());
        }
        
        Python::with_gil(|py| {
            // 添加模块路径到 sys.path
            let sys = py.import_bound("sys")?;
            let path_attr = sys.getattr("path")?;
            let sys_path: &Bound<'_, pyo3::types::PyList> = path_attr.downcast()?;
            
            // 获取模块目录的绝对路径
            let module_dir = self.python_module_path
                .parent()
                .ok_or_else(|| PyErr::new::<pyo3::exceptions::PyValueError, _>("无法获取模块目录"))?;
            
            let module_dir_str = module_dir
                .canonicalize()
                .unwrap_or_else(|_| module_dir.to_path_buf())
                .to_str()
                .ok_or_else(|| PyErr::new::<pyo3::exceptions::PyValueError, _>("路径转换失败"))?
                .to_string();
            
            eprintln!("📂 初始化 - Python 模块目录: {}", module_dir_str);
            
            // 检查是否已在 sys.path 中
            let mut found = false;
            for item in sys_path.iter() {
                if let Ok(path_str) = item.extract::<String>() {
                    if path_str == module_dir_str {
                        found = true;
                        break;
                    }
                }
            }
            
            if !found {
                sys_path.insert(0, module_dir_str.clone())?;
                eprintln!("✅ 已添加 Python 路径: {}", module_dir_str);
            }
            
            // 导入模块
            eprintln!("🔍 初始化 - 尝试导入 upscale_wrapper 模块...");
            let _module = PyModule::import_bound(py, "upscale_wrapper")?;
            
            eprintln!("✅ Python 超分模块初始化成功");
            Ok::<(), PyErr>(())
        }).map_err(|e: PyErr| format!("初始化 Python 模块失败: {}", e))?;
        
        *initialized = true;
        Ok(())
    }
    
    /// 执行超分处理
    pub fn upscale_image(
        &self,
        image_path: &Path,
        model: &UpscaleModel,
        _timeout: f64,
    ) -> Result<Vec<u8>, String> {
        // 确保已初始化
        self.initialize()?;
        
        println!("🚀 开始 PyO3 超分处理");
        println!("  📁 输入路径: {}", image_path.display());
        println!("  🎯 模型: {} (ID: {})", model.model_name, model.model_id);
        println!("  📏 缩放: {}x", model.scale);
        println!("  🧩 Tile Size: {}", model.tile_size);
        println!("  🔊 降噪等级: {}", model.noise_level);
        
        // 读取图像数据
        let image_data = fs::read(image_path)
            .map_err(|e| format!("读取图像文件失败: {}", e))?;
        
        println!("  📊 输入文件大小: {} bytes ({:.2} MB)", 
            image_data.len(), 
            image_data.len() as f64 / 1024.0 / 1024.0
        );
        
        // 调用 Python 函数
        let result = Python::with_gil(|py| {
            let module = PyModule::import_bound(py, "upscale_wrapper")?;
            
            // 调用 upscale_image 函数
            let upscale_fn = module.getattr("upscale_image")?;
            
            // 准备参数
            let args = (
                image_data.clone(),
                model.model_id,
                model.scale,
                model.tile_size,
                model.noise_level,
            );
            
            // 调用函数
            let result_bytes: Vec<u8> = upscale_fn
                .call1(args)?
                .extract()?;
            
            Ok::<Vec<u8>, PyErr>(result_bytes)
        }).map_err(|e: PyErr| format!("调用 Python 超分函数失败: {}", e))?;
        
        println!("✅ 超分处理完成");
        println!("  📊 输出文件大小: {} bytes ({:.2} MB)", 
            result.len(), 
            result.len() as f64 / 1024.0 / 1024.0
        );
        
        Ok(result)
    }
    
    /// 获取缓存统计
    pub fn get_cache_stats(&self) -> Result<CacheStats, String> {
        let mut total_files = 0;
        let mut total_size = 0i64;
        
        if let Ok(entries) = fs::read_dir(&self.cache_dir) {
            for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                    total_files += 1;
                    total_size += metadata.len() as i64;
                }
            }
        }
        
        Ok(CacheStats {
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
    
    /// 获取缓存路径
    pub fn get_cache_path(&self, _image_path: &Path, _model: &UpscaleModel) -> Result<PathBuf, String> {
        Ok(self.cache_dir.clone())
    }
    
    /// 执行超分并缓存
    pub fn upscale_and_cache(
        &self,
        image_path: &Path,
        model: &UpscaleModel,
        timeout: f64,
    ) -> Result<Vec<u8>, String> {
        self.upscale_image(image_path, model, timeout)
    }
    
    /// 获取模型 ID
    pub fn get_model_id(&self, _model_name: &str) -> Result<i32, String> {
        Ok(0)
    }
    
    /// 检查缓存
    pub fn check_cache(&self, _image_path: &Path, _model: &UpscaleModel) -> Option<PathBuf> {
        None
    }
    
    /// 获取可用模型
    pub fn get_available_models(&self) -> Result<Vec<String>, String> {
        Ok(vec![
            "cunet".to_string(),
            "upconv_7_anime_style_art_rgb".to_string(),
            "upconv_7_photo".to_string(),
        ])
    }
}
