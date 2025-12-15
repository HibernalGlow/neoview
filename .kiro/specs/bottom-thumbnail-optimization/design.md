# Design Document: Bottom Thumbnail Bar Optimization

## Overview

本设计文档描述底栏缩略图加载速度优化的技术方案。参考 NeeView 的 `ThumbnailList` 和 `ListBoxThumbnailLoader` 实现，采用中央优先加载策略、任务队列管理和多级缓存机制来提升加载性能。

### 核心优化策略

1. **中央优先加载 (Center-Priority Loading)**: 优先加载当前页面附近的缩略图
2. **智能预加载 (Smart Preloading)**: 根据滚动方向预测并预加载
3. **请求取消机制 (Request Cancellation)**: 快速滚动时取消非可见区域请求
4. **批量 IPC (Batched IPC)**: 减少前后端通信开销
5. **多级缓存 (Multi-tier Cache)**: 内存 → IndexedDB → 后端数据库

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Frontend (Svelte/TypeScript)                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  BottomThumbnailBar.svelte                                          │
│       │                                                              │
│       ├── 可见性变化 → ThumbnailLoadController.onVisibilityChange() │
│       ├── 滚动事件 → ThumbnailLoadController.onScroll()             │
│       └── 页面变化 → ThumbnailLoadController.onPageChange()         │
│                                                                      │
│  ThumbnailLoadController (新增)                                      │
│       │                                                              │
│       ├── 中央优先排序                                               │
│       ├── 防抖处理 (100ms)                                          │
│       ├── 请求版本控制 (取消旧请求)                                  │
│       └── 批量请求合并                                               │
│                                                                      │
│  ThumbnailCacheStore (优化)                                          │
│       │                                                              │
│       ├── 内存缓存 (LRU, 100MB 上限)                                │
│       ├── IndexedDB 持久化                                          │
│       └── 加载状态追踪                                               │
│                                                                      │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ IPC (Tauri Events)
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        Backend (Rust/Tauri)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ThumbnailService (已有，优化)                                       │
│       │                                                              │
│       ├── preload_book_thumbnails() - 批量预加载                    │
│       ├── 中央优先任务调度                                           │
│       ├── 工作线程池 (8 threads)                                    │
│       └── 数据库缓存 (SQLite)                                       │
│                                                                      │
│  Events:                                                             │
│       ├── thumbnail-ready: 单个缩略图就绪                           │
│       └── thumbnail-batch-ready: 批量缩略图就绪 (新增)              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. ThumbnailLoadController (新增)

负责协调缩略图加载的核心控制器，参考 NeeView 的 `ListBoxThumbnailLoader`。

```typescript
interface ThumbnailLoadController {
  // 生命周期
  init(): Promise<void>;
  destroy(): void;
  
  // 事件处理
  onVisibilityChange(visible: boolean): void;
  onScroll(scrollLeft: number, containerWidth: number): void;
  onPageChange(pageIndex: number): void;
  onBookChange(bookPath: string): void;
  
  // 加载控制
  loadVisibleThumbnails(startIndex: number, endIndex: number): void;
  cancelPendingRequests(): void;
  
  // 配置
  setPreloadRange(range: number): void;
  setDebounceDelay(ms: number): void;
}

interface LoadControllerConfig {
  preloadRange: number;      // 预加载范围，默认 20
  debounceDelay: number;     // 防抖延迟，默认 100ms
  batchSize: number;         // 批量请求大小，默认 10
  maxConcurrent: number;     // 最大并发请求，默认 4
}
```

### 2. ThumbnailCacheStore (优化)

增强现有缓存存储，添加内存限制和 LRU 淘汰。

```typescript
interface ThumbnailCacheStore {
  // 现有方法保持不变
  getThumbnail(pageIndex: number): ThumbnailEntry | null;
  setThumbnail(pageIndex: number, url: string, width: number, height: number): void;
  hasThumbnail(pageIndex: number): boolean;
  
  // 新增方法
  getMemoryUsage(): number;
  evictLRU(targetBytes: number): void;
  setMemoryLimit(bytes: number): void;
  
  // 批量操作
  setThumbnailsBatch(entries: ThumbnailEntry[]): void;
  prefetch(pageIndices: number[]): Promise<number>;
}

interface ThumbnailEntry {
  url: string;
  width: number;
  height: number;
  timestamp: number;
  size: number;  // 新增：字节大小，用于内存管理
}
```

### 3. Backend API (优化)

```rust
// 新增批量预加载命令
#[tauri::command]
pub async fn preload_book_thumbnails(
    indices: Vec<usize>,
    center_index: usize,
    max_size: u32,
    state: State<'_, ThumbnailService>,
    app: AppHandle,
) -> Result<Vec<usize>, String>;

// 新增批量就绪事件
#[derive(Clone, Serialize)]
pub struct ThumbnailBatchReadyPayload {
    pub items: Vec<ThumbnailReadyItem>,
}

#[derive(Clone, Serialize)]
pub struct ThumbnailReadyItem {
    pub index: usize,
    pub data: String,  // base64 或 data URL
    pub width: u32,
    pub height: u32,
}
```

## Data Models

### 加载状态机

```
┌─────────┐    load()    ┌─────────┐    success    ┌─────────┐
│  IDLE   │ ──────────→  │ LOADING │ ──────────→   │ CACHED  │
└─────────┘              └─────────┘               └─────────┘
     ↑                        │                         │
     │                        │ failure                 │ evict
     │                        ↓                         ↓
     │                   ┌─────────┐              ┌─────────┐
     └───────────────────│ FAILED  │              │ EVICTED │
           retry         └─────────┘              └─────────┘
```

### 请求优先级

```typescript
enum LoadPriority {
  VISIBLE = 0,      // 当前可见区域
  ADJACENT = 1,     // 相邻页面 (±1)
  PRELOAD = 2,      // 预加载范围内
  BACKGROUND = 3,   // 后台预热
}

interface LoadRequest {
  pageIndex: number;
  priority: LoadPriority;
  distance: number;  // 距离当前页的距离
  timestamp: number;
  version: number;   // 请求版本，用于取消
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

基于 prework 分析，以下是需要验证的正确性属性：

### Property 1: Center-Priority Ordering
*For any* set of thumbnail load requests, the loading order SHALL be sorted by distance from the current page index (ascending), ensuring thumbnails closest to the center are loaded first.
**Validates: Requirements 1.2**

### Property 2: Cache Hit Returns Immediately
*For any* thumbnail that exists in the memory cache, calling `getThumbnail()` SHALL return the cached entry without triggering any network or IPC requests.
**Validates: Requirements 1.4, 6.1**

### Property 3: Debounce Coalesces Rapid Requests
*For any* sequence of scroll events within the debounce window (100ms), the system SHALL coalesce them into a single load request, preventing redundant operations.
**Validates: Requirements 2.1**

### Property 4: Request Cancellation on Directory Change
*For any* pending thumbnail requests, when the book changes, all pending requests for the old book SHALL be cancelled and not processed.
**Validates: Requirements 2.2, 3.4**

### Property 5: Preload Range Coverage
*For any* visible thumbnail bar with current page index N and preload range R, the system SHALL request thumbnails for all pages in the range [N-R, N+R] that are not already cached.
**Validates: Requirements 3.1**

### Property 6: LRU Eviction Under Memory Pressure
*For any* cache state where memory usage exceeds the configured limit (100MB), the system SHALL evict the least recently used thumbnails until usage falls below the limit.
**Validates: Requirements 5.1**

### Property 7: Cache Promotion on Database Hit
*For any* thumbnail loaded from the database cache, the system SHALL insert it into the memory cache for faster subsequent access.
**Validates: Requirements 6.3**

### Property 8: Non-Blocking UI Updates
*For any* thumbnail generation operation, the work SHALL be performed in background threads, and UI updates SHALL occur via event emission without blocking the main thread.
**Validates: Requirements 7.1, 7.2**

### Property 9: Batch Request Optimization
*For any* set of N thumbnail requests made within a batch window, the system SHALL combine them into ceil(N/batchSize) IPC calls, reducing communication overhead.
**Validates: Requirements 7.3**

### Property 10: Priority Queue Processing
*For any* set of queued thumbnail requests with different priorities, the system SHALL process them in priority order (VISIBLE > ADJACENT > PRELOAD > BACKGROUND).
**Validates: Requirements 3.2, 7.4**

## Error Handling

### 加载失败处理

1. **网络/IPC 错误**: 标记为 FAILED，显示错误占位符，不自动重试
2. **解码错误**: 记录到失败索引，避免重复尝试
3. **内存不足**: 触发 LRU 淘汰，降低预加载范围
4. **数据库损坏**: 清除损坏条目，重新生成缩略图

### 错误恢复策略

```typescript
interface ErrorRecoveryStrategy {
  // 失败后的重试策略
  maxRetries: number;           // 最大重试次数，默认 0（不重试）
  retryDelay: number;           // 重试延迟，默认 1000ms
  
  // 降级策略
  fallbackToPlaceholder: boolean;  // 失败时显示占位符
  reduceQualityOnMemoryPressure: boolean;  // 内存压力时降低质量
}
```

## Testing Strategy

### 单元测试

1. **ThumbnailLoadController**
   - 中央优先排序算法
   - 防抖逻辑
   - 请求版本控制

2. **ThumbnailCacheStore**
   - LRU 淘汰逻辑
   - 内存使用计算
   - 批量操作

### 属性测试 (Property-Based Testing)

使用 `fast-check` 库进行属性测试，每个属性测试运行至少 100 次迭代。

```typescript
// 示例：中央优先排序属性测试
// **Feature: bottom-thumbnail-optimization, Property 1: Center-Priority Ordering**
test('center-priority ordering', () => {
  fc.assert(
    fc.property(
      fc.array(fc.nat(1000)),  // 随机页面索引数组
      fc.nat(1000),            // 随机中心索引
      (indices, center) => {
        const sorted = sortByCenterPriority(indices, center);
        // 验证排序后的数组按距离中心的距离升序排列
        for (let i = 1; i < sorted.length; i++) {
          const prevDist = Math.abs(sorted[i-1] - center);
          const currDist = Math.abs(sorted[i] - center);
          expect(currDist).toBeGreaterThanOrEqual(prevDist);
        }
      }
    ),
    { numRuns: 100 }
  );
});
```

### 集成测试

1. **端到端加载流程**: 验证从请求到显示的完整流程
2. **缓存一致性**: 验证多级缓存之间的数据一致性
3. **并发安全**: 验证多个组件同时请求时的正确性

### 性能测试

1. **加载延迟**: 测量首次加载和缓存命中的延迟
2. **内存使用**: 监控缓存内存占用
3. **滚动流畅度**: 测量滚动时的帧率

