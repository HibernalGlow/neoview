//! NeoView - PyO3 Upscale Commands
//! 基于 PyO3 的超分相关 Tauri 命令

use crate::core::pyo3_upscaler::{CacheStats, PyO3Upscaler, UpscaleModel};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::command;

/// 全局 PyO3 超分管理器状态
#[derive(Clone)]
pub struct PyO3UpscalerState {
    pub manager: Arc<Mutex<Option<PyO3Upscaler>>>,
}

impl Default for PyO3UpscalerState {
    fn default() -> Self {
        Self {
            manager: Arc::new(Mutex::new(None)),
        }
    }
}

/// 等待管理器初始化
async fn ensure_manager_ready(
    state: &tauri::State<'_, PyO3UpscalerState>,
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
            Err(_) => return Err("无法获取 PyO3 超分管理器锁".to_string()),
        }

        if waited >= max_wait_ms {
            break;
        }

        std::thread::sleep(std::time::Duration::from_millis(step));
        waited += step;
    }

    Err("PyO3 超分管理器未初始化".to_string())
}

/// 初始化 PyO3 超分管理器
#[command]
pub async fn init_pyo3_upscaler(
    python_module_path: String,
    cache_dir: String,
    state: tauri::State<'_, PyO3UpscalerState>,
) -> Result<(), String> {
    let python_module_path = PathBuf::from(python_module_path);
    let cache_dir = PathBuf::from(cache_dir);

    let manager = PyO3Upscaler::new(python_module_path, cache_dir)?;

    // 初始化 Python 模块
    println!("🔍 开始初始化 Python 模块...");
    manager.initialize()?;
    println!("✅ Python 模块初始化完成");

    let mut manager_guard = state
        .manager
        .lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;

    *manager_guard = Some(manager);

    Ok(())
}

/// 检查 PyO3 超分是否可用
#[command]
pub async fn check_pyo3_upscaler_availability(
    state: tauri::State<'_, PyO3UpscalerState>,
) -> Result<bool, String> {
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
        return manager.check_availability();
    }

    Err("PyO3 超分管理器未初始化".to_string())
}

/// 获取可用的模型列表
#[command]
pub async fn get_pyo3_available_models(
    state: tauri::State<'_, PyO3UpscalerState>,
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
        return manager.get_available_models();
    }

    Err("PyO3 超分管理器未初始化".to_string())
}

/// 根据模型名称获取模型 ID
#[command]
pub async fn get_pyo3_model_id(
    model_name: String,
    state: tauri::State<'_, PyO3UpscalerState>,
) -> Result<i32, String> {
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
        return manager.get_model_id(&model_name);
    }

    Err("PyO3 超分管理器未初始化".to_string())
}

/// 保存超分结果到缓存
#[command]
pub async fn pyo3_save_upscale_cache(
    image_hash: String,
    model_name: String,
    scale: i32,
    tile_size: i32,
    noise_level: i32,
    result_data: Vec<u8>,
    state: tauri::State<'_, PyO3UpscalerState>,
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
        // 获取模型 ID
        let model_id = manager.get_model_id(&model_name)?;

        let model = UpscaleModel {
            model_id,
            model_name,
            scale,
            tile_size,
            noise_level,
        };

        // 保存到缓存
        let cache_path = manager.save_upscale_cache(&image_hash, &model, &result_data)?;
        Ok(cache_path.to_string_lossy().to_string())
    } else {
        Err("PyO3 超分管理器未初始化".to_string())
    }
}

/// 执行 PyO3 超分 (内存流版本)
#[command]
pub async fn pyo3_upscale_image_memory(
    image_data: Vec<u8>,
    model_name: String,
    scale: i32,
    tile_size: i32,
    noise_level: i32,
    timeout: f64,
    width: i32,
    height: i32,
    state: tauri::State<'_, PyO3UpscalerState>,
) -> Result<Vec<u8>, String> {
    println!("🔍 Rust 收到参数:");
    println!("  image_data.len(): {}", image_data.len());
    println!("  model_name: {}", model_name);
    println!("  scale: {}", scale);
    println!("  tile_size: {}", tile_size);
    println!("  noise_level: {}", noise_level);
    println!("  timeout: {}", timeout);
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
        // 获取模型 ID
        let model_id = manager.get_model_id(&model_name)?;

        let model = UpscaleModel {
            model_id,
            model_name,
            scale,
            tile_size,
            noise_level,
        };

        // 直接使用内存数据进行超分
        let result =
            manager.upscale_image_memory(&image_data, &model, timeout, width, height, None)?;
        Ok(result)
    } else {
        Err("PyO3 超分管理器未初始化".to_string())
    }
}

