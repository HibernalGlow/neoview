//! 页面尺寸扫描相关命令

use crate::core::dimension_scanner::{DimensionScanner, DimensionScannerState, ScanResult};
use crate::models::{BookType, Page};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State, command};

#[command]
pub async fn start_dimension_scan(
    book_path: String,
    book_type: BookType,
    pages: Vec<Page>,
    app_handle: AppHandle,
    state: State<'_, DimensionScannerState>,
) -> Result<ScanResult, String> {
    log::info!("📐 [DimensionCommand] 开始扫描书籍: {}", book_path);
    
    let scanner = state.scanner.lock().map_err(|e| e.to_string())?;
    
    // 重置取消令牌
    scanner.reset();
    
    // 执行扫描
    let result = scanner.scan_book(&book_path, &book_type, &pages, Some(&app_handle));
    
    Ok(result)
}

#[command]
pub async fn cancel_dimension_scan(
    state: State<'_, DimensionScannerState>,
) -> Result<(), String> {
    log::info!("📐 [DimensionCommand] 取消扫描");
    let scanner = state.scanner.lock().map_err(|e| e.to_string())?;
    scanner.cancel();
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
