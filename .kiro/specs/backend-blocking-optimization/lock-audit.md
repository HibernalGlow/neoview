# 后端锁使用审计报告

## 审计日期
2025-01-17

## 发现的全局锁

### 1. BookManager - `Mutex<BookManager>`
**位置**: `src-tauri/src/lib.rs:250`
```rust
.manage(Mutex::new(BookManager::new()))
```

**问题**:
- 所有书籍操作串行化
- 读取书籍信息也需要获取写锁
- 高并发时成为瓶颈

**影响的命令**:
- `open_book`
- `close_book`
- `get_current_book`
- `navigate_to_page`
- `next_page`
- `previous_page`
- `navigate_to_image`
- `set_book_sort_mode`
- `set_media_priority_mode`

**优化方案**: 使用 `RwLock` 或内部细粒度锁

### 2. ImageLoader - `Mutex<ImageLoader>`
**位置**: `src-tauri/src/lib.rs:251`
```rust
.manage(Mutex::new(ImageLoader::default()))
```

**问题**:
- 图片加载串行化
- 可能是无状态的，不需要锁

**影响的命令**:
- `load_image`
- `load_image_base64`
- `get_image_dimensions`

**优化方案**: 评估是否需要锁，如果无状态则移除

### 3. ArchiveManager - `Arc<Mutex<ArchiveManager>>`
**位置**: `src-tauri/src/lib.rs:114`
```rust
let archive_manager_arc = Arc::new(Mutex::new(archive_manager));
```

**问题**:
- 压缩包解压串行化
- 多个文件无法并发解压

**影响的命令**:
- 所有压缩包相关命令
- `load_image_from_archive`
- `list_archive_contents`

**优化方案**: 使 ArchiveManager 可克隆，每个任务独立实例

### 4. FsManager - `Arc<Mutex<FsManager>>`
**位置**: `src-tauri/src/lib.rs:117`
```rust
fs_manager: Arc::new(Mutex::new(fs_manager)),
```

**问题**:
- 文件系统操作串行化

**优化方案**: 评估是否需要锁

### 5. PageContentManager - `Arc<tokio::sync::Mutex<PageContentManager>>`
**位置**: `src-tauri/src/lib.rs:201`
```rust
manager: Arc::new(tokio::sync::Mutex::new(page_manager)),
```

**问题**:
- 使用 Tokio 的 Mutex，但内部的 memory_pool 也有锁
- 双重锁可能导致性能问题

**优化方案**: 内部使用分片锁

### 6. DirectoryCache - `Mutex<DirectoryCache>`
**位置**: `src-tauri/src/lib.rs:140`
```rust
cache: Mutex::new(directory_cache),
```

**问题**:
- 目录缓存访问串行化

**优化方案**: 使用 RwLock 或分片锁

### 7. UpscaleManager - `Arc<Mutex<Option<UpscaleManager>>>`
**位置**: `src-tauri/src/lib.rs:162`
```rust
manager: Arc::new(Mutex::new(Some(upscale_manager))),
```

**问题**:
- 放大操作串行化

**优化方案**: 内部使用任务队列和并发控制

### 8. ThumbnailDb - 内部使用 `Mutex<Option<Connection>>`
**位置**: `src-tauri/src/core/thumbnail_db/mod.rs`

**问题**:
- 数据库操作串行化
- 每次操作都获取锁

**优化方案**: 使用连接池

## 锁竞争热点排名

1. **高竞争** (Critical):
   - `Mutex<BookManager>` - 几乎所有操作都需要
   - `Arc<Mutex<ArchiveManager>>` - 压缩包解压频繁
   - `PageContentManager` 内部的 `memory_pool` - 缓存访问频繁

2. **中等竞争** (High):
   - `Mutex<ImageLoader>` - 图片加载频繁
   - `ThumbnailDb` - 缩略图查询频繁
   - `DirectoryCache` - 目录浏览频繁

3. **低竞争** (Medium):
   - `FsManager` - 文件操作相对较少
   - `UpscaleManager` - 放大操作相对较少

## 优化优先级

### P0 (立即优化):
1. BookManager - 改为 RwLock
2. ArchiveManager - 改为可克隆
3. PageManager memory_pool - 实现分片锁

### P1 (高优先级):
4. ImageLoader - 评估并移除不必要的锁
5. ThumbnailDb - 实现连接池或优化锁策略

### P2 (中优先级):
6. DirectoryCache - 改为 RwLock
7. FsManager - 评估并优化

### P3 (低优先级):
8. UpscaleManager - 内部优化即可

## 预期性能提升

- **BookManager 优化**: 读操作并发度提升 10-100倍
- **ArchiveManager 优化**: 解压吞吐量提升 2-4倍
- **PageManager 分片锁**: 缓存访问延迟降低 50-80%
- **整体响应性**: 前端卡顿减少 60-80%
