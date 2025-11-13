//! NeoView - Sr_vulkan Commands
//! 使用 PyO3 直接调用 sr_vulkan 的 Tauri 命令

use std::sync::{Arc, Mutex};
use tauri::command;
use crate::core::sr_vulkan_upscaler::{SrVulkanUpscaler, SrVulkanOptions, UpscaleCacheStats};

/// 全局 Sr_vulkan 超分管理器状态
pub struct SrVulkanManagerState {
    pub manager: Arc<Mutex<Option<SrVulkanUpscaler>>>,
}

impl Default for SrVulkanManagerState {
    fn default() -> Self {
        Self {
            manager: Arc::new(Mutex::new(None)),
        }
    }
}

/// 等待超分管理器初始化
async fn ensure_manager_ready(
    state: &tauri::State<'_, SrVulkanManagerState>,
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

/// 初始化 Sr_vulkan 超分管理器
#[command]
pub async fn init_sr_vulkan_manager(
    thumbnail_path: String,
    state: tauri::State<'_, SrVulkanManagerState>,
) -> Result<(), String> {
    let thumbnail_path = std::path::PathBuf::from(thumbnail_path);
    let mut manager = SrVulkanUpscaler::new(thumbnail_path);

    // 初始化 sr_vulkan
    manager.initialize()?;

    let manager_guard = state.manager.lock()
        .map_err(|e| format!("获取锁失败: {}", e))?;
    let mut manager_guard = manager_guard;
    *manager_guard = Some(manager);

    Ok(())
}

/// 检查 Sr_vulkan 工具是否可用
#[command]
pub async fn check_sr_vulkan_availability(
    state: tauri::State<'_, SrVulkanManagerState>,
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

/// 获取 GPU 信息
#[command]
pub async fn get_sr_vulkan_gpu_info(
    state: tauri::State<'_, SrVulkanManagerState>,
) -> Result<Vec<String>, String> {
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
        return manager.get_gpu_info();
    }

    Err("超分管理器未初始化".to_string())
}

/// 执行图片超分
#[command]
pub async fn upscale_image_sr_vulkan(
    image_path: String,
    save_path: String,
    model: String,
    scale: f64,
    gpu_id: i32,
    tile_size: i32,
    tta: bool,
    state: tauri::State<'_, SrVulkanManagerState>,
) -> Result<Vec<u8>, String> {
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
        
        let options = SrVulkanOptions {
            gpu_id,
            tile_size,
            tta,
            output_format: "webp".to_string(),
        };

        // 检查是否已有缓存
        if let Some(cached_path) = manager.check_upscale_cache(&image_path, &model, &options) {
            println!("📦 使用超分缓存: {}", cached_path.display());
            // 直接返回缓存文件的二进制数据
            let image_data = std::fs::read(&cached_path)
                .map_err(|e| format!("读取缓存文件失败: {}", e))?;
            return Ok(image_data);
        }

        // 执行超分
        let result_path = manager.upscale_image(
            &image_path,
            &save_path,
            &model,
            scale,
            options,
        ).await?;

        // 直接返回超分后的文件的二进制数据
        let image_data = std::fs::read(&result_path)
            .map_err(|e| format!("读取超分文件失败: {}", e))?;
        
        Ok(image_data)
    } else {
        Err("超分管理器未初始化".to_string())
    }
}

/// 获取超分缓存统计信息
#[command]
pub async fn get_sr_vulkan_cache_stats(
    state: tauri::State<'_, SrVulkanManagerState>,
) -> Result<UpscaleCacheStats, String> {
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
pub async fn cleanup_sr_vulkan_cache(
    max_age_days: Option<u32>,
    state: tauri::State<'_, SrVulkanManagerState>,
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
