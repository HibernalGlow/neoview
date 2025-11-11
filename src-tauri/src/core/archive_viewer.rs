//! NeoView - Archive Viewer
//! 压缩包图片查看器管理器

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::command;
use serde::{Deserialize, Serialize};
use crate::core::archive_cache::{ArchiveImageCache, CacheEntry};

/// 查看器状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewerState {
    /// 当前压缩包路径
    pub archive_path: String,
    /// 当前图片索引
    pub current_index: usize,
    /// 总图片数
    pub total_images: usize,
    /// 预加载范围（左右各预加载多少张）
    pub preload_range: usize,
    /// 是否正在加载
    pub loading: bool,
}

/// 预加载任务
#[derive(Debug, Clone)]
struct PreloadTask {
    archive_path: String,
    image_path: String,
    index: usize,
    priority: i32,
}

/// 压缩包图片查看器管理器
pub struct ArchiveViewer {
    /// 缓存管理器
    pub(crate) cache: Arc<Mutex<ArchiveImageCache>>,
    /// 当前状态
    state: Arc<Mutex<Option<ViewerState>>>,
    /// 预加载队列
    preload_queue: Arc<Mutex<Vec<PreloadTask>>>,
    /// 正在预加载的索引
    preloading: Arc<Mutex<HashMap<String, Vec<usize>>>>,
}

/// 全局状态
pub struct ArchiveViewerState {
    pub viewer: Arc<Mutex<Option<ArchiveViewer>>>,
}

impl Default for ArchiveViewerState {
    fn default() -> Self {
        Self {
            viewer: Arc::new(Mutex::new(None)),
        }
    }
}

impl ArchiveViewer {
    /// 创建新的查看器
    pub fn new(cache: ArchiveImageCache) -> Self {
        let viewer = Self {
            cache: Arc::new(Mutex::new(cache)),
            state: Arc::new(Mutex::new(None)),
            preload_queue: Arc::new(Mutex::new(Vec::new())),
            preloading: Arc::new(Mutex::new(HashMap::new())),
        };

        // 启动预加载工作线程
        viewer.start_preload_worker();

        viewer
    }

    /// 打开压缩包
    pub fn open_archive(&mut self, archive_path: &str, preload_count: usize) -> Result<ViewerState, String> {
        // 获取压缩包中的所有图片
        let images = {
            let mut cache = self.cache.lock()
                .map_err(|e| format!("获取缓存锁失败: {}", e))?;
            cache.get_archive_images(archive_path)?
        };

        if images.is_empty() {
            return Err("压缩包中没有图片".to_string());
        }

        // 创建状态
        let state = ViewerState {
            archive_path: archive_path.to_string(),
            current_index: 0,
            total_images: images.len(),
            preload_range: preload_count,
            loading: false,
        };

        // 保存状态
        {
            let mut state_guard = self.state.lock()
                .map_err(|e| format!("获取状态锁失败: {}", e))?;
            *state_guard = Some(state.clone());
        }

        // 开始预加载
        self.start_preload(archive_path, &images, 0, preload_count)?;

        Ok(state)
    }

    /// 切换到指定索引的图片
    pub fn goto_index(&mut self, index: usize) -> Result<ViewerState, String> {
        let mut state = {
            let state_guard = self.state.lock()
                .map_err(|e| format!("获取状态锁失败: {}", e))?;
            match *state_guard {
                Some(ref s) => s.clone(),
                None => return Err("没有打开的压缩包".to_string()),
            }
        };

        if index >= state.total_images {
            return Err(format!("索引超出范围: {}/{}", index, state.total_images));
        }

        // 更新当前索引
        state.current_index = index;

        // 保存状态
        {
            let mut state_guard = self.state.lock()
                .map_err(|e| format!("获取状态锁失败: {}", e))?;
            *state_guard = Some(state.clone());
        }

        // 开始预加载
        let images = {
            let mut cache = self.cache.lock()
                .map_err(|e| format!("获取缓存锁失败: {}", e))?;
            cache.get_archive_images(&state.archive_path)?
        };

        self.start_preload(&state.archive_path, &images, index, state.preload_range)?;

        Ok(state)
    }

