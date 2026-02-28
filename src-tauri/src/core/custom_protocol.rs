//! Custom Protocol 模块
//! 实现 neoview:// 协议，绕过 invoke 序列化开销，直接传输二进制数据
//!
//! 性能优化（参考 Spacedrive）:
//! - 使用 mini_moka LRU 缓存避免重复的路径查找
//! - 缓存压缩包条目列表，减少重复解析

use crate::commands::ThumbnailState;
use crate::commands::thumbnail_v3_commands::ThumbnailServiceV3State;
use crate::core::archive::ArchiveManager;
use crate::core::mmap_archive::MmapCache;
use ahash::AHashMap;
use log::{debug, error, info, warn};
use mini_moka::sync::Cache;
use parking_lot::RwLock;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tauri::http::{Request, Response, StatusCode};
use tauri::Manager;

/// 协议名称
pub const PROTOCOL_NAME: &str = "neoview";

/// 路径哈希到实际路径的映射
pub struct PathRegistry {
    /// 哈希 -> 路径映射
    hash_to_path: RwLock<AHashMap<String, Arc<PathBuf>>>,
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
            let path_buf = path.to_path_buf();
            let shared_path = Arc::new(path_buf.clone());
            let mut hash_to_path = self.hash_to_path.write();
            let mut path_to_hash = self.path_to_hash.write();
            hash_to_path.insert(hash.clone(), shared_path);
            path_to_hash.insert(path_buf, hash.clone());
        }

        hash
    }

    /// 根据哈希获取路径
    pub fn get_path(&self, hash: &str) -> Option<Arc<PathBuf>> {
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
pub struct CachedArchiveEntry {
    pub path: String,
    pub mime_type: &'static str,
}

/// 缓存的压缩包元数据
#[derive(Clone, Debug)]
struct CachedArchiveMetadata {
    /// 图片和视频条目（按 entry_index 直接索引）
    image_entries: Vec<Option<CachedArchiveEntry>>,
}

/// Custom Protocol 状态
pub struct ProtocolState {
    /// 路径注册表
    pub path_registry: PathRegistry,
    /// 内存映射缓存
    pub mmap_cache: MmapCache,
    /// 压缩包管理器
    pub archive_manager: Arc<ArchiveManager>,
    /// 压缩包元数据缓存（避免重复列出内容）
    /// 参考 Spacedrive 的 file_metadata_cache
    archive_metadata_cache: Cache<u64, Arc<CachedArchiveMetadata>>,
    /// 压缩包图片二进制缓存（避免重复解包读取）
    archive_image_cache: Cache<(u64, usize), Arc<[u8]>>,
}

impl ProtocolState {
    pub fn new(archive_manager: Arc<std::sync::Mutex<ArchiveManager>>) -> Self {
        // 创建 LRU 缓存，最多缓存 100 个压缩包的元数据
        // 参考 Spacedrive: Cache::new(150)
        let archive_metadata_cache = Cache::builder()
            .max_capacity(100)
            .time_to_live(Duration::from_secs(300)) // 5分钟过期
            .build();
        let archive_image_cache = Cache::builder()
            .max_capacity(256)
            .time_to_live(Duration::from_secs(180))
            .build();

        let shared_archive_manager = {
            let manager = archive_manager.lock().unwrap();
            Arc::new(manager.clone())
        };

        Self {
            path_registry: PathRegistry::new(),
            mmap_cache: MmapCache::default(),
            archive_manager: shared_archive_manager,
            archive_metadata_cache,
            archive_image_cache,
        }
    }

    #[inline]
    fn parse_book_key(book_hash: &str) -> u64 {
        u64::from_str_radix(book_hash, 16).unwrap_or_else(|_| {
            use std::hash::{Hash, Hasher};
            let mut hasher = ahash::AHasher::default();
            book_hash.hash(&mut hasher);
            hasher.finish()
        })
    }

    /// 获取或缓存压缩包元数据
    fn get_or_cache_metadata(
        &self,
        book_key: u64,
        book_hash: &str,
        book_path: &Path,
    ) -> Result<Arc<CachedArchiveMetadata>, String> {
        // 先检查缓存
        if let Some(cached) = self.archive_metadata_cache.get(&book_key) {
            debug!("📦 Protocol: 使用缓存的元数据, hash={}", book_hash);
            return Ok(cached);
        }

        // 缓存未命中，从压缩包读取
        let entries = self
            .archive_manager
            .list_contents(book_path)
            .map_err(|e| format!("列出压缩包内容失败: {}", e))?;

        // 过滤并缓存可查看条目（图片和视频）
        let mut image_entries = vec![None; entries.len()];
        for e in entries {
            if e.is_image || e.is_video {
                if e.entry_index >= image_entries.len() {
                    image_entries.resize(e.entry_index + 1, None);
                }
                image_entries[e.entry_index] = Some(CachedArchiveEntry {
                    mime_type: get_mime_type(&e.path),
                    path: e.path,
                });
            }
        }

        let metadata = Arc::new(CachedArchiveMetadata {
            image_entries,
        });

        // 存入缓存
        self.archive_metadata_cache.insert(book_key, metadata.clone());
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
            .invalidate(&Self::parse_book_key(book_hash));
    }

    /// 清空所有缓存
    pub fn clear_cache(&self) {
        self.archive_metadata_cache.invalidate_all();
        self.archive_image_cache.invalidate_all();
    }
}

/// 解析协议请求
#[derive(Debug)]
pub enum ProtocolRequest {
    /// 健康检查: `/health`
    Health,
    /// 压缩包内图片: `/image/{book_hash}/{entry_index}`
    ArchiveImage {
        book_hash: String,
        book_key: u64,
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
        let mut parts = path.split('/');
        let head = parts.next();

        match head {
            Some("health") if parts.next().is_none() => ProtocolRequest::Health,
            Some("image") => {
                let Some(book_hash) = parts.next() else {
                    return ProtocolRequest::Unknown;
                };
                let Some(entry_index) = parts.next() else {
                    return ProtocolRequest::Unknown;
                };
                if parts.next().is_some() {
                    return ProtocolRequest::Unknown;
                }

                if let Ok(index) = entry_index.parse::<usize>() {
                    let book_key = ProtocolState::parse_book_key(book_hash);
                    ProtocolRequest::ArchiveImage {
                        book_hash: book_hash.to_string(),
                        book_key,
                        entry_index: index,
                    }
                } else {
                    ProtocolRequest::Unknown
                }
            }
            Some("file") => {
                let Some(path_hash) = parts.next() else {
                    return ProtocolRequest::Unknown;
                };
                if parts.next().is_some() {
                    return ProtocolRequest::Unknown;
                }
                ProtocolRequest::FileImage {
                    path_hash: path_hash.to_string(),
                }
            }
            Some("thumb") => {
                let Some(key) = parts.next() else {
                    return ProtocolRequest::Unknown;
                };
                if parts.next().is_some() {
                    return ProtocolRequest::Unknown;
                }
                ProtocolRequest::Thumbnail {
                    key: urlencoding::decode(key)
                        .map_or_else(|_| key.to_string(), |s| s.to_string()),
                }
            }
            _ => ProtocolRequest::Unknown,
        }
    }
}

/// 根据文件扩展名获取 MIME 类型
fn get_mime_type(path: &str) -> &'static str {
    let Some(ext) = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
    else {
        return "application/octet-stream";
    };

    if ext.eq_ignore_ascii_case("jpg") || ext.eq_ignore_ascii_case("jpeg") {
        return "image/jpeg";
    }
    if ext.eq_ignore_ascii_case("png") {
        return "image/png";
    }
    if ext.eq_ignore_ascii_case("gif") {
        return "image/gif";
    }
    if ext.eq_ignore_ascii_case("webp") {
        return "image/webp";
    }
    if ext.eq_ignore_ascii_case("avif") {
        return "image/avif";
    }
    if ext.eq_ignore_ascii_case("bmp") {
        return "image/bmp";
    }
    if ext.eq_ignore_ascii_case("ico") {
        return "image/x-icon";
    }
    if ext.eq_ignore_ascii_case("tiff") || ext.eq_ignore_ascii_case("tif") {
        return "image/tiff";
    }
    if ext.eq_ignore_ascii_case("jxl") {
        return "image/jxl";
    }
    if ext.eq_ignore_ascii_case("svg") {
        return "image/svg+xml";
    }

    if ext.eq_ignore_ascii_case("mp4")
        || ext.eq_ignore_ascii_case("m4v")
        || ext.eq_ignore_ascii_case("nov")
    {
        return "video/mp4";
    }
    if ext.eq_ignore_ascii_case("webm") {
        return "video/webm";
    }
    if ext.eq_ignore_ascii_case("mkv") {
        return "video/x-matroska";
    }
    if ext.eq_ignore_ascii_case("avi") {
        return "video/x-msvideo";
    }
    if ext.eq_ignore_ascii_case("mov") {
        return "video/quicktime";
    }
    if ext.eq_ignore_ascii_case("wmv") {
        return "video/x-ms-wmv";
    }
    if ext.eq_ignore_ascii_case("flv") {
        return "video/x-flv";
    }
    if ext.eq_ignore_ascii_case("ogg") || ext.eq_ignore_ascii_case("ogv") {
        return "video/ogg";
    }
    if ext.eq_ignore_ascii_case("3gp") {
        return "video/3gpp";
    }
    if ext.eq_ignore_ascii_case("3g2") {
        return "video/3gpp2";
    }
    if ext.eq_ignore_ascii_case("mpg") || ext.eq_ignore_ascii_case("mpeg") {
        return "video/mpeg";
    }

    "application/octet-stream"
}

