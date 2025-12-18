//! ``NeoView`` - Main Library
//! Tauri 应用程序主入口
//! 精简版：大部分功能已迁移到 Python FastAPI 后端

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// 抑制开发阶段的未使用代码警告
#![allow(dead_code)]
#![allow(unused_imports)]
#![allow(unused_variables)]

mod commands;
mod tray;

use tauri::Manager;

#[allow(clippy::missing_panics_doc)]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 设置 panic hook 以捕获崩溃信息
    std::panic::set_hook(Box::new(|panic_info| {
        let msg = format!("PANIC: {panic_info}");
        log::error!("{msg}");
        
        // 尝试写入日志文件
        if let Ok(app_data) = std::env::var("APPDATA") {
            let log_path = std::path::PathBuf::from(app_data)
                .join("NeoView")
                .join("logs")
                .join("panic.log");
            if let Some(parent) = log_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
            let log_entry = format!("[{timestamp}] {msg}\n");
            let _ = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_path)
                .and_then(|mut file| {
                    use std::io::Write;
                    file.write_all(log_entry.as_bytes())
                });
        }
    }));

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_x::init())
        .setup(|app| {
            log::info!("🚀 NeoView 启动中（精简模式，使用 Python FastAPI 后端）");

            // 初始化系统托盘
            if let Err(e) = tray::init_tray_safe(app.handle()) {
                log::warn!("⚠️ 托盘初始化返回错误: {e}");
            }

            log::info!("🎉 NeoView 初始化完成");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 资源管理器右键菜单命令（桌面特有功能）
            commands::get_explorer_context_menu_enabled,
            commands::set_explorer_context_menu_enabled,
            commands::generate_explorer_context_menu_reg,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            match &event {
                tauri::RunEvent::Ready => {
                    log::info!("🎉 应用就绪");
                }
                tauri::RunEvent::ExitRequested { code, .. } => {
                    log::info!("📤 应用退出请求, code: {code:?}");
                }
                tauri::RunEvent::WindowEvent { label, event, .. } => {
                    match event {
                        tauri::WindowEvent::CloseRequested { .. } => {
                            log::info!("🪟 窗口 {label} 关闭请求");
                        }
                        tauri::WindowEvent::Destroyed => {
                            log::info!("🪟 窗口 {label} 已销毁");
                        }
                        _ => {}
                    }
                }
                _ => {}
            }
        });
}
