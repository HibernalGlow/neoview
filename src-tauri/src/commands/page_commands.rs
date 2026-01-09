//! `NeoView` - Page Commands
//! 简化的页面加载 API，后端主导，前端只发请求
//!
//! NOTE: PageFrame 命令已迁移到前端本地计算 (2024-01)
//! 请使用前端的 pageFrameStore 进行布局计算

use crate::core::page_frame::{PageFrame, PagePosition};
use crate::core::page_manager::{
    BookInfo, MemoryPoolStats, PageContentManager, PageInfo, PageManagerStats, ThumbnailItem,
    ThumbnailReadyEvent,
};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

/// 页面管理器状态
pub struct PageManagerState {
    pub manager: Arc<Mutex<PageContentManager>>,
}

// ===== 书籍操作命令 =====

/// 打开书籍
///
/// 后端自动：
/// - 扫描书籍内容
/// - 初始化缓存
/// - 取消旧书籍的加载任务
#[tauri::command]
pub async fn pm_open_book(
    path: String,
    state: State<'_, PageManagerState>,
) -> Result<BookInfo, String> {
    log::info!("📖 [PageCommand] open_book: {}", path);
    let mut manager = state.manager.lock().await;
    manager.open_book(&path).await
}

/// 关闭书籍
#[tauri::command]
pub async fn pm_close_book(state: State<'_, PageManagerState>) -> Result<(), String> {
    log::info!("📖 [PageCommand] close_book");
    let mut manager = state.manager.lock().await;
    manager.close_book().await;
    Ok(())
}

/// 获取当前书籍信息
#[tauri::command]
pub async fn pm_get_book_info(
    state: State<'_, PageManagerState>,
) -> Result<Option<BookInfo>, String> {
    let manager = state.manager.lock().await;
    Ok(manager.current_book_info())
}

// ===== 页面操作命令 =====

/// 跳转到指定页面
///
/// 后端自动：
/// - 检查缓存，缓存命中直接返回
/// - 缓存未命中则加载
/// - 自动提交预加载任务
#[tauri::command]
pub async fn pm_goto_page(
    index: usize,
    state: State<'_, PageManagerState>,
) -> Result<tauri::ipc::Response, String> {
    log::debug!("📄 [PageCommand] goto_page: {}", index);

    let mut manager = state.manager.lock().await;
    let (data, result) = manager.goto_page(index).await?;

    log::debug!(
        "📄 [PageCommand] goto_page complete: index={}, size={}, cache_hit={}",
        result.index,
        result.size,
        result.cache_hit
    );

    Ok(tauri::ipc::Response::new(data))
}

/// 获取页面数据（不改变当前页）
#[tauri::command]
pub async fn pm_get_page(
    index: usize,
    state: State<'_, PageManagerState>,
) -> Result<tauri::ipc::Response, String> {
    log::debug!("📄 [PageCommand] get_page: {}", index);

    let mut manager = state.manager.lock().await;
    let (data, _result) = manager.get_page(index).await?;

    Ok(tauri::ipc::Response::new(data))
}

// ===== Base64 版本（用于 postMessage 回退时优化传输） =====

use base64::{engine::general_purpose::STANDARD, Engine};

/// 跳转到指定页面（Base64 编码，用于 postMessage 优化）
#[tauri::command]
pub async fn pm_goto_page_base64(
    index: usize,
    state: State<'_, PageManagerState>,
) -> Result<String, String> {
    log::debug!("📄 [PageCommand] goto_page_base64: {}", index);

    let mut manager = state.manager.lock().await;
    let (data, result) = manager.goto_page(index).await?;

    log::debug!(
        "📄 [PageCommand] goto_page_base64 complete: index={}, size={}, cache_hit={}",
        result.index,
        result.size,
        result.cache_hit
    );

    Ok(STANDARD.encode(&data))
}

/// 获取页面数据（Base64 编码，用于 postMessage 优化）
#[tauri::command]
pub async fn pm_get_page_base64(
    index: usize,
    state: State<'_, PageManagerState>,
) -> Result<String, String> {
    log::debug!("📄 [PageCommand] get_page_base64: {}", index);

    let mut manager = state.manager.lock().await;
    let (data, _result) = manager.get_page(index).await?;

    Ok(STANDARD.encode(&data))
}

/// 获取页面信息（元数据，不含图片数据）
#[tauri::command]
pub async fn pm_get_page_info(
    index: usize,
    state: State<'_, PageManagerState>,
) -> Result<crate::core::page_manager::PageInfo, String> {
    let manager = state.manager.lock().await;

    // 从 PageContentManager 获取页面信息
    manager
        .get_page_info(index)
        .ok_or_else(|| format!("页面 {} 不存在", index))
}

// ===== 状态查询命令 =====

/// 获取页面管理器统计
#[tauri::command]
pub async fn pm_get_stats(state: State<'_, PageManagerState>) -> Result<PageManagerStats, String> {
    let manager = state.manager.lock().await;
    Ok(manager.stats().await)
}

/// 获取内存池统计
#[tauri::command]
pub async fn pm_get_memory_stats(
    state: State<'_, PageManagerState>,
) -> Result<MemoryPoolStats, String> {
    let manager = state.manager.lock().await;
    let stats = manager.stats().await;
    Ok(stats.memory)
}

// ===== 缓存操作命令 =====

/// 清除所有缓存
#[tauri::command]
pub async fn pm_clear_cache(state: State<'_, PageManagerState>) -> Result<(), String> {
    log::info!("🧹 [PageCommand] clear_cache");
    let mut manager = state.manager.lock().await;
    manager.clear_cache().await;
    Ok(())
}

/// 触发预加载（非阻塞）
#[tauri::command]
pub async fn pm_trigger_preload(state: State<'_, PageManagerState>) -> Result<(), String> {
    log::debug!("⚡ [PageCommand] trigger_preload");
    let manager = state.manager.lock().await;
    manager.trigger_preload().await;
    Ok(())
}

/// 【性能优化】查询页面缓存状态
///
/// 返回指定范围内每个页面是否在缓存中（轻量级，不加载数据）
/// 前端可用于智能预加载决策，避免重复请求已缓存的页面
#[tauri::command]
pub async fn pm_get_cache_status(
    start_page: usize,
    count: usize,
    state: State<'_, PageManagerState>,
) -> Result<Vec<bool>, String> {
    let manager = state.manager.lock().await;
    let statuses: Vec<bool> = (start_page..start_page + count)
        .map(|i| manager.is_page_cached(i))
        .collect();
    Ok(statuses)
}

// ===== 视频命令 =====

/// 获取视频文件路径
///
/// 对于压缩包内的视频，自动提取到临时文件并返回路径
/// 前端可以使用 convertFileSrc() 转换为可用的 URL
#[tauri::command]
pub async fn pm_get_video_path(
    index: usize,
    state: State<'_, PageManagerState>,
) -> Result<String, String> {
    log::info!("🎬 [PageCommand] get_video_path: {}", index);
    let manager = state.manager.lock().await;
    manager.get_video_path(index).await
}

/// 获取临时文件统计
#[tauri::command]
pub async fn pm_get_temp_stats(
    state: State<'_, PageManagerState>,
) -> Result<crate::core::page_manager::TempFileStats, String> {
    let manager = state.manager.lock().await;
    Ok(manager.temp_stats())
}

/// 获取大文件阈值（MB）
#[tauri::command]
pub async fn pm_get_large_file_threshold(
    state: State<'_, PageManagerState>,
) -> Result<usize, String> {
    let manager = state.manager.lock().await;
    Ok(manager.get_large_file_threshold_mb())
}

/// 设置大文件阈值（MB）
///
/// 超过此阈值的文件会自动使用临时文件而非内存缓存
#[tauri::command]
pub async fn pm_set_large_file_threshold(
    threshold_mb: usize,
    state: State<'_, PageManagerState>,
) -> Result<(), String> {
    log::info!(
        "⚙️ [PageCommand] set_large_file_threshold: {} MB",
        threshold_mb
    );
    let manager = state.manager.lock().await;
    manager.set_large_file_threshold_mb(threshold_mb);
    Ok(())
}

// ===== 缩略图命令 =====

/// 按距离中心的距离排序索引（中央优先策略）
///
/// 排序规则：
/// 1. 按与 center 的绝对距离升序
/// 2. 距离相同时，较大的索引（前向）优先
fn sort_by_distance_from_center(indices: &mut [usize], center: usize) {
    indices.sort_by(|a, b| {
        let dist_a = (*a as isize - center as isize).unsigned_abs();
        let dist_b = (*b as isize - center as isize).unsigned_abs();

        match dist_a.cmp(&dist_b) {
            std::cmp::Ordering::Equal => b.cmp(a), // 距离相同时，大的优先（前向优先）
            other => other,
        }
    });
}

/// 预加载缩略图（异步，通过事件推送结果）
///
/// 接受需要生成的页面索引列表和当前页面索引
/// 按照与当前页的距离排序后生成，距离近的优先
/// 前端负责过滤已缓存的页面，避免重复生成
///
/// 优化：使用并行处理，同时生成多个缩略图
#[tauri::command]
pub async fn pm_preload_thumbnails(
    indices: Vec<usize>,
    center_index: Option<usize>, // 当前页面索引，用于优先级排序
    max_size: Option<u32>,
    app: AppHandle,
    state: State<'_, PageManagerState>,
) -> Result<Vec<usize>, String> {
    let size = max_size.unwrap_or(256);

    // 提前获取所有需要的信息，避免后续锁竞争
    let (book_path, book_type, page_infos) = {
        let manager = state.manager.lock().await;
        let book = manager.current_book_info().ok_or("没有打开的书籍")?;

        let book_path = book.path.clone();
        let book_type = book.book_type;

        // 收集所有页面信息
        let page_infos: Vec<_> = indices
            .iter()
            .filter_map(|&idx| manager.get_page_info(idx).map(|info| (idx, info)))
            .collect();

        (book_path, book_type, page_infos)
    };

    if page_infos.is_empty() {
        return Ok(vec![]);
    }

    // 按距离中心排序（中央优先策略）
    let mut pages_to_load: Vec<_> = page_infos;
    if let Some(center) = center_index {
        pages_to_load.sort_by(|(a, _), (b, _)| {
            let dist_a = (*a as isize - center as isize).unsigned_abs();
            let dist_b = (*b as isize - center as isize).unsigned_abs();
            match dist_a.cmp(&dist_b) {
                std::cmp::Ordering::Equal => b.cmp(a),
                other => other,
            }
        });
    }

    let result_indices: Vec<usize> = pages_to_load.iter().map(|(idx, _)| *idx).collect();

    // 并行度：同时处理的缩略图数量
    let parallelism = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
        .min(8);

    log::info!(
        "🖼️ [PageCommand] 开始并行生成 {} 个缩略图 (并行度: {})",
        pages_to_load.len(),
        parallelism
    );

    // 获取 ArchiveManager 的克隆（用于并行解压）
    let archive_manager = {
        let manager = state.manager.lock().await;
        manager.get_archive_manager_clone()
    };

    // 在后台任务中并行生成缩略图 - 使用 spawn_blocking 运行 rayon
    tokio::spawn(async move {
        use rayon::prelude::*;

        // 使用 spawn_blocking 运行 CPU 密集型的 rayon 并行任务
        let results = tokio::task::spawn_blocking(move || {
            pages_to_load
                .par_iter()
                .filter_map(|(index, page_info)| {
                    // 1. 加载图片数据（从压缩包或文件系统）
                    let data = match book_type {
                        crate::core::page_manager::BookType::Archive => {
                            if let Some(ref am) = archive_manager {
                                am.load_image_from_archive_binary(
                                    std::path::Path::new(&book_path),
                                    &page_info.inner_path,
                                )
                                .ok()
                            } else {
                                None
                            }
                        }
                        _ => std::fs::read(&page_info.inner_path).ok(),
                    };

                    let data = data?;

                    // 2. 生成缩略图（使用 WIC 或 image crate）
                    let thumbnail = generate_thumbnail_fast(&data, size)?;

                    Some((*index, thumbnail))
                })
                .collect::<Vec<_>>()
        })
        .await
        .unwrap_or_default();

        // 推送结果到前端
        let success_count = results.len();
        for (index, item) in results {
            use base64::{engine::general_purpose::STANDARD, Engine as _};
            let data_base64 = STANDARD.encode(&item.data);

            let event = ThumbnailReadyEvent {
                index,
                data: format!("data:image/webp;base64,{data_base64}"),
                width: item.width,
                height: item.height,
            };

            if let Err(e) = app.emit("page-thumbnail-ready", &event) {
                log::error!("🖼️ 推送缩略图事件失败: {e}");
            }
        }

        log::info!("🖼️ [PageCommand] 缩略图生成完成: {} 个", success_count);
    });

    Ok(result_indices)
}

/// 快速生成缩略图（优化版本）
/// - Windows 优先使用 WIC（硬件加速解码+缩放）
/// - 直接从 BGRA 编码 WebP，跳过中间转换
fn generate_thumbnail_fast(data: &[u8], max_size: u32) -> Option<ThumbnailItem> {
    // Windows: 优先使用 WIC（硬件加速解码+缩放，支持 AVIF/HEIC/JXL）
    #[cfg(target_os = "windows")]
    {
        use crate::core::wic_decoder::decode_and_scale_with_wic;

        // WIC 直接解码并缩放到目标尺寸（一步完成，硬件加速）
        if let Ok(result) = decode_and_scale_with_wic(data, max_size, max_size) {
            // 直接从 BGRA 编码 WebP，避免中间转换
            if let Some(buffer) =
                encode_webp_from_bgra(&result.pixels, result.width, result.height, 75)
            {
                return Some(ThumbnailItem {
                    data: buffer,
                    width: result.width,
                    height: result.height,
                });
            }
        }
    }

    // 非 Windows 或 WIC 失败：回退到 image crate
    use image::ImageReader;
    use std::io::Cursor;

    let img = ImageReader::new(Cursor::new(data))
        .with_guessed_format()
        .ok()?
        .decode()
        .ok()?;

    let (orig_width, orig_height) = (img.width(), img.height());
    let scale = (max_size as f32 / orig_width.max(orig_height) as f32).min(1.0);
    let new_width = (orig_width as f32 * scale) as u32;
    let new_height = (orig_height as f32 * scale) as u32;

    // 使用 Triangle 滤波器（速度和质量的平衡）
    let thumbnail = img.resize(new_width, new_height, image::imageops::FilterType::Triangle);

    // 使用有损 WebP 编码
    let buffer = encode_webp_lossy(&thumbnail, 75)?;

    Some(ThumbnailItem {
        data: buffer,
        width: thumbnail.width(),
        height: thumbnail.height(),
    })
}

/// 有损 WebP 编码（使用 webp crate 实现真正的有损编码）
fn encode_webp_lossy(img: &image::DynamicImage, quality: u8) -> Option<Vec<u8>> {
    // 转换为 RGBA8
    let rgba = img.to_rgba8();
    let width = rgba.width();
    let height = rgba.height();

    // 使用 webp crate 进行有损编码
    let encoder = webp::Encoder::from_rgba(&rgba, width, height);
    let webp_data = encoder.encode(quality as f32);

    Some(webp_data.to_vec())
}

/// 直接从 BGRA 数据编码 WebP（跳过中间转换，更快）
#[cfg(target_os = "windows")]
fn encode_webp_from_bgra(bgra: &[u8], width: u32, height: u32, quality: u8) -> Option<Vec<u8>> {
    // BGRA -> RGBA 转换（原地修改副本）
    let mut rgba = bgra.to_vec();
    for chunk in rgba.chunks_exact_mut(4) {
        chunk.swap(0, 2); // B <-> R
    }

    // 使用 webp crate 进行有损编码
    let encoder = webp::Encoder::from_rgba(&rgba, width, height);
    let webp_data = encoder.encode(f32::from(quality));

    Some(webp_data.to_vec())
}

// ===== PageFrame 命令 =====

/// PageFrame 信息（用于前端）
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageFrameInfo {
    /// 帧内元素
    pub elements: Vec<PageFrameElementInfo>,
    /// 帧范围
    pub frame_range: PageRangeInfo,
    /// 显示尺寸
    pub size: SizeInfo,
    /// 旋转角度
    pub angle: f64,
    /// 缩放比例
    pub scale: f64,
    /// 起始页面索引
    pub start_index: usize,
    /// 结束页面索引
    pub end_index: usize,
}

/// `PageFrameElement` 信息
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageFrameElementInfo {
    /// 页面索引
    pub page_index: usize,
    /// 分割部分 (0=左/完整, 1=右)
    pub part: u8,
    /// 裁剪区域
    pub crop_rect: Option<CropRectInfo>,
    /// 是否为横向
    pub is_landscape: bool,
    /// 是否为占位元素
    pub is_dummy: bool,
    /// 内容缩放比例（用于双页对齐）
    pub scale: f64,
    /// 显示宽度
    pub width: f64,
    /// 显示高度
    pub height: f64,
}

/// 裁剪区域信息
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CropRectInfo {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// 页面范围信息
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageRangeInfo {
    pub min_index: usize,
    pub min_part: u8,
    pub max_index: usize,
    pub max_part: u8,
}

/// 尺寸信息
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SizeInfo {
    pub width: f64,
    pub height: f64,
}

impl From<&PageFrame> for PageFrameInfo {
    fn from(frame: &PageFrame) -> Self {
        Self {
            elements: frame
                .elements
                .iter()
                .map(|e| PageFrameElementInfo {
                    page_index: e.page.index,
                    part: e.page_range.min.part,
                    crop_rect: e.crop_rect.map(|c| CropRectInfo {
                        x: c.x,
                        y: c.y,
                        width: c.width,
                        height: c.height,
                    }),
                    is_landscape: e.is_landscape(),
                    is_dummy: e.is_dummy,
                    scale: e.scale,
                    width: e.width(),
                    height: e.height(),
                })
                .collect(),
            frame_range: PageRangeInfo {
                min_index: frame.frame_range.min.index,
                min_part: frame.frame_range.min.part,
                max_index: frame.frame_range.max.index,
                max_part: frame.frame_range.max.part,
            },
            size: SizeInfo {
                width: frame.size.width,
                height: frame.size.height,
            },
            angle: frame.angle,
            scale: frame.scale,
            start_index: frame.start_index(),
            end_index: frame.end_index(),
        }
    }
}

// NOTE: PageFrame 命令已迁移到前端本地计算
// 以下代码已移除：
// - PageFrameState
// - pf_update_context, pf_get_context, pf_build_frame
// - pf_next_position, pf_prev_position, pf_total_virtual_pages
// - pf_is_page_split, pf_position_from_virtual, pf_frame_position_for_index
// 请使用前端的 pageFrameStore 进行布局计算

// ===== 辅助函数 =====

/// 收集所有页面命令
pub fn get_page_commands() -> Vec<&'static str> {
    vec![
        "pm_open_book",
        "pm_close_book",
        "pm_get_book_info",
        "pm_goto_page",
        "pm_get_page",
        "pm_get_page_info",
        "pm_get_stats",
        "pm_get_memory_stats",
        "pm_clear_cache",
        "pm_get_video_path",
        "pm_get_temp_stats",
        "pm_get_large_file_threshold",
        "pm_set_large_file_threshold",
        "pm_preload_thumbnails",
        "pm_get_cache_status", // 【性能优化】前端可查询缓存状态
    ]
}
