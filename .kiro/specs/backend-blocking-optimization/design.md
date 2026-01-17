# 设计文档：后端阻塞优化

## 概述

本设计文档描述了如何系统地优化 NeoView 后端中可能阻塞前端的操作。我们将采用多层次的优化策略，包括锁粒度优化、异步化改造、并发控制和性能监控。

## 架构

### 当前架构问题

1. **粗粒度锁**: `BookManager` 和 `ImageLoader` 使用 `Mutex<T>` 包装整个对象
2. **同步 I/O**: 文件读取和解压操作在命令处理线程中同步执行
3. **串行处理**: 缩略图生成和图像放大任务串行执行
4. **锁竞争**: 多个命令同时访问共享状态时产生竞争
5. **无请求去重**: 重复请求会导致重复计算

### 优化架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Svelte)                     │
└────────────────────────┬────────────────────────────────────┘
                         │ IPC (Tauri Commands)
┌────────────────────────┴────────────────────────────────────┐
│                    Command Layer (Async)                     │
│  - 快速返回，最小化持锁时间                                    │
│  - 使用 spawn_blocking 处理 CPU 密集型任务                    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────┐
│                   State Management Layer                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ BookManager  │  │ PageManager  │  │ArchiveManager│      │
│  │ (RwLock)     │  │ (细粒度锁)    │  │ (Clone)      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────┐
│                    Background Services                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Job Engine   │  │ Thumbnail    │  │ Upscale      │      │
│  │ (并发任务)    │  │ Service      │  │ Service      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## 组件和接口

### 1. 优化后的 BookManager

**问题**: 当前使用 `Mutex<BookManager>` 导致所有操作串行化

**解决方案**: 使用 `Arc<RwLock<BookState>>` + 无锁读取

```rust
// 新设计
pub struct BookManager {
    state: Arc<RwLock<BookState>>,
}

struct BookState {
    current_book: Option<BookInfo>,
    current_index: usize,
}

impl BookManager {
    // 读操作使用读锁
    pub async fn get_current_book(&self) -> Option<BookInfo> {
        let state = self.state.read().await;
        state.current_book.clone()
    }
    
    // 写操作使用写锁
    pub async fn open_book(&self, path: &str) -> Result<BookInfo, String> {
        let mut state = self.state.write().await;
        // ... 打开书籍逻辑
    }
}
```

**接口变更**:
- `State<'_, Mutex<BookManager>>` → `State<'_, BookManager>`
- 所有方法改为 `async fn`
- 内部使用 `RwLock` 而非 `Mutex`

### 2. 优化后的 PageManager

**问题**: `memory_pool` 的 `Mutex` 在高并发时成为瓶颈

**解决方案**: 使用分片锁 (Sharded Lock)

```rust
// 新设计
pub struct MemoryPool {
    shards: Vec<Mutex<PoolShard>>,
    shard_count: usize,
}

struct PoolShard {
    cache: HashMap<PageKey, CachedPage>,
    size_bytes: usize,
}

impl MemoryPool {
    fn get_shard(&self, key: &PageKey) -> &Mutex<PoolShard> {
        let hash = self.hash_key(key);
        let index = hash % self.shard_count;
        &self.shards[index]
    }
    
    pub fn get(&self, key: &PageKey) -> Option<CachedPage> {
        let shard = self.get_shard(key);
        let guard = shard.lock().unwrap();
        guard.cache.get(key).cloned()
    }
}
```

**优势**:
- 减少锁竞争：不同分片可以并发访问
- 提高吞吐量：多个线程可以同时读写不同分片
- 保持一致性：每个分片独立管理

### 3. 异步化 I/O 操作

**问题**: 同步文件读取阻塞 Tokio 运行时

**解决方案**: 使用 `spawn_blocking` 或 `tokio::fs`

```rust
// 旧代码
let data = std::fs::read(&path)?;

// 新代码
let data = tokio::task::spawn_blocking(move || {
    std::fs::read(&path)
}).await??;

// 或使用 tokio::fs
let data = tokio::fs::read(&path).await?;
```

**应用场景**:
- 文件系统读取
- 压缩包解压
- 图像解码
- 缩略图生成

### 4. ArchiveManager 克隆优化

**问题**: `Arc<Mutex<ArchiveManager>>` 导致串行解压

**解决方案**: 使 `ArchiveManager` 可克隆，每个任务使用独立实例

```rust
// 新设计
#[derive(Clone)]
pub struct ArchiveManager {
    // 无状态或使用 Arc 共享只读数据
}

impl ArchiveManager {
    pub fn load_image_from_archive_binary(
        &self,
        archive_path: &Path,
        inner_path: &str,
    ) -> Result<Vec<u8>, String> {
        // 每次调用打开新的压缩包句柄
        let mut handler = open_archive(archive_path)?;
        handler.read_entry_by_name(inner_path)
    }
}
```

**优势**:
- 无锁并发：每个任务独立操作
- 简化代码：无需管理锁
- 提高性能：并行解压多个文件

### 5. 请求去重机制

**问题**: 多个请求加载同一页面导致重复计算

**解决方案**: 使用 `DedupMap` 合并请求

```rust
use std::collections::HashMap;
use tokio::sync::oneshot;

pub struct DedupMap<K, V> {
    pending: Arc<Mutex<HashMap<K, Vec<oneshot::Sender<V>>>>>,
}

impl<K: Eq + Hash + Clone, V: Clone> DedupMap<K, V> {
    pub async fn get_or_load<F, Fut>(
        &self,
        key: K,
        loader: F,
    ) -> Result<V, String>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<V, String>>,
    {
        // 检查是否有正在进行的请求
        let (tx, rx) = oneshot::channel();
        let should_load = {
            let mut pending = self.pending.lock().unwrap();
            if let Some(waiters) = pending.get_mut(&key) {
                waiters.push(tx);
                false
            } else {
                pending.insert(key.clone(), vec![tx]);
                true
            }
        };
        
        if should_load {
            // 执行加载
            let result = loader().await;
            
            // 通知所有等待者
            let mut pending = self.pending.lock().unwrap();
            if let Some(waiters) = pending.remove(&key) {
                for waiter in waiters {
                    let _ = waiter.send(result.clone());
                }
            }
            
            result
        } else {
            // 等待结果
            rx.await.map_err(|_| "请求被取消".to_string())?
        }
    }
}
```

### 6. 缩略图并行生成

**问题**: 缩略图串行生成导致加载缓慢

**解决方案**: 使用 Rayon 并行处理

```rust
// 在 pm_preload_thumbnails 中已实现
use rayon::prelude::*;

let results = tokio::task::spawn_blocking(move || {
    pages_to_load
        .par_iter()
        .filter_map(|(index, page_info)| {
            // 并行生成缩略图
            generate_thumbnail(index, page_info)
        })
        .collect::<Vec<_>>()
}).await?;
```

**优化点**:
- 使用 CPU 核心数作为并行度
- 按距离中心排序，优先生成可见区域
- 使用 `spawn_blocking` 避免阻塞异步运行时

### 7. 数据库连接池

**问题**: 每次操作都获取锁，高并发时成为瓶颈

**解决方案**: 使用连接池或每线程连接

```rust
// 方案 1: 使用 r2d2 连接池
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;

pub struct ThumbnailDb {
    pool: Pool<SqliteConnectionManager>,
}

impl ThumbnailDb {
    pub fn new(path: &Path) -> Result<Self, String> {
        let manager = SqliteConnectionManager::file(path);
        let pool = Pool::new(manager)
            .map_err(|e| format!("创建连接池失败: {}", e))?;
        Ok(Self { pool })
    }
    
    pub fn get_thumbnail(&self, key: &str) -> Result<Option<Vec<u8>>, String> {
        let conn = self.pool.get()
            .map_err(|e| format!("获取连接失败: {}", e))?;
        // 查询操作
    }
}

// 方案 2: 每线程一个连接（使用 thread_local）
thread_local! {
    static DB_CONN: RefCell<Option<Connection>> = RefCell::new(None);
}
```

## 数据模型

### PageKey (保持不变)

```rust
#[derive(Debug, Clone, Hash, Eq, PartialEq)]
pub struct PageKey {
    book_path: String,
    page_index: usize,
}
```

### BookState (新增)

```rust
struct BookState {
    current_book: Option<BookInfo>,
    current_index: usize,
    sort_mode: PageSortMode,
    media_priority: MediaPriorityMode,
}
```

### PoolShard (新增)

```rust
struct PoolShard {
    cache: HashMap<PageKey, CachedPage>,
    size_bytes: usize,
    max_size_bytes: usize,
}
```

## 正确性属性

*属性是一种特征或行为，应该在系统的所有有效执行中保持为真——本质上是关于系统应该做什么的形式化陈述。属性作为人类可读规范和机器可验证正确性保证之间的桥梁。*

### 属性 1: 锁持有时间最小化

*对于任何* 命令处理函数，持有 Mutex 或 RwLock 的时间应该小于 1ms（不包括 I/O 操作）

**验证**: 需求 1.2, 2.3, 4.2

### 属性 2: 读操作并发性

*对于任何* 两个读取书籍信息的请求，它们应该能够并发执行而不互相阻塞

**验证**: 需求 2.1, 2.2, 2.4

### 属性 3: 异步 I/O 非阻塞

*对于任何* 文件读取操作，它应该在后台线程或异步任务中执行，不阻塞 Tokio 运行时

**验证**: 需求 3.1, 3.2, 3.3, 3.4

### 属性 4: 缓存访问并发性

*对于任何* 两个访问不同页面缓存的请求，它们应该能够并发执行（通过分片锁）

**验证**: 需求 4.1, 4.2, 4.4

### 属性 5: 压缩包并发解压

*对于任何* 两个从同一压缩包读取不同文件的请求，它们应该能够并发执行

**验证**: 需求 5.1, 5.3

### 属性 6: 缩略图并行生成

*对于任何* N 个缩略图生成请求，它们应该使用最多 min(N, CPU核心数) 个线程并行处理

**验证**: 需求 6.1

### 属性 7: 请求去重

*对于任何* 两个加载相同页面的并发请求，只应该执行一次实际加载操作

**验证**: 需求 9.1, 9.2, 9.3

### 属性 8: 任务取消及时性

*对于任何* 被取消的任务，它应该在 100ms 内停止执行并释放资源

**验证**: 需求 6.3, 7.2

### 属性 9: 资源限制

*对于任何* 时刻，并发执行的 CPU 密集型任务数量不应超过 CPU 核心数的 2 倍

**验证**: 需求 7.1

### 属性 10: 性能监控

*对于任何* 执行时间超过 100ms 的操作，应该记录详细的性能日志

**验证**: 需求 10.1, 10.2, 10.3

## 错误处理

### 锁获取失败

- **场景**: `try_lock` 失败或锁被毒化
- **处理**: 返回错误或使用默认值，记录警告日志
- **示例**: `is_page_cached` 使用 `try_lock`，失败时返回 `false`

### 异步任务失败

- **场景**: `spawn_blocking` 任务 panic 或超时
- **处理**: 捕获错误，记录日志，返回错误给前端
- **示例**: 图像解码失败时返回错误消息

### 请求去重冲突

- **场景**: 第一个请求失败，后续请求也会失败
- **处理**: 允许重试，清除失败的去重状态
- **示例**: 页面加载失败后，下次请求重新加载

### 资源耗尽

- **场景**: 内存不足或线程池满
- **处理**: 拒绝新请求，返回资源不足错误
- **示例**: 缓存满时驱逐旧页面

## 测试策略

### 单元测试

1. **锁粒度测试**: 验证读写锁的正确性
2. **分片锁测试**: 验证不同分片可以并发访问
3. **请求去重测试**: 验证重复请求只执行一次
4. **异步 I/O 测试**: 验证不阻塞运行时

### 集成测试

1. **并发加载测试**: 多个线程同时加载不同页面
2. **压力测试**: 大量并发请求测试锁竞争
3. **性能测试**: 测量优化前后的响应时间
4. **内存测试**: 验证无内存泄漏

### 性能基准

1. **锁持有时间**: 应 < 1ms
2. **页面加载时间**: 应 < 50ms (缓存命中), < 200ms (缓存未命中)
3. **缩略图生成**: 应 < 100ms/张
4. **并发吞吐量**: 应支持 100+ QPS

### 属性测试

使用 `proptest` 或 `quickcheck` 进行属性测试：

1. **并发安全性**: 多线程随机操作不应导致数据竞争
2. **缓存一致性**: 缓存内容应与实际文件一致
3. **请求去重正确性**: 去重结果应与非去重结果一致
