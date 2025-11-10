use clap::{Parser, Subcommand};
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

use app_lib::core::{ThumbnailManager, ArchiveManager};
use walkdir::WalkDir;

/// 预处理缩略图
fn preprocess_thumbnails(
    root_path: &PathBuf,
    max_size: u32,
    recursive: bool,
    verbose: bool,
) -> Result<(), String> {
    println!("开始预处理缩略图...");
    println!("路径: {}", root_path.display());
    println!("最大尺寸: {}", max_size);
    println!("递归: {}", recursive);
    println!("详细输出: {}", verbose);
    println!();

    let cache_dir = dirs::cache_dir()
        .ok_or("无法获取缓存目录")?
        .join("neoview")
        .join("thumbnails");

    let thumbnail_manager = ThumbnailManager::new(&cache_dir, max_size)
        .map_err(|e| format!("创建缩略图管理器失败: {}", e))?;
    let _archive_manager = ArchiveManager::new();

    let mut processed = 0;
    let mut skipped = 0;
    let mut errors = 0;

    let walker = if recursive {
        WalkDir::new(root_path).into_iter()
    } else {
        walkdir::WalkDir::new(root_path).max_depth(1).into_iter()
    };

    for entry in walker {
        let entry = entry.map_err(|e| format!("遍历目录失败: {}", e))?;
        let path = entry.path();

        // 跳过目录（除非是根目录）
        if path.is_dir() && path != root_path {
            continue;
        }

        if verbose {
            println!("处理: {}", path.display());
        }

        // 检查是否为图片文件
        if let Some(ext) = path.extension() {
            let ext = ext.to_string_lossy().to_lowercase();
            if matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "gif" | "bmp" | "tiff" | "webp" | "avif" | "jxl") {
                match thumbnail_manager.generate_thumbnail(path) {
                    Ok(_) => {
                        processed += 1;
                        if verbose {
                            println!("✓");
                        }
                    }
                    Err(e) => {
                        if e.contains("缩略图已存在") {
                            skipped += 1;
                            if verbose {
                                println!("跳过 (已存在)");
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
        // 检查是否为文件夹
        else if path.is_dir() && path != root_path {
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

    println!();
    println!("预处理完成!");
    println!("处理: {}, 跳过: {}, 错误: {}", processed, skipped, errors);

    Ok(())
}