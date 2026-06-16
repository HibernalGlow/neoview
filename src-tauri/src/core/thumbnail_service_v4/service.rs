//! 统一缩略图服务
//!
//! 使用现有 ThumbnailGenerator + ThumbnailDb，但接口改为 source-aware
//!
//! 注意：ThumbnailGenerator 的方法均为同步方法（非 async），
//! 因此实际生成操作通过 tokio::task::spawn_blocking 在阻塞线程池执行。

use std::collections::HashMap;
use std::sync::Arc;
use futures::stream::{self, StreamExt};
use tokio::sync::RwLock;
use crate::core::thumbnail_generator::ThumbnailGenerator;
use crate::core::thumbnail_db::ThumbnailDb;
use crate::core::thumbnail_service_v4::types::*;
use crate::core::thumbnail_service_v4::queue::ThumbnailQueue;

/// 统一缩略图服务
pub struct UnifiedThumbnailService {
    generator: Arc<ThumbnailGenerator>,
    db: Arc<ThumbnailDb>,
    queue: Arc<RwLock<ThumbnailQueue>>,
    url_version: Arc<std::sync::atomic::AtomicU32>,
    memory_cache: Arc<parking_lot::RwLock<HashMap<String, Arc<[u8]>>>>,
}

impl UnifiedThumbnailService {
    pub fn new(generator: Arc<ThumbnailGenerator>, db: Arc<ThumbnailDb>) -> Self {
        Self {
            generator,
            db,
            queue: Arc::new(RwLock::new(ThumbnailQueue::new())),
            url_version: Arc::new(std::sync::atomic::AtomicU32::new(1)),
            memory_cache: Arc::new(parking_lot::RwLock::new(HashMap::new())),
        }
    }

    /// 请求缩略图（入队）
    pub async fn request_thumbnails(&self, params: RequestThumbnailsParams) {
        let mut queue = self.queue.write().await;
        for item in params.items {
            queue.enqueue(
                item,
                params.lane,
                params.center_index,
                params.generation,
            );
        }
    }

    /// 取消上下文
    pub async fn cancel_context(&self, context_id: &str) {
        let mut queue = self.queue.write().await;
        let new_gen = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u32;
        queue.cancel_context(context_id, new_gen);
    }

    /// 处理队列中的下一个任务
    /// 返回就绪的缩略图项列表
    ///
    /// ThumbnailGenerator 的 generate_file_thumbnail / generate_archive_thumbnail
    /// 均为同步方法且内部已处理数据库缓存读写，因此这里只需调用即可。
    pub async fn process_next(&self) -> Option<Vec<ThumbnailReadyItem>> {
        let task = {
            let mut queue = self.queue.write().await;
            queue.dequeue()
        }?;

        let key = task.request.key.clone();
        let generator = Arc::clone(&self.generator);
        let db = Arc::clone(&self.db);
        let url_version = Arc::clone(&self.url_version);

        // 在阻塞线程池中执行同步的缩略图生成
        let result = tokio::task::spawn_blocking(move || {
            generate_thumbnail_blob(&generator, &db, &task.request.source)
        })
        .await
        .ok()
        .flatten();

        match result {
            Some(blob) => {
                self.memory_cache
                    .write()
                    .insert(key.clone(), Arc::<[u8]>::from(blob.into_boxed_slice()));
                let version = url_version.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
                Some(vec![ThumbnailReadyItem {
                    key,
                    url_version: version,
                    width: 0, // 实际尺寸需解码 webp 获取，暂不返回
                    height: 0,
                }])
            }
            None => None,
        }
    }

