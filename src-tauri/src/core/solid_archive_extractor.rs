//! Solid 压缩包预解压模块
//!
//! 参考 NeeView 的 ArchivePreExtractor 和 SevenZipHybridExtractor 设计
//! 针对 7z/RAR solid 压缩包进行预解压优化

use super::archive_page_cache::{PageCacheKey, SharedPageCache};
use log::{debug, info, warn};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::{Duration, Instant};
use tempfile::TempDir;

/// 预解压状态
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PreExtractState {
    None,
    Extracting,
    Done,
    Canceled,
    Failed,
}

impl PreExtractState {
    pub fn is_ready(&self) -> bool {
        matches!(self, PreExtractState::None | PreExtractState::Canceled | PreExtractState::Failed)
    }

    pub fn is_completed(&self) -> bool {
        matches!(self, PreExtractState::Done | PreExtractState::Canceled | PreExtractState::Failed)
    }
}

/// 预解压配置
#[derive(Debug, Clone)]
pub struct PreExtractConfig {
    /// 是否启用预解压
    pub enabled: bool,
    /// 内存解压大小限制（MB）- 超过此大小解压到文件
    pub memory_limit_mb: usize,
    /// 单文件大小限制（MB）- 超过此大小解压到文件
    pub file_size_limit_mb: usize,
    /// 预解压超时（秒）
    pub timeout_secs: u64,
}

impl Default for PreExtractConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            memory_limit_mb: 512, // 512MB 总内存限制
            file_size_limit_mb: 50, // 50MB 单文件限制
            timeout_secs: 120, // 2分钟超时
        }
    }
}

/// 预解压的数据
enum ExtractedData {
    /// 内存中的数据
    Memory(Vec<u8>),
    /// 临时文件路径
    TempFile(PathBuf),
}

/// Solid 压缩包预解压器
///
/// 针对 7z/RAR solid 压缩包，一次性解压所有图片到内存或临时目录
pub struct SolidArchiveExtractor {
    /// 配置
    config: RwLock<PreExtractConfig>,
    /// 页面缓存
    cache: SharedPageCache,
    /// 当前解压状态
    state: AtomicUsize,
    /// 取消标志
    cancel_flag: Arc<AtomicBool>,
    /// 当前处理的压缩包
    current_archive: RwLock<Option<PathBuf>>,
    /// 临时目录
    temp_dir: Mutex<Option<TempDir>>,
    /// 解压进度 (已完成, 总数)
    progress: RwLock<(usize, usize)>,
    /// 错误信息
    last_error: RwLock<Option<String>>,
}

impl SolidArchiveExtractor {
    /// 创建预解压器
    pub fn new(cache: SharedPageCache) -> Self {
        Self {
            config: RwLock::new(PreExtractConfig::default()),
            cache,
            state: AtomicUsize::new(PreExtractState::None as usize),
            cancel_flag: Arc::new(AtomicBool::new(false)),
            current_archive: RwLock::new(None),
            temp_dir: Mutex::new(None),
            progress: RwLock::new((0, 0)),
            last_error: RwLock::new(None),
        }
    }

    /// 设置配置
    pub fn set_config(&self, config: PreExtractConfig) {
        if let Ok(mut cfg) = self.config.write() {
            *cfg = config;
        }
    }

    /// 获取当前状态
    pub fn get_state(&self) -> PreExtractState {
        match self.state.load(Ordering::SeqCst) {
            0 => PreExtractState::None,
            1 => PreExtractState::Extracting,
            2 => PreExtractState::Done,
            3 => PreExtractState::Canceled,
            4 => PreExtractState::Failed,
            _ => PreExtractState::None,
        }
    }

    fn set_state(&self, state: PreExtractState) {
        self.state.store(state as usize, Ordering::SeqCst);
    }

    /// 获取进度
    pub fn get_progress(&self) -> (usize, usize) {
        self.progress.read().map(|p| *p).unwrap_or((0, 0))
    }

    /// 获取最后错误
    pub fn get_last_error(&self) -> Option<String> {
        self.last_error.read().ok().and_then(|e| e.clone())
    }

    /// 检查是否为 solid 压缩包
    pub fn is_solid_archive(path: &Path) -> bool {
        if let Some(ext) = path.extension() {
            let ext_lower = ext.to_string_lossy().to_lowercase();
            // 7z 和 RAR 通常是 solid 压缩
            matches!(ext_lower.as_str(), "7z" | "cb7" | "rar" | "cbr")
        } else {
            false
        }
    }

    /// 检查是否需要预解压
    pub fn should_pre_extract(&self, path: &Path) -> bool {
        let config = self.config.read().map(|c| c.clone()).unwrap_or_default();
        config.enabled && Self::is_solid_archive(path)
    }

    /// 开始预解压
    ///
    /// 返回是否成功启动（如果已在运行则返回 false）
    pub fn start_pre_extract(
        &self,
        archive_path: &Path,
        image_entries: Vec<(usize, String)>,
    ) -> bool {
        // 检查状态
        let current_state = self.get_state();
        if !current_state.is_ready() {
            debug!("预解压器忙，跳过");
            return false;
        }

        let config = self.config.read().map(|c| c.clone()).unwrap_or_default();
        if !config.enabled {
            return false;
        }

        // 检查是否需要预解压
        if !Self::is_solid_archive(archive_path) {
            return false;
        }

        // 设置状态
        self.set_state(PreExtractState::Extracting);
        self.cancel_flag.store(false, Ordering::SeqCst);

        // 更新当前压缩包
        if let Ok(mut current) = self.current_archive.write() {
            *current = Some(archive_path.to_path_buf());
        }

        // 初始化进度
        if let Ok(mut progress) = self.progress.write() {
            *progress = (0, image_entries.len());
        }

        // 清除错误
        if let Ok(mut error) = self.last_error.write() {
            *error = None;
        }

        let archive_path = archive_path.to_path_buf();
        let cancel_flag = Arc::clone(&self.cancel_flag);
        let cache = Arc::clone(&self.cache);

        let state_ref = &self.state as *const AtomicUsize as usize;
        let progress_ref = &self.progress as *const RwLock<(usize, usize)> as usize;
        let error_ref = &self.last_error as *const RwLock<Option<String>> as usize;

        // 在新线程中执行预解压
        thread::spawn(move || {
            let start = Instant::now();
            info!(
                "开始预解压 solid 压缩包: {} ({} 张图片)",
                archive_path.display(),
                image_entries.len()
            );

            let result = Self::extract_all_images(
                &archive_path,
                &image_entries,
                &cache,
                &cancel_flag,
                config,
                state_ref,
                progress_ref,
            );

            let elapsed = start.elapsed();
            
            // 安全地更新状态（通过原始指针）
            unsafe {
                let state = &*(state_ref as *const AtomicUsize);
                let error = &*(error_ref as *const RwLock<Option<String>>);

                match result {
                    Ok(count) => {
                        info!(
                            "预解压完成: {} 张图片, 耗时 {}ms",
                            count,
                            elapsed.as_millis()
                        );
                        state.store(PreExtractState::Done as usize, Ordering::SeqCst);
                    }
                    Err(e) => {
                        warn!("预解压失败: {}", e);
                        if let Ok(mut err) = error.write() {
                            *err = Some(e);
                        }
                        state.store(PreExtractState::Failed as usize, Ordering::SeqCst);
                    }
                }
            }
        });

        true
    }

    /// 执行实际解压
    fn extract_all_images(
        archive_path: &Path,
        image_entries: &[(usize, String)],
        cache: &SharedPageCache,
        cancel_flag: &AtomicBool,
        config: PreExtractConfig,
        _state_ref: usize,
        progress_ref: usize,
    ) -> Result<usize, String> {
        let archive_path_str = archive_path.to_string_lossy().to_string();
        let ext = archive_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let mut extracted_count = 0;

        match ext.as_str() {
            "7z" | "cb7" => {
                // 7z 解压
                extracted_count = Self::extract_7z(
                    archive_path,
                    &archive_path_str,
                    image_entries,
                    cache,
                    cancel_flag,
                    &config,
                    progress_ref,
                )?;
            }
            "rar" | "cbr" => {
                // RAR 解压
                extracted_count = Self::extract_rar(
                    archive_path,
                    &archive_path_str,
                    image_entries,
                    cache,
                    cancel_flag,
                    &config,
                    progress_ref,
                )?;
            }
            _ => {
                return Err(format!("不支持的 solid 压缩格式: {}", ext));
            }
        }

        Ok(extracted_count)
    }

    /// 解压 7z 压缩包
    fn extract_7z(
        archive_path: &Path,
        archive_path_str: &str,
        image_entries: &[(usize, String)],
        cache: &SharedPageCache,
        cancel_flag: &AtomicBool,
        config: &PreExtractConfig,
        progress_ref: usize,
    ) -> Result<usize, String> {
        let mut archive = sevenz_rust::SevenZReader::open(archive_path, "".into())
            .map_err(|e| format!("打开 7z 失败: {}", e))?;

        // 构建需要提取的文件集合
        let target_files: HashMap<String, usize> = image_entries
            .iter()
            .map(|(idx, path)| (path.replace('\\', "/"), *idx))
            .collect();

        let mut extracted_count = 0;
        let memory_limit = config.memory_limit_mb * 1024 * 1024;
        let mut total_memory_used = 0usize;

        // 遍历所有条目
        archive
            .for_each_entries(|entry, reader| {
                // 检查取消
                if cancel_flag.load(Ordering::SeqCst) {
                    return Ok(false);
                }

                let entry_path = entry.name().replace('\\', "/");

                // 检查是否是我们需要的文件
                if let Some(&_idx) = target_files.get(&entry_path) {
                    let mut data = Vec::new();
                    reader.read_to_end(&mut data)?;

                    let size = data.len();

                    // 检查内存限制
                    if total_memory_used + size <= memory_limit {
                        let key = PageCacheKey::new(archive_path_str, &entry_path);
                        cache.insert(key, data);
                        total_memory_used += size;
                        extracted_count += 1;

                        // 更新进度
                        unsafe {
                            let progress = &*(progress_ref as *const RwLock<(usize, usize)>);
                            if let Ok(mut p) = progress.write() {
                                p.0 = extracted_count;
                            }
                        }

                        debug!(
                            "7z 解压: {} ({} bytes)",
                            entry_path, size
                        );
                    } else {
                        debug!(
                            "7z 跳过（内存限制）: {} ({} bytes)",
                            entry_path, size
                        );
                    }
                }

                Ok(true)
            })
            .map_err(|e| format!("7z 解压失败: {}", e))?;

        Ok(extracted_count)
    }

    /// 解压 RAR 压缩包
    fn extract_rar(
        archive_path: &Path,
        archive_path_str: &str,
        image_entries: &[(usize, String)],
        cache: &SharedPageCache,
        cancel_flag: &AtomicBool,
        config: &PreExtractConfig,
        progress_ref: usize,
    ) -> Result<usize, String> {
        // 构建需要提取的文件集合
        let target_files: HashMap<String, usize> = image_entries
            .iter()
            .map(|(idx, path)| (path.replace('\\', "/"), *idx))
            .collect();

        let mut extracted_count = 0;
        let memory_limit = config.memory_limit_mb * 1024 * 1024;
        let mut total_memory_used = 0usize;

        // 打开 RAR 进行处理
        let mut archive = unrar::Archive::new(archive_path)
            .open_for_processing()
            .map_err(|e| format!("打开 RAR 失败: {:?}", e))?;

        while let Some(header) = archive
            .read_header()
            .map_err(|e| format!("读取 RAR 头失败: {:?}", e))?
        {
            // 检查取消
            if cancel_flag.load(Ordering::SeqCst) {
                break;
            }

            let entry_path = header.entry().filename.to_string_lossy().to_string();
            let normalized_path = entry_path.replace('\\', "/");

            // 检查是否是我们需要的文件
            if target_files.contains_key(&normalized_path) {
                // 读取文件数据
                let (data, next_archive) = header
                    .read()
                    .map_err(|e| format!("读取 RAR 条目失败: {:?}", e))?;

                let size = data.len();

                // 检查内存限制
                if total_memory_used + size <= memory_limit {
                    let key = PageCacheKey::new(archive_path_str, &normalized_path);
                    cache.insert(key, data);
                    total_memory_used += size;
                    extracted_count += 1;

                    // 更新进度
                    unsafe {
                        let progress = &*(progress_ref as *const RwLock<(usize, usize)>);
                        if let Ok(mut p) = progress.write() {
                            p.0 = extracted_count;
                        }
                    }

                    debug!(
                        "RAR 解压: {} ({} bytes)",
                        normalized_path, size
                    );
                } else {
                    debug!(
                        "RAR 跳过（内存限制）: {} ({} bytes)",
                        normalized_path, size
                    );
                }

                archive = next_archive;
            } else {
                // 跳过不需要的文件
                archive = header
                    .skip()
                    .map_err(|e| format!("跳过 RAR 条目失败: {:?}", e))?;
            }
        }

        Ok(extracted_count)
    }

    /// 取消预解压
    pub fn cancel(&self) {
        self.cancel_flag.store(true, Ordering::SeqCst);
        self.set_state(PreExtractState::Canceled);
    }

    /// 等待预解压完成
    pub fn wait_for_completion(&self, timeout: Duration) -> bool {
        let start = Instant::now();
        loop {
            let state = self.get_state();
            if state.is_completed() {
                return state == PreExtractState::Done;
            }
            if start.elapsed() > timeout {
                return false;
            }
            thread::sleep(Duration::from_millis(50));
        }
    }

    /// 清理资源
    pub fn cleanup(&self) {
        self.cancel();
        if let Ok(mut temp_dir) = self.temp_dir.lock() {
            *temp_dir = None;
        }
        if let Ok(mut current) = self.current_archive.write() {
            *current = None;
        }
        self.set_state(PreExtractState::None);
    }
}

impl Drop for SolidArchiveExtractor {
    fn drop(&mut self) {
        self.cancel();
    }
}

/// 共享预解压器
pub type SharedSolidExtractor = Arc<SolidArchiveExtractor>;

/// 创建共享预解压器
pub fn create_shared_extractor(cache: SharedPageCache) -> SharedSolidExtractor {
    Arc::new(SolidArchiveExtractor::new(cache))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_solid_archive() {
        assert!(SolidArchiveExtractor::is_solid_archive(Path::new("test.7z")));
        assert!(SolidArchiveExtractor::is_solid_archive(Path::new("test.rar")));
        assert!(SolidArchiveExtractor::is_solid_archive(Path::new("test.cb7")));
        assert!(SolidArchiveExtractor::is_solid_archive(Path::new("test.cbr")));
        assert!(!SolidArchiveExtractor::is_solid_archive(Path::new("test.zip")));
        assert!(!SolidArchiveExtractor::is_solid_archive(Path::new("test.cbz")));
    }
}