/// 执行 PyO3 超分 (文件路径版本，保持兼容性)
#[command]
pub async fn pyo3_upscale_image(
    image_path: String,
    model_name: String,
    scale: i32,
    tile_size: i32,
    noise_level: i32,
    timeout: f64,
    state: tauri::State<'_, PyO3UpscalerState>,
) -> Result<Vec<u8>, String> {
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
        let image_path = PathBuf::from(image_path);

        // 获取模型 ID
        let model_id = manager.get_model_id(&model_name)?;

        let model = UpscaleModel {
            model_id,
            model_name,
            scale,
            tile_size,
            noise_level,
        };

        // 执行超分并缓存
        return manager.upscale_and_cache(&image_path, &model, timeout);
    }

    Err("PyO3 超分管理器未初始化".to_string())
}

/// 检查缓存是否存在（基于 image_hash）
#[command]
pub async fn check_pyo3_upscale_cache(
    image_hash: String,
    model_name: String,
    scale: i32,
    tile_size: i32,
    noise_level: i32,
    state: tauri::State<'_, PyO3UpscalerState>,
) -> Result<Option<String>, String> {
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
        // 获取模型 ID
        let model_id = manager.get_model_id(&model_name)?;

        let model = UpscaleModel {
            model_id,
            model_name,
            scale,
            tile_size,
            noise_level,
        };

        // 检查缓存
        if let Some(cache_path) = manager.check_cache(&image_hash, &model) {
            return Ok(Some(cache_path.to_string_lossy().to_string()));
        }

        return Ok(None);
    }

    Err("PyO3 超分管理器未初始化".to_string())
}

/// 获取缓存统计信息
#[command]
pub async fn get_pyo3_cache_stats(
    state: tauri::State<'_, PyO3UpscalerState>,
) -> Result<CacheStats, String> {
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

    Err("PyO3 超分管理器未初始化".to_string())
}

/// 清理缓存
#[command]
pub async fn cleanup_pyo3_cache(
    max_age_days: Option<u32>,
    state: tauri::State<'_, PyO3UpscalerState>,
) -> Result<usize, String> {
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
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

    Err("PyO3 超分管理器未初始化".to_string())
}

/// 测试 PyO3 超分功能
#[command]
pub async fn test_pyo3_upscaler(
    test_image_path: String,
    state: tauri::State<'_, PyO3UpscalerState>,
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
        let test_image_path = PathBuf::from(test_image_path);

        // 检查测试图片是否存在
        if !test_image_path.exists() {
            return Err(format!("测试图片不存在: {}", test_image_path.display()));
        }

        // 使用默认模型进行测试
        let model = UpscaleModel {
            model_id: 0,
            model_name: "cunet".to_string(),
            scale: 2,
            tile_size: 0,
            noise_level: 0,
        };

        // 执行超分
        let result = manager.upscale_and_cache(&test_image_path, &model, 60.0)?;

        // 计算测试图片的 hash
        use crate::core::path_utils::{build_path_key, calculate_path_hash};
        use crate::models::BookType;
        let path_key = build_path_key(
            test_image_path.to_str().unwrap_or(""),
            test_image_path.to_str().unwrap_or(""),
            &BookType::Folder, // 假设是文件夹类型
            None,
        );
        let image_hash = calculate_path_hash(&path_key);

        let cache_path = manager.get_cache_path(&image_hash, &model)?;

        Ok(format!(
            "✅ 测试成功！\n输入: {}\n输出大小: {} bytes\n缓存路径: {}",
            test_image_path.display(),
            result.len(),
            cache_path.display()
        ))
    } else {
        Err("PyO3 超分管理器未初始化".to_string())
    }
}

/// 读取超分缓存文件
#[tauri::command]
pub async fn read_upscale_cache_file(cache_path: String) -> Result<Vec<u8>, String> {
    use std::fs;

    match fs::read(&cache_path) {
        Ok(data) => Ok(data),
        Err(e) => Err(format!("读取缓存文件失败: {}", e)),
    }
}

/// 获取图像数据用于超分 (普通文件)
#[tauri::command]
pub async fn get_image_data_for_upscale(
    image_path: String,
    _inner_path: Option<String>,
) -> Result<Vec<u8>, String> {
    use std::fs;

    // 暂时只支持普通文件，直接读取
    match fs::read(&image_path) {
        Ok(data) => Ok(data),
        Err(e) => Err(format!("读取文件失败: {}", e)),
    }
}