    pub async fn generate_thumbnails(
        &self,
        items: Vec<ThumbnailRequest>,
        lane: ThumbnailLane,
    ) -> Vec<ThumbnailReadyItem> {
        let concurrency = generation_concurrency(lane);
        let generator = Arc::clone(&self.generator);
        let db = Arc::clone(&self.db);
        let memory_cache = Arc::clone(&self.memory_cache);
        let url_version = Arc::clone(&self.url_version);

        stream::iter(items.into_iter())
            .map(move |item| {
                let generator = Arc::clone(&generator);
                let db = Arc::clone(&db);
                let memory_cache = Arc::clone(&memory_cache);
                let url_version = Arc::clone(&url_version);

                async move {
                    if let Some(data) = { memory_cache.read().get(&item.key).cloned() } {
                        let version = url_version.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
                        let (width, height) = image_dimensions(data.as_ref());
                        return Some(ThumbnailReadyItem {
                            key: item.key,
                            url_version: version,
                            width,
                            height,
                        });
                    }

                    let key = item.key;
                    let source = item.source;
                    let started = std::time::Instant::now();
                    let blob = tokio::task::spawn_blocking(move || {
                        generate_thumbnail_blob(&generator, &db, &source)
                    })
                    .await
                    .ok()
                    .flatten();

                    let Some(blob) = blob else {
                        return None;
                    };

                    let elapsed_ms = started.elapsed().as_millis();
                    if elapsed_ms > 250 {
                        log::debug!(
                            "🖼️ [ThumbV4] slow generate: key={}, lane={}, {}ms",
                            key,
                            lane,
                            elapsed_ms
                        );
                    }

                    let (width, height) = image_dimensions(&blob);
                    memory_cache
                        .write()
                        .insert(key.clone(), Arc::<[u8]>::from(blob.into_boxed_slice()));

                    let version = url_version.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
                    Some(ThumbnailReadyItem {
                        key,
                        url_version: version,
                        width,
                        height,
                    })
                }
            })
            .buffer_unordered(concurrency)
            .filter_map(|item| async move { item })
            .collect()
            .await
    }

    pub fn lookup_thumbnail(&self, key: &str) -> Option<Arc<[u8]>> {
        self.memory_cache.read().get(key).cloned()
    }

    /// 获取协议 URL
    pub fn get_protocol_url(&self, key: &str, version: u32) -> String {
        format!(
            "neoview://localhost/thumb?key={}&v={}",
            urlencoding::encode(key),
            version
        )
    }

    /// 队列长度
    pub async fn queue_len(&self) -> usize {
        self.queue.read().await.len()
    }
}

fn generation_concurrency(lane: ThumbnailLane) -> usize {
    match lane {
        ThumbnailLane::Visible | ThumbnailLane::ReaderVisible => 8,
        ThumbnailLane::Prefetch => 3,
        ThumbnailLane::Background => 1,
    }
}

fn generate_thumbnail_blob(
    generator: &ThumbnailGenerator,
    db: &ThumbnailDb,
    source: &ThumbnailSource,
) -> Option<Vec<u8>> {
    match source {
        ThumbnailSource::File { path, .. } => generate_path_thumbnail(generator, db, path),
        ThumbnailSource::ArchiveEntry {
            archive_path,
            inner_path,
            entry_index,
            file_size,
        } => {
            generator
                .generate_archive_entry_thumbnail(archive_path, inner_path, *entry_index, *file_size)
                .ok()
        }
        ThumbnailSource::DirectoryCover { representative, .. } => {
            generate_path_thumbnail(generator, db, representative)
        }
        ThumbnailSource::BookPage { book_path, page_path, .. } => {
            if std::path::Path::new(page_path).is_file() {
                generate_path_thumbnail(generator, db, page_path)
            } else {
                generator.generate_archive_thumbnail(book_path).ok()
            }
        }
    }
}

fn generate_path_thumbnail(generator: &ThumbnailGenerator, db: &ThumbnailDb, path: &str) -> Option<Vec<u8>> {
    let path_ref = std::path::Path::new(path);
    if path_ref.is_dir() {
        return generate_folder_cover_thumbnail(generator, db, path_ref);
    }

    if is_archive_file(path_ref) {
        generator.generate_archive_thumbnail(path).ok()
    } else {
        generator.generate_file_thumbnail(path).ok()
    }
}

fn generate_folder_cover_thumbnail(
    generator: &ThumbnailGenerator,
    db: &ThumbnailDb,
    dir: &std::path::Path,
) -> Option<Vec<u8>> {
    const MAX_FOLDER_DEPTH: u32 = 12;
    const MAX_ENTRIES_PER_DIR: usize = 512;
    const MAX_CANDIDATES: usize = 8;

    let folder_key = dir.to_string_lossy();
    if let Ok(Some(blob)) = db.load_thumbnail_by_key_and_category(folder_key.as_ref(), "folder") {
        return Some(blob);
    }

    if let Ok(Some((_, blob))) = db.find_earliest_thumbnail_in_path(folder_key.as_ref()) {
        let _ = db.save_thumbnail_with_category(folder_key.as_ref(), 0, 0, &blob, Some("folder"));
        return Some(blob);
    }

    let candidates = find_folder_cover_candidates(
        dir,
        MAX_FOLDER_DEPTH,
        MAX_ENTRIES_PER_DIR,
        MAX_CANDIDATES,
    );

    for candidate in candidates {
        let candidate_str = candidate.to_string_lossy();
        let blob = if is_archive_file(&candidate) {
            generator.generate_archive_thumbnail(&candidate_str).ok()
        } else {
            generator.generate_file_thumbnail(&candidate_str).ok()
        };

        if let Some(blob) = blob.filter(|b| !b.is_empty()) {
            let _ = db.save_thumbnail_with_category(folder_key.as_ref(), 0, 0, &blob, Some("folder"));
            return Some(blob);
        }
    }

    None
}

fn find_folder_cover_candidates(
    dir: &std::path::Path,
    max_depth: u32,
    max_entries_per_dir: usize,
    max_candidates: usize,
) -> Vec<std::path::PathBuf> {
    let mut candidates = Vec::new();
    find_folder_cover_candidates_impl(
        dir,
        max_depth,
        max_entries_per_dir,
        max_candidates,
        &mut candidates,
    );
    candidates
}

fn find_folder_cover_candidates_impl(
    dir: &std::path::Path,
    depth: u32,
    max_entries_per_dir: usize,
    max_candidates: usize,
    candidates: &mut Vec<std::path::PathBuf>,
) {
    if depth == 0 || candidates.len() >= max_candidates {
        return;
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    let mut paths: Vec<std::path::PathBuf> = entries
        .flatten()
        .take(max_entries_per_dir + 1)
        .map(|entry| entry.path())
        .collect();

    if paths.len() > max_entries_per_dir {
        return;
    }

    paths.sort_by(|a, b| natural_cover_rank(a).cmp(&natural_cover_rank(b)).then_with(|| a.cmp(b)));

    for path in &paths {
        if candidates.len() >= max_candidates {
            return;
        }
        if path.is_file() && (is_image_file(path) || is_archive_file(path) || is_video_file(path)) {
            candidates.push(path.clone());
        }
    }

    for path in paths {
        if candidates.len() >= max_candidates {
            return;
        }
        if path.is_dir() {
            find_folder_cover_candidates_impl(
                &path,
                depth - 1,
                max_entries_per_dir,
                max_candidates,
                candidates,
            );
        }
    }
}

fn natural_cover_rank(path: &std::path::Path) -> u8 {
    let name = path
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if path.is_file() {
        if matches!(name.as_str(), "cover" | "folder" | "thumb" | "thumbnail" | "front") {
            return 0;
        }
        if is_image_file(path) {
            return 1;
        }
        if is_archive_file(path) {
            return 2;
        }
        if is_video_file(path) {
            return 3;
        }
    }

    if path.is_dir() {
        return 4;
    }

    5
}

fn is_archive_file(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "zip" | "cbz" | "rar" | "cbr" | "7z" | "cb7"))
        .unwrap_or(false)
}

fn is_image_file(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "jpg" | "jpeg" | "png" | "gif" | "webp" | "avif" | "jxl" | "bmp"
            )
        })
        .unwrap_or(false)
}

fn is_video_file(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "mp4" | "mkv" | "avi" | "mov" | "webm" | "wmv" | "flv" | "m4v"
            )
        })
        .unwrap_or(false)
}

fn image_dimensions(data: &[u8]) -> (u32, u32) {
    image::load_from_memory(data)
        .map(|img| (img.width(), img.height()))
        .unwrap_or((0, 0))
}
