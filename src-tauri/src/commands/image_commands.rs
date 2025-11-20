//! NeoView - Image Commands
//! 图像加载相关的 Tauri 命令

use crate::core::{ArchiveManager, BookManager, ImageLoader};
use crate::models::BookType;
use std::path::Path;
use std::sync::Mutex;
use tauri::State;
use log::{info, warn};
use std::time::{SystemTime, UNIX_EPOCH};

fn fallback_trace_id(prefix: &str, page_index: Option<i32>) -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or_default();
    format!("{}-{}-{}", prefix, page_index.unwrap_or(-1), millis)
}

#[tauri::command]
pub async fn load_image(
    path: String,
    trace_id: Option<String>,
    page_index: Option<i32>,
    image_loader: State<'_, Mutex<ImageLoader>>,
    book_manager: State<'_, Mutex<BookManager>>,
) -> Result<Vec<u8>, String> {
    let trace_id = trace_id.unwrap_or_else(|| fallback_trace_id("rust-load", page_index));
    info!(
        "📥 [ImagePipeline:{}] load_image request path={} page_index={:?}",
        trace_id, path, page_index
    );

    // 检查当前书籍类型
    let book_manager_lock = book_manager.lock().map_err(|e| e.to_string())?;

    let result = if let Some(book) = book_manager_lock.get_current_book() {
        match book.book_type {
            BookType::Archive => {
                // 如果是压缩包,使用 ArchiveManager 加载图片
                let book_path = book.path.clone(); // 克隆路径
                drop(book_manager_lock); // 释放锁
                let archive_manager = ArchiveManager::new();
                let archive_result =
                    archive_manager.load_image_from_zip_binary(Path::new(&book_path), &path);
                if let Ok(ref bytes) = archive_result {
                    info!(
                        "📤 [ImagePipeline:{}] load_image archive branch success bytes={} book_path={}",
                        trace_id,
                        bytes.len(),
                        book_path
                    );
                } else if let Err(ref err) = archive_result {
                    warn!(
                        "⚠️ [ImagePipeline:{}] load_image archive branch failed: {}",
                        trace_id, err
                    );
                }
                return archive_result;
            }
            _ => {
                // 其他类型使用常规加载
                drop(book_manager_lock); // 释放锁
                let loader = image_loader.lock().map_err(|e| e.to_string())?;
                let fs_result = loader.load_image_as_binary(&path);
                if let Ok(ref bytes) = fs_result {
                    info!(
                        "📤 [ImagePipeline:{}] load_image fs branch success bytes={}",
                        trace_id,
                        bytes.len()
                    );
                } else if let Err(ref err) = fs_result {
                    warn!(
                        "⚠️ [ImagePipeline:{}] load_image fs branch failed: {}",
                        trace_id, err
                    );
                }
                return fs_result;
            }
        }
    } else {
        // 如果没有打开的书籍,尝试常规加载
        let loader = image_loader.lock().map_err(|e| e.to_string())?;
        loader.load_image_as_binary(&path)
    };

    if let Ok(ref bytes) = result {
        info!(
            "📤 [ImagePipeline:{}] load_image default branch success bytes={}",
            trace_id,
            bytes.len()
        );
    } else if let Err(ref err) = result {
        warn!(
            "⚠️ [ImagePipeline:{}] load_image default branch failed: {}",
            trace_id, err
        );
    }

    result
}

#[tauri::command]
pub async fn get_image_dimensions(
    path: String,
    state: State<'_, Mutex<ImageLoader>>,
) -> Result<(u32, u32), String> {
    let loader = state.lock().map_err(|e| e.to_string())?;
    loader.get_image_dimensions(&path)
}
