//! `NeoView` - `Book` Commands
//! 书籍管理相关的 Tauri 命令

use crate::commands::page_commands::PageManagerState;
use crate::core::archive::is_image_file;
use crate::core::dimension_scanner::ScanPageTask;
use crate::core::BookManager;
use crate::core::DimensionScannerState;
use crate::core::ImageLoader;
use crate::models::{BookInfo, MediaPriorityMode, Page, PageSortMode};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, State};

static OPEN_BOOK_REQUEST_GENERATION: AtomicU64 = AtomicU64::new(0);
static OPEN_BOOK_SCAN_GENERATION: AtomicU64 = AtomicU64::new(0);

#[inline]
fn is_latest_open_book_request(generation: u64) -> bool {
    OPEN_BOOK_REQUEST_GENERATION.load(Ordering::SeqCst) == generation
}

fn is_same_book_path(existing_path: &str, requested_path: &str) -> bool {
    if cfg!(windows) {
        let normalized_existing = existing_path.replace('/', "\\");
        let normalized_requested = requested_path.replace('/', "\\");
        normalized_existing.eq_ignore_ascii_case(&normalized_requested)
    } else {
        existing_path == requested_path
    }
}

#[inline]
fn is_image_page_for_dimension_scan(page: &Page) -> bool {
    let target_path = page.inner_path.as_deref().unwrap_or(&page.path);
    is_image_file(target_path)
}

#[tauri::command]
pub async fn open_book(
    path: String,
    state: State<'_, Mutex<BookManager>>,
    page_state: State<'_, PageManagerState>,
    scanner_state: State<'_, DimensionScannerState>,
    app_handle: AppHandle,
) -> Result<BookInfo, String> {
    let request_generation = OPEN_BOOK_REQUEST_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;

    let is_same_path_request = {
        let manager = state.lock().map_err(|e| e.to_string())?;
        manager
            .get_current_book()
            .is_some_and(|book| is_same_book_path(&book.path, &path))
    };

    if !is_same_path_request && is_latest_open_book_request(request_generation) {
        // 仅在切换到新书时取消旧扫描任务。
        scanner_state.scanner.cancel();
    }

    // 打开书籍
    let book = {
        let mut manager = state.lock().map_err(|e| e.to_string())?;

        // 若该请求在等待锁期间已被更晚请求覆盖，则直接复用当前上下文，避免重复扫描。
        if !is_latest_open_book_request(request_generation) {
            if let Some(current) = manager.get_current_book().cloned() {
                log::debug!("open_book: stale request skipped before load");
                return Ok(current);
            }
        }

        manager.open_book(&path)?
    };

    // 若加载完成后该请求已过期，跳过后续同步/扫描副作用。
    if !is_latest_open_book_request(request_generation) {
        log::debug!("open_book: stale request skipped after load side-effects");
        return Ok(book);
    }

    let should_sync_page_manager = if is_same_path_request {
        let page_manager = page_state.manager.read().await;
        !page_manager.current_book_info().is_some_and(|current| {
            is_same_book_path(&current.path, &book.path)
                && current.total_pages == book.total_pages
                && current.current_index == book.current_page
        })
    } else {
        true
    };

    // 将 BookManager 的扫描结果同步给 PageManager，避免后续 pm_open_book 再次扫描同一本书。
    if should_sync_page_manager {
        let mut page_manager = page_state.manager.write().await;
        if let Err(e) = page_manager.sync_from_model_book(&book).await {
            log::warn!("⚠️ open_book: PageManager 同步失败，将回退到 pm_open_book 扫描: {e}");
        }
    }

    if is_same_path_request {
        return Ok(book);
    }

    // 同步后再次检查请求代际，避免为过期请求构建扫描任务。
    if !is_latest_open_book_request(request_generation) {
        return Ok(book);
    }

    let scan_pages: Vec<ScanPageTask> = book
        .pages
        .iter()
        .filter(|page| is_image_page_for_dimension_scan(page))
        .map(ScanPageTask::from)
        .collect();

    // 非图片书籍（例如纯视频）无需启动尺寸扫描。
    if scan_pages.is_empty() {
        return Ok(book);
    }

    // 调度前再次确认当前请求仍然是最新，避免无效任务入队。
    if !is_latest_open_book_request(request_generation) {
        return Ok(book);
    }

    let scan_generation = OPEN_BOOK_SCAN_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;

    // 启动后台尺寸扫描
    let book_path = book.path.clone();
    let book_type = book.book_type.clone();
    let scanner_arc = scanner_state.scanner.clone();
    let scan_guard_arc = scanner_state.scan_guard.clone();

    // 在运行时阻塞线程池执行扫描，避免频繁创建独立系统线程。
    tauri::async_runtime::spawn_blocking(move || {
        if OPEN_BOOK_SCAN_GENERATION.load(Ordering::SeqCst) != scan_generation {
            return;
        }

        let _scan_guard = match scan_guard_arc.lock() {
            Ok(guard) => guard,
            Err(e) => {
                log::warn!("open_book: failed to lock scan guard: {e}");
                return;
            }
        };

        if OPEN_BOOK_SCAN_GENERATION.load(Ordering::SeqCst) != scan_generation {
            return;
        }

        scanner_arc.reset(); // 重置取消令牌

        if OPEN_BOOK_SCAN_GENERATION.load(Ordering::SeqCst) != scan_generation {
            return;
        }

        scanner_arc.scan_book(&book_path, &book_type, &scan_pages, Some(&app_handle), Some(scan_generation));
    });

    Ok(book)
}

#[tauri::command]
pub async fn close_book(state: State<'_, Mutex<BookManager>>) -> Result<(), String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    manager.close_book();
    Ok(())
}

#[tauri::command]
pub async fn get_current_book(
    state: State<'_, Mutex<BookManager>>,
) -> Result<Option<BookInfo>, String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    Ok(manager.get_current_book().cloned())
}

#[tauri::command]
pub async fn navigate_to_page(
    page_index: usize,
    book_state: State<'_, Mutex<BookManager>>,
    image_state: State<'_, Mutex<ImageLoader>>,
) -> Result<(), String> {
    let mut manager = book_state.lock().map_err(|e| e.to_string())?;
    let _image_loader = image_state.lock().map_err(|e| e.to_string())?;
    manager.navigate_to_page(page_index)?;
    // 预加载已由 PageManager 处理
    Ok(())
}

#[tauri::command]
pub async fn next_page(
    book_state: State<'_, Mutex<BookManager>>,
    image_state: State<'_, Mutex<ImageLoader>>,
) -> Result<usize, String> {
    let mut manager = book_state.lock().map_err(|e| e.to_string())?;
    let _image_loader = image_state.lock().map_err(|e| e.to_string())?;
    let page = manager.next_page()?;
    // 预加载已由 PageManager 处理
    Ok(page)
}

#[tauri::command]
pub async fn previous_page(
    book_state: State<'_, Mutex<BookManager>>,
    image_state: State<'_, Mutex<ImageLoader>>,
) -> Result<usize, String> {
    let mut manager = book_state.lock().map_err(|e| e.to_string())?;
    let _image_loader = image_state.lock().map_err(|e| e.to_string())?;
    let page = manager.previous_page()?;
    // 预加载已由 PageManager 处理
    Ok(page)
}

#[tauri::command]
pub async fn navigate_to_image(
    image_path: String,
    state: State<'_, Mutex<BookManager>>,
) -> Result<usize, String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    manager.navigate_to_image(&image_path)
}

#[tauri::command]
pub async fn set_book_sort_mode(
    sort_mode: PageSortMode,
    state: State<'_, Mutex<BookManager>>,
) -> Result<BookInfo, String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    manager.set_sort_mode(sort_mode)
}


#[tauri::command]
pub async fn set_media_priority_mode(
    mode: MediaPriorityMode,
    state: State<'_, Mutex<BookManager>>,
) -> Result<BookInfo, String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    manager.set_media_priority_mode(mode)
}
