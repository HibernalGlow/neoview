//! NeoView - Image Commands
//! 图像加载相关的 Tauri 命令

use crate::core::{ImageLoader, BookManager, ArchiveManager};
use crate::models::BookType;
use std::sync::Mutex;
use std::path::Path;
use tauri::State;

#[tauri::command]
pub async fn load_image(
    path: String,
    image_loader: State<'_, Mutex<ImageLoader>>,
    book_manager: State<'_, Mutex<BookManager>>,
) -> Result<Vec<u8>, String> {
    // 检查当前书籍类型
    let book_manager_lock = book_manager.lock().map_err(|e| e.to_string())?;
    
    if let Some(book) = book_manager_lock.get_current_book() {
        match book.book_type {
            BookType::Archive => {
                // 如果是压缩包,使用 ArchiveManager 加载图片
                let book_path = book.path.clone(); // 克隆路径
                drop(book_manager_lock); // 释放锁
                let archive_manager = ArchiveManager::new();
                return archive_manager.load_image_from_zip_binary(
                    Path::new(&book_path),
                    &path
                );
            }
            _ => {
                // 其他类型使用常规加载
                drop(book_manager_lock); // 释放锁
                let loader = image_loader.lock().map_err(|e| e.to_string())?;
                return loader.load_image_as_binary(&path);
            }
        }
    }
    
    // 如果没有打开的书籍,尝试常规加载
    let loader = image_loader.lock().map_err(|e| e.to_string())?;
    loader.load_image_as_binary(&path)
}

#[tauri::command]
pub async fn get_image_dimensions(
    path: String,
    state: State<'_, Mutex<ImageLoader>>,
) -> Result<(u32, u32), String> {
    let loader = state.lock().map_err(|e| e.to_string())?;
    loader.get_image_dimensions(&path)
}