/// 构建成功响应
fn build_response(data: Vec<u8>, mime_type: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", mime_type)
        .header("Content-Length", data.len().to_string())
        .header("Accept-Ranges", "bytes")
        .header("Cache-Control", "max-age=3600, immutable")
        .header("Access-Control-Allow-Origin", "*")
        .body(data)
        .unwrap()
}

fn parse_byte_range(request: &Request<Vec<u8>>, total_len: usize) -> Option<(usize, usize)> {
    if total_len == 0 {
        return None;
    }

    let header = request.headers().get("Range")?;
    let value = header.to_str().ok()?;
    let range = value.strip_prefix("bytes=")?;
    let (start_raw, end_raw) = range.split_once('-')?;

    if start_raw.is_empty() {
        return None;
    }

    let start = start_raw.parse::<usize>().ok()?;
    if start >= total_len {
        return None;
    }

    let end = if end_raw.is_empty() {
        total_len.saturating_sub(1)
    } else {
        end_raw.parse::<usize>().ok()?.min(total_len.saturating_sub(1))
    };

    if end < start {
        return None;
    }

    Some((start, end))
}

fn build_response_from_slice(
    bytes: &[u8],
    mime_type: &str,
    range: Option<(usize, usize)>,
) -> Response<Vec<u8>> {
    if let Some((start, end)) = range {
        let body = bytes[start..=end].to_vec();
        return Response::builder()
            .status(StatusCode::PARTIAL_CONTENT)
            .header("Content-Type", mime_type)
            .header("Content-Length", body.len().to_string())
            .header("Content-Range", format!("bytes {}-{}/{}", start, end, bytes.len()))
            .header("Accept-Ranges", "bytes")
            .header("Cache-Control", "max-age=3600, immutable")
            .header("Access-Control-Allow-Origin", "*")
            .body(body)
            .unwrap();
    }

    build_response(bytes.to_vec(), mime_type)
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
    request: &Request<Vec<u8>>,
    book_hash: &str,
    book_key: u64,
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
    let metadata = match state.get_or_cache_metadata(book_key, book_hash, book_path.as_ref()) {
        Ok(m) => m,
        Err(e) => {
            error!("📦 Protocol: 获取元数据失败: {e}");
            return build_error_response(StatusCode::INTERNAL_SERVER_ERROR, &e);
        }
    };

    // 查找指定索引的条目
    let Some(entry) = metadata
        .image_entries
        .get(entry_index)
        .and_then(|entry| entry.as_ref())
    else {
        warn!(
            "📦 Protocol: 无法找到条目索引, index={}, entries_cached={}",
            entry_index,
            metadata.image_entries.len()
        );
        return build_error_response(StatusCode::NOT_FOUND, "Entry not found");
    };

    let cache_key = (book_key, entry_index);
    let mime_type = entry.mime_type;
    if let Some(cached) = state.archive_image_cache.get(&cache_key) {
        let range = parse_byte_range(request, cached.len());
        return build_response_from_slice(cached.as_ref(), mime_type, range);
    }

    // 提取图片数据
    let shared = match state
        .archive_manager
        .load_image_from_archive_shared_with_hint(book_path.as_ref(), &entry.path, Some(entry_index))
    {
        Ok(data) => data,
        Err(e) => {
            error!("📦 Protocol: 提取图片失败: {e}");
            return build_error_response(StatusCode::INTERNAL_SERVER_ERROR, &e);
        }
    };
    state.archive_image_cache.insert(cache_key, shared.clone());
    let range = parse_byte_range(request, shared.len());
    build_response_from_slice(shared.as_ref(), mime_type, range)
}

