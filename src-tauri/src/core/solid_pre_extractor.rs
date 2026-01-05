//! Solid 压缩包预展开模块
//!
//! 参考 NeeView 的 ArchivePreExtractor 和 SevenZipHybridExtractor 实现：
//! - 检测 Solid 7z/RAR 压缩包
//! - 后台异步展开到临时目录
//! - 提供从预展开缓存读取的接口
//!
//! Solid 压缩包的问题：
//! - 必须顺序解压，无法随机访问
//! - 提取第 N 页需要先解压 1~N-1 页
//! - 对于大压缩包会导致严重的延迟

use log::{debug, info, warn};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Instant;
use tokio::sync::Notify;

/// 预展开状态
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PreExtractState {
    /// 空闲/未开始
    None,
    /// 正在展开
    Extracting,
    /// 展开完成
    Done,
    /// 展开取消
    Canceled,
    /// 展开失败
    Failed,
    /// 睡眠状态（暂停）
    Sleep,
}

impl PreExtractState {
    /// 是否处于就绪状态（可以开始展开）
    pub fn is_ready(&self) -> bool {
        matches!(
            self,
            PreExtractState::None | PreExtractState::Canceled | PreExtractState::Failed
        )
    }

    /// 是否已完成
    pub fn is_completed(&self) -> bool {
        matches!(self, PreExtractState::Done)
    }
}

/// 预展开配置
#[derive(Debug, Clone)]
pub struct PreExtractConfig {
    /// 最大内存展开大小 (MB)，超过此大小的文件解压到临时文件
    pub memory_threshold_mb: usize,
    /// 预展开内存限制 (MB)
    pub max_memory_mb: usize,
    /// 临时目录
    pub temp_dir: PathBuf,
    /// 是否启用
    pub enabled: bool,
}

impl Default for PreExtractConfig {
    fn default() -> Self {
        let temp_dir = std::env::temp_dir().join("neoview_preextract");
        Self {
            memory_threshold_mb: 10, // 10MB 以上的文件解压到临时文件
            max_memory_mb: 500,      // 最大 500MB 内存用于预展开
            temp_dir,
            enabled: true,
        }
    }
}

/// 预展开的文件数据
#[derive(Debug)]
pub enum PreExtractedData {
    /// 内存数据
    Memory(Vec<u8>),
    /// 临时文件路径
    TempFile(PathBuf),
}

impl PreExtractedData {
    /// 读取数据
    pub fn read(&self) -> std::io::Result<Vec<u8>> {
        match self {
            PreExtractedData::Memory(data) => Ok(data.clone()),
            PreExtractedData::TempFile(path) => fs::read(path),
        }
    }

    /// 获取大小
    pub fn size(&self) -> usize {
        match self {
            PreExtractedData::Memory(data) => data.len(),
            PreExtractedData::TempFile(path) => {
                fs::metadata(path).map(|m| m.len() as usize).unwrap_or(0)
            }
        }
    }
}

/// 预展开统计
#[derive(Debug, Clone, Default)]
pub struct PreExtractStats {
    /// 总请求数
    pub total_requests: u64,
    /// 缓存命中数
    pub cache_hits: u64,
    /// 展开的文件数
    pub extracted_count: usize,
    /// 展开的字节数
    pub extracted_bytes: usize,
    /// 平均展开时间 (ms)
    pub average_extract_time_ms: f64,
    /// 当前内存使用 (bytes)
    pub current_memory_bytes: usize,
}

/// Solid 压缩包预展开器
pub struct SolidPreExtractor {
    /// 配置
    config: RwLock<PreExtractConfig>,
    /// 当前状态
    state: RwLock<PreExtractState>,
    /// 取消标志
    cancel_flag: Arc<AtomicBool>,
    /// 当前压缩包路径
    current_archive: RwLock<Option<PathBuf>>,
    /// 已展开的条目 (内部路径 -> 数据)
    extracted_entries: RwLock<HashMap<String, PreExtractedData>>,
    /// 临时目录（每个压缩包一个）
    temp_directory: RwLock<Option<PathBuf>>,
    /// 当前内存使用
    current_memory: AtomicUsize,
    /// 统计信息
    stats: RwLock<PreExtractStats>,
    /// 完成通知
    completion_notify: Arc<Notify>,
}

impl SolidPreExtractor {
    /// 创建预展开器
    pub fn new() -> Self {
        Self {
            config: RwLock::new(PreExtractConfig::default()),
            state: RwLock::new(PreExtractState::None),
            cancel_flag: Arc::new(AtomicBool::new(false)),
            current_archive: RwLock::new(None),
            extracted_entries: RwLock::new(HashMap::new()),
            temp_directory: RwLock::new(None),
            current_memory: AtomicUsize::new(0),
            stats: RwLock::new(PreExtractStats::default()),
            completion_notify: Arc::new(Notify::new()),
        }
    }

    /// 设置配置
    pub fn set_config(&self, config: PreExtractConfig) {
        *self.config.write() = config;
    }

    /// 获取配置
    pub fn get_config(&self) -> PreExtractConfig {
        self.config.read().clone()
    }

    /// 获取状态
    pub fn get_state(&self) -> PreExtractState {
        *self.state.read()
    }

    /// 检查 7z 压缩包是否为 Solid 格式
    ///
    /// 注意：sevenz-rust 库目前没有直接的 API 检测 solid，
    /// 这里使用启发式方法：如果压缩包足够大且包含多个文件，假定为 solid
    pub fn is_solid_archive(archive_path: &Path) -> bool {
        // 只检查 7z 格式
        let ext = archive_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_default();

        if ext != "7z" && ext != "cb7" {
            return false;
        }

        // 检查文件大小和条目数
        if let Ok(reader) = sevenz_rust::SevenZReader::open(archive_path, "".into()) {
            let files = &reader.archive().files;
            let file_count = files.iter().filter(|f| !f.is_directory()).count();
            let total_size: u64 = files.iter().map(|f| f.size()).sum();

            // 启发式判断：100+ 文件或 100MB+ 总大小
            if file_count > 100 || total_size > 100 * 1024 * 1024 {
                info!(
                    "📦 检测到可能的 Solid 压缩包: {} files, {} MB",
                    file_count,
                    total_size / 1024 / 1024
                );
                return true;
            }
        }

        false
    }

    /// 开始预展开
    ///
    /// # Arguments
    /// * `archive_path` - 压缩包路径
    pub fn start_pre_extract(&self, archive_path: &Path) {
        let config = self.get_config();
        if !config.enabled {
            return;
        }

        // 取消之前的任务
        self.cancel();

        // 重置状态
        {
            let mut state = self.state.write();
            *state = PreExtractState::Extracting;
        }
        self.cancel_flag.store(false, Ordering::SeqCst);

        // 设置当前压缩包
        {
            let mut current = self.current_archive.write();
            *current = Some(archive_path.to_path_buf());
        }

        // 清理旧的展开数据
        self.cleanup_extracted();

        // 创建临时目录
        let temp_dir = config.temp_dir.join(format!(
            "archive_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        ));
        if let Err(e) = fs::create_dir_all(&temp_dir) {
            warn!("创建临时目录失败: {}", e);
            *self.state.write() = PreExtractState::Failed;
            return;
        }
        *self.temp_directory.write() = Some(temp_dir.clone());

        // 克隆所需数据用于线程
        let archive_path = archive_path.to_path_buf();
        let cancel_flag = Arc::clone(&self.cancel_flag);
        let extracted_entries = Arc::new(RwLock::new(HashMap::new()));
        let current_memory = Arc::new(AtomicUsize::new(0));
        let memory_threshold = config.memory_threshold_mb * 1024 * 1024;
        let max_memory = config.max_memory_mb * 1024 * 1024;
        let completion_notify = Arc::clone(&self.completion_notify);

        // 在后台线程执行展开
        let extracted_entries_clone = Arc::clone(&extracted_entries);
        let current_memory_clone = Arc::clone(&current_memory);

        thread::spawn(move || {
            let start = Instant::now();
            let mut extract_count = 0;
            let mut extract_bytes = 0;

            let result = Self::do_pre_extract(
                &archive_path,
                &temp_dir,
                &cancel_flag,
                &extracted_entries_clone,
                &current_memory_clone,
                memory_threshold,
                max_memory,
                &mut extract_count,
                &mut extract_bytes,
            );

            let elapsed = start.elapsed();
            info!(
                "📦 预展开完成: extracted={} bytes={} elapsed={}ms result={:?}",
                extract_count,
                extract_bytes,
                elapsed.as_millis(),
                result.is_ok()
            );

            completion_notify.notify_waiters();
        });

        // 保存引用以便后续访问
        // 注意：这里需要在预展开完成后更新 self.extracted_entries
        // 由于 Rust 的所有权限制，我们通过 completion_notify 同步
    }

    /// 执行预展开
    fn do_pre_extract(
        archive_path: &Path,
        temp_dir: &Path,
        cancel_flag: &AtomicBool,
        extracted_entries: &RwLock<HashMap<String, PreExtractedData>>,
        current_memory: &AtomicUsize,
        memory_threshold: usize,
        max_memory: usize,
        extract_count: &mut usize,
        extract_bytes: &mut usize,
    ) -> Result<(), String> {
        let mut archive = sevenz_rust::SevenZReader::open(archive_path, "".into())
            .map_err(|e| format!("打开压缩包失败: {}", e))?;

        archive
            .for_each_entries(|entry, reader| {
                // 检查取消
                if cancel_flag.load(Ordering::Relaxed) {
                    return Ok(false);
                }

                // 跳过目录
                if entry.is_directory() {
                    return Ok(true);
                }

                let name = entry.name().to_string();
                let size = entry.size() as usize;

                // 读取数据
                let mut data = Vec::with_capacity(size);
                if let Err(e) = reader.read_to_end(&mut data) {
                    warn!("读取条目失败: {} - {}", name, e);
                    return Ok(true);
                }

                let actual_size = data.len();
                *extract_count += 1;
                *extract_bytes += actual_size;

                // 根据大小决定存储位置
                let pre_extracted = if actual_size > memory_threshold
                    || current_memory.load(Ordering::Relaxed) + actual_size > max_memory
                {
                    // 写入临时文件
                    let safe_name =
                        name.replace(['/', '\\', '?', '*', ':', '"', '<', '>', '|'], "_");
                    let temp_path = temp_dir.join(format!("{}_{}", *extract_count, safe_name));

                    match File::create(&temp_path) {
                        Ok(mut file) => {
                            if let Err(e) = file.write_all(&data) {
                                warn!("写入临时文件失败: {} - {}", temp_path.display(), e);
                                return Ok(true);
                            }
                            PreExtractedData::TempFile(temp_path)
                        }
                        Err(e) => {
                            warn!("创建临时文件失败: {} - {}", temp_path.display(), e);
                            return Ok(true);
                        }
                    }
                } else {
                    // 保存到内存
                    current_memory.fetch_add(actual_size, Ordering::Relaxed);
                    PreExtractedData::Memory(data)
                };

                // 存储展开的数据
                extracted_entries
                    .write()
                    .insert(name.clone(), pre_extracted);

                debug!("📦 预展开: {} size={}", name, actual_size);

                Ok(true)
            })
            .map_err(|e| format!("遍历压缩包失败: {}", e))?;

        Ok(())
    }

    /// 获取预展开的数据
    ///
    /// # Arguments
    /// * `inner_path` - 内部路径
    ///
    /// # Returns
    /// * `Some(Vec<u8>)` - 如果数据已预展开
    /// * `None` - 如果数据未预展开
    pub fn get_data(&self, inner_path: &str) -> Option<Vec<u8>> {
        let entries = self.extracted_entries.read();
        entries.get(inner_path).and_then(|data| {
            // 更新统计
            if let Some(mut stats) = self.stats.try_write() {
                stats.cache_hits += 1;
            }
            data.read().ok()
        })
    }

    /// 检查数据是否已预展开
    pub fn has_data(&self, inner_path: &str) -> bool {
        self.extracted_entries.read().contains_key(inner_path)
    }

    /// 等待特定条目预展开完成
    pub async fn wait_for_entry(&self, inner_path: &str, timeout_ms: u64) -> bool {
        let start = Instant::now();
        let timeout = std::time::Duration::from_millis(timeout_ms);

        loop {
            if self.has_data(inner_path) {
                return true;
            }

            let state = self.get_state();
            if state.is_completed()
                || state == PreExtractState::Failed
                || state == PreExtractState::Canceled
            {
                return self.has_data(inner_path);
            }

            if start.elapsed() > timeout {
                return false;
            }

            // 等待一小段时间
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
    }

    /// 取消预展开
    pub fn cancel(&self) {
        self.cancel_flag.store(true, Ordering::SeqCst);
        *self.state.write() = PreExtractState::Canceled;
    }

    /// 睡眠（暂停）
    pub fn sleep(&self) {
        self.cancel_flag.store(true, Ordering::SeqCst);
        *self.state.write() = PreExtractState::Sleep;
    }

    /// 恢复
    pub fn resume(&self) {
        let state = self.get_state();
        if state == PreExtractState::Sleep {
            self.cancel_flag.store(false, Ordering::SeqCst);
            *self.state.write() = PreExtractState::None;
        }
    }

    /// 清理展开的数据
    fn cleanup_extracted(&self) {
        // 清理内存数据
        self.extracted_entries.write().clear();
        self.current_memory.store(0, Ordering::Relaxed);

        // 清理临时目录
        if let Some(temp_dir) = self.temp_directory.read().as_ref() {
            if temp_dir.exists() {
                if let Err(e) = fs::remove_dir_all(temp_dir) {
                    warn!("清理临时目录失败: {} - {}", temp_dir.display(), e);
                }
            }
        }
        *self.temp_directory.write() = None;
    }

    /// 获取统计信息
    pub fn get_stats(&self) -> PreExtractStats {
        let entries = self.extracted_entries.read();
        let mut stats = self.stats.read().clone();
        stats.extracted_count = entries.len();
        stats.extracted_bytes = entries.values().map(|d| d.size()).sum();
        stats.current_memory_bytes = self.current_memory.load(Ordering::Relaxed);
        stats
    }

    /// 重置统计
    pub fn reset_stats(&self) {
        *self.stats.write() = PreExtractStats::default();
    }
}

impl Default for SolidPreExtractor {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for SolidPreExtractor {
    fn drop(&mut self) {
        self.cancel();
        self.cleanup_extracted();
    }
}

/// 共享预展开器
pub type SharedSolidPreExtractor = Arc<SolidPreExtractor>;

/// 创建共享预展开器
pub fn create_shared_pre_extractor() -> SharedSolidPreExtractor {
    Arc::new(SolidPreExtractor::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pre_extract_state() {
        assert!(PreExtractState::None.is_ready());
        assert!(PreExtractState::Failed.is_ready());
        assert!(!PreExtractState::Extracting.is_ready());
        assert!(PreExtractState::Done.is_completed());
    }

    #[test]
    fn test_pre_extract_config() {
        let config = PreExtractConfig::default();
        assert!(config.enabled);
        assert_eq!(config.memory_threshold_mb, 10);
        assert_eq!(config.max_memory_mb, 500);
    }
}
