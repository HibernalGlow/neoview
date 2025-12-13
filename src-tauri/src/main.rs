// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 使用 Tauri 官方二进制 IPC 传输图片数据（tauri::ipc::Response）
    app_lib::run();
}
