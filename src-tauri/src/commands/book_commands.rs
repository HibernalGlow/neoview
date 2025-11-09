//! NeoView - Book Commands
//! 书籍管理相关的 Tauri 命令

use crate::core::BookManager;
use crate::models::BookInfo;
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
pub async fn open_book(
    path: String,
    state: State<'_, Mutex<BookManager>>,
) -> Result<BookInfo, String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    manager.open_book(&path)
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
    state: State<'_, Mutex<BookManager>>,
) -> Result<(), String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    manager.navigate_to_page(page_index)
}

#[tauri::command]
pub async fn next_page(state: State<'_, Mutex<BookManager>>) -> Result<usize, String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    manager.next_page()
}

#[tauri::command]
pub async fn previous_page(state: State<'_, Mutex<BookManager>>) -> Result<usize, String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    manager.previous_page()
}

#[tauri::command]
pub async fn navigate_to_image(
    image_path: String,
    state: State<'_, Mutex<BookManager>>,
) -> Result<usize, String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    manager.navigate_to_image(&image_path)
}
