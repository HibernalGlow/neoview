//! NeoView - PyO3 Upscaler Module
//! 使用 PyO3 调用 Python sr_vulkan 模块进行超分

use super::python_upscale_wrapper::PythonUpscaleModule;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, Once};

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
    /// Python 模块包装器
    python_module: Arc<Mutex<Option<PythonUpscaleModule>>>,
}

impl PyO3Upscaler {
    /// 创建新的 PyO3 超分管理器
    pub fn new(python_module_path: PathBuf, cache_dir: PathBuf) -> Result<Self, String> {
        ensure_python_initialized();

        // 创建缓存目录
        if let Err(e) = fs::create_dir_all(&cache_dir) {
            eprintln!("创建缓存目录失败: {}", e);
        }

        // 初始化 Python 模块包装器
        let python_module = match PythonUpscaleModule::new(
            &python_module_path
                .parent()
                .ok_or_else(|| "无法获取模块目录".to_string())?
                .to_path_buf(),
        ) {
            Ok(module) => module,
            Err(e) => return Err(format!("初始化 Python 模块失败: {}", e)),
        };

        Ok(Self {
            python_module_path,
            cache_dir,
            initialized: Arc::new(Mutex::new(false)),
            python_module: Arc::new(Mutex::new(Some(python_module))),
        })
    }

    /// 检查 Python 模块是否可用
    pub fn check_availability(&self) -> Result<bool, String> {
        let module_guard = self
            .python_module
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;

        if let Some(module) = module_guard.as_ref() {
            module
                .check_sr_available()
                .map_err(|e| format!("检查可用性失败: {}", e))
        } else {
            Err("Python 模块未初始化".to_string())
        }
    }

    /// 初始化 Python 模块
    pub fn set_manga_janai_model_dir(&self, model_dir: &str) -> Result<(), String> {
        let module_guard = self
            .python_module
            .lock()
            .map_err(|e| format!("鑾峰彇閿佸け璐? {}", e))?;

        if let Some(module) = module_guard.as_ref() {
            module
                .set_manga_janai_model_dir(model_dir)
                .map_err(|e| format!("璁剧疆 MangaJaNai 妯″瀷鐩綍澶辫触: {}", e))
        } else {
            Err("Python 妯″潡鏈垵濮嬪寲".to_string())
        }
    }

    pub fn initialize(&self) -> Result<(), String> {
        let mut initialized = self
            .initialized
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;

        if *initialized {
            return Ok(());
        }

        let module_guard = self
            .python_module
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;

        if let Some(module) = module_guard.as_ref() {
            // 检查是否可用
            let available = module
                .check_sr_available()
                .map_err(|e| format!("检查可用性失败: {}", e))?;

            println!("📊 sr_vulkan 可用性: {}", available);

            if available {
                *initialized = true;
                println!("✅ PyO3 超分管理器初始化成功");
                Ok(())
            } else {
                Err("sr_vulkan 不可用或未初始化".to_string())
            }
        } else {
            Err("Python 模块未初始化".to_string())
        }
    }

    /// 执行超分处理 (内存流版本)
    pub fn upscale_image_memory(
        &self,
        image_data: &[u8],
        model: &UpscaleModel,
        timeout: f64,
        width: i32,
        height: i32,
        job_key: Option<&str>,
    ) -> Result<Vec<u8>, String> {
        // 确保已初始化
        self.initialize()?;

        println!("🚀 开始 PyO3 超分处理 (内存流)");
        println!("  🎯 模型: {} (ID: {})", model.model_name, model.model_id);
        println!("  📏 缩放: {}x", model.scale);
        println!("  🧩 Tile Size: {}", model.tile_size);
        println!("  🔊 降噪等级: {}", model.noise_level);
        println!("  📐 图像尺寸: {}x{}", width, height);
        println!(
            "  📊 输入数据大小: {} bytes ({:.2} MB)",
            image_data.len(),
            image_data.len() as f64 / 1024.0 / 1024.0
        );

        // 使用 Python 模块包装器
        let module_guard = self
            .python_module
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;

        if let Some(module) = module_guard.as_ref() {
            // 调用 Python 函数
            let result = module
                .upscale_image(
                    image_data,
                    &model.model_name,
                    model.model_id,
                    model.scale,
                    model.tile_size,
                    model.noise_level,
                    timeout,
                    width,
                    height,
                    job_key,
                )
                .map_err(|e| format!("调用 Python 超分函数失败: {}", e))?;

            if let Some(data) = result {
                println!("✅ 超分处理完成 (内存流)");
                println!(
                    "  📊 输出数据大小: {} bytes ({:.2} MB)",
                    data.len(),
                    data.len() as f64 / 1024.0 / 1024.0
                );
                Ok(data)
            } else {
                Err("超分返回空结果".to_string())
            }
        } else {
            Err("Python 模块未初始化".to_string())
        }
    }

