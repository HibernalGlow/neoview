//! 超分任务处理模块
//! 
//! 包含任务处理逻辑、图片加载、条件匹配、超分执行

use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Arc, RwLock};
use std::time::Instant;
use regex::Regex;

use crate::commands::pyo3_upscale_commands::PyO3UpscalerState;
use crate::commands::upscale_service_commands::FrontendCondition;
use crate::core::pyo3_upscaler::UpscaleModel;
use crate::core::upscale_settings::ConditionalUpscaleSettings;
use crate::core::wic_decoder::decode_image_from_memory_with_wic;

use super::events::{UpscaleStatus, UpscaleReadyPayload};
use super::types::{TaskPriority, UpscaleTask, CacheEntry};
use super::cache::cache_key;
use super::{log_info, log_debug};

/// 读取图片数据（支持普通文件和压缩包内文件）
pub fn load_image_data(image_path: &str) -> Result<Vec<u8>, String> {
    // 检查是否是压缩包内路径（格式: xxx.zip inner=xxx）
    if let Some(inner_idx) = image_path.find(" inner=") {
        let archive_path = &image_path[..inner_idx];
        let inner_path = &image_path[inner_idx + 7..];
        
        log_debug!("📦 从压缩包读取: {} -> {}", archive_path, inner_path);
        
        // 使用 zip crate 读取
        let file = fs::File::open(archive_path)
            .map_err(|e| format!("打开压缩包失败: {}", e))?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| format!("解析压缩包失败: {}", e))?;
        
        let mut entry = archive.by_name(inner_path)
            .map_err(|e| format!("在压缩包中找不到文件 {}: {}", inner_path, e))?;
        
        let mut data = Vec::new();
        std::io::Read::read_to_end(&mut entry, &mut data)
            .map_err(|e| format!("读取压缩包内文件失败: {}", e))?;
        
        Ok(data)
    } else {
        // 普通文件
        fs::read(image_path)
            .map_err(|e| format!("读取文件失败: {}", e))
    }
}

/// 处理单个任务（V2：WIC 处理 + 文件缓存 + 条件匹配）
#[allow(clippy::too_many_arguments)]
pub fn process_task_v2(
    py_state: &Arc<PyO3UpscalerState>,
    condition_settings: &Arc<RwLock<ConditionalUpscaleSettings>>,
    conditions_list: &Arc<RwLock<Vec<FrontendCondition>>>,
    cache_dir: &Path,
    cache_map: &Arc<RwLock<HashMap<(String, usize), CacheEntry>>>,
    task: &UpscaleTask,
    timeout: f64,
) -> Result<UpscaleReadyPayload, String> {
    log_debug!(
        "🔄 处理超分任务 (V2): {} page {} path={}",
        task.book_path,
        task.page_index,
        task.image_path
    );

    // 1. 读取图片数据
    let raw_image_data = load_image_data(&task.image_path)?;
    log_debug!("📥 读取图片数据: {} bytes", raw_image_data.len());

    // 2. 使用 WIC 解码
    let decode_result = decode_image_from_memory_with_wic(&raw_image_data)
        .map_err(|e| format!("WIC 解码失败: {}", e))?;
    
    let width = decode_result.width;
    let height = decode_result.height;
    log_debug!("📐 WIC 解码完成: {}x{}", width, height);

    // 3. 条件匹配决定模型
    let matched_model = match match_model_from_conditions(
        task, condition_settings, conditions_list, width, height,
    ) {
        Ok(model) => model,
        Err(skipped_payload) => return Ok(skipped_payload),
    };
    
    // 如果没有匹配到模型，跳过超分
    let final_model = match matched_model {
        Some(m) => m,
        None => {
            log_debug!("⚠️ 无条件匹配 ({}x{}), 跳过超分", width, height);
            return Ok(create_skipped_payload(task, width, height, None));
        }
    };

    // 4. 执行超分
    let result_bytes = execute_upscale(
        py_state, &final_model, &decode_result, &raw_image_data, 
        &task.image_path, width, height, timeout,
    )?;

    // 5. 保存缓存并返回结果
    save_and_return_result(
        task, cache_dir, cache_map, &final_model, 
        &result_bytes, width, height,
    )
}

