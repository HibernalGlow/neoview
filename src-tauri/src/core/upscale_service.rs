//! NeoView - Upscale Service V2
//! 超分服务 - 参考 ThumbnailServiceV3 架构设计
//!
//! 核心特点：
//! 1. 后端为主，前端只需发送请求 + 接收事件
//! 2. 使用 WIC 读取图片（支持 AVIF/JXL），输出 WebP 缓存文件
//! 3. 超分结果保存到本地，前端用 convertFileSrc 转 URL
//! 4. 条件检查完全在后端
//! 5. 超分图作为普通图进入 imagePool，复用缩放/视图功能

use crate::commands::pyo3_upscale_commands::PyO3UpscalerState;
use crate::core::pyo3_upscaler::{PyO3Upscaler, UpscaleModel};
use crate::core::upscale_settings::ConditionalUpscaleSettings;
use crate::core::wic_decoder::{decode_image_with_wic, decode_image_from_memory_with_wic, WicDecoder};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

// ============================================================================
// 日志宏
// ============================================================================

macro_rules! log_info {
    ($($arg:tt)*) => {
        println!("[UpscaleService INFO] {}", format!($($arg)*));
    };
}

macro_rules! log_debug {
    ($($arg:tt)*) => {
        if cfg!(debug_assertions) {
            println!("[UpscaleService DEBUG] {}", format!($($arg)*));
        }
    };
}

// ============================================================================
// 配置
// ============================================================================

/// 服务配置
#[derive(Debug, Clone)]
pub struct UpscaleServiceConfig {
    /// 工作线程数
    pub worker_threads: usize,
    /// 预超分范围（当前页前后各 N 页）
    pub preload_range: usize,
    /// 前方页权重（阅读方向优先）
    pub forward_priority_weight: f32,
    /// 默认超时（秒）
    pub default_timeout: f64,
}

impl Default for UpscaleServiceConfig {
    fn default() -> Self {
        Self {
            worker_threads: 2,
            preload_range: 5, // 前后各5页
            forward_priority_weight: 0.7, // 前方页优先
            default_timeout: 120.0,
        }
    }
}

// ============================================================================
// 事件 Payload
// ============================================================================

/// 超分任务状态
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum UpscaleStatus {
    /// 等待中
    Pending,
    /// 条件检查中
    Checking,
    /// 正在处理
    Processing,
    /// 已完成
    Completed,
    /// 已跳过（不满足条件）
    Skipped,
    /// 失败
    Failed,
    /// 已取消
    Cancelled,
}

/// 超分结果事件（只返回缓存路径，不返回 Blob）
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpscaleReadyPayload {
    /// 书籍路径
    pub book_path: String,
    /// 页面索引
    pub page_index: usize,
    /// 图片哈希
    pub image_hash: String,
    /// 状态
    pub status: UpscaleStatus,
    /// 缓存文件路径（前端用 convertFileSrc 转 URL）
    pub cache_path: Option<String>,
    /// 错误信息
    pub error: Option<String>,
    /// 原始图片尺寸
    pub original_size: Option<(u32, u32)>,
    /// 超分后尺寸
    pub upscaled_size: Option<(u32, u32)>,
    /// 是否来自预加载
    pub is_preload: bool,
}

/// 服务统计
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpscaleServiceStats {
    pub memory_cache_count: usize,
    pub memory_cache_bytes: usize,
    pub pending_tasks: usize,
    pub processing_tasks: usize,
    pub completed_count: usize,
    pub skipped_count: usize,
    pub failed_count: usize,
    pub is_enabled: bool,
}

// ============================================================================
// 任务定义
// ============================================================================

/// 任务优先级（数值越小优先级越高）
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum TaskPriority {
    /// 当前页面（最高优先级）
    Current = 0,
    /// 后方页（即将翻到的，高优先级）
    Forward = 1,
    /// 前方页（已翻过的，低优先级，通常不预加载）
    Backward = 2,
    /// 后台任务
    Background = 3,
}

/// 任务优先级分数（用于排序，越小越优先）
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct TaskScore {
    /// 基础优先级
    pub priority: TaskPriority,
    /// 距离当前页的偏移（绝对值）
    pub distance: usize,
}

/// 超分任务
#[derive(Clone)]
pub struct UpscaleTask {
    /// 书籍路径
    pub book_path: String,
    /// 页面索引
    pub page_index: usize,
    /// 图片路径（文件夹模式）或压缩包内路径
    pub image_path: String,
    /// 是否为压缩包内文件
    pub is_archive: bool,
    /// 压缩包路径（如果是压缩包内文件）
    pub archive_path: Option<String>,
    /// 图片哈希
    pub image_hash: String,
    /// 优先级分数（用于排序）
    pub score: TaskScore,
    /// 模型配置
    pub model: UpscaleModel,
    /// 是否允许缓存
    pub allow_cache: bool,
    /// 提交时间
    pub submitted_at: Instant,
}

impl UpscaleTask {
    /// 计算任务分数（基于当前页）
    pub fn calculate_score(page_index: usize, current_page: usize) -> TaskScore {
        if page_index == current_page {
            TaskScore {
                priority: TaskPriority::Current,
                distance: 0,
            }
        } else if page_index > current_page {
            // 后方页（即将翻到）
            TaskScore {
                priority: TaskPriority::Forward,
                distance: page_index - current_page,
            }
        } else {
            // 前方页（已翻过）
            TaskScore {
                priority: TaskPriority::Backward,
                distance: current_page - page_index,
            }
        }
    }
}

/// 缓存条目（只记录路径，不存储数据）
#[derive(Clone)]
pub struct CacheEntry {
    /// 缓存文件路径
    pub cache_path: String,
    /// 原始尺寸
    pub original_size: (u32, u32),
    /// 超分后尺寸
    pub upscaled_size: (u32, u32),
    /// 缓存时间
    pub cached_at: Instant,
}

// ============================================================================
// 服务实现
// ============================================================================

/// 超分服务（V2：文件缓存，不使用内存缓存）
pub struct UpscaleService {
    /// 配置
    config: UpscaleServiceConfig,

    /// PyO3 超分器状态
    py_state: Arc<PyO3UpscalerState>,

    /// 缓存目录
    cache_dir: PathBuf,

    /// 是否启用超分
    enabled: Arc<AtomicBool>,

    /// 是否正在运行
    running: Arc<AtomicBool>,

    /// 当前书籍路径
    current_book: Arc<RwLock<Option<String>>>,

    /// 当前页面索引
    current_page: Arc<AtomicUsize>,

    /// 缓存路径映射：(book_path, page_index) -> cache_path
    cache_map: Arc<RwLock<HashMap<(String, usize), CacheEntry>>>,

    /// 任务队列
    task_queue: Arc<Mutex<VecDeque<UpscaleTask>>>,

    /// 正在处理的任务集合：(book_path, page_index)
    processing_set: Arc<RwLock<HashSet<(String, usize)>>>,

    /// 已跳过的页面（不满足条件）
    skipped_pages: Arc<RwLock<HashSet<(String, usize)>>>,

    /// 失败的页面
    failed_pages: Arc<RwLock<HashSet<(String, usize)>>>,

    /// 统计计数
    completed_count: Arc<AtomicUsize>,
    skipped_count: Arc<AtomicUsize>,
    failed_count: Arc<AtomicUsize>,

    /// 工作线程句柄
    workers: Arc<Mutex<Vec<JoinHandle<()>>>>,

    /// 条件设置缓存
    condition_settings: Arc<RwLock<ConditionalUpscaleSettings>>,
    
    /// 条件列表（从前端同步）
    conditions_list: Arc<RwLock<Vec<crate::commands::upscale_service_commands::FrontendCondition>>>,

    /// App Handle
    app_handle: Option<AppHandle>,
}

impl UpscaleService {
    /// 创建新的超分服务
    pub fn new(py_state: Arc<PyO3UpscalerState>, config: UpscaleServiceConfig, cache_dir: PathBuf) -> Self {
        // 确保缓存目录存在
        if let Err(e) = fs::create_dir_all(&cache_dir) {
            log_info!("⚠️ 创建缓存目录失败: {}", e);
        }

        Self {
            config,
            py_state,
            cache_dir,
            enabled: Arc::new(AtomicBool::new(false)),
            running: Arc::new(AtomicBool::new(false)),
            current_book: Arc::new(RwLock::new(None)),
            current_page: Arc::new(AtomicUsize::new(0)),
            cache_map: Arc::new(RwLock::new(HashMap::new())),
            task_queue: Arc::new(Mutex::new(VecDeque::new())),
            processing_set: Arc::new(RwLock::new(HashSet::new())),
            skipped_pages: Arc::new(RwLock::new(HashSet::new())),
            failed_pages: Arc::new(RwLock::new(HashSet::new())),
            completed_count: Arc::new(AtomicUsize::new(0)),
            skipped_count: Arc::new(AtomicUsize::new(0)),
            failed_count: Arc::new(AtomicUsize::new(0)),
            workers: Arc::new(Mutex::new(Vec::new())),
            condition_settings: Arc::new(RwLock::new(ConditionalUpscaleSettings::default())),
            conditions_list: Arc::new(RwLock::new(Vec::new())),
            app_handle: None,
        }
    }

    /// 生成缓存键（与 file_proxy.rs 一致）
    fn cache_key(book_path: &str, image_path: &str) -> String {
        format!("{}:{}", book_path, image_path)
    }

    /// 生成缓存文件路径
    fn get_cache_path(&self, book_path: &str, image_path: &str, model: &UpscaleModel) -> PathBuf {
        let key = Self::cache_key(book_path, image_path);
        let hash = format!("{:x}", md5::compute(key.as_bytes()));
        let filename = format!("{}_sr[{}].webp", hash, model.model_name);
        self.cache_dir.join(filename)
    }

    /// 检查缓存是否存在且有效（使用 WIC 验证）
    fn check_cache(&self, book_path: &str, image_path: &str, model: &UpscaleModel) -> Option<PathBuf> {
        let path = self.get_cache_path(book_path, image_path, model);
        if !path.exists() {
            return None;
        }
        
        // 验证缓存文件是否有效
        match self.validate_cache_file(&path) {
            Ok(true) => {
                log_info!("✅ 缓存有效: {}", path.display());
                Some(path)
            }
            Ok(false) => {
                log_info!("⚠️ 缓存文件损坏，将删除: {}", path.display());
                let _ = std::fs::remove_file(&path);
                None
            }
            Err(e) => {
                log_info!("⚠️ 缓存验证失败: {} - {}", path.display(), e);
                None
            }
        }
    }
    
