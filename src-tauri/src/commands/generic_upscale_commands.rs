//! NeoView - Generic Upscale Commands
//! 通用超分相关的 Tauri 命令

use crate::core::generic_upscaler::{GenericUpscaleOptions, GenericUpscaler, UpscaleAlgorithm};
use std::fs;
use std::sync::{Arc, Mutex};
use tauri::{command, Window};

/// 全局通用超分管理器状态
pub struct GenericUpscalerState {
    pub manager: Arc<Mutex<Option<GenericUpscaler>>>,
}

impl Default for GenericUpscalerState {
    fn default() -> Self {
        Self {
            manager: Arc::new(Mutex::new(None)),
        }
    }
}

/// 等待通用超分管理器初始化
async fn ensure_manager_ready(
    state: &tauri::State<'_, GenericUpscalerState>,
    max_wait_ms: u64,
) -> Result<(), String> {
    let mut waited = 0u64;
    let step = 50u64;

    loop {
        match state.manager.lock() {
            Ok(manager_guard) => {
                if manager_guard.is_some() {
                    return Ok(());
                }
            }
            Err(_) => return Err("无法获取通用超分管理器锁".to_string()),
        }

        if waited >= max_wait_ms {
            break;
        }

        std::thread::sleep(std::time::Duration::from_millis(step));
        waited += step;
    }

    Err("通用超分管理器未初始化".to_string())
}

/// 初始化通用超分管理器
#[command]
pub async fn init_generic_upscale_manager(
    thumbnail_path: String,
    state: tauri::State<'_, GenericUpscalerState>,
) -> Result<(), String> {
    let thumbnail_path = std::path::PathBuf::from(thumbnail_path);
    let manager = GenericUpscaler::new(thumbnail_path);

    let manager_guard = state
        .manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;
    let mut manager_guard = manager_guard;
    *manager_guard = Some(manager);

    Ok(())
}

/// 检查指定算法的超分工具是否可用
#[command]
pub async fn check_generic_upscale_availability(
    algorithm: String,
    state: tauri::State<'_, GenericUpscalerState>,
) -> Result<(), String> {
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        return Err(e);
    }

    let algorithm_enum = match algorithm.as_str() {
        "realesrgan" => UpscaleAlgorithm::RealESRGAN,
        "waifu2x" => UpscaleAlgorithm::Waifu2x,
        "realcugan" => UpscaleAlgorithm::RealCUGAN,
        _ => return Err("不支持的算法类型".to_string()),
    };

    let manager_result = {
        let manager_guard = state
            .manager
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        manager_guard.clone()
    };

    if let Some(manager) = manager_result {
        return manager.check_algorithm_availability(&algorithm_enum);
    }

    Err("通用超分管理器未初始化".to_string())
}

/// 获取可用的算法列表
#[command]
pub async fn get_available_algorithms(
    state: tauri::State<'_, GenericUpscalerState>,
) -> Result<Vec<String>, String> {
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        return Err(e);
    }

    let manager_result = {
        let manager_guard = state
            .manager
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        manager_guard.clone()
    };

    if let Some(manager) = manager_result {
        let mut available_algorithms = Vec::new();

        // 检查每种算法的可用性
        for algorithm in [
            UpscaleAlgorithm::RealESRGAN,
            UpscaleAlgorithm::Waifu2x,
            UpscaleAlgorithm::RealCUGAN,
        ] {
            if manager.check_algorithm_availability(&algorithm).is_ok() {
                let algorithm_name = match algorithm {
                    UpscaleAlgorithm::RealESRGAN => "realesrgan".to_string(),
                    UpscaleAlgorithm::Waifu2x => "waifu2x".to_string(),
                    UpscaleAlgorithm::RealCUGAN => "realcugan".to_string(),
                };
                available_algorithms.push(algorithm_name);
            }
        }

        return Ok(available_algorithms);
    }

    Err("通用超分管理器未初始化".to_string())
}

/// 扫描模型目录获取所有模型文件
#[command]
pub async fn scan_models_directory(
    state: tauri::State<'_, GenericUpscalerState>,
) -> Result<Vec<String>, String> {
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        return Err(e);
    }

    let manager_result = {
        let manager_guard = state
            .manager
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        manager_guard.clone()
    };

    if let Some(manager) = manager_result {
        let models_dir = manager.thumbnail_root.join("models");
        let mut model_files = Vec::new();

        if models_dir.exists() {
            // 扫描目录中的所有 .bin 和 .param 文件对
            if let Ok(entries) = fs::read_dir(&models_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        if let Some(stem) = path.file_stem() {
                            let stem_str = stem.to_string_lossy();
                            // 只添加 .bin 文件，并确保对应的 .param 文件存在
                            if let Some(ext) = path.extension() {
                                if ext == "bin" {
                                    let param_path = path.with_extension("param");
                                    if param_path.exists() {
                                        model_files.push(stem_str.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 去重并排序
            model_files.sort();
            model_files.dedup();

            println!("🔍 扫描到 {} 个模型", model_files.len());
            Ok(model_files)
        } else {
            Err("模型目录不存在".to_string())
        }
    } else {
        Err("通用超分管理器未初始化".to_string())
    }
}

/// 获取算法的默认模型
#[command]
pub async fn get_algorithm_default_models(algorithm: String) -> Result<Vec<String>, String> {
    let algorithm_enum = match algorithm.as_str() {
        "realcugan" => UpscaleAlgorithm::RealCUGAN,
        "esrgan" => UpscaleAlgorithm::RealESRGAN,
        "waifu2x" => UpscaleAlgorithm::Waifu2x,
        _ => return Err("不支持的算法类型".to_string()),
    };

    let default_model = algorithm_enum.get_default_model();
    let anime_model = algorithm_enum.get_anime_model();

    Ok(vec![default_model.to_string(), anime_model.to_string()])
}

/// 执行通用图片超分
#[command]
pub async fn generic_upscale_image(
    image_path: String,
    save_path: String,
    algorithm: String,
    model: String,
    gpu_id: String,
    tile_size: String,
    tta: bool,
    noise_level: String,
    num_threads: String,
    _window: Window,
    state: tauri::State<'_, GenericUpscalerState>,
) -> Result<Vec<u8>, String> {
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        return Err(e);
    }

    let algorithm_enum = match algorithm.as_str() {
        "realesrgan" => UpscaleAlgorithm::RealESRGAN,
        "waifu2x" => UpscaleAlgorithm::Waifu2x,
        "realcugan" => UpscaleAlgorithm::RealCUGAN,
        _ => return Err("不支持的算法类型".to_string()),
    };

    let manager_result = {
        let manager_guard = state
            .manager
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        manager_guard.clone()
    };

    if let Some(manager) = manager_result {
        let image_path = std::path::PathBuf::from(image_path);
        let save_path = std::path::PathBuf::from(save_path);

        let options = GenericUpscaleOptions {
            algorithm: algorithm_enum,
            model,
            gpu_id,
            tile_size,
            tta,
            noise_level,
            num_threads,
        };

        // 检查是否已有缓存
        if let Some(cached_path) = manager.check_upscale_cache(&image_path, &options) {
            println!("📦 使用通用超分缓存: {}", cached_path.display());
            // 直接返回缓存文件的二进制数据
            let image_data =
                std::fs::read(&cached_path).map_err(|e| format!("读取缓存文件失败: {}", e))?;
            return Ok(image_data);
        }

        // 执行超分
        let result_path = manager
            .upscale_image(
                &image_path,
                &save_path,
                options,
                None, // 暂时不使用 window 参数
            )
            .await?;

        // 直接返回超分后的文件的二进制数据
        let image_data =
            std::fs::read(&result_path).map_err(|e| format!("读取超分文件失败: {}", e))?;

        Ok(image_data)
    } else {
        Err("通用超分管理器未初始化".to_string())
    }
}

/// 获取通用超分保存路径
#[command]
pub async fn get_generic_upscale_save_path(
    image_path: String,
    algorithm: String,
    model: String,
    gpu_id: String,
    tile_size: String,
    tta: bool,
    noise_level: String,
    num_threads: String,
    state: tauri::State<'_, GenericUpscalerState>,
) -> Result<String, String> {
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        return Err(e);
    }

    let algorithm_enum = match algorithm.as_str() {
        "realesrgan" => UpscaleAlgorithm::RealESRGAN,
        "waifu2x" => UpscaleAlgorithm::Waifu2x,
        "realcugan" => UpscaleAlgorithm::RealCUGAN,
        _ => return Err("不支持的算法类型".to_string()),
    };

    let manager_result = {
        let manager_guard = state
            .manager
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        manager_guard.clone()
    };

    if let Some(manager) = manager_result {
        let image_path = std::path::PathBuf::from(image_path);

        let options = GenericUpscaleOptions {
            algorithm: algorithm_enum,
            model,
            gpu_id,
            tile_size,
            tta,
            noise_level,
            num_threads,
        };

        let save_path = manager.get_upscale_save_path(&image_path, &options)?;
        return Ok(save_path.to_string_lossy().to_string());
    }

    Err("通用超分管理器未初始化".to_string())
}

/// 获取通用超分缓存统计信息
#[command]
pub async fn get_generic_upscale_cache_stats(
    state: tauri::State<'_, GenericUpscalerState>,
) -> Result<crate::core::generic_upscaler::GenericUpscaleCacheStats, String> {
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        return Err(e);
    }

    let manager_result = {
        let manager_guard = state
            .manager
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        manager_guard.clone()
    };

    if let Some(manager) = manager_result {
        return manager.get_cache_stats();
    }

    Err("通用超分管理器未初始化".to_string())
}

/// 测试所有可用的超分算法
#[command]
pub async fn test_all_algorithms(
    state: tauri::State<'_, GenericUpscalerState>,
) -> Result<Vec<String>, String> {
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        return Err(e);
    }

    let manager_result = {
        let manager_guard = state
            .manager
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        manager_guard.clone()
    };

    if let Some(manager) = manager_result {
        let mut results = Vec::new();

        // 获取测试图片目录
        let test_img_dir = manager.thumbnail_root.join("models").join("testimg");
        if !test_img_dir.exists() {
            return Err("测试图片目录不存在: models/testimg".to_string());
        }

        // 查找测试图片
        let mut test_images = Vec::new();
        if let Ok(entries) = fs::read_dir(&test_img_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(ext) = path.extension() {
                        if matches!(
                            ext.to_str(),
                            Some("jpg") | Some("jpeg") | Some("png") | Some("webp")
                        ) {
                            test_images.push(path);
                        }
                    }
                }
            }
        }

        if test_images.is_empty() {
            return Err("测试图片目录中没有找到图片文件".to_string());
        }

        let test_image = &test_images[0]; // 使用第一张图片进行测试

        // 测试每种算法
        for algorithm in [
            UpscaleAlgorithm::RealESRGAN,
            UpscaleAlgorithm::Waifu2x,
            UpscaleAlgorithm::RealCUGAN,
        ] {
            println!("🧪 测试算法: {:?}", algorithm);

            // 检查算法可用性
            match manager.check_algorithm_availability(&algorithm) {
                Ok(_) => {
                    println!("  ✅ 算法可用");

                    // 获取默认模型
                    let model = algorithm.get_default_model();
                    println!("  🎯 使用模型: {}", model);

                    // 创建测试选项
                    let options = GenericUpscaleOptions {
                        algorithm: algorithm.clone(),
                        model: model.to_string(),
                        gpu_id: "0".to_string(),
                        tile_size: "0".to_string(),
                        tta: false,
                        noise_level: "1".to_string(),
                        num_threads: "1".to_string(),
                    };

                    // 生成保存路径
                    let save_path = match manager.get_upscale_save_path(test_image, &options) {
                        Ok(path) => path,
                        Err(e) => {
                            let error_msg = format!("生成保存路径失败: {}", e);
                            println!("  ❌ {}", error_msg);
                            results.push(error_msg);
                            continue;
                        }
                    };

                    // 执行超分测试
                    match manager
                        .upscale_image(test_image, &save_path, options, None)
                        .await
                    {
                        Ok(output_path) => {
                            let success_msg = format!(
                                "✅ {:?} 测试成功: {} -> {}",
                                algorithm,
                                test_image
                                    .file_name()
                                    .unwrap_or_default()
                                    .to_str()
                                    .unwrap_or("unknown"),
                                output_path
                            );
                            println!("  {}", success_msg);
                            results.push(success_msg);
                        }
                        Err(e) => {
                            let error_msg = format!("❌ {:?} 测试失败: {}", algorithm, e);
                            println!("  {}", error_msg);
                            results.push(error_msg);
                        }
                    }
                }
                Err(e) => {
                    let error_msg = format!("❌ {:?} 不可用: {}", algorithm, e);
                    println!("  {}", error_msg);
                    results.push(error_msg);
                }
            }

            println!(""); // 空行分隔
        }

        Ok(results)
    } else {
        Err("通用超分管理器未初始化".to_string())
    }
}

/// 测试指定算法的所有模型
#[command]
pub async fn test_algorithm_models(
    algorithm: String,
    state: tauri::State<'_, GenericUpscalerState>,
) -> Result<Vec<String>, String> {
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        return Err(e);
    }

    let algorithm_enum = match algorithm.as_str() {
        "realesrgan" => UpscaleAlgorithm::RealESRGAN,
        "waifu2x" => UpscaleAlgorithm::Waifu2x,
        "realcugan" => UpscaleAlgorithm::RealCUGAN,
        _ => return Err("不支持的算法类型".to_string()),
    };

    let manager_result = {
        let manager_guard = state
            .manager
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        manager_guard.clone()
    };

    if let Some(manager) = manager_result {
        let mut results = Vec::new();

        // 获取测试图片目录
        let test_img_dir = manager.thumbnail_root.join("models").join("testimg");
        if !test_img_dir.exists() {
            return Err("测试图片目录不存在: models/testimg".to_string());
        }

        // 查找测试图片
        let mut test_images = Vec::new();
        if let Ok(entries) = fs::read_dir(&test_img_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(ext) = path.extension() {
                        if matches!(
                            ext.to_str(),
                            Some("jpg") | Some("jpeg") | Some("png") | Some("webp")
                        ) {
                            test_images.push(path);
                        }
                    }
                }
            }
        }

        if test_images.is_empty() {
            return Err("测试图片目录中没有找到图片文件".to_string());
        }

        let test_image = &test_images[0]; // 使用第一张图片进行测试

        println!("🧪 测试 {:?} 算法的所有模型", algorithm_enum);

        // 检查算法可用性
        manager.check_algorithm_availability(&algorithm_enum)?;

        // 测试默认模型和动漫模型
        let models_to_test = vec![
            algorithm_enum.get_default_model(),
            algorithm_enum.get_anime_model(),
        ];

        for model in models_to_test {
            println!("  🎯 测试模型: {}", model);

            // 创建测试选项
            let options = GenericUpscaleOptions {
                algorithm: algorithm_enum.clone(),
                model: model.to_string(),
                gpu_id: "0".to_string(),
                tile_size: "0".to_string(),
                tta: false,
                noise_level: "1".to_string(),
                num_threads: "1".to_string(),
            };

            // 生成保存路径
            let save_path = match manager.get_upscale_save_path(test_image, &options) {
                Ok(path) => path,
                Err(e) => {
                    let error_msg = format!("生成保存路径失败: {}", e);
                    println!("    ❌ {}", error_msg);
                    results.push(error_msg);
                    continue;
                }
            };

            // 执行超分测试
            match manager
                .upscale_image(test_image, &save_path, options, None)
                .await
            {
                Ok(output_path) => {
                    let success_msg = format!("✅ {} 模型测试成功: {}", model, output_path);
                    println!("    {}", success_msg);
                    results.push(success_msg);
                }
                Err(e) => {
                    let error_msg = format!("❌ {} 模型测试失败: {}", model, e);
                    println!("    {}", error_msg);
                    results.push(error_msg);
                }
            }
        }

        Ok(results)
    } else {
        Err("通用超分管理器未初始化".to_string())
    }
}

/// 调试信息：检查模型目录和文件
#[command]
pub async fn debug_models_info(
    state: tauri::State<'_, GenericUpscalerState>,
) -> Result<String, String> {
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        return Err(e);
    }

    let manager_result = {
        let manager_guard = state
            .manager
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        manager_guard.clone()
    };

    if let Some(manager) = manager_result {
        let mut info = String::new();

        // 检查缩略图根目录
        info.push_str(&format!(
            "缩略图根目录: {}\n",
            manager.thumbnail_root.display()
        ));

        // 检查模型目录
        let models_dir = manager.thumbnail_root.join("models");
        info.push_str(&format!("模型目录: {}\n", models_dir.display()));

        if models_dir.exists() {
            info.push_str("模型目录存在\n");

            // 列出所有模型文件
            if let Ok(entries) = fs::read_dir(&models_dir) {
                info.push_str("模型文件:\n");
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        if let Some(name) = path.file_name() {
                            info.push_str(&format!("  - {}\n", name.to_string_lossy()));
                        }
                    }
                }
            }

            // 检查测试图片目录
            let test_img_dir = models_dir.join("testimg");
            info.push_str(&format!("测试图片目录: {}\n", test_img_dir.display()));

            if test_img_dir.exists() {
                info.push_str("测试图片目录存在\n");
                if let Ok(entries) = fs::read_dir(&test_img_dir) {
                    info.push_str("测试图片:\n");
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() {
                            if let Some(name) = path.file_name() {
                                info.push_str(&format!("  - {}\n", name.to_string_lossy()));
                            }
                        }
                    }
                }
            } else {
                info.push_str("测试图片目录不存在\n");
            }
        } else {
            info.push_str("模型目录不存在\n");
        }

        // 检查每种算法的可用性
        info.push_str("\n算法可用性:\n");
        for algorithm in [
            UpscaleAlgorithm::RealESRGAN,
            UpscaleAlgorithm::Waifu2x,
            UpscaleAlgorithm::RealCUGAN,
        ] {
            match manager.check_algorithm_availability(&algorithm) {
                Ok(_) => {
                    info.push_str(&format!("  ✅ {:?}: 可用\n", algorithm));
                }
                Err(e) => {
                    info.push_str(&format!("  ❌ {:?}: {}\n", algorithm, e));
                }
            }
        }

        Ok(info)
    } else {
        Err("通用超分管理器未初始化".to_string())
    }
}

/// 清理通用超分缓存
#[command]
pub async fn cleanup_generic_upscale_cache(
    max_age_days: Option<u32>,
    state: tauri::State<'_, GenericUpscalerState>,
) -> Result<usize, String> {
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        return Err(e);
    }

    let max_age_days = max_age_days.unwrap_or(30); // 默认30天

    let manager_result = {
        let manager_guard = state
            .manager
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        manager_guard.clone()
    };

    if let Some(manager) = manager_result {
        return manager.cleanup_cache(max_age_days);
    }

    Err("通用超分管理器未初始化".to_string())
}
