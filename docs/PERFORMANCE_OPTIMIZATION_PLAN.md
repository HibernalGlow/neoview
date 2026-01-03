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
