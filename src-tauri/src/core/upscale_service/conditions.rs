//! 超分服务条件匹配模块
//! 
//! 包含条件同步、条件匹配、条件设置更新等功能

use std::sync::RwLock;
use crate::commands::upscale_service_commands::FrontendCondition;
use crate::core::pyo3_upscaler::UpscaleModel;
use crate::core::upscale_settings::ConditionalUpscaleSettings;
use super::{log_info, log_debug};

/// 同步条件配置（从前端接收完整的条件列表）
pub fn sync_conditions(
    condition_settings: &RwLock<ConditionalUpscaleSettings>,
    conditions_list: &RwLock<Vec<FrontendCondition>>,
    enabled: bool,
    conditions: Vec<FrontendCondition>,
) {
    log_info!("📋 收到条件配置同步请求: enabled={}, 条件数={}", enabled, conditions.len());
    
    // 打印每个条件的详细信息
    for (i, cond) in conditions.iter().enumerate() {
        log_info!(
            "  [{}] {} (优先级:{}, 启用:{}, 跳过:{}) 尺寸范围: {}x{} ~ {}x{} 模型: {} {}x 路径正则: book={:?} image={:?} matchInner={}",
            i,
            cond.name,
            cond.priority,
            cond.enabled,
            cond.skip,
            cond.min_width,
            cond.min_height,
            if cond.max_width > 0 { cond.max_width.to_string() } else { "∞".to_string() },
            if cond.max_height > 0 { cond.max_height.to_string() } else { "∞".to_string() },
            cond.model_name,
            cond.scale,
            cond.regex_book_path,
            cond.regex_image_path,
            cond.match_inner_path
        );
    }
    
    // 更新启用状态
    if let Ok(mut s) = condition_settings.write() {
        s.enabled = enabled;
    }
    
    // 存储条件列表（按优先级排序）
    let mut sorted_conditions = conditions;
    sorted_conditions.sort_by(|a, b| b.priority.cmp(&a.priority)); // 高优先级在前
    
    if let Ok(mut list) = conditions_list.write() {
        *list = sorted_conditions;
    }
    
    log_info!(
        "✅ 条件配置已同步: enabled={}, 条件数={}",
        enabled,
        if let Ok(list) = conditions_list.read() { list.len() } else { 0 }
    );
}

/// 根据图片尺寸匹配条件，返回模型配置
pub fn match_condition(
    condition_settings: &RwLock<ConditionalUpscaleSettings>,
    conditions_list: &RwLock<Vec<FrontendCondition>>,
    width: u32,
    height: u32,
) -> Option<UpscaleModel> {
    let conditions_enabled = if let Ok(s) = condition_settings.read() {
        s.enabled
    } else {
        false
    };
    
    if !conditions_enabled {
        return None;
    }
    
    let conditions = if let Ok(list) = conditions_list.read() {
        list.clone()
    } else {
        return None;
    };
    
    // 遍历条件（已按优先级排序）
    for cond in conditions.iter() {
        if !cond.enabled {
            continue;
        }
        
        // 检查尺寸条件
        let match_width = cond.min_width == 0 || width >= cond.min_width;
        let match_height = cond.min_height == 0 || height >= cond.min_height;
        let match_max_width = cond.max_width == 0 || width <= cond.max_width;
        let match_max_height = cond.max_height == 0 || height <= cond.max_height;
        
        if match_width && match_height && match_max_width && match_max_height {
            if cond.skip {
                log_debug!("⏭️ 条件 '{}' 匹配，跳过超分 ({}x{})", cond.name, width, height);
                return None; // 返回 None 表示跳过
            }
            
            log_debug!(
                "✅ 条件 '{}' 匹配 ({}x{}) -> 模型: {}, 缩放: {}x",
                cond.name, width, height, cond.model_name, cond.scale
            );
            
            return Some(UpscaleModel {
                model_id: 0, // 稍后通过 model_name 解析
                model_name: cond.model_name.clone(),
                scale: cond.scale,
                tile_size: cond.tile_size,
                noise_level: cond.noise_level,
            });
        }
    }
    
    log_debug!("⚠️ 无条件匹配 ({}x{}), 跳过超分", width, height);
    None // 无条件匹配时跳过
}

/// 更新条件设置
pub fn update_condition_settings(
    condition_settings: &RwLock<ConditionalUpscaleSettings>,
    settings: ConditionalUpscaleSettings,
) {
    if let Ok(mut s) = condition_settings.write() {
        *s = settings;
    }
}
