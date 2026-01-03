//! Custom Protocol 模块
//! 实现 neoview:// 协议，绕过 invoke 序列化开销，直接传输二进制数据
//!
//! 性能优化（参考 Spacedrive）:
//! - 使用 mini_moka LRU 缓存避免重复的路径查找
//! - 缓存压缩包条目列表，减少重复解析

use crate::core::archive::ArchiveManager;
use crate::core::mmap_archive::MmapCache;
use ahash::AHashMap;
use log::{debug, error, info, warn};
use mini_moka::sync::Cache;
use parking_lot::RwLock;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::http::{Request, Response, StatusCode};
use tauri::Manager;

/// 协议名称
pub const PROTOCOL_NAME: &str = "neoview";

/// 路径哈希到实际路径的映射
pub struct PathRegistry {
    /// 哈希 -> 路径映射
    hash_to_path: RwLock<AHashMap<String, PathBuf>>,
    /// 路径 -> 哈希映射（反向查找）
    path_to_hash: RwLock<AHashMap<PathBuf, String>>,
}

impl PathRegistry {
    pub fn new() -> Self {
        Self {
            hash_to_path: RwLock::new(AHashMap::new()),
            path_to_hash: RwLock::new(AHashMap::new()),
        }
    }

    /// 注册路径并返回哈希
    pub fn register(&self, path: &Path) -> String {
        // 先检查是否已注册
        {
            let path_to_hash = self.path_to_hash.read();
            if let Some(hash) = path_to_hash.get(path) {
                return hash.clone();
            }
        }

        // 计算哈希
        let hash = Self::compute_hash(path);

        // 注册
        {
            let mut hash_to_path = self.hash_to_path.write();
            let mut path_to_hash = self.path_to_hash.write();
            hash_to_path.insert(hash.clone(), path.to_path_buf());
            path_to_hash.insert(path.to_path_buf(), hash.clone());
        }

        hash
    }

    /// 根据哈希获取路径
    pub fn get_path(&self, hash: &str) -> Option<PathBuf> {
        let hash_to_path = self.hash_to_path.read();
        hash_to_path.get(hash).cloned()
    }

    /// 计算路径哈希（使用 ahash 快速哈希）
    fn compute_hash(path: &Path) -> String {
        use std::hash::{Hash, Hasher};
        let mut hasher = ahash::AHasher::default();
        path.hash(&mut hasher);
        format!("{:016x}", hasher.finish())
    }

    /// 清理注册表
    pub fn clear(&self) {
        let mut hash_to_path = self.hash_to_path.write();
        let mut path_to_hash = self.path_to_hash.write();
        hash_to_path.clear();
        path_to_hash.clear();
    }
}

impl Default for PathRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// 缓存的压缩包条目信息
#[derive(Clone, Debug)]
struct CachedArchiveEntry {
    /// 条目名称
    name: String,
    /// 条目内部路径
    path: String,
    /// 是否是图片
    is_image: bool,
}

/// 缓存的压缩包元数据
#[derive(Clone, Debug)]
struct CachedArchiveMetadata {
    /// 图片条目列表
    image_entries: Vec<CachedArchiveEntry>,
    /// 缓存时间
    cached_at: Instant,
}

/// Custom Protocol 状态
pub struct ProtocolState {
    /// 路径注册表
    pub path_registry: PathRegistry,
    /// 内存映射缓存
    pub mmap_cache: MmapCache,
    /// 压缩包管理器
    pub archive_manager: Arc<std::sync::Mutex<ArchiveManager>>,
    /// 压缩包元数据缓存（避免重复列出内容）
    /// 参考 Spacedrive 的 file_metadata_cache
    archive_metadata_cache: Cache<String, CachedArchiveMetadata>,
}

impl ProtocolState {
    pub fn new(archive_manager: Arc<std::sync::Mutex<ArchiveManager>>) -> Self {
        // 创建 LRU 缓存，最多缓存 100 个压缩包的元数据
        // 参考 Spacedrive: Cache::new(150)
        let archive_metadata_cache = Cache::builder()
            .max_capacity(100)
            .time_to_live(Duration::from_secs(300)) // 5分钟过期
            .build();

        Self {
            path_registry: PathRegistry::new(),
            mmap_cache: MmapCache::default(),
            archive_manager,
            archive_metadata_cache,
        }
    }

