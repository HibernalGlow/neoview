//! Windows Shell 缩略图获取
//! 使用 IShellItemImageFactory 接口直接获取 Windows 已缓存的缩略图
//! 
//! 注意：需要 windows crate 启用 Win32_UI_Shell 特性
//! 当前暂时使用简化实现，后续可添加完整的 Shell API 支持

#[cfg(target_os = "windows")]
use std::path::Path;

/// 从 Windows Shell 获取缩略图
/// 这会利用 Windows 已缓存的缩略图，非常快速
/// 
/// 当前实现：简化版，直接返回错误让调用方回退到自定义生成
/// TODO: 完整实现需要添加 windows crate 的 Win32_UI_Shell 特性
#[cfg(target_os = "windows")]
pub fn get_shell_thumbnail(_file_path: &Path, _size: u32) -> Result<Vec<u8>, String> {
    // 暂时禁用 Shell API，使用自定义生成
    // 原因：需要额外的 windows crate 特性配置
    Err("Shell thumbnail temporarily disabled".to_string())
}

/// 快速检查 Windows 是否有该文件的缓存缩略图
#[cfg(target_os = "windows")]
pub fn has_shell_thumbnail(_file_path: &Path) -> bool {
    false
}

// 非 Windows 平台的存根
#[cfg(not(target_os = "windows"))]
pub fn get_shell_thumbnail(_file_path: &std::path::Path, _size: u32) -> Result<Vec<u8>, String> {
    Err("Shell thumbnail only available on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn has_shell_thumbnail(_file_path: &std::path::Path) -> bool {
    false
}
