//! 启动初始化模块
//! 处理应用启动时的目录创建、错误恢复等逻辑

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// 启动错误类型
#[derive(Debug, Clone)]
pub enum StartupError {
    /// 目录创建失败
    DirectoryCreationFailed(String),
    /// 数据库初始化失败
    DatabaseInitFailed(String),
    /// 托盘初始化失败
    TrayInitFailed(String),
}

impl std::fmt::Display for StartupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DirectoryCreationFailed(msg) => write!(f, "目录创建失败: {msg}"),
            Self::DatabaseInitFailed(msg) => write!(f, "数据库初始化失败: {msg}"),
            Self::TrayInitFailed(msg) => write!(f, "托盘初始化失败: {msg}"),
        }
    }
}

impl std::error::Error for StartupError {}

/// 启动诊断信息
#[derive(Debug, Clone)]
pub struct StartupDiagnostics {
    pub app_data_path: PathBuf,
    pub used_fallback: bool,
    pub directories_created: Vec<String>,
}

/// 确保应用数据目录存在
///
/// 尝试创建标准 AppData 目录，如果失败则使用临时目录作为回退
pub fn ensure_app_directories<R: tauri::Runtime>(
    app: &AppHandle<R>,
) -> Result<StartupDiagnostics, StartupError> {
    let mut diagnostics = StartupDiagnostics {
        app_data_path: PathBuf::new(),
        used_fallback: false,
        directories_created: Vec::new(),
    };

    // 1. 尝试获取标准 AppData 目录
    let app_data_root = match app.path().app_data_dir() {
        Ok(path) => {
            log::info!("📁 AppData 目录: {}", path.display());
            path
        }
        Err(e) => {
            log::warn!("⚠️ 无法获取 AppData 目录: {e}，使用临时目录");
            diagnostics.used_fallback = true;
            get_fallback_directory()
        }
    };

    // 2. 确保主目录存在
    if let Err(e) = std::fs::create_dir_all(&app_data_root) {
        log::warn!("⚠️ 无法创建 AppData 目录: {e}，尝试使用临时目录");
        diagnostics.used_fallback = true;
        let fallback = get_fallback_directory();
        if let Err(e2) = std::fs::create_dir_all(&fallback) {
            return Err(StartupError::DirectoryCreationFailed(format!(
                "无法创建任何数据目录: 主目录错误={e}, 临时目录错误={e2}"
            )));
        }
        diagnostics.app_data_path = fallback;
    } else {
        diagnostics.app_data_path = app_data_root;
    }

    // 3. 创建所有必需的子目录
    let subdirs = ["thumbnails", "logs", "cache", "upscale_cache"];
    for subdir in &subdirs {
        let path = diagnostics.app_data_path.join(subdir);
        match std::fs::create_dir_all(&path) {
            Ok(_) => {
                diagnostics.directories_created.push(subdir.to_string());
                log::debug!("📂 创建子目录: {}", path.display());
            }
            Err(e) => {
                log::warn!("⚠️ 无法创建子目录 {subdir}: {e}");
                // 子目录创建失败不是致命错误，继续
            }
        }
    }

    log::info!(
        "✅ 目录初始化完成: {} (回退模式: {})",
        diagnostics.app_data_path.display(),
        diagnostics.used_fallback
    );

    Ok(diagnostics)
}

/// 获取回退目录（临时目录）
fn get_fallback_directory() -> PathBuf {
    std::env::temp_dir().join("neoview_data")
}

/// 写入启动日志到文件
pub fn write_startup_log(app_data_path: &PathBuf, message: &str) {
    let log_path = app_data_path.join("logs").join("startup.log");

    // 确保日志目录存在
    if let Some(parent) = log_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let log_entry = format!("[{timestamp}] {message}\n");

    // 追加写入日志文件
    if let Err(e) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .and_then(|mut file| {
            use std::io::Write;
            file.write_all(log_entry.as_bytes())
        })
    {
        log::warn!("无法写入启动日志: {e}");
    }
}

/// 显示启动错误对话框（仅在关键错误时使用）
///
/// 注意：此函数会阻塞直到用户关闭对话框
/// 使用原生 Windows API 显示消息框
#[cfg(windows)]
pub fn show_startup_error_dialog(title: &str, message: &str) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    // 将字符串转换为宽字符
    fn to_wide(s: &str) -> Vec<u16> {
        OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    let title_wide = to_wide(title);
    let message_wide = to_wide(message);

    // 使用 extern 直接调用 Windows API
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            hwnd: *mut std::ffi::c_void,
            text: *const u16,
            caption: *const u16,
            utype: u32,
        ) -> i32;
    }

    unsafe {
        // MB_OK | MB_ICONERROR = 0x10
        MessageBoxW(
            std::ptr::null_mut(),
            message_wide.as_ptr(),
            title_wide.as_ptr(),
            0x10,
        );
    }
}

#[cfg(not(windows))]
pub fn show_startup_error_dialog(title: &str, message: &str) {
    // 非 Windows 平台只记录日志
    log::error!("{title}: {message}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_fallback_directory() {
        let fallback = get_fallback_directory();
        assert!(fallback.ends_with("neoview_data"));
    }
}
