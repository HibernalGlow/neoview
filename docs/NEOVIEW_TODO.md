# NeoView 加载系统补全文档

## 与 NeeView 的差异分析

### 已实现 ✅

| 功能 | NeeView | NeoView | 状态 |
|------|---------|---------|------|
| JobEngine 任务调度 | JobEngine + JobScheduler + JobWorker | job_engine 模块 | ✅ 基本实现 |
| 优先级队列 | JobPriority | JobPriority 枚举 | ✅ |
| 内存池 | MemoryPool + BookMemoryService | MemoryPool | ✅ 距离驱逐 |
| 书籍上下文 | Book + BookSource | BookContext | ✅ |
| 页面信息 | Page + PageInfo | PageInfo | ✅ |

### 未实现 ❌

| 功能 | NeeView 实现 | 差距 | 优先级 |
|------|-------------|------|--------|
| **PageContent 多态** | BitmapPageContent, MediaPageContent, AnimatedPageContent, PdfPageContent, ArchivePageContent, SvgPageContent | 只有单一加载路径 | 🔴 高 |
| **FileProxy 临时文件** | `GetFileProxyAsync()` 自动判断是否需要提取到临时文件 | 没有自动回退机制 | 🔴 高 |
| **PreExtractMemory** | 预提取内存管理，大文件直接用临时文件 | 没有大小阈值判断 | 🔴 高 |
| **嵌套压缩包** | ArchivePageContent 支持递归打开 | 不支持 | 🟡 中 |
| **PDF 支持** | PdfPageContent | 不支持 | 🟢 低 |
| **SVG 支持** | SvgPageContent | 不支持 | 🟢 低 |
| **MediaInfo** | 使用 MediaInfoLib 获取视频尺寸和元数据 | 没有 | 🟡 中 |

---

## 需要补全的核心功能

### 1. PageContent 多态设计 🔴

NeeView 使用工厂模式创建不同类型的 PageContent：

```csharp
// NeeView: PageContentFactory.cs
public PageContent CreatePageContent(ArchiveEntry entry, CancellationToken token)
{
    if (entry.IsImage())
    {
        if (entry.Archive is MediaArchive)
            return new MediaPageContent(entry, _bookMemoryService);
        else if (PictureProfile.Current.IsMediaSupported(path))
            return new MediaPageContent(entry, _bookMemoryService);
        else if (_allowAnimatedImage && PictureProfile.Current.IsAnimatedGifSupported(path))
            return new AnimatedPageContent(entry, _bookMemoryService, AnimatedImageType.Gif);
        else
            return new BitmapPageContent(entry, _bookMemoryService);
    }
    else if (entry.IsBook())
    {
        return new ArchivePageContent(entry, _bookMemoryService);
    }
    // ...
}
```

**NeoView 需要实现：**

```rust
// src-tauri/src/core/page_manager/page_content.rs

pub enum PageContentLoader {
    /// 普通图片 - 加载到内存
    Bitmap(BitmapLoader),
    /// 视频 - 提取到临时文件，返回路径
    Media(MediaLoader),
    /// 动图 - 加载到内存，保留动画帧
    Animated(AnimatedLoader),
    /// 嵌套压缩包 - 递归展开
    Archive(ArchiveLoader),
}

impl PageContentLoader {
    pub fn from_page_info(page: &PageInfo, book_type: BookType) -> Self {
        match page.content_type {
            PageContentType::Video => Self::Media(MediaLoader::new()),
            PageContentType::Animated => Self::Animated(AnimatedLoader::new()),
            PageContentType::Archive => Self::Archive(ArchiveLoader::new()),
            _ => Self::Bitmap(BitmapLoader::new()),
        }
    }
    
    pub async fn load(&self, ...) -> Result<PageLoadOutput, String> {
        // 根据类型调用不同的加载逻辑
    }
}
```

---

### 2. FileProxy 临时文件回退 🔴

NeeView 的关键设计：

```csharp
// NeeView: ArchiveEntry.cs
public async ValueTask<FileProxy> GetFileProxyAsync(bool isKeepFileName, CancellationToken token)
{
    _fileProxy = _fileProxy ?? await CreateFileProxyAsync(...);
    return _fileProxy;
}

// 对于压缩包内的视频，自动提取到临时文件
// 对于大文件（超过内存阈值），也使用临时文件
```

**NeoView 需要实现：**

