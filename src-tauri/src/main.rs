// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 【修复】强制使用 postMessage 协议，避免 ipc.localhost 连接被拒绝
    // 这在 Windows 上某些环境（如 IIS 运行时）是必要的
    std::env::set_var("TAURI_IPC_PROTOCOL", "postmessage");
    
    app_lib::run();
}
