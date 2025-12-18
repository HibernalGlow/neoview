//! 资源管理器右键菜单命令
//! Windows 专用功能

use std::io;

#[cfg(target_os = "windows")]
use std::path::PathBuf;
#[cfg(target_os = "windows")]
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
#[cfg(target_os = "windows")]
use winreg::RegKey;

#[cfg(target_os = "windows")]
const KEY_FILE: &str = "*\\shell\\OpenInNeoView";
#[cfg(target_os = "windows")]
const KEY_DIRECTORY: &str = "Directory\\shell\\OpenInNeoView";
#[cfg(target_os = "windows")]
const KEY_DIRECTORY_BACKGROUND: &str = "Directory\\Background\\shell\\OpenInNeoView";

#[cfg(target_os = "windows")]
fn open_root() -> io::Result<RegKey> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    hkcu.open_subkey_with_flags("Software\\Classes", KEY_READ | KEY_WRITE)
}

#[cfg(target_os = "windows")]
fn build_command() -> io::Result<(String, String, String, String)> {
    let exe: PathBuf = std::env::current_exe()?;
    let exe_str = exe.to_string_lossy().to_string();
    let command_name = format!("\"{}\"", exe_str);
    let label = String::from("Open in NeoView");
    let icon = format!("{},0", command_name);
    let command = format!("{} \"%1\"", command_name);
    let command_type_v = format!("{} \"%V\"", command_name);
    Ok((label, icon, command, command_type_v))
}

#[cfg(target_os = "windows")]
fn create_subkey(
    root: &RegKey,
    key: &str,
    label: &str,
    icon: &str,
    command: &str,
) -> io::Result<()> {
    let (subkey, _) = root.create_subkey(key)?;
    subkey.set_value("", &label)?;
    subkey.set_value("Icon", &icon)?;
    let (command_key, _) = root.create_subkey(format!("{}\\command", key))?;
    command_key.set_value("", &command)?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn delete_subkey(root: &RegKey, key: &str) -> io::Result<()> {
    let _ = root.delete_subkey_all(key);
    Ok(())
}

fn explorer_context_menu_exists_impl() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let root = open_root().map_err(|e| format!("Registry open error: {}", e))?;
        match root.open_subkey(KEY_FILE) {
            Ok(_) => Ok(true),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(false),
            Err(e) => Err(format!("Registry query error: {}", e)),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

fn create_explorer_context_menu_impl() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let root = open_root().map_err(|e| format!("Registry open error: {}", e))?;
        let (label, icon, command, command_type_v) =
            build_command().map_err(|e| format!("Build command error: {}", e))?;
        create_subkey(&root, KEY_FILE, &label, &icon, &command)
            .map_err(|e| format!("Registry write error: {}", e))?;
        create_subkey(&root, KEY_DIRECTORY, &label, &icon, &command)
            .map_err(|e| format!("Registry write error: {}", e))?;
        create_subkey(
            &root,
            KEY_DIRECTORY_BACKGROUND,
            &label,
            &icon,
            &command_type_v,
        )
        .map_err(|e| format!("Registry write error: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err(String::from(
            "Explorer context menu is only supported on Windows",
        ))
    }
}

fn delete_explorer_context_menu_impl() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let root = open_root().map_err(|e| format!("Registry open error: {}", e))?;
        delete_subkey(&root, KEY_FILE).map_err(|e| format!("Registry delete error: {}", e))?;
        delete_subkey(&root, KEY_DIRECTORY).map_err(|e| format!("Registry delete error: {}", e))?;
        delete_subkey(&root, KEY_DIRECTORY_BACKGROUND)
            .map_err(|e| format!("Registry delete error: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(())
    }
}

#[tauri::command]
pub async fn get_explorer_context_menu_enabled() -> Result<bool, String> {
    explorer_context_menu_exists_impl()
}

#[tauri::command]
pub async fn set_explorer_context_menu_enabled(enabled: bool) -> Result<bool, String> {
    if enabled {
        create_explorer_context_menu_impl()?;
    } else {
        delete_explorer_context_menu_impl()?;
    }
    explorer_context_menu_exists_impl()
}

/// 生成基于当前可执行文件路径的 Explorer 右键菜单注册表文件内容
#[tauri::command]
pub async fn generate_explorer_context_menu_reg() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use std::path::PathBuf;

        let exe: PathBuf =
            std::env::current_exe().map_err(|e| format!("Get exe path error: {}", e))?;
        let exe_str = exe.to_string_lossy().to_string();
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
            exe_escaped, exe_escaped, exe_escaped, exe_escaped, exe_escaped, exe_escaped,
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
