// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// 🚀 使用 mimalloc 高性能内存分配器
// 相比系统分配器，可减少内存碎片，提升分配速度 2-3x
use mimalloc::MiMalloc;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

fn main() {
    // 读取启动配置，判断是否启用原生 JXL 解码
    // 须在 Tauri 初始化前设置，因为 WebView2 参数只在创建时生效
    if let Some(app_data) = dirs::config_dir() {
        let config_path = app_data.join("NeoView").join("config.json");
        if let Ok(content) = std::fs::read_to_string(&config_path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                if val
                    .get("nativeJxl")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
                {
                    std::env::set_var(
                        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                        "--enable-jxl-image-format",
                    );
                }
            }
        }
    }

    // 使用 base64 模式处理 IPC 数据传输问题，无需强制 postMessage
    app_lib::run();
}
