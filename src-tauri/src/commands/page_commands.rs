//! NeoView - Page Commands
//! 简化的页面加载 API，后端主导，前端只发请求

use crate::core::page_manager::{
    BookInfo, MemoryPoolStats, PageContentManager, PageLoadResult, PageManagerStats,
};
use std::sync::Arc;
use tauri::State;
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

/// 获取页面信息（元数据，不含图片数据）
#[tauri::command]
pub async fn pm_get_page_info(
    index: usize,
    state: State<'_, PageManagerState>,
) -> Result<crate::core::page_manager::PageInfo, String> {
    let manager = state.manager.lock().await;

    let book = manager
        .current_book_info()
        .ok_or("没有打开的书籍")?;

    // 需要从 PageContentManager 获取页面信息
    // 这里简化处理，返回基本信息
    Ok(crate::core::page_manager::PageInfo {
        index,
        inner_path: format!("page_{}", index),
        name: format!("Page {}", index + 1),
        size: None,
    })
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
    ]
}