```rust
// src-tauri/src/core/page_manager/file_proxy.rs

pub struct FileProxy {
    /// 原始路径（可能是压缩包内路径）
    pub source_path: String,
    /// 实际可访问路径（可能是临时文件）
    pub access_path: String,
    /// 是否是临时文件
    pub is_temp: bool,
}

impl FileProxy {
    /// 判断是否需要提取到临时文件
    pub fn needs_temp_file(page: &PageInfo, estimated_size: usize) -> bool {
        // 1. 视频文件必须提取
        if page.content_type == PageContentType::Video {
            return true;
        }
        // 2. 大文件提取（超过 50MB）
        if estimated_size > LARGE_FILE_THRESHOLD {
            return true;
        }
        // 3. 压缩包内的文件需要提取
        // ...
        false
    }
    
    pub async fn get_or_create(
        page: &PageInfo,
        book_path: &str,
        book_type: BookType,
        archive_manager: &ArchiveManager,
    ) -> Result<Self, String> {
        if Self::needs_temp_file(page, 0) {
            // 提取到临时文件
            let temp_path = extract_to_temp(book_path, &page.inner_path)?;
            Ok(Self {
                source_path: page.inner_path.clone(),
                access_path: temp_path,
                is_temp: true,
            })
        } else {
            // 直接使用内存
            Ok(Self {
                source_path: page.inner_path.clone(),
                access_path: page.inner_path.clone(),
                is_temp: false,
            })
        }
    }
}
```

---

### 3. 压缩包内视频处理 🔴

NeeView 的 `MediaPageContent.LoadSourceAsync`：

```csharp
protected override async ValueTask<PageSource> LoadSourceAsync(CancellationToken token)
{
    // ArchiveFileの場合はTempFile化 (如果是压缩包内的文件，提取到临时文件)
    var fileProxy = await ArchiveEntry.GetFileProxyAsync(false, token);
    var mediaInfo = CreateMediaInfo(fileProxy.Path);
    return new PageSource(new MediaPageData(fileProxy.Path, ...), ...);
}
```

**NeoView 需要实现：**

前端需要知道这是视频文件，然后用 `<video>` 标签加载：

```typescript
// 前端
if (page.contentType === 'video') {
    // 后端返回临时文件路径
    const result = await invoke<{ tempPath: string }>('pm_get_video_path', { index });
    videoSrc = convertFileSrc(result.tempPath);
}
```

后端需要新增命令：

```rust
// 专门用于视频的命令，返回临时文件路径
#[tauri::command]
pub async fn pm_get_video_path(
    index: usize,
    state: State<'_, PageManagerState>,
) -> Result<String, String> {
    let manager = state.manager.lock().await;
    let page = manager.get_page_info(index).ok_or("页面不存在")?;
    
    if page.content_type != PageContentType::Video {
        return Err("不是视频文件".to_string());
    }
    
    // 提取到临时文件并返回路径
    manager.extract_to_temp(index).await
}
```

---

### 4. 内存压力处理 🔴

NeeView 的 `BookMemoryService`：

```csharp
public void Cleanup(IComparer<IMemoryOwner> comparer)
{
    _memoryPool.Cleanup(_pageMemorySize, comparer);
}
```

**NeoView 需要实现：**

```rust
impl MemoryPool {
    /// 检查内存压力
    pub fn is_under_pressure(&self) -> bool {
        self.total_size > self.max_size * 90 / 100 // 90% 使用率
    }
    
    /// 强制释放到目标大小
    pub fn force_cleanup_to(&mut self, target_size: usize, current_index: usize, direction: i32) {
        while self.total_size > target_size {
            if !self.evict_one(current_index, direction) {
                break; // 所有都被锁定
            }
        }
    }
}

impl PageContentManager {
    pub async fn goto_page(&mut self, index: usize) -> Result<..> {
        // 检查内存压力
        {
            let mut pool = self.memory_pool.lock().await;
            if pool.is_under_pressure() {
                log::warn!("⚠️ 内存压力，触发清理");
                pool.force_cleanup_to(pool.max_size / 2, index, self.read_direction);
            }
        }
        // ...正常加载
    }
}
```

---

## 实施计划

### Phase 1: 视频支持 (2天)
1. [ ] 实现 `FileProxy` 模块
2. [ ] 添加 `pm_get_video_path` 命令
3. [ ] 前端视频播放器集成

### Phase 2: 大文件回退 (1天)
1. [ ] 添加文件大小估算
2. [ ] 超过阈值自动回退到 tempfile
3. [ ] 更新 `PageLoadResult` 返回 `load_mode`


### Phase 3: 嵌套压缩包 (2天)
1. [ ] 实现 `ArchiveLoader`
2. [ ] 递归展开压缩包
3. [ ] 虚拟路径管理

---

## 文件结构规划

```
src-tauri/src/core/page_manager/
├── mod.rs                  # PageContentManager (已有)
├── book_context.rs         # BookContext (已有)
├── memory_pool.rs          # MemoryPool (已有)
├── file_proxy.rs           # 新增: FileProxy 临时文件管理
├── content_loader/
│   ├── mod.rs              # PageContentLoader trait
│   ├── bitmap.rs           # BitmapLoader
│   ├── media.rs            # MediaLoader (视频)
│   ├── animated.rs         # AnimatedLoader (动图)
│   └── archive.rs          # ArchiveLoader (嵌套压缩包)
└── temp_manager.rs         # 新增: 临时文件生命周期管理
```
