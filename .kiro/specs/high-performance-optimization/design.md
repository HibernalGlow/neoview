# 高性能优化设计文档

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Svelte)                         │
├─────────────────────────────────────────────────────────────────┤
│  SharedArrayBuffer Pool  │  Custom Protocol Handler  │  Store   │
└──────────────┬───────────┴──────────────┬────────────┴──────────┘
               │                          │
               │ (零拷贝)                  │ (HTTP-like)
               ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Tauri Custom Protocol                        │
│  neoview://image/{archive_hash}/{entry_index}                   │
│  neoview://thumb/{key}                                          │
└──────────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (Rust)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  MmapArchive    │  │  Stretto Cache  │  │  Rkyv Index     │  │
│  │  (memmap2)      │  │  (TinyLFU)      │  │  (零拷贝)       │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│           ▼                    ▼                    ▼           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Mimalloc Global Allocator                      ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## 模块设计

### 1. 内存映射压缩包读取 (mmap_archive.rs)

```rust
use memmap2::Mmap;
use std::fs::File;
use std::sync::Arc;

/// 内存映射的压缩包
pub struct MmapArchive {
    /// 内存映射
    mmap: Arc<Mmap>,
    /// 文件路径
    path: PathBuf,
    /// 文件大小
    size: u64,
}

impl MmapArchive {
    /// 打开压缩包（使用内存映射）
    pub fn open(path: &Path) -> Result<Self, Error> {
        let file = File::open(path)?;
        let mmap = unsafe { Mmap::map(&file)? };
        Ok(Self {
            mmap: Arc::new(mmap),
            path: path.to_path_buf(),
            size: file.metadata()?.len(),
        })
    }
    
    /// 获取内存映射切片
    pub fn as_slice(&self) -> &[u8] {
        &self.mmap
    }
    
    /// 获取共享引用（用于并发访问）
    pub fn shared(&self) -> Arc<Mmap> {
        Arc::clone(&self.mmap)
    }
}
```

### 2. 高性能 ZIP 解压 (fast_zip.rs)

使用 rawzip 或直接操作内存映射数据：

```rust
use memmap2::Mmap;

/// 从内存映射中直接读取 ZIP 条目
pub struct FastZipReader<'a> {
    data: &'a [u8],
    // ZIP 中央目录偏移
    cd_offset: u64,
    // 条目数量
    entry_count: u32,
}

impl<'a> FastZipReader<'a> {
    /// 从内存映射创建
    pub fn from_mmap(mmap: &'a Mmap) -> Result<Self, Error> {
        // 解析 ZIP 尾部记录
        let data = mmap.as_ref();
        // ... 解析逻辑
    }
    
    /// 按索引获取条目数据（零拷贝）
    pub fn get_entry_data(&self, index: usize) -> Result<&[u8], Error> {
        // 直接返回内存映射中的切片，无需拷贝
    }
    
    /// 解压条目（如果需要）
    pub fn decompress_entry(&self, index: usize) -> Result<Vec<u8>, Error> {
        // 使用 lz4_flex 或 miniz_oxide 解压
    }
}
```

### 3. Rkyv 零拷贝索引 (rkyv_index.rs)

```rust
use rkyv::{Archive, Deserialize, Serialize};

/// 可归档的索引条目
#[derive(Archive, Deserialize, Serialize)]
#[archive(check_bytes)]
pub struct RkyvIndexEntry {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub offset: u64,      // 在压缩包中的偏移
    pub compressed_size: u64,
    pub is_image: bool,
    pub entry_index: u32,
}

/// 可归档的索引
#[derive(Archive, Deserialize, Serialize)]
#[archive(check_bytes)]
pub struct RkyvArchiveIndex {
    pub archive_path: String,
    pub mtime: i64,
    pub file_size: u64,
    pub entries: Vec<RkyvIndexEntry>,
}

impl RkyvArchiveIndex {
    /// 序列化到字节（用于持久化）
    pub fn to_bytes(&self) -> Vec<u8> {
        rkyv::to_bytes::<_, 256>(self).unwrap().to_vec()
    }
    
    /// 零拷贝访问（直接从字节访问，无需反序列化）
    pub fn from_bytes(bytes: &[u8]) -> &ArchivedRkyvArchiveIndex {
        unsafe { rkyv::archived_root::<RkyvArchiveIndex>(bytes) }
    }
}
```

### 4. Stretto TinyLFU 缓存 (stretto_cache.rs)

```rust
use stretto::Cache;

/// 高性能图片缓存
pub struct ImageCache {
    cache: Cache<String, Arc<Vec<u8>>>,
}

impl ImageCache {
    pub fn new(max_size: i64) -> Self {
        let cache = Cache::new(12960, max_size)
            .expect("Failed to create cache");
        Self { cache }
    }
    
    pub fn get(&self, key: &str) -> Option<Arc<Vec<u8>>> {
        self.cache.get(key).map(|v| v.value().clone())
    }
    
    pub fn insert(&self, key: String, data: Vec<u8>) {
        let cost = data.len() as i64;
        self.cache.insert(key, Arc::new(data), cost);
        self.cache.wait().unwrap();
    }
}
```