    /// 获取或缓存压缩包元数据
    fn get_or_cache_metadata(
        &self,
        book_hash: &str,
        book_path: &Path,
    ) -> Result<CachedArchiveMetadata, String> {
        // 先检查缓存
        if let Some(cached) = self.archive_metadata_cache.get(&book_hash.to_string()) {
            debug!("📦 Protocol: 使用缓存的元数据, hash={}", book_hash);
            return Ok(cached);
        }

        // 缓存未命中，从压缩包读取
        let archive_manager = self.archive_manager.lock().unwrap();
        let entries = archive_manager
            .list_contents(book_path)
            .map_err(|e| format!("列出压缩包内容失败: {}", e))?;

        // 过滤并缓存图片条目
        let image_entries: Vec<CachedArchiveEntry> = entries
            .iter()
            .filter(|e| e.is_image)
            .map(|e| CachedArchiveEntry {
                name: e.name.clone(),
                path: e.path.clone(),
                is_image: true,
            })
            .collect();

        let metadata = CachedArchiveMetadata {
            image_entries,
            cached_at: Instant::now(),
        };

        // 存入缓存
        self.archive_metadata_cache
            .insert(book_hash.to_string(), metadata.clone());
        debug!(
            "📦 Protocol: 缓存元数据, hash={}, entries={}",
            book_hash,
            metadata.image_entries.len()
        );

        Ok(metadata)
    }

    /// 使指定压缩包的缓存失效
    pub fn invalidate_cache(&self, book_hash: &str) {
        self.archive_metadata_cache
            .invalidate(&book_hash.to_string());
    }

    /// 清空所有缓存
    pub fn clear_cache(&self) {
        self.archive_metadata_cache.invalidate_all();
    }
}

/// 解析协议请求
#[derive(Debug)]
pub enum ProtocolRequest {
    /// 压缩包内图片: `/image/{book_hash}/{entry_index}`
    ArchiveImage {
        book_hash: String,
        entry_index: usize,
    },
    /// 文件夹图片: `/file/{path_hash}`
    FileImage { path_hash: String },
    /// 缩略图: `/thumb/{key}`
    Thumbnail { key: String },
    /// 未知请求
    Unknown,
}

impl ProtocolRequest {
    /// 从 URI 路径解析请求
    pub fn parse(path: &str) -> Self {
        let path = path.trim_start_matches('/');
        let parts: Vec<&str> = path.split('/').collect();

        match parts.as_slice() {
            ["image", book_hash, entry_index] => {
                if let Ok(index) = entry_index.parse::<usize>() {
                    ProtocolRequest::ArchiveImage {
                        book_hash: (*book_hash).to_string(),
                        entry_index: index,
                    }
                } else {
                    ProtocolRequest::Unknown
                }
            }
            ["file", path_hash] => ProtocolRequest::FileImage {
                path_hash: (*path_hash).to_string(),
            },
            ["thumb", key] => ProtocolRequest::Thumbnail {
                key: urlencoding::decode(key)
                    .map_or_else(|_| (*key).to_string(), |s| s.to_string()),
            },
            _ => ProtocolRequest::Unknown,
        }
    }
}

/// 根据文件扩展名获取 MIME 类型
fn get_mime_type(path: &str) -> &'static str {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_lowercase)
        .unwrap_or_default();

    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "tiff" | "tif" => "image/tiff",
        "jxl" => "image/jxl",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

/// 构建成功响应
fn build_response(data: Vec<u8>, mime_type: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", mime_type)
        .header("Content-Length", data.len().to_string())
        .header("Cache-Control", "max-age=3600, immutable")
        .header("Access-Control-Allow-Origin", "*")
        .body(data)
        .unwrap()
}

/// 构建错误响应
fn build_error_response(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Content-Type", "text/plain")
        .header("Access-Control-Allow-Origin", "*")
        .body(message.as_bytes().to_vec())
        .unwrap()
}

/// 处理压缩包图片请求
fn handle_archive_image(
    state: &ProtocolState,
    book_hash: &str,
    entry_index: usize,
) -> Response<Vec<u8>> {
    // 从注册表获取路径
    let Some(book_path) = state.path_registry.get_path(book_hash) else {
        warn!("📦 Protocol: 未找到书籍路径, hash={book_hash}");
        return build_error_response(StatusCode::NOT_FOUND, "Book not found");
    };

    debug!(
        "📦 Protocol: 加载压缩包图片, path={}, index={}",
        book_path.display(),
        entry_index
    );

    // 使用缓存的元数据（参考 Spacedrive 的 get_or_init_lru_entry）
    let metadata = match state.get_or_cache_metadata(book_hash, &book_path) {
        Ok(m) => m,
        Err(e) => {
            error!("📦 Protocol: 获取元数据失败: {e}");
            return build_error_response(StatusCode::INTERNAL_SERVER_ERROR, &e);
        }
    };

    // 查找指定索引的图片条目
    let Some(entry) = metadata.image_entries.get(entry_index) else {
        warn!(
            "📦 Protocol: 条目索引越界, index={}, total={}",
            entry_index,
            metadata.image_entries.len()
        );
        return build_error_response(StatusCode::NOT_FOUND, "Entry not found");
    };

    // 提取图片数据
    let archive_manager = state.archive_manager.lock().unwrap();
    let data = match archive_manager.load_image_from_archive_binary(&book_path, &entry.path) {
        Ok(data) => data,
        Err(e) => {
            error!("📦 Protocol: 提取图片失败: {e}");
            return build_error_response(StatusCode::INTERNAL_SERVER_ERROR, &e);
        }
    };

    let mime_type = get_mime_type(&entry.name);
    build_response(data, mime_type)
}

