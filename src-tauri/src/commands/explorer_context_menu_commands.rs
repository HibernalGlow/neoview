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

/// 生成基于当前可执行文件路径的 Explorer 右键菜单注册表文件内容
/// 返回完整的 .reg 文本，前端可以触发下载保存
#[tauri::command]
pub async fn generate_explorer_context_menu_reg() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use std::path::PathBuf;

        let exe: PathBuf = std::env::current_exe()
            .map_err(|e| format!("Get exe path error: {}", e))?;
        let exe_str = exe.to_string_lossy().to_string();
        // 在 .reg 文件中需要转义反斜杠
        let exe_escaped = exe_str.replace('\\', "\\\\");

        let reg_content = format!(
            "Windows Registry Editor Version 5.00\r\n\r\n\
[HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\OpenInNeoView]\r\n\
@=\"Open in NeoView\"\r\n\
\"Icon\"=\"\\\"{}\\\",0\"\r\n\r\n\
[HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\OpenInNeoView\\command]\r\n\
@=\"\\\"{}\\\" \"%1\"\"\r\n\r\n\
[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\shell\\OpenInNeoView]\r\n\
@=\"Open in NeoView\"\r\n\
\"Icon\"=\"\\\"{}\\\",0\"\r\n\r\n\
[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\shell\\OpenInNeoView\\command]\r\n\
@=\"\\\"{}\\\" \"%1\"\"\r\n\r\n\
[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\Background\\shell\\OpenInNeoView]\r\n\
@=\"Open in NeoView\"\r\n\
\"Icon\"=\"\\\"{}\\\",0\"\r\n\r\n\
[HKEY_CURRENT_USER\\Software\\Classes\\Directory\\Background\\shell\\OpenInNeoView\\command]\r\n\
@=\"\\\"{}\\\" \"%V\"\"\r\n",
            exe_escaped,
            exe_escaped,
            exe_escaped,
            exe_escaped,
            exe_escaped,
            exe_escaped,
        );

        Ok(reg_content)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err(String::from(
            "generate_explorer_context_menu_reg is only supported on Windows",
        ))
    }
}
