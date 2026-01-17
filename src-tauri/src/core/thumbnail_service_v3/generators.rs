//! 缩略图生成器模块
//!
//! 包含各类型文件的缩略图生成静态方法和辅助函数

use std::path::Path;
use std::sync::{Arc, Mutex};

use crate::core::thumbnail_db::ThumbnailDb;
use crate::core::thumbnail_generator::ThumbnailGenerator;

use super::log_debug;

/// 生成文件缩略图（静态方法，用于工作线程）
/// 返回 (blob, path_key, size, ghash) 用于延迟保存
pub fn generate_file_thumbnail_static(
    generator: &Arc<ThumbnailGenerator>,
    path: &str,
) -> Result<(Vec<u8>, String, i64, i32), String> {
    generator.generate_file_thumbnail_blob_only(path)
}

/// 生成压缩包缩略图（静态方法，用于工作线程）
/// 返回 (blob, path_key, size, ghash) 用于延迟保存
pub fn generate_archive_thumbnail_static(
    generator: &Arc<ThumbnailGenerator>,
    path: &str,
) -> Result<(Vec<u8>, String, i64, i32), String> {
    // 获取压缩包大小
    let metadata = std::fs::metadata(path).map_err(|e| format!("获取压缩包元数据失败: {}", e))?;
    let archive_size = metadata.len() as i64;

    // 构建路径键
    let path_key = generator.build_path_key(path, None);
    let ghash = ThumbnailGenerator::generate_hash(&path_key, archive_size);

    // 生成缩略图
    let blob = generator.generate_archive_thumbnail(path)?;

    Ok((blob, path_key, archive_size, ghash))
}

/// 生成视频缩略图（静态方法，用于工作线程）
/// 返回 (blob, path_key, size, ghash) 用于延迟保存
pub fn generate_video_thumbnail_static(
    generator: &Arc<ThumbnailGenerator>,
    path: &str,
) -> Result<(Vec<u8>, String, i64, i32), String> {
    // 视频缩略图直接使用 generate_file_thumbnail_blob_only
    // 因为它内部会检测视频文件并调用 ffmpeg
    generator.generate_file_thumbnail_blob_only(path)
}

