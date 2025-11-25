use pyo3::prelude::*;
use pyo3::types::{PyBytes, PyDict, PyModule, PyTuple};
use pyo3::IntoPy;
use std::collections::HashMap;
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

pub struct SrVulkanManager {
    inner: Mutex<SrVulkanManagerInner>,
}

struct SrVulkanManagerInner {
    next_task_id: i32,
    tasks: HashMap<i32, SrTaskEntry>,
    job_key_map: HashMap<String, i32>,
    task_key_map: HashMap<i32, String>,
}

struct SrTaskEntry {
    sender: Option<mpsc::Sender<Result<Vec<u8>, String>>>,
}

impl SrVulkanManager {
    pub fn new() -> Result<Arc<Self>, String> {
        Python::with_gil(|py| -> PyResult<()> {
            // 调试：打印 Python 环境和 sr_vulkan 模块信息
            let sys_module = PyModule::import_bound(py, "sys")?;
            let py_exe: String = sys_module.getattr("executable")?.extract().unwrap_or_default();
            let py_ver: String = sys_module.getattr("version")?.extract().unwrap_or_default();
            println!("[SrVulkanManager] Python executable: {}", py_exe);
            println!("[SrVulkanManager] Python version: {}", py_ver);

            let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")?;

            let sr_file: String = sr_module
                .getattr("__file__")
                .and_then(|v| v.extract())
                .unwrap_or_else(|_| "<unknown>".to_string());
            let sr_version: String = sr_module
                .getattr("getVersion")?
                .call0()?
                .extract()
                .unwrap_or_else(|_| "<unknown>".to_string());

            println!(
                "[SrVulkanManager] sr_vulkan file: {} version: {}",
                sr_file, sr_version
            );

            if let Ok(model_obj) = sr_module.getattr("MODEL_REALESRGAN_ANIMAVIDEOV3_UP2X") {
                if let Ok(model_id) = model_obj.extract::<i32>() {
                    println!(
                        "[SrVulkanManager] MODEL_REALESRGAN_ANIMAVIDEOV3_UP2X id: {}",
                        model_id
                    );
                }
            }

            let _init_result: i32 = sr_module.getattr("init")?.call0()?.extract()?;
            println!("[SrVulkanManager] sr.init() -> {}", _init_result);

            let gpu_info_obj = sr_module.getattr("getGpuInfo")?.call0()?;
            let gpu_info: Option<Vec<String>> = gpu_info_obj.extract().unwrap_or(None);
            let use_gpu = gpu_info.as_ref().map(|v| !v.is_empty()).unwrap_or(false);
            println!("[SrVulkanManager] getGpuInfo -> {:?}", gpu_info);

            let gpu_id = if use_gpu { 0 } else { -1 };
            println!("[SrVulkanManager] selected gpu_id: {}", gpu_id);

            let _init_set_result: i32 = sr_module
                .getattr("initSet")?
                .call1((gpu_id, 0))?
                .extract()?;
            println!("[SrVulkanManager] sr.initSet({}, 0) -> {}", gpu_id, _init_set_result);

            // 设置 WebP 输出质量为 85
            if let Ok(set_q) = sr_module.getattr("setWebpQuality") {
                let _ = set_q.call1((85,));
                println!("[SrVulkanManager] sr.setWebpQuality(85)");
            }

            Ok(())
        })
        .map_err(|e| format!("初始化 sr_vulkan 失败: {}", e))?;

        let manager = Arc::new(SrVulkanManager {
            inner: Mutex::new(SrVulkanManagerInner {
                next_task_id: 0,
                tasks: HashMap::new(),
                job_key_map: HashMap::new(),
                task_key_map: HashMap::new(),
            }),
        });

        SrVulkanManager::spawn_load_thread(Arc::clone(&manager));

        Ok(manager)
    }

    fn spawn_load_thread(manager: Arc<SrVulkanManager>) {
        thread::spawn(move || loop {
            let result = Python::with_gil(|py| -> PyResult<()> {
                let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")?;
                let load_func = sr_module.getattr("load")?;
                let obj = load_func.call1((0,))?;

                if obj.is_none() {
                    py.allow_threads(|| thread::sleep(Duration::from_millis(10)));
                    return Ok(());
                }

                let tuple: &Bound<'_, PyTuple> = obj.downcast()?;
                let data_obj = tuple.get_item(0)?;
                let data: Vec<u8> = data_obj.extract()?;
                let task_id_obj = tuple.get_item(2)?;
                let task_id: i32 = task_id_obj.extract()?;

                let mut inner = match manager.inner.lock() {
                    Ok(guard) => guard,
                    Err(poisoned) => poisoned.into_inner(),
                };

                if let Some(entry) = inner.tasks.remove(&task_id) {
                    if let Some(sender) = entry.sender {
                        if data.is_empty() {
                            let _ = sender.send(Err("超分返回空数据".to_string()));
                        } else {
                            let _ = sender.send(Ok(data));
                        }
                    }
                    if let Some(job_key) = inner.task_key_map.remove(&task_id) {
                        inner.job_key_map.remove(&job_key);
                    }
                }

                Ok(())
            });

            if let Err(err) = result {
                eprintln!("sr_vulkan.load 线程错误: {}", err);
                thread::sleep(Duration::from_millis(100));
            }
        });
    }