### 5. Custom Protocol (custom_protocol.rs)

```rust
use tauri::http::{Request, Response};

/// 注册自定义协议
pub fn register_protocol(app: &mut tauri::App) {
    app.register_uri_scheme_protocol("neoview", |app, request| {
        let uri = request.uri();
        let path = uri.path();
        
        match parse_protocol_path(path) {
            ProtocolRequest::Image { archive_hash, entry_index } => {
                handle_image_request(app, archive_hash, entry_index)
            }
            ProtocolRequest::Thumb { key } => {
                handle_thumb_request(app, key)
            }
            _ => Response::builder()
                .status(404)
                .body(Vec::new())
                .unwrap()
        }
    });
}

fn handle_image_request(
    app: &tauri::AppHandle,
    archive_hash: &str,
    entry_index: usize,
) -> Response<Vec<u8>> {
    // 从缓存或压缩包获取图片数据
    let data = get_image_data(app, archive_hash, entry_index);
    
    Response::builder()
        .status(200)
        .header("Content-Type", "image/jpeg") // 根据实际类型
        .header("Cache-Control", "max-age=3600")
        .body(data)
        .unwrap()
}
```

### 6. 前端 Custom Protocol 使用

```typescript
// src/lib/api/imageProtocol.ts

/** 
 * 通过 Custom Protocol 加载图片
 * 绕过 invoke 序列化开销
 */
export function getImageUrl(archiveHash: string, entryIndex: number): string {
    return `neoview://image/${archiveHash}/${entryIndex}`;
}

/**
 * 通过 Custom Protocol 加载缩略图
 */
export function getThumbUrl(key: string): string {
    return `neoview://thumb/${encodeURIComponent(key)}`;
}

// 在组件中使用
// <img src={getImageUrl(hash, index)} />
```

### 7. Mimalloc 全局分配器

```rust
// src-tauri/src/main.rs
use mimalloc::MiMalloc;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;
```

### 8. Puffin 性能分析

```rust
use puffin;

pub fn load_archive_pages(path: &Path) -> Result<Vec<Page>, Error> {
    puffin::profile_function!();
    
    {
        puffin::profile_scope!("read_index");
        // 读取索引
    }
    
    {
        puffin::profile_scope!("build_pages");
        // 构建页面列表
    }
}
```

## 数据流

### 图片加载流程（优化后）

```
1. 前端请求图片
   └─> <img src="neoview://image/{hash}/{index}" />

2. Custom Protocol 处理
   └─> 解析 URL
   └─> 查找缓存（Stretto TinyLFU）
       ├─> 命中: 直接返回
       └─> 未命中: 继续

3. 加载图片数据
   └─> 获取 MmapArchive（内存映射）
   └─> 使用 FastZipReader 定位条目
   └─> 零拷贝获取压缩数据
   └─> 解压（如需要）
   └─> 存入缓存

4. 返回响应
   └─> HTTP Response with image data
   └─> 浏览器自动缓存
```

### 索引加载流程（优化后）

```
1. 打开压缩包
   └─> 计算文件哈希

2. 查找索引缓存
   └─> 检查 Rkyv 索引文件
       ├─> 存在且有效: 零拷贝访问
       └─> 不存在: 构建新索引

3. 构建索引（如需要）
   └─> 使用 MmapArchive 读取
   └─> 解析 ZIP 中央目录
   └─> 序列化为 Rkyv 格式
   └─> 持久化到磁盘
```

## 性能预期

| 操作 | 当前 | 优化后 | 提升 |
|------|------|--------|------|
| 索引加载 | 5-10ms | <1ms | 5-10x |
| 图片首次加载 | 50-100ms | 20-40ms | 2-3x |
| 图片缓存命中 | 5-10ms | <1ms | 5-10x |
| 内存使用 | 高 | 低 | 30-50% |
| IPC 开销 | 高 | 极低 | 10x+ |

## 实施阶段

### Phase 1: Custom Protocol + Memmap (P0)
- 实现 Custom Protocol 图片传输
- 使用 memmap2 内存映射
- 预期收益: 50%+ 性能提升

### Phase 2: Rkyv + Stretto (P1)
- 替换 bincode 为 rkyv
- 替换 lru 为 stretto
- 预期收益: 30%+ 性能提升

### Phase 3: Mimalloc + Bstr + Puffin (P2)
- 集成 mimalloc 分配器
- 使用 bstr 处理路径
- 集成 puffin 性能分析
- 预期收益: 10-20% 性能提升

### Phase 4: SharedArrayBuffer (P3)
- 配置 COOP/COEP 头
- 实现 SharedArrayBuffer 传输
- 预期收益: 进一步减少拷贝
