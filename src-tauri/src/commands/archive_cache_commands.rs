//! 压缩包缓存管理命令
//!
//! 提供索引缓存、预热系统的 Tauri 命令接口。

use crate::core::archive_index_cache::{CacheStats, IndexCache};
use crate::core::archive_preheat::PreheatSystem;
use crate::core::load_command_queue::{LoadMetrics, PerformanceMonitor};
use crate::core::BookManager;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::State;

/// 缓存状态响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStatusResponse {
    /// 索引缓存统计
    pub index_cache: CacheStats,
    /// 预热队列大小
    pub preheat_queue_size: usize,
    /// 最近加载指标
    pub last_load_metrics: Option<LoadMetrics>,
}

/// 获取缓存状态
#[tauri::command]
pub async fn get_cache_stats(
    state: State<'_, Mutex<BookManager>>,
) -> Result<CacheStatusResponse, String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    
    let index_cache = manager.index_cache().stats();
    let preheat_queue_size = manager.preheat_system().queue_size();
    let last_load_metrics = manager.performance_monitor().get_last_metrics();

    Ok(CacheStatusResponse {
        index_cache,
        preheat_queue_size,
        last_load_metrics,
    })
}

/// 清除索引缓存
#[tauri::command]
pub async fn clear_index_cache(
    state: State<'_, Mutex<BookManager>>,
) -> Result<(), String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    manager.index_cache().clear();
    log::info!("已清除索引缓存");
    Ok(())
}

/// 使指定压缩包的缓存失效
#[tauri::command]
pub async fn invalidate_archive_cache(
    path: String,
    state: State<'_, Mutex<BookManager>>,
) -> Result<(), String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    let path_buf = PathBuf::from(&path);
    manager.index_cache().invalidate(&path_buf);
    log::info!("已使缓存失效: {}", path);
    Ok(())
}

/// 预热相邻压缩包
#[tauri::command]
pub async fn preheat_adjacent_archives(
    path: String,
    state: State<'_, Mutex<BookManager>>,
) -> Result<(), String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    let path_buf = PathBuf::from(&path);
    
    // 触发预热
    manager.preheat_system().trigger(&path_buf);
    
    // 执行预热任务
    let index_cache = Arc::clone(manager.index_cache());
    let preheat_system = Arc::clone(manager.preheat_system());
    
    // 在后台线程执行预热
    std::thread::spawn(move || {
        preheat_system.execute_preheat(&index_cache);
    });

    Ok(())
}

/// 取消预热任务
#[tauri::command]
pub async fn cancel_preheat(
    state: State<'_, Mutex<BookManager>>,
) -> Result<(), String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    manager.preheat_system().cancel();
    log::info!("已取消预热任务");
    Ok(())
}

/// 取消当前加载
#[tauri::command]
pub async fn cancel_current_load(
    state: State<'_, Mutex<BookManager>>,
) -> Result<(), String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    manager.command_queue().cancel_current();
    log::info!("已取消当前加载");
    Ok(())
}

/// 获取最近加载性能指标
#[tauri::command]
pub async fn get_load_metrics(
    state: State<'_, Mutex<BookManager>>,
) -> Result<Option<LoadMetrics>, String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    Ok(manager.performance_monitor().get_last_metrics())
}
