//! NeoView - PyO3 Thumbnail Module
//! 使用 PyO3 直接调用 Python 缩略图模块

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, Once};
use pyo3::prelude::*;
use pyo3::types::{PyBytes, PyDict};
use super::python_upscale_wrapper::PythonUpscaleModule;

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

/// 缩略图请求
#[derive(Debug, Clone)]
pub struct ThumbnailRequest {
    /// 源文件路径
    pub source_path: String,
    /// 书路径（用于缓存键）
    pub bookpath: String,
    /// 是否为文件夹
    pub is_folder: bool,
    /// 是否为压缩包
    pub is_archive: bool,
    /// 源文件修改时间
    pub source_mtime: i64,
    /// 最大尺寸
    pub max_size: i32,
}

/// 缩略图结果
#[derive(Debug, Clone)]
pub struct ThumbnailResult {
    /// WebP 二进制数据
    pub webp_bytes: Vec<u8>,
    /// 宽度
    pub width: u32,
    /// 高度
    pub height: u32,
    /// 文件大小
    pub file_size: u64,
}

/// PyO3 缩略图管理器
pub struct PyO3ThumbnailManager {
    python_module: PythonUpscaleModule,
    db_path: PathBuf,
}

impl PyO3ThumbnailManager {
    /// 创建新的缩略图管理器
    pub fn new(db_path: PathBuf) -> Result<Self, String> {
        ensure_python_initialized();
        
        let python_module = Python::with_gil(|py| {
            // 导入缩略图模块
            let sys = py.import("sys")?;
            let path = sys.get("path")?;
            
            // 添加 python 目录到路径
            let current_dir = std::env::current_dir()
                .map_err(|e| format!("获取当前目录失败: {}", e))?;
            let python_dir = current_dir.join("python");
            
            if python_dir.exists() {
                let python_dir_str = python_dir.to_string_lossy();
                path.call_method("append", (python_dir_str.as_ref(),))?;
            }
            
            // 尝试导入模块
            let thumbnail_module = py.import("thumbnail_service")?;
            
            // 创建数据库
            let db_path_str = db_path.to_string_lossy();
            thumbnail_module.call_method0("init_database", (db_path_str.as_ref(),))?;
            
            Ok(PythonUpscaleModule::new())
        }).map_err(|e| format!("导入 Python 缩略图模块失败: {}", e))?;
        
        Ok(Self {
            python_module,
            db_path,
        })
    }
    
    /// 生成缩略图
    pub fn generate_thumbnail(&self, req: ThumbnailRequest) -> Result<ThumbnailResult, String> {
        Python::with_gil(|py| {
            let thumbnail_module = py.import("thumbnail_service")?;
            
            // 创建请求字典
            let request_dict = PyDict::new(py);
            request_dict.set_item("source_path", req.source_path)?;
            request_dict.set_item("bookpath", req.bookpath)?;
            request_dict.set_item("is_folder", req.is_folder)?;
            request_dict.set_item("is_archive", req.is_archive)?;
            request_dict.set_item("source_mtime", req.source_mtime)?;
            request_dict.set_item("max_size", req.max_size)?;
            
            // 调用 Python 函数
            let result = thumbnail_module.call_method1(
                "generate_thumbnail_sync",
                (request_dict,)
            )?;
            
            // 解析结果
            let webp_bytes: &PyBytes = result.get_item(0)?.downcast()?;
            let width: u32 = result.get_item(1)?.extract()?;  
            let height: u32 = result.get_item(2)?.extract()?;
            let file_size: u64 = result.get_item(3)?.extract()?;
            
            Ok(ThumbnailResult {
                webp_bytes: webp_bytes.as_bytes().to_vec(),
                width,
                height,
                file_size,
            })
        }).map_err(|e| format!("生成缩略图失败: {}", e))
    }
    
    /// 批量预加载
    pub fn prefetch_directory(&self, dir_path: &str, entries: Vec<ThumbnailRequest>) -> Result<usize, String> {
        Python::with_gil(|py| {
            let thumbnail_module = py.import("thumbnail_service")?;
            
            // 转换请求为字典列表
            let requests_list = pyo3::types::PyList::empty(py);
            for req in entries {
                let request_dict = PyDict::new(py);
                request_dict.set_item("source_path", req.source_path)?;
                request_dict.set_item("bookpath", req.bookpath)?;
                request_dict.set_item("is_folder", req.is_folder)?;
                request_dict.set_item("is_archive", req.is_archive)?;
                request_dict.set_item("source_mtime", req.source_mtime)?;
                request_dict.set_item("max_size", req.max_size)?;
                requests_list.append(request_dict)?;
            }
            
            // 调用 Python 批量函数
            let result = thumbnail_module.call_method1(
                "batch_generate_thumbnails",
                (dir_path, requests_list)
            )?;
            
            let count: usize = result.extract()?;
            Ok(count)
        }).map_err(|e| format!("批量预加载失败: {}", e))
    }
    
    /// 健康检查
    pub fn health_check(&self) -> Result<String, String> {
        Python::with_gil(|py| {
            let thumbnail_module = py.import("thumbnail_service")?;
            let result = thumbnail_module.call_method0("health_check", ())?;
            let status: String = result.extract()?;
            Ok(status)
        }).map_err(|e| format!("健康检查失败: {}", e))
    }
}

/// 全局缩略图管理器实例
pub struct PyO3ThumbnailState {
    pub manager: Arc<Mutex<Option<PyO3ThumbnailManager>>>,
}

impl Default for PyO3ThumbnailState {
    fn default() -> Self {
        Self {
            manager: Arc::new(Mutex::new(None)),
        }
    }
}

/// 获取或创建管理器
pub fn get_thumbnail_manager(
    state: &tauri::State<'_, PyO3ThumbnailState>,
    db_path: PathBuf,
) -> Result<PyO3ThumbnailManager, String> {
    let mut manager_guard = state.manager.lock().unwrap();
    if let Some(ref manager) = *manager_guard {
        return Ok(manager.clone());
    }
    
    let manager = PyO3ThumbnailManager::new(db_path)?;
    *manager_guard = Some(manager.clone());
    Ok(manager)
}