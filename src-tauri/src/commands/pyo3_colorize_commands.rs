//! NeoView - PyO3 Colorize Commands
//! 基于 PyO3 的上色相关 Tauri 命令

use crate::core::pyo3_colorizer::{ColorizeCacheStats, ColorizeModel, PyO3Colorizer};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::command;

/// 全局 PyO3 上色管理器状态
#[derive(Clone)]
pub struct PyO3ColorizerState {
    pub manager: Arc<Mutex<Option<PyO3Colorizer>>>,
}

impl Default for PyO3ColorizerState {
    fn default() -> Self {
        Self {
            manager: Arc::new(Mutex::new(None)),
        }
    }
}

/// 等待管理器初始化
async fn ensure_colorizer_ready(
    state: &tauri::State<'_, PyO3ColorizerState>,
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
            Err(_) => return Err("无法获取 PyO3 上色管理器锁".to_string()),
        }

        if waited >= max_wait_ms {
            break;
        }

        std::thread::sleep(std::time::Duration::from_millis(step));
        waited += step;
    }

    Err("PyO3 上色管理器未初始化".to_string())
}

/// 初始化 PyO3 上色管理器
#[command]
pub async fn init_pyo3_colorizer(
    model_dir: String,
    cache_dir: String,
    state: tauri::State<'_, PyO3ColorizerState>,
) -> Result<(), String> {
    let model_dir = PathBuf::from(model_dir);

    // 使用前端传入的目录作为根目录，在其下创建 pyo3-colorize 子目录
    let base_cache_dir = PathBuf::from(cache_dir);
    let cache_dir = base_cache_dir.join("pyo3-colorize");

    let manager = PyO3Colorizer::new(model_dir, cache_dir)?;

    let mut manager_guard = state
        .manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    *manager_guard = Some(manager);

    println!("✅ PyO3 上色管理器初始化完成");
    Ok(())
}

/// 检查 PyO3 上色是否可用 (PyTorch 是否安装)
#[command]
pub async fn check_pyo3_colorizer_availability(
    state: tauri::State<'_, PyO3ColorizerState>,
) -> Result<bool, String> {
    if let Err(e) = ensure_colorizer_ready(&state, 5000).await {
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
        return manager.check_availability();
    }

    Err("PyO3 上色管理器未初始化".to_string())
}

/// 检查上色模型文件是否存在
#[command]
pub async fn check_colorize_models_exist(
    state: tauri::State<'_, PyO3ColorizerState>,
) -> Result<bool, String> {
    if let Err(e) = ensure_colorizer_ready(&state, 5000).await {
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
        return manager.check_models_exist();
    }

    Err("PyO3 上色管理器未初始化".to_string())
}

/// 加载上色模型
#[command]
pub async fn load_colorize_model(
    device: Option<String>,
    state: tauri::State<'_, PyO3ColorizerState>,
) -> Result<(), String> {
    if let Err(e) = ensure_colorizer_ready(&state, 5000).await {
        return Err(e);
    }

    let device = device.unwrap_or_else(|| "cuda".to_string());

    let manager_result = {
        let manager_guard = state
            .manager
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        manager_guard.clone()
    };

    if let Some(manager) = manager_result {
        return manager.load_model(&device);
    }

    Err("PyO3 上色管理器未初始化".to_string())
}

/// 卸载上色模型
#[command]
pub async fn unload_colorize_model(
    state: tauri::State<'_, PyO3ColorizerState>,
) -> Result<(), String> {
    if let Err(e) = ensure_colorizer_ready(&state, 5000).await {
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
        return manager.unload_model();
    }

    Err("PyO3 上色管理器未初始化".to_string())
}

/// 检查上色模型是否已加载
#[command]
pub async fn is_colorize_model_loaded(
    state: tauri::State<'_, PyO3ColorizerState>,
) -> Result<bool, String> {
    if let Err(e) = ensure_colorizer_ready(&state, 5000).await {
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
        return Ok(manager.is_model_loaded());
    }

    Err("PyO3 上色管理器未初始化".to_string())
}

/// 执行 PyO3 上色 (内存流版本)
#[command]
pub async fn pyo3_colorize_image_memory(
    image_data: Vec<u8>,
    colorization_size: i32,
    denoise_sigma: i32,
    state: tauri::State<'_, PyO3ColorizerState>,
) -> Result<Vec<u8>, String> {
    println!("🔍 Rust 收到上色参数:");
    println!("  image_data.len(): {}", image_data.len());
    println!("  colorization_size: {}", colorization_size);
    println!("  denoise_sigma: {}", denoise_sigma);

    if let Err(e) = ensure_colorizer_ready(&state, 5000).await {
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
        let model = ColorizeModel {
            model_name: "manga_colorization_v2".to_string(),
            colorization_size,
            denoise_sigma,
        };

        return manager.colorize_image_memory(&image_data, &model);
    }

    Err("PyO3 上色管理器未初始化".to_string())
}

/// 保存上色结果到缓存
#[command]
pub async fn pyo3_save_colorize_cache(
    image_hash: String,
    colorization_size: i32,
    denoise_sigma: i32,
    result_data: Vec<u8>,
    state: tauri::State<'_, PyO3ColorizerState>,
) -> Result<String, String> {
    if let Err(e) = ensure_colorizer_ready(&state, 5000).await {
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
        let model = ColorizeModel {
            model_name: "manga_colorization_v2".to_string(),
            colorization_size,
            denoise_sigma,
        };

        let cache_path = manager.save_colorize_cache(&image_hash, &model, &result_data)?;
        return Ok(cache_path.to_string_lossy().to_string());
    }

    Err("PyO3 上色管理器未初始化".to_string())
}

/// 检查上色缓存是否存在
#[command]
pub async fn check_pyo3_colorize_cache(
    image_hash: String,
    colorization_size: i32,
    denoise_sigma: i32,
    state: tauri::State<'_, PyO3ColorizerState>,
) -> Result<Option<String>, String> {
    if let Err(e) = ensure_colorizer_ready(&state, 5000).await {
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
        let model = ColorizeModel {
            model_name: "manga_colorization_v2".to_string(),
            colorization_size,
            denoise_sigma,
        };

        if let Some(cache_path) = manager.check_cache(&image_hash, &model) {
            return Ok(Some(cache_path.to_string_lossy().to_string()));
        }

        return Ok(None);
    }

    Err("PyO3 上色管理器未初始化".to_string())
}

/// 读取上色缓存文件
#[command]
pub async fn read_colorize_cache_file(cache_path: String) -> Result<Vec<u8>, String> {
    use std::fs;

    match fs::read(&cache_path) {
        Ok(data) => Ok(data),
        Err(e) => Err(format!("读取上色缓存文件失败: {}", e)),
    }
}

/// 获取上色缓存统计信息
#[command]
pub async fn get_pyo3_colorize_cache_stats(
    state: tauri::State<'_, PyO3ColorizerState>,
) -> Result<ColorizeCacheStats, String> {
    if let Err(e) = ensure_colorizer_ready(&state, 5000).await {
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

    Err("PyO3 上色管理器未初始化".to_string())
}

/// 清理上色缓存
#[command]
pub async fn cleanup_pyo3_colorize_cache(
    max_age_days: Option<u32>,
    state: tauri::State<'_, PyO3ColorizerState>,
) -> Result<usize, String> {
    if let Err(e) = ensure_colorizer_ready(&state, 5000).await {
        return Err(e);
    }

    let max_age_days = max_age_days.unwrap_or(30);

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

    Err("PyO3 上色管理器未初始化".to_string())
}

/// 上色并超分组合处理
/// 先上色，然后可选择是否超分
#[command]
pub async fn pyo3_colorize_and_upscale(
    image_data: Vec<u8>,
    colorization_size: i32,
    denoise_sigma: i32,
    enable_upscale: bool,
    upscale_model_name: Option<String>,
    upscale_scale: Option<i32>,
    upscale_tile_size: Option<i32>,
    upscale_noise_level: Option<i32>,
    colorize_state: tauri::State<'_, PyO3ColorizerState>,
    upscale_state: tauri::State<'_, crate::commands::pyo3_upscale_commands::PyO3UpscalerState>,
) -> Result<Vec<u8>, String> {
    println!("🎨 开始上色+超分组合处理");
    println!("  enable_upscale: {}", enable_upscale);

    // Step 1: 上色
    let colorized_data = pyo3_colorize_image_memory(
        image_data,
        colorization_size,
        denoise_sigma,
        colorize_state,
    )
    .await?;

    println!("✅ 上色完成，输出大小: {} bytes", colorized_data.len());

    // Step 2: 如果启用超分，进行超分处理
    if enable_upscale {
        let model_name = upscale_model_name.unwrap_or_else(|| "MODEL_WAIFU2X_CUNET_UP2X".to_string());
        let scale = upscale_scale.unwrap_or(2);
        let tile_size = upscale_tile_size.unwrap_or(64);
        let noise_level = upscale_noise_level.unwrap_or(0);

        println!("🚀 开始超分处理");
        println!("  model: {}", model_name);
        println!("  scale: {}x", scale);

        let upscaled_data = crate::commands::pyo3_upscale_commands::pyo3_upscale_image_memory(
            colorized_data,
            model_name,
            scale,
            tile_size,
            noise_level,
            120.0,
            0,
            0,
            None,
            upscale_state,
        )
        .await?;

        println!("✅ 超分完成，最终输出大小: {} bytes", upscaled_data.len());
        return Ok(upscaled_data);
    }

    Ok(colorized_data)
}
