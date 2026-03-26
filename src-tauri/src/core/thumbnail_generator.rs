//! Thumbnail Generator Module
//! 缩略图生成器模块 - 支持多线程、压缩包流式处理、webp 格式

use crate::core::archive_manager;
use crate::core::image_decoder::{ImageDecoder, UnifiedDecoder};
use crate::core::thumbnail_db::ThumbnailDb;
use crate::core::video_exts;
use crate::utils::lnk_resolver;
use image::{DynamicImage, GenericImageView, ImageFormat};
use sevenz_rust;
use std::collections::HashMap;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::Arc;
use threadpool::ThreadPool;
use unrar;

/// 反向查找父文件夹的最大层级（可配置）
const MAX_PARENT_LEVELS: usize = 2;

/// 缩略图生成器配置
#[derive(Clone)]
pub struct ThumbnailGeneratorConfig {
    /// 缩略图最大宽度
    pub max_width: u32,
    /// 缩略图最大高度
    pub max_height: u32,
    /// 线程池大小
    pub thread_pool_size: usize,
    /// 压缩包并发数
    pub archive_concurrency: usize,
}

impl Default for ThumbnailGeneratorConfig {
    fn default() -> Self {
        // 根据 CPU 核心数动态调整线程池大小
        let num_cores = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);
        let thread_pool_size = (num_cores * 2).max(8).min(16); // 2倍核心数，最少8，最多16

        Self {
            max_width: 256,
            max_height: 256,
            thread_pool_size,
            archive_concurrency: (num_cores / 2).max(2).min(6), // 核心数的一半，最少2，最多6
        }
    }
}

/// 缩略图生成器
pub struct ThumbnailGenerator {
    db: Arc<ThumbnailDb>,
    config: ThumbnailGeneratorConfig,
    thread_pool: Arc<ThreadPool>,
}

impl ThumbnailGenerator {
    /// 根据任务规模和任务类型动态选择并发度。
    /// 目标：小批次低延迟，大批次高吞吐；压缩包任务避免过度并发导致磁盘抖动。
    fn compute_adaptive_worker_count(&self, task_count: usize, is_archive: bool) -> usize {
        let cores = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);
        let base = self.config.thread_pool_size.max(1);

        let by_task_size = if task_count <= 8 {
            (cores.max(2)).min(8)
        } else if task_count <= 32 {
            (cores * 2).clamp(4, 16)
        } else {
            (cores * 3).clamp(8, 24)
        };

        let archive_cap = if is_archive {
            // 压缩包读取通常受 IO 与解压开销约束，过高并发收益有限且抖动明显。
            (cores * 2).clamp(4, 12)
        } else {
            usize::MAX
        };