    /// 获取当前图片的缓存路径
    pub fn get_current_image(&self) -> Result<Option<String>, String> {
        let state = {
            let state_guard = self.state.lock()
                .map_err(|e| format!("获取状态锁失败: {}", e))?;
            match *state_guard {
                Some(ref s) => s.clone(),
                None => return Ok(None),
            }
        };

        let images = {
            let mut cache = self.cache.lock()
                .map_err(|e| format!("获取缓存锁失败: {}", e))?;
            cache.get_archive_images(&state.archive_path)?
        };

        if state.current_index >= images.len() {
            return Ok(None);
        }

        let image_path = &images[state.current_index];
        let mut cache = self.cache.lock()
            .map_err(|e| format!("获取缓存锁失败: {}", e))?;
        
        let entry = cache.get_or_create(&state.archive_path, image_path)?;
        Ok(Some(entry.cache_path))
    }

    /// 获取指定索引的图片缓存路径
    pub fn get_image_at(&self, index: usize) -> Result<Option<String>, String> {
        let state = {
            let state_guard = self.state.lock()
                .map_err(|e| format!("获取状态锁失败: {}", e))?;
            match *state_guard {
                Some(ref s) => s.clone(),
                None => return Ok(None),
            }
        };

        if index >= state.total_images {
            return Ok(None);
        }

        let images = {
            let mut cache = self.cache.lock()
                .map_err(|e| format!("获取缓存锁失败: {}", e))?;
            cache.get_archive_images(&state.archive_path)?
        };

        if index >= images.len() {
            return Ok(None);
        }

        let image_path = &images[index];
        let mut cache = self.cache.lock()
            .map_err(|e| format!("获取缓存锁失败: {}", e))?;
        
        let entry = cache.get_or_create(&state.archive_path, image_path)?;
        Ok(Some(entry.cache_path))
    }

    /// 获取缩略图路径
    pub fn get_thumbnail(&self, index: usize) -> Result<Option<String>, String> {
        let state = {
            let state_guard = self.state.lock()
                .map_err(|e| format!("获取状态锁失败: {}", e))?;
            match *state_guard {
                Some(ref s) => s.clone(),
                None => return Ok(None),
            }
        };

        if index >= state.total_images {
            return Ok(None);
        }

        let images = {
            let mut cache = self.cache.lock()
                .map_err(|e| format!("获取缓存锁失败: {}", e))?;
            cache.get_archive_images(&state.archive_path)?
        };

        if index >= images.len() {
            return Ok(None);
        }

        let image_path = &images[index];
        let mut cache = self.cache.lock()
            .map_err(|e| format!("获取缓存锁失败: {}", e))?;
        
        // 确保图片已缓存
        let entry = cache.get_or_create(&state.archive_path, image_path)?;
        
        // 生成缩略图
        let thumb_path = cache.generate_thumbnail(&entry.md5)?;
        Ok(Some(thumb_path))
    }

    /// 开始预加载
    fn start_preload(&self, archive_path: &str, images: &[String], current_index: usize, preload_range: usize) -> Result<(), String> {
        // 清空之前的预加载队列
        {
            let mut queue = self.preload_queue.lock()
                .map_err(|e| format!("获取预加载队列锁失败: {}", e))?;
            queue.clear();
        }

        // 计算预加载范围
        let start = if current_index >= preload_range { current_index - preload_range } else { 0 };
        let end = std::cmp::min(current_index + preload_range + 1, images.len());

        // 如果预加载数量大于等于总图片数，加载全部
        if preload_range * 2 + 1 >= images.len() {
            for (index, image_path) in images.iter().enumerate() {
                self.add_preload_task(archive_path, image_path, index, if index == current_index { 0 } else { 1 });
            }
        } else {
            // 添加预加载任务
            for index in start..end {
                if index != current_index {
                    let image_path = &images[index];
                    let priority = if index < current_index {
                        // 之前的图片优先级较低
                        (current_index - index) as i32 + 10
                    } else {
                        // 之后的图片优先级较高
                        (index - current_index) as i32
                    };
                    self.add_preload_task(archive_path, image_path, index, priority);
                }
            }

            // 确保当前图片已加载（最高优先级）
            if current_index < images.len() {
                let current_image_path = &images[current_index];
                self.add_preload_task(archive_path, current_image_path, current_index, 0);
            }
        }

        Ok(())
    }

