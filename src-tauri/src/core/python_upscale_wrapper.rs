//! PyO3 绑定到 Python 超分模块
//! 定义了与 Python 代码交互的接口

use crate::core::sr_vulkan_manager::SrVulkanManager;
use pyo3::prelude::*;
use pyo3::types::{PyBytes, PyDict, PyModule};
use std::path::PathBuf;
use std::sync::Arc;

/// Python 超分模块的 PyO3 包装器
pub struct PythonUpscaleModule {
    module: Py<PyModule>,
    sr_manager: Arc<SrVulkanManager>,
}

impl PythonUpscaleModule {
    /// 创建新的模块实例
    pub fn new(module_path: &PathBuf) -> Result<Self, PyErr> {
        let module: Py<PyModule> = Python::with_gil(|py| {
            // 添加模块路径到 Python 路径
            let sys = py.import_bound("sys")?;
            let sys_path = sys.getattr("path")?;

            let module_path_str = module_path
                .to_str()
                .ok_or_else(|| PyErr::new::<pyo3::exceptions::PyValueError, _>("路径转换失败"))?;

            // 检查路径是否已在 sys.path 中
            let mut found = false;
            let mut sys_path_iter = sys_path.iter()?;
            loop {
                match sys_path_iter.next() {
                    Some(Ok(item)) => {
                        let path_str = item.extract::<String>()?;
                        if path_str == module_path_str {
                            found = true;
                            break;
                        }
                    }
                    Some(Err(_)) => break,
                    None => break,
                }
            }

            if !found {
                sys_path.call_method1("insert", (0, module_path_str))?;
            }

            // 不再导入本地的 Python 模块，仅创建一个占位模块
            let module = PyModule::new_bound(py, "upscale_wrapper_dummy")?;

            Ok::<Py<PyModule>, PyErr>(module.into())
        })?;

        let sr_manager = SrVulkanManager::new()
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e))?;

        Ok(Self { module, sr_manager })
    }

    /// 检查 sr_vulkan 是否可用
    pub fn check_sr_available(&self) -> Result<bool, PyErr> {
        Python::with_gil(|py| {
            let _sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")?;
            Ok(true)
        })
    }

    /// 获取可用模型列表
    pub fn get_available_models(&self) -> Result<Vec<String>, PyErr> {
        Python::with_gil(|py| {
            let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")?;
            let dict = sr_module.dict();
            let mut model_names: Vec<String> = Vec::new();

            for (key, _) in dict.iter() {
                let name: &str = key.extract()?;
                if name.starts_with("MODEL_") {
                    model_names.push(name.to_string());
                }
            }

            model_names.sort();
            Ok(model_names)
        })
    }

    /// 根据模型名称获取模型 ID
    pub fn get_model_id(&self, model_name: &str) -> Result<i32, PyErr> {
        Python::with_gil(|py| {
            let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")?;
            let dict = sr_module.dict();

            for (key, value) in dict.iter() {
                let name: &str = key.extract()?;
                if name == model_name {
                    let id: i32 = value.extract()?;
                    return Ok(id);
                }
            }

            let target_lower = model_name.to_lowercase();
            for (key, value) in dict.iter() {
                let name: &str = key.extract()?;
                if name.to_lowercase() == target_lower {
                    let id: i32 = value.extract()?;
                    return Ok(id);
                }
            }

            Ok(0)
        })
    }

    /// 执行图像超分（内存版本）
    pub fn upscale_image(
        &self,
        image_data: &[u8],
        model: i32,
        scale: i32,
        tile_size: i32,
        noise_level: i32,
        timeout: f64,
        _width: i32,
        _height: i32,
        job_key: Option<&str>,
    ) -> Result<Option<Vec<u8>>, PyErr> {
        let data = self
            .sr_manager
            .upscale_image_sync(
                image_data,
                model,
                scale,
                tile_size,
                noise_level,
                timeout,
                _width,
                _height,
                job_key,
            )
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e))?;

        Ok(Some(data))
    }

    /// 异步添加超分任务
    pub fn upscale_image_async(
        &self,
        image_data: &[u8],
        model: i32,
        scale: i32,
        tile_size: i32,
        noise_level: i32,
    ) -> Result<i32, PyErr> {
        Python::with_gil(|py| {
            let module = self.module.bind(py);
            let py_bytes = PyBytes::new_bound(py, image_data);

            let result = module.getattr("upscale_image_async")?.call1((
                py_bytes,
                model,
                scale,
                tile_size,
                noise_level,
            ))?;

            result.extract()
        })
    }

    /// 获取任务状态
    pub fn get_task_status(&self, task_id: i32) -> Result<Option<TaskStatus>, PyErr> {
        Python::with_gil(|py| {
            let module = self.module.bind(py);
            let result = module.getattr("get_task_status")?.call1((task_id,))?;

            if result.is_none() {
                return Ok(None);
            }

            let dict: &Bound<'_, PyDict> = result.downcast()?;

            // 使用 get 方法获取值
            let task_id_opt = dict.get_item("task_id")?;
            let status_opt = dict.get_item("status")?;
            let error_opt = dict.get_item("error")?;
            let tick_opt = dict.get_item("tick")?;

            // 检查所有值都存在
            let task_id = task_id_opt
                .ok_or_else(|| PyErr::new::<pyo3::exceptions::PyKeyError, _>("task_id"))?
                .extract()?;
            let status = status_opt
                .ok_or_else(|| PyErr::new::<pyo3::exceptions::PyKeyError, _>("status"))?
                .extract()?;
            let error = error_opt
                .map(|v| v.extract::<Option<String>>())
                .transpose()?
                .unwrap_or(None);
            let tick = tick_opt
                .ok_or_else(|| PyErr::new::<pyo3::exceptions::PyKeyError, _>("tick"))?
                .extract()?;

            let task_status = TaskStatus {
                task_id,
                status,
                error,
                tick,
            };

            Ok(Some(task_status))
        })
    }

    /// 获取任务结果
    pub fn get_task_result(&self, task_id: i32) -> Result<Option<Vec<u8>>, PyErr> {
        Python::with_gil(|py| {
            let module = self.module.bind(py);
            let result = module.getattr("get_task_result")?.call1((task_id,))?;

            if result.is_none() {
                return Ok(None);
            }

            let data: Vec<u8> = result.extract()?;
            Ok(Some(data))
        })
    }

    /// 等待任务完成
    pub fn wait_for_task(&self, task_id: i32, timeout: f64) -> Result<bool, PyErr> {
        Python::with_gil(|py| {
            let module = self.module.bind(py);
            let result = module.getattr("wait_for_task")?.call1((task_id, timeout))?;
            result.extract()
        })
    }

    /// 移除任务
    pub fn remove_task(&self, task_id: i32) -> Result<(), PyErr> {
        Python::with_gil(|py| {
            let module = self.module.bind(py);
            module.getattr("remove_task")?.call1((task_id,))?;
            Ok(())
        })
    }

    /// 取消指定 job_key 的任务
    pub fn cancel_job(&self, job_key: &str) -> Result<(), PyErr> {
        self.sr_manager
            .cancel_job(job_key)
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e))
    }
}

/// 任务状态信息
#[derive(Debug, Clone)]
pub struct TaskStatus {
    pub task_id: i32,
    pub status: String,
    pub error: Option<String>,
    pub tick: f64,
}