/// 处理文件图片请求
fn handle_file_image(
    state: &ProtocolState,
    request: &Request<Vec<u8>>,
    path_hash: &str,
) -> Response<Vec<u8>> {
    // 从注册表获取路径
    let Some(file_path) = state.path_registry.get_path(path_hash) else {
        warn!("📁 Protocol: 未找到文件路径, hash={path_hash}");
        return build_error_response(StatusCode::NOT_FOUND, "File not found");
    };

    debug!("📁 Protocol: 加载文件图片, path={}", file_path.display());

    // 使用内存映射读取
    let data = match state.mmap_cache.get_or_create(file_path.as_ref()) {
        Ok(mmap) => mmap,
        Err(e) => {
            error!("📁 Protocol: 读取文件失败: {e}");
            return build_error_response(StatusCode::INTERNAL_SERVER_ERROR, &e);
        }
    };

    let mime_type = get_mime_type(&file_path.to_string_lossy());
    let bytes = data.as_slice();
    let range = parse_byte_range(request, bytes.len());
    build_response_from_slice(bytes, mime_type, range)
}

/// 处理缩略图请求
fn handle_thumbnail(app: &tauri::AppHandle, key: &str) -> Response<Vec<u8>> {
    // 优先查 ThumbnailServiceV3：内存缓存（O(1)）→ DB
    // 这是 IPC 去-blob 优化的关锎：前端不再通过 IPC 接收 blob，而是通过此协议 URL 取
    if let Some(v3_state) = app.try_state::<ThumbnailServiceV3State>() {
        if let Some(data) = v3_state.service.lookup_thumbnail(key) {
            debug!("🖼️ Protocol: V3 命中缩略图, key={key}");
            return build_response(data.as_ref().to_vec(), "image/webp");
        }
    }

    // 回落到旧 ThumbnailState DB（兴趣点：只查 DB）
    let Some(thumb_state) = app.try_state::<ThumbnailState>() else {
        warn!("🖼️ Protocol: ThumbnailState 未初始化");
        return build_error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Thumbnail state not initialized",
        );
    };

    let db = &thumb_state.db;
    match db.load_thumbnail_by_key_and_category(key, "file") {
        Ok(Some(data)) => {
            debug!("🖼️ Protocol: 旧路加载文件缩略图成功, key={key}");
            build_response(data, "image/webp")
        }
        _ => match db.load_thumbnail_by_key_and_category(key, "folder") {
            Ok(Some(data)) => {
                debug!("🖼️ Protocol: 旧路加载文件夹缩略图成功, key={key}");
                build_response(data, "image/webp")
            }
            _ => {
                debug!("🖼️ Protocol: 未找到缩略图, key={key}");
                build_error_response(StatusCode::NOT_FOUND, "Thumbnail not found")
            }
        },
    }
}

fn handle_health_check() -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "text/plain")
        .header("Cache-Control", "no-store")
    .header("Access-Control-Allow-Origin", "*")
        .body(b"ok".to_vec())
        .unwrap()
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
        ProtocolRequest::Health => handle_health_check(),
        ProtocolRequest::ArchiveImage {
            book_hash,
            book_key,
            entry_index,
        } => handle_archive_image(&state, request, &book_hash, book_key, entry_index),
        ProtocolRequest::FileImage { path_hash } => handle_file_image(&state, request, &path_hash),
        ProtocolRequest::Thumbnail { key } => handle_thumbnail(app, &key),
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
                book_key,
                entry_index,
            } => {
                assert_eq!(book_hash, "abc123");
                assert_eq!(book_key, ProtocolState::parse_book_key("abc123"));
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

        // 测试健康检查请求
        assert!(matches!(
            ProtocolRequest::parse("/health"),
            ProtocolRequest::Health
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
        assert_eq!(
            registry.get_path(&hash1).as_deref().cloned(),
            Some(path1.clone())
        );
        assert_eq!(
            registry.get_path(&hash2).as_deref().cloned(),
            Some(path2.clone())
        );

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
