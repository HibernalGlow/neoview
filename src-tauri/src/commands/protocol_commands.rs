//! Custom Protocol 相关命令
//! 提供路径注册和协议状态管理功能

use crate::core::custom_protocol::{ProtocolState, ScaledProtocolStats};
use crate::core::mmap_archive::MmapCacheStats;
use std::path::PathBuf;
use tauri::State;

/// 注册书籍路径并返回哈希
/// 前端使用此哈希构建 Custom Protocol URL
/// 对于压缩包，会立即预热元数据缓存（首图加载提速）
#[tauri::command]
pub fn register_book_path(path: String, state: State<'_, ProtocolState>) -> Result<String, String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err(format!("路径不存在: {path}"));
    }
    let hash = state.path_registry.register(&path_buf);
    log::debug!("📝 注册路径: {} -> {}", path, hash);

    // 压缩包：立即预热元数据缓存，避免首图请求时的延迟
    let ext = path_buf.extension().and_then(|e| e.to_str()).unwrap_or("");
    if matches!(
        ext.to_lowercase().as_str(),
        "zip" | "rar" | "7z" | "cbz" | "cbr" | "cb7"
    ) {
        let book_key = ProtocolState::parse_book_key(&hash);
        let _ = state.get_or_cache_metadata(book_key, &hash, &path_buf);
    }

    Ok(hash)
}

/// 批量注册路径
#[tauri::command]
pub fn batch_register_paths(
    paths: Vec<String>,
    state: State<'_, ProtocolState>,
) -> Result<Vec<(String, String)>, String> {
    let mut results = Vec::with_capacity(paths.len());
    for path in paths {
        let path_buf = PathBuf::from(&path);
        if path_buf.exists() {
            let hash = state.path_registry.register(&path_buf);
            results.push((path, hash));
        }
    }
    Ok(results)
}

/// 获取内存映射缓存统计
#[tauri::command]
pub fn get_mmap_cache_stats(state: State<'_, ProtocolState>) -> MmapCacheStats {
    state.mmap_cache.stats()
}

#[tauri::command]
pub fn get_scaled_protocol_stats(state: State<'_, ProtocolState>) -> ScaledProtocolStats {
    state.scaled_protocol_stats()
}

/// 清除内存映射缓存
#[tauri::command]
pub fn clear_mmap_cache(state: State<'_, ProtocolState>) {
    state.mmap_cache.clear();
    log::info!("🧹 内存映射缓存已清除");
}

/// 使指定路径的内存映射缓存失效
#[tauri::command]
pub fn invalidate_mmap_cache(path: String, state: State<'_, ProtocolState>) {
    let path_buf = PathBuf::from(&path);
    state.mmap_cache.invalidate(&path_buf);
    log::debug!("🗑️ 内存映射缓存失效: {}", path);
}

/// 清除路径注册表
#[tauri::command]
pub fn clear_path_registry(state: State<'_, ProtocolState>) {
    state.path_registry.clear();
    log::info!("🧹 路径注册表已清除");
}
