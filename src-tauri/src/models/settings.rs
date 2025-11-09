//! NeoView - Settings Models
//! 应用设置相关的 Rust 数据模型

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ThemeMode {
    Light,
    Dark,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Language {
    En,
    #[serde(rename = "zh-CN")]
    ZhCn,
    Ja,
    Ko,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerSettings {
    /// 背景颜色
    pub background_color: String,
    /// 是否显示网格
    pub show_grid: bool,
    /// 缩放模式
    pub zoom_mode: String,
    /// 自定义缩放比例
    pub custom_zoom: f64,
    /// 平滑缩放
    pub smooth_zoom: bool,
    /// 是否允许放大超过原始大小
    pub allow_zoom_beyond_original: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UISettings {
    /// 主题模式
    pub theme: ThemeMode,
    /// 语言
    pub language: Language,
    /// 是否全屏
    pub fullscreen: bool,
    /// 是否显示标题栏
    pub show_title_bar: bool,
    /// 是否显示状态栏
    pub show_status_bar: bool,
    /// 是否显示侧边栏
    pub show_sidebar: bool,
    /// 侧边栏宽度
    pub sidebar_width: u32,
    /// 侧边栏位置
    pub sidebar_position: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceSettings {
    /// 缓存大小 (MB)
    pub cache_size: u32,
    /// 预加载页面数
    pub preload_pages: u32,
    /// 是否启用硬件加速
    pub hardware_acceleration: bool,
    /// 最大并发加载数
    pub max_concurrent_loads: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardShortcut {
    /// 命令ID
    pub command: String,
    /// 按键组合
    pub keys: String,
    /// 描述
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowPosition {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    /// 查看器设置
    pub viewer: ViewerSettings,
    /// UI设置
    pub ui: UISettings,
    /// 性能设置
    pub performance: PerformanceSettings,
    /// 键盘快捷键
    pub shortcuts: Vec<KeyboardShortcut>,
    /// 窗口位置
    pub window_position: Option<WindowPosition>,
}

impl Default for ViewerSettings {
    fn default() -> Self {
        Self {
            background_color: "#000000".to_string(),
            show_grid: false,
            zoom_mode: "fitScreen".to_string(),
            custom_zoom: 1.0,
            smooth_zoom: true,
            allow_zoom_beyond_original: false,
        }
    }
}

impl Default for UISettings {
    fn default() -> Self {
        Self {
            theme: ThemeMode::System,
            language: Language::En,
            fullscreen: false,
            show_title_bar: true,
            show_status_bar: true,
            show_sidebar: true,
            sidebar_width: 250,
            sidebar_position: "left".to_string(),
        }
    }
}

impl Default for PerformanceSettings {
    fn default() -> Self {
        Self {
            cache_size: 512,
            preload_pages: 3,
            hardware_acceleration: true,
            max_concurrent_loads: 4,
        }
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            viewer: ViewerSettings::default(),
            ui: UISettings::default(),
            performance: PerformanceSettings::default(),
            shortcuts: Vec::new(),
            window_position: None,
        }
    }
}
