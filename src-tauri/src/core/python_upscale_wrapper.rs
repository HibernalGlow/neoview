use crate::core::manga_janai_backend::MangaJaNaiBackend;
use crate::core::sr_vulkan_manager::SrVulkanManager;
use pyo3::prelude::*;
use pyo3::types::PyModule;
use std::path::PathBuf;
use std::sync::Arc;

pub struct PythonUpscaleModule {
    sr_manager: Option<Arc<SrVulkanManager>>,
    manga_backend: MangaJaNaiBackend,
}

impl PythonUpscaleModule {
    pub fn new(module_path: &PathBuf) -> Result<Self, PyErr> {
        add_python_module_path(module_path)?;

        let sr_manager = match SrVulkanManager::new() {
            Ok(manager) => Some(manager),
            Err(error) => {
                eprintln!("[PythonUpscaleModule] sr_vulkan is unavailable: {error}");
                None
            }
        };

        Ok(Self {
            sr_manager,
            manga_backend: MangaJaNaiBackend::new()?,
        })
    }

    pub fn set_manga_janai_model_dir(&self, model_dir: &str) -> Result<(), PyErr> {
        self.manga_backend.set_model_dir(model_dir)
    }

    pub fn check_sr_available(&self) -> Result<bool, PyErr> {
        if self.sr_manager.is_some() {
            return Ok(true);
        }

        Ok(!self.manga_backend.get_available_models().is_empty())
    }

    pub fn get_available_models(&self) -> Result<Vec<String>, PyErr> {
        let mut model_names = Vec::new();

        if self.sr_manager.is_some() {
            Python::with_gil(|py| -> Result<(), PyErr> {
                let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")?;
                let dict = sr_module.dict();

                for (key, _) in dict.iter() {
                    let name: &str = key.extract()?;
                    if name.starts_with("MODEL_") {
                        model_names.push(name.to_string());
                    }
                }

                Ok(())
            })?;
        }

        model_names.extend(self.manga_backend.get_available_models());
        model_names.sort();
        model_names.dedup();
        Ok(model_names)
    }

    pub fn get_model_id(&self, model_name: &str) -> Result<i32, PyErr> {
        if self.manga_backend.is_supported_model(model_name) {
            return Ok(-100);
        }

        Python::with_gil(|py| {
            let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")?;
            let dict = sr_module.dict();

            for (key, value) in dict.iter() {
                let name: &str = key.extract()?;
                if name == model_name {
                    return value.extract();
                }
            }

            let target_lower = model_name.to_lowercase();
            for (key, value) in dict.iter() {
                let name: &str = key.extract()?;
                if name.to_lowercase() == target_lower {
                    return value.extract();
                }
            }

            Ok(0)
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upscale_image(
        &self,
        image_data: &[u8],
        model_name: &str,
        model: i32,
        scale: i32,
        tile_size: i32,
        noise_level: i32,
        timeout: f64,
        width: i32,
        height: i32,
        job_key: Option<&str>,
    ) -> Result<Option<Vec<u8>>, PyErr> {
        if self.manga_backend.is_supported_model(model_name) {
            let data = self
                .manga_backend
                .upscale_image(image_data, model_name, scale, tile_size, timeout)?;
            return Ok(Some(data));
        }

        let sr_manager = self.sr_manager.as_ref().ok_or_else(|| {
            PyErr::new::<pyo3::exceptions::PyRuntimeError, _>("sr_vulkan is not available")
        })?;

        let data = sr_manager
            .upscale_image_sync(
                image_data,
                model,
                scale,
                tile_size,
                noise_level,
                timeout,
                width,
                height,
                job_key,
            )
            .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e))?;

        Ok(Some(data))
    }

    pub fn cancel_job(&self, job_key: &str) -> Result<(), PyErr> {
        if let Some(sr_manager) = &self.sr_manager {
            sr_manager
                .cancel_job(job_key)
                .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e))?;
        }
        Ok(())
    }
}

fn add_python_module_path(module_path: &PathBuf) -> Result<(), PyErr> {
    Python::with_gil(|py| {
        let sys = py.import_bound("sys")?;
        let sys_path = sys.getattr("path")?;
        let module_path_str = module_path.to_str().ok_or_else(|| {
            PyErr::new::<pyo3::exceptions::PyValueError, _>("Invalid Python module path")
        })?;

        let mut found = false;
        for item in sys_path.iter()? {
            let path_str = item?.extract::<String>()?;
            if path_str == module_path_str {
                found = true;
                break;
            }
        }

        if !found {
            sys_path.call_method1("insert", (0, module_path_str))?;
        }

        Ok(())
    })
}
