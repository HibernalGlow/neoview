// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// 🚀 使用 mimalloc 高性能内存分配器
// 相比系统分配器，可减少内存碎片，提升分配速度 2-3x
use mimalloc::MiMalloc;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

fn main() {
    // 使用 base64 模式处理 IPC 数据传输问题，无需强制 postMessage
    app_lib::run();
}