    /// 验证缓存文件是否有效（使用 WIC 解码测试）
    #[cfg(target_os = "windows")]
    fn validate_cache_file(&self, path: &PathBuf) -> Result<bool, String> {
        use crate::core::wic_decoder::decode_image_from_memory_with_wic;
        
        // 读取文件
        let data = std::fs::read(path)
            .map_err(|e| format!("读取缓存文件失败: {}", e))?;
        
        if data.is_empty() {
            return Ok(false);
        }
        
        // 尝试用 WIC 解码验证
        match decode_image_from_memory_with_wic(&data) {
            Ok(result) => {
                // 检查解码结果是否合理
                if result.width > 0 && result.height > 0 && !result.pixels.is_empty() {
                    log_debug!("📏 缓存验证成功: {}x{}", result.width, result.height);
                    Ok(true)
                } else {
                    Ok(false)
                }
            }
            Err(_) => Ok(false),
        }
    }
    
    /// 验证缓存文件是否有效（非 Windows 平台使用 image crate）
    #[cfg(not(target_os = "windows"))]
    fn validate_cache_file(&self, path: &PathBuf) -> Result<bool, String> {
        use image::ImageReader;
        
        match ImageReader::open(path) {
            Ok(reader) => {
                match reader.decode() {
                    Ok(img) => Ok(img.width() > 0 && img.height() > 0),
                    Err(_) => Ok(false),
                }
            }
            Err(_) => Ok(false),
        }
    }

    /// 启动服务
    pub fn start(&mut self, app: AppHandle) {
        if self.running.swap(true, Ordering::SeqCst) {
            return; // 已经在运行
        }

        self.app_handle = Some(app.clone());

        let mut workers = self.workers.lock().unwrap();

        for i in 0..self.config.worker_threads {
            let app = app.clone();
            let running = Arc::clone(&self.running);
            let enabled = Arc::clone(&self.enabled);
            let task_queue = Arc::clone(&self.task_queue);
            let current_book = Arc::clone(&self.current_book);
            let cache_map = Arc::clone(&self.cache_map);
            let cache_dir = self.cache_dir.clone();
            let processing_set = Arc::clone(&self.processing_set);
            let skipped_pages = Arc::clone(&self.skipped_pages);
            let failed_pages = Arc::clone(&self.failed_pages);
            let completed_count = Arc::clone(&self.completed_count);
            let skipped_count = Arc::clone(&self.skipped_count);
            let failed_count = Arc::clone(&self.failed_count);
            let py_state = Arc::clone(&self.py_state);
            let condition_settings = Arc::clone(&self.condition_settings);
            let conditions_list = Arc::clone(&self.conditions_list);
            let config = self.config.clone();

            let handle = thread::spawn(move || {
                log_debug!("🔧 Worker {} started", i);

                while running.load(Ordering::SeqCst) {
                    // 如果未启用超分，休眠
                    if !enabled.load(Ordering::SeqCst) {
                        thread::sleep(Duration::from_millis(100));
                        continue;
                    }

                    // 获取任务（按分数排序，分数越小优先级越高）
                    let task = {
                        let mut queue = match task_queue.lock() {
                            Ok(q) => q,
                            Err(_) => continue,
                        };

                        // 优先取分数最小的任务（当前页 > 后方近页 > 后方远页）
                        queue
                            .iter()
                            .enumerate()
                            .min_by_key(|(_, t)| &t.score)
                            .map(|(idx, _)| idx)
                            .and_then(|idx| queue.remove(idx))
                    };

                    if let Some(task) = task {
                        // 检查是否应该取消（书籍已切换）
                        let current = current_book
                            .read()
                            .ok()
                            .and_then(|g| g.clone())
                            .unwrap_or_default();
                        if !task.book_path.is_empty() && task.book_path != current {
                            log_debug!("⏭️ 跳过非当前书籍任务: {}", task.book_path);
                            continue;
                        }

                        // 标记为正在处理
                        {
                            if let Ok(mut set) = processing_set.write() {
                                set.insert((task.book_path.clone(), task.page_index));
                            }
                        }

                        // 处理任务（使用 WIC + 文件缓存 + 条件匹配）
                        let result = Self::process_task_v2(
                            &py_state,
                            &condition_settings,
                            &conditions_list,
                            &cache_dir,
                            &cache_map,
                            &task,
                            config.default_timeout,
                        );

                        // 移除处理中标记
                        {
                            if let Ok(mut set) = processing_set.write() {
                                set.remove(&(task.book_path.clone(), task.page_index));
                            }
                        }

                        // 发送事件
                        match result {
                            Ok(payload) => {
                                match payload.status {
                                    UpscaleStatus::Completed => {
                                        completed_count.fetch_add(1, Ordering::SeqCst);
                                    }
                                    UpscaleStatus::Skipped => {
                                        skipped_count.fetch_add(1, Ordering::SeqCst);
                                        if let Ok(mut set) = skipped_pages.write() {
                                            set.insert((task.book_path.clone(), task.page_index));
                                        }
                                    }
                                    UpscaleStatus::Failed => {
                                        failed_count.fetch_add(1, Ordering::SeqCst);
                                        if let Ok(mut set) = failed_pages.write() {
                                            set.insert((task.book_path.clone(), task.page_index));
                                        }
                                    }
                                    _ => {}
                                }

                                let _ = app.emit("upscale-ready", payload);
                            }
                            Err(e) => {
                                failed_count.fetch_add(1, Ordering::SeqCst);
                                if let Ok(mut set) = failed_pages.write() {
                                    set.insert((task.book_path.clone(), task.page_index));
                                }

                                let payload = UpscaleReadyPayload {
                                    book_path: task.book_path.clone(),
                                    page_index: task.page_index,
                                    image_hash: task.image_hash.clone(),
                                    status: UpscaleStatus::Failed,
                                    cache_path: None,
                                    error: Some(e),
                                    original_size: None,
                                    upscaled_size: None,
                                    is_preload: task.score.priority != TaskPriority::Current,
                                };
                                let _ = app.emit("upscale-ready", payload);
                            }
                        }
                    } else {
                        // 队列为空，短暂休眠
                        thread::sleep(Duration::from_millis(20));
                    }
                }

                log_debug!("🔧 Worker {} stopped", i);
            });

            workers.push(handle);
        }

        log_info!(
            "✅ UpscaleService started with {} workers",
            self.config.worker_threads
        );
    }

