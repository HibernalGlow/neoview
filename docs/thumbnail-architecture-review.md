# 缩略图系统架构评估与改进指南

## 一、当前实现分析

### 1.1 架构概览

当前 `ThumbnailManager` 参考 NeeView 的设计，包含以下核心模块：

```
┌─────────────────────────────────────────────────────────────┐
│                     ThumbnailManager                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  内存缓存     │  │  数据库缓存   │  │  生成器       │       │
│  │  (LRU Cache) │  │  (SQLite)    │  │  (Rust后端)  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                          │                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  任务队列     │  │  预测加载器   │  │  批量加载器   │       │
│  │  (Priority)  │  │  (Predictive)│  │  (Incremental)│      │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 NeeView 核心设计理念

基于代码注释中的 NeeView 参考，识别出以下关键设计模式：

| NeeView 概念 | 当前实现 | 状态 |
|-------------|---------|------|
| `ThumbnailType.Empty` | `failedThumbnails` Set | ✅ 已实现 |
| `IsThumbnailValid` | `canRetryFailedThumbnail()` | ✅ 已实现 |
| `JobScheduler.Order` | `enqueueTask()` | ✅ 已实现 |
| `JobClient.CancelOrder` | `setCurrentDirectory()` | ⚠️ 部分实现 |
| `PageThumbnail.LoadAsync` | `getThumbnail()` | ✅ 已实现 |
| `PageThumbnail.LoadThumbnailAsync` | `generateThumbnail()` | ✅ 已实现 |

### 1.3 当前问题

#### 问题 1：初始化失败无重试
- **症状**：编译版本缩略图/EMM 数据不显示
- **原因**：初始化失败后静默继续，后续 IPC 调用全部失败
- **已修复**：添加了 `ensureInitialized()` 重试机制

#### 问题 2：文件夹缩略图依赖链
- **症状**：文件夹缩略图很少加载
- **原因**：文件夹缩略图依赖子文件成功生成
- **状态**：需要改进


#### 问题 4：IPC 调用可靠性
- **症状**：编译版本 IPC 调用失败
- **原因**：CSP 配置缺少 `ipc.localhost`
- **已修复**：更新 CSP 配置

---

## 二、NeeView 关键设计模式详解

### 2.1 三层缓存策略

```
请求 → 内存缓存(L1) → 数据库缓存(L2) → 生成器(L3)
         ↑                 ↑
         └── 成功后回填 ──┘
```

**当前实现评估**：✅ 已正确实现

### 2.2 失败标记机制

NeeView 使用 `ThumbnailType.Empty` 标记失败的缩略图，避免重复生成：

```typescript
// 当前实现
private failedThumbnails = new Set<string>();
private failedRetryCount = new Map<string, number>();
private readonly MAX_RETRY_COUNT = 2;
```

**当前实现评估**：✅ 已正确实现，但缺少持久化

**改进建议**：
- 将失败标记持久化到数据库
- 添加失败原因分类（格式不支持 vs 临时错误）

### 2.3 优先级队列

NeeView 使用 `JobScheduler` 管理任务优先级：

```typescript
// 当前实现的优先级
type Priority = 'immediate' | 'high' | 'normal';
```

**当前实现评估**：⚠️ 部分实现

**改进建议**：
- 添加 `low` 优先级用于后台预加载
- 实现任务取消机制（目录切换时取消非当前目录任务）

### 2.4 目录切换处理

NeeView 的 `JobClient.CancelOrder` 在目录切换时取消旧任务：

```typescript
// 当前实现
setCurrentDirectory(path: string) {
  const oldPath = this.currentDirectory;
  this.currentDirectory = path;
  // 清理旧目录的失败标记
  this.clearFailedMarksForDirectory(oldPath);
}
```

**当前实现评估**：⚠️ 只清理失败标记，未取消排队任务

**改进建议**：
```typescript
setCurrentDirectory(path: string) {
  const oldPath = this.currentDirectory;
  this.currentDirectory = path;
  
  // 1. 取消非当前目录的 pending 任务
  this.taskQueue = this.taskQueue.filter(task => 
    task.priority === 'immediate' || task.path.startsWith(path)
  );
  
  // 2. 清理失败标记
  this.clearFailedMarksForDirectory(oldPath);
  
  // 3. 立即预热新目录
  this.warmupDirectory(/* items */);
}
```

---

## 三、改进建议

### 3.1 高优先级改进

#### 3.1.1 增强错误处理
```typescript
// 在 loadFromDb 中添加超时
private async loadFromDb(path: string, innerPath?: string, isFolder?: boolean): Promise<string | null> {
  const timeout = 5000; // 5秒超时
  try {
    const result = await Promise.race([
      invoke('load_thumbnail_from_db', { ... }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('IPC timeout')), timeout)
      )
    ]);
    // ...
  } catch (error) {
    if (error.message === 'IPC timeout') {
      console.warn('⚠️ 加载缩略图超时，稍后重试:', path);
      return null; // 不标记为失败，允许后续重试
    }
    // ...
  }
}
```

#### 3.1.2 文件夹缩略图独立处理
```typescript
// 文件夹缩略图应该有独立的生成策略
async getFolderThumbnail(folderPath: string): Promise<string | null> {
  // 1. 先检查数据库
  const cached = await this.loadFromDb(folderPath, undefined, true);
  if (cached) return cached;
  
  // 2. 主动扫描文件夹内容
  const items = await FileSystemAPI.browseDirectory(folderPath);
  
  // 3. 按优先级查找：封面 > 第一张图 > 第一个压缩包
  const coverImage = items.find(item => 
    item.name?.toLowerCase().match(/^(cover|folder|thumb)/));
  if (coverImage) {
    return this.getThumbnail(coverImage.path);
  }
  
  // 4. 查找第一张可用图片
  for (const item of items) {
    if (item.isImage) {
      const thumb = await this.getThumbnail(item.path);
      if (thumb) {
        // 同时保存为文件夹缩略图
        await this.saveFolderThumbnail(folderPath, thumb);
        return thumb;
      }
    }
  }
  
  return null;
}
```

### 3.2 中优先级改进

#### 3.2.1 批量预加载优化
```typescript
// 使用 Web Worker 进行批量预加载
private preloadWorker?: Worker;

