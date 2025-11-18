//! NeoView - Upscale Commands
//! 超分相关的 Tauri 命令

use crate::core::upscale::{UpscaleManager, UpscaleOptions};
use std::sync::{Arc, Mutex};
use tauri::{command, Window};

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

    let manager_guard = state
        .manager
        .lock()
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
        let manager_guard = state
            .manager
            .lock()
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
        let manager_guard = state
            .manager
            .lock()
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
        let image_path = std::path::PathBuf::from(image_path);
        let save_path = std::path::PathBuf::from(save_path);

        let options = UpscaleOptions {
            gpu_id,
            tile_size,
            tta,
        };

        // 检查是否已有缓存
        if let Some(cached_path) =
            manager.check_upscale_cache(&image_path, &model, &factor, &options)
        {
            println!("📦 使用超分缓存: {}", cached_path.display());
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
                &model,
                &factor,
                options,
                None, // 暂时不使用 window 参数
            )
            .await?;

        // 直接返回超分后的文件的二进制数据
        let image_data =
            std::fs::read(&result_path).map_err(|e| format!("读取超分文件失败: {}", e))?;

        Ok(image_data)
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
        let manager_guard = state
            .manager
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        manager_guard.clone()
    };

    if let Some(manager) = manager_result {
        return manager.get_cache_stats();
    }

    Err("超分管理器未初始化".to_string())
}

/// 将 AVIF 图片转换为 WebP 格式
#[command]
pub async fn convert_avif_to_webp(image_path: String) -> Result<String, String> {
    use std::fs;
    use std::io::BufWriter;
    use std::path::PathBuf;

    let image_path = PathBuf::from(image_path);

    // 检查是否是 AVIF 格式
    if let Some(extension) = image_path.extension() {
        if extension.to_string_lossy().to_lowercase() != "avif" {
            // 不是 AVIF 格式，直接返回原路径
            return Ok(image_path.to_string_lossy().to_string());
        }
    } else {
        // 没有扩展名，直接返回原路径
        return Ok(image_path.to_string_lossy().to_string());
    }

    // 读取 AVIF 图片数据
    let image_data = fs::read(&image_path).map_err(|e| format!("读取 AVIF 文件失败: {}", e))?;

    // 使用 image crate 解码 AVIF
    let img =
        image::load_from_memory(&image_data).map_err(|e| format!("解码 AVIF 图片失败: {}", e))?;

    // 创建临时文件
    let temp_dir = std::env::temp_dir();
    let original_filename = image_path
        .file_stem()
        .ok_or("无效的文件名")?
        .to_string_lossy();
    let temp_webp_path = temp_dir.join(format!("neoview_avif_convert_{}.webp", original_filename));

    // 创建文件写入器
    let file =
        fs::File::create(&temp_webp_path).map_err(|e| format!("创建 WebP 文件失败: {}", e))?;
    let writer = BufWriter::new(file);

    // 编码为 WebP 格式
    let webp_encoder = image::codecs::webp::WebPEncoder::new_lossless(writer);
    img.write_with_encoder(webp_encoder)
        .map_err(|e| format!("编码 WebP 失败: {}", e))?;

    println!(
        "✅ AVIF 转 WebP 完成: {} -> {}",
        image_path.display(),
        temp_webp_path.display()
    );
    Ok(temp_webp_path.to_string_lossy().to_string())
}

/// 获取超分保存路径（支持原始文件路径和实际处理路径）
#[command]
pub async fn get_upscale_save_path_with_info(
    original_path: String,
    actual_path: String,
    model: String,
    factor: String,
    state: tauri::State<'_, UpscaleManagerState>,
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
        use std::path::PathBuf;
        let _original_path = PathBuf::from(original_path);
        let actual_path = PathBuf::from(actual_path);

        // 使用实际路径计算MD5，但使用原始路径生成文件名
        let md5 = manager.calculate_file_md5(&actual_path)?;

        // 生成参数字符串
        let options = crate::core::upscale::UpscaleOptions::default();
        let params = format!(
            "{}_{}_{}_{}",
            model, factor, options.gpu_id, options.tile_size
        );
        let filename = if options.tta {
            format!("{}_sr{}_tta.webp", md5, params)
        } else {
            format!("{}_sr{}.webp", md5, params)
        };

        let neosr_dir = manager.thumbnail_root.join("neosr");
        let save_path = neosr_dir.join(filename);

        return Ok(save_path.to_string_lossy().to_string());
    }

    Err("超分管理器未初始化".to_string())
}

/// 提取压缩包内的图片到临时文件
#[command]
pub async fn extract_image_from_archive(
    archive_path: String,
    image_path: String,
) -> Result<String, String> {
    use crate::core::archive::ArchiveManager;
    use std::fs;
    use std::path::PathBuf;

    let archive_manager = ArchiveManager::new();
    let archive_path = PathBuf::from(archive_path);

    // 从压缩包中提取图片数据
    let image_data = archive_manager.extract_file(&archive_path, &image_path)?;

    // 创建临时文件
    let temp_dir = std::env::temp_dir();
    let image_filename = PathBuf::from(image_path)
        .file_name()
        .ok_or("无效的图片路径")?
        .to_string_lossy()
        .to_string();

    let temp_file_path = temp_dir.join(format!("neoview_upscale_{}", image_filename));

    // 写入临时文件
    fs::write(&temp_file_path, image_data).map_err(|e| format!("写入临时文件失败: {}", e))?;

    Ok(temp_file_path.to_string_lossy().to_string())
}

/// 保存超分后的图片
#[command]
pub async fn save_upscaled_image(file_path: String, image_data: Vec<u8>) -> Result<(), String> {
    use std::fs;
    use std::path::Path;

    let path = Path::new(&file_path);

    // 确保父目录存在
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }

    // 写入文件
    fs::write(&path, image_data).map_err(|e| format!("写入文件失败: {}", e))?;

    println!("✅ 超分图片已保存: {}", path.display());
    Ok(())
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
        let manager_guard = state
            .manager
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        manager_guard.clone()
    };

    if let Some(manager) = manager_result {
        return manager.cleanup_cache(max_age_days);
    }

    Err("超分管理器未初始化".to_string())
}
