//! NeoView - Sr_vulkan Direct Upscaler Module
//! 使用 PyO3 直接调用 sr_vulkan 库的超分模块

use std::path::{Path, PathBuf};
use std::fs;
use serde::{Deserialize, Serialize};
use pyo3::prelude::*;
use pyo3::types::{PyBytes, PyDict};

/// 超分选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SrVulkanOptions {
    /// GPU ID
    pub gpu_id: i32,
    /// Tile Size (0 = auto)
    pub tile_size: i32,
    /// TTA (Test Time Augmentation)
    pub tta: bool,
    /// 输出格式
    pub output_format: String,
}

impl Default for SrVulkanOptions {
    fn default() -> Self {
        Self {
            gpu_id: 0,
            tile_size: 400,
            tta: false,
            output_format: "webp".to_string(),
        }
    }
}

/// Sr_vulkan 超分管理器
pub struct SrVulkanUpscaler {
    /// 缩略图根目录
    pub thumbnail_root: PathBuf,
    /// Python 初始化状态
    initialized: bool,
}

impl Clone for SrVulkanUpscaler {
    fn clone(&self) -> Self {
        Self {
            thumbnail_root: self.thumbnail_root.clone(),
            initialized: self.initialized,
        }
    }
}

impl SrVulkanUpscaler {
    /// 创建新的超分管理器
    pub fn new(thumbnail_root: PathBuf) -> Self {
        // 创建超分目录
        let upscale_dir = thumbnail_root.join("sr-vulkan-upscale");
        if let Err(e) = fs::create_dir_all(&upscale_dir) {
            eprintln!("创建超分目录失败: {}", e);
        }

        Self {
            thumbnail_root,
            initialized: false,
        }
    }

    /// 初始化 sr_vulkan
    pub fn initialize(&mut self) -> Result<(), String> {
        Python::with_gil(|py| {
            // 导入 sr_vulkan
            let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")
                .map_err(|e| format!("导入 sr_vulkan 失败: {}", e))?;

            // 初始化
            let init_result: i32 = sr_module
                .getattr("init")
                .map_err(|e| format!("获取 init 函数失败: {}", e))?
                .call0()
                .map_err(|e| format!("调用 init 失败: {}", e))?
                .extract()
                .map_err(|e| format!("提取 init 结果失败: {}", e))?;

            if init_result < 0 {
                println!("⚠️  CPU 模式 (init code: {})", init_result);
            } else {
                println!("✅ GPU 模式初始化成功 (init code: {})", init_result);
            }

            Ok(())
        })?;

        self.initialized = true;
        Ok(())
    }

    /// 检查超分工具是否可用
    pub fn check_availability(&self) -> Result<(), String> {
        Python::with_gil(|py| {
            // 尝试导入 sr_vulkan
            PyModule::import_bound(py, "sr_vulkan.sr_vulkan")
                .map_err(|_| "sr_vulkan 未安装。请运行: pip install sr-vulkan".to_string())?;

            Ok(())
        })
    }

    /// 获取 GPU 信息
    pub fn get_gpu_info(&self) -> Result<Vec<String>, String> {
        Python::with_gil(|py| {
            let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")
                .map_err(|e| format!("导入 sr_vulkan 失败: {}", e))?;

            let gpu_info: Option<Vec<String>> = sr_module
                .getattr("getGpuInfo")
                .map_err(|e| format!("获取 getGpuInfo 函数失败: {}", e))?
                .call0()
                .map_err(|e| format!("调用 getGpuInfo 失败: {}", e))?
                .extract()
                .map_err(|e| format!("提取 GPU 信息失败: {}", e))?;

            Ok(gpu_info.unwrap_or_default())
        })
    }

    /// 初始化 GPU 设置
    pub fn init_set(&self, gpu_id: i32) -> Result<(), String> {
        Python::with_gil(|py| {
            let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")
                .map_err(|e| format!("导入 sr_vulkan 失败: {}", e))?;

            let result: i32 = sr_module
                .getattr("initSet")
                .map_err(|e| format!("获取 initSet 函数失败: {}", e))?
                .call1((gpu_id,))
                .map_err(|e| format!("调用 initSet 失败: {}", e))?
                .extract()
                .map_err(|e| format!("提取 initSet 结果失败: {}", e))?;

            if result != 0 {
                println!("⚠️  设置 GPU {} 失败，使用默认设置", gpu_id);
            } else {
                println!("✅ GPU {} 已初始化", gpu_id);
            }

            Ok(())
        })
    }

