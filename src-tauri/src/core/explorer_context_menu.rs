use std::io;

#[cfg(target_os = "windows")]
use std::path::PathBuf;
#[cfg(target_os = "windows")]
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
#[cfg(target_os = "windows")]
use winreg::RegKey;

#[cfg(target_os = "windows")]
const KEY_NAME: &str = "OpenInNeoView";
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
fn create_subkey(root: &RegKey, key: &str, label: &str, icon: &str, command: &str) -> io::Result<()> {
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

pub fn explorer_context_menu_exists() -> Result<bool, String> {
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

pub fn create_explorer_context_menu() -> Result<(), String> {
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
        Err(String::from("Explorer context menu is only supported on Windows"))
    }
}

pub fn delete_explorer_context_menu() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let root = open_root().map_err(|e| format!("Registry open error: {}", e))?;
        delete_subkey(&root, KEY_FILE).map_err(|e| format!("Registry delete error: {}", e))?;
        delete_subkey(&root, KEY_DIRECTORY)
            .map_err(|e| format!("Registry delete error: {}", e))?;
        delete_subkey(&root, KEY_DIRECTORY_BACKGROUND)
            .map_err(|e| format!("Registry delete error: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(())
    }
}
