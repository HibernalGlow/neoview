use crate::core::explorer_context_menu;

#[tauri::command]
pub async fn get_explorer_context_menu_enabled() -> Result<bool, String> {
    explorer_context_menu::explorer_context_menu_exists()
}

#[tauri::command]
pub async fn set_explorer_context_menu_enabled(enabled: bool) -> Result<bool, String> {
    if enabled {
        explorer_context_menu::create_explorer_context_menu()?;
    } else {
        explorer_context_menu::delete_explorer_context_menu()?;
    }
    explorer_context_menu::explorer_context_menu_exists()
}
