//! System Tray Module
//! 系统托盘功能模块

use tauri::{
    AppHandle, 
    Manager, 
    Runtime,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Emitter,
};

/// 创建托盘菜单
pub fn create_tray_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "隐藏窗口", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出 NeoView", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &show_item,
            &hide_item,
            &separator,
            &quit_item,
        ],
    )?;

    Ok(menu)
}

/// 初始化系统托盘
pub fn init_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = create_tray_menu(app)?;
    
    let tray = TrayIconBuilder::new()
        .menu(&menu)
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("NeoView - 现代图像与漫画查看器")
        .on_menu_event(move |app, event| {
            match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "hide" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            match event {
                TrayIconEvent::Click {
                    button: tauri::tray::MouseButton::Left,
                    button_state: tauri::tray::MouseButtonState::Up,
                    ..
                } => {
                    let app = tray.app_handle();
                    if let Some(window) = app.get_webview_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
                TrayIconEvent::DoubleClick {
                    button: tauri::tray::MouseButton::Left,
                    ..
                } => {
                    let app = tray.app_handle();
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}

/// 更新托盘菜单的可见性状态
pub fn update_tray_menu<R: Runtime>(app: &AppHandle<R>, is_visible: bool) -> tauri::Result<()> {
    // 这里可以根据窗口的可见性状态来更新托盘菜单项的启用/禁用状态
    // 由于当前的实现比较简单，可以在未来扩展
    Ok(())
}

/// 安全初始化系统托盘
/// 如果初始化失败，不会导致应用崩溃，而是记录错误并继续
pub fn init_tray_safe<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    match init_tray(app) {
        Ok(_) => {
            log::info!("📌 系统托盘初始化成功");
            Ok(())
        }
        Err(e) => {
            log::warn!("⚠️ 系统托盘初始化失败，继续无托盘模式: {e}");
            // 不返回错误，允许应用继续运行
            Ok(())
        }
    }
}
