//! Thumbnail Commands
//! 缩略图相关的 Tauri 命令
//!
//! 本模块采用模块化结构，将功能分散到多个子模块中：
//! - types: 类型定义
//! - generation: 缩略图生成命令
//! - retrieval: 缩略图检索命令
//! - batch_ops: 批量操作命令
//! - emm_commands: EMM JSON 缓存命令
//! - rating_commands: 评分相关命令
//! - maintenance_commands: 维护相关命令

// 子模块声明（使用 pub mod 以便 tauri 命令宏生成的函数可见）
pub mod batch_ops;
pub mod emm_commands;
pub mod generation;
pub mod maintenance_commands;
pub mod rating_commands;
pub mod retrieval;
pub mod types;

// 重导出类型
pub use types::{FolderMatchKind, FolderScanResult, ThumbnailIndexRequest, ThumbnailIndexResult};

// 重导出生成命令
pub use generation::{
    generate_archive_thumbnail_new, generate_file_thumbnail_new, generate_video_thumbnail_new,
    save_folder_thumbnail,
};

// 重导出检索命令
// [4图预览功能已禁用] 注释 get_folder_preview_thumbnails
pub use retrieval::{
    /* get_folder_preview_thumbnails, */ get_thumbnail_blob_data, has_thumbnail,
    has_thumbnail_by_key_category, load_thumbnail_from_db, load_thumbnail_with_emm_json,
};

// 重导出批量操作命令
pub use batch_ops::{
    batch_load_thumbnails_from_db, batch_preload_thumbnails, preload_thumbnail_index,
    scan_folder_thumbnails,
};

// 重导出 EMM 命令
pub use emm_commands::{
    batch_get_emm_json, batch_save_emm_json, get_all_thumbnail_keys, get_emm_json,
    get_keys_without_emm_json, get_thumbnail_keys_by_prefix, save_emm_json, upsert_with_emm_json,
};

// 重导出评分命令
pub use rating_commands::{
    batch_get_rating_data, batch_save_emm_with_rating_data, calculate_folder_ratings,
    get_rating_data, get_rating_data_by_prefix, update_rating_data,
};

// 重导出维护命令
pub use maintenance_commands::{
    batch_check_failed_thumbnails, batch_count_matching_collect_tags, batch_get_manual_tags,
    batch_load_ai_translations, cleanup_invalid_thumbnails, cleanup_old_failures,
    count_matching_collect_tags, get_ai_translation_count, get_failed_thumbnail, get_manual_tags,
    get_thumbnail_maintenance_stats, load_ai_translation, migrate_thumbnail_db,
    normalize_thumbnail_keys, remove_failed_thumbnail, save_ai_translation, save_failed_thumbnail,
    search_by_tags, update_manual_tags,
};

// 核心依赖导入
use crate::core::blob_registry::BlobRegistry;
use crate::core::thumbnail_db::ThumbnailDb;
use crate::core::thumbnail_generator::{ThumbnailGenerator, ThumbnailGeneratorConfig};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::Manager;

/// 缩略图管理器状态
pub struct ThumbnailState {
    pub db: Arc<ThumbnailDb>,
    pub generator: Arc<ThumbnailGenerator>,
    pub blob_registry: Arc<BlobRegistry>,
}

/// 初始化缩略图管理器
/// 注意：ThumbnailState 已在 lib.rs 启动时初始化，此函数现在仅用于兼容性
/// 如果需要更新配置（如缩略图尺寸），可以在此处实现
#[tauri::command]
pub async fn init_thumbnail_manager(
    app: tauri::AppHandle,
    thumbnail_path: String,
    _root_path: String,
    size: u32,
) -> Result<(), String> {
    // ThumbnailState 已在 lib.rs 启动时初始化
    // 检查状态是否存在
    if app.try_state::<ThumbnailState>().is_some() {
        println!(
            "📁 ThumbnailState 已在启动时初始化，跳过重复初始化 (size: {})",
            size
        );
        return Ok(());
    }

    // 如果状态不存在（理论上不应该发生），则进行初始化
    println!("⚠️ ThumbnailState 未找到，进行初始化...");

    // 使用前端传入的缩略图根目录（前端已做路径规范化），并在此处再做一层兜底：
    // - 如果为空字符串
    // - 或者不是绝对路径
    // 则退回默认路径 D:\temp\neoview
    let raw = thumbnail_path.trim();
    let db_dir = if raw.is_empty() || !Path::new(raw).is_absolute() {
        PathBuf::from("D:\\temp\\neoview")
    } else {
        PathBuf::from(raw)
    };

    // 确保目录存在
    if let Err(e) = std::fs::create_dir_all(&db_dir) {
        eprintln!("⚠️ 创建数据库目录失败: {} - {}", db_dir.display(), e);
        return Err(format!("创建数据库目录失败: {}", e));
    }

    // 创建数据库路径
    let db_path = db_dir.join("thumbnails.db");

    // 输出数据库路径（用于调试）
    println!("📁 缩略图数据库路径: {}", db_path.display());

    // 创建数据库
    let db = Arc::new(ThumbnailDb::new(db_path));

    // 创建生成器配置（根据 CPU 核心数动态调整，提高两倍性能）
    let num_cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let thread_pool_size = (num_cores * 4).max(16).min(32);
    let archive_concurrency = (num_cores * 2).max(4).min(12);

    let config = ThumbnailGeneratorConfig {
        max_width: size,
        max_height: size,
        thread_pool_size,
        archive_concurrency,
    };

    // 创建生成器（已解耦，不依赖 ImageLoader 和 ArchiveManager）
    let generator = Arc::new(ThumbnailGenerator::new(Arc::clone(&db), config));

    // 创建 BlobRegistry（用于管理 blob URL）
    let blob_registry = Arc::new(BlobRegistry::new(1000));

    // 保存到应用状态
    app.manage(ThumbnailState {
        db,
        generator,
        blob_registry,
    });

    Ok(())
}

/// 根据路径推断类别
/// 供其他子模块使用的辅助函数
pub(crate) fn infer_category(path: &str, explicit: Option<String>) -> String {
    if let Some(cat) = explicit {
        return cat;
    }
    if !path.contains("::") && !path.contains('.') {
        "folder".to_string()
    } else {
        "file".to_string()
    }
}