    pub fn upscale_image_sync(
        &self,
        image_data: &[u8],
        model: i32,
        scale: i32,
        tile_size: i32,
        noise_level: i32,
        timeout: f64,
        width: i32,
        height: i32,
        job_key: Option<&str>,
    ) -> Result<Vec<u8>, String> {
        let (task_id, receiver) = self.add_task(
            image_data,
            model,
            scale,
            tile_size,
            noise_level,
            width,
            height,
            job_key,
        )?;

        let duration = if timeout.is_sign_positive() {
            Duration::from_secs_f64(timeout)
        } else {
            Duration::from_secs(60)
        };

        match receiver.recv_timeout(duration) {
            Ok(Ok(data)) => Ok(data),
            Ok(Err(err)) => Err(err),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                self.on_timeout(task_id);
                Err("任务超时".to_string())
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                Err("结果通道已断开".to_string())
            }
        }
    }

    fn add_task(
        &self,
        image_data: &[u8],
        model: i32,
        scale: i32,
        tile_size: i32,
        noise_level: i32,
        width: i32,
        height: i32,
        job_key: Option<&str>,
    ) -> Result<(i32, mpsc::Receiver<Result<Vec<u8>, String>>), String> {
        let (tx, rx) = mpsc::channel();
        let task_id;
        {
            let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
            inner.next_task_id += 1;
            task_id = inner.next_task_id;
            inner.tasks.insert(task_id, SrTaskEntry { sender: Some(tx) });
            if let Some(key) = job_key {
                inner.job_key_map.insert(key.to_string(), task_id);
                inner.task_key_map.insert(task_id, key.to_string());
            }
        }

        let status_result: Result<i32, PyErr> = Python::with_gil(|py| {
            println!(
                "[SrVulkanManager] add_task -> model={} scale={} width={} height={} tileSize={} job_key={:?}",
                model, scale, width, height, tile_size, job_key
            );

            let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")?;
            let add_func = sr_module.getattr("add")?;
            let data_obj = PyBytes::new_bound(py, image_data);

            let args = if width > 0 && height > 0 {
                PyTuple::new_bound(
                    py,
                    &[
                        data_obj.into_py(py),
                        model.into_py(py),
                        task_id.into_py(py),
                        width.into_py(py),
                        height.into_py(py),
                    ],
                )
            } else {
                PyTuple::new_bound(
                    py,
                    &[
                        data_obj.into_py(py),
                        model.into_py(py),
                        task_id.into_py(py),
                        (scale as f64).into_py(py),
                    ],
                )
            };

            let kwargs = PyDict::new_bound(py);
            // 强制使用 WebP 作为输出格式
            kwargs.set_item("format", "webp")?;
            kwargs.set_item("tileSize", tile_size)?;
            let status: i32 = add_func.call(args, Some(&kwargs))?.extract()?;
            println!("[SrVulkanManager] sr.add(...) -> status={} (task_id={})", status, task_id);
            Ok(status)
        });

        let status = status_result.map_err(|e| format!("调用 sr_vulkan.add 失败: {}", e))?;

        if status <= 0 {
            let error = Python::with_gil(|py| -> PyResult<String> {
                let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")?;
                let err: String = sr_module.getattr("getLastError")?.call0()?.extract()?;
                println!(
                    "[SrVulkanManager] sr.add status={} getLastError='{}' (task_id={})",
                    status, err, task_id
                );
                Ok(err)
            })
            .unwrap_or_else(|_| format!("未知错误 (status={})", status));

            let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
            inner.tasks.remove(&task_id);
            if let Some(job_key) = inner.task_key_map.remove(&task_id) {
                inner.job_key_map.remove(&job_key);
            }

            return Err(format!("添加任务失败: {}", error));
        }

        Ok((task_id, rx))
    }

    fn on_timeout(&self, task_id: i32) {
        let task_id_opt = {
            let mut inner = match self.inner.lock() {
                Ok(guard) => guard,
                Err(poisoned) => poisoned.into_inner(),
            };
            inner.tasks.remove(&task_id);
            if let Some(job_key) = inner.task_key_map.remove(&task_id) {
                inner.job_key_map.remove(&job_key);
            }
            Some(task_id)
        };

        if let Some(id) = task_id_opt {
            let _ = Python::with_gil(|py| -> PyResult<()> {
                let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")?;
                let remove = sr_module.getattr("remove")?;
                let list = vec![id];
                remove.call1((list,))?;
                Ok(())
            });
        }
    }

    pub fn cancel_job(&self, job_key: &str) -> Result<(), String> {
        let task_id_opt = {
            let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
            if let Some(task_id) = inner.job_key_map.remove(job_key) {
                inner.task_key_map.remove(&task_id);
                if let Some(entry) = inner.tasks.get_mut(&task_id) {
                    entry.sender = None;
                }
                Some(task_id)
            } else {
                None
            }
        };

        if let Some(task_id) = task_id_opt {
            let _ = Python::with_gil(|py| -> PyResult<()> {
                let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")?;
                let remove = sr_module.getattr("remove")?;
                let list = vec![task_id];
                remove.call1((list,))?;
                Ok(())
            });
        }

        Ok(())
    }
}