    /// 添加预加载任务
    fn add_preload_task(&self, archive_path: &str, image_path: &str, index: usize, priority: i32) {
        let task = PreloadTask {
            archive_path: archive_path.to_string(),
            image_path: image_path.to_string(),
            index,
            priority,
        };

        let mut queue = self.preload_queue.lock().unwrap();
        queue.push(task);
        // 按优先级排序
        queue.sort_by(|a, b| a.priority.cmp(&b.priority));
    }

    /// 启动预加载工作线程
    fn start_preload_worker(&self) {
        let cache = self.cache.clone();
        let queue = self.preload_queue.clone();
        let preloading = self.preloading.clone();

        thread::spawn(move || {
            loop {
                // 获取下一个任务
                let task = {
                    let mut queue_guard = queue.lock().unwrap();
                    if queue_guard.is_empty() {
                        // 没有任务，休眠一下
                        drop(queue_guard);
                        thread::sleep(Duration::from_millis(100));
                        continue;
                    }
                    queue_guard.remove(0)
                };

                // 检查是否已在预加载中
                {
                    let preloading_guard = preloading.lock().unwrap();
                    if let Some(indices) = preloading_guard.get(&task.archive_path) {
                        if indices.contains(&task.index) {
                            continue; // 已在加载中，跳过
                        }
                    }
                }

                // 标记为正在预加载
                {
                    let mut preloading_guard = preloading.lock().unwrap();
                    let indices = preloading_guard.entry(task.archive_path.clone()).or_insert_with(Vec::new);
                    indices.push(task.index);
                }

                // 执行预加载
                let result = {
                    let mut cache_guard = cache.lock().unwrap();
                    cache_guard.get_or_create(&task.archive_path, &task.image_path)
                };

                match result {
                    Ok(entry) => {
                        println!("✅ 预加载完成: {}[{}] -> {}", 
                                task.archive_path, task.index, entry.cache_path);
                    }
                    Err(e) => {
                        println!("❌ 预加载失败: {}[{}] -> {}", 
                                task.archive_path, task.index, e);
                    }
                }

                // 移除预加载标记
                {
                    let mut preloading_guard = preloading.lock().unwrap();
                    if let Some(indices) = preloading_guard.get_mut(&task.archive_path) {
                        indices.retain(|&i| i != task.index);
                        if indices.is_empty() {
                            preloading_guard.remove(&task.archive_path);
                        }
                    }
                }
            }
        });
    }

    /// 获取当前状态
    pub fn get_state(&self) -> Option<ViewerState> {
        let state_guard = self.state.lock().unwrap();
        (*state_guard).clone()
    }

    /// 获取所有图片的缩略图路径
    pub fn get_all_thumbnails(&self) -> Result<Vec<Option<String>>, String> {
        let state = {
            let state_guard = self.state.lock()
                .map_err(|e| format!("获取状态锁失败: {}", e))?;
            match *state_guard {
                Some(ref s) => s.clone(),
                None => return Ok(Vec::new()),
            }
        };

        let images = {
            let mut cache = self.cache.lock()
                .map_err(|e| format!("获取缓存锁失败: {}", e))?;
            cache.get_archive_images(&state.archive_path)?
        };

        let mut thumbnails = Vec::new();
        for (index, image_path) in images.iter().enumerate() {
            match self.get_thumbnail(index) {
                Ok(Some(thumb_path)) => thumbnails.push(Some(thumb_path)),
                _ => thumbnails.push(None),
            }
        }

        Ok(thumbnails)
    }

    /// 超分处理（预留接口）
    pub fn super_resolve(&self, index: usize, params: &str) -> Result<Option<String>, String> {
        let state = {
            let state_guard = self.state.lock()
                .map_err(|e| format!("获取状态锁失败: {}", e))?;
            match *state_guard {
                Some(ref s) => s.clone(),
                None => return Ok(None),
            }
        };

        if index >= state.total_images {
            return Ok(None);
        }

        let images = {
            let mut cache = self.cache.lock()
                .map_err(|e| format!("获取缓存锁失败: {}", e))?;
            cache.get_archive_images(&state.archive_path)?
        };

        if index >= images.len() {
            return Ok(None);
        }

        let image_path = &images[index];
        let mut cache = self.cache.lock()
            .map_err(|e| format!("获取缓存锁失败: {}", e))?;
        
        // 确保图片已缓存
        let entry = cache.get_or_create(&state.archive_path, image_path)?;
        
        // TODO: 实现超分逻辑
        // 1. 获取原图路径
        let full_image_path = cache.get_full_cache_path(&entry.cache_path);
        
        // 2. 执行超分处理
        // let sr_image_path = self.perform_super_resolution(&full_image_path, params)?;
        
        // 3. 保存超分图
        // let sr_cache_path = format!("sr/{}_sr{}.{}", entry.md5, params, entry.format);
        // ...
        
        // 暂时返回原图路径
        Ok(Some(entry.cache_path))
    }
}

