//! NeoView - Page Commands
//! 简化的页面加载 API，后端主导，前端只发请求

use crate::core::page_manager::{
    BookInfo, MemoryPoolStats, PageContentManager, PageLoadResult, PageManagerStats,
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
pub async fn pm_get_book_info(state: State<'_, PageManagerState>) -> Result<Option<BookInfo>, String> {
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
    manager.get_page_info(index).ok_or_else(|| format!("页面 {} 不存在", index))
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
    log::info!("⚙️ [PageCommand] set_large_file_threshold: {} MB", threshold_mb);
    let manager = state.manager.lock().await;
    manager.set_large_file_threshold_mb(threshold_mb);
    Ok(())
}

// ===== 缩略图命令 =====

/// 预加载缩略图（异步，通过事件推送结果）
/// 
/// 接受需要生成的页面索引列表，生成后通过 "thumbnail-ready" 事件推送到前端
/// 前端负责过滤已缓存的页面，避免重复生成
#[tauri::command]
pub async fn pm_preload_thumbnails(
    indices: Vec<usize>,
    max_size: Option<u32>,
    app: AppHandle,
    state: State<'_, PageManagerState>,
) -> Result<Vec<usize>, String> {
    let size = max_size.unwrap_or(256);
    
    // 验证书籍已打开
    {
        let manager = state.manager.lock().await;
        manager.current_book_info()
            .ok_or("没有打开的书籍")?;
    }
    
    if indices.is_empty() {
        return Ok(vec![]);
    }
    
    let pages_to_load = indices.clone();
    
    log::debug!("🖼️ [PageCommand] preload_thumbnails: loading {} pages: {:?}",
        pages_to_load.len(), pages_to_load);
    
    let result_indices = pages_to_load.clone();
    let manager_arc = Arc::clone(&state.manager);
    
    // 在后台任务中生成缩略图并推送事件
    tokio::spawn(async move {
        log::info!("🖼️ [PageCommand] 开始生成 {} 个缩略图", pages_to_load.len());
        
        for index in pages_to_load {
            log::debug!("🖼️ [PageCommand] 生成缩略图: page {}", index);
            
            let result = {
                let manager = manager_arc.lock().await;
                manager.generate_page_thumbnail(index, size).await
            };

            match result {
                Ok(item) => {
                    // Base64 编码缩略图数据
                    use base64::{Engine as _, engine::general_purpose::STANDARD};
                    let data_base64 = STANDARD.encode(&item.data);

                    let event = ThumbnailReadyEvent {
                        index,
                        data: format!("data:image/webp;base64,{}", data_base64),
                        width: item.width,
                        height: item.height,
                    };

                    log::info!("🖼️ 推送缩略图事件: page {}, {}x{}, data_len={}", 
                        index, item.width, item.height, data_base64.len());

                    if let Err(e) = app.emit("thumbnail-ready", &event) {
                        log::error!("🖼️ 推送缩略图事件失败: {}", e);
                    }
                }
                Err(e) => {
                    log::warn!("🖼️ 生成缩略图失败: page {}: {}", index, e);
                }
            }
        }
        
        log::info!("🖼️ [PageCommand] 缩略图生成任务完成");
    });
    
    Ok(result_indices)
}

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
    ]
}