    /// 异步保存超分结果到缓存
    pub fn save_upscale_cache(
        &self,
        image_hash: &str,
        model: &UpscaleModel,
        result_data: &[u8],
    ) -> Result<PathBuf, String> {
        // 确保缓存目录存在
        if let Err(e) = fs::create_dir_all(&self.cache_dir) {
            eprintln!("创建缓存目录失败: {}", e);
        }

        // 生成缓存文件名: hash_sr[model].webp
        let cache_filename = format!("{}_sr[{}].webp", image_hash, model.model_name);
        let cache_path = self.cache_dir.join(cache_filename);

        // 异步保存到文件
        fs::write(&cache_path, result_data).map_err(|e| format!("保存缓存文件失败: {}", e))?;

        println!("💾 超分结果已缓存: {}", cache_path.display());
        Ok(cache_path)
    }

    /// 执行超分处理 (文件路径版本，保持兼容性)
    pub fn upscale_image(
        &self,
        image_path: &Path,
        model: &UpscaleModel,
        _timeout: f64,
    ) -> Result<Vec<u8>, String> {
        // 确保已初始化
        self.initialize()?;

        println!("🚀 开始 PyO3 超分处理 (文件路径)");
        println!("  📁 输入路径: {}", image_path.display());
        println!("  🎯 模型: {} (ID: {})", model.model_name, model.model_id);
        println!("  📏 缩放: {}x", model.scale);
        println!("  🧩 Tile Size: {}", model.tile_size);
        println!("  🔊 降噪等级: {}", model.noise_level);

        // 读取图像数据
        let image_data = fs::read(image_path).map_err(|e| format!("读取图像文件失败: {}", e))?;

        println!(
            "  📊 输入文件大小: {} bytes ({:.2} MB)",
            image_data.len(),
            image_data.len() as f64 / 1024.0 / 1024.0
        );

        // 调用内存流版本
        // 对于文件路径版本，我们需要先获取图像尺寸
        // 这里暂时使用 0，让 Python 端来获取实际尺寸
        let result = self.upscale_image_memory(&image_data, model, _timeout, 0, 0, None)?;

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

    /// 获取缓存路径（基于 image_hash）
    pub fn get_cache_path(
        &self,
        image_hash: &str,
        model: &UpscaleModel,
    ) -> Result<PathBuf, String> {
        // 生成缓存文件名: hash_sr[model].webp
        let cache_filename = format!("{}_sr[{}].webp", image_hash, model.model_name);
        Ok(self.cache_dir.join(cache_filename))
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
    pub fn get_model_id(&self, model_name: &str) -> Result<i32, String> {
        let module_guard = self
            .python_module
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;

        if let Some(module) = module_guard.as_ref() {
            module
                .get_model_id(model_name)
                .map_err(|e| format!("获取模型 ID 失败: {}", e))
        } else {
            Err("Python 模块未初始化".to_string())
        }
    }

    /// 检查缓存（基于 image_hash）
    pub fn check_cache(&self, image_hash: &str, model: &UpscaleModel) -> Option<PathBuf> {
        // 生成缓存文件名: hash_sr[model].webp
        let cache_filename = format!("{}_sr[{}].webp", image_hash, model.model_name);
        let cache_path = self.cache_dir.join(cache_filename);

        if cache_path.exists() {
            println!("💾 找到缓存: {}", cache_path.display());
            Some(cache_path)
        } else {
            None
        }
    }

    /// 获取可用模型
    pub fn get_available_models(&self) -> Result<Vec<String>, String> {
        let module_guard = self
            .python_module
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;

        if let Some(module) = module_guard.as_ref() {
            module
                .get_available_models()
                .map_err(|e| format!("获取可用模型失败: {}", e))
        } else {
            Err("Python 模块未初始化".to_string())
        }
    }

    /// 请求取消正在执行的任务
    pub fn cancel_job(&self, job_key: &str) -> Result<(), String> {
        let module_guard = self
            .python_module
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;

        if let Some(module) = module_guard.as_ref() {
            module
                .cancel_job(job_key)
                .map_err(|e| format!("取消 Python 任务失败: {}", e))
        } else {
            Err("Python 模块未初始化".to_string())
        }
    }
}