/// 生成文件夹缩略图（复刻 NeeView 策略）
/// 优化：优先使用已缓存的子文件缩略图绑定，避免文件系统扫描
pub fn generate_folder_thumbnail_static(
    generator: &Arc<ThumbnailGenerator>,
    db: &Arc<ThumbnailDb>,
    folder_path: &str,
    max_depth: u32,
) -> Result<Vec<u8>, String> {
    // 1. 先尝试从数据库加载（可能已有缓存）
    if let Ok(Some(blob)) = db.load_thumbnail_by_key_and_category(folder_path, "folder") {
        return Ok(blob);
    }

    // 2. 【核心优化】尝试绑定已有子文件的缩略图（无需文件系统扫描）
    // 如果文件夹内有任何已缓存的文件缩略图，直接复用其 blob
    if let Ok(Some((child_key, blob))) = db.find_earliest_thumbnail_in_path(folder_path) {
        log_debug!(
            "🔗 绑定已有子文件缩略图到文件夹: {} -> {}",
            folder_path,
            child_key
        );
        // 保存到数据库（作为文件夹类别）
        let _ = db.save_thumbnail_with_category(folder_path, 0, 0, &blob, Some("folder"));
        return Ok(blob);
    }

    // 2.5 【性能优化】大型文件夹跳过：超过1000个文件的目录直接返回错误
    // 避免长时间扫描，用户可以手动进入子目录
    if let Ok(entries) = std::fs::read_dir(folder_path) {
        let count = entries.take(1001).count();
        if count > 1000 {
            log_debug!(
                "⏭️ 大型文件夹跳过缩略图生成: {} (>{} 项)",
                folder_path,
                count
            );
            return Err("大型文件夹，跳过缩略图生成".to_string());
        }
    }

    // 3. 查找封面图片（cover.*, folder.*, thumb.*）- 带权限错误处理
    if let Some(cover) = find_cover_image(folder_path)? {
        match generator.generate_file_thumbnail(&cover) {
            Ok(blob) if !blob.is_empty() => {
                // 保存到数据库
                let _ = db.save_thumbnail_with_category(folder_path, 0, 0, &blob, Some("folder"));
                return Ok(blob);
            }
            Ok(_) => {
                log_debug!("⚠️ 封面图片生成为空: {}", cover);
            }
            Err(e) => {
                log_debug!("⚠️ 封面图片读取失败 (继续尝试其他方法): {} - {}", cover, e);
            }
        }
    }

    // 4. 递归查找第一张图片/压缩包/视频（带权限错误重试）
    let files_found = find_all_images_recursive(folder_path, max_depth, 5)?;
    log_debug!(
        "📂 文件夹 {} 找到 {} 个候选文件",
        folder_path,
        files_found.len()
    );

    for first in files_found {
        // 判断文件类型
        let first_lower = first.to_lowercase();
        let is_archive = first_lower.ends_with(".zip")
            || first_lower.ends_with(".cbz")
            || first_lower.ends_with(".rar")
            || first_lower.ends_with(".cbr")
            || first_lower.ends_with(".7z")
            || first_lower.ends_with(".cb7");
        let is_video = first_lower.ends_with(".mp4")
            || first_lower.ends_with(".mkv")
            || first_lower.ends_with(".avi")
            || first_lower.ends_with(".mov")
            || first_lower.ends_with(".webm")
            || first_lower.ends_with(".wmv")
            || first_lower.ends_with(".flv")
            || first_lower.ends_with(".m4v");

        let result = if is_archive {
            generator.generate_archive_thumbnail(&first)
        } else if is_video {
            generator.generate_file_thumbnail(&first)
        } else {
            generator.generate_file_thumbnail(&first)
        };

        // 如果成功生成，保存并返回
        if let Ok(blob) = result {
            if !blob.is_empty() {
                let _ = db.save_thumbnail_with_category(folder_path, 0, 0, &blob, Some("folder"));
                return Ok(blob);
            }
        } else {
            log_debug!("⚠️ 跳过无法访问的文件: {} - {:?}", first, result.err());
        }
    }

    // 5. 没有找到可访问的图片，记录失败并返回错误
    log_debug!("📭 文件夹 {} 中没有找到可访问的图片", folder_path);
    let _ = db.save_failed_thumbnail(
        folder_path,
        "no_accessible_image",
        0,
        Some("文件夹中没有找到可访问的图片"),
    );
    Err("文件夹中没有找到可访问的图片".to_string())
}

/// 查找封面图片（cover.*, folder.*, thumb.*）
pub fn find_cover_image(folder: &str) -> Result<Option<String>, String> {
    let patterns = ["cover", "folder", "thumb"];
    let image_exts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif", "jxl"];

    // 优雅处理权限错误
    let entries = match std::fs::read_dir(folder) {
        Ok(e) => e,
        Err(e) => {
            log_debug!("⚠️ 无法读取目录 (可能权限不足): {} - {}", folder, e);
            return Ok(None);
        }
    };

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_lowercase();

        for pattern in &patterns {
            if name.starts_with(pattern) {
                if let Some(ext) = Path::new(&name).extension() {
                    let ext = ext.to_string_lossy().to_lowercase();
                    if image_exts.contains(&ext.as_str()) {
                        return Ok(Some(entry.path().to_string_lossy().to_string()));
                    }
                }
            }
        }
    }

    Ok(None)
}

/// 递归查找多张图片/压缩包/视频（用于权限错误重试）
pub fn find_all_images_recursive(
    folder: &str,
    depth: u32,
    max_count: usize,
) -> Result<Vec<String>, String> {
    let mut results = Vec::new();
    find_images_recursive_impl(folder, depth, max_count, &mut results);
    Ok(results)
}