    /// 停止服务
    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);

        // 等待工作线程结束
        let mut workers = self.workers.lock().unwrap();
        for handle in workers.drain(..) {
            let _ = handle.join();
        }

        log_info!("🛑 UpscaleService stopped");
    }

    /// 启用/禁用超分
    pub fn set_enabled(&self, enabled: bool) {
        let was_enabled = self.enabled.swap(enabled, Ordering::SeqCst);

        if was_enabled && !enabled {
            // 从启用变为禁用：清空队列
            if let Ok(mut queue) = self.task_queue.lock() {
                let cleared = queue.len();
                queue.clear();
                log_info!("🚫 超分已禁用，清空 {} 个待处理任务", cleared);
            }

            // 清空处理中集合
            if let Ok(mut set) = self.processing_set.write() {
                set.clear();
            }
        } else if !was_enabled && enabled {
            log_info!("✅ 超分已启用");
        }
    }

    /// 检查是否启用
    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::SeqCst)
    }

    /// 更新条件设置
    pub fn update_condition_settings(&self, settings: ConditionalUpscaleSettings) {
        if let Ok(mut s) = self.condition_settings.write() {
            *s = settings;
        }
    }
    
    /// 同步条件配置（从前端接收完整的条件列表）
    pub fn sync_conditions(&self, enabled: bool, conditions: Vec<crate::commands::upscale_service_commands::FrontendCondition>) {
        log_info!("📋 收到条件配置同步请求: enabled={}, 条件数={}", enabled, conditions.len());
        
        // 打印每个条件的详细信息
        for (i, cond) in conditions.iter().enumerate() {
            log_info!(
                "  [{}] {} (优先级:{}, 启用:{}, 跳过:{}) 尺寸范围: {}x{} ~ {}x{} 模型: {} {}x",
                i,
                cond.name,
                cond.priority,
                cond.enabled,
                cond.skip,
                cond.min_width,
                cond.min_height,
                if cond.max_width > 0 { cond.max_width.to_string() } else { "∞".to_string() },
                if cond.max_height > 0 { cond.max_height.to_string() } else { "∞".to_string() },
                cond.model_name,
                cond.scale
            );
        }
        
        // 更新启用状态
        if let Ok(mut s) = self.condition_settings.write() {
            s.enabled = enabled;
        }
        
        // 存储条件列表（按优先级排序）
        let mut sorted_conditions = conditions;
        sorted_conditions.sort_by(|a, b| b.priority.cmp(&a.priority)); // 高优先级在前
        
        if let Ok(mut list) = self.conditions_list.write() {
            *list = sorted_conditions;
        }
        
        log_info!(
            "✅ 条件配置已同步: enabled={}, 条件数={}",
            enabled,
            if let Ok(list) = self.conditions_list.read() { list.len() } else { 0 }
        );
    }
    
    /// 根据图片尺寸匹配条件，返回模型配置
    pub fn match_condition(&self, width: u32, height: u32) -> Option<UpscaleModel> {
        let conditions_enabled = if let Ok(s) = self.condition_settings.read() {
            s.enabled
        } else {
            false
        };
        
        if !conditions_enabled {
            return None;
        }
        
        let conditions = if let Ok(list) = self.conditions_list.read() {
            list.clone()
        } else {
            return None;
        };
        
        // 遍历条件（已按优先级排序）
        for cond in conditions.iter() {
            if !cond.enabled {
                continue;
            }
            
            // 检查尺寸条件
            let match_width = cond.min_width == 0 || width >= cond.min_width;
            let match_height = cond.min_height == 0 || height >= cond.min_height;
            let match_max_width = cond.max_width == 0 || width <= cond.max_width;
            let match_max_height = cond.max_height == 0 || height <= cond.max_height;
            
            if match_width && match_height && match_max_width && match_max_height {
                if cond.skip {
                    log_debug!("⏭️ 条件 '{}' 匹配，跳过超分 ({}x{})", cond.name, width, height);
                    return None; // 返回 None 表示跳过
                }
                
                log_debug!(
                    "✅ 条件 '{}' 匹配 ({}x{}) -> 模型: {}, 缩放: {}x",
                    cond.name, width, height, cond.model_name, cond.scale
                );
                
                return Some(UpscaleModel {
                    model_id: 0, // 稍后通过 model_name 解析
                    model_name: cond.model_name.clone(),
                    scale: cond.scale,
                    tile_size: cond.tile_size,
                    noise_level: cond.noise_level,
                });
            }
        }
        
        log_debug!("⚠️ 无条件匹配 ({}x{}), 跳过超分", width, height);
        None // 无条件匹配时跳过
    }

    /// 设置当前书籍
    pub fn set_current_book(&self, book_path: Option<String>) {
        if let Ok(mut current) = self.current_book.write() {
            let old_book = current.clone();

            // 书籍切换时清理
            if old_book.as_ref() != book_path.as_ref() {
                // 清空队列中属于旧书籍的任务
                if let Ok(mut queue) = self.task_queue.lock() {
                    if let Some(ref old) = old_book {
                        let before = queue.len();
                        queue.retain(|t| t.book_path != *old);
                        let cleared = before - queue.len();
                        if cleared > 0 {
                            log_debug!("📂 书籍切换，清空 {} 个旧任务", cleared);
                        }
                    }
                }

                // 清空状态
                if let Ok(mut set) = self.skipped_pages.write() {
                    set.clear();
                }
                if let Ok(mut set) = self.failed_pages.write() {
                    set.clear();
                }
            }

            *current = book_path;
        }
    }

    /// 设置当前页面（触发预超分池更新）
    pub fn set_current_page(&self, page_index: usize) {
        let old_page = self.current_page.swap(page_index, Ordering::SeqCst);
        
        // 如果页面变化较大（跳页），重新规划队列
        if (page_index as i64 - old_page as i64).abs() > 1 {
            self.replan_queue_for_jump(old_page, page_index);
        }
    }
    
    /// 跳页时重新规划队列
    /// - 清除不在预超分范围内的待处理任务
    /// - 重新计算所有任务的优先级分数
    /// - 按新优先级排序（当前页 > 后方页 > 前方页）
    fn replan_queue_for_jump(&self, _old_page: usize, new_page: usize) {
        let range = self.config.preload_range;
        // 只保留后方页（即将翻到的）+ 当前页，前方页不保留
        let valid_end = new_page + range;
        
        if let Ok(mut queue) = self.task_queue.lock() {
            let before = queue.len();
            
            // 只保留当前页和后方页的任务（前方页任务取消）
            queue.retain(|task| {
                task.page_index >= new_page && task.page_index <= valid_end
            });
            
            let removed = before - queue.len();
            if removed > 0 {
                log_debug!("🔄 跳页清理: 移除 {} 个已翻过/超出范围的任务", removed);
            }
            
            // 重新计算分数并排序
            let mut tasks: Vec<_> = queue.drain(..).collect();
            for task in &mut tasks {
                task.score = UpscaleTask::calculate_score(task.page_index, new_page);
            }
            // 按分数排序（TaskScore 实现了 Ord）
            tasks.sort_by(|a, b| a.score.cmp(&b.score));
            queue.extend(tasks);
        }
    }

    /// 请求超分（核心方法）
    pub fn request_upscale(&self, task: UpscaleTask) -> Result<(), String> {
        if !self.enabled.load(Ordering::SeqCst) {
            return Err("超分未启用".to_string());
        }

        let key = (task.book_path.clone(), task.page_index);

        // 检查文件缓存是否存在
        if let Some(cache_path) = self.check_cache(&task.book_path, &task.image_path, &task.model) {
            log_debug!("📦 文件缓存命中 page {}", task.page_index);
            // 直接发送缓存路径
            if let Some(ref app) = self.app_handle {
                let payload = UpscaleReadyPayload {
                    book_path: task.book_path.clone(),
                    page_index: task.page_index,
                    image_hash: task.image_hash.clone(),
                    status: UpscaleStatus::Completed,
                    cache_path: Some(cache_path.to_string_lossy().to_string()),
                    error: None,
                    original_size: None, // 可以从缓存读取，但暂时省略
                    upscaled_size: None,
                    is_preload: task.score.priority != TaskPriority::Current,
                };
                let _ = app.emit("upscale-ready", payload);
            }
            return Ok(());
        }

        // 检查是否已跳过
        if let Ok(set) = self.skipped_pages.read() {
            if set.contains(&key) {
                log_debug!("⏭️ 已跳过 page {}", task.page_index);
                return Ok(());
            }
        }

        // 检查是否正在处理
        if let Ok(set) = self.processing_set.read() {
            if set.contains(&key) {
                log_debug!("⏳ 正在处理 page {}", task.page_index);
                return Ok(());
            }
        }

        // 检查是否已在队列中
        if let Ok(queue) = self.task_queue.lock() {
            if queue
                .iter()
                .any(|t| t.book_path == task.book_path && t.page_index == task.page_index)
            {
                log_debug!("📋 已在队列 page {}", task.page_index);
                return Ok(());
            }
        }

        // 加入队列
        if let Ok(mut queue) = self.task_queue.lock() {
            queue.push_back(task);
        }

        Ok(())
    }

    /// 请求预超分范围（只加载后方页 + 当前页，前方页不加载）
    /// 
    /// 设计原则：
    /// 1. 当前页优先级最高
    /// 2. 后方页（即将翻到的）次优先，按距离排序
    /// 3. 前方页（已翻过的）不预加载（已超分的缓存会保留）
    pub fn request_preload_range(
        &self,
        book_path: &str,
        center_index: usize,
        total_pages: usize,
        image_paths: &[(usize, String, String)], // (page_index, image_path, hash)
        model: &UpscaleModel,
    ) {
        if !self.enabled.load(Ordering::SeqCst) {
            return;
        }

        let range = self.config.preload_range;
        // 只加载当前页 + 后方页，不加载前方页
        let end = (center_index + range + 1).min(total_pages);

        // 收集需要加载的任务，按优先级排序
        let mut tasks_to_add: Vec<UpscaleTask> = Vec::new();

        for (page_index, image_path, hash) in image_paths.iter() {
            // 跳过前方页（已翻过的）
            if *page_index < center_index {
                continue;
            }
            // 跳过超出范围的
            if *page_index >= end {
                continue;
            }

            let score = UpscaleTask::calculate_score(*page_index, center_index);

            let task = UpscaleTask {
                book_path: book_path.to_string(),
                page_index: *page_index,
                image_path: image_path.clone(),
                is_archive: false, // TODO: 检测
                archive_path: None,
                image_hash: hash.clone(),
                score,
                model: model.clone(),
                allow_cache: true,
                submitted_at: Instant::now(),
            };

            tasks_to_add.push(task);
        }

        // 按分数排序（当前页 > 后方近页 > 后方远页）
        tasks_to_add.sort_by(|a, b| a.score.cmp(&b.score));

        // 依次添加到队列
        for task in tasks_to_add {
            let _ = self.request_upscale(task);
        }

        log_debug!(
            "📋 预超分请求: 当前页 {} + 后方 {} 页",
            center_index,
            range.min(total_pages.saturating_sub(center_index + 1))
        );
    }

    /// 取消指定页面的任务
    pub fn cancel_page(&self, book_path: &str, page_index: usize) {
        if let Ok(mut queue) = self.task_queue.lock() {
            queue.retain(|t| !(t.book_path == book_path && t.page_index == page_index));
        }
    }

    /// 取消指定书籍的所有任务
    pub fn cancel_book(&self, book_path: &str) {
        if let Ok(mut queue) = self.task_queue.lock() {
            let before = queue.len();
            queue.retain(|t| t.book_path != book_path);
            log_debug!("🚫 取消书籍任务: {} 个", before - queue.len());
        }
    }

    /// 清除缓存
    pub fn clear_cache(&self, book_path: Option<&str>) {
        if let Ok(mut cache) = self.cache_map.write() {
            if let Some(path) = book_path {
                // 清除指定书籍的缓存映射
                let keys_to_remove: Vec<_> = cache
                    .keys()
                    .filter(|(bp, _)| bp == path)
                    .cloned()
                    .collect();
                for key in keys_to_remove {
                    cache.remove(&key);
                }
                log_info!("🧹 清除书籍缓存: {}", path);
            } else {
                cache.clear();
                log_info!("🧹 清除所有缓存映射");
            }
        }
        // 注意：这里不删除实际的缓存文件，只清除映射
        // 如果需要删除文件，可以遍历 cache_dir
    }

    /// 获取统计信息
    pub fn get_stats(&self) -> UpscaleServiceStats {
        let cache_count = self
            .cache_map
            .read()
            .ok()
            .map(|c| c.len())
            .unwrap_or(0);

        let pending_tasks = self
            .task_queue
            .lock()
            .ok()
            .map(|q| q.len())
            .unwrap_or(0);

        let processing_tasks = self
            .processing_set
            .read()
            .ok()
            .map(|s| s.len())
            .unwrap_or(0);

        UpscaleServiceStats {
            memory_cache_count: cache_count,
            memory_cache_bytes: 0, // 不再使用内存缓存
            pending_tasks,
            processing_tasks,
            completed_count: self.completed_count.load(Ordering::SeqCst),
            skipped_count: self.skipped_count.load(Ordering::SeqCst),
            failed_count: self.failed_count.load(Ordering::SeqCst),
            is_enabled: self.enabled.load(Ordering::SeqCst),
        }
    }

    /// 获取页面状态
    pub fn get_page_status(&self, book_path: &str, page_index: usize) -> UpscaleStatus {
        let key = (book_path.to_string(), page_index);

        // 检查缓存映射
        if let Ok(cache) = self.cache_map.read() {
            if cache.contains_key(&key) {
                return UpscaleStatus::Completed;
            }
        }

        // 检查跳过
        if let Ok(set) = self.skipped_pages.read() {
            if set.contains(&key) {
                return UpscaleStatus::Skipped;
            }
        }

        // 检查失败
        if let Ok(set) = self.failed_pages.read() {
            if set.contains(&key) {
                return UpscaleStatus::Failed;
            }
        }

        // 检查正在处理
        if let Ok(set) = self.processing_set.read() {
            if set.contains(&key) {
                return UpscaleStatus::Processing;
            }
        }

        // 检查队列
        if let Ok(queue) = self.task_queue.lock() {
            if queue.iter().any(|t| t.book_path == book_path && t.page_index == page_index) {
                return UpscaleStatus::Pending;
            }
        }

        UpscaleStatus::Pending
    }

    // ========================================================================
    // 静态方法（工作线程使用）- V2：使用 WIC + 文件缓存
    // ========================================================================

    /// 读取图片数据（支持普通文件和压缩包内文件）
    fn load_image_data(image_path: &str) -> Result<Vec<u8>, String> {
        // 检查是否是压缩包内路径（格式: xxx.zip inner=xxx）
        if let Some(inner_idx) = image_path.find(" inner=") {
            let archive_path = &image_path[..inner_idx];
            let inner_path = &image_path[inner_idx + 7..];
            
            log_debug!("📦 从压缩包读取: {} -> {}", archive_path, inner_path);
            
            // 使用 zip crate 读取
            let file = fs::File::open(archive_path)
                .map_err(|e| format!("打开压缩包失败: {}", e))?;
            let mut archive = zip::ZipArchive::new(file)
                .map_err(|e| format!("解析压缩包失败: {}", e))?;
            
            let mut entry = archive.by_name(inner_path)
                .map_err(|e| format!("在压缩包中找不到文件 {}: {}", inner_path, e))?;
            
            let mut data = Vec::new();
            std::io::Read::read_to_end(&mut entry, &mut data)
                .map_err(|e| format!("读取压缩包内文件失败: {}", e))?;
            
            Ok(data)
        } else {
            // 普通文件
            fs::read(image_path)
                .map_err(|e| format!("读取文件失败: {}", e))
        }
    }

    /// 处理单个任务（V2：WIC 处理 + 文件缓存 + 条件匹配）
    fn process_task_v2(
        py_state: &Arc<PyO3UpscalerState>,
        condition_settings: &Arc<RwLock<ConditionalUpscaleSettings>>,
        conditions_list: &Arc<RwLock<Vec<crate::commands::upscale_service_commands::FrontendCondition>>>,
        cache_dir: &Path,
        cache_map: &Arc<RwLock<HashMap<(String, usize), CacheEntry>>>,
        task: &UpscaleTask,
        timeout: f64,
    ) -> Result<UpscaleReadyPayload, String> {
        log_debug!(
            "🔄 处理超分任务 (V2): {} page {} path={}",
            task.book_path,
            task.page_index,
            task.image_path
        );

        // 1. 读取图片数据（支持普通文件和压缩包内文件）
        let raw_image_data = Self::load_image_data(&task.image_path)?;
        log_debug!("📥 读取图片数据: {} bytes", raw_image_data.len());

        // 2. 使用 WIC 解码（从内存）
        let decode_result = decode_image_from_memory_with_wic(&raw_image_data)
            .map_err(|e| format!("WIC 解码失败: {}", e))?;
        
        let width = decode_result.width;
        let height = decode_result.height;
        log_debug!("📐 WIC 解码完成: {}x{}", width, height);

        // 2. 条件匹配决定模型
        // 如果任务模型为空（model_name 为空），则使用条件匹配
        let matched_model = if task.model.model_name.is_empty() {
            // 从条件列表中匹配
            let conditions_enabled = if let Ok(s) = condition_settings.read() {
                s.enabled
            } else {
                true // 默认启用条件超分
            };
            
            if conditions_enabled {
                if let Ok(list) = conditions_list.read() {
                    let mut result_model: Option<UpscaleModel> = None;
                    
                    // 遍历条件（已按优先级排序）
                    for cond in list.iter() {
                        if !cond.enabled {
                            continue;
                        }
                        
                        // 检查尺寸条件
                        let match_width = cond.min_width == 0 || width >= cond.min_width;
                        let match_height = cond.min_height == 0 || height >= cond.min_height;
                        let match_max_width = cond.max_width == 0 || width <= cond.max_width;
                        let match_max_height = cond.max_height == 0 || height <= cond.max_height;
                        
                        if match_width && match_height && match_max_width && match_max_height {
                            if cond.skip {
                                log_debug!("⏭️ 条件 '{}' 匹配，跳过超分 ({}x{})", cond.name, width, height);
                                return Ok(UpscaleReadyPayload {
                                    book_path: task.book_path.clone(),
                                    page_index: task.page_index,
                                    image_hash: task.image_hash.clone(),
                                    status: UpscaleStatus::Skipped,
                                    cache_path: None,
                                    error: Some(format!("条件 '{}' 要求跳过", cond.name)),
                                    original_size: Some((width, height)),
                                    upscaled_size: None,
                                    is_preload: task.score.priority != TaskPriority::Current,
                                });
                            }
                            
                            log_debug!(
                                "✅ 条件 '{}' 匹配 ({}x{}) -> 模型: {}, 缩放: {}x",
                                cond.name, width, height, cond.model_name, cond.scale
                            );
                            
                            result_model = Some(UpscaleModel {
                                model_id: 0, // 稍后从 model_name 解析
                                model_name: cond.model_name.clone(),
                                scale: cond.scale,
                                tile_size: cond.tile_size,
                                noise_level: cond.noise_level,
                            });
                            break;
                        }
                    }
                    
                    result_model
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            // 使用任务指定的模型
            Some(task.model.clone())
        };
        
        // 如果没有匹配到模型，跳过超分
        let final_model = match matched_model {
            Some(m) => m,
            None => {
                log_debug!("⚠️ 无条件匹配 ({}x{}), 跳过超分", width, height);
                return Ok(UpscaleReadyPayload {
                    book_path: task.book_path.clone(),
                    page_index: task.page_index,
                    image_hash: task.image_hash.clone(),
                    status: UpscaleStatus::Skipped,
                    cache_path: None,
                    error: Some(format!("无条件匹配 ({}x{})", width, height)),
                    original_size: Some((width, height)),
                    upscaled_size: None,
                    is_preload: task.score.priority != TaskPriority::Current,
                });
            }
        };

        // 3. 执行超分
        let manager = {
            let guard = py_state
                .manager
                .lock()
                .map_err(|e| format!("获取锁失败: {}", e))?;
            guard
                .clone()
                .ok_or_else(|| "PyO3 超分器未初始化".to_string())?
        };

        // 预处理：对于 AVIF/JXL 格式，使用 WIC 解码后转码为 JPEG
        let ext = Path::new(&task.image_path)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        let needs_transcode = matches!(ext.as_str(), "avif" | "jxl" | "heic" | "heif");
        
        let image_data = if needs_transcode {
            log_debug!("🔄 检测到 AVIF/JXL 格式，使用 WIC 转码");
            // 直接使用已解码的 WIC 结果进行 JPEG 编码
            let rgb_pixels: Vec<u8> = decode_result.pixels
                .chunks_exact(4)
                .flat_map(|c| [c[2], c[1], c[0]]) // BGRA -> RGB
                .collect();
            
            let mut output = Vec::new();
            {
                use image::codecs::jpeg::JpegEncoder;
                use image::ImageEncoder;
                let encoder = JpegEncoder::new_with_quality(&mut output, 85);
                encoder
                    .write_image(&rgb_pixels, width, height, image::ExtendedColorType::Rgb8)
                    .map_err(|e| format!("JPEG 编码失败: {}", e))?;
            }
            log_debug!("✅ WIC 转码完成: {} bytes -> {} bytes", raw_image_data.len(), output.len());
            output
        } else {
            raw_image_data
        };

        // 解析模型 ID（如果是 0，则从模型名称解析）
        let model = if final_model.model_id == 0 && !final_model.model_name.is_empty() {
            let model_id = manager.get_model_id(&final_model.model_name)
                .unwrap_or_else(|e| {
                    log_debug!("⚠️ 解析模型 ID 失败 ({}), 使用默认值 8", e);
                    8 // 默认 MODEL_WAIFU2X_CUNET_UP2X
                });
            log_debug!("📋 模型 ID 解析: {} -> {}", final_model.model_name, model_id);
            UpscaleModel {
                model_id,
                ..final_model.clone()
            }
        } else {
            final_model.clone()
        };

        let result_bytes = manager.upscale_image_memory(
            &image_data,
            &model,
            timeout,
            width as i32,
            height as i32,
            None,
        )?;

        // 4. 计算超分后尺寸
        let scale = final_model.scale as u32;
        let upscaled_width = width * scale;
        let upscaled_height = height * scale;

        // 5. 保存到本地缓存文件（使用与 check_cache 相同的路径生成）
        let cache_key = Self::cache_key(&task.book_path, &task.image_path);
        let hash = format!("{:x}", md5::compute(cache_key.as_bytes()));
        let filename = format!("{}_sr[{}].webp", hash, final_model.model_name);
        let cache_path = cache_dir.join(&filename);
        log_debug!("💾 缓存路径: {} (key: {})", cache_path.display(), cache_key);
        
        // 确保缓存目录存在
        if let Some(parent) = cache_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        // 写入缓存文件（PyO3 返回的已经是 WebP 格式）
        fs::write(&cache_path, &result_bytes)
            .map_err(|e| format!("写入缓存文件失败: {}", e))?;

        let cache_path_str = cache_path.to_string_lossy().to_string();

        // 6. 更新缓存映射
        if let Ok(mut map) = cache_map.write() {
            let entry = CacheEntry {
                cache_path: cache_path_str.clone(),
                original_size: (width, height),
                upscaled_size: (upscaled_width, upscaled_height),
                cached_at: Instant::now(),
            };
            map.insert((task.book_path.clone(), task.page_index), entry);
        }

        log_info!(
            "✅ 超分完成 page {} ({}x{} -> {}x{}) -> {}",
            task.page_index,
            width,
            height,
            upscaled_width,
            upscaled_height,
            cache_path_str
        );

        Ok(UpscaleReadyPayload {
            book_path: task.book_path.clone(),
            page_index: task.page_index,
            image_hash: task.image_hash.clone(),
            status: UpscaleStatus::Completed,
            cache_path: Some(cache_path_str),
            error: None,
            original_size: Some((width, height)),
            upscaled_size: Some((upscaled_width, upscaled_height)),
            is_preload: task.score.priority != TaskPriority::Current,
        })
    }
}