    /// 计算文件 MD5
    pub fn calculate_file_md5(&self, file_path: &Path) -> Result<String, String> {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::Hasher;

        let data = fs::read(file_path)
            .map_err(|e| format!("读取文件失败: {}", e))?;

        let mut hasher = DefaultHasher::new();
        hasher.write(&data);
        let result = hasher.finish();

        Ok(format!("{:x}", result))
    }

    /// 生成超分文件名
    pub fn generate_upscale_filename(
        &self,
        original_path: &Path,
        model: &str,
        options: &SrVulkanOptions,
    ) -> Result<String, String> {
        let md5 = self.calculate_file_md5(original_path)?;

        let params = if options.tta {
            format!("{}_{}_tta", model, options.gpu_id)
        } else {
            format!("{}_{}", model, options.gpu_id)
        };

        Ok(format!("{}_sr[{}].webp", md5, params))
    }

    /// 获取超分保存路径
    pub fn get_upscale_save_path(
        &self,
        original_path: &Path,
        model: &str,
        options: &SrVulkanOptions,
    ) -> Result<PathBuf, String> {
        let filename = self.generate_upscale_filename(original_path, model, options)?;
        let upscale_dir = self.thumbnail_root.join("sr-vulkan-upscale");
        Ok(upscale_dir.join(filename))
    }

    /// 转换模型名称为 sr_vulkan 格式
    fn get_sr_vulkan_model_name(&self, model: &str) -> Result<String, String> {
        let model_name = match model {
            // 数字艺术/动漫
            "digital" | "anime" => "REALESRGAN_X4PLUSANIME_UP4X",
            // 通用
            "general" => "REALESRGAN_X4PLUS_UP4X",
            // Waifu2x 模型
            "waifu2x_cunet" => "WAIFU2X_CUNET_UP2X",
            "waifu2x_anime" => "WAIFU2X_ANIME_UP2X",
            "waifu2x_photo" => "WAIFU2X_PHOTO_UP2X",
            // RealCUGAN 模型
            "realcugan_pro" => "REALCUGAN_PRO_UP2X",
            "realcugan_se" => "REALCUGAN_SE_UP2X",
            // 直接使用提供的模型名称
            _ => model,
        };

        Ok(model_name.to_uppercase())
    }

    /// 执行超分处理
    pub async fn upscale_image(
        &self,
        image_path: &Path,
        save_path: &Path,
        model: &str,
        scale: f64,
        options: SrVulkanOptions,
    ) -> Result<String, String> {
        println!("🚀 开始超分处理 (PyO3 直接调用)");
        println!("  📁 输入路径: {}", image_path.display());
        println!("  💾 输出路径: {}", save_path.display());
        println!("  🎯 模型: {}", model);
        println!("  📈 缩放: {}x", scale);
        println!("  🖥️  GPU ID: {}", options.gpu_id);
        println!("  🧩 Tile Size: {}", options.tile_size);
        println!("  🎲 TTA: {}", options.tta);

        // 检查输入文件
        if !image_path.exists() {
            return Err(format!("输入文件不存在: {}", image_path.display()));
        }

        // 创建输出目录
        if let Some(parent) = save_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建输出目录失败: {}", e))?;
        }

        // 转换模型名称
        let model_name = self.get_sr_vulkan_model_name(model)?;

        // 读取输入图像
        let image_data = fs::read(image_path)
            .map_err(|e| format!("读取输入文件失败: {}", e))?;

        println!("  📊 文件大小: {} bytes", image_data.len());

        // 执行超分
        let start_time = std::time::Instant::now();

        let result = Python::with_gil(|py| {
            // 导入 sr_vulkan
            let sr_module = PyModule::import_bound(py, "sr_vulkan.sr_vulkan")
                .map_err(|e| format!("导入 sr_vulkan 失败: {}", e))?;

            // 获取模型索引
            let model_attr = sr_module
                .getattr(&model_name)
                .map_err(|e| format!("获取模型 {} 失败: {}", model_name, e))?;

            println!("  🔧 获取模型: {}", model_name);

            // 添加图像到处理队列
            let add_result: i32 = sr_module
                .getattr("add")
                .map_err(|e| format!("获取 add 函数失败: {}", e))?
                .call(
                    (
                        PyBytes::new_bound(py, &image_data),
                        model_attr,
                        0i32,
                        scale,
                        &options.output_format,
                        options.tile_size,
                    ),
                    None::<&PyDict>,
                )
                .map_err(|e| format!("调用 add 失败: {}", e))?
                .extract()
                .map_err(|e| format!("提取 add 结果失败: {}", e))?;

            if add_result != 0 {
                let error_msg = sr_module
                    .getattr("getLastError")
                    .ok()
                    .and_then(|f| f.call0().ok())
                    .and_then(|e| e.extract::<String>().ok())
                    .unwrap_or_else(|| "未知错误".to_string());
                return Err(format!("添加图像失败: {}", error_msg));
            }

            println!("  ⏳ 处理中...");

            // 加载结果
            let load_result = sr_module
                .getattr("load")
                .map_err(|e| format!("获取 load 函数失败: {}", e))?
                .call1((0i32,))
                .map_err(|e| format!("调用 load 失败: {}", e))?;

            // 检查是否为 None
            if load_result.is_none() {
                let error_msg = sr_module
                    .getattr("getLastError")
                    .ok()
                    .and_then(|f| f.call0().ok())
                    .and_then(|e| e.extract::<String>().ok())
                    .unwrap_or_else(|| "未知错误".to_string());
                return Err(format!("加载结果失败: {}", error_msg));
            }

            // 提取输出数据
            let (output_data, _output_fmt, _back_id, tick): (Vec<u8>, String, i32, i64) =
                load_result
                    .extract()
                    .map_err(|e| format!("提取结果失败: {}", e))?;

            println!("  ⏱️  处理耗时: {}ms", tick);

            Ok(output_data)
        })?;

        // 保存输出文件
        fs::write(save_path, &result)
            .map_err(|e| format!("写入输出文件失败: {}", e))?;

        let elapsed = start_time.elapsed();
        println!("✅ 超分完成!");
        println!("  📁 输出文件: {}", save_path.display());
        println!("  📊 输出大小: {} bytes", result.len());
        println!("  ⏱️  总耗时: {:.2}s", elapsed.as_secs_f64());

        Ok(save_path.to_string_lossy().to_string())
    }

    /// 检查是否已有超分缓存
    pub fn check_upscale_cache(
        &self,
        original_path: &Path,
        model: &str,
        options: &SrVulkanOptions,
    ) -> Option<PathBuf> {
        let save_path = match self.get_upscale_save_path(original_path, model, options) {
            Ok(path) => path,
            Err(_) => return None,
        };

        if save_path.exists() {
            println!("📦 找到超分缓存: {}", save_path.display());
            Some(save_path)
        } else {
            None
        }
    }

    /// 清理过期的超分缓存
    pub fn cleanup_cache(&self, max_age_days: u32) -> Result<usize, String> {
        let upscale_dir = self.thumbnail_root.join("sr-vulkan-upscale");
        if !upscale_dir.exists() {
            return Ok(0);
        }

        let mut removed_count = 0;
        let cutoff_time = chrono::Utc::now() - chrono::Duration::days(max_age_days as i64);

        for entry in fs::read_dir(&upscale_dir)
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
    pub fn get_cache_stats(&self) -> Result<UpscaleCacheStats, String> {
        let upscale_dir = self.thumbnail_root.join("sr-vulkan-upscale");
        if !upscale_dir.exists() {
            return Ok(UpscaleCacheStats::default());
        }

        let mut total_files = 0;
        let mut total_size = 0;

        for entry in fs::read_dir(&upscale_dir)
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

        Ok(UpscaleCacheStats {
            total_files,
            total_size,
            cache_dir: upscale_dir.to_string_lossy().to_string(),
        })
    }
}

/// 超分缓存统计信息
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpscaleCacheStats {
    pub total_files: usize,
    pub total_size: u64,
    pub cache_dir: String,
}