/// 递归查找图片的内部实现
fn find_images_recursive_impl(
    folder: &str,
    depth: u32,
    max_count: usize,
    results: &mut Vec<String>,
) {
    if depth == 0 || results.len() >= max_count {
        return;
    }

    let image_exts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif", "jxl"];
    let archive_exts = ["zip", "cbz", "rar", "cbr", "7z", "cb7"];
    let video_exts = ["mp4", "mkv", "avi", "mov", "webm", "wmv", "flv", "m4v"];

    let entries = match std::fs::read_dir(folder) {
        Ok(e) => e,
        Err(e) => {
            log_debug!("⚠️ 无法读取目录 (可能权限不足): {} - {}", folder, e);
            return;
        }
    };

    let mut sorted_entries: Vec<_> = entries.flatten().collect();
    sorted_entries.sort_by(|a, b| a.file_name().cmp(&b.file_name()));

    for entry in sorted_entries {
        if results.len() >= max_count {
            break;
        }

        let path = entry.path();

        if path.is_file() {
            if let Some(ext) = path.extension() {
                let ext = ext.to_string_lossy().to_lowercase();
                if image_exts.contains(&ext.as_str())
                    || archive_exts.contains(&ext.as_str())
                    || video_exts.contains(&ext.as_str())
                {
                    results.push(path.to_string_lossy().to_string());
                }
            }
        } else if path.is_dir() {
            find_images_recursive_impl(&path.to_string_lossy(), depth - 1, max_count, results);
        }
    }
}

// [4图预览功能已禁用]
// /// 获取文件夹前 N 张图片路径（用于 4 图预览）
// /// 返回 Vec<String>，最多返回 count 个图片路径
// /// 如果 count == 1，优先返回封面图片；否则返回多张图片（封面作为第一张）
// pub fn get_folder_preview_images(
//     folder_path: &str,
//     count: usize,
// ) -> Result<Vec<String>, String> {
//     println!("📂 [4图预览] 请求: folder={}, count={}", folder_path, count);
//
//     // count == 1 时：单图模式，优先封面
//     if count == 1 {
//         if let Ok(Some(cover)) = find_cover_image(folder_path) {
//             println!("📂 [4图预览] 单图模式，找到封面: {}", cover);
//             return Ok(vec![cover]);
//         }
//         // 没有封面，找第一张图片
//         let mut results = Vec::new();
//         find_images_only_recursive(folder_path, 3, 1, &mut results, true);
//         println!("📂 [4图预览] 单图模式，找到 {} 张图片", results.len());
//         return Ok(results);
//     }
//
//     // count > 1 时：多图预览模式，排除封面图片
//     let mut results = Vec::new();
//     find_images_only_recursive(folder_path, 3, count, &mut results, false); // 排除封面
//
//     println!("📂 [4图预览] 多图模式，找到 {} 张图片: {:?}", results.len(), results);
//
//     Ok(results)
// }

// [4图预览功能已禁用]
// /// 递归查找图片文件（仅图片，不包含压缩包和视频）
// /// include_cover: 是否包含封面图片（cover.*, folder.*, thumb.*）
// fn find_images_only_recursive(
//     folder: &str,
//     depth: u32,
//     max_count: usize,
//     results: &mut Vec<String>,
//     include_cover: bool,
// ) {
//     if depth == 0 || results.len() >= max_count {
//         return;
//     }
//
//     let image_exts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif", "jxl"];
//     let cover_patterns = ["cover", "folder", "thumb"];
//
//     let entries = match std::fs::read_dir(folder) {
//         Ok(e) => e,
//         Err(_) => return,
//     };
//
//     let mut sorted_entries: Vec<_> = entries.flatten().collect();
//     sorted_entries.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
//
//     let mut subdirs = Vec::new();
//
//     // 先收集当前目录的图片
//     for entry in &sorted_entries {
//         if results.len() >= max_count {
//             break;
//         }
//
//         let path = entry.path();
//
//         if path.is_file() {
//             if let Some(ext) = path.extension() {
//                 let ext = ext.to_string_lossy().to_lowercase();
//                 if image_exts.contains(&ext.as_str()) {
//                     // 检查是否需要排除封面
//                     if !include_cover {
//                         let name = entry.file_name().to_string_lossy().to_lowercase();
//                         let is_cover = cover_patterns.iter().any(|p| name.starts_with(p));
//                         if is_cover {
//                             continue; // 跳过封面图片
//                         }
//                     }
//                     results.push(path.to_string_lossy().to_string());
//                 }
//             }
//         } else if path.is_dir() {
//             subdirs.push(path);
//         }
//     }
//
//     // 如果还不够，递归子目录
//     for subdir in subdirs {
//         if results.len() >= max_count {
//             break;
//         }
//         find_images_only_recursive(
//             &subdir.to_string_lossy(),
//             depth - 1,
//             max_count,
//             results,
//             include_cover,
//         );
//     }
// }
