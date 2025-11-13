//! NeoView - Image Upscaling Module
//! 图片超分辨率处理模块

use std::path::{Path, PathBuf};
use std::process::Command;
use std::fs;
use serde::{Deserialize, Serialize};
use tauri::Window;
use chrono::Utc;

/// 超分高级选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpscaleOptions {
    /// GPU ID
    pub gpu_id: String,
    /// Tile Size (0 = auto)
    pub tile_size: String,
    /// TTA (Test Time Augmentation)
    pub tta: bool,
}

impl Default for UpscaleOptions {
    fn default() -> Self {
        Self {
            gpu_id: "0".to_string(),
            tile_size: "0".to_string(),
            tta: false,
        }
    }
}

/// 超分管理器
#[derive(Clone)]
pub struct UpscaleManager {
    /// 缩略图根目录（用于保存超分图片）
    pub thumbnail_root: PathBuf,
}

impl UpscaleManager {
    /// 创建新的超分管理器
    pub fn new(thumbnail_root: PathBuf) -> Self {
        // 创建 neosr 目录
        let neosr_dir = thumbnail_root.join("neosr");
        if let Err(e) = fs::create_dir_all(&neosr_dir) {
            eprintln!("创建 neosr 目录失败: {}", e);
        }

        Self { thumbnail_root }
    }

    /// 检查超分工具是否可用（检查 Python 和 sr_vulkan）
    pub fn check_availability(&self) -> Result<(), String> {
        // 检查 Python 是否可用
        let python_check = Command::new("python")
            .arg("--version")
            .output()
            .map_err(|e| format!("Python 不可用: {}", e))?;

        if !python_check.status.success() {
            return Err("Python 未安装或不可用".to_string());
        }

        // 检查 sr_vulkan 是否可用
        let sr_check = Command::new("python")
            .arg("-c")
            .arg("from sr_vulkan import sr_vulkan; print('sr_vulkan available')")
            .output()
            .map_err(|e| format!("检查 sr_vulkan 失败: {}", e))?;

        if !sr_check.status.success() {
            return Err("sr_vulkan 未安装。请运行: pip install sr-vulkan".to_string());
        }

        println!("✅ 超分工具可用 (Python + sr_vulkan)");
        Ok(())
    }

    /// 获取超分命令路径
    fn get_upscale_command(&self) -> String {
        // 直接使用系统PATH中的realesrgan-ncnn-vulkan命令
        "realesrgan-ncnn-vulkan".to_string()
    }

    /// 获取模型路径
    fn get_models_path(&self) -> String {
        // 优先使用项目内的模型目录
        let project_models_dir = self.thumbnail_root.join("models");
        if project_models_dir.exists() {
            return project_models_dir.to_string_lossy().to_string();
        }
        
        // 使用realesrgan-ncnn-vulkan默认的模型路径
        // 通常程序会自动在安装目录下查找models文件夹
        "".to_string() // 空字符串让程序使用默认路径
    }

