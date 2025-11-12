//! NeoView - Generic Upscaler Module
//! 通用超分器模块，支持多种超分算法

use std::path::{Path, PathBuf};
use std::process::Command;
use std::fs;
use serde::{Deserialize, Serialize};
use tauri::Window;
use chrono::Utc;

/// 超分算法类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UpscaleAlgorithm {
    RealESRGAN,
    Waifu2x,
    RealCUGAN,
}

impl UpscaleAlgorithm {
    /// 获取算法命令名称
    fn get_command(&self) -> String {
        match self {
            UpscaleAlgorithm::RealESRGAN => "realesrgan-ncnn-vulkan".to_string(),
            UpscaleAlgorithm::Waifu2x => "waifu2x-ncnn-vulkan".to_string(),
            UpscaleAlgorithm::RealCUGAN => "realcugan-ncnn-vulkan".to_string(),
        }
    }

    /// 获取默认模型
    pub fn get_default_model(&self) -> &str {
        match self {
            UpscaleAlgorithm::RealESRGAN => "realesrgan-x4plus",
            UpscaleAlgorithm::Waifu2x => "WAIFU2X_CUNET_UP2X",
            UpscaleAlgorithm::RealCUGAN => "se",
        }
    }

    /// 获取动漫专用模型
    pub fn get_anime_model(&self) -> &str {
        match self {
            UpscaleAlgorithm::RealESRGAN => "realesrgan-x4plus-anime",
            UpscaleAlgorithm::Waifu2x => "WAIFU2X_ANIME_UP2X",
            UpscaleAlgorithm::RealCUGAN => "anime-denoise",
        }
    }
}

/// 超分高级选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenericUpscaleOptions {
    /// 算法类型
    pub algorithm: UpscaleAlgorithm,
    /// 模型名称
    pub model: String,
    /// GPU ID
    pub gpu_id: String,
    /// Tile Size (0 = auto)
    pub tile_size: String,
    /// TTA (Test Time Augmentation)
    pub tta: bool,
    /// 噪声等级 (Waifu2x 和 RealCUGAN 专用)
    pub noise_level: String,
    /// 线程数
    pub num_threads: String,
}

impl Default for GenericUpscaleOptions {
    fn default() -> Self {
        Self {
            algorithm: UpscaleAlgorithm::RealESRGAN,
            model: "realesrgan-x4plus".to_string(),
            gpu_id: "0".to_string(),
            tile_size: "0".to_string(),
            tta: false,
            noise_level: "1".to_string(),
            num_threads: "1".to_string(),
        }
    }
}

/// 通用超分管理器
#[derive(Clone)]
pub struct GenericUpscaler {
    /// 缩略图根目录（用于保存超分图片）
    pub thumbnail_root: PathBuf,
}

impl GenericUpscaler {
    /// 创建新的通用超分管理器
    pub fn new(thumbnail_root: PathBuf) -> Self {
        // 创建通用超分目录
        let upscale_dir = thumbnail_root.join("generic-upscale");
        if let Err(e) = fs::create_dir_all(&upscale_dir) {
            eprintln!("创建通用超分目录失败: {}", e);
        }

        Self { thumbnail_root }
    }

    /// 检查指定算法是否可用
    pub fn check_algorithm_availability(&self, algorithm: &UpscaleAlgorithm) -> Result<(), String> {
        let command = algorithm.get_command();
        
        // 使用 -h 参数检查命令是否存在（更通用）
        let output = Command::new(&command)
            .arg("-h")
            .output();
            
        match output {
            Ok(result) => {
                if result.status.success() {
                    println!("✅ {:?} 工具可用", algorithm);
                    Ok(())
                } else {
                    Err(format!("{} 工具未正确安装", command))
                }
            }
            Err(_e) => {
                match algorithm {
                    UpscaleAlgorithm::RealESRGAN => {
                        Err(format!("{} 工具未安装", command))
                    }
                    UpscaleAlgorithm::Waifu2x => {
                        Err(format!("{} 工具未安装", command))
                    }
                    UpscaleAlgorithm::RealCUGAN => {
                        Err(format!("{} 工具未安装", command))
                    }
                }
            }
        }
    }

    /// 获取模型路径
    fn get_models_path(&self) -> String {
        // 优先使用项目内的模型目录
        let project_models_dir = self.thumbnail_root.join("models");
        if project_models_dir.exists() {
            return project_models_dir.to_string_lossy().to_string();
        }
        
        // 使用默认的模型路径
        "".to_string()
    }

