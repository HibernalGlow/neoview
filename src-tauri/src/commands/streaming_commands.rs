//! 流式打开书籍命令
//!
//! 支持增量返回页面列表，让 UI 可以先响应

use crate::core::streaming_archive::{StreamingOpenResult, StreamingScanner, StreamingEntry};
use crate::core::archive_manager::open_archive;
use crate::core::BookManager;
use crate::models::BookInfo;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};

/// 流式扫描器状态
pub struct StreamingScannerState {
    pub scanner: Arc<Mutex<StreamingScanner>>,
}

impl Default for StreamingScannerState {
    fn default() -> Self {
        Self {
            scanner: Arc::new(Mutex::new(StreamingScanner::default())),
        }
    }
}

/// 快速打开书籍（只返回首批页面）
///
/// 返回前 N 个图片条目，让 UI 可以立即显示
/// 后台继续扫描剩余页面，通过事件通知
#[tauri::command]
pub async fn open_book_fast(
    path: String,
    initial_count: Option<usize>,
    app_handle: AppHandle,
    scanner_state: State<'_, StreamingScannerState>,
    book_state: State<'_, Mutex<BookManager>>,
) -> Result<StreamingOpenResult, String> {
    let path_buf = std::path::PathBuf::from(&path);
    let initial_count = initial_count.unwrap_or(10);

    // 检查路径
    if !path_buf.exists() {
        return Err(format!("路径不存在: {path}"));
    }

    // 获取书籍名称
    let name = path_buf
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();

    // 检测书籍类型
    let book_type = detect_book_type(&path_buf)?;

    // 如果不是压缩包，使用普通打开
    if book_type != "archive" {
        let book = {
            let mut manager = book_state.lock().map_err(|e| e.to_string())?;
            manager.open_book(&path)?
        };
        
        let initial_pages: Vec<StreamingEntry> = book.pages.iter().take(initial_count).map(|p| {
            StreamingEntry {
                name: p.name.clone(),
                is_directory: false,
                size: Some(p.size),
                index: p.index,
                is_image: true,
            }
        }).collect();

        return Ok(StreamingOpenResult {
            path: path.clone(),
            name,
            book_type,
            initial_pages,
            has_more: book.pages.len() > initial_count,
            estimated_total: Some(book.total_pages),
        });
    }

    // 压缩包：快速扫描首批图片
    let scanner = scanner_state.scanner.lock().map_err(|e| e.to_string())?;
    scanner.reset();

    let first_images = scanner.scan_first_images(&path_buf, initial_count)?;
    let initial_pages: Vec<StreamingEntry> = first_images.iter().map(StreamingEntry::from).collect();

    // 启动后台完整扫描
    let path_clone = path.clone();
    let scanner_arc = scanner_state.scanner.clone();
    let app_handle_clone = app_handle.clone();

    std::thread::spawn(move || {
        let scanner = scanner_arc.lock().unwrap();
        let path_buf = std::path::PathBuf::from(&path_clone);
        let _ = scanner.scan_archive_streaming(&path_buf, &app_handle_clone);
    });

    Ok(StreamingOpenResult {
        path,
        name,
        book_type,
        initial_pages,
        has_more: true, // 假设还有更多
        estimated_total: None, // 完整扫描后才知道
    })
}

/// 取消流式扫描
#[tauri::command]
pub async fn cancel_streaming_scan(
    scanner_state: State<'_, StreamingScannerState>,
) -> Result<(), String> {
    let scanner = scanner_state.scanner.lock().map_err(|e| e.to_string())?;
    scanner.cancel();
    Ok(())
}

/// 获取压缩包条目数量（快速估算）
///
/// 不读取完整列表，只获取条目数
#[tauri::command]
pub async fn get_archive_entry_count(path: String) -> Result<usize, String> {
    let path_buf = std::path::PathBuf::from(&path);
    let mut handler = open_archive(&path_buf)?;
    let entries = handler.list_entries()?;
    Ok(entries.len())
}

/// 检测书籍类型
fn detect_book_type(path: &Path) -> Result<String, String> {
    if path.is_dir() {
        return Ok("folder".to_string());
    }

    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let lower = ext.to_lowercase();
        match lower.as_str() {
            "zip" | "rar" | "7z" | "cbz" | "cbr" => Ok("archive".to_string()),
            "epub" => Ok("epub".to_string()),
            "pdf" => Ok("pdf".to_string()),
            "mp4" | "mkv" | "webm" | "avi" | "mov" => Ok("media".to_string()),
            _ => Err(format!("不支持的文件类型: {ext}")),
        }
    } else {
        Err("无法确定文件类型".to_string())
    }
}
