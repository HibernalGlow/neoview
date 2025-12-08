// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 使用 base64 模式处理 IPC 数据传输问题，无需强制 postMessage
    app_lib::run();
}
