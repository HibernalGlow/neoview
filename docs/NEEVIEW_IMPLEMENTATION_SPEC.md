# NeeView 加载系统 - Rust 实现规格

## 模块结构

```
src-tauri/src/core/
├── job_engine/
│   ├── mod.rs              # JobEngine 主入口
│   ├── job.rs              # Job 定义
│   ├── scheduler.rs        # JobScheduler
│   ├── worker.rs           # JobWorker
│   └── handle.rs           # JobHandle (结果获取)
├── page_manager/
│   ├── mod.rs              # PageContentManager
│   ├── memory_pool.rs      # MemoryPool
│   ├── book_context.rs     # BookContext
│   └── page_cache.rs       # PageCache
└── commands/
    └── page_commands.rs    # Tauri Commands
```

---

## 一、JobEngine 模块

### 1.1 Job 定义

```rust
// src-tauri/src/core/job_engine/job.rs

use std::future::Future;
use std::pin::Pin;
use tokio_util::sync::CancellationToken;

/// 任务优先级
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum JobPriority {
    /// 缩略图加载 (最低)
    Thumbnail = 10,
    /// 预加载页面
    Preload = 50,
    /// 当前页面加载
    CurrentPage = 90,
    /// 紧急任务 (如切书)
    Urgent = 100,
}

/// 任务类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobCategory {
    PageContent,
    Thumbnail,
    ArchiveScan,
}

/// 任务结果
pub type JobResult = Result<JobOutput, String>;

/// 任务输出
#[derive(Debug)]
pub enum JobOutput {
    PageLoaded { index: usize, data: Vec<u8>, size: usize },
    ThumbnailLoaded { index: usize, data: Vec<u8> },
    ArchiveScanned { path: String, entries: Vec<String> },
}

/// 任务定义
pub struct Job {
    /// 唯一标识 (用于去重和取消)
    pub key: String,
    /// 优先级
    pub priority: JobPriority,
    /// 类别
    pub category: JobCategory,
    /// 执行器
    pub executor: Box<dyn FnOnce(CancellationToken) -> Pin<Box<dyn Future<Output = JobResult> + Send>> + Send>,
}

impl Job {
    pub fn new_page_load(
        book_path: &str,
        page_index: usize,
        inner_path: &str,
        priority: JobPriority,
    ) -> Self {
        let key = format!("page:{}:{}", book_path, page_index);
        let book_path = book_path.to_string();
        let inner_path = inner_path.to_string();
        
        Self {
            key,
            priority,
            category: JobCategory::PageContent,
            executor: Box::new(move |token| {
                Box::pin(async move {
                    // 实际加载逻辑
                    load_page_content(&book_path, &inner_path, token).await
                })
            }),
        }
    }
}

async fn load_page_content(
    book_path: &str,
    inner_path: &str,
    token: CancellationToken,
) -> JobResult {
    // 检查取消
    if token.is_cancelled() {
        return Err("Cancelled".to_string());
    }
    
    // 加载逻辑...
    todo!()
}
```

### 1.2 JobScheduler

```rust
// src-tauri/src/core/job_engine/scheduler.rs

use std::collections::{BinaryHeap, HashMap};
use std::cmp::Ordering;
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

/// 带优先级的任务包装
struct PrioritizedJob {
    job: Job,
    sequence: u64,  // 用于 FIFO 排序
}

impl Ord for PrioritizedJob {
    fn cmp(&self, other: &Self) -> Ordering {
        // 优先级高的在前，相同优先级按序号 (FIFO)
        match self.job.priority.cmp(&other.job.priority) {
            Ordering::Equal => other.sequence.cmp(&self.sequence),
            other => other,
        }
    }
}

impl PartialOrd for PrioritizedJob {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl PartialEq for PrioritizedJob {
    fn eq(&self, other: &Self) -> bool {
        self.sequence == other.sequence
    }
}

impl Eq for PrioritizedJob {}

pub struct JobScheduler {
    /// 优先级队列
    queue: BinaryHeap<PrioritizedJob>,
    /// 活跃任务的取消令牌
    active_tokens: HashMap<String, CancellationToken>,
    /// 序号计数器
    sequence: u64,
    /// 通知器
    notify: Notify,
}

impl JobScheduler {
    pub fn new() -> Self {
        Self {
            queue: BinaryHeap::new(),
            active_tokens: HashMap::new(),
            sequence: 0,
            notify: Notify::new(),
        }
    }

    /// 入队任务
    pub fn enqueue(&mut self, job: Job) -> (CancellationToken, u64) {
        let key = job.key.clone();
        
        // 取消相同 key 的旧任务
        if let Some(old_token) = self.active_tokens.remove(&key) {
            old_token.cancel();
            log::debug!("Cancelled old job: {}", key);
        }
        
        // 创建新的取消令牌
        let token = CancellationToken::new();
        self.active_tokens.insert(key, token.clone());
        
        // 入队
        self.sequence += 1;
        let seq = self.sequence;
        self.queue.push(PrioritizedJob { job, sequence: seq });
        
        // 通知 Worker
        self.notify.notify_one();
        
        (token, seq)
    }

    /// 批量入队 (用于预加载)
    pub fn enqueue_batch(&mut self, jobs: Vec<Job>) -> Vec<(CancellationToken, u64)> {
        jobs.into_iter().map(|job| self.enqueue(job)).collect()
    }

    /// 取消指定前缀的所有任务
    pub fn cancel_by_prefix(&mut self, prefix: &str) {
        let keys_to_cancel: Vec<_> = self.active_tokens
            .keys()
            .filter(|k| k.starts_with(prefix))
            .cloned()
            .collect();
        
        for key in keys_to_cancel {
            if let Some(token) = self.active_tokens.remove(&key) {
                token.cancel();
            }
        }
    }

    /// 获取下一个任务 (Worker 调用)
    pub async fn dequeue(&mut self, min_priority: JobPriority) -> Option<(Job, CancellationToken)> {
        loop {
            // 尝试获取满足优先级要求的任务
            while let Some(pj) = self.queue.peek() {
                if pj.job.priority >= min_priority {
                    let pj = self.queue.pop().unwrap();
                    let token = self.active_tokens.get(&pj.job.key).cloned();
                    
                    if let Some(token) = token {
                        if !token.is_cancelled() {
                            return Some((pj.job, token));
                        }
                    }
                    // 任务已取消，继续下一个
                } else {
                    break;
                }
            }
            
            // 等待新任务
            self.notify.notified().await;
        }
    }

    /// 任务完成通知
    pub fn complete(&mut self, key: &str) {
        self.active_tokens.remove(key);
    }

    /// 获取队列统计
    pub fn stats(&self) -> SchedulerStats {
        SchedulerStats {
            queue_size: self.queue.len(),
            active_count: self.active_tokens.len(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct SchedulerStats {
    pub queue_size: usize,
    pub active_count: usize,
}
```

### 1.3 JobWorker

```rust
// src-tauri/src/core/job_engine/worker.rs

use std::sync::Arc;
use tokio::sync::Mutex;

pub struct JobWorker {
    id: usize,
    scheduler: Arc<Mutex<JobScheduler>>,
    min_priority: JobPriority,
    result_sender: tokio::sync::mpsc::Sender<(String, JobResult)>,
}

impl JobWorker {
    pub fn new(
        id: usize,
        scheduler: Arc<Mutex<JobScheduler>>,
        is_primary: bool,
        result_sender: tokio::sync::mpsc::Sender<(String, JobResult)>,
    ) -> Self {
        // Primary Worker 处理高优先级任务
        // Secondary Worker 处理所有任务
        let min_priority = if is_primary {
            JobPriority::CurrentPage
        } else {
            JobPriority::Thumbnail
        };
        
        Self {
            id,
            scheduler,
            min_priority,
            result_sender,
        }
    }

    pub async fn run(self, mut shutdown: tokio::sync::broadcast::Receiver<()>) {
        log::info!("Worker {} started (min_priority: {:?})", self.id, self.min_priority);
        
        loop {
            tokio::select! {
                _ = shutdown.recv() => {
                    log::info!("Worker {} shutting down", self.id);
                    break;
                }
                job_opt = async {
                    let mut scheduler = self.scheduler.lock().await;
                    scheduler.dequeue(self.min_priority).await
                } => {
                    if let Some((job, token)) = job_opt {
                        let key = job.key.clone();
                        log::debug!("Worker {} executing job: {}", self.id, key);
                        
                        // 执行任务
                        let result = (job.executor)(token).await;
                        
                        // 标记完成
                        {
                            let mut scheduler = self.scheduler.lock().await;
                            scheduler.complete(&key);
                        }
                        
                        // 发送结果
                        let _ = self.result_sender.send((key, result)).await;
                    }
                }
            }
        }
    }
}
```

### 1.4 JobEngine 主模块

```rust
// src-tauri/src/core/job_engine/mod.rs

mod job;
mod scheduler;
mod worker;

pub use job::{Job, JobCategory, JobOutput, JobPriority, JobResult};
pub use scheduler::{JobScheduler, SchedulerStats};

use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, Mutex};

pub struct JobEngine {
    scheduler: Arc<Mutex<JobScheduler>>,
    result_rx: mpsc::Receiver<(String, JobResult)>,
    shutdown_tx: broadcast::Sender<()>,
    worker_handles: Vec<tokio::task::JoinHandle<()>>,
}

impl JobEngine {
    pub fn new(worker_count: usize) -> Self {
        let scheduler = Arc::new(Mutex::new(JobScheduler::new()));
        let (result_tx, result_rx) = mpsc::channel(1024);
        let (shutdown_tx, _) = broadcast::channel(1);
        
        let mut worker_handles = Vec::with_capacity(worker_count);
        
        for i in 0..worker_count {
            let is_primary = i < 2;  // 前两个是 Primary Worker
            let worker = worker::JobWorker::new(
                i,
                Arc::clone(&scheduler),
                is_primary,
                result_tx.clone(),
            );
            
            let shutdown_rx = shutdown_tx.subscribe();
            worker_handles.push(tokio::spawn(worker.run(shutdown_rx)));
        }
        
        Self {
            scheduler,
            result_rx,
            shutdown_tx,
            worker_handles,
        }
    }

    /// 提交单个任务
    pub async fn submit(&self, job: Job) -> CancellationToken {
        let mut scheduler = self.scheduler.lock().await;
        let (token, _) = scheduler.enqueue(job);
        token
    }

    /// 批量提交任务
    pub async fn submit_batch(&self, jobs: Vec<Job>) -> Vec<CancellationToken> {
        let mut scheduler = self.scheduler.lock().await;
        scheduler.enqueue_batch(jobs)
            .into_iter()
            .map(|(token, _)| token)
            .collect()
    }

    /// 取消指定书籍的所有任务
    pub async fn cancel_book(&self, book_path: &str) {
        let mut scheduler = self.scheduler.lock().await;
        scheduler.cancel_by_prefix(&format!("page:{}:", book_path));
    }

    /// 获取结果接收器
    pub fn result_receiver(&mut self) -> &mut mpsc::Receiver<(String, JobResult)> {
        &mut self.result_rx
    }

    /// 获取统计信息
    pub async fn stats(&self) -> SchedulerStats {
        let scheduler = self.scheduler.lock().await;
        scheduler.stats()
    }

    /// 关闭引擎
    pub async fn shutdown(self) {
        let _ = self.shutdown_tx.send(());
        for handle in self.worker_handles {
            let _ = handle.await;
        }
    }
}
```

---

## 二、PageContentManager 模块

### 2.1 MemoryPool

```rust
// src-tauri/src/core/page_manager/memory_pool.rs

use std::collections::HashMap;
use std::time::Instant;

#[derive(Debug, Clone)]
pub struct CachedPage {
    pub data: Vec<u8>,
    pub page_index: usize,
    pub size: usize,
    pub last_accessed: Instant,
    pub is_locked: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct PageKey {
    pub book_path: String,
    pub page_index: usize,
}

pub struct MemoryPool {
    entries: HashMap<PageKey, CachedPage>,
    total_size: usize,
    max_size: usize,
}

impl MemoryPool {
    pub fn new(max_size_mb: usize) -> Self {
        Self {
            entries: HashMap::new(),
            total_size: 0,
            max_size: max_size_mb * 1024 * 1024,
        }
    }

    /// 获取缓存页面
    pub fn get(&mut self, key: &PageKey) -> Option<&CachedPage> {
        if let Some(entry) = self.entries.get_mut(key) {
            entry.last_accessed = Instant::now();
            Some(entry)
        } else {
            None
        }
    }

    /// 插入页面 (自动驱逐)
    pub fn insert(
        &mut self,
        key: PageKey,
        data: Vec<u8>,
        current_index: usize,
        read_direction: i32,
    ) {
        let size = data.len();
        
        // 驱逐直到有足够空间
        while self.total_size + size > self.max_size && !self.entries.is_empty() {
            if !self.evict_one(current_index, read_direction) {
                break;  // 所有页面都被锁定
            }
        }
        
        // 插入新页面
        self.entries.insert(key, CachedPage {
            data,
            page_index: current_index,
            size,
            last_accessed: Instant::now(),
            is_locked: false,
        });
        self.total_size += size;
    }

    /// 驱逐一个页面 (距离驱逐策略)
    fn evict_one(&mut self, current_index: usize, direction: i32) -> bool {
        // 计算每个页面的驱逐优先级
        // 1. 锁定的页面不驱逐
        // 2. 阅读方向反向的优先驱逐
        // 3. 距离远的优先驱逐
        
        let victim = self.entries.iter()
            .filter(|(_, v)| !v.is_locked)
            .max_by(|(_, a), (_, b)| {
                let dist_a = Self::evict_priority(a.page_index, current_index, direction);
                let dist_b = Self::evict_priority(b.page_index, current_index, direction);
                dist_a.cmp(&dist_b)
            })
            .map(|(k, _)| k.clone());
        
        if let Some(key) = victim {
            if let Some(entry) = self.entries.remove(&key) {
                self.total_size -= entry.size;
                log::debug!(
                    "Evicted page {} (size: {} KB)",
                    entry.page_index,
                    entry.size / 1024
                );
                return true;
            }
        }
        false
    }

    /// 计算驱逐优先级 (越大越优先驱逐)
    fn evict_priority(page_index: usize, current_index: usize, direction: i32) -> i32 {
        let diff = page_index as i32 - current_index as i32;
        
        if direction > 0 {
            // 向前阅读：后面的页面优先保留
            if diff < 0 {
                // 已经过去的页面
                -diff + 1000  // 高优先级驱逐
            } else {
                // 前面的页面
                1000 - diff  // 距离越近优先级越低
            }
        } else {
            // 向后阅读：前面的页面优先保留
            if diff > 0 {
                diff + 1000
            } else {
                1000 + diff
            }
        }
    }

    /// 锁定页面 (防止驱逐)
    pub fn lock(&mut self, key: &PageKey) {
        if let Some(entry) = self.entries.get_mut(key) {
            entry.is_locked = true;
        }
    }

    /// 解锁页面
    pub fn unlock(&mut self, key: &PageKey) {
        if let Some(entry) = self.entries.get_mut(key) {
            entry.is_locked = false;
        }
    }

    /// 清除指定书籍的缓存
    pub fn clear_book(&mut self, book_path: &str) {
        let keys_to_remove: Vec<_> = self.entries
            .keys()
            .filter(|k| k.book_path == book_path)
            .cloned()
            .collect();
        
        for key in keys_to_remove {
            if let Some(entry) = self.entries.remove(&key) {
                self.total_size -= entry.size;
            }
        }
    }

    /// 获取统计信息
    pub fn stats(&self) -> MemoryPoolStats {
        MemoryPoolStats {
            entry_count: self.entries.len(),
            total_size: self.total_size,
            max_size: self.max_size,
            usage_percent: (self.total_size as f64 / self.max_size as f64 * 100.0) as u8,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MemoryPoolStats {
    pub entry_count: usize,
    pub total_size: usize,
    pub max_size: usize,
    pub usage_percent: u8,
}
```

### 2.2 PageContentManager

```rust
// src-tauri/src/core/page_manager/mod.rs

mod memory_pool;
mod book_context;

pub use memory_pool::{MemoryPool, MemoryPoolStats, PageKey};
pub use book_context::BookContext;

use crate::core::job_engine::{Job, JobEngine, JobPriority};
use crate::core::archive::ArchiveManager;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct PageContentManager {
    job_engine: Arc<JobEngine>,
    memory_pool: Arc<Mutex<MemoryPool>>,
    archive_manager: Arc<ArchiveManager>,
    current_book: Option<BookContext>,
    current_index: usize,
    read_direction: i32,
}

impl PageContentManager {
    pub fn new(
        job_engine: Arc<JobEngine>,
        archive_manager: Arc<ArchiveManager>,
        cache_size_mb: usize,
    ) -> Self {
        Self {
            job_engine,
            memory_pool: Arc::new(Mutex::new(MemoryPool::new(cache_size_mb))),
            archive_manager,
            current_book: None,
            current_index: 0,
            read_direction: 1,
        }
    }

    /// 打开书籍
    pub async fn open_book(&mut self, path: &str) -> Result<BookContext, String> {
        // 清除旧书籍缓存
        if let Some(ref old_book) = self.current_book {
            self.job_engine.cancel_book(&old_book.path).await;
            self.memory_pool.lock().await.clear_book(&old_book.path);
        }
        
        // 加载新书籍
        let entries = self.archive_manager
            .lock()
            .unwrap()
            .get_images_from_archive(std::path::Path::new(path))?;
        
        let book = BookContext {
            path: path.to_string(),
            pages: entries,
            total_pages: 0,  // 稍后设置
        };
        
        self.current_book = Some(book.clone());
        self.current_index = 0;
        
        Ok(book)
    }

    /// 跳转到指定页面
    pub async fn goto_page(&mut self, index: usize) -> Result<Vec<u8>, String> {
        let book = self.current_book.as_ref()
            .ok_or("No book opened")?;
        
        // 更新阅读方向
        self.read_direction = if index > self.current_index { 1 } else { -1 };
        self.current_index = index;
        
        // 检查缓存
        let key = PageKey {
            book_path: book.path.clone(),
            page_index: index,
        };
        
        {
            let mut pool = self.memory_pool.lock().await;
            if let Some(cached) = pool.get(&key) {
                return Ok(cached.data.clone());
            }
        }
        
        // 提交加载任务
        let job = self.create_page_job(book, index, JobPriority::CurrentPage);
        let token = self.job_engine.submit(job).await;
        
        // 提交预加载任务
        self.submit_preload_jobs(book, index).await;
        
        // 等待当前页加载完成
        // TODO: 实现等待机制
        
        // 从缓存获取
        let pool = self.memory_pool.lock().await;
        pool.get(&key)
            .map(|c| c.data.clone())
            .ok_or_else(|| "Page not loaded".to_string())
    }

    /// 提交预加载任务
    async fn submit_preload_jobs(&self, book: &BookContext, current: usize) {
        const PRELOAD_RANGE: usize = 5;
        
        let mut jobs = Vec::new();
        
        // 前向预加载
        for i in 1..=PRELOAD_RANGE {
            let idx = current.saturating_add(i);
            if idx < book.pages.len() {
                jobs.push(self.create_page_job(book, idx, JobPriority::Preload));
            }
        }
        
        // 后向预加载 (优先级稍低)
        for i in 1..=PRELOAD_RANGE {
            if current >= i {
                let idx = current - i;
                jobs.push(self.create_page_job(book, idx, JobPriority::Preload));
            }
        }
        
        if !jobs.is_empty() {
            self.job_engine.submit_batch(jobs).await;
        }
    }

    fn create_page_job(&self, book: &BookContext, index: usize, priority: JobPriority) -> Job {
        let book_path = book.path.clone();
        let inner_path = book.pages[index].clone();
        let archive_manager = Arc::clone(&self.archive_manager);
        let memory_pool = Arc::clone(&self.memory_pool);
        let read_direction = self.read_direction;
        
        Job {
            key: format!("page:{}:{}", book_path, index),
            priority,
            category: crate::core::job_engine::JobCategory::PageContent,
            executor: Box::new(move |token| {
                Box::pin(async move {
                    if token.is_cancelled() {
                        return Err("Cancelled".to_string());
                    }
                    
                    // 从压缩包加载
                    let data = {
                        let manager = archive_manager.lock().unwrap();
                        manager.load_image_from_archive_binary(
                            std::path::Path::new(&book_path),
                            &inner_path,
                        )?
                    };
                    
                    // 存入缓存
                    {
                        let mut pool = memory_pool.lock().await;
                        pool.insert(
                            PageKey { book_path: book_path.clone(), page_index: index },
                            data.clone(),
                            index,
                            read_direction,
                        );
                    }
                    
                    Ok(crate::core::job_engine::JobOutput::PageLoaded {
                        index,
                        data,
                        size: 0,
                    })
                })
            }),
        }
    }

    /// 获取内存统计
    pub async fn memory_stats(&self) -> MemoryPoolStats {
        self.memory_pool.lock().await.stats()
    }
}
```