/// 处理文件图片请求
fn handle_file_image(state: &ProtocolState, path_hash: &str) -> Response<Vec<u8>> {
    // 从注册表获取路径
    let Some(file_path) = state.path_registry.get_path(path_hash) else {
        warn!("📁 Protocol: 未找到文件路径, hash={path_hash}");
        return build_error_response(StatusCode::NOT_FOUND, "File not found");
    };

    debug!("📁 Protocol: 加载文件图片, path={}", file_path.display());

    // 使用内存映射读取
    let data = match state.mmap_cache.get_or_create(&file_path) {
        Ok(mmap) => mmap.as_slice().to_vec(),
        Err(e) => {
            error!("📁 Protocol: 读取文件失败: {e}");
            return build_error_response(StatusCode::INTERNAL_SERVER_ERROR, &e);
        }
    };

    let mime_type = get_mime_type(&file_path.to_string_lossy());
    build_response(data, mime_type)
}

/// 处理缩略图请求
fn handle_thumbnail(_state: &ProtocolState, key: &str) -> Response<Vec<u8>> {
    // TODO: 从缩略图数据库加载
    debug!("🖼️ Protocol: 加载缩略图, key={key}");
    build_error_response(StatusCode::NOT_IMPLEMENTED, "Thumbnail not implemented yet")
}

/// 处理协议请求
pub fn handle_protocol_request(
    app: &tauri::AppHandle,
    request: &Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let uri = request.uri();
    let path = uri.path();

    debug!("🌐 Protocol request: {path}");

    // 获取协议状态
    let Some(state) = app.try_state::<ProtocolState>() else {
        error!("🌐 Protocol: 状态未初始化");
        return build_error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Protocol state not initialized",
        );
    };

    // 解析请求
    let protocol_request = ProtocolRequest::parse(path);

    match protocol_request {
        ProtocolRequest::ArchiveImage {
            book_hash,
            entry_index,
        } => handle_archive_image(&state, &book_hash, entry_index),
        ProtocolRequest::FileImage { path_hash } => handle_file_image(&state, &path_hash),
        ProtocolRequest::Thumbnail { key } => handle_thumbnail(&state, &key),
        ProtocolRequest::Unknown => {
            warn!("🌐 Protocol: 未知请求路径: {path}");
            build_error_response(StatusCode::NOT_FOUND, "Unknown request")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_protocol_request_parse() {
        // 测试压缩包图片请求
        match ProtocolRequest::parse("/image/abc123/5") {
            ProtocolRequest::ArchiveImage {
                book_hash,
                entry_index,
            } => {
                assert_eq!(book_hash, "abc123");
                assert_eq!(entry_index, 5);
            }
            _ => panic!("解析失败"),
        }

        // 测试文件图片请求
        match ProtocolRequest::parse("/file/def456") {
            ProtocolRequest::FileImage { path_hash } => {
                assert_eq!(path_hash, "def456");
            }
            _ => panic!("解析失败"),
        }

        // 测试缩略图请求
        match ProtocolRequest::parse("/thumb/my%20key") {
            ProtocolRequest::Thumbnail { key } => {
                assert_eq!(key, "my key");
            }
            _ => panic!("解析失败"),
        }

        // 测试未知请求
        assert!(matches!(
            ProtocolRequest::parse("/unknown/path"),
            ProtocolRequest::Unknown
        ));
    }

    #[test]
    fn test_path_registry() {
        let registry = PathRegistry::new();

        let path1 = PathBuf::from("/test/path1.zip");
        let path2 = PathBuf::from("/test/path2.zip");

        // 注册路径
        let hash1 = registry.register(&path1);
        let hash2 = registry.register(&path2);

        // 验证哈希不同
        assert_ne!(hash1, hash2);

        // 验证可以通过哈希获取路径
        assert_eq!(registry.get_path(&hash1), Some(path1.clone()));
        assert_eq!(registry.get_path(&hash2), Some(path2.clone()));

        // 验证重复注册返回相同哈希
        let hash1_again = registry.register(&path1);
        assert_eq!(hash1, hash1_again);
    }

    #[test]
    fn test_get_mime_type() {
        assert_eq!(get_mime_type("test.jpg"), "image/jpeg");
        assert_eq!(get_mime_type("test.JPEG"), "image/jpeg");
        assert_eq!(get_mime_type("test.png"), "image/png");
        assert_eq!(get_mime_type("test.gif"), "image/gif");
        assert_eq!(get_mime_type("test.webp"), "image/webp");
        assert_eq!(get_mime_type("test.unknown"), "application/octet-stream");
    }
}
