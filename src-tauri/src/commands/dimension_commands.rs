//! 页面尺寸扫描相关命令

use crate::core::dimension_scanner::{DimensionScannerState, ScanResult};
use crate::models::{BookType, Page};
use std::sync::Arc;
use tauri::{AppHandle, State, command, async_runtime::spawn_blocking};

#[command]
pub async fn start_dimension_scan(
    book_path: String,
    book_type: BookType,
    pages: Vec<Page>,
    app_handle: AppHandle,
    state: State<'_, DimensionScannerState>,
) -> Result<ScanResult, String> {
    log::info!("📐 [DimensionCommand] 调度书籍尺寸扫描: {book_path}");
    
    let scanner_arc = Arc::clone(&state.scanner);
    let scan_guard_arc = Arc::clone(&state.scan_guard);
    
    // 使用 spawn_blocking 避免阻塞异步运行时线程
    // 这样第一张图片的加载请求（ipc）就不需要等待扫描器释放 CPU 核心
    let result = spawn_blocking(move || {
        let _scan_guard = scan_guard_arc.lock().map_err(|e| e.to_string())?;
        
        // 重置取消令牌
        scanner_arc.reset();
        
        // 执行扫描
        Ok::<ScanResult, String>(scanner_arc.scan_book(&book_path, &book_type, &pages, Some(&app_handle)))
    })
    .await
    .map_err(|e| format!("spawn_blocking error: {e}"))??;
    
    Ok(result)
}


#[command]
pub async fn cancel_dimension_scan(
    state: State<'_, DimensionScannerState>,
) -> Result<(), String> {
    log::info!("📐 [DimensionCommand] 取消扫描");
    state.scanner.cancel();
    Ok(())
}

#[command]
pub async fn get_cached_dimensions(
    stable_hash: String,
    modified: Option<i64>,
    state: State<'_, DimensionScannerState>,
) -> Result<Option<(u32, u32)>, String> {
    let cache = state.cache.lock().map_err(|e| e.to_string())?;
    Ok(cache.get(&stable_hash, modified))
}
