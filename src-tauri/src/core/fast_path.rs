//! 高性能路径处理模块
//! 使用 bstr 实现快速字节字符串操作，避免 UTF-8 验证开销

use bstr::{BStr, BString, ByteSlice};
use std::path::Path;

/// 快速路径规范化（不验证 UTF-8）
/// 将反斜杠转换为正斜杠，移除冗余分隔符
#[inline]
pub fn normalize_path_fast(path: &[u8]) -> BString {
    let mut result = BString::from(path);
    
    // 将反斜杠转换为正斜杠
    for byte in result.as_mut_slice() {
        if *byte == b'\\' {
            *byte = b'/';
        }
    }
    
    // 移除连续的斜杠
    let mut prev_slash = false;
    result.retain(|&b| {
        let is_slash = b == b'/';
        let keep = !(is_slash && prev_slash);
        prev_slash = is_slash;
        keep
    });
    
    // 移除尾部斜杠
    while result.last() == Some(&b'/') && result.len() > 1 {
        result.pop();
    }
    
    result
}

/// 快速路径比较（忽略斜杠方向）
#[inline]
pub fn paths_equal_fast(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        // 长度不同，可能是斜杠差异，需要规范化比较
        let norm_a = normalize_path_fast(a);
        let norm_b = normalize_path_fast(b);
        return norm_a == norm_b;
    }
    
    // 长度相同，逐字节比较（斜杠等价）
    a.iter().zip(b.iter()).all(|(&x, &y)| {
        x == y || (is_slash(x) && is_slash(y))
    })
}

/// 检查是否为斜杠字符
#[inline]
fn is_slash(b: u8) -> bool {
    b == b'/' || b == b'\\'
}

/// 快速获取文件名（不验证 UTF-8）
#[inline]
pub fn file_name_fast(path: &[u8]) -> &BStr {
    let path = BStr::new(path);
    
    // 找到最后一个斜杠
    let last_sep = path.rfind_byte(b'/').or_else(|| path.rfind_byte(b'\\'));
    
    match last_sep {
        Some(pos) => BStr::new(&path[pos + 1..]),
        None => path,
    }
}

/// 快速获取文件扩展名（小写，不验证 UTF-8）
#[inline]
pub fn extension_fast(path: &[u8]) -> Option<BString> {
    let name = file_name_fast(path);
    
    // 找到最后一个点
    let dot_pos = name.rfind_byte(b'.')?;
    
    // 确保点不在开头
    if dot_pos == 0 {
        return None;
    }
    
    // 提取扩展名并转小写
    let ext = &name[dot_pos + 1..];
    if ext.is_empty() {
        return None;
    }
    
    Some(BString::from(ext.to_lowercase()))
}

/// 快速检查是否为图片文件
#[inline]
pub fn is_image_file_fast(path: &[u8]) -> bool {
    match extension_fast(path) {
        Some(ext) => {
            matches!(
                ext.as_slice(),
                b"jpg" | b"jpeg" | b"png" | b"gif" | b"bmp" | b"webp" 
                | b"avif" | b"jxl" | b"tiff" | b"tif"
            )
        }
        None => false,
    }
}

/// 快速检查是否为视频文件
#[inline]
pub fn is_video_file_fast(path: &[u8]) -> bool {
    match extension_fast(path) {
        Some(ext) => {
            matches!(
                ext.as_slice(),
                b"mp4" | b"mkv" | b"avi" | b"mov" | b"wmv" | b"flv" 
                | b"webm" | b"m4v" | b"mpg" | b"mpeg"
            )
        }
        None => false,
    }
}

/// 快速检查是否为压缩包文件
#[inline]
pub fn is_archive_file_fast(path: &[u8]) -> bool {
    match extension_fast(path) {
        Some(ext) => {
            matches!(
                ext.as_slice(),
                b"zip" | b"rar" | b"7z" | b"cbz" | b"cbr" | b"cb7"
            )
        }
        None => false,
    }
}