/// 执行超分处理
fn execute_upscale(
    py_state: &Arc<PyO3UpscalerState>,
    final_model: &UpscaleModel,
    decode_result: &crate::core::wic_decoder::WicDecodeResult,
    raw_image_data: &[u8],
    image_path: &str,
    width: u32,
    height: u32,
    timeout: f64,
) -> Result<Vec<u8>, String> {
    let manager = {
        let guard = py_state
            .manager
            .lock()
            .map_err(|e| format!("获取锁失败: {}", e))?;
        guard
            .clone()
            .ok_or_else(|| "PyO3 超分器未初始化".to_string())?
    };

    // 预处理：对于 AVIF/JXL 格式，使用 WIC 解码后转码为 JPEG
    let ext = Path::new(image_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    let needs_transcode = matches!(ext.as_str(), "avif" | "jxl" | "heic" | "heif");
    
    let image_data = if needs_transcode {
        log_debug!("🔄 检测到 AVIF/JXL 格式，使用 WIC 转码");
        let rgb_pixels: Vec<u8> = decode_result.pixels
            .chunks_exact(4)
            .flat_map(|c| [c[2], c[1], c[0]]) // BGRA -> RGB
            .collect();
        
        let mut output = Vec::new();
        {
            use image::codecs::jpeg::JpegEncoder;
            use image::ImageEncoder;
            let encoder = JpegEncoder::new_with_quality(&mut output, 85);
            encoder
                .write_image(&rgb_pixels, width, height, image::ExtendedColorType::Rgb8)
                .map_err(|e| format!("JPEG 编码失败: {}", e))?;
        }
        log_debug!("✅ WIC 转码完成: {} bytes -> {} bytes", raw_image_data.len(), output.len());
        output
    } else {
        raw_image_data.to_vec()
    };

    // 解析模型 ID
    let model = if final_model.model_id == 0 && !final_model.model_name.is_empty() {
        let model_id = manager.get_model_id(&final_model.model_name)
            .unwrap_or_else(|e| {
                log_debug!("⚠️ 解析模型 ID 失败 ({}), 使用默认值 8", e);
                8
            });
        log_debug!("📋 模型 ID 解析: {} -> {}", final_model.model_name, model_id);
        UpscaleModel {
            model_id,
            ..final_model.clone()
        }
    } else {
        final_model.clone()
    };

    manager.upscale_image_memory(
        &image_data, &model, timeout, width as i32, height as i32, None,
    )
}

/// 保存缓存并返回结果
fn save_and_return_result(
    task: &UpscaleTask,
    cache_dir: &Path,
    cache_map: &Arc<RwLock<HashMap<(String, usize), CacheEntry>>>,
    final_model: &UpscaleModel,
    result_bytes: &[u8],
    width: u32,
    height: u32,
) -> Result<UpscaleReadyPayload, String> {
    let scale = final_model.scale as u32;
    let upscaled_width = width * scale;
    let upscaled_height = height * scale;

    // 生成缓存路径
    let key = cache_key(&task.book_path, &task.image_path);
    let hash = format!("{:x}", md5::compute(key.as_bytes()));
    let filename = format!("{}_sr[{}].webp", hash, final_model.model_name);
    let cache_path = cache_dir.join(&filename);
    log_debug!("💾 缓存路径: {} (key: {})", cache_path.display(), key);
    
    // 确保缓存目录存在
    if let Some(parent) = cache_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    // 写入缓存文件
    fs::write(&cache_path, result_bytes)
        .map_err(|e| format!("写入缓存文件失败: {}", e))?;

    let cache_path_str = cache_path.to_string_lossy().to_string();

    // 更新缓存映射
    if let Ok(mut map) = cache_map.write() {
        let entry = CacheEntry {
            cache_path: cache_path_str.clone(),
            original_size: (width, height),
            upscaled_size: (upscaled_width, upscaled_height),
            cached_at: Instant::now(),
        };
        map.insert((task.book_path.clone(), task.page_index), entry);
    }

    log_info!(
        "✅ 超分完成 page {} ({}x{} -> {}x{}) -> {}",
        task.page_index, width, height, upscaled_width, upscaled_height, cache_path_str
    );

    Ok(UpscaleReadyPayload {
        book_path: task.book_path.clone(),
        page_index: task.page_index,
        image_hash: task.image_hash.clone(),
        status: UpscaleStatus::Completed,
        cache_path: Some(cache_path_str),
        error: None,
        original_size: Some((width, height)),
        upscaled_size: Some((upscaled_width, upscaled_height)),
        is_preload: task.score.priority != TaskPriority::Current,
        model_name: Some(final_model.model_name.clone()),
        scale: Some(final_model.scale),
    })
}

/// 创建跳过状态的 payload
fn create_skipped_payload(
    task: &UpscaleTask,
    width: u32,
    height: u32,
    error_msg: Option<String>,
) -> UpscaleReadyPayload {
    UpscaleReadyPayload {
        book_path: task.book_path.clone(),
        page_index: task.page_index,
        image_hash: task.image_hash.clone(),
        status: UpscaleStatus::Skipped,
        cache_path: None,
        error: error_msg.or_else(|| Some(format!("无条件匹配 ({}x{})", width, height))),
        original_size: Some((width, height)),
        upscaled_size: None,
        is_preload: task.score.priority != TaskPriority::Current,
        model_name: None,
        scale: None,
    }
}

/// 从条件列表中匹配模型
fn match_model_from_conditions(
    task: &UpscaleTask,
    condition_settings: &Arc<RwLock<ConditionalUpscaleSettings>>,
    conditions_list: &Arc<RwLock<Vec<FrontendCondition>>>,
    width: u32,
    height: u32,
) -> Result<Option<UpscaleModel>, UpscaleReadyPayload> {
    // 如果任务模型不为空，直接使用（前端指定了模型）
    if !task.model.model_name.is_empty() {
        log_debug!("📋 使用任务指定的模型: {}", task.model.model_name);
        return Ok(Some(task.model.clone()));
    }
    
    // 检查条件超分是否启用
    let conditions_enabled = condition_settings
        .read()
        .ok()
        .map(|s| s.enabled)
        .unwrap_or(false);
    
    log_debug!("📋 条件超分启用状态: {}", conditions_enabled);
    
    if !conditions_enabled {
        // 条件超分禁用，但前端也没传模型，使用默认模型
        log_debug!("📋 条件超分禁用，使用默认模型 cunet 2x");
        return Ok(Some(UpscaleModel {
            model_id: 0,
            model_name: "cunet".to_string(),
            scale: 2,
            tile_size: 0,
            noise_level: 0,
        }));
    }
    
    let conditions = conditions_list
        .read()
        .ok()
        .map(|list| list.clone())
        .unwrap_or_default();
    
    log_debug!("📋 条件列表数量: {}", conditions.len());
    
    // 遍历条件（已按优先级排序）
    for cond in conditions.iter() {
        if !cond.enabled {
            continue;
        }
        
        // 检查尺寸条件
        if !check_size_condition(cond, width, height) {
            log_debug!("📋 条件 '{}' 尺寸不匹配 ({}x{})", cond.name, width, height);
            continue;
        }
        
        // 检查路径正则条件
        let (match_book, match_image) = check_path_regex(task, cond);
        if !match_book || !match_image {
            log_debug!("📋 条件 '{}' 路径不匹配", cond.name);
            continue;
        }
        
        // 条件匹配成功
        if cond.skip {
            log_debug!("⏭️ 条件 '{}' 匹配，跳过超分 ({}x{})", cond.name, width, height);
            return Err(create_skipped_payload(
                task, width, height, 
                Some(format!("条件 '{}' 要求跳过", cond.name)),
            ));
        }
        
        log_debug!(
            "✅ 条件 '{}' 匹配 ({}x{}) -> 模型: {}, 缩放: {}x",
            cond.name, width, height, cond.model_name, cond.scale
        );
        
        return Ok(Some(UpscaleModel {
            model_id: 0,
            model_name: cond.model_name.clone(),
            scale: cond.scale,
            tile_size: cond.tile_size,
            noise_level: cond.noise_level,
        }));
    }
    
    // 条件超分启用但没有匹配的条件，跳过
    log_debug!("⚠️ 条件超分启用但无匹配条件 ({}x{})", width, height);
    Ok(None)
}

/// 检查尺寸条件（包括宽高和总像素量）
fn check_size_condition(cond: &FrontendCondition, width: u32, height: u32) -> bool {
    // 宽高检查
    let match_width = cond.min_width == 0 || width >= cond.min_width;
    let match_height = cond.min_height == 0 || height >= cond.min_height;
    let match_max_width = cond.max_width == 0 || width <= cond.max_width;
    let match_max_height = cond.max_height == 0 || height <= cond.max_height;
    
    // 总像素量检查（单位：百万像素 MPx）
    let total_pixels_mpx = (width as f64 * height as f64) / 1_000_000.0;
    let match_min_pixels = cond.min_pixels <= 0.0 || total_pixels_mpx >= cond.min_pixels;
    let match_max_pixels = cond.max_pixels <= 0.0 || total_pixels_mpx <= cond.max_pixels;
    
    match_width && match_height && match_max_width && match_max_height && match_min_pixels && match_max_pixels
}

/// 检查路径正则匹配
fn check_path_regex(task: &UpscaleTask, cond: &FrontendCondition) -> (bool, bool) {
    // 提取 book_path
    let book_path_for_match = if let Some(inner_idx) = task.image_path.find(" inner=") {
        &task.image_path[..inner_idx]
    } else {
        &task.book_path
    };
    
    // 提取 inner_path
    let inner_path = task.image_path
        .find(" inner=")
        .map(|idx| &task.image_path[idx + 7..]);
    
    // 统一使用正斜杠
    let normalized_book_path = book_path_for_match.replace('\\', "/");
    let normalized_inner_path = inner_path.map(|p| p.replace('\\', "/"));
    
    // 书籍路径正则匹配
    let match_book = match_regex(&cond.regex_book_path, &normalized_book_path, "书籍路径");
    
    // 图片路径正则匹配
    let path_to_match = if cond.match_inner_path {
        normalized_inner_path.as_deref().unwrap_or("")
    } else {
        &task.image_path.replace('\\', "/")
    };
    let match_image = match_regex(&cond.regex_image_path, path_to_match, "图片路径");
    
    (match_book, match_image)
}

/// 匹配正则表达式
fn match_regex(regex_opt: &Option<String>, path: &str, path_type: &str) -> bool {
    match regex_opt {
        Some(regex_str) if !regex_str.is_empty() => {
            match Regex::new(regex_str) {
                Ok(re) => {
                    let matched = re.is_match(path);
                    log_debug!(
                        "📁 {}正则匹配: pattern='{}' path='{}' matched={}",
                        path_type, regex_str, path, matched
                    );
                    matched
                }
                Err(e) => {
                    log_debug!("⚠️ 无效的{}正则: {} - {}", path_type, regex_str, e);
                    true
                }
            }
        }
        _ => true,
    }
}