async batchPreload(paths: string[]): Promise<void> {
  if (!this.preloadWorker) {
    this.preloadWorker = new Worker('/workers/thumbnailPreload.js');
  }
  
  return new Promise((resolve) => {
    this.preloadWorker!.postMessage({ type: 'preload', paths });
    this.preloadWorker!.onmessage = (e) => {
      if (e.data.type === 'complete') {
        resolve();
      } else if (e.data.type === 'thumbnail') {
        // 更新缓存
        this.cache.set(e.data.path, {
          pathKey: e.data.path,
          dataUrl: e.data.dataUrl,
          timestamp: Date.now()
        });
      }
    };
  });
}
```

#### 3.2.2 添加占位图机制
```typescript
// 生成失败时返回占位图
private getPlaceholderThumbnail(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  
  // 根据文件类型返回不同占位图
  switch (ext) {
    case 'zip':
    case 'cbz':
    case 'rar':
    case 'cbr':
      return '/placeholders/archive.svg';
    case 'mp4':
    case 'mkv':
    case 'avi':
      return '/placeholders/video.svg';
    default:
      return '/placeholders/image.svg';
  }
}
```

### 3.3 低优先级改进

#### 3.3.1 失败原因分类
```typescript
interface FailedThumbnail {
  path: string;
  reason: 'format_not_supported' | 'decode_error' | 'timeout' | 'ipc_error';
  retryCount: number;
  lastAttempt: number;
}

// 根据失败原因决定是否重试
private shouldRetry(failed: FailedThumbnail): boolean {
  // 格式不支持的不重试
  if (failed.reason === 'format_not_supported') return false;
  // 超时和 IPC 错误允许重试
  if (failed.reason === 'timeout' || failed.reason === 'ipc_error') {
    return failed.retryCount < this.MAX_RETRY_COUNT;
  }
  return false;
}
```

---

## 四、代码重构建议

### 4.1 模块化拆分

当前 `thumbnailManager.ts` 有 1400+ 行，建议拆分为：

```
src/lib/utils/thumbnail/
├── index.ts                 # 导出入口
├── ThumbnailManager.ts      # 主管理器（核心调度逻辑）
├── ThumbnailCache.ts        # 缓存管理（内存 + LRU）
├── ThumbnailQueue.ts        # 任务队列管理
├── ThumbnailLoader.ts       # 加载逻辑（数据库 + 生成）
├── ThumbnailPreloader.ts    # 预加载逻辑
├── FolderThumbnail.ts       # 文件夹缩略图特殊处理
└── types.ts                 # 类型定义
```

### 4.2 依赖注入

使用依赖注入提高可测试性：

```typescript
interface IThumbnailLoader {
  loadFromDb(path: string, options: LoadOptions): Promise<string | null>;
  generate(path: string, options: GenerateOptions): Promise<string | null>;
}

class ThumbnailManager {
  constructor(
    private readonly loader: IThumbnailLoader,
    private readonly cache: IThumbnailCache,
    private readonly queue: IThumbnailQueue
  ) {}
}
```

---

## 五、测试检查清单

### 5.1 编译版本测试

- [ ] 初始化成功后，控制台显示 "✅ 缩略图管理器初始化成功"
- [ ] 初始化失败时，自动重试最多 3 次
- [ ] EMM 初始化失败不影响缩略图功能
- [ ] 文件夹缩略图正确显示
- [ ] AVIF 图片缩略图正确生成
- [ ] 目录切换时旧任务被取消

### 5.2 性能测试

- [ ] 大目录（1000+ 文件）首次加载时间 < 3秒
- [ ] 内存缓存命中率 > 80%（热数据）
- [ ] 数据库缓存命中率 > 95%（冷启动）
- [ ] CPU 使用率平稳（无尖峰）

---

## 六、总结

当前实现已经很好地参考了 NeeView 的设计，但在以下方面需要改进：

1. **可靠性**：初始化重试、IPC 超时处理 ✅ 已部分修复
2. **文件夹缩略图**：需要独立的生成策略
3. **模块化**：代码需要拆分以提高可维护性
4. **错误处理**：需要更细粒度的失败分类

建议按优先级逐步实施改进，每次改进后进行充分测试。
