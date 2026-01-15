use tauri::{Runtime, WebviewWindow};

#[tauri::command]
pub async fn set_sidebar_vibrancy<R: Runtime>(
    window: WebviewWindow<R>,
    enable: bool,
    _effect: Option<String>, // "acrylic" or "mica"
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::{apply_acrylic, apply_mica, clear_acrylic, clear_mica};

        if enable {
            // Default to Mica as it is more performant and modern
            // apply_mica(&window, None)
            //     .map_err(|e| format!("Failed to apply mica: {}", e))?;
            apply_acrylic(&window, Some((0, 0, 0, 10)))
                .map_err(|e| format!("Failed to apply acrylic: {}", e))?;
        } else {
            clear_mica(&window).map_err(|e| format!("Failed to clear mica: {}", e))?;
            clear_acrylic(&window).map_err(|e| format!("Failed to clear acrylic: {}", e))?;
        }
    }

    Ok(())
}
