# 缩略图系统 V3 设计文档

> **复刻 NeeView 架构，后端为主，前端极简**

## 一、NeeView 架构分析

### 1.1 核心组件（源码分析）

| 组件 | 文件 | 职责 |
|------|------|------|
| **Thumbnail** | `Thumbnail.cs` | 持有缩略图数据 (byte[] → ImageSource) |
| **ThumbnailCache** | `ThumbnailCache.cs` | SQLite 数据库缓存 |
| **JobEngine** | `JobEngine.cs` | 后台任务调度器 |
| **PageThumbnailJobClient** | `JobClient.cs` | 任务客户端 |
| **ListBoxThumbnailLoader** | `ListBoxThumbnailLoader.cs` | UI 层触发器 |

### 1.2 NeeView 数据流

```
┌─────────────────────────────────────────────────────────────────────┐
│                           UI Layer                                   │
├─────────────────────────────────────────────────────────────────────┤
│  ListBox 滚动事件                                                    │
│       ↓                                                              │
│  ListBoxThumbnailLoader.Load()                                       │
│       ↓ 收集可见 ListBoxItem                                        │
│  _jobClient.Order(pages)  ──────────→  触发任务                      │
│       ↓                                                              │
│  [等待 PropertyChanged]  ←──────────  Thumbnail.Image 更新           │
│       ↓                                                              │
│  ImageSource 绑定显示                                                │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ ↑
┌─────────────────────────────────────────────────────────────────────┐
│                          Backend (JobEngine)                         │
├─────────────────────────────────────────────────────────────────────┤
│  JobEngine.Order() 接收任务                                          │
│       ↓                                                              │
│  IPageThumbnailLoader.LoadThumbnailAsync()                          │
│       ↓                                                              │
│  Thumbnail.InitializeFromCacheAsync()                               │
│       ↓                                                              │
│  ThumbnailCache.LoadAsync()  ──→  SQLite 数据库                     │
│       ↓ (未命中)                                                     │
│  PageThumbnail.LoadThumbnailAsync()  ──→  生成缩略图                │
│       ↓                                                              │
│  Thumbnail.Initialize(byte[])                                        │
│       ↓                                                              │
│  ThumbnailCache.EntrySaveQueue()  ──→  延迟保存到数据库             │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 NeeView 关键代码片段

#### ListBoxThumbnailLoader（前端触发）
```csharp
// 源码: ListBoxThumbnailLoader.cs 第 70-99 行
public void Load()
{
    if (!_panel.IsThumbnailVisible) return;
    if (!_panel.PageCollectionListBox.IsVisible) return;

    // 收集可见的 ListBoxItem
    var listBoxItems = VisualTreeUtility.FindVisualChildren<ListBoxItem>(_panel.PageCollectionListBox);
    var items = _panel.CollectPageList(listBoxItems.Select(i => i.DataContext)).ToList();
    var pages = items.Select(e => e.GetPage()).WhereNotNull().ToList();

    if (pages.Any())
    {
        _jobClient?.Order(pages.Cast<IPageThumbnailLoader>().ToList());
    }
}
```

#### Thumbnail（数据持有）
```csharp
// 源码: Thumbnail.cs 第 266-281 行
public async ValueTask InitializeFromCacheAsync(CancellationToken token)
{
    if (IsValid || !IsCacheEnabled) return;
    
    // 从数据库加载
    var image = await ThumbnailCache.Current.LoadAsync(_header, token);
    Image = image;  // 触发 PropertyChanged
}

// 源码: Thumbnail.cs 第 304-313 行
public void Initialize(byte[]? image)
{
    if (IsValid) return;
    Image = image ?? ThumbnailResource.EmptyImage;
    SaveCacheAsync();  // 异步保存到数据库
}
```

#### ThumbnailCache（数据库缓存）
```csharp
// 源码: ThumbnailCache.cs 第 194-222 行
internal async ValueTask<byte[]?> LoadAsync(ThumbnailCacheHeader header, CancellationToken token)
{
    var connection = Open();
    var record = connection != null ? await connection.LoadAsync(header, token) : null;
    
    if (record != null)
    {
        // 命中缓存，更新访问时间
        if ((header.AccessTime - record.DateTime).TotalDays > 1.0)
        {
            EntryUpdateQueue(header);
        }
        return record.Bytes;
    }
    
    // 从保存队列中查找（正在保存的）
    lock (_lockSaveQueue)
    {
        if (_saveQueue.TryGetValue(header.Key, out ThumbnailCacheItem? item))
        {
            return item.Body;
        }
    }
    
    return null;
}
```

---

## 二、neoview V3 架构设计

### 2.1 设计原则

1. **后端为主**：Rust 负责 90% 的逻辑
2. **前端极简**：只做两件事
   - 通知可见区域
   - 接收并显示 blob
3. **缓存直通**：已缓存的直接返回，零通信

### 2.2 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                      前端 (TypeScript/Svelte)                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  VirtualizedFileListV2.svelte                                        │
│       │                                                              │
│       ├── 滚动事件 → 计算可见范围 [startIndex, endIndex]            │
│       │                                                              │
│       └── invoke('request_visible_thumbnails', {                     │
│               paths: string[],      // 可见区域的路径（已排序）       │
│               currentDir: string,   // 当前目录                      │
│           })                                                         │
│                                                                      │
│  thumbnailStore.svelte.ts                                            │
│       │                                                              │
│       ├── thumbnails: Map<string, string>  // path → blob URL       │
│       │                                                              │
│       └── listen('thumbnail-ready', (path, blob) => {               │
│               const url = URL.createObjectURL(blob);                │
│               thumbnails.set(path, url);                            │
│           })                                                         │
│                                                                      │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ IPC
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        后端 (Rust/Tauri)                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ThumbnailService                                                    │
│       │                                                              │
│       ├── request_visible_thumbnails(paths, currentDir)             │
│       │       │                                                      │
│       │       ├── 1. 检查内存缓存 (LRU)                             │
│       │       │       ↓ 命中 → 立即 emit('thumbnail-ready')         │
│       │       │                                                      │
│       │       ├── 2. 检查数据库缓存 (SQLite)                        │
│       │       │       ↓ 命中 → emit + 更新内存缓存                  │
│       │       │                                                      │
│       │       └── 3. 未命中 → 入队生成任务                          │
│       │                                                              │
│       ├── ThumbnailGenerator (后台线程池)                           │
│       │       │                                                      │
│       │       ├── 生成缩略图 (image/archive/folder)                 │
│       │       ├── 保存到数据库                                       │
│       │       └── emit('thumbnail-ready', path, blob)               │
│       │                                                              │
│       └── DirectoryWatcher                                          │
│               │                                                      │
│               └── 目录切换时取消旧任务                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 前端接口设计

#### 2.3.1 IPC 命令列表

```typescript
// === 核心命令 ===

// 1. 请求可见区域缩略图（主要命令）
interface VisibleThumbnailRequest {
  paths: string[];       // 可见区域的路径列表（已按中央优先排序）
  currentDir: string;    // 当前目录
}
await invoke('request_visible_thumbnails', request);

// 2. 取消当前目录的请求（目录切换时调用）
await invoke('cancel_thumbnail_requests', { dir: string });

// 3. 直接从缓存获取（同步，用于已缓存的快速返回）
interface CachedThumbnail {
  path: string;
  blob: number[] | null;  // null 表示未缓存
}
const result = await invoke<CachedThumbnail[]>('get_cached_thumbnails', { 
  paths: string[] 
});

// === 辅助命令 ===

// 4. 预加载目录（后台预热）
await invoke('preload_directory_thumbnails', { 
  dir: string,
  depth: number  // 递归深度，默认 1
});

// 5. 清除缓存
await invoke('clear_thumbnail_cache', { 
  scope: 'all' | 'memory' | 'database' 
});

// 6. 获取缓存统计
interface CacheStats {
  memoryCount: number;
  memoryBytes: number;
  databaseCount: number;
  databaseBytes: number;
  queueLength: number;
  activeWorkers: number;
}
const stats = await invoke<CacheStats>('get_thumbnail_cache_stats');
```

#### 2.3.2 事件推送机制

**为什么使用事件推送？**

| 方式 | 优点 | 缺点 |
|------|------|------|
| **同步返回** | 简单 | 阻塞 UI，等待所有生成完成 |
| **轮询** | 简单 | 浪费资源，延迟高 |
| **事件推送** | 异步、实时、不阻塞 | 需要管理监听器 |

Tauri 的 `emit` 是标准的异步通信方式，类似 WebSocket：

```typescript
import { listen } from '@tauri-apps/api/event';

// 监听缩略图就绪事件
const unlisten = await listen<ThumbnailReadyEvent>('thumbnail-ready', (event) => {
  const { path, blob } = event.payload;
  
  // blob 是 number[] (Uint8Array)，转换为 Blob URL
  const blobUrl = URL.createObjectURL(
    new Blob([new Uint8Array(blob)], { type: 'image/webp' })
  );
  
  // 更新 store
  thumbnails.set(path, blobUrl);
});

// 组件卸载时取消监听
onDestroy(() => unlisten());

interface ThumbnailReadyEvent {
  path: string;
  blob: number[];  // Rust Vec<u8> 转为 JS number[]
}
```

**Rust 端 emit 示例：**

```rust
use tauri::Emitter;

fn emit_thumbnail_ready(app: &AppHandle, path: &str, blob: Vec<u8>) {
    // Tauri v2 的 emit 方法
    app.emit("thumbnail-ready", ThumbnailReadyPayload {
        path: path.to_string(),
        blob,
    }).unwrap_or_else(|e| {
        tracing::warn!("Failed to emit thumbnail: {}", e);
    });
}

#[derive(Clone, serde::Serialize)]
struct ThumbnailReadyPayload {
    path: String,
    blob: Vec<u8>,
}
```

#### 2.3.3 VirtualizedFileListV2 简化

```svelte
<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { debounce } from '$lib/utils/performance';
  
  // 可见区域变化时，只需通知后端
  const handleVisibleRangeChange = debounce(() => {
    if (!currentPath || items.length === 0) return;
    
    // 计算可见范围
    const startIndex = virtualItems[0].index * columns;
    const endIndex = Math.min((virtualItems[virtualItems.length - 1].index + 1) * columns - 1, items.length - 1);
    
    // 收集可见路径（中央优先排序）
    const center = Math.floor((startIndex + endIndex) / 2);
    const visiblePaths = [];
    for (let i = startIndex; i <= endIndex; i++) {
      visiblePaths.push({ path: items[i].path, dist: Math.abs(i - center) });
    }
    visiblePaths.sort((a, b) => a.dist - b.dist);
    
    // 只需调用这一个 IPC
    invoke('request_visible_thumbnails', {
      paths: visiblePaths.map(p => p.path),
      currentDir: currentPath
    });
  }, 100);
</script>
```

### 2.4 后端接口设计

#### 2.4.1 Rust Command

```rust
// src-tauri/src/thumbnail/commands.rs

#[tauri::command]
pub async fn request_visible_thumbnails(
    paths: Vec<String>,
    current_dir: String,
    state: State<'_, ThumbnailService>,
    app_handle: AppHandle,
) -> Result<(), String> {
    // 切换目录时取消旧任务
    state.set_current_directory(&current_dir);
    
    // 处理每个路径
    for path in paths {
        // 1. 检查内存缓存
        if let Some(blob) = state.memory_cache.get(&path) {
            emit_thumbnail_ready(&app_handle, &path, blob);
            continue;
        }
        
        // 2. 检查数据库缓存
        if let Some(blob) = state.db_cache.load(&path).await? {
            state.memory_cache.insert(path.clone(), blob.clone());
            emit_thumbnail_ready(&app_handle, &path, blob);
            continue;
        }
        
        // 3. 入队生成任务
        state.enqueue_generate(&path, &current_dir);
    }
    
    Ok(())
}

fn emit_thumbnail_ready(app: &AppHandle, path: &str, blob: Vec<u8>) {
    app.emit("thumbnail-ready", ThumbnailReadyPayload { path: path.to_string(), blob })
        .unwrap_or_else(|e| tracing::warn!("Failed to emit thumbnail: {}", e));
}
```

#### 2.4.2 ThumbnailService 结构

```rust
// src-tauri/src/thumbnail/service.rs

pub struct ThumbnailService {
    /// 内存缓存 (LRU)
    memory_cache: Arc<Mutex<LruCache<String, Vec<u8>>>>,
    
    /// 数据库连接
    db: Arc<ThumbnailDatabase>,
    
    /// 生成任务队列
    task_queue: Arc<Mutex<VecDeque<GenerateTask>>>,
    
    /// 当前目录
    current_dir: Arc<Mutex<String>>,
    
    /// 任务取消标记
    cancel_token: Arc<AtomicBool>,
    
    /// 后台工作线程
    workers: Vec<JoinHandle<()>>,
}

impl ThumbnailService {
    /// 设置当前目录（取消旧任务）
    pub fn set_current_directory(&self, dir: &str) {
        let mut current = self.current_dir.lock().unwrap();
        if *current != dir {
            // 取消旧目录的任务
            self.cancel_pending_tasks(&current);
            *current = dir.to_string();
        }
    }
    
    /// 入队生成任务
    pub fn enqueue_generate(&self, path: &str, dir: &str) {
        let task = GenerateTask {
            path: path.to_string(),
            directory: dir.to_string(),
            priority: 0, // 路径顺序就是优先级
        };
        
        let mut queue = self.task_queue.lock().unwrap();
        queue.push_back(task);
    }
    
    /// 后台工作线程
    fn worker_loop(&self, app: AppHandle) {
        loop {
            // 获取任务
            let task = {
                let mut queue = self.task_queue.lock().unwrap();
                queue.pop_front()
            };
            
            if let Some(task) = task {
                // 检查是否应该取消
                if task.directory != *self.current_dir.lock().unwrap() {
                    continue; // 跳过非当前目录的任务
                }
                
                // 生成缩略图
                match self.generate_thumbnail(&task.path) {
                    Ok(blob) => {
                        // 保存到数据库
                        self.db.save(&task.path, &blob).ok();
                        
                        // 更新内存缓存
                        self.memory_cache.lock().unwrap().put(task.path.clone(), blob.clone());
                        
                        // 发送到前端
                        emit_thumbnail_ready(&app, &task.path, blob);
                    }
                    Err(e) => {
                        tracing::debug!("Failed to generate thumbnail: {} - {}", task.path, e);
                    }
                }
            } else {
                // 队列为空，等待
                std::thread::sleep(Duration::from_millis(10));
            }
        }
    }
}
```

### 2.5 文件夹缩略图处理

参考 NeeView 的 `ArchivePageUtility.cs`：

```rust
// src-tauri/src/thumbnail/folder.rs

impl ThumbnailService {
    /// 生成文件夹缩略图（复刻 NeeView 策略）
    fn generate_folder_thumbnail(&self, folder_path: &str) -> Result<Vec<u8>> {
        // 配置：搜索深度（默认 2，参考 NeeView BookThumbnailDepth）
        let max_depth = 2;
        
        // 1. 查找封面图片
        if let Some(cover) = self.find_cover_image(folder_path)? {
            return self.generate_from_file(&cover);
        }
        
        // 2. 递归查找第一张图片/压缩包
        if let Some(first) = self.find_first_image_recursive(folder_path, max_depth)? {
            return self.generate_from_file(&first);
        }
        
        // 3. 返回文件夹占位图
        Ok(FOLDER_PLACEHOLDER.to_vec())
    }
    
    /// 查找封面图片（cover.*, folder.*, thumb.*）
    fn find_cover_image(&self, folder: &str) -> Result<Option<String>> {
        let patterns = ["cover", "folder", "thumb"];
        let entries = std::fs::read_dir(folder)?;
        
        for entry in entries {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().to_lowercase();
            
            for pattern in &patterns {
                if name.starts_with(pattern) && is_image_file(&name) {
                    return Ok(Some(entry.path().to_string_lossy().to_string()));
                }
            }
        }
        
        Ok(None)
    }
    
    /// 递归查找第一张图片
    fn find_first_image_recursive(&self, folder: &str, depth: u32) -> Result<Option<String>> {
        if depth == 0 { return Ok(None); }
        
        let entries = std::fs::read_dir(folder)?;
        
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            
            if path.is_file() {
                let name = path.file_name().unwrap().to_string_lossy();
                if is_image_file(&name) || is_archive_file(&name) {
                    return Ok(Some(path.to_string_lossy().to_string()));
                }
            } else if path.is_dir() {
                // 递归子目录
                if let Some(found) = self.find_first_image_recursive(
                    &path.to_string_lossy(), 
                    depth - 1
                )? {
                    return Ok(Some(found));
                }
            }
        }
        
        Ok(None)
    }
}
```

---

## 三、迁移计划

### Phase 1: 后端实现

| 步骤 | 任务 | 文件 |
|------|------|------|
| 1 | 创建 ThumbnailService | `src-tauri/src/thumbnail/service.rs` |
| 2 | 实现内存缓存 (LRU) | `src-tauri/src/thumbnail/cache.rs` |
| 3 | 实现 `request_visible_thumbnails` 命令 | `src-tauri/src/thumbnail/commands.rs` |
| 4 | 实现文件夹缩略图生成 | `src-tauri/src/thumbnail/folder.rs` |
| 5 | 实现后台工作线程 | `src-tauri/src/thumbnail/worker.rs` |

### Phase 2: 前端简化

| 步骤 | 任务 | 文件 |
|------|------|------|
| 1 | 创建 thumbnailStore | `src/lib/stores/thumbnailStore.svelte.ts` |
| 2 | 简化 VirtualizedFileListV2 | `VirtualizedFileListV2.svelte` |
| 3 | 删除 FolderThumbnailLoader.ts | - |
| 4 | 删除 VisibleThumbnailLoader.ts | - |
| 5 | 简化 thumbnailManager.ts | 只保留内存缓存 |

### Phase 3: 测试验证

| 测试项 | 预期结果 |
|--------|----------|
| 滚动时缩略图加载 | 中央优先，快速响应 |
| 目录切换 | 旧任务取消，新目录加载 |
| 文件夹缩略图 | 查找封面/第一张图 |
| 数据库缓存命中 | 直接返回，无生成 |
| 内存缓存命中 | 零 IPC 通信 |

---

## 四、对比总结

| 方面 | 当前实现 | V3 设计 |
|------|----------|---------|
| 缩略图生成 | 前端调用 IPC 生成 | 后端异步生成 |
| 缓存检查 | 前端检查 + 后端检查（重复） | 后端统一检查 |
| 任务调度 | 前端 TaskQueue | 后端线程池 |
| 文件夹扫描 | 前端调用 FileSystemAPI | 后端直接文件系统 |
| IPC 通信量 | 高（每个缩略图多次调用） | 低（一次请求，事件推送） |
| 代码量 | 前端 1500+ 行 | 前端 100 行，后端 500 行 |

---

## 五、配置参数（已确认）

| 参数 | 值 | 说明 |
|------|------|------|
| **文件夹搜索深度** | 2 层 | 参考 NeeView `BookThumbnailDepth` |
| **LRU 缓存大小** | 1024 | 内存缓存最多 1024 个缩略图 |
| **后台线程数** | 8 | 并行生成缩略图 |
| **缩略图尺寸** | 256x256 | WebP 格式 |
| **数据库延迟保存** | 2秒 | 参考 NeeView DelayAction |

```rust
// src-tauri/src/thumbnail/config.rs

pub struct ThumbnailConfig {
    /// 文件夹搜索深度
    pub folder_search_depth: u32,      // 2
    
    /// LRU 内存缓存大小
    pub memory_cache_size: usize,      // 1024
    
    /// 后台工作线程数
    pub worker_threads: usize,         // 8
    
    /// 缩略图尺寸
    pub thumbnail_size: u32,           // 256
    
    /// 数据库延迟保存时间 (毫秒)
    pub db_save_delay_ms: u64,         // 2000
}

impl Default for ThumbnailConfig {
    fn default() -> Self {
        Self {
            folder_search_depth: 2,
            memory_cache_size: 1024,
            worker_threads: 8,
            thumbnail_size: 256,
            db_save_delay_ms: 2000,
        }
    }
}

---

## 六、实现进度

### Phase 1: Rust 后端实现 ✅ 完成

| 任务 | 文件 | 状态 |
|------|------|------|
| ThumbnailServiceConfig | `src-tauri/src/core/thumbnail_service_v3.rs` | ✅ |
| ThumbnailServiceV3 + LRU 缓存 | `src-tauri/src/core/thumbnail_service_v3.rs` | ✅ |
| 7 个 IPC 命令 | `src-tauri/src/commands/thumbnail_v3_commands.rs` | ✅ |
| 8 线程工作池 | `ThumbnailServiceV3::start()` | ✅ |
| 文件夹缩略图生成 | `generate_folder_thumbnail_static()` | ✅ |

### Phase 2: 前端简化 ✅ 完成

| 任务 | 文件 | 状态 |
|------|------|------|
| 创建 thumbnailStoreV3 | `src/lib/stores/thumbnailStoreV3.svelte.ts` | ✅ |
| 兼容层 thumbnailManager | `src/lib/utils/thumbnailManager.ts` | ✅ |
| 集成 VirtualizedFileListV2 | `VirtualizedFileListV2.svelte` | ✅ |
| 连接 fileBrowserStore | 事件推送同步 | ✅ |

### 新增文件

```
src-tauri/src/core/thumbnail_service_v3.rs     # 核心服务
src-tauri/src/commands/thumbnail_v3_commands.rs # IPC 命令
src/lib/stores/thumbnailStoreV3.svelte.ts       # 前端 store
```
