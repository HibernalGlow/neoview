//! 基准测试命令模块
//! 用于测试不同图像解码方法的性能
//!
//! 本模块包含以下子模块：
//! - types: 所有基准测试相关的数据类型定义
//! - thumbnail_benchmark: 缩略图生成基准测试函数
//! - image_benchmark: 图像解码和加载模式测试命令
//! - archive_benchmark: 压缩包扫描和缩略图提取测试命令
//! - wic_benchmark: WIC + LZ4 压缩传输测试命令
//! - realworld_benchmark: 真实场景模拟和转码测试命令

// 子模块声明
pub mod types;
pub mod thumbnail_benchmark;
pub mod image_benchmark;
pub mod archive_benchmark;
pub mod wic_benchmark;
pub mod realworld_benchmark;

// 重导出类型
pub use types::*;

// 重导出缩略图基准测试函数
pub use thumbnail_benchmark::{
    generate_thumbnail_with_image_crate,
    decode_jxl_for_benchmark,
};

#[cfg(target_os = "windows")]
pub use thumbnail_benchmark::{
    generate_thumbnail_with_wic,
    generate_thumbnail_with_wic_fast,
    generate_thumbnail_with_format,
};

// 重导出图像基准测试命令（包括 Tauri 宏生成的函数）
pub use image_benchmark::*;

// 重导出压缩包基准测试命令（包括 Tauri 宏生成的函数）
pub use archive_benchmark::*;

// 重导出 WIC 基准测试命令和缓存（包括 Tauri 宏生成的函数）
pub use wic_benchmark::*;

// 重导出真实场景基准测试命令（包括 Tauri 宏生成的函数）
pub use realworld_benchmark::*;
