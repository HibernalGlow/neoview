# NeoView 性能优化计划

> 参考项目: OpenComic, NeeView, Spacedrive
> 创建日期: 2026-01-03

## 📊 当前架构分析

### 现有性能相关组件

| 组件              | 文件位置                      | 功能                        | 状态      |
| ----------------- | ----------------------------- | --------------------------- | --------- |
| LruImageCache     | `core/lru_image_cache.rs`     | LRU 图像缓存 + 内存压力感知 | ✅ 已实现 |
| StrettoCache      | `core/stretto_cache.rs`       | TinyLFU 缓存（更智能驱逐）  | ✅ 已实现 |
| ArchivePrefetcher | `core/archive_prefetcher.rs`  | 基于方向的智能预加载        | ✅ 已实现 |
| CustomProtocol    | `core/custom_protocol.rs`     | neoview:// 协议，避免序列化 | ✅ 已实现 |
| MmapCache         | `core/mmap_archive.rs`        | 内存映射文件缓存            | ✅ 已实现 |
| ArchiveIndexCache | `core/archive_index_cache.rs` | 压缩包索引缓存              | ✅ 已实现 |

### 参考项目优化策略对比

| 优化策略                  | OpenComic         | NeeView           | Spacedrive    | NeoView       |
| ------------------------- | ----------------- | ----------------- | ------------- | ------------- |
| **ZSTD 压缩缓存**         | ✅ 使用 node-zstd | ❌                | ❌            | ❌ 可添加     |
| **混合缓存（内存+磁盘）** | ✅ JSON内存+磁盘  | ✅ 内存+SQLite    | ✅ LRU+DB     | 🔶 部分       |
| **SQLite 缓存数据库**     | ❌                | ✅ ThumbnailCache | ✅ Prisma     | 🔶 部分       |
| **缓存过期策略**          | ✅ lastAccess     | ✅ DateTime       | ✅ TTL        | 🔶 部分       |
| **缓存大小限制**          | ✅ 可配置         | ✅ 可配置         | ✅ cache_size | ✅            |
| **延迟批量写入**          | ✅ DelayAction    | ✅ SaveQueue      | ❌            | ❌ 需添加     |
| **请求合并/去重**         | 🔶                | ✅                | ✅            | ❌ 需添加     |
| **LRU 缓存**              | ✅                | ✅                | ✅ mini_moka  | ✅            |
| **线程池管理**            | ✅ threads.job    | ✅                | ✅ tokio      | ✅ threadpool |

---

## 🚀 优化建议

### 优先级 1: 高影响 (立即实施)

#### 1.1 添加请求合并/去重机制

**问题**: 快速翻页时可能发送重复的加载请求

**参考**: Spacedrive 的 `custom_uri/mod.rs` 中的 LRU 缓存键

```rust
// 建议在 load_command_queue.rs 添加
use std::collections::HashSet;
use parking_lot::RwLock;

pub struct RequestDeduplicator {
    pending_requests: RwLock<HashSet<String>>,
}

impl RequestDeduplicator {
    pub fn should_process(&self, key: &str) -> bool {
        let mut pending = self.pending_requests.write();
        if pending.contains(key) {
            return false; // 已有相同请求在处理中
        }
        pending.insert(key.to_string());
        true
    }

    pub fn mark_complete(&self, key: &str) {
        self.pending_requests.write().remove(key);
    }
}
```

#### 1.2 延迟批量写入缩略图

**问题**: 每次生成缩略图都立即写入数据库，I/O 频繁

**参考**: NeeView 的 `ThumbnailCache.SaveQueue` 模式

```rust
// 建议添加到 thumbnail_service_v3/cache.rs
pub struct ThumbnailWriteQueue {
    queue: Mutex<HashMap<String, ThumbnailCacheItem>>,
    delay_action: DelayAction,
}

impl ThumbnailWriteQueue {
    pub fn enqueue(&self, key: String, item: ThumbnailCacheItem) {
        self.queue.lock().insert(key, item);
        self.delay_action.request(); // 延迟2秒后批量写入
    }

    fn flush(&self) {
        let queue = std::mem::take(&mut *self.queue.lock());
        // 批量写入数据库
        self.db.batch_insert(queue);
    }
}
```

#### 1.3 优化 Custom Protocol 缓存

**问题**: 每次请求都需要从注册表查询路径

**参考**: Spacedrive 的 `file_metadata_cache` 模式

```rust
// 在 custom_protocol.rs 中添加 LRU 缓存
use mini_moka::sync::Cache;

pub struct ProtocolState {
    // 现有字段...

    // 添加: 请求结果缓存 (避免重复查询)
    request_cache: Cache<String, CachedResponse>,
}

struct CachedResponse {
    data: Arc<Vec<u8>>,
    mime_type: String,
    created_at: Instant,
}
```

### 优先级 2: 中等影响 (计划实施)

#### 2.1 ZSTD 压缩磁盘缓存

**问题**: 磁盘缓存占用空间大，读写慢

**参考**: OpenComic 使用 `@toondepauw/node-zstd`

```rust
// 添加到 Cargo.toml
[dependencies]
zstd = "0.13"

// 在 cache_index_db.rs 中使用
use zstd::{encode_all, decode_all};

pub fn save_compressed(data: &[u8]) -> Result<Vec<u8>, Error> {
    encode_all(data, 5) // 压缩级别 5
}

pub fn load_compressed(data: &[u8]) -> Result<Vec<u8>, Error> {
    decode_all(data)
}
```

#### 2.2 智能预解码策略

**问题**: 预取的图片只缓存原始数据，不预解码

**参考**: NeeView 的 `SuperResolutionImageCache` 预解码模式

```rust
// 建议在 archive_prefetcher.rs 添加预解码选项
pub struct PrefetchConfig {
    // 现有字段...

    /// 是否预解码图片
    pub pre_decode: bool,
    /// 预解码目标格式
    pub decode_format: Option<ImageFormat>,
}
```

#### 2.3 缓存预热 (Warming)

**问题**: 冷启动时缓存为空，首次访问慢

**参考**: OpenComic 的 `cache.js` 启动时加载

```rust
// 添加到 startup_init.rs
pub async fn warm_up_cache(
    recent_books: Vec<PathBuf>,
    thumbnail_db: Arc<ThumbnailDb>,
) {
    // 预加载最近打开的书籍索引
    for book in recent_books.iter().take(5) {
        if let Ok(index) = load_archive_index(book).await {
            index_cache.insert(book.to_string_lossy().to_string(), index);
        }
    }
}
```

### 优先级 3: 低影响但推荐 (后续优化)

#### 3.1 缓存事件失效系统

**参考**: Spacedrive 的 `InvalidateOperationEvent`

```rust
// 添加到 core/mod.rs
pub enum CacheInvalidationEvent {
    /// 单个文件变更
    FileChanged(PathBuf),
    /// 目录变更
    DirectoryChanged(PathBuf),
    /// 全部失效
    InvalidateAll,
}

// 监听文件变更事件，自动清理缓存
```

#### 3.2 自适应缓存大小

**问题**: 静态缓存大小可能不适合所有机器

**参考**: NeoView 已有 `check_memory_pressure`

```rust
// 增强 lru_image_cache.rs
impl LruImageCache {
    pub fn auto_adjust_size(&self) {
        let sys = System::new_all();
        let available = sys.available_memory();
        let total = sys.total_memory();

        // 动态调整：使用可用内存的 30%
        let recommended = (available as f64 * 0.3) as usize;
        let max_allowed = (total as f64 * 0.5) as usize;

        let new_size = recommended.min(max_allowed);
        self.set_max_size(new_size / 1024 / 1024);
    }
}
```

#### 3.3 并行解码优化

**问题**: 单线程解码可能成为瓶颈

```rust
// 在 image_decoder 目录添加并行解码支持
use rayon::prelude::*;

pub fn decode_batch(images: Vec<&[u8]>) -> Vec<Result<DynamicImage, Error>> {
    images.par_iter()
        .map(|data| decode_image(data))
        .collect()
}
```

---

## 📐 实施路线图

### Phase 1: 快速胜利 (1-2天) ✅ 已完成

- [x] 1.1 请求合并/去重 → `core/request_dedup.rs` (使用 dashmap)
- [x] 1.3 Protocol 缓存优化 → `core/custom_protocol.rs` (使用 mini_moka)

### Phase 2: 核心优化 (3-5天)

- [x] 1.2 延迟批量写入 → `core/batch_write.rs` (使用 dashmap + tokio)
- [ ] 2.1 ZSTD 压缩
- [ ] 2.3 缓存预热

### Phase 3: 高级优化 (后续)

- [ ] 2.2 智能预解码
- [ ] 3.1 缓存失效系统
- [ ] 3.2 自适应缓存
- [ ] 3.3 并行解码

---

## 📈 预期收益

| 优化项        | 预期提升              | 影响范围     |
| ------------- | --------------------- | ------------ |
| 请求去重      | 减少 30-50% 冗余请求  | 快速翻页场景 |
| 批量写入      | 减少 70% I/O 操作     | 缩略图生成   |
| Protocol 缓存 | 减少 10-20ms 请求延迟 | 图片加载     |
| ZSTD 压缩     | 减少 60% 磁盘占用     | 长期使用     |
| 缓存预热      | 减少 50% 冷启动时间   | 应用启动     |

---

## 🔧 配置建议

在 `settings.rs` 中添加更多性能配置选项：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedPerformanceSettings {
    /// 磁盘缓存最大大小 (MB)
    pub disk_cache_size: u32,
    /// 磁盘缓存最大保留天数
    pub disk_cache_max_age_days: u32,
    /// 是否启用 ZSTD 压缩
    pub enable_zstd_compression: bool,
    /// 请求去重超时 (ms)
    pub request_dedup_timeout: u32,
    /// 批量写入延迟 (ms)
    pub batch_write_delay: u32,
    /// 预解码启用
    pub enable_pre_decode: bool,
}
```

---

## 📚 参考资料

- [OpenComic/scripts/cache.js](./ref/OpenComic/scripts/cache.js) - ZSTD 压缩、队列管理
- [NeeView/Thumbnail/ThumbnailCache.cs](./ref/NeeView/Thumbnail/ThumbnailCache.cs) - SQLite 缓存、延迟写入
- [NeeView/SuperResolution/SuperResolutionImageCache.cs](./ref/NeeView/SuperResolution/SuperResolutionImageCache.cs) - 混合缓存策略
- [Spacedrive/core/src/custom_uri/mod.rs](./ref/spacedrive/core/src/custom_uri/mod.rs) - LRU 元数据缓存、事件失效

---

## 🖥️ 前端加载延迟优化

### 当前架构分析

前端图片加载流程：

```
用户翻页 → BookStore.navigateToPage
        → ImageLoaderCore.loadPage
        → readPageBlobV2 (IPC/Protocol)
        → 后端 PageManager → 返回 ArrayBuffer
        → 创建 Blob → 渲染到 Canvas/Img
```

**延迟瓶颈（按影响排序）：**

| 环节                     | 典型延迟 | 问题                   |
| ------------------------ | -------- | ---------------------- |
| 后端加载 (backendLoadMs) | 30-150ms | 压缩包解压、大文件读取 |
| IPC 传输                 | 5-30ms   | 大图片序列化开销       |
| Blob 创建                | 1-5ms    | 内存拷贝               |
| 图片解码                 | 10-50ms  | 主线程阻塞             |

### 前端优化方案

#### F1. 翻页去抖 + 请求取消（高优先级）

**问题**: 快速翻页时生成大量请求，旧请求还在处理

**方案**: 在前端添加智能去抖

```typescript
// lib/utils/pageNavigation.ts
import { RequestDeduplicator } from './requestDedup';

const pageNavigationDedup = new RequestDeduplicator(100); // 100ms 窗口

export async function navigateToPageDebounced(index: number) {
	const key = `page-${index}`;
	if (!pageNavigationDedup.tryAcquire(key)) {
		return; // 跳过重复请求
	}
	try {
		await bookStore.navigateToPage(index);
	} finally {
		pageNavigationDedup.release(key);
	}
}
```

#### F2. 预解码缓存 ✅ 已实现

**位置**: `lib/stackview/stores/preDecodeCache.svelte.ts`

**已有功能**:

- `PreDecodeCacheStore` 类实现了完整的预解码逻辑
- LRU 淘汰策略（默认最多 20 张）
- 支持超分图替换原图预解码
- 响应式版本号触发 UI 更新
- 与 `renderQueue.ts` 集成的分层预加载

**集成点**:

- `stackImageLoader.ts` 调用 `preDecodeCache.preDecodeAndCache()`
- `renderQueue.ts` 使用 `preDecodeCache.has()` 检查缓存状态

#### F3. 请求优先级队列优化

**当前**: LoadQueue 只有 3 个优先级
**优化**: 使用更细粒度的优先级

```typescript
export const LoadPriority = {
	CRITICAL: 1000, // 当前页（必须立即加载）
	HIGH: 100, // 下一页/上一页
	NORMAL: 50, // 预加载（±3页）
	LOW: 10, // 远预加载（±5页）
	BACKGROUND: 1 // 缩略图
};
```

#### F4. Protocol 模式预取增强

**当前**: `preloadArchiveImages` 使用 `<link rel="prefetch">`
**优化**: 结合后端缓存状态，避免重复预取

```typescript
async function smartPreload(bookHash: string, currentPage: number) {
	// 1. 查询后端缓存状态
	const cacheStatus = await invoke<boolean[]>('get_page_cache_status', {
		bookHash,
		startPage: currentPage - 3,
		count: 7
	});

	// 2. 只预取未缓存的页面
	const pagesToPreload = cacheStatus
		.map((cached, i) => (cached ? null : currentPage - 3 + i))
		.filter((p) => p !== null);

	preloadArchiveImages(bookHash, pagesToPreload);
}
```

### 前后端衔接优化

#### B1. 后端缓存状态查询（低开销）

添加轻量级 IPC 命令查询缓存状态：

```rust
#[tauri::command]
pub fn get_page_cache_status(
    book_hash: &str,
    start_page: usize,
    count: usize,
) -> Vec<bool> {
    // 直接查询 PageCache，不读取数据
    (start_page..start_page + count)
        .map(|i| page_cache.contains(book_hash, i))
        .collect()
}
```

#### B2. 后端预加载完成事件

使用 Tauri 事件系统通知前端预加载完成：

```rust
// 后端
app.emit("preload_complete", PreloadEvent {
    book_hash,
    pages: vec![1, 2, 3]
});

// 前端监听
listen<PreloadEvent>('preload_complete', (event) => {
  // 更新 UI 状态，避免重复请求
  markPagesAsPreloaded(event.payload.pages);
});
```

#### B3. 流式传输大图片

对于 > 5MB 的图片，使用流式传输而不是一次性返回：

```typescript
// 前端
async function loadLargeImage(pageIndex: number) {
	const stream = await invoke<ReadableStream>('get_page_stream', { pageIndex });
	const reader = stream.getReader();
	// 分块读取，可显示进度
}
```

### 实施路线图

#### Phase 1: 快速修复（1天） ✅ 已完成

- [x] 后端请求去重 (`core/request_dedup.rs`)
- [x] Protocol 缓存 (`core/custom_protocol.rs`)
- [x] **前端翻页去抖**（`lib/stores/book/core.svelte.ts` + `lib/utils/requestDedup.ts`）

#### Phase 2: 核心优化（2-3天） ✅ 已完成

- [x] 后端批量写入 (`core/batch_write.rs`)
- [x] **前端 ImageBitmap 预解码** ← 项目已有 `preDecodeCache.svelte.ts`
- [x] **后端缓存状态查询** (`pm_get_cache_status` 命令 + 前端 API)

#### Phase 3: 进阶优化（后续）

- [ ] 预加载完成事件（Tauri 事件系统）
- [ ] 流式大图传输（> 5MB 分块）
- [ ] 请求优先级细化（5级优先级）

---

## 📊 预期延迟改进

| 场景         | 当前延迟 | 优化后   | 改进方式             |
| ------------ | -------- | -------- | -------------------- |
| 缓存命中翻页 | 10-30ms  | 5-10ms   | 预解码 ImageBitmap   |
| 首次加载     | 50-150ms | 30-80ms  | Protocol 缓存 + 去重 |
| 快速连续翻页 | 延迟累积 | 请求去重 | 前后端去抖           |
| 回翻已浏览页 | 50-100ms | 5-10ms   | 后端缓存 + 预解码    |
