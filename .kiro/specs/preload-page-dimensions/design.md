# Design Document: Preload Page Dimensions

## Overview

本功能实现书籍打开时的页面尺寸预加载机制。通过在后台异步扫描所有页面的尺寸信息，并将结果缓存，使得前端在计算页面布局（如"横向视为双页"）时无需等待图片加载，大幅提升响应速度。

### 核心设计

1. **后端异步扫描**：使用 WIC（Windows）或 image crate 的快速尺寸读取 API，只读取图片头部
2. **渐进式通知**：通过 Tauri 事件系统实时通知前端尺寸更新
3. **持久化缓存**：使用 stable_hash 作为缓存键，跨会话复用尺寸信息
4. **可取消任务**：切换书籍时自动取消之前的扫描任务

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Svelte)                        │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐ │
│  │ bookStore       │◄───│ dimension       │◄───│ Tauri Event  │ │
│  │ (pages with     │    │ event handler   │    │ Listener     │ │
│  │  width/height)  │    └─────────────────┘    └──────────────┘ │
│  └─────────────────┘                                            │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Events: dimension-scan-progress
                              │         dimension-scan-complete
                              │
┌─────────────────────────────────────────────────────────────────┐
│                         Backend (Rust)                           │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐ │
│  │ BookManager     │───▶│ DimensionScanner│───▶│ DimensionCache│
│  │ (open_book)     │    │ (async scan)    │    │ (persistent) │ │
│  └─────────────────┘    └─────────────────┘    └──────────────┘ │
│                              │                                   │
│                              ▼                                   │
│                    ┌─────────────────┐                          │
│                    │ WIC / image     │                          │
│                    │ (header only)   │                          │
│                    └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

### 数据流

1. 用户打开书籍 → `open_book` 返回 BookInfo（尺寸可能为空）
2. 后台启动 `DimensionScanner` 异步扫描
3. 每扫描完一批页面，发送 `dimension-scan-progress` 事件
4. 前端收到事件，更新 `bookStore.pages` 中的尺寸
5. 扫描完成后发送 `dimension-scan-complete` 事件
6. 尺寸信息写入 `DimensionCache` 持久化

## Components and Interfaces

### 1. DimensionScanner (Rust)

```rust
/// 页面尺寸扫描器
pub struct DimensionScanner {
    /// 取消令牌
    cancel_token: Arc<AtomicBool>,
    /// 缓存引用
    cache: Arc<Mutex<DimensionCache>>,
}

impl DimensionScanner {
    /// 启动异步扫描
    pub async fn scan_book(
        &self,
        book_path: &str,
        pages: &[Page],
        app_handle: AppHandle,
    ) -> Result<ScanResult, String>;
    
    /// 取消扫描
    pub fn cancel(&self);
    
    /// 扫描单个页面尺寸
    fn scan_page_dimensions(
        &self,
        page: &Page,
        book_type: &BookType,
        book_path: &str,
    ) -> Option<(u32, u32)>;
}

/// 扫描结果
pub struct ScanResult {
    pub scanned_count: usize,
    pub cached_count: usize,
    pub failed_count: usize,
    pub duration_ms: u64,
}
```

### 2. DimensionCache (Rust)

```rust
/// 尺寸缓存（持久化到文件）
pub struct DimensionCache {
    /// 内存缓存: stable_hash -> (width, height, modified_time)
    entries: HashMap<String, DimensionEntry>,
    /// 缓存文件路径
    cache_path: PathBuf,
    /// 是否有未保存的更改
    dirty: bool,
}

#[derive(Serialize, Deserialize)]
pub struct DimensionEntry {
    pub width: u32,
    pub height: u32,
    pub modified: Option<i64>,
}

impl DimensionCache {
    /// 获取缓存的尺寸
    pub fn get(&self, stable_hash: &str, modified: Option<i64>) -> Option<(u32, u32)>;
    
    /// 设置尺寸
    pub fn set(&mut self, stable_hash: &str, width: u32, height: u32, modified: Option<i64>);
    
    /// 保存到文件
    pub fn save(&mut self) -> Result<(), String>;
    
    /// 从文件加载
    pub fn load(cache_path: &Path) -> Self;
}
```

### 3. Tauri 事件

```typescript
// 扫描进度事件
interface DimensionScanProgress {
    bookPath: string;
    updates: Array<{
        pageIndex: number;
        width: number;
        height: number;
    }>;
    progress: number; // 0.0 - 1.0
}

// 扫描完成事件
interface DimensionScanComplete {
    bookPath: string;
    scannedCount: number;
    cachedCount: number;
    failedCount: number;
    durationMs: number;
}
```

### 4. 前端 Store 更新

```typescript
// src/lib/stores/book.svelte.ts
export const bookStore = {
    // ... existing code ...
    
    /// 批量更新页面尺寸
    updatePageDimensionsBatch(updates: Array<{
        pageIndex: number;
        width: number;
        height: number;
    }>) {
        for (const update of updates) {
            if (this.currentBook?.pages[update.pageIndex]) {
                this.currentBook.pages[update.pageIndex].width = update.width;
                this.currentBook.pages[update.pageIndex].height = update.height;
            }
        }
    }
};
```

## Data Models

### DimensionEntry

| 字段 | 类型 | 描述 |
|------|------|------|
| width | u32 | 图片宽度（像素） |
| height | u32 | 图片高度（像素） |
| modified | Option<i64> | 文件修改时间（用于缓存失效） |

### ScanResult

| 字段 | 类型 | 描述 |
|------|------|------|
| scanned_count | usize | 实际扫描的页面数 |
| cached_count | usize | 从缓存命中的页面数 |
| failed_count | usize | 扫描失败的页面数 |
| duration_ms | u64 | 总耗时（毫秒） |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Dimension scan-cache round trip

*For any* valid image file, scanning its dimensions and caching the result, then retrieving from cache, SHALL produce the same width and height values.

**Validates: Requirements 1.2, 3.1, 3.2**

### Property 2: Available dimensions are used for layout

*For any* page with pre-scanned dimensions, when calculating page step or layout, the system SHALL use the available width and height values instead of falling back to default behavior.

**Validates: Requirements 1.3, 4.3**

### Property 3: Event updates match scanned values

*For any* dimension scan progress event, the width and height values in the event SHALL match the actual dimensions of the corresponding image files.

**Validates: Requirements 4.1, 4.2**

### Property 4: Cache invalidation on file change

*For any* cached dimension entry, if the file's modification time is newer than the cached entry's modified time, the system SHALL re-scan the file and update the cache.

**Validates: Requirements 3.4**

## Error Handling

### 扫描失败

- 单个页面扫描失败时，记录错误日志，继续扫描其他页面
- 页面的 width/height 保持为 None
- 前端使用默认行为（如步长为 2）

### 缓存损坏

- 缓存文件解析失败时，清空缓存重新扫描
- 记录警告日志

### 取消扫描

- 检查 cancel_token 在每个页面扫描前
- 已扫描的结果保留，未扫描的跳过
- 返回部分结果

## Testing Strategy

### 单元测试

1. `DimensionCache` 的 get/set/save/load 操作
2. `DimensionScanner::scan_page_dimensions` 对各种图片格式
3. 缓存失效逻辑（修改时间比较）

### 属性测试

使用 `proptest` 库进行属性测试：

```rust
use proptest::prelude::*;

proptest! {
    /// Property 1: Dimension scan-cache round trip
    /// **Feature: preload-page-dimensions, Property 1: Dimension scan-cache round trip**
    #[test]
    fn prop_dimension_cache_round_trip(
        hash in "[a-z0-9]{32}",
        width in 1u32..10000,
        height in 1u32..10000,
        modified in prop::option::of(0i64..i64::MAX),
    ) {
        let mut cache = DimensionCache::new_in_memory();
        cache.set(&hash, width, height, modified);
        
        let result = cache.get(&hash, modified);
        prop_assert_eq!(result, Some((width, height)));
    }
}
```

### 测试框架

- Rust 后端：`proptest` crate
- 每个属性测试运行至少 100 次迭代
- 测试注释格式：`**Feature: {feature_name}, Property {number}: {property_text}**`

