//! NeoView - Upscale Commands
//! 超分相关的 Tauri 命令

use std::sync::{Arc, Mutex};
use tauri::{command, Window};
use crate::core::upscale::{UpscaleManager, UpscaleOptions};
use base64::Engine;

/// 全局超分管理器状态
pub struct UpscaleManagerState {
    pub manager: Arc<Mutex<Option<UpscaleManager>>>,
}

impl Default for UpscaleManagerState {
    fn default() -> Self {
        Self {
            manager: Arc::new(Mutex::new(None)),
        }
    }
}

/// 等待超分管理器初始化
async fn ensure_manager_ready(
    state: &tauri::State<'_, UpscaleManagerState>,
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
            Err(_) => return Err("无法获取超分管理器锁".to_string()),
        }

        if waited >= max_wait_ms {
            break;
        }

        std::thread::sleep(std::time::Duration::from_millis(step));
        waited += step;
    }

    Err("超分管理器未初始化".to_string())
}

/// 初始化超分管理器
#[command]
pub async fn init_upscale_manager(
    thumbnail_path: String,
    state: tauri::State<'_, UpscaleManagerState>,
) -> Result<(), String> {
    let thumbnail_path = std::path::PathBuf::from(thumbnail_path);
    let manager = UpscaleManager::new(thumbnail_path);

    let manager_guard = state.manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;
    let mut manager_guard = manager_guard;
    *manager_guard = Some(manager);

    Ok(())
}

/// 检查超分工具是否可用
#[command]
pub async fn check_upscale_availability(
    state: tauri::State<'_, UpscaleManagerState>,
) -> Result<(), String> {
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        return Err(e);
    }

    let manager_result = {
        let manager_guard = state.manager.lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        manager_guard.clone()
    };

    if let Some(manager) = manager_result {
        return manager.check_availability();
    }

    Err("超分管理器未初始化".to_string())
}

/// 获取超分保存路径
#[command]
pub async fn get_upscale_save_path(
    image_path: String,
    model: String,
    factor: String,
    state: tauri::State<'_, UpscaleManagerState>,
) -> Result<String, String> {
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        return Err(e);
    }

    let manager_result = {
        let manager_guard = state.manager.lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        manager_guard.clone()
    };

    if let Some(manager) = manager_result {
        let image_path = std::path::PathBuf::from(image_path);
        let options = UpscaleOptions::default();
        
        let save_path = manager.get_upscale_save_path(&image_path, &model, &factor, &options)?;
        return Ok(save_path.to_string_lossy().to_string());
    }

    Err("超分管理器未初始化".to_string())
}

/// 执行图片超分
#[command]
pub async fn upscale_image(
    image_path: String,
    save_path: String,
    model: String,
    factor: String,
    gpu_id: String,
    tile_size: String,
    tta: bool,
    _window: Window,
    state: tauri::State<'_, UpscaleManagerState>,
) -> Result<String, String> {
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        return Err(e);
    }

    let manager_result = {
        let manager_guard = state.manager.lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        manager_guard.clone()
    };

    if let Some(manager) = manager_result {
        let image_path = std::path::PathBuf::from(image_path);
        let save_path = std::path::PathBuf::from(save_path);
        
        let options = UpscaleOptions {
            gpu_id,
            tile_size,
            tta,
        };

        // 检查是否已有缓存
        if let Some(cached_path) = manager.check_upscale_cache(&image_path, &model, &factor, &options) {
            println!("📦 使用超分缓存: {}", cached_path.display());
            // 读取缓存文件并转换为 base64
            let image_data = std::fs::read(&cached_path)
                .map_err(|e| format!("读取缓存文件失败: {}", e))?;
            let base64_data = base64::engine::general_purpose::STANDARD.encode(&image_data);
            return Ok(format!("data:image/webp;base64,{}", base64_data));
        }

        // 执行超分
        let result_path = manager.upscale_image(
            &image_path,
            &save_path,
            &model,
            &factor,
            options,
            None, // 暂时不使用 window 参数
        ).await?;

        // 读取超分后的文件并转换为 base64
        let image_data = std::fs::read(&result_path)
            .map_err(|e| format!("读取超分文件失败: {}", e))?;
        let base64_data = base64::engine::general_purpose::STANDARD.encode(&image_data);
        
        Ok(format!("data:image/webp;base64,{}", base64_data))
    } else {
        Err("超分管理器未初始化".to_string())
    }
}

/// 获取超分缓存统计信息
#[command]
pub async fn get_upscale_cache_stats(
    state: tauri::State<'_, UpscaleManagerState>,
) -> Result<crate::core::upscale::UpscaleCacheStats, String> {
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        return Err(e);
    }

    let manager_result = {
        let manager_guard = state.manager.lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        manager_guard.clone()
    };

    if let Some(manager) = manager_result {
        return manager.get_cache_stats();
    }

    Err("超分管理器未初始化".to_string())
}

/// 清理超分缓存
#[command]
pub async fn cleanup_upscale_cache(
    max_age_days: Option<u32>,
    state: tauri::State<'_, UpscaleManagerState>,
) -> Result<usize, String> {
    // 等待管理器初始化
    if let Err(e) = ensure_manager_ready(&state, 5000).await {
        return Err(e);
    }

    let max_age_days = max_age_days.unwrap_or(30); // 默认30天

    let manager_result = {
        let manager_guard = state.manager.lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        manager_guard.clone()
    };

    if let Some(manager) = manager_result {
        return manager.cleanup_cache(max_age_days);
    }

    Err("超分管理器未初始化".to_string())
}