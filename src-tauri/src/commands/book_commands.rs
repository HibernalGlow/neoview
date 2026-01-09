//! NeoView - Book Commands
//! 书籍管理相关的 Tauri 命令

use crate::core::BookManager;
use crate::core::DimensionScannerState;
use crate::core::ImageLoader;
use crate::models::{BookInfo, BookType, MediaPriorityMode, Page, PageSortMode};
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

/// 检查是否为压缩包文件
fn is_archive_file(path: &str) -> bool {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    matches!(ext.as_str(), "zip" | "rar" | "7z" | "cbz" | "cbr" | "cb7")
}

/// 后台扫描完成事件
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BookScanCompleteEvent {
    path: String,
    total_pages: usize,
}

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

    // 检查是否为压缩包 - 使用快速打开
    if is_archive_file(&path) {
        return open_book_quick_internal(&path, &state, &scanner_state, &app_handle).await;
    }

    // 非压缩包：使用普通打开
    let book = {
        let mut manager = state.lock().map_err(|e| e.to_string())?;
        manager.open_book(&path)?
    };

    // 启动后台尺寸扫描
    start_dimension_scan(&book, &scanner_state, &app_handle);

    Ok(book)
}

/// 快速打开压缩包（内部实现）
async fn open_book_quick_internal(
    path: &str,
    state: &State<'_, Mutex<BookManager>>,
    scanner_state: &State<'_, DimensionScannerState>,
    app_handle: &AppHandle,
) -> Result<BookInfo, String> {
    use crate::core::archive::ArchiveManager;
    use crate::core::path_utils::{build_path_key, calculate_path_hash};

    let path_buf = std::path::PathBuf::from(path);
    let name = path_buf
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();

    // 快速扫描前 20 张图片
    let archive_manager = ArchiveManager::new();
    let quick_images = archive_manager.scan_archive_images_fast(&path_buf, 20)?;

    if quick_images.is_empty() {
        return Err("压缩包中未找到图片".to_string());
    }

    log::info!("📖 快速打开: {} - 找到 {} 张图片", name, quick_images.len());

    // 构建初始 BookInfo
    let mut book = BookInfo::new(path.to_string(), name.clone(), BookType::Archive);

    for (idx, inner_path) in quick_images.iter().enumerate() {
        let file_name = Path::new(inner_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(inner_path)
            .to_string();

        let path_key = build_path_key(path, inner_path, &BookType::Archive, Some(&file_name));
        let stable_hash = calculate_path_hash(&path_key);

        let page = Page::new(idx, inner_path.clone(), file_name, 0)
            .with_stable_hash(stable_hash)
            .with_inner_path(Some(inner_path.clone()))
            .with_entry_index(idx);
        book.pages.push(page);
    }

    book.total_pages = book.pages.len();

    // 设置到 BookManager
    {
        let mut manager = state.lock().map_err(|e| e.to_string())?;
        manager.set_current_book(book.clone());
    }

    // 启动后台完整扫描
    let path_clone = path.to_string();
    let app_clone = app_handle.clone();
    let scanner_arc = scanner_state.scanner.clone();

    tokio::spawn(async move {
        log::info!("📖 开始后台完整扫描: {}", path_clone);

        // 在阻塞线程中执行完整扫描
        let scan_result = tokio::task::spawn_blocking({
            let path = path_clone.clone();
            move || {
                let archive_manager = ArchiveManager::new();
                let path_buf = std::path::PathBuf::from(&path);
                archive_manager.get_images_from_archive(&path_buf)
            }
        })
        .await;

        let all_images = match scan_result {
            Ok(Ok(images)) => images,
            Ok(Err(e)) => {
                log::error!("📖 后台扫描失败: {}", e);
                return;
            }
            Err(e) => {
                log::error!("📖 后台扫描任务失败: {}", e);
                return;
            }
        };

        let total_pages = all_images.len();
        log::info!("📖 后台扫描完成: {} 页", total_pages);

        // 发送完成事件
        let event = BookScanCompleteEvent {
            path: path_clone.clone(),
            total_pages,
        };
        if let Err(e) = app_clone.emit("book-pages-ready", &event) {
            log::error!("📖 发送事件失败: {}", e);
        }

        // 后台构建完整 Page 列表用于尺寸扫描
        let pages: Vec<Page> = all_images
            .iter()
            .enumerate()
            .map(|(idx, inner_path)| {
                let file_name = std::path::Path::new(inner_path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(inner_path)
                    .to_string();
                Page::new(idx, inner_path.clone(), file_name, 0)
                    .with_inner_path(Some(inner_path.clone()))
                    .with_entry_index(idx)
            })
            .collect();

        // 启动尺寸扫描
        let scanner = scanner_arc.lock().unwrap();
        scanner.reset();
        scanner.scan_book(&path_clone, &BookType::Archive, &pages, Some(&app_clone));
    });

    Ok(book)
}

/// 启动后台尺寸扫描
fn start_dimension_scan(
    book: &BookInfo,
    scanner_state: &State<'_, DimensionScannerState>,
    app_handle: &AppHandle,
) {
    let book_path = book.path.clone();
    let book_type = book.book_type.clone();
    let pages = book.pages.clone();
    let scanner_arc = scanner_state.scanner.clone();
    let app_clone = app_handle.clone();

    std::thread::spawn(move || {
        let scanner = scanner_arc.lock().unwrap();
        scanner.reset();
        scanner.scan_book(&book_path, &book_type, &pages, Some(&app_clone));
    });
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
