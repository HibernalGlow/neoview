use lnk::ShellLink;
use std::path::{Path, PathBuf};

/// 尝试解析 .lnk 文件指向的目标路径
/// 如果解析失败或不是 .lnk 文件，返回 None
pub fn resolve_lnk(path: &Path) -> Option<PathBuf> {
    // 检查扩展名（简单检查，实际上调用者通常已经检查了）
    if let Some(ext) = path.extension() {
        if !ext.eq_ignore_ascii_case("lnk") {
            return None;
        }
    } else {
        return None;
    }

    // 尝试打开并解析 .lnk 文件
    // 注意：lnk crate 是纯 Rust 实现，不依赖 Windows COM，但可能不支持所有特性的快捷方式
    match ShellLink::open(path) {
        Ok(link) => {
            // 尝试获取相对路径（如果存在）
            if let Some(relative) = link.relative_path() {
                let p = Path::new(relative);
                // 如果是相对路径，尝试基于 .lnk 文件所在目录进行解析
                if p.is_relative() {
                    if let Some(parent) = path.parent() {
                        let absolute = parent.join(p);
                        return Some(absolute);
                    }
                }
            }

            if let Some(link_info) = link.link_info() {
                if let Some(local_path) = link_info.local_base_path() {
                    return Some(PathBuf::from(local_path));
                }
            }

            None
        }
        Err(e) => {
            log::debug!("Failed to parse lnk file {:?}: {:?}", path, e);
            None
        }
    }
}
