// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// 🚀 使用 mimalloc 高性能内存分配器
// 相比系统分配器，可减少内存碎片，提升分配速度 2-3x
use mimalloc::MiMalloc;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

fn main() {
    // 🚀 启用 JXL 硬件解码支持 (Chromium 145+)
    // 为了提升内存安全性，谷歌采用了基于 Rust 编写的 jxl-rs 解码器
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--enable-jxl-image-format",
    );

    // 使用 base64 模式处理 IPC 数据传输问题，无需强制 postMessage
    app_lib::run();
}