// Tauri 命令
#[command]
pub async fn archive_viewer_open(
    archive_path: String,
    preload_count: Option<usize>,
    state: tauri::State<'_, ArchiveViewerState>,
) -> Result<ViewerState, String> {
    let preload_count = preload_count.unwrap_or(5); // 默认预加载前后各5张
    
    if let Ok(mut viewer_guard) = state.viewer.lock() {
        if let Some(ref mut viewer) = *viewer_guard {
            viewer.open_archive(&archive_path, preload_count)
        } else {
            Err("查看器未初始化".to_string())
        }
    } else {
        Err("无法获取查看器锁".to_string())
    }
}

#[command]
pub async fn archive_viewer_goto(
    index: usize,
    state: tauri::State<'_, ArchiveViewerState>,
) -> Result<ViewerState, String> {
    if let Ok(mut viewer_guard) = state.viewer.lock() {
        if let Some(ref mut viewer) = *viewer_guard {
            viewer.goto_index(index)
        } else {
            Err("查看器未初始化".to_string())
        }
    } else {
        Err("无法获取查看器锁".to_string())
    }
}

#[command]
pub async fn archive_viewer_get_current(
    state: tauri::State<'_, ArchiveViewerState>,
) -> Result<Option<String>, String> {
    if let Ok(viewer_guard) = state.viewer.lock() {
        if let Some(ref viewer) = *viewer_guard {
            viewer.get_current_image()
        } else {
            Ok(None)
        }
    } else {
        Err("无法获取查看器锁".to_string())
    }
}

#[command]
pub async fn archive_viewer_get_image(
    index: usize,
    state: tauri::State<'_, ArchiveViewerState>,
) -> Result<Option<String>, String> {
    if let Ok(viewer_guard) = state.viewer.lock() {
        if let Some(ref viewer) = *viewer_guard {
            viewer.get_image_at(index)
        } else {
            Ok(None)
        }
    } else {
        Err("无法获取查看器锁".to_string())
    }
}

#[command]
pub async fn archive_viewer_get_thumbnail(
    index: usize,
    state: tauri::State<'_, ArchiveViewerState>,
) -> Result<Option<String>, String> {
    if let Ok(viewer_guard) = state.viewer.lock() {
        if let Some(ref viewer) = *viewer_guard {
            viewer.get_thumbnail(index)
        } else {
            Ok(None)
        }
    } else {
        Err("无法获取查看器锁".to_string())
    }
}

#[command]
pub async fn archive_viewer_get_all_thumbnails(
    state: tauri::State<'_, ArchiveViewerState>,
) -> Result<Vec<Option<String>>, String> {
    if let Ok(viewer_guard) = state.viewer.lock() {
        if let Some(ref viewer) = *viewer_guard {
            viewer.get_all_thumbnails()
        } else {
            Ok(Vec::new())
        }
    } else {
        Err("无法获取查看器锁".to_string())
    }
}

#[command]
pub async fn archive_viewer_super_resolve(
    index: usize,
    params: String,
    state: tauri::State<'_, ArchiveViewerState>,
) -> Result<Option<String>, String> {
    if let Ok(viewer_guard) = state.viewer.lock() {
        if let Some(ref viewer) = *viewer_guard {
            viewer.super_resolve(index, &params)
        } else {
            Ok(None)
        }
    } else {
        Err("无法获取查看器锁".to_string())
    }
}

#[command]
pub async fn archive_viewer_get_state(
    state: tauri::State<'_, ArchiveViewerState>,
) -> Result<Option<ViewerState>, String> {
    if let Ok(viewer_guard) = state.viewer.lock() {
        Ok(viewer_guard.as_ref().and_then(|v| v.get_state()))
    } else {
        Err("无法获取查看器锁".to_string())
    }
}