// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::{Parser, Subcommand};
use std::env;
use std::path::PathBuf;

/// NeoView - 图像查看器
#[derive(Parser)]
#[command(name = "neoview")]
#[command(about = "NeoView 图像查看器和缩略图预处理器")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// 运行GUI应用程序
    Gui,
    /// 预处理缩略图
    Preprocess {
        /// 要处理的目录路径
        #[arg(short, long)]
        path: PathBuf,
        /// 缩略图最大尺寸
        #[arg(short, long, default_value = "256")]
        size: u32,
        /// 是否递归处理子目录
        #[arg(short, long)]
        recursive: bool,
        /// 是否显示进度
        #[arg(short, long)]
        verbose: bool,
    },
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Gui) | None => {
            // 默认运行GUI应用
            app_lib::run();
        }
        Some(Commands::Preprocess { path, size, recursive, verbose }) => {
            // 运行缩略图预处理
            if let Err(e) = preprocess_thumbnails(&path, size, recursive, verbose) {
                eprintln!("预处理失败: {}", e);
                std::process::exit(1);
            }
        }
    }
}

/// 预处理缩略图
fn preprocess_thumbnails(
    root_path: &PathBuf,
    max_size: u32,
    recursive: bool,
    verbose: bool,
) -> Result<(), String> {
    use std::fs;
    use walkdir::WalkDir;
    use app_lib::core::{ThumbnailManager, ArchiveManager};

    if verbose {
        println!("开始预处理缩略图...");
        println!("路径: {}", root_path.display());
        println!("尺寸: {}x{}", max_size, max_size);
        println!("递归: {}", recursive);
    }

    // 创建缩略图管理器
    let cache_dir = dirs::cache_dir()
        .unwrap_or_else(|| PathBuf::from(".cache"))
        .join("neoview")
        .join("thumbnails");
    let thumbnail_manager = ThumbnailManager::new(&cache_dir, max_size)
        .map_err(|e| format!("创建缩略图管理器失败: {}", e))?;

    let archive_manager = ArchiveManager::new();

    let mut processed = 0;
    let mut skipped = 0;
    let mut errors = 0;

    // 遍历目录
    let walker = if recursive {
        WalkDir::new(root_path).into_iter()
    } else {
        WalkDir::new(root_path).max_depth(1).into_iter()
    };

    for entry in walker {
        let entry = entry.map_err(|e| format!("读取目录条目失败: {}", e))?;
        let path = entry.path();

        // 跳过目录本身
        if path == root_path {
            continue;
        }

        let file_name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown");

        if verbose {
            print!("处理: {} ... ", file_name);
        }

        // 检查是否为文件夹
        if path.is_dir() {
            match thumbnail_manager.generate_folder_thumbnail_force(path, max_size) {
                Ok(_) => {
                    processed += 1;
                    if verbose {
                        println!("✓");
                    }
                }
                Err(e) => {
                    if e.contains("未找到可用的图片") {
                        skipped += 1;
                        if verbose {
                            println!("跳过 (无图片)");
                        }
                    } else {
                        errors += 1;
                        if verbose {
                            println!("✗ ({})", e);
                        }
                    }
                }
            }
        }
        // 检查是否为压缩包
        else if ArchiveManager::is_supported_archive(path) {
            match thumbnail_manager.generate_archive_thumbnail_force(path, max_size) {
                Ok(_) => {
                    processed += 1;
                    if verbose {
                        println!("✓");
                    }
                }
                Err(e) => {
                    if e.contains("未找到图片文件") {
                        skipped += 1;
                        if verbose {
                            println!("跳过 (无图片)");
                        }
                    } else {
                        errors += 1;
                        if verbose {
                            println!("✗ ({})", e);
                        }
                    }
                }
            }
        }
    }

    println!("\n预处理完成!");
    println!("处理成功: {}", processed);
    println!("跳过: {}", skipped);
    println!("错误: {}", errors);

    Ok(())
}
