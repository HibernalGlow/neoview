# Design Document: Thumbnail Priority Optimization

## Overview

优化底栏缩略图的生成顺序，实现从当前页向两边扩散的中央优先加载策略。当前实现中，后端按照传入的索引顺序依次处理缩略图，没有考虑与当前页的距离。本设计将在后端实现基于距离的优先级排序，确保用户当前浏览位置附近的缩略图优先生成。

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend                                  │
├─────────────────────────────────────────────────────────────────┤
│  BottomThumbnailBar.svelte                                      │
│    └── thumbnailService.loadThumbnails(centerIndex)             │
│          └── 计算需要加载的索引列表                               │
│          └── 调用 preloadThumbnails(indices, centerIndex)       │
├─────────────────────────────────────────────────────────────────┤
│                        Backend (Rust)                            │
├─────────────────────────────────────────────────────────────────┤
│  pm_preload_thumbnails(indices, centerIndex, maxSize)           │
│    └── sort_by_distance_from_center(indices, centerIndex)       │
│    └── 按排序后的顺序生成缩略图                                   │
│    └── 每生成一个立即推送 thumbnail-ready 事件                    │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Frontend Changes

#### pageManager.ts - API 更新

```typescript
/**
 * 预加载缩略图（异步，结果通过事件推送）
 * 
 * @param indices 需要生成缩略图的页面索引列表
 * @param centerIndex 当前页面索引（用于优先级排序）
 * @param maxSize 缩略图最大尺寸（默认 256）
 * @returns 开始预加载的页面索引列表
 */
export async function preloadThumbnails(
  indices: number[],
  centerIndex: number,
  maxSize: number = 256
): Promise<number[]>;
```

#### thumbnailService.ts - 传递 centerIndex

```typescript
async function loadThumbnails(centerIndex: number): Promise<void> {
  // ... 计算 needLoad 列表 ...
  
  // 传递 centerIndex 给后端，让后端进行优先级排序
  const indices = await preloadThumbnails(needLoad, centerIndex, THUMBNAIL_MAX_SIZE);
}
```

### 2. Backend Changes

#### page_commands.rs - 优先级排序

```rust
/// 预加载缩略图（异步，通过事件推送结果）
/// 
/// 接受需要生成的页面索引列表和当前页面索引
/// 按照与当前页的距离排序后生成，距离近的优先
#[tauri::command]   
pub async fn pm_preload_thumbnails(
    indices: Vec<usize>,
    center_index: Option<usize>,  // 新增参数
    max_size: Option<u32>,
    app: AppHandle,
    state: State<'_, PageManagerState>,
) -> Result<Vec<usize>, String>;

/// 按距离中心的距离排序索引
/// 
/// 排序规则：
/// 1. 按与 center 的绝对距离升序
/// 2. 距离相同时，较大的索引（前向）优先
fn sort_by_distance_from_center(indices: &mut Vec<usize>, center: usize) {
    indices.sort_by(|a, b| {
        let dist_a = (*a as isize - center as isize).abs();
        let dist_b = (*b as isize - center as isize).abs();
        
        match dist_a.cmp(&dist_b) {
            std::cmp::Ordering::Equal => b.cmp(a), // 距离相同时，大的优先
            other => other,
        }
    });
}
```

## Data Models

### ThumbnailReadyEvent (无变化)

```typescript
interface ThumbnailReadyEvent {
  index: number;
  data: string;  // data:image/webp;base64,...
  width: number;
  height: number;
}
```

### API 参数变化

| 参数 | 类型 | 说明 |
|------|------|------|
| indices | Vec<usize> | 需要生成的页面索引列表 |
| center_index | Option<usize> | 当前页面索引（新增，用于优先级排序） |
| max_size | Option<u32> | 缩略图最大尺寸 |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Center-First Ordering

*For any* list of indices and center index, after sorting by distance from center, the resulting order SHALL have indices closer to center appearing before indices farther from center.

**Validates: Requirements 1.1, 3.1, 3.2**

### Property 2: Alternating Pattern

*For any* center index and range, when generating indices in center-first order, the sequence SHALL follow the pattern: center, center+1, center-1, center+2, center-2, ... (alternating forward and backward).

**Validates: Requirements 1.2**

### Property 3: Forward Priority on Equal Distance

*For any* two indices with equal absolute distance from center, the larger index (forward direction) SHALL be processed before the smaller index (backward direction).

**Validates: Requirements 3.3**

### Property 4: Cancellation on Navigation

*For any* navigation event that changes the current page, all pending thumbnail requests from the previous center SHALL be cancelled before starting new requests from the new center.

**Validates: Requirements 1.3**

## Error Handling

| 错误场景 | 处理方式 |
|---------|---------|
| center_index 为 None | 使用索引列表中的第一个元素作为中心，或按原顺序处理 |
| indices 为空 | 直接返回空列表，不进行任何处理 |
| 缩略图生成失败 | 记录警告日志，继续处理下一个索引 |
| 事件推送失败 | 记录错误日志，继续处理下一个索引 |

## Testing Strategy

### Property-Based Testing

使用 Rust 的 `proptest` 库进行属性测试：

1. **排序正确性测试**: 生成随机的索引列表和中心索引，验证排序后的顺序符合距离优先规则
2. **交替模式测试**: 验证生成的索引序列符合 center, center+1, center-1, ... 的模式
3. **边界条件测试**: 测试 center 在列表边缘、空列表、单元素列表等情况

### Unit Tests

1. 测试 `sort_by_distance_from_center` 函数的基本功能
2. 测试 API 参数变化的向后兼容性（center_index 为 None 时的行为）
3. 测试取消机制的正确性

### Integration Tests

1. 端到端测试：前端请求 → 后端排序 → 事件推送 → 前端接收
2. 快速翻页场景：验证旧请求被正确取消
