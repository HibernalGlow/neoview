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
            
            let module_dir = self.python_module_path
                .parent()
                .ok_or_else(|| PyErr::new::<pyo3::exceptions::PyValueError, _>("无法获取模块目录"))?
                .to_str()
                .ok_or_else(|| PyErr::new::<pyo3::exceptions::PyValueError, _>("路径转换失败"))?;
            
            if !sys_path.contains(module_dir)? {
                sys_path.insert(0, module_dir)?;
            }
            
            // 尝试导入模块
            let module = PyModule::import_bound(py, "upscale_wrapper")?;
            
            // 检查是否可用
            let is_available: bool = module
                .getattr("is_available")?
                .call0()?
                .extract()?;
            
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
            
            let module_dir = self.python_module_path
                .parent()
                .ok_or_else(|| PyErr::new::<pyo3::exceptions::PyValueError, _>("无法获取模块目录"))?
                .to_str()
                .ok_or_else(|| PyErr::new::<pyo3::exceptions::PyValueError, _>("路径转换失败"))?;
            
            if !sys_path.contains(module_dir)? {
                sys_path.insert(0, module_dir)?;
            }
            
            // 导入模块
            let _module = PyModule::import_bound(py, "upscale_wrapper")?;
            
            println!("✅ Python 超分模块初始化成功");
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
        timeout: f64,
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
            let kwargs = PyDict::new_bound(py);
            kwargs.set_item("image_data", PyBytes::new_bound(py, &image_data))?;
            kwargs.set_item("model", model.model_id)?;
            kwargs.set_item("scale", model.scale)?;
            kwargs.set_item("tile_size", model.tile_size)?;
            kwargs.set_item("noise_level", model.noise_level)?;
            kwargs.set_item("timeout", timeout)?;
            
            // 调用函数
            let result = upscale_fn.call((), Some(&kwargs))?;
            
            // 解析返回值 (result_data, error_message)
            let result_tuple: &Bound<'_, pyo3::types::PyTuple> = result.downcast()?;
            
            if result_tuple.len() != 2 {
                return Err(PyErr::new::<pyo3::exceptions::PyValueError, _>(
                    "返回值格式错误"
                ));
            }
            
            let result_data = result_tuple.get_item(0)?;
            let error_msg = result_tuple.get_item(1)?;
            
            // 检查是否有错误
            if !error_msg.is_none() {
                let error_str: String = error_msg.extract()?;
                return Err(PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(error_str));
            }
            
            // 提取结果数据
            if result_data.is_none() {
                return Err(PyErr::new::<pyo3::exceptions::PyValueError, _>(
                    "超分返回空数据"
                ));
            }
            
            let result_bytes: &Bound<'_, PyBytes> = result_data.downcast()?;
            let data: Vec<u8> = result_bytes.as_bytes().to_vec();
            
            Ok::<Vec<u8>, PyErr>(data)
        }).map_err(|e: PyErr| format!("Python 超分失败: {}", e))?;
        
        println!("  📊 输出数据大小: {} bytes ({:.2} MB)", 
            result.len(), 
            result.len() as f64 / 1024.0 / 1024.0
        );
        println!("✅ PyO3 超分处理完成");
        
        Ok(result)
    }
    
    /// 生成缓存文件名
    pub fn generate_cache_filename(
        &self,
        image_path: &Path,
        model: &UpscaleModel,
    ) -> Result<String, String> {
        // 计算文件 MD5
        let image_data = fs::read(image_path)
            .map_err(|e| format!("读取文件失败: {}", e))?;
        
        let digest = md5::compute(&image_data);
        let md5_str = format!("{:x}", digest);
        
        // 生成文件名: md5_model_scale.webp
        Ok(format!("{}_{}_{}x.webp", md5_str, model.model_name, model.scale))
    }
    
    /// 获取缓存路径
    pub fn get_cache_path(
        &self,
        image_path: &Path,
        model: &UpscaleModel,
    ) -> Result<PathBuf, String> {
        let filename = self.generate_cache_filename(image_path, model)?;
        Ok(self.cache_dir.join(filename))
    }
    
    /// 检查缓存是否存在
    pub fn check_cache(
        &self,
        image_path: &Path,
        model: &UpscaleModel,
    ) -> Option<PathBuf> {
        match self.get_cache_path(image_path, model) {
            Ok(cache_path) => {
                if cache_path.exists() {
                    println!("📦 找到 PyO3 超分缓存: {}", cache_path.display());
                    Some(cache_path)
                } else {
                    None
                }
            }
            Err(_) => None,
        }
    }
    
    /// 执行超分并缓存
    pub fn upscale_and_cache(
        &self,
        image_path: &Path,
        model: &UpscaleModel,
        timeout: f64,
    ) -> Result<Vec<u8>, String> {
        // 检查缓存
        if let Some(cache_path) = self.check_cache(image_path, model) {
            return fs::read(&cache_path)
                .map_err(|e| format!("读取缓存失败: {}", e));
        }
        
        // 执行超分
        let result = self.upscale_image(image_path, model, timeout)?;
        
        // 保存到缓存
        let cache_path = self.get_cache_path(image_path, model)?;
        if let Some(parent) = cache_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建缓存目录失败: {}", e))?;
        }
        
        fs::write(&cache_path, &result)
            .map_err(|e| format!("保存缓存失败: {}", e))?;
        
        println!("💾 已保存到缓存: {}", cache_path.display());
        
        Ok(result)
    }
    
    /// 获取可用的模型列表
    pub fn get_available_models(&self) -> Result<Vec<String>, String> {
        self.initialize()?;
        
        Python::with_gil(|py| {
            let module = PyModule::import_bound(py, "upscale_wrapper")?;
            let model_names = module.getattr("MODEL_NAMES")?;
            
            let dict: &Bound<'_, PyDict> = model_names.downcast()?;
            let mut models = Vec::new();
            
            for (_key, value) in dict.iter() {
                let model_name: String = value.extract()?;
                models.push(model_name);
            }
            
            models.sort();
            Ok::<Vec<String>, PyErr>(models)
        }).map_err(|e: PyErr| format!("获取模型列表失败: {}", e))
    }
    
    /// 根据模型名称获取模型 ID
    pub fn get_model_id(&self, model_name: &str) -> Result<i32, String> {
        self.initialize()?;
        
        Python::with_gil(|py| {
            let module = PyModule::import_bound(py, "upscale_wrapper")?;
            let get_model_id_fn = module.getattr("get_model_id")?;
            
            let result = get_model_id_fn.call1((model_name,))?;
            let model_id: i32 = result.extract()?;
            
            Ok::<i32, PyErr>(model_id)
        }).map_err(|e: PyErr| format!("获取模型 ID 失败: {}", e))
    }
    
    /// 清理缓存
    pub fn cleanup_cache(&self, max_age_days: u32) -> Result<usize, String> {
        if !self.cache_dir.exists() {
            return Ok(0);
        }
        
        let mut removed_count = 0;
        let cutoff_time = chrono::Utc::now() - chrono::Duration::days(max_age_days as i64);
        
        for entry in fs::read_dir(&self.cache_dir)
            .map_err(|e| format!("读取缓存目录失败: {}", e))?
        {
            let entry = entry.map_err(|e| format!("读取目录条目失败: {}", e))?;
            let path = entry.path();
            
            if path.is_file() {
                if let Ok(metadata) = fs::metadata(&path) {
                    if let Ok(modified) = metadata.modified() {
                        let modified_time: chrono::DateTime<chrono::Utc> = modified.into();
                        if modified_time < cutoff_time {
                            if fs::remove_file(&path).is_ok() {
                                removed_count += 1;
                                println!("🗑️ 删除过期缓存: {}", path.display());
                            }
                        }
                    }
                }
            }
        }
        
        Ok(removed_count)
    }
    
    /// 获取缓存统计信息
    pub fn get_cache_stats(&self) -> Result<CacheStats, String> {
        if !self.cache_dir.exists() {
            return Ok(CacheStats::default());
        }
        
        let mut total_files = 0;
        let mut total_size = 0;
        
        for entry in fs::read_dir(&self.cache_dir)
            .map_err(|e| format!("读取缓存目录失败: {}", e))?
        {
            let entry = entry.map_err(|e| format!("读取目录条目失败: {}", e))?;
            let path = entry.path();
            
            if path.is_file() {
                total_files += 1;
                if let Ok(metadata) = fs::metadata(&path) {
                    total_size += metadata.len();
                }
            }
        }
        
        Ok(CacheStats {
            total_files,
            total_size,
            cache_dir: self.cache_dir.to_string_lossy().to_string(),
        })
    }
}

/// 缓存统计信息
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CacheStats {
    pub total_files: usize,
    pub total_size: u64,
    pub cache_dir: String,
}
