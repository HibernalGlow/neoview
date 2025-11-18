//! NeoView - Image Upscaling Module
//! 图片超分辨率处理模块

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Window;

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

    /// 检查超分工具是否可用
    pub fn check_availability(&self) -> Result<(), String> {
        let command = self.get_upscale_command();

        let output = Command::new(&command)
            .arg("-v")
            .output()
            .map_err(|e| format!("执行超分命令失败: {}", e))?;

        if !output.status.success() {
            return Err("超分工具未安装或不可用".to_string());
        }

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

        let data = fs::read(file_path).map_err(|e| format!("读取文件失败: {}", e))?;

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
        let params = format!(
            "{}_{}_{}_{}",
            model, factor, options.gpu_id, options.tile_size
        );
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

    /// 执行超分处理
    pub async fn upscale_image(
        &self,
        image_path: &Path,
        save_path: &Path,
        model: &str,
        factor: &str,
        options: UpscaleOptions,
        window: Option<Window>,
    ) -> Result<String, String> {
        println!(
            "🚀 开始超分处理: {} -> {}",
            image_path.display(),
            save_path.display()
        );

        // 检查输入文件是否存在
        if !image_path.exists() {
            return Err(format!("输入文件不存在: {}", image_path.display()));
        }

        // 确保输出目录存在
        if let Some(parent) = save_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建输出目录失败: {}", e))?;
        }

        // 构建命令参数
        let command = self.get_upscale_command();
        let models_path = self.get_models_path();
        let model_name = self.get_model_name(model);

        let mut args = vec![
            "-i",
            image_path.to_str().unwrap(),
            "-o",
            save_path.to_str().unwrap(),
            "-n",
            model_name,
            "-s",
            factor,
            "-f",
            "webp", // 指定输出格式为 WebP
        ];

        // 只有当模型路径不为空时才添加-m参数
        if !models_path.is_empty() {
            args.insert(2, "-m");
            args.insert(3, &models_path);
        }

        // 添加GPU参数
        if !options.gpu_id.is_empty() && options.gpu_id != "0" {
            args.extend_from_slice(&["-g", &options.gpu_id]);
        }

        // 添加Tile Size参数
        if !options.tile_size.is_empty() && options.tile_size != "0" {
            args.extend_from_slice(&["-t", &options.tile_size]);
        }

        // 添加TTA参数
        if options.tta {
            args.push("-x");
        }

        println!("执行命令: {} {}", command, args.join(" "));

        // 执行命令
        let mut child = Command::new(&command)
            .args(&args)
            .spawn()
            .map_err(|e| format!("启动超分进程失败: {}", e))?;

        // 读取输出并发送进度
        if let Some(_window) = window {
            // 简化处理：直接执行命令并等待完成
            // TODO: 在 Tauri 2.x 中需要使用新的方式来获取进程输出
            println!("执行超分命令并等待完成...");
        } else {
            // 等待进程完成
            let status = child
                .wait()
                .map_err(|e| format!("等待超分进程失败: {}", e))?;

            if !status.success() {
                return Err("超分进程失败".to_string());
            }
        }

        // 检查输出文件是否存在
        if !save_path.exists() {
            return Err("超分输出文件不存在".to_string());
        }

        println!("✅ 超分完成: {}", save_path.display());
        Ok(save_path.to_string_lossy().to_string())
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

        for entry in fs::read_dir(&neosr_dir).map_err(|e| format!("读取缓存目录失败: {}", e))?
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

        for entry in fs::read_dir(&neosr_dir).map_err(|e| format!("读取缓存目录失败: {}", e))?
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