    /// 获取模型名称
    fn get_model_name<'a>(&self, model: &'a str) -> &'a str {
        match model {
            "digital" => "realesrgan-x4plus-anime",
            "general" => "realesrgan-x4plus",
            // 支持自定义模型，直接返回模型名称
            _ => model,
        }
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
        model: &str,
        factor: &str,
        options: &UpscaleOptions,
    ) -> Result<String, String> {
        // 计算原文件MD5
        let md5 = self.calculate_file_md5(original_path)?;
        
        // 生成参数字符串
        let params = format!("{}_{}_{}_{}", model, factor, options.gpu_id, options.tile_size);
        if options.tta {
            let params_tta = format!("{}_tta", params);
            return Ok(format!("{}_sr{}.webp", md5, params_tta));
        }
        
        Ok(format!("{}_sr{}.webp", md5, params))
    }

    /// 获取超分保存路径
    pub fn get_upscale_save_path(
        &self,
        original_path: &Path,
        model: &str,
        factor: &str,
        options: &UpscaleOptions,
    ) -> Result<PathBuf, String> {
        let filename = self.generate_upscale_filename(original_path, model, factor, options)?;
        let neosr_dir = self.thumbnail_root.join("neosr");
        Ok(neosr_dir.join(filename))
    }

    /// 执行超分处理（使用 sr_vulkan Python 库）
    pub async fn upscale_image(
        &self,
        image_path: &Path,
        save_path: &Path,
        model: &str,
        factor: &str,
        options: UpscaleOptions,
        _window: Option<Window>,
    ) -> Result<String, String> {
        println!("🚀 开始超分处理: {} -> {}", image_path.display(), save_path.display());

        // 检查输入文件是否存在
        if !image_path.exists() {
            return Err(format!("输入文件不存在: {}", image_path.display()));
        }

        // 确保输出目录存在
        if let Some(parent) = save_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建输出目录失败: {}", e))?;
        }

        // 转换模型名称为 sr_vulkan 格式
        let model_name = self.get_sr_vulkan_model_name(model);
        
        // 解析缩放因子
        let scale: f64 = factor.parse()
            .map_err(|_| format!("无效的缩放因子: {}", factor))?;

        // 解析 tile size
        let tile_size: i32 = options.tile_size.parse()
            .unwrap_or(400);

        // 构建 Python 命令
        let python_script = self.get_upscale_script_path();
        
        let mut args = vec![
            python_script.to_string_lossy().to_string(),
            image_path.to_string_lossy().to_string(),
            save_path.to_string_lossy().to_string(),
            "--model".to_string(),
            model_name.to_string(),
            "--scale".to_string(),
            scale.to_string(),
            "--tile-size".to_string(),
            tile_size.to_string(),
            "--format".to_string(),
            "webp".to_string(),
            "--gpu-id".to_string(),
            options.gpu_id.clone(),
        ];

        // 添加TTA参数
        if options.tta {
            args.push("--tta".to_string());
        }

        println!("执行命令: python {}", args.join(" "));

        // 执行 Python 脚本
        let output = Command::new("python")
            .args(&args)
            .output()
            .map_err(|e| format!("启动超分进程失败: {}", e))?;

        // 检查执行结果
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            println!("STDOUT: {}", stdout);
            println!("STDERR: {}", stderr);
            return Err(format!("超分进程失败: {}", stderr));
        }

        // 检查输出文件是否存在
        if !save_path.exists() {
            return Err("超分输出文件不存在".to_string());
        }

        println!("✅ 超分完成: {}", save_path.display());
        Ok(save_path.to_string_lossy().to_string())
    }

    /// 获取超分脚本路径
    fn get_upscale_script_path(&self) -> PathBuf {
        // 优先使用项目内的脚本目录
        let project_script_dir = self.thumbnail_root.join("scripts");
        if project_script_dir.exists() {
            return project_script_dir.join("upscale_service.py");
        }
        
        // 使用默认的脚本路径
        // 通常程序会自动在安装目录下查找脚本文件
        PathBuf::from("upscale_service.py")
    }

    /// 转换模型名称为 sr_vulkan 格式
    fn get_sr_vulkan_model_name(&self, model: &str) -> String {
        match model {
            // 数字艺术/动漫
            "digital" | "anime" => "REALESRGAN_X4PLUSANIME_UP4X".to_string(),
            // 通用
            "general" => "REALESRGAN_X4PLUS_UP4X".to_string(),
            // Waifu2x 模型
            "waifu2x_cunet" => "WAIFU2X_CUNET_UP2X".to_string(),
            "waifu2x_anime" => "WAIFU2X_ANIME_UP2X".to_string(),
            "waifu2x_photo" => "WAIFU2X_PHOTO_UP2X".to_string(),
            // RealCUGAN 模型
            "realcugan_pro" => "REALCUGAN_PRO_UP2X".to_string(),
            "realcugan_se" => "REALCUGAN_SE_UP2X".to_string(),
            // 直接使用提供的模型名称
            _ => model.to_uppercase(),
        }
    }

    /// 检查是否已有超分缓存
    pub fn check_upscale_cache(
        &self,
        original_path: &Path,
        model: &str,
        factor: &str,
        options: &UpscaleOptions,
    ) -> Option<PathBuf> {
        let save_path = match self.get_upscale_save_path(original_path, model, factor, options) {
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
        let neosr_dir = self.thumbnail_root.join("neosr");
        if !neosr_dir.exists() {
            return Ok(0);
        }

        let mut removed_count = 0;
        let cutoff_time = Utc::now() - chrono::Duration::days(max_age_days as i64);

        for entry in fs::read_dir(&neosr_dir)
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
    pub fn get_cache_stats(&self) -> Result<UpscaleCacheStats, String> {
        let neosr_dir = self.thumbnail_root.join("neosr");
        if !neosr_dir.exists() {
            return Ok(UpscaleCacheStats::default());
        }

        let mut total_files = 0;
        let mut total_size = 0;

        for entry in fs::read_dir(&neosr_dir)
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
            cache_dir: neosr_dir.to_string_lossy().to_string(),
        })
    }
}

/// 超分缓存统计信息
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct UpscaleCacheStats {
    pub total_files: usize,
    pub total_size: u64,
    pub cache_dir: String,
}