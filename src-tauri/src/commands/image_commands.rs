//! NeoView - Image Commands
//! 图像加载相关的 Tauri 命令

use crate::core::{ArchiveManager, BookManager, ImageLoader};
use crate::models::BookType;
use log::{info, warn};
use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

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
                    archive_manager.load_image_from_archive_binary(Path::new(&book_path), &path);
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
            BookType::Epub => {
                // EPUB 电子书：解析 path 格式 "epub_path:inner_path"
                let book_path = book.path.clone();
                drop(book_manager_lock);

                // 从 path 中提取 inner_path (格式: epub_path:inner_path)
                let inner_path = if let Some(colon_pos) = path.find(':') {
                    // 跳过 Windows 盘符 (如 E:)
                    if colon_pos == 1 {
                        // 寻找第二个冒号
                        if let Some(second_colon) = path[2..].find(':') {
                            &path[second_colon + 3..]
                        } else {
                            return Err(format!("Invalid EPUB path format: {}", path));
                        }
                    } else {
                        &path[colon_pos + 1..]
                    }
                } else {
                    return Err(format!("Invalid EPUB path format: {}", path));
                };

                use crate::core::ebook::EbookManager;
                let epub_result = EbookManager::get_epub_image(&book_path, inner_path);

                if let Ok((ref bytes, ref mime)) = epub_result {
                    info!(
                        "📤 [ImagePipeline:{}] load_image epub branch success bytes={} mime={}",
                        trace_id,
                        bytes.len(),
                        mime
                    );
                    return Ok(bytes.clone());
                } else if let Err(ref err) = epub_result {
                    warn!(
                        "⚠️ [ImagePipeline:{}] load_image epub branch failed: {}",
                        trace_id, err
                    );
                    return Err(err.clone());
                }
                return epub_result.map(|(data, _)| data);
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

/// Base64 版本的图片加载（避免 IPC 协议问题）
#[tauri::command]
pub async fn load_image_base64(
    path: String,
    trace_id: Option<String>,
    page_index: Option<i32>,
    image_loader: State<'_, Mutex<ImageLoader>>,
    book_manager: State<'_, Mutex<BookManager>>,
) -> Result<String, String> {
    let trace_id = trace_id.unwrap_or_else(|| fallback_trace_id("rust-load-b64", page_index));

    // 调用原有的 load_image 获取数据
    let bytes = load_image_internal(&path, &trace_id, page_index, &image_loader, &book_manager)?;

    // 编码为 Base64
    use base64::{engine::general_purpose::STANDARD, Engine};
    let encoded = STANDARD.encode(&bytes);
    info!(
        "📤 [ImagePipeline:{}] load_image_base64 success bytes={} base64_len={}",
        trace_id,
        bytes.len(),
        encoded.len()
    );

    Ok(encoded)
}

/// 内部图片加载函数（供 load_image 和 load_image_base64 共用）
fn load_image_internal(
    path: &str,
    trace_id: &str,
    page_index: Option<i32>,
    image_loader: &State<'_, Mutex<ImageLoader>>,
    book_manager: &State<'_, Mutex<BookManager>>,
) -> Result<Vec<u8>, String> {
    info!(
        "📥 [ImagePipeline:{}] load_image_internal request path={} page_index={:?}",
        trace_id, path, page_index
    );

    // 检查当前书籍类型
    let book_manager_lock = book_manager.lock().map_err(|e| e.to_string())?;

    if let Some(book) = book_manager_lock.get_current_book() {
        match book.book_type {
            BookType::Archive => {
                let book_path = book.path.clone();
                drop(book_manager_lock);
                let archive_manager = ArchiveManager::new();
                return archive_manager.load_image_from_archive_binary(Path::new(&book_path), path);
            }
            BookType::Epub => {
                let book_path = book.path.clone();
                drop(book_manager_lock);

                let inner_path = if let Some(colon_pos) = path.find(':') {
                    if colon_pos == 1 {
                        if let Some(second_colon) = path[2..].find(':') {
                            &path[second_colon + 3..]
                        } else {
                            return Err(format!("Invalid EPUB path format: {}", path));
                        }
                    } else {
                        &path[colon_pos + 1..]
                    }
                } else {
                    return Err(format!("Invalid EPUB path format: {}", path));
                };

                use crate::core::ebook::EbookManager;
                return EbookManager::get_epub_image(&book_path, inner_path).map(|(data, _)| data);
            }
            _ => {
                drop(book_manager_lock);
                let loader = image_loader.lock().map_err(|e| e.to_string())?;
                return loader.load_image_as_binary(path);
            }
        }
    }

    let loader = image_loader.lock().map_err(|e| e.to_string())?;
    loader.load_image_as_binary(path)
}

#[tauri::command]
pub async fn get_image_dimensions(
    path: String,
    state: State<'_, Mutex<ImageLoader>>,
) -> Result<(u32, u32), String> {
    let loader = state.lock().map_err(|e| e.to_string())?;
    loader.get_image_dimensions(&path)
}