    /// 计算文件MD5
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
        options: &GenericUpscaleOptions,
    ) -> Result<String, String> {
        // 计算原文件MD5
        let md5 = self.calculate_file_md5(original_path)?;
        
        // 获取原文件格式
        let original_format = original_path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("webp");
        
        // 获取算法名称
        let algorithm_name = match options.algorithm {
            UpscaleAlgorithm::RealESRGAN => "esrgan",
            UpscaleAlgorithm::Waifu2x => "waifu2x",
            UpscaleAlgorithm::RealCUGAN => "realcugan",
        };
        
        // 使用新的命名规则: md5.format -> md5_sr[model].webp
        // 提取模型名称（去掉路径前缀）
        let model_name = if options.model.contains('/') || options.model.contains('\\') {
            // 如果是路径，提取最后部分
            options.model
                .split('/')
                .last()
                .unwrap_or(&options.model)
                .split('\\')
                .last()
                .unwrap_or(&options.model)
                .to_string()
        } else {
            options.model.clone()
        };
        
        Ok(format!("{}_sr[{}].webp", md5, model_name))
    }

    /// 获取超分保存路径
    pub fn get_upscale_save_path(
        &self,
        original_path: &Path,
        options: &GenericUpscaleOptions,
    ) -> Result<PathBuf, String> {
        let filename = self.generate_upscale_filename(original_path, options)?;
        let upscale_dir = self.thumbnail_root.join("generic-upscale");
        Ok(upscale_dir.join(filename))
    }

    /// 执行超分处理
    pub async fn upscale_image(
        &self,
        image_path: &Path,
        save_path: &Path,
        options: GenericUpscaleOptions,
        window: Option<Window>,
    ) -> Result<String, String> {
        println!("🚀 开始通用超分处理");
        println!("  📁 输入路径: {}", image_path.display());
        println!("  💾 输出路径: {}", save_path.display());
        println!("  🔧 算法: {:?}", options.algorithm);
        println!("  🎯 模型: {}", options.model);
        println!("  🖥️  GPU ID: {}", options.gpu_id);
        println!("  🧩 Tile Size: {}", options.tile_size);
        println!("  🎲 TTA: {}", options.tta);
        println!("  🔊 噪声等级: {}", options.noise_level);
        println!("  🧵 线程数: {}", options.num_threads);

        // 检查输入文件是否存在
        println!("  🔍 检查输入文件...");
        if !image_path.exists() {
            return Err(format!("输入文件不存在: {}", image_path.display()));
        }
        println!("  ✅ 输入文件存在");

        // 获取文件信息
        if let Ok(metadata) = fs::metadata(image_path) {
            let file_size = metadata.len();
            println!("  📊 文件大小: {} bytes ({:.2} MB)", file_size, file_size as f64 / 1024.0 / 1024.0);
        }

        // 检查算法可用性
        println!("  🔍 检查算法可用性...");
        if let Err(e) = self.check_algorithm_availability(&options.algorithm) {
            return Err(e);
        }
        println!("  ✅ 算法可用");

        // 确保输出目录存在
        println!("  📁 创建输出目录...");
        if let Some(parent) = save_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建输出目录失败: {}", e))?;
        }
        println!("  ✅ 输出目录已准备");

        // 构建命令参数
        let command = options.algorithm.get_command();
        let models_path = self.get_models_path();
        
        println!("  🔧 构建命令参数...");
        let args = self.build_command_args(image_path, save_path, &options, &models_path)?;
        println!("  📝 执行命令: {} {}", command, args.join(" "));

        // 执行命令
        println!("  🚀 启动超分进程...");
        let start_time = std::time::Instant::now();
        
        let mut child = Command::new(&command)
            .args(&args)
            .spawn()
            .map_err(|e| format!("启动超分进程失败: {}", e))?;
        
        println!("  ⏱️  进程已启动，PID: {:?}", child.id());

        // 等待进程完成
        if let Some(_window) = window {
            // 简化处理：直接执行命令并等待完成
            println!("  ⏳ 执行超分命令并等待完成...");
        }

        let status = child.wait()
            .map_err(|e| format!("等待超分进程失败: {}", e))?;

        let elapsed = start_time.elapsed();
        println!("  ⏱️  处理耗时: {:.2} 秒", elapsed.as_secs_f64());

        if !status.success() {
            let exit_code = status.code().unwrap_or(-1);
            println!("  ❌ 超分进程失败，退出码: {}", exit_code);
            return Err(format!("超分进程失败，退出码: {}", exit_code));
        }

        // 检查输出文件是否存在
        println!("  🔍 检查输出文件...");
        if !save_path.exists() {
            return Err("超分输出文件不存在".to_string());
        }

        // 获取输出文件信息
        if let Ok(metadata) = fs::metadata(save_path) {
            let output_size = metadata.len();
            println!("  📊 输出文件大小: {} bytes ({:.2} MB)", output_size, output_size as f64 / 1024.0 / 1024.0);
            
            // 计算压缩比
            if let Ok(input_metadata) = fs::metadata(image_path) {
                let input_size = input_metadata.len();
                let ratio = output_size as f64 / input_size as f64;
                println!("  📈 文件大小比率: {:.2}x", ratio);
            }
        }

        println!("✅ 通用超分处理完成");
        println!("  📁 输出文件: {}", save_path.display());
        Ok(save_path.to_string_lossy().to_string())
    }

    /// 构建命令参数
    fn build_command_args(
        &self,
        image_path: &Path,
        save_path: &Path,
        options: &GenericUpscaleOptions,
        models_path: &str,
    ) -> Result<Vec<String>, String> {
        let mut args = match options.algorithm {
            UpscaleAlgorithm::RealESRGAN => {
                vec![
                    "-i".to_string(),
                    image_path.to_str().unwrap().to_string(),
                    "-o".to_string(),
                    save_path.to_str().unwrap().to_string(),
                    "-n".to_string(),
                    options.model.clone(),
                    "-s".to_string(),
                    "4".to_string(), // Real-ESRGAN 通常使用 4x
                    "-f".to_string(),
                    "webp".to_string(),
                ]
            }
            UpscaleAlgorithm::Waifu2x => {
                vec![
                    "-i".to_string(),
                    image_path.to_str().unwrap().to_string(),
                    "-o".to_string(),
                    save_path.to_str().unwrap().to_string(),
                    "-n".to_string(),
                    options.model.clone(),
                    "-s".to_string(),
                    "2".to_string(), // Waifu2x 通常使用 2x
                    "--noise".to_string(),
                    options.noise_level.clone(),
                    "-f".to_string(),
                    "webp".to_string(),
                ]
            }
            UpscaleAlgorithm::RealCUGAN => {
                vec![
                    "-i".to_string(),
                    image_path.to_str().unwrap().to_string(),
                    "-o".to_string(),
                    save_path.to_str().unwrap().to_string(),
                    "-n".to_string(),
                    options.model.clone(),
                    "-s".to_string(),
                    "2".to_string(), // Real-CUGAN 通常使用 2x
                    "--noise".to_string(),
                    options.noise_level.clone(),
                    "-f".to_string(),
                    "webp".to_string(),
                ]
            }
        };

        // 只有当模型路径不为空时才添加-m参数
        if !models_path.is_empty() {
            args.push("-m".to_string());
            args.push(models_path.to_string());
        }

        // 添加GPU参数
        if !options.gpu_id.is_empty() && options.gpu_id != "0" {
            args.extend_from_slice(&["-g".to_string(), options.gpu_id.clone()]);
        }

        // 添加Tile Size参数
        if !options.tile_size.is_empty() && options.tile_size != "0" {
            args.extend_from_slice(&["-t".to_string(), options.tile_size.clone()]);
        }

        // 添加TTA参数
        if options.tta {
            args.push("-x".to_string());
        }

        // 添加线程数参数（如果支持）
        if !options.num_threads.is_empty() && options.num_threads != "1" {
            match options.algorithm {
                UpscaleAlgorithm::Waifu2x | UpscaleAlgorithm::RealCUGAN => {
                    args.extend_from_slice(&["-j".to_string(), options.num_threads.clone()]);
                }
                _ => {}
            }
        }

        Ok(args)
    }

    /// 检查是否已有超分缓存
    pub fn check_upscale_cache(
        &self,
        original_path: &Path,
        options: &GenericUpscaleOptions,
    ) -> Option<PathBuf> {
        let save_path = match self.get_upscale_save_path(original_path, options) {
            Ok(path) => path,
            Err(_) => return None,
        };

        if save_path.exists() {
            println!("📦 找到通用超分缓存: {}", save_path.display());
            Some(save_path)
        } else {
            None
        }
    }

    /// 清理过期的超分缓存
    pub fn cleanup_cache(&self, max_age_days: u32) -> Result<usize, String> {
        let upscale_dir = self.thumbnail_root.join("generic-upscale");
        if !upscale_dir.exists() {
            return Ok(0);
        }

        let mut removed_count = 0;
        let cutoff_time = Utc::now() - chrono::Duration::days(max_age_days as i64);

        for entry in fs::read_dir(&upscale_dir)
            .map_err(|e| format!("读取缓存目录失败: {}", e))?
        {
            let entry = entry.map_err(|e| format!("读取目录条目失败: {}", e))?;
            let path = entry.path();

            if path.is_file() {
                if let Ok(metadata) = fs::metadata(&path) {
                    if let Ok(modified) = metadata.modified() {
                        let modified_time: chrono::DateTime<Utc> = modified.into();
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
    pub fn get_cache_stats(&self) -> Result<GenericUpscaleCacheStats, String> {
        let upscale_dir = self.thumbnail_root.join("generic-upscale");
        if !upscale_dir.exists() {
            return Ok(GenericUpscaleCacheStats::default());
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

        Ok(GenericUpscaleCacheStats {
            total_files,
            total_size,
            cache_dir: upscale_dir.to_string_lossy().to_string(),
        })
    }
}

/// 通用超分缓存统计信息
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct GenericUpscaleCacheStats {
    pub total_files: usize,
    pub total_size: u64,
    pub cache_dir: String,
}