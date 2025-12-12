# Design Document: Unified File Metadata Service

## Overview

本设计文档描述了统一文件元数据服务（MetadataService）的架构和实现方案。该服务将作为 NeoView 中所有文件元数据获取的单一入口，解决当前元数据分散、重复加载和图像信息卡片无法显示数据的问题。

### 核心目标

1. **统一入口**: 提供单一 API 获取所有类型文件的元数据
2. **智能缓存**: LRU 缓存避免重复请求，前后端元数据复用
3. **自动同步**: 页面切换时自动更新 infoPanelStore
4. **可扩展性**: 支持未来添加新的元数据字段

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Svelte)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │ ImageInfoCard│    │ InfoOverlay  │    │ Other Components │   │
│  └──────┬───────┘    └──────┬───────┘    └────────┬─────────┘   │
│         │                   │                      │             │
│         └───────────────────┼──────────────────────┘             │
│                             │                                    │
│                             ▼                                    │
│                   ┌─────────────────┐                            │
│                   │ infoPanelStore  │                            │
│                   │   (imageInfo)   │                            │
│                   └────────┬────────┘                            │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   MetadataService                        │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │    │
│  │  │  LRU Cache  │  │ Subscribers │  │ Request Queue   │  │    │
│  │  │ (1000 max)  │  │   (Set)     │  │ (debounced)     │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │    │
│  └─────────────────────────┬───────────────────────────────┘    │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                  │
│         │                  │                  │                  │
│         ▼                  ▼                  ▼                  │
│  ┌────────────┐    ┌────────────┐    ┌────────────────┐         │
│  │ bookStore  │    │ imageStore │    │ Tauri IPC      │         │
│  │ (Page[])   │    │ (dims)     │    │ (fallback)     │         │
│  └────────────┘    └────────────┘    └───────┬────────┘         │
│                                              │                   │
└──────────────────────────────────────────────┼───────────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Backend (Rust)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  get_image_metadata                      │    │
│  │  - Regular files: fs::metadata + image decoder           │    │
│  │  - Archive entries: archive reader + image decoder       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. MetadataService (Frontend)

统一的元数据服务，负责获取、缓存和分发文件元数据。

```typescript
// src/lib/services/metadataService.ts

export interface ImageMetadata {
  // 基础文件信息
  path: string;
  innerPath?: string;  // 压缩包内部路径
  name: string;
  size?: number;
  createdAt?: string;
  modifiedAt?: string;
  
  // 图像特有信息
  width?: number;
  height?: number;
  format?: string;
  colorDepth?: string;
  
  // 视频特有信息（可选）
  isVideo?: boolean;
  duration?: number;
  videoCodec?: string;
  audioCodec?: string;
  frameRate?: number;
  bitrate?: number;
  
  // 扩展字段
  extra?: Record<string, unknown>;
}

export interface MetadataRequest {
  path: string;
  innerPath?: string;
  archivePath?: string;
  pageIndex?: number;
}

export interface MetadataServiceAPI {
  // 获取元数据（优先使用缓存）
  getMetadata(request: MetadataRequest): Promise<ImageMetadata | null>;
  
  // 从已有数据更新缓存（如 bookStore.Page）
  updateFromPage(page: Page, bookPath: string): void;
  
  // 从图像加载结果更新尺寸
  updateDimensions(path: string, width: number, height: number, innerPath?: string): void;
  
  // 同步当前页面元数据到 infoPanelStore
  syncCurrentPageMetadata(): void;
  
  // 订阅元数据更新
  subscribe(path: string, callback: (metadata: ImageMetadata) => void): () => void;
  
  // 清理缓存
  clearCache(): void;
  
  // 获取缓存统计
  getCacheStats(): { size: number; hits: number; misses: number };
}
```

### 2. LRU Cache Implementation

```typescript
// src/lib/services/metadataService.ts (内部实现)

class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;
  
  constructor(maxSize: number = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }
  
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // 移到最后（最近使用）
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }
  
  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 删除最旧的条目
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
  
  has(key: K): boolean {
    return this.cache.has(key);
  }
  
  delete(key: K): boolean {
    return this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  get size(): number {
    return this.cache.size;
  }
}
```

### 3. Backend API Extension

```rust
// src-tauri/src/commands/metadata_commands.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMetadataResponse {
    pub path: String,
    pub inner_path: Option<String>,
    pub name: String,
    pub size: Option<u64>,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub format: Option<String>,
    pub color_depth: Option<String>,
}

#[tauri::command]
pub async fn get_image_metadata(
    path: String,
    inner_path: Option<String>,
    state: State<'_, FsState>,
) -> Result<ImageMetadataResponse, String> {
    // 实现：根据是否有 inner_path 决定是普通文件还是压缩包内文件
}
```

### 4. Integration with bookStore

```typescript
// 在 bookStore 中集成 MetadataService

// 当页面切换时自动同步元数据
$effect(() => {
  const currentPage = bookStore.currentPage;
  if (currentPage) {
    metadataService.syncCurrentPageMetadata();
  }
});
```

## Data Models

### ImageMetadata

| Field | Type | Description |
|-------|------|-------------|
| path | string | 文件完整路径 |
| innerPath | string? | 压缩包内部路径 |
| name | string | 文件名 |
| size | number? | 文件大小（字节） |
| createdAt | string? | 创建时间 (ISO 8601) |
| modifiedAt | string? | 修改时间 (ISO 8601) |
| width | number? | 图像宽度（像素） |
| height | number? | 图像高度（像素） |
| format | string? | 图像格式 (jpeg, png, webp, etc.) |
| colorDepth | string? | 色深 (8-bit, 16-bit, etc.) |
| isVideo | boolean? | 是否为视频 |
| duration | number? | 视频时长（秒） |
| videoCodec | string? | 视频编码 |
| audioCodec | string? | 音频编码 |
| frameRate | number? | 帧率 |
| bitrate | number? | 码率 (bps) |
| extra | Record<string, unknown>? | 扩展字段 |

### Cache Key Format

缓存键格式：`{path}` 或 `{archivePath}::{innerPath}`

示例：
- 普通文件: `C:\images\photo.jpg`
- 压缩包内文件: `C:\archives\book.zip::images/page001.jpg`



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the acceptance criteria analysis, the following correctness properties have been identified:

### Property 1: Metadata sync on page navigation
*For any* page navigation event, the MetadataService SHALL update infoPanelStore.imageInfo with the navigated page's metadata before the next render cycle completes.
**Validates: Requirements 1.1**

### Property 2: Dimension formatting consistency
*For any* ImageMetadata with valid width and height values, the formatted display string SHALL match the pattern "{width} × {height}" where width and height are the exact numeric values.
**Validates: Requirements 1.2**

### Property 3: Archive metadata retrieval
*For any* archive path and inner path combination, the MetadataService SHALL return metadata that includes the correct inner path and file name extracted from the inner path.
**Validates: Requirements 1.3**

### Property 4: Race condition handling
*For any* sequence of rapid page navigation events, the final state of infoPanelStore.imageInfo SHALL contain only the metadata of the last navigated page, with no stale data from intermediate pages.
**Validates: Requirements 1.5**

### Property 5: Cache hit behavior
*For any* metadata request for a path that exists in the cache, the MetadataService SHALL return the cached value without invoking the backend API.
**Validates: Requirements 2.2**

### Property 6: Metadata reuse from Page
*For any* Page object that already contains width, height, and size, the MetadataService SHALL use those values without making a backend request.
**Validates: Requirements 2.3, 3.3**

### Property 7: LRU eviction
*For any* cache state with exactly maxSize entries, adding a new entry SHALL evict the least recently accessed entry, and the cache size SHALL remain at maxSize.
**Validates: Requirements 2.5**

### Property 8: Dimension update propagation
*For any* dimension update (width, height) for a page, if that page is the current page, the update SHALL be reflected in infoPanelStore.imageInfo.
**Validates: Requirements 3.2, 3.4**

### Property 9: Consistency across components
*For any* file being displayed, all components subscribed to its metadata SHALL display identical values for all common fields.
**Validates: Requirements 4.1, 4.3**

### Property 10: Unknown field preservation
*For any* metadata response containing fields not defined in ImageMetadata interface, those fields SHALL be preserved in the extra property and accessible to consumers.
**Validates: Requirements 5.2**

## Error Handling

### Frontend Error Handling

| Error Scenario | Handling Strategy |
|----------------|-------------------|
| Backend request timeout | Return cached data if available, otherwise return null with error logged |
| Invalid path format | Return null immediately, log warning |
| Cache corruption | Clear affected cache entry, retry request |
| Subscription callback throws | Catch and log error, continue notifying other subscribers |

### Backend Error Handling

| Error Scenario | Handling Strategy |
|----------------|-------------------|
| File not found | Return error with descriptive message |
| Archive read failure | Return partial metadata (path, name) with error flag |
| Image decode failure | Return file metadata without image-specific fields |
| Permission denied | Return error with permission-related message |

### Error Response Format

```typescript
interface MetadataError {
  code: 'NOT_FOUND' | 'PERMISSION_DENIED' | 'DECODE_ERROR' | 'ARCHIVE_ERROR' | 'TIMEOUT';
  message: string;
  path: string;
  innerPath?: string;
}
```

## Testing Strategy

### Dual Testing Approach

本功能采用单元测试和属性测试相结合的方式，确保全面的测试覆盖：

- **单元测试**: 验证具体示例、边界情况和错误条件
- **属性测试**: 验证应在所有输入上成立的通用属性

### Property-Based Testing Framework

使用 **fast-check** 作为 TypeScript 的属性测试库。

配置要求：
- 每个属性测试运行最少 100 次迭代
- 每个属性测试必须标注对应的设计文档属性编号

### Unit Test Coverage

| Component | Test Focus |
|-----------|------------|
| MetadataService | API 调用、缓存行为、订阅机制 |
| LRUCache | 插入、获取、驱逐、边界条件 |
| ImageInfoCard | 渲染、格式化、空值处理 |
| Backend API | 文件元数据、压缩包元数据、错误处理 |

### Property Test Coverage

| Property | Test Strategy |
|----------|---------------|
| Property 1 | 生成随机页面导航序列，验证最终状态 |
| Property 2 | 生成随机宽高值，验证格式化输出 |
| Property 3 | 生成随机压缩包路径和内部路径组合 |
| Property 4 | 生成快速连续的页面切换序列 |
| Property 5 | 生成随机路径，先缓存后请求 |
| Property 6 | 生成带有元数据的 Page 对象 |
| Property 7 | 生成超过缓存容量的条目序列 |
| Property 8 | 生成尺寸更新事件序列 |
| Property 9 | 生成多组件订阅场景 |
| Property 10 | 生成包含未知字段的元数据响应 |

### Test File Structure

```
src/lib/services/__tests__/
├── metadataService.test.ts      # 单元测试
├── metadataService.property.ts  # 属性测试
├── lruCache.test.ts             # LRU 缓存单元测试
└── lruCache.property.ts         # LRU 缓存属性测试

src/lib/cards/info/__tests__/
└── ImageInfoCard.test.ts        # 组件测试

src-tauri/src/commands/
└── metadata_commands_test.rs    # 后端单元测试
```

### Integration Points

1. **bookStore 集成**: 验证页面切换时元数据自动同步
2. **infoPanelStore 集成**: 验证元数据更新正确传播
3. **ImageInfoCard 集成**: 验证 UI 正确显示元数据
4. **Backend IPC 集成**: 验证前后端通信正确

