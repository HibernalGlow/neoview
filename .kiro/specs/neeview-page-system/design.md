# Design Document: NeeView Page System

## Overview

本设计文档描述了 NeoView 页面系统的彻底重构方案，目标是完整复刻 NeeView 的页面管理架构和加载系统。

### 设计原则

1. **后端主导** - 所有加载逻辑在 Rust 后端，前端只负责展示
2. **优先级调度** - 当前页 > 预加载 > 缩略图
3. **智能驱逐** - 基于页面距离和阅读方向的缓存驱逐策略
4. **任务取消** - 新请求自动取消不再需要的旧任务
5. **三层架构** - Page → PageFrameElement → PageFrame

## Architecture

### 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Svelte)                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              StackViewer Component                   │   │
│  │  - Layer-based rendering (prev/current/next)        │   │
│  │  - CSS clip-path for split pages                    │   │
│  │  - Blob URL management                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
│  ┌─────────────────────────▼─────────────────────────────┐ │
│  │              PageFrameStore (Svelte 5)                │ │
│  │  - Current frame state                                │ │
│  │  - Navigation methods                                 │ │
│  │  - Event listeners                                    │ │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             │ IPC (Binary Response)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Rust Backend                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │              JobEngine (Tokio Runtime)               │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐              │   │
│  │  │Primary 1│  │Primary 2│  │Secondary│              │   │
│  │  │ >=10    │  │ >=10    │  │ 0-99    │              │   │
│  │  └────┬────┘  └────┬────┘  └────┬────┘              │   │
│  │       └──────────┬─┴────────────┘                    │   │
│  │                  ▼                                   │   │
│  │  ┌───────────────────────────────────────────────┐  │   │
│  │  │          JobScheduler (Priority Queue)         │  │   │
│  │  │   CurrentPage=90 > Preload=50 > Thumbnail=10  │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              PageContentManager                      │   │
│  │  ┌─────────────────────────────────────────────┐    │   │
│  │  │         MemoryPool (Distance Eviction)       │    │   │
│  │  │  - Page data cache                           │    │   │
│  │  │  - Lock mechanism                            │    │   │
│  │  │  - Direction-aware eviction                  │    │   │
│  │  └─────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              PageFrameBuilder                        │   │
│  │  - Page → PageFrameElement → PageFrame              │   │
│  │  - Split page handling                              │   │
│  │  - Double page pairing                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              BookContext                             │   │
│  │  - Current book state                               │   │
│  │  - Page list management                             │   │
│  │  - Settings (divide, wide, direction)               │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 模块结构

```
src-tauri/src/core/
├── job_engine/
│   ├── mod.rs              # JobEngine 主入口
│   ├── job.rs              # Job 定义和优先级
│   ├── scheduler.rs        # JobScheduler 优先级队列
│   ├── worker.rs           # JobWorker 工作线程
│   └── handle.rs           # JobHandle 结果获取
├── page_manager/
│   ├── mod.rs              # PageContentManager
│   ├── memory_pool.rs      # MemoryPool 距离驱逐
│   ├── book_context.rs     # BookContext 书籍上下文
│   └── preload.rs          # PreloadPipeline 预加载
├── page_frame/
│   ├── mod.rs              # PageFrame 相关类型
│   ├── page.rs             # Page 页面实体
│   ├── element.rs          # PageFrameElement 帧元素
│   ├── frame.rs            # PageFrame 页面帧
│   ├── position.rs         # PagePosition 页面位置
│   ├── range.rs            # PageRange 页面范围
│   └── builder.rs          # PageFrameBuilder 帧构建器
└── commands/
    └── page_commands.rs    # Tauri Commands

src/lib/
├── stores/
│   └── pageFrame.svelte.ts # PageFrameStore 前端状态
├── viewer/
│   ├── StackViewer.svelte  # 层叠式查看器
│   └── types/
│       └── frameSlot.ts    # 帧槽类型定义
└── api/
    └── pageManager.ts      # 后端 API 封装
```

## Components and Interfaces

### 1. JobEngine 模块

#### Job 定义

```rust
/// 任务优先级
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum JobPriority {
    Thumbnail = 10,      // 缩略图加载
    Preload = 50,        // 预加载页面
    CurrentPage = 90,    // 当前页面加载
    Urgent = 100,        // 紧急任务
}

/// 任务类别
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobCategory {
    PageContent,
    Thumbnail,
    ArchiveScan,
}

/// 任务定义
pub struct Job {
    pub key: String,                    // 唯一标识（用于去重和取消）
    pub priority: JobPriority,
    pub category: JobCategory,
    pub executor: BoxedExecutor,        // 异步执行器
}
```

#### JobScheduler 接口

```rust
pub struct JobScheduler {
    queue: BinaryHeap<PrioritizedJob>,
    active_tokens: HashMap<String, CancellationToken>,
}

impl JobScheduler {
    /// 入队任务（自动取消相同 key 的旧任务）
    pub fn enqueue(&mut self, job: Job) -> (CancellationToken, u64);
    
    /// 批量入队
    pub fn enqueue_batch(&mut self, jobs: Vec<Job>) -> Vec<(CancellationToken, u64)>;
    
    /// 取消指定前缀的所有任务
    pub fn cancel_by_prefix(&mut self, prefix: &str);
    
    /// 获取下一个任务（按优先级范围）
    pub async fn dequeue(&mut self, min_priority: JobPriority) -> Option<(Job, CancellationToken)>;
}
```

### 2. PageContentManager 模块

#### MemoryPool 接口

```rust
pub struct MemoryPool {
    entries: HashMap<PageKey, CachedPage>,
    total_size: usize,
    max_size: usize,
}

impl MemoryPool {
    /// 获取缓存页面（更新访问时间）
    pub fn get(&mut self, key: &PageKey) -> Option<&CachedPage>;
    
    /// 插入页面（自动驱逐）
    pub fn insert(&mut self, key: PageKey, data: Vec<u8>, current_index: usize, direction: i32);
    
    /// 锁定页面（防止驱逐）
    pub fn lock(&mut self, key: &PageKey);
    
    /// 解锁页面
    pub fn unlock(&mut self, key: &PageKey);
    
    /// 清除指定书籍的缓存
    pub fn clear_book(&mut self, book_path: &str);
}
```

#### 距离驱逐策略

```rust
/// 计算驱逐优先级（越大越优先驱逐）
fn evict_priority(page_index: usize, current_index: usize, direction: i32) -> i32 {
    let diff = page_index as i32 - current_index as i32;
    
    if direction > 0 {
        // 向前阅读：后面的页面优先保留
        if diff < 0 { -diff + 1000 }  // 已过去的页面，高优先级驱逐
        else { 1000 - diff }           // 前面的页面，距离越近优先级越低
    } else {
        // 向后阅读：前面的页面优先保留
        if diff > 0 { diff + 1000 }
        else { 1000 + diff }
    }
}
```

### 3. PageFrame 模块

#### PagePosition 和 PageRange

```rust
/// 页面位置（支持分割页面）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PagePosition {
    pub index: usize,    // 物理页面索引
    pub part: u8,        // 分割部分（0=左/完整，1=右）
}

/// 页面范围
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PageRange {
    pub min: PagePosition,
    pub max: PagePosition,
}

impl PageRange {
    /// 是否为单页
    pub fn is_one_page(&self) -> bool;
    
    /// 获取下一个位置
    pub fn next(&self) -> PagePosition;
    
    /// 合并多个范围
    pub fn merge(ranges: impl Iterator<Item = PageRange>) -> PageRange;
}
```

#### PageFrameElement

```rust
/// 页面帧元素
#[derive(Debug, Clone)]
pub struct PageFrameElement {
    pub page: Page,              // 引用的页面
    pub page_range: PageRange,   // 页面范围
    pub is_dummy: bool,          // 是否为占位元素
    pub crop_rect: Option<Rect>, // 裁剪区域（分割页面）
}

impl PageFrameElement {
    /// 是否为横向页面
    pub fn is_landscape(&self) -> bool;
    
    /// 获取显示宽度
    pub fn width(&self) -> f64;
    
    /// 获取显示高度
    pub fn height(&self) -> f64;
}
```

#### PageFrame

```rust
/// 页面帧（不可变）
#[derive(Debug, Clone)]
pub struct PageFrame {
    elements: Vec<PageFrameElement>,
    frame_range: PageRange,
    direction: i32,
    angle: f64,           // 自动旋转角度
    scale: f64,           // 拉伸缩放
    size: Size,           // 最终显示尺寸
}

impl PageFrame {
    /// 创建单页帧
    pub fn single(element: PageFrameElement, direction: i32, calculator: &ContentSizeCalculator) -> Self;
    
    /// 创建双页帧
    pub fn double(e1: PageFrameElement, e2: PageFrameElement, direction: i32, calculator: &ContentSizeCalculator) -> Self;
    
    /// 是否包含指定页面
    pub fn contains(&self, position: PagePosition) -> bool;
    
    /// 获取按方向排序的元素
    pub fn get_directed_elements(&self) -> impl Iterator<Item = &PageFrameElement>;
}
```

### 4. PageFrameBuilder

```rust
/// 页面帧构建器
pub struct PageFrameBuilder {
    pages: Vec<Page>,
    context: PageFrameContext,
}

impl PageFrameBuilder {
    /// 构建指定位置的帧
    pub fn build_frame(&self, position: PagePosition) -> PageFrame;
    
    /// 获取下一帧位置
    pub fn next_frame_position(&self, current: PagePosition) -> Option<PagePosition>;
    
    /// 获取上一帧位置
    pub fn prev_frame_position(&self, current: PagePosition) -> Option<PagePosition>;
    
    /// 计算总虚拟页数
    pub fn total_virtual_pages(&self) -> usize;
}
```

### 5. PageFrameContext

```rust
/// 页面帧上下文配置
#[derive(Debug, Clone)]
pub struct PageFrameContext {
    pub page_mode: PageMode,              // 单页/双页
    pub read_order: ReadOrder,            // LTR/RTL
    pub is_supported_divide_page: bool,   // 是否分割横向页面
    pub is_supported_wide_page: bool,     // 横向页面是否独占
    pub is_supported_single_first: bool,  // 首页是否单独显示
    pub is_supported_single_last: bool,   // 末页是否单独显示
    pub divide_page_rate: f64,            // 分割阈值（默认 1.0）
    pub auto_rotate: AutoRotateType,      // 自动旋转模式
    pub stretch_mode: StretchMode,        // 拉伸模式
    pub canvas_size: Size,                // 画布尺寸
}
```

### 6. 前端 API

```typescript
// src/lib/api/pageManager.ts

export interface BookInfo {
    path: string;
    totalPages: number;
    totalVirtualPages: number;
    pagePaths: string[];
}

export interface PageFrameInfo {
    elements: PageFrameElementInfo[];
    frameRange: PageRangeInfo;
    size: { width: number; height: number };
    angle: number;
    scale: number;
}

export interface PageFrameElementInfo {
    pageIndex: number;
    part: number;
    cropRect?: { x: number; y: number; width: number; height: number };
    isLandscape: boolean;
}

// 打开书籍
export async function openBook(path: string): Promise<BookInfo>;

// 跳转到指定位置
export async function gotoPosition(position: PagePosition): Promise<PageFrameInfo>;

// 获取页面图片数据
export async function getPageImage(pageIndex: number): Promise<Blob>;

// 下一帧
export async function nextFrame(): Promise<PageFrameInfo>;

// 上一帧
export async function prevFrame(): Promise<PageFrameInfo>;

// 更新上下文配置
export async function updateContext(context: Partial<PageFrameContext>): Promise<void>;
```

## Data Models

### 后端数据模型

```rust
/// 页面实体
#[derive(Debug, Clone, Serialize)]
pub struct Page {
    pub index: usize,
    pub path: String,
    pub inner_path: Option<String>,
    pub name: String,
    pub size: u64,
    pub width: u32,
    pub height: u32,
    pub aspect_ratio: f64,
}

/// 缓存页面
#[derive(Debug)]
pub struct CachedPage {
    pub data: Vec<u8>,
    pub page_index: usize,
    pub size: usize,
    pub last_accessed: Instant,
    pub is_locked: bool,
}

/// 书籍上下文
#[derive(Debug)]
pub struct BookContext {
    pub path: String,
    pub pages: Vec<Page>,
    pub current_position: PagePosition,
    pub read_direction: i32,
}
```

### 前端数据模型

```typescript
// src/lib/stores/pageFrame.svelte.ts

interface PageFrameState {
    book: BookInfo | null;
    currentFrame: PageFrameInfo | null;
    currentPosition: PagePosition;
    loading: boolean;
    error: string | null;
    context: PageFrameContext;
}

interface PagePosition {
    index: number;
    part: number;  // 0 = left/full, 1 = right
}

interface PageFrameContext {
    pageMode: 'single' | 'double';
    readOrder: 'ltr' | 'rtl';
    isSupportedDividePage: boolean;
    isSupportedWidePage: boolean;
    isSupportedSingleFirst: boolean;
    isSupportedSingleLast: boolean;
    dividePageRate: number;
    autoRotate: 'none' | 'left' | 'right';
    stretchMode: 'uniform' | 'uniformToFill' | 'uniformToVertical' | 'uniformToHorizontal';
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Job Priority Ordering
*For any* set of jobs with different priorities submitted to the JobScheduler, the jobs SHALL be processed in descending priority order (higher priority first).
**Validates: Requirements 1.2**

### Property 2: Job Deduplication
*For any* two jobs with the same key submitted to the JobScheduler, only the most recently submitted job SHALL remain active, and the previous job SHALL be cancelled.
**Validates: Requirements 1.3**

### Property 3: Worker Priority Filtering
*For any* primary worker, it SHALL only process jobs with priority >= 10, while secondary workers SHALL process jobs of any priority.
**Validates: Requirements 1.6, 1.7**

### Property 4: Distance-Based Eviction
*For any* memory pool at capacity, when a new page is inserted, the evicted page SHALL be the one farthest from the current page in the opposite reading direction (among unlocked pages).
**Validates: Requirements 2.2, 2.3**

### Property 5: Page Lock Protection
*For any* locked page in the memory pool, it SHALL NOT be evicted regardless of memory pressure or distance from current page.
**Validates: Requirements 2.4**

### Property 6: Split Page Generation
*For any* page with aspect ratio > dividePageRate when isSupportedDividePage is enabled, the PageFrameBuilder SHALL generate two PageFrameElements (left half and right half) from that single page.
**Validates: Requirements 3.3, 5.1**

### Property 7: Split Page Order by Direction
*For any* split page, when reading direction is LTR the left half SHALL be displayed first, and when reading direction is RTL the right half SHALL be displayed first.
**Validates: Requirements 5.3, 5.4**

### Property 8: Double Page Pairing
*For any* two consecutive portrait pages in double-page mode, they SHALL be combined into a single PageFrame, unless one of them is the first page with isSupportedSingleFirst enabled or the last page with isSupportedSingleLast enabled.
**Validates: Requirements 6.1, 6.5, 6.6**

### Property 9: Landscape Page Isolation
*For any* landscape page in double-page mode with isSupportedWidePage enabled, it SHALL be displayed alone in its PageFrame, not paired with another page.
**Validates: Requirements 6.2, 6.3**

### Property 10: Virtual Page Count Calculation
*For any* book with N physical pages where M pages are landscape and isSupportedDividePage is enabled, the total virtual page count SHALL be N + M (each landscape page counts as 2 virtual pages).
**Validates: Requirements 4.5**

### Property 11: Navigation Step Calculation
*For any* navigation in single-page split mode on a landscape page, the step SHALL be 0.5 (moving between halves), and for non-split pages the step SHALL be 1.
**Validates: Requirements 4.3**

### Property 12: Stretch Mode Calculation
*For any* image and viewport size, the ContentSizeCalculator SHALL produce a scale that satisfies the current StretchMode constraints (Uniform fits within, UniformToFill fills, etc.).
**Validates: Requirements 9.2, 9.3, 9.4, 9.5**

### Property 13: Position Preservation on Setting Change
*For any* change to isSupportedDividePage, pageMode, or readOrder, the current physical page index SHALL remain the same after the change (only the frame composition changes).
**Validates: Requirements 10.1, 10.2, 10.3**

### Property 14: Preload Window Management
*For any* current page position, the preload pipeline SHALL have active preload jobs for the next 5 pages and previous 2 pages in the reading direction.
**Validates: Requirements 8.1, 8.2**

### Property 15: Cache Hit Performance
*For any* preloaded page, accessing it from the cache SHALL complete within 50ms.
**Validates: Requirements 8.4**

## Error Handling

### 后端错误处理

```rust
#[derive(Debug, thiserror::Error)]
pub enum PageError {
    #[error("Page not found: {0}")]
    NotFound(usize),
    
    #[error("Archive error: {0}")]
    ArchiveError(String),
    
    #[error("Image decode error: {0}")]
    DecodeError(String),
    
    #[error("Job cancelled")]
    Cancelled,
    
    #[error("Memory pressure")]
    MemoryPressure,
    
    #[error("Timeout")]
    Timeout,
}

impl PageContentManager {
    async fn load_page_with_retry(&self, index: usize) -> Result<Vec<u8>, PageError> {
        let mut attempts = 0;
        let mut delay = Duration::from_millis(100);
        
        loop {
            match self.load_page(index).await {
                Ok(data) => return Ok(data),
                Err(PageError::Timeout) if attempts < 3 => {
                    attempts += 1;
                    tokio::time::sleep(delay).await;
                    delay *= 2;  // 指数退避
                }
                Err(e) => return Err(e),
            }
        }
    }
}
```

### 前端错误处理

```typescript
// src/lib/stores/pageFrame.svelte.ts

class PageFrameStore {
    async loadFrame(position: PagePosition): Promise<void> {
        try {
            this.state.loading = true;
            this.state.error = null;
            
            const frame = await gotoPosition(position);
            this.state.currentFrame = frame;
            this.state.currentPosition = position;
        } catch (error) {
            this.state.error = error instanceof Error ? error.message : String(error);
            // 显示错误占位符，不崩溃
            this.state.currentFrame = this.createErrorFrame(position);
        } finally {
            this.state.loading = false;
        }
    }
}
```

## Testing Strategy

### 测试框架选择

- **Rust 后端**: 使用 `proptest` 进行属性测试
- **TypeScript 前端**: 使用 `fast-check` 进行属性测试
- **集成测试**: 使用 Tauri 的测试框架

### 单元测试

1. **JobScheduler 测试**
   - 优先级排序
   - 任务去重和取消
   - 并发安全

2. **MemoryPool 测试**
   - 距离驱逐策略
   - 锁定机制
   - 容量限制

3. **PageFrameBuilder 测试**
   - 分割页面生成
   - 双页配对
   - 边界条件

4. **ContentSizeCalculator 测试**
   - 各种 StretchMode
   - 自动旋转
   - 边界尺寸

### 属性测试

每个属性测试必须：
1. 使用 `proptest` (Rust) 或 `fast-check` (TypeScript)
2. 运行至少 100 次迭代
3. 使用注释标记对应的正确性属性

```rust
// 示例：Property 1 - Job Priority Ordering
// **Feature: neeview-page-system, Property 1: Job Priority Ordering**
proptest! {
    #[test]
    fn test_job_priority_ordering(jobs in prop::collection::vec(arb_job(), 1..100)) {
        let mut scheduler = JobScheduler::new();
        for job in jobs.clone() {
            scheduler.enqueue(job);
        }
        
        let mut prev_priority = JobPriority::Urgent;
        while let Some((job, _)) = scheduler.try_dequeue() {
            prop_assert!(job.priority <= prev_priority);
            prev_priority = job.priority;
        }
    }
}
```

### 集成测试

1. **端到端翻页测试**
   - 打开书籍 → 翻页 → 验证帧内容

2. **设置切换测试**
   - 切换分割模式 → 验证位置保持

3. **性能测试**
   - 预加载命中率
   - 缓存访问延迟