/// 快速路径哈希（使用 ahash）
#[inline]
pub fn hash_path_fast(path: &[u8]) -> u64 {
    use std::hash::{Hash, Hasher};
    let normalized = normalize_path_fast(path);
    let mut hasher = ahash::AHasher::default();
    normalized.hash(&mut hasher);
    hasher.finish()
}

/// 从 Path 转换为 BString
#[inline]
pub fn path_to_bstring(path: &Path) -> BString {
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        BString::from(path.as_os_str().as_bytes())
    }
    #[cfg(windows)]
    {
        // Windows 上使用 lossy 转换
        BString::from(path.to_string_lossy().as_bytes())
    }
}

/// 从 BString 转换为 String（lossy）
#[inline]
pub fn bstring_to_string_lossy(bs: &BStr) -> String {
    bs.to_str_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_path_fast() {
        assert_eq!(
            normalize_path_fast(b"a\\b\\c"),
            BString::from("a/b/c")
        );
        assert_eq!(
            normalize_path_fast(b"a//b///c"),
            BString::from("a/b/c")
        );
        assert_eq!(
            normalize_path_fast(b"a/b/c/"),
            BString::from("a/b/c")
        );
        assert_eq!(
            normalize_path_fast(b"a\\\\b\\c\\"),
            BString::from("a/b/c")
        );
    }

    #[test]
    fn test_paths_equal_fast() {
        assert!(paths_equal_fast(b"a/b/c", b"a\\b\\c"));
        assert!(paths_equal_fast(b"a/b/c", b"a/b/c"));
        assert!(!paths_equal_fast(b"a/b/c", b"a/b/d"));
        assert!(!paths_equal_fast(b"a/b", b"a/b/c"));
    }

    #[test]
    fn test_file_name_fast() {
        assert_eq!(file_name_fast(b"a/b/c.txt"), BStr::new(b"c.txt"));
        assert_eq!(file_name_fast(b"a\\b\\c.txt"), BStr::new(b"c.txt"));
        assert_eq!(file_name_fast(b"c.txt"), BStr::new(b"c.txt"));
    }

    #[test]
    fn test_extension_fast() {
        assert_eq!(extension_fast(b"test.JPG"), Some(BString::from("jpg")));
        assert_eq!(extension_fast(b"test.png"), Some(BString::from("png")));
        assert_eq!(extension_fast(b"test"), None);
        assert_eq!(extension_fast(b".hidden"), None);
        assert_eq!(extension_fast(b"test."), None);
    }

    #[test]
    fn test_is_image_file_fast() {
        assert!(is_image_file_fast(b"test.jpg"));
        assert!(is_image_file_fast(b"test.PNG"));
        assert!(is_image_file_fast(b"path/to/image.webp"));
        assert!(!is_image_file_fast(b"test.txt"));
        assert!(!is_image_file_fast(b"test.mp4"));
    }

    #[test]
    fn test_is_video_file_fast() {
        assert!(is_video_file_fast(b"test.mp4"));
        assert!(is_video_file_fast(b"test.MKV"));
        assert!(!is_video_file_fast(b"test.jpg"));
    }

    #[test]
    fn test_is_archive_file_fast() {
        assert!(is_archive_file_fast(b"test.zip"));
        assert!(is_archive_file_fast(b"test.RAR"));
        assert!(is_archive_file_fast(b"test.cbz"));
        assert!(!is_archive_file_fast(b"test.jpg"));
    }

    #[test]
    fn test_hash_path_fast() {
        // 相同路径（不同斜杠）应该有相同哈希
        let h1 = hash_path_fast(b"a/b/c");
        let h2 = hash_path_fast(b"a\\b\\c");
        assert_eq!(h1, h2);

        // 不同路径应该有不同哈希
        let h3 = hash_path_fast(b"a/b/d");
        assert_ne!(h1, h3);
    }
}
