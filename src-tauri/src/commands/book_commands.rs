//! NeoView - Book Commands
//! 书籍管理相关的 Tauri 命令

use crate::core::BookManager;
use crate::core::ImageLoader;
use crate::core::DimensionScannerState;
use crate::models::{BookInfo, PageSortMode, MediaPriorityMode};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn open_book(
    path: String,
    state: State<'_, Mutex<BookManager>>,
    scanner_state: State<'_, DimensionScannerState>,
    app_handle: AppHandle,
) -> Result<BookInfo, String> {
    // 取消之前的扫描任务
    {
        let scanner = scanner_state.scanner.lock().map_err(|e| e.to_string())?;
        scanner.cancel();
    }

    // 打开书籍
    let book = {
        let mut manager = state.lock().map_err(|e| e.to_string())?;
        manager.open_book(&path)?
    };

    // 启动后台尺寸扫描
    let book_path = book.path.clone();
    let book_type = book.book_type.clone();
    let pages = book.pages.clone();
    let scanner_arc = scanner_state.scanner.clone();

    // 在后台线程执行扫描
    std::thread::spawn(move || {
        let scanner = scanner_arc.lock().unwrap();
        scanner.reset(); // 重置取消令牌
        scanner.scan_book(&book_path, &book_type, &pages, Some(&app_handle));
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
