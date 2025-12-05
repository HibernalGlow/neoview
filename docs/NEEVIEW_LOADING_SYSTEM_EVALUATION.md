# NeeView 加载系统复刻评估

## 参考版本
- **源码**: `ref/NeeView/NeeView/`
- **核心目录**: `JobEngine/`, `Page/`, `Book/`, `ViewSources/`, `PageFrames/`

---

## 一、NeeView 架构概览

### 1.1 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                      UI Layer (WPF)                         │
│  PageFrameContent → ViewContent → ImageContentControl       │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                   ViewSource Layer                          │
│  ViewSource ─── ViewSourceStrategy ─── PageDataSource       │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                   Page Layer                                │
│  Page ─── PageContent ─── PageSource ─── ArchiveEntry       │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                   Job Engine                                │
│  JobEngine ─── JobScheduler ─── JobWorker(N) ─── JobClient  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                   Memory Layer                              │
│  BookMemoryService ─── MemoryPool ─── IMemoryElement        │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| **JobEngine** | `JobEngine.cs` | 单例任务引擎，管理 Worker 池 |
| **JobScheduler** | `JobScheduler.cs` | 任务调度器，优先级队列 |
| **JobWorker** | `JobWorker.cs` | 工作线程，按优先级范围处理任务 |
| **JobClient** | `JobClient.cs` | 任务发起者（PageContent/Thumbnail） |
| **Page** | `Page.cs` | 页面实体，包含内容和缩略图 |
| **PageContent** | `PageContent.cs` | 页面内容抽象，异步加载 |
| **ViewSource** | `ViewSource.cs` | 视图数据源，转换为可显示格式 |
| **BookMemoryService** | `BookMemoryService.cs` | 内存管理，LRU 驱逐 |
| **MemoryPool** | `MemoryPool.cs` | 内存池，按 Owner 分组管理 |

---

## 二、核心设计模式

### 2.1 任务调度系统 (JobEngine)

```
JobClient.Order(pages) 
    → JobScheduler.Order(client, orders)
    → Queue 更新
    → QueueChanged 事件
    → JobWorker.FetchNextJob(minPriority, maxPriority)
    → Job.Execute()
```

**关键特性**:
- **多 Worker 并行**: 默认 2 个 Worker，可配置
- **优先级分层**: Primary Worker (10-99) 处理当前页面，Secondary Worker (0-9) 处理缩略图
- **动态取消**: 新请求会取消不再需要的旧任务
- **线程优先级**: Primary 用 Normal，Secondary 用 BelowNormal

```csharp
// JobWorker.cs - 优先级范围
if (IsPrimary) {
    _jobPriorityMin = 10;
    _jobPriorityMax = 99;
} else {
    _jobPriorityMin = 0;
    _jobPriorityMax = IsLimited ? 99 : 9;
}
```

### 2.2 页面内容加载 (PageContent)

```csharp
// PageContent.cs
public async ValueTask<PageDataSource> LoadAsync(CancellationToken token)
{
    using (await _asyncLock.LockAsync(token))
    {
        if (IsLoaded) return PageDataSource;  // 已加载直接返回
        
        var source = await LoadSourceAsync(token);  // 子类实现
        SetSource(source);
        return PageDataSource;
    }
}
```

**关键特性**:
- **异步锁保护**: 防止并发加载
- **加载状态检查**: `IsLoaded` 避免重复加载
- **CancellationToken 支持**: 可取消的加载

### 2.3 视图数据源 (ViewSource)

```csharp
// ViewSource.cs
public async ValueTask LoadAsync(Size size, CancellationToken token)
{
    using (await _asyncLock.LockAsync(token))
    {
        if (CheckLoaded(size)) return;  // 已加载且尺寸匹配
        
        var data = await _pageContent.LoadAsync(token);
        await LoadCoreAsync(data, size, token);  // 转换为显示格式
    }
}
```

**策略模式**:
```
ViewSourceStrategyFactory.Create(pageContent, data)
    → ImageViewSourceStrategy (图片)
    → MediaViewSourceStrategy (视频)
    → ArchiveViewSourceStrategy (压缩包封面)
    → ...
```

### 2.4 内存管理 (BookMemoryService + MemoryPool)

```csharp
// BookMemoryService.cs
public void Cleanup(int origin, int direction)
{
    _contentPool.Cleanup(LimitSize, new PageDistanceComparer(origin, direction));
}

// PageDistanceComparer - 距离驱逐策略
// 1. IsMemoryLocked 的元素优先保留
// 2. 当前方向上距离远的优先驱逐
// 3. 反方向的优先驱逐
```

**关键特性**:
- **按 Owner 分组**: 同一 Page 的多个元素一起管理
- **距离驱逐**: 当前页面附近的缓存优先保留
- **锁定机制**: `IsMemoryLocked` 防止正在使用的内容被驱逐

---

## 三、NeoView 复刻方案

### 3.1 后端架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    Rust Backend                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              JobEngine (Tokio Runtime)               │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐              │   │
│  │  │Worker 1 │  │Worker 2 │  │Worker N │              │   │
│  │  └────┬────┘  └────┬────┘  └────┬────┘              │   │
│  │       └──────────┬─┴────────────┘                    │   │
│  │                  ▼                                   │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │          JobScheduler (Priority Queue)         │  │   │
│  │  │   ┌─────────┐ ┌─────────┐ ┌───────────────┐   │  │   │
│  │  │   │Page Load│ │Preload  │ │Thumbnail Load │   │  │   │
│  │  │   │ Pri: 90 │ │ Pri: 50 │ │   Pri: 10     │   │  │   │
│  │  │   └─────────┘ └─────────┘ └───────────────┘   │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              PageContentManager                      │   │
│  │  ┌─────────────────────────────────────────────┐    │   │
│  │  │         MemoryPool (LRU + Distance)          │    │   │
│  │  │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐    │    │   │
│  │  │  │Page 5 │ │Page 6 │ │Page 7 │ │Page 8 │    │    │   │
│  │  │  │ 12MB  │ │ 8MB   │ │ 15MB  │ │ 10MB  │    │    │   │
│  │  │  └───────┘ └───────┘ └───────┘ └───────┘    │    │   │
│  │  └─────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              ArchiveManager (Enhanced)               │   │
│  │  - ZIP/RAR/7z 统一接口                              │   │
│  │  - 压缩包实例缓存                                    │   │
│  │  - 条目索引缓存                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ IPC (Binary Response)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Svelte)                        │
│  - 只发请求，不管理加载逻辑                                  │
│  - 接收 Blob 数据并渲染                                      │
│  - 通过事件监听状态变化                                      │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 核心模块设计

#### 3.2.1 JobEngine (Rust)

```rust
// src-tauri/src/core/job_engine/mod.rs

pub struct JobEngine {
    scheduler: Arc<Mutex<JobScheduler>>,
    workers: Vec<JoinHandle<()>>,
    shutdown_tx: broadcast::Sender<()>,
}

impl JobEngine {
    pub fn new(worker_count: usize) -> Self {
        let scheduler = Arc::new(Mutex::new(JobScheduler::new()));
        let (shutdown_tx, _) = broadcast::channel(1);
        
        let mut workers = Vec::with_capacity(worker_count);
        for i in 0..worker_count {
            let worker = JobWorker::new(
                i,
                Arc::clone(&scheduler),
                shutdown_tx.subscribe(),
            );
            workers.push(tokio::spawn(worker.run()));
        }
        
        Self { scheduler, workers, shutdown_tx }
    }
    
    pub fn submit(&self, job: Job) -> JobHandle {
        let mut scheduler = self.scheduler.lock().unwrap();
        scheduler.enqueue(job)
    }
}
```

#### 3.2.2 JobScheduler (Rust)

```rust
// src-tauri/src/core/job_engine/scheduler.rs

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum JobPriority {
    Thumbnail = 10,
    Preload = 50,
    CurrentPage = 90,
    Urgent = 100,
}

pub struct JobScheduler {
    queue: BinaryHeap<PrioritizedJob>,
    active_jobs: HashMap<String, CancellationToken>,
    notify: Arc<Notify>,
}

impl JobScheduler {
    pub fn enqueue(&mut self, job: Job) -> JobHandle {
        // 取消相同 key 的旧任务
        if let Some(old_token) = self.active_jobs.get(&job.key) {
            old_token.cancel();
        }
        
        let handle = JobHandle::new();
        let token = handle.cancellation_token.clone();
        self.active_jobs.insert(job.key.clone(), token);
        
        self.queue.push(PrioritizedJob { job, handle: handle.clone() });
        self.notify.notify_one();
        
        handle
    }
    
    pub async fn dequeue(&mut self, min_priority: JobPriority) -> Option<(Job, JobHandle)> {
        loop {
            if let Some(pj) = self.queue.peek() {
                if pj.job.priority >= min_priority {
                    let pj = self.queue.pop().unwrap();
                    return Some((pj.job, pj.handle));
                }
            }
            self.notify.notified().await;
        }
    }
}
```

#### 3.2.3 PageContentManager (Rust)

```rust
// src-tauri/src/core/page_content_manager.rs

pub struct PageContentManager {
    memory_pool: Arc<Mutex<MemoryPool>>,
    archive_manager: Arc<ArchiveManager>,
    current_book: Option<BookContext>,
}

pub struct MemoryPool {
    entries: HashMap<PageKey, CachedPage>,
    total_size: usize,
    max_size: usize,
}

impl MemoryPool {
    pub fn get(&mut self, key: &PageKey) -> Option<&CachedPage> {
        self.entries.get(key).map(|e| {
            e.last_accessed = Instant::now();
            e
        })
    }
    
    pub fn insert(&mut self, key: PageKey, data: Vec<u8>, page_index: usize) {
        let size = data.len();
        
        // 驱逐策略：距离驱逐
        while self.total_size + size > self.max_size {
            self.evict_farthest(page_index);
        }
        
        self.entries.insert(key, CachedPage {
            data,
            size,
            page_index,
            last_accessed: Instant::now(),
        });
        self.total_size += size;
    }
    
    fn evict_farthest(&mut self, current_index: usize) {
        // 找到距离当前页最远的未锁定条目
        let farthest_key = self.entries.iter()
            .filter(|(_, v)| !v.is_locked)
            .max_by_key(|(_, v)| (v.page_index as i32 - current_index as i32).abs())
            .map(|(k, _)| k.clone());
        
        if let Some(key) = farthest_key {
            if let Some(entry) = self.entries.remove(&key) {
                self.total_size -= entry.size;
            }
        }
    }
}
```

#### 3.2.4 Tauri Commands (简化的前端接口)

```rust
// src-tauri/src/commands/page_commands.rs

/// 打开书籍 - 后端自动管理页面加载
#[tauri::command]
pub async fn open_book(path: String, state: State<'_, AppState>) -> Result<BookInfo, String> {
    let mut manager = state.page_manager.lock().unwrap();
    manager.open_book(&path).await
}

/// 跳转到指定页面 - 后端自动预加载邻近页
#[tauri::command]
pub async fn goto_page(
    page_index: usize,
    state: State<'_, AppState>,
) -> Result<PageData, String> {
    let manager = state.page_manager.lock().unwrap();
    
    // 1. 提交当前页加载任务（高优先级）
    // 2. 提交预加载任务（中优先级）
    // 3. 返回页面数据（可能是缓存命中或等待加载）
    manager.goto_page(page_index).await
}

/// 获取页面图片数据
#[tauri::command]
pub async fn get_page_image(
    page_index: usize,
    state: State<'_, AppState>,
) -> Result<tauri::ipc::Response, String> {
    let manager = state.page_manager.lock().unwrap();
    let data = manager.get_page_data(page_index).await?;
    Ok(tauri::ipc::Response::new(data))
}

/// 订阅页面状态变化
#[tauri::command]
pub async fn subscribe_page_events(
    window: tauri::Window,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // 后端推送事件到前端
    // - page_loaded { index, size }
    // - page_unloaded { index }
    // - memory_pressure { current, limit }
    Ok(())
}
```

### 3.3 前端简化 (Svelte)

```typescript
// src/lib/stores/book.svelte.ts

interface BookState {
    path: string;
    pages: PageInfo[];
    currentIndex: number;
    loadingPages: Set<number>;
}

// 只负责状态展示，不管理加载逻辑
export const bookStore = createBookStore();

// src/lib/api/pageLoader.ts

export async function openBook(path: string): Promise<BookInfo> {
    return invoke('open_book', { path });
}

export async function gotoPage(index: number): Promise<void> {
    const pageData = await invoke('goto_page', { pageIndex: index });
    // 后端已自动处理预加载
    bookStore.setCurrentPage(index, pageData);
}

export async function getPageImage(index: number): Promise<Blob> {
    const buffer = await invoke<ArrayBuffer>('get_page_image', { pageIndex: index });
    return new Blob([buffer]);
}

// 监听后端事件
export function setupPageEventListener(window: Window) {
    listen('page_loaded', (event) => {
        bookStore.markPageLoaded(event.payload.index);
    });
    
    listen('page_unloaded', (event) => {
        bookStore.markPageUnloaded(event.payload.index);
    });
}
```

---

## 四、与现有系统对比

| 维度 | 现有 NeoView | 复刻方案 |
|------|-------------|---------|
| 加载逻辑 | 前端 (imageReader.ts) | **后端 (Rust)** |
| 任务调度 | 前端 Promise | **后端 JobEngine** |
| 预加载 | 前端触发 | **后端自动管理** |
| 缓存管理 | BlobRegistry (简单LRU) | **MemoryPool (距离驱逐)** |
| 取消机制 | 手动管理 | **自动取消旧任务** |
| 内存压力 | 无感知 | **主动驱逐 + 事件通知** |

---

## 五、实施计划

### Phase 1: 后端 JobEngine (预计 2-3 天)

1. **job_engine/mod.rs** - JobEngine 主模块
2. **job_engine/scheduler.rs** - 优先级调度器
3. **job_engine/worker.rs** - Worker 实现
4. **job_engine/job.rs** - Job 定义

### Phase 2: PageContentManager (预计 2-3 天)

1. **page_content_manager.rs** - 页面内容管理
2. **memory_pool.rs** - 内存池 + 距离驱逐
3. **book_context.rs** - 书籍上下文

### Phase 3: Tauri Commands (预计 1-2 天)

1. **commands/page_commands.rs** - 简化的 API
2. 事件推送机制

### Phase 4: 前端简化 (预计 1 天)

1. 移除 imageReader.ts 中的加载逻辑
2. 简化为纯状态展示

---

## 六、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Tokio 与 Tauri 集成 | 中 | 使用 tauri::async_runtime |
| 内存统计不准确 | 低 | 保守估算，留余量 |
| 前后端状态同步 | 中 | 使用事件推送机制 |
| 压缩包句柄泄露 | 高 | 严格的生命周期管理 |

---

## 七、总结

NeeView 的加载系统设计精妙，核心在于：

1. **后端主导**: 所有加载逻辑在后端，前端只是展示层
2. **优先级调度**: 当前页 > 预加载 > 缩略图
3. **智能驱逐**: 基于页面距离的缓存驱逐策略
4. **任务取消**: 新请求自动取消不再需要的旧任务

复刻该系统可以彻底解决 NeoView 当前的问题：
- 消除 Svelte 响应式系统的重复触发
- 统一缓存 key 管理
- 后端调度避免前端竞争
- 智能内存管理

**推荐方案**: 完整复刻 NeeView 的后端调度架构，前端简化为纯展示层。