---

## 三、Tauri Commands

```rust
// src-tauri/src/commands/page_commands.rs

use crate::core::page_manager::{PageContentManager, MemoryPoolStats};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

pub struct PageManagerState {
    pub manager: Arc<Mutex<PageContentManager>>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookInfo {
    pub path: String,
    pub total_pages: usize,
    pub page_paths: Vec<String>,
}

/// 打开书籍
#[tauri::command]
pub async fn open_book(
    path: String,
    state: State<'_, PageManagerState>,
) -> Result<BookInfo, String> {
    let mut manager = state.manager.lock().await;
    let book = manager.open_book(&path).await?;
    
    Ok(BookInfo {
        path: book.path,
        total_pages: book.pages.len(),
        page_paths: book.pages,
    })
}

/// 跳转到指定页面
#[tauri::command]
pub async fn goto_page(
    page_index: usize,
    state: State<'_, PageManagerState>,
) -> Result<tauri::ipc::Response, String> {
    let mut manager = state.manager.lock().await;
    let data = manager.goto_page(page_index).await?;
    
    Ok(tauri::ipc::Response::new(data))
}

/// 获取内存统计
#[tauri::command]
pub async fn get_memory_stats(
    state: State<'_, PageManagerState>,
) -> Result<MemoryPoolStats, String> {
    let manager = state.manager.lock().await;
    Ok(manager.memory_stats().await)
}

/// 关闭书籍
#[tauri::command]
pub async fn close_book(
    state: State<'_, PageManagerState>,
) -> Result<(), String> {
    let mut manager = state.manager.lock().await;
    // TODO: 实现关闭逻辑
    Ok(())
}
```

---

## 四、前端简化

```typescript
// src/lib/api/pageManager.ts

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface BookInfo {
    path: string;
    totalPages: number;
    pagePaths: string[];
}

export interface MemoryStats {
    entryCount: number;
    totalSize: number;
    maxSize: number;
    usagePercent: number;
}

/**
 * 打开书籍 - 后端自动管理
 */
export async function openBook(path: string): Promise<BookInfo> {
    return invoke('open_book', { path });
}

/**
 * 跳转页面 - 后端自动预加载
 */
export async function gotoPage(index: number): Promise<Blob> {
    const buffer = await invoke<ArrayBuffer>('goto_page', { pageIndex: index });
    return new Blob([buffer]);
}

/**
 * 获取内存统计
 */
export async function getMemoryStats(): Promise<MemoryStats> {
    return invoke('get_memory_stats');
}

/**
 * 关闭书籍
 */
export async function closeBook(): Promise<void> {
    return invoke('close_book');
}

/**
 * 监听后端事件
 */
export function setupEventListeners() {
    listen<{ index: number }>('page_loaded', (event) => {
        console.log('Page loaded:', event.payload.index);
    });
    
    listen<{ current: number; limit: number }>('memory_pressure', (event) => {
        console.warn('Memory pressure:', event.payload);
    });
}
```

---

## 五、迁移检查清单

- [ ] 创建 `src-tauri/src/core/job_engine/` 目录结构
- [ ] 实现 `Job`, `JobScheduler`, `JobWorker`, `JobEngine`
- [ ] 创建 `src-tauri/src/core/page_manager/` 目录结构
- [ ] 实现 `MemoryPool`, `BookContext`, `PageContentManager`
- [ ] 添加 Tauri commands
- [ ] 前端移除 `imageReader.ts` 中的加载逻辑
- [ ] 更新 `bookStore` 为纯状态存储
- [ ] 测试预加载和驱逐策略
- [ ] 性能基准测试