        by_task_size.min(base).min(archive_cap).max(1)
    }

    /// 创建新的缩略图生成器
    pub fn new(db: Arc<ThumbnailDb>, config: ThumbnailGeneratorConfig) -> Self {
        let thread_pool = Arc::new(ThreadPool::new(config.thread_pool_size));

        Self {
            db,
            config,
            thread_pool,
        }
    }

    /// 生成缩略图的哈希值（用于验证）
    pub(crate) fn generate_hash(path: &str, size: i64) -> i32 {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        path.hash(&mut hasher);
        size.hash(&mut hasher);
        hasher.finish() as i32
    }

    /// 生成文件路径的键（用于数据库）
    pub(crate) fn build_path_key(&self, path: &str, inner_path: Option<&str>) -> String {
        Self::build_path_key_static(path, inner_path)
    }

    /// 静态方法：构建路径键（用于父文件夹查找）
    fn build_path_key_static(path: &str, inner_path: Option<&str>) -> String {
        if let Some(inner) = inner_path {
            format!("{}::{}", path, inner)
        } else {
            path.to_string()
        }
    }

    /// 静态方法：解析 LNK 文件
    fn resolve_real_path(path: &Path) -> PathBuf {
        if path
            .extension()
            .map_or(false, |e| e.to_ascii_lowercase() == "lnk")
        {
            lnk_resolver::resolve_lnk(path).unwrap_or(path.to_path_buf())
        } else {
            path.to_path_buf()
        }
    }

    /// 使用 UnifiedDecoder 解码图像
    fn decode_image_unified(image_data: &[u8], ext: &str) -> Result<DynamicImage, String> {
        let decoder = UnifiedDecoder::with_format(ext);
        let decoded = decoder
            .decode(image_data)
            .map_err(|e| format!("解码失败: {e}"))?;
        decoded
            .to_dynamic_image()
            .map_err(|e| format!("转换失败: {e}"))
    }

    /// 降速机制：高性能设备无需人工降速
    fn apply_throttling(_data: &[u8], _ext: &str) {
        // 移除之前过于激进的基于文件大小和像素量的强制延迟。
        // 对于拥有上千张图片的高性能设备，这些延迟会显著拖慢批量生成速度。
        // 系统层级的负载均衡应由 V3 服务的调度器和车道配额管理。
    }

    /// 从图像生成 webp 缩略图
    fn generate_webp_thumbnail(&self, img: DynamicImage) -> Result<Vec<u8>, String> {
        let (width, height) = img.dimensions();

        // 计算缩放比例，保持宽高比
        let scale = (self.config.max_width as f32 / width as f32)
            .min(self.config.max_height as f32 / height as f32)
            .min(1.0);

        let new_width = (width as f32 * scale) as u32;
        let new_height = (height as f32 * scale) as u32;

        // 缩放图像（使用 thumbnail 方法保持宽高比）
        let thumbnail = img.thumbnail(new_width, new_height);

        // 编码为 webp
        let mut output = Vec::new();
        thumbnail
            .write_to(&mut Cursor::new(&mut output), ImageFormat::WebP)
            .map_err(|e| format!("编码 WebP 失败: {}", e))?;

        Ok(output)
    }

    /// 使用 UnifiedDecoder 内置缩放生成 WebP 缩略图（高性能版本）
    fn generate_webp_with_unified_decoder(
        image_data: &[u8],
        ext: &str,
        config: &ThumbnailGeneratorConfig,
    ) -> Result<Vec<u8>, String> {
        let decoder = UnifiedDecoder::with_format(ext);
        let decoded = decoder
            .decode_with_scale(image_data, config.max_width, config.max_height)
            .map_err(|e| format!("解码缩放失败: {e}"))?;
        let img = decoded
            .to_dynamic_image()
            .map_err(|e| format!("转换失败: {e}"))?;

        let mut output = Vec::new();
        img.write_to(&mut Cursor::new(&mut output), ImageFormat::WebP)
            .map_err(|e| format!("WebP 编码失败: {e}"))?;
        Ok(output)
    }

    /// 从图像数据生成 WebP 缩略图（统一接口）
    /// 使用 UnifiedDecoder 自动选择最优后端
    fn generate_webp_from_image_data(
        image_data: &[u8],
        ext: &str,
        config: &ThumbnailGeneratorConfig,
    ) -> Option<Vec<u8>> {
        // 启用降速机制
        Self::apply_throttling(image_data, ext);

        // 使用 UnifiedDecoder 统一处理所有格式
        Self::generate_webp_with_unified_decoder(image_data, ext, config)
            .ok()
            .or_else(|| {
                // 回退到传统方法
                Self::decode_image_safe(image_data)
                    .ok()
                    .and_then(|img| Self::generate_webp_thumbnail_fallback(&img, config).ok())
            })
    }

    /// 使用 archive_manager 从压缩包生成缩略图（统一版本）
    /// 优先使用图片条目，如果没有图片则使用视频条目（提取到临时文件后用 ffmpeg 截帧）
    fn generate_archive_thumbnail_unified(
        &self,
        archive_path: &str,
        path_key: &str,
        archive_size: i64,
        ghash: i32,
    ) -> Result<Vec<u8>, String> {
        let path = Path::new(archive_path);
        let mut handler = archive_manager::open_archive(path)?;

        // 获取第一个可视条目（优先图片，其次视频）
        if let Some((entry, data)) = handler.read_first_viewable()? {
            let ext = entry.extension().unwrap_or_default();
            let is_video = entry.is_video();

            let webp_data = if is_video {
                // 视频条目：提取到临时文件 → ffmpeg 生成缩略图
                self.generate_thumbnail_from_video_data(&data, &ext, path_key)?
            } else {
                // 图片条目：直接生成 webp 缩略图
                Self::generate_webp_from_image_data(&data, &ext, &self.config)
                    .ok_or_else(|| format!("生成缩略图失败: {}", entry.name))?
            };

            // 保存到数据库
            if let Err(e) = self
                .db
                .save_thumbnail(path_key, archive_size, ghash, &webp_data)
            {
                eprintln!("❌ 保存压缩包缩略图到数据库失败: {} - {}", path_key, e);
            } else {
                // 后台更新父文件夹缩略图
                let db_clone = Arc::clone(&self.db);
                let path_key_clone = path_key.to_string();
                let data_clone = webp_data.clone();
                std::thread::spawn(move || {
                    Self::update_parent_folders_thumbnail(
                        &db_clone,
                        &path_key_clone,
                        &data_clone,
                        MAX_PARENT_LEVELS,
                    );
                });
            }
            return Ok(webp_data);
        }

        Err("压缩包中没有找到图片或视频文件".to_string())
    }

    /// 从视频数据生成缩略图（提取到临时文件后用 ffmpeg 截帧）
    fn generate_thumbnail_from_video_data(
        &self,
        video_data: &[u8],
        ext: &str,
        path_key: &str,
    ) -> Result<Vec<u8>, String> {
        use std::fs;

        let temp_dir = std::env::temp_dir();
        let temp_video_path = temp_dir.join(format!(
            "neoview_archive_video_{}_{}.{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            if ext.is_empty() { "mp4" } else { ext }
        ));

        // 写入临时视频文件
        fs::write(&temp_video_path, video_data)
            .map_err(|e| format!("写入临时视频文件失败: {}", e))?;

        // 用 ffmpeg 生成缩略图
        let result = Self::generate_webp_with_ffmpeg(&temp_video_path, &self.config, path_key);

        // 清理临时文件
        let _ = fs::remove_file(&temp_video_path);

        result.ok_or_else(|| format!("从压缩包视频生成缩略图失败: {}", path_key))
    }

    /// 检查是否为视频文件
    fn is_video_file(path: &Path) -> bool {
        video_exts::is_video_path(path)
    }

    /// 生成视频缩略图（使用 ffmpeg 提取帧）
    fn generate_video_thumbnail(
        video_path: &Path,
        config: &ThumbnailGeneratorConfig,
        path_key: &str,
    ) -> Option<Vec<u8>> {
        // 视频缩略图使用相同的 ffmpeg 方法
        Self::generate_webp_with_ffmpeg(video_path, config, path_key)
    }

    /// 仅生成缩略图 blob，不保存到数据库（用于 V3 延迟保存）
    pub fn generate_file_thumbnail_blob_only(
        &self,
        file_path: &str,
    ) -> Result<(Vec<u8>, String, i64, i32), String> {
        // 获取文件大小
        let metadata =
            std::fs::metadata(file_path).map_err(|e| format!("获取文件元数据失败: {}", e))?;
        let file_size = metadata.len() as i64;

        // 构建路径键
        let path_key = self.build_path_key(file_path, None);
        let ghash = Self::generate_hash(&path_key, file_size);

        // 检查数据库缓存（如果有 webp 缓存，直接返回）
        if let Ok(Some(cached)) = self.db.load_thumbnail(&path_key, file_size, ghash) {
            // 更新访问时间
            let _ = self.db.update_access_time(&path_key);
            return Ok((cached, path_key, file_size, ghash));
        }

        let file_path_buf = PathBuf::from(file_path);
        let real_path = Self::resolve_real_path(&file_path_buf);

        // 检查是否为视频文件 (check on REAL path)
        if Self::is_video_file(&real_path) {
            // 视频文件：同步生成缩略图
            if let Some(webp_data) =
                Self::generate_video_thumbnail(&real_path, &self.config, &path_key)
            {
                return Ok((webp_data, path_key, file_size, ghash));
            }
            return Ok((Vec::new(), path_key, file_size, ghash));
        }

        // 从文件加载图像 (read from REAL path)
        let image_data = match std::fs::read(&real_path) {
            Ok(data) => data,
            Err(e) => {
                if e.kind() == std::io::ErrorKind::PermissionDenied {
                    return Err("权限被拒绝".to_string());
                } else {
                    return Err(format!("读取文件失败: {}", e));
                }
            }
        };

        // 检测文件扩展名 (from REAL path)
        let ext = real_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        // 同步生成 webp 缩略图
        let webp_data = Self::generate_webp_from_image_data(&image_data, &ext, &self.config);

        match webp_data {
            Some(data) => Ok((data, path_key, file_size, ghash)),
            None => Err(format!("无法生成缩略图: {}", file_path)),
        }
    }

    /// 生成单个文件的缩略图（同步生成 webp 后返回，避免传输原图）
    pub fn generate_file_thumbnail(&self, file_path: &str) -> Result<Vec<u8>, String> {
        // 获取文件大小
        let metadata =
            std::fs::metadata(file_path).map_err(|e| format!("获取文件元数据失败: {}", e))?;
        let file_size = metadata.len() as i64;

        // 构建路径键
        let path_key = self.build_path_key(file_path, None);
        let ghash = Self::generate_hash(&path_key, file_size);

        // 检查数据库缓存（如果有 webp 缓存，直接返回）
        if let Ok(Some(cached)) = self.db.load_thumbnail(&path_key, file_size, ghash) {
            // 更新访问时间
            let _ = self.db.update_access_time(&path_key);
            return Ok(cached);
        }

        let file_path_buf = PathBuf::from(file_path);
        let real_path = Self::resolve_real_path(&file_path_buf);

        // 检查是否为视频文件 (check on REAL path)
        if Self::is_video_file(&real_path) {
            // 视频文件：同步生成缩略图
            if let Some(webp_data) =
                Self::generate_video_thumbnail(&real_path, &self.config, &path_key)
            {
                // 保存到数据库
                if let Err(e) = self
                    .db
                    .save_thumbnail(&path_key, file_size, ghash, &webp_data)
                {
                    eprintln!("❌ 保存视频缩略图到数据库失败: {} - {}", path_key, e);
                } else {
                    // 后台更新父文件夹缩略图
                    let db_clone = Arc::clone(&self.db);
                    let path_key_clone = path_key.clone();
                    let webp_data_clone = webp_data.clone();
                    std::thread::spawn(move || {
                        Self::update_parent_folders_thumbnail(
                            &db_clone,
                            &path_key_clone,
                            &webp_data_clone,
                            MAX_PARENT_LEVELS,
                        );
                    });
                }
                return Ok(webp_data);
            }
            // 视频缩略图生成失败，返回空数据（前端会显示占位符）
            return Ok(Vec::new());
        }

        // 从文件加载图像（改进错误处理，记录权限错误但静默处理）
        let image_data = match std::fs::read(&real_path) {
            Ok(data) => data,
            Err(e) => {
                if e.kind() == std::io::ErrorKind::PermissionDenied {
                    eprintln!("⚠️ 权限错误 (静默处理): {}", file_path);
                    return Err("权限被拒绝".to_string());
                } else {
                    return Err(format!("读取文件失败: {}", e));
                }
            }
        };

        // 检测文件扩展名
        let ext = real_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        // 同步生成 webp 缩略图（使用统一接口）
        let webp_data = Self::generate_webp_from_image_data(&image_data, &ext, &self.config);

        match webp_data {
            Some(data) => {
                // 保存到数据库
                if let Err(e) = self.db.save_thumbnail(&path_key, file_size, ghash, &data) {
                    eprintln!("❌ 保存文件缩略图到数据库失败: {} - {}", path_key, e);
                } else {
                    // 后台更新父文件夹缩略图
                    let db_clone = Arc::clone(&self.db);
                    let path_key_clone = path_key.clone();
                    let data_clone = data.clone();
                    std::thread::spawn(move || {
                        Self::update_parent_folders_thumbnail(
                            &db_clone,
                            &path_key_clone,
                            &data_clone,
                            MAX_PARENT_LEVELS,
                        );
                    });
                }
                Ok(data)
            }
            None => Err(format!("无法生成缩略图: {}", file_path)),
        }
    }

    /// 使用 ffmpeg-sidecar 生成 webp 缩略图（优先方案，用于 AVIF 和视频）
    fn generate_webp_with_ffmpeg(
        input_path: &Path,
        config: &ThumbnailGeneratorConfig,
        path_key: &str,
    ) -> Option<Vec<u8>> {
        use ffmpeg_sidecar::command::FfmpegCommand;
        use std::fs;

        let temp_dir = std::env::temp_dir();
        let output_path = temp_dir.join(format!(
            "thumb_ffmpeg_output_{}_{}.webp",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));

        // 使用 ffmpeg-sidecar 构建命令
        let is_video = Self::is_video_file(input_path);
        let mut cmd = FfmpegCommand::new();

        cmd.input(input_path.to_string_lossy().as_ref());

        if is_video {
            // 视频：从第 1 秒提取一帧
            cmd.args(&["-ss", "1.0", "-vframes", "1"]);
        }

        // 添加视频滤镜和输出格式
        cmd.args(&[
            "-vf",
            &format!("scale={}:-1", config.max_width),
            "-f",
            "webp",
            "-quality",
            "85",
            "-y", // 覆盖输出文件
        ]);

        cmd.output(output_path.to_string_lossy().as_ref());

        // 执行命令
        match cmd.spawn() {
            Ok(mut child) => {
                // 等待命令完成
                let status = child.wait();
                match status {
                    Ok(exit_status) if exit_status.success() => match fs::read(&output_path) {
                        Ok(data) => {
                            let _ = fs::remove_file(&output_path);
                            if cfg!(debug_assertions) {
                                println!("✅ 使用 FFmpeg 成功处理: {}", path_key);
                            }
                            Some(data)
                        }
                        Err(e) => {
                            let _ = fs::remove_file(&output_path);
                            eprintln!("❌ 读取 FFmpeg 输出失败: {} - {}", path_key, e);
                            None
                        }
                    },
                    Ok(_) => {
                        let _ = fs::remove_file(&output_path);
                        eprintln!("⚠️ FFmpeg 转换失败: {}", path_key);
                        None
                    }
                    Err(e) => {
                        let _ = fs::remove_file(&output_path);
                        eprintln!("⚠️ FFmpeg 等待失败: {} - {}", path_key, e);
                        None
                    }
                }
            }
            Err(e) => {
                eprintln!("⚠️ FFmpeg 启动失败: {} - {}", path_key, e);
                None
            }
        }
    }

    /// 使用 vips 命令行工具生成 webp 缩略图（回退方案，仅用于 AVIF）
    fn generate_webp_with_vips(
        image_data: &[u8],
        config: &ThumbnailGeneratorConfig,
        path_key: &str,
    ) -> Option<Vec<u8>> {
        use std::fs;
        use std::process::Command;

        let temp_dir = std::env::temp_dir();
        let input_path = temp_dir.join(format!(
            "thumb_avif_input_{}_{}.avif",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let output_path = temp_dir.join(format!(
            "thumb_avif_output_{}_{}.webp",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));

        // 写入原始 AVIF 数据到临时文件
        if let Err(e) = fs::write(&input_path, image_data) {
            eprintln!("❌ 写入临时文件失败: {} - {}", path_key, e);
            return None;
        }

        // 使用 vips 命令行工具转换（修复参数：移除 --Q，使用正确的参数格式）
        // vips thumbnail 命令格式：vips thumbnail input output width [options]
        // 输出格式由文件扩展名决定，质量通过输出文件扩展名控制
        let vips_result = Command::new("vips")
            .arg("thumbnail")
            .arg(&input_path)
            .arg(&output_path)
            .arg(config.max_width.to_string())
            .arg("--size")
            .arg("down")
            .output();

        // 清理临时输入文件
        let _ = fs::remove_file(&input_path);

        match vips_result {
            Ok(output) if output.status.success() => match fs::read(&output_path) {
                Ok(data) => {
                    let _ = fs::remove_file(&output_path);
                    if cfg!(debug_assertions) {
                        println!("✅ 使用 vips 成功处理 AVIF: {}", path_key);
                    }
                    Some(data)
                }
                Err(e) => {
                    let _ = fs::remove_file(&output_path);
                    eprintln!("❌ 读取 vips 输出失败: {} - {}", path_key, e);
                    None
                }
            },
            Ok(output) => {
                let _ = fs::remove_file(&output_path);
                let stderr = String::from_utf8_lossy(&output.stderr);
                eprintln!("⚠️ vips 转换 AVIF 失败: {} - {}", path_key, stderr);
                None
            }
            Err(_) => {
                eprintln!("⚠️ vips 命令不存在，无法处理 AVIF: {}", path_key);
                None
            }
        }
    }

    /// 更新父文件夹的缩略图（反向查找策略）
    /// 检查父文件夹和祖父文件夹是否有缩略图记录，如果没有，将当前缩略图复制给它们
    fn update_parent_folders_thumbnail(
        db: &Arc<ThumbnailDb>,
        file_path: &str,
        thumbnail_data: &[u8],
        max_levels: usize,
    ) {
        // 获取文件路径的父目录
        let mut current_path = PathBuf::from(file_path);

        // 向上查找最多 max_levels 级父文件夹
        for level in 1..=max_levels {
            // 获取当前路径的父目录
            if let Some(parent) = current_path.parent() {
                let parent_path_str = parent.to_string_lossy().to_string();

                // 检查父文件夹是否有缩略图记录
                let parent_size = match std::fs::metadata(&parent_path_str) {
                    Ok(meta) => meta.len() as i64,
                    Err(_) => {
                        // 如果无法获取元数据，跳过此级别，继续查找上一级
                        current_path = parent.to_path_buf();
                        continue;
                    }
                };

                let parent_path_key = Self::build_path_key_static(&parent_path_str, None);
                let parent_ghash = Self::generate_hash(&parent_path_key, parent_size);

                // 检查数据库中是否已有记录
                match db.load_thumbnail(&parent_path_key, parent_size, parent_ghash) {
                    Ok(Some(_)) => {
                        // 已有记录，跳过（不继续向上查找，因为已经有缩略图了）
                        if cfg!(debug_assertions) {
                            println!(
                                "📁 父文件夹已有缩略图记录，跳过: {} (level {})",
                                parent_path_str, level
                            );
                        }
                        break; // 已有记录，停止向上查找
                    }
                    Ok(None) => {
                        // 没有记录，复制当前缩略图给父文件夹
                        if cfg!(debug_assertions) {
                            println!(
                                "📁 父文件夹没有缩略图记录，复制当前缩略图: {} (level {})",
                                parent_path_str, level
                            );
                        }

                        match db.save_thumbnail_with_category(
                            &parent_path_key,
                            parent_size,
                            parent_ghash,
                            thumbnail_data,
                            Some("folder"),
                        ) {
                            Ok(_) => {
                                if cfg!(debug_assertions) {
                                    println!(
                                        "✅ 已为父文件夹保存缩略图: {} (level {})",
                                        parent_path_str, level
                                    );
                                }
                            }
                            Err(e) => {
                                eprintln!(
                                    "❌ 为父文件夹保存缩略图失败: {} (level {}) - {}",
                                    parent_path_str, level, e
                                );
                            }
                        }

                        // 继续向上查找下一级
                        current_path = parent.to_path_buf();
                    }
                    Err(e) => {
                        eprintln!(
                            "❌ 检查父文件夹缩略图失败: {} (level {}) - {}",
                            parent_path_str, level, e
                        );
                        // 继续向上查找下一级
                        current_path = parent.to_path_buf();
                    }
                }
            } else {
                // 没有更多父目录，停止查找
                break;
            }
        }
    }

    /// 安全解码图像（捕获 panic，用于后台线程）
    fn decode_image_safe(image_data: &[u8]) -> Result<DynamicImage, String> {
        // 使用 catch_unwind 捕获可能的 panic（如 dav1d 崩溃）
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            image::load_from_memory(image_data)
        }))
        .map_err(|_| "图像解码时发生 panic（可能是格式问题）".to_string())?
        .map_err(|e| format!("从内存加载图像失败: {}", e))
    }

    /// 静态方法：使用 vips 命令行工具生成 webp 缩略图（避免 rust 库 panic）
    fn generate_webp_thumbnail_static(
        img: &DynamicImage,
        config: &ThumbnailGeneratorConfig,
    ) -> Result<Vec<u8>, String> {
        use std::fs;
        use std::process::Command;

        let (width, height) = img.dimensions();

        // 计算缩放比例，保持宽高比
        let scale = (config.max_width as f32 / width as f32)
            .min(config.max_height as f32 / height as f32)
            .min(1.0);

        let new_width = (width as f32 * scale) as u32;

        // 创建临时目录
        let temp_dir = std::env::temp_dir();
        let input_path = temp_dir.join(format!("thumb_input_{}.png", std::process::id()));
        let output_path = temp_dir.join(format!("thumb_output_{}.webp", std::process::id()));

        // 将图像保存为 PNG（临时文件）
        img.save(&input_path)
            .map_err(|e| format!("保存临时图像失败: {}", e))?;

        // 使用 vips 命令行工具转换（避免 rust 库 panic）
        // vips 会自动计算高度以保持宽高比
        let vips_result = Command::new("vips")
            .arg("thumbnail")
            .arg(&input_path)
            .arg(&output_path)
            .arg(new_width.to_string())
            .arg("--size")
            .arg("down") // 只缩小，不放大
            .arg("--format")
            .arg("webp")
            .arg("--Q")
            .arg("85") // WebP 质量
            .output();

        // 清理临时输入文件
        let _ = fs::remove_file(&input_path);

        match vips_result {
            Ok(output) if output.status.success() => {
                // 读取生成的 webp 文件
                match fs::read(&output_path) {
                    Ok(webp_data) => {
                        // 清理临时输出文件
                        let _ = fs::remove_file(&output_path);
                        Ok(webp_data)
                    }
                    Err(e) => {
                        let _ = fs::remove_file(&output_path);
                        Err(format!("读取 vips 输出失败: {}", e))
                    }
                }
            }
            Ok(output) => {
                let _ = fs::remove_file(&output_path);
                let stderr = String::from_utf8_lossy(&output.stderr);
                // vips 不可用时，降级到 image crate
                Self::generate_webp_thumbnail_fallback(img, config)
                    .map_err(|e| format!("vips 失败: {}, 降级失败: {}", stderr, e))
            }
            Err(_) => {
                // vips 命令不存在，降级到 image crate
                Self::generate_webp_thumbnail_fallback(img, config)
            }
        }
    }

    /// 降级方法：使用 image crate 生成 webp（当 vips 不可用时）
    fn generate_webp_thumbnail_fallback(
        img: &DynamicImage,
        config: &ThumbnailGeneratorConfig,
    ) -> Result<Vec<u8>, String> {
        let (width, height) = img.dimensions();

        // 计算缩放比例，保持宽高比
        let scale = (config.max_width as f32 / width as f32)
            .min(config.max_height as f32 / height as f32)
            .min(1.0);

        let new_width = (width as f32 * scale) as u32;
        let new_height = (height as f32 * scale) as u32;

        // 缩放图像（使用 thumbnail 方法保持宽高比）
        let thumbnail = img.thumbnail(new_width, new_height);

        // 编码为 webp
        let mut output = Vec::new();
        thumbnail
            .write_to(&mut Cursor::new(&mut output), ImageFormat::WebP)
            .map_err(|e| format!("编码 WebP 失败: {}", e))?;

        Ok(output)
    }

    /// 从压缩包生成缩略图（同步生成 webp 后返回，避免传输原图）
    /// 使用统一的 archive_manager 处理所有压缩格式
    pub fn generate_archive_thumbnail(&self, archive_path: &str) -> Result<Vec<u8>, String> {
        // 获取压缩包大小
        let metadata =
            std::fs::metadata(archive_path).map_err(|e| format!("获取压缩包元数据失败: {}", e))?;
        let archive_size = metadata.len() as i64;

        // 构建路径键
        let path_key = self.build_path_key(archive_path, None);
        let ghash = Self::generate_hash(&path_key, archive_size);

        // 检查数据库缓存
        if let Ok(Some(cached)) = self.db.load_thumbnail(&path_key, archive_size, ghash) {
            let _ = self.db.update_access_time(&path_key);
            return Ok(cached);
        }

        // 使用统一的 archive_manager 处理
        let real_path = Self::resolve_real_path(Path::new(archive_path));
        self.generate_archive_thumbnail_unified(
            real_path.to_str().unwrap_or(archive_path),
            &path_key,
            archive_size,
            ghash,
        )
    }

    /// 从 RAR 压缩包生成缩略图
    fn generate_rar_archive_thumbnail(
        &self,
        archive_path: &str,
        path_key: &str,
        archive_size: i64,
        ghash: i32,
    ) -> Result<Vec<u8>, String> {
        // 支持的图片扩展名
        let image_exts = [
            "jpg", "jpeg", "png", "gif", "bmp", "webp", "avif", "jxl", "tiff", "tif",
        ];

        // 打开 RAR 压缩包
        let mut archive = unrar::Archive::new(archive_path)
            .open_for_processing()
            .map_err(|e| format!("打开 RAR 压缩包失败: {:?}", e))?;

        let mut last_error: Option<String> = None;

        // 遍历条目，找到第一个图片文件
        while let Some(header) = archive
            .read_header()
            .map_err(|e| format!("读取 RAR 头失败: {:?}", e))?
        {
            let entry = header.entry();
            let name = entry.filename.to_string_lossy().to_string();

            // 跳过目录
            if entry.is_directory() {
                archive = header
                    .skip()
                    .map_err(|e| format!("跳过 RAR 条目失败: {:?}", e))?;
                continue;
            }

            // 检查是否为图片文件
            if let Some(ext) = Path::new(&name)
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
            {
                if image_exts.contains(&ext.as_str()) {
                    // 读取文件内容
                    let (image_data, next_archive) = header
                        .read()
                        .map_err(|e| format!("读取 RAR 条目失败: {:?}", e))?;

                    // 使用 UnifiedDecoder 统一处理所有格式
                    let webp_data =
                        Self::generate_webp_from_image_data(&image_data, &ext, &self.config);

                    if let Some(data) = webp_data {
                        // 保存到数据库
                        if let Err(e) = self.db.save_thumbnail(path_key, archive_size, ghash, &data)
                        {
                            eprintln!("❌ 保存 RAR 缩略图到数据库失败: {} - {}", path_key, e);
                        } else {
                            // 后台更新父文件夹缩略图
                            let db_clone = Arc::clone(&self.db);
                            let path_key_clone = path_key.to_string();
                            let data_clone = data.clone();
                            std::thread::spawn(move || {
                                Self::update_parent_folders_thumbnail(
                                    &db_clone,
                                    &path_key_clone,
                                    &data_clone,
                                    MAX_PARENT_LEVELS,
                                );
                            });
                        }
                        return Ok(data);
                    } else {
                        last_error = Some(format!("生成缩略图失败: {}", name));
                        archive = next_archive;
                        continue;
                    }
                }
            }

            // 跳过非图片文件
            archive = header
                .skip()
                .map_err(|e| format!("跳过 RAR 条目失败: {:?}", e))?;
        }

        if let Some(err) = last_error {
            Err(format!("RAR 压缩包缩略图生成失败: {}", err))
        } else {
            Err("RAR 压缩包中没有找到图片文件".to_string())
        }
    }

    /// 从 7z 压缩包生成缩略图
    fn generate_7z_archive_thumbnail(
        &self,
        archive_path: &str,
        path_key: &str,
        archive_size: i64,
        ghash: i32,
    ) -> Result<Vec<u8>, String> {
        // 支持的图片扩展名
        let image_exts = [
            "jpg", "jpeg", "png", "gif", "bmp", "webp", "avif", "jxl", "tiff", "tif",
        ];

        // 打开 7z 压缩包
        let mut archive = sevenz_rust::SevenZReader::open(archive_path, "".into())
            .map_err(|e| format!("打开 7z 压缩包失败: {}", e))?;

        let mut last_error: Option<String> = None;
        let mut found_image_data: Option<(String, Vec<u8>)> = None;

        // 首先找到第一个图片文件的名称
        let first_image_name = archive
            .archive()
            .files
            .iter()
            .filter(|entry| !entry.is_directory())
            .find_map(|entry| {
                let name = entry.name();
                if let Some(ext) = Path::new(name)
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.to_lowercase())
                {
                    if image_exts.contains(&ext.as_str()) {
                        return Some(name.to_string());
                    }
                }
                None
            });

        if let Some(target_name) = first_image_name {
            // 遍历并读取目标图片
            archive
                .for_each_entries(|entry, reader| {
                    if entry.name() == target_name {
                        let mut data = Vec::new();
                        if let Err(e) = reader.read_to_end(&mut data) {
                            last_error = Some(format!("读取 7z 条目失败: {}", e));
                        } else {
                            found_image_data = Some((target_name.clone(), data));
                        }
                        return Ok(false); // 停止遍历
                    }
                    Ok(true)
                })
                .map_err(|e| format!("遍历 7z 条目失败: {}", e))?;
        }

        if let Some((name, image_data)) = found_image_data {
            // 获取扩展名
            let ext = Path::new(&name)
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_default();

            // 使用 UnifiedDecoder 统一处理所有格式
            let webp_data = Self::generate_webp_from_image_data(&image_data, &ext, &self.config);

            if let Some(data) = webp_data {
                // 保存到数据库
                if let Err(e) = self.db.save_thumbnail(path_key, archive_size, ghash, &data) {
                    eprintln!("❌ 保存 7z 缩略图到数据库失败: {} - {}", path_key, e);
                } else {
                    // 后台更新父文件夹缩略图
                    let db_clone = Arc::clone(&self.db);
                    let path_key_clone = path_key.to_string();
                    let data_clone = data.clone();
                    std::thread::spawn(move || {
                        Self::update_parent_folders_thumbnail(
                            &db_clone,
                            &path_key_clone,
                            &data_clone,
                            MAX_PARENT_LEVELS,
                        );
                    });
                }
                return Ok(data);
            } else {
                last_error = Some(format!("生成缩略图失败: {}", name));
            }
        }

        if let Some(err) = last_error {
            Err(format!("7z 压缩包缩略图生成失败: {}", err))
        } else {
            Err("7z 压缩包中没有找到图片文件".to_string())
        }
    }

    /// 批量生成缩略图（多线程）
    pub fn batch_generate_thumbnails(
        &self,
        paths: Vec<String>,
        is_archive: bool,
    ) -> HashMap<String, Result<Vec<u8>, String>> {
        let (tx, rx) = mpsc::channel();
        let mut results = HashMap::new();
        let worker_count = self.compute_adaptive_worker_count(paths.len(), is_archive);
        let thread_pool = ThreadPool::new(worker_count);

        if cfg!(debug_assertions) {
            println!(
                "⚙️ 批量缩略图并发调优: tasks={} is_archive={} workers={}",
                paths.len(),
                is_archive,
                worker_count
            );
        }

        // 提交任务到线程池
        for path in paths {
            let tx = tx.clone();
            let generator = self.clone();

            thread_pool.execute(move || {
                let result = if is_archive {
                    generator.generate_archive_thumbnail(&path)
                } else {
                    generator.generate_file_thumbnail(&path)
                };

                let _ = tx.send((path, result));
            });
        }

        // 收集结果
        drop(tx);
        for (path, result) in rx.iter() {
            results.insert(path, result);
        }

        results
    }
}

impl Clone for ThumbnailGenerator {
    fn clone(&self) -> Self {
        Self {
            db: Arc::clone(&self.db),
            config: ThumbnailGeneratorConfig {
                max_width: self.config.max_width,
                max_height: self.config.max_height,
                thread_pool_size: self.config.thread_pool_size,
                archive_concurrency: self.config.archive_concurrency,
            },
            thread_pool: Arc::clone(&self.thread_pool),
        }
    }
}
