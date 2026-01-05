# NeeView 超大压缩包与超多图片优化指南

> **Phase 1 已完成** ✅ (2026-01-05)

## 概述

参考 NeeView 的架构设计，优化 NeoView 在处理超大压缩包（几千张图片）和快速翻页时的流畅浏览体验。

---

## 1. NeeView 核心优化机制分析

### 1.1 三层页面管理架构

NeeView 使用三层页面状态管理：

```
┌─────────────────────────────────────────────────────────────────┐
│                     BookPageLoader                               │
├─────────────────────────────────────────────────────────────────┤
│  ① ViewPages (当前显示页)                                        │
│     - State = PageContentState.View                              │
│     - 最高优先级，立即加载                                         │
│     - 使用 _jobClient (View优先级)                                │
├─────────────────────────────────────────────────────────────────┤
│  ② AheadPages (先读页)                                           │
│     - State = PageContentState.Ahead                             │
│     - 根据翻页方向预加载                                           │
│     - 使用 _jobAheadClient (Ahead优先级)                          │
├─────────────────────────────────────────────────────────────────┤
│  ③ None (未加载页)                                               │
│     - State = PageContentState.None                              │
│     - 不占用内存                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**关键代码参考**（`BookPageLoader.cs`）：

- `LoadMainAsync()`: 加载当前显示页
- `LoadAheadAsync()`: 基于方向的先读加载
- 先向主方向预读，再向反方向预读
- 使用 `_bookMemoryService.Cleanup()` 进行内存管理

### 1.2 Job 调度系统

NeeView 的 JobEngine 实现优先级调度：

```
┌─────────────────────────────────────────────────────────────────┐
│                       JobScheduler                               │
├─────────────────────────────────────────────────────────────────┤
│  优先级队列                                                       │
│  - 高优先级任务先执行（当前页 > 先读页 > 缩略图）                    │
│  - 任务可取消（快速翻页时取消过时任务）                              │
│  - 多 Worker 并行执行                                             │
├─────────────────────────────────────────────────────────────────┤
│  Order() 方法：                                                   │
│  - 按客户端优先级排序: OrderByDescending(e => e.Key.Category.Priority) │
│  - 自动取消不在新队列中的任务                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 内存池管理 (MemoryPool)

NeeView 使用智能内存池：

```
┌─────────────────────────────────────────────────────────────────┐
│                       BookMemoryService                          │
├─────────────────────────────────────────────────────────────────┤
│  特性：                                                          │
│  - 可配置最大内存限制 (CacheMemorySize MB)                         │
│  - 基于距离的淘汰策略 (PageDistanceComparer)                       │
│  - 锁定机制防止当前页被清理 (IsMemoryLocked)                        │
│  - 方向感知：翻页反方向的页面优先清理                               │
├─────────────────────────────────────────────────────────────────┤
│  Cleanup(origin, direction) 算法：                               │
│  1. 锁定页面不删除                                                │
│  2. 翻页反方向的页面优先删除                                        │
│  3. 距离当前页越远越先删除                                          │
└─────────────────────────────────────────────────────────────────┘
```

### 1.4 压缩包事前展开 (ArchivePreExtractor)

针对 Solid 压缩包的优化：

```
┌─────────────────────────────────────────────────────────────────┐
│                   ArchivePreExtractor                            │
├─────────────────────────────────────────────────────────────────┤
│  问题：                                                          │
│  - Solid 7z/RAR 必须顺序解压，无法随机访问                         │
│  - 提取第 N 页需要先解压 1~N-1 页                                  │
├─────────────────────────────────────────────────────────────────┤
│  解决方案：                                                       │
│  - 后台异步全量预展开到临时目录                                     │
│  - 内存展开 vs 文件展开 (SevenZipHybridExtractor)                  │
│  - 小文件解压到内存，大文件/嵌套压缩包解压到临时文件                  │
│  - 内存限制：PreExtractSolidSize (默认 1000MB)                     │
├─────────────────────────────────────────────────────────────────┤
│  WaitPreExtractAsync(entry):                                     │
│  - 如果页面数据不存在，等待预展开完成                               │
│  - 支持 Sleep/Resume 控制                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 对 NeoView 的优化建议

### 2.1 后端优化 (Rust)

#### 2.1.1 实现基于距离的缓存淘汰

**当前问题**：`lru_image_cache.rs` 使用简单 LRU，不感知翻页方向

**优化方案**：

```rust
// 新增：基于方向的页面距离计算
pub struct DirectionalLruCache {
    cache: LruCache<String, CacheEntry>,
    current_index: AtomicI32,
    direction: AtomicI32, // 1 = forward, -1 = backward
}

impl DirectionalLruCache {
    /// 清理时考虑翻页方向
    pub fn evict_by_distance(&mut self, origin: i32, direction: i32) {
        let entries: Vec<_> = self.cache.iter()
            .filter_map(|(key, entry)| {
                entry.page_index.map(|idx| (key.clone(), idx, entry.lock_count))
            })
            .collect();

        // 按距离排序（翻页反方向优先删除）
        let mut sorted: Vec<_> = entries.into_iter()
            .filter(|(_, _, lock)| *lock == 0) // 跳过锁定的
            .collect();

        sorted.sort_by(|a, b| {
            let dist_a = (a.1 - origin) * direction;
            let dist_b = (b.1 - origin) * direction;

            // 反方向（负距离）优先删除
            if dist_a < 0 && dist_b >= 0 { return std::cmp::Ordering::Less; }
            if dist_a >= 0 && dist_b < 0 { return std::cmp::Ordering::Greater; }

            // 同方向按距离远近
            dist_b.cmp(&dist_a) // 远的先删
        });

        // 删除直到满足内存限制
        while self.total_size > self.max_size && !sorted.is_empty() {
            if let Some((key, _, _)) = sorted.pop() {
                self.cache.pop(&key);
            }
        }
    }
}
```

#### 2.1.2 优化 Solid 压缩包处理

**当前问题**：每次提取都需重新打开压缩包

**优化方案**：

```rust
// 新增：Solid 压缩包预展开器
pub struct SolidArchivePreExtractor {
    archive_path: PathBuf,
    temp_dir: PathBuf,
    state: RwLock<PreExtractState>,
    cancel_token: AtomicBool,
    extracted_entries: RwLock<HashMap<String, PathBuf>>,
}

impl SolidArchivePreExtractor {
    /// 后台预展开所有文件
    pub async fn pre_extract_async(&self) -> Result<(), Error> {
        let entries = self.list_entries()?;

        for entry in entries {
            if self.cancel_token.load(Ordering::Relaxed) {
                break;
            }

            let temp_path = self.temp_dir.join(&entry.name);

            // 解压到临时目录
            self.extract_entry(&entry, &temp_path).await?;

            // 记录已解压
            self.extracted_entries.write()
                .insert(entry.name.clone(), temp_path);
        }

        Ok(())
    }

    /// 获取页面数据（优先使用预展开结果）
    pub async fn get_entry_data(&self, name: &str) -> Result<Vec<u8>, Error> {
        // 检查是否已预展开
        if let Some(temp_path) = self.extracted_entries.read().get(name) {
            return std::fs::read(temp_path).map_err(Into::into);
        }

        // 等待预展开完成
        self.wait_for_entry(name).await
    }
}
```

#### 2.1.3 实现 Job 优先级调度

```rust
// 新增：优先级任务调度器
pub struct PriorityJobScheduler {
    queues: Vec<VecDeque<Job>>, // 多优先级队列
    workers: Vec<JoinHandle<()>>,
    notify: Arc<Notify>,
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum JobPriority {
    View = 100,      // 当前页
    AheadHigh = 80,  // 前后1页
    AheadNormal = 50,// 前后2-3页
    AheadLow = 20,   // 前后4-5页
    Thumbnail = 10,  // 缩略图
}

impl PriorityJobScheduler {
    pub fn submit(&self, job: Job, priority: JobPriority) {
        let queue_idx = match priority {
            JobPriority::View => 0,
            JobPriority::AheadHigh => 1,
            JobPriority::AheadNormal => 2,
            JobPriority::AheadLow => 3,
            JobPriority::Thumbnail => 4,
        };

        self.queues[queue_idx].push_back(job);
        self.notify.notify_one();
    }

    pub fn cancel_below_priority(&self, priority: JobPriority) {
        // 取消低于指定优先级的所有任务
        for i in (priority as usize + 1)..self.queues.len() {
            for job in self.queues[i].drain(..) {
                job.cancel();
            }
        }
    }
}
```

### 2.2 前端优化 (TypeScript/Svelte)

#### 2.2.1 优化 renderQueue 的方向感知

**当前代码**（`renderQueue.ts`）已经有基础实现，建议增强：

```typescript
// 优化：添加方向感知的预加载范围计算
private calculatePrefetchRange(
  currentIndex: number,
  direction: 1 | -1,
  totalPages: number
): { forward: number[]; backward: number[] } {
  const { highRange, normalRange, lowRange } = this.config;

  // 主方向预加载更多
  const primaryRange = direction > 0
    ? { start: 1, end: lowRange }
    : { start: -lowRange, end: -1 };

  // 次方向预加载较少
  const secondaryRange = direction > 0
    ? { start: -highRange, end: -1 }
    : { start: 1, end: highRange };

  const forward: number[] = [];
  const backward: number[] = [];

  // 主方向
  for (let i = primaryRange.start; i <= primaryRange.end; i++) {
    const idx = currentIndex + i;
    if (idx >= 0 && idx < totalPages) {
      if (i > 0) forward.push(idx);
      else backward.push(idx);
    }
  }

  // 次方向
  for (let i = secondaryRange.start; i <= secondaryRange.end; i++) {
    const idx = currentIndex + i;
    if (idx >= 0 && idx < totalPages) {
      if (i > 0) forward.push(idx);
      else backward.push(idx);
    }
  }

  return { forward, backward };
}
```

#### 2.2.2 增加内存压力检测

```typescript
// 新增：内存压力监控
class MemoryPressureMonitor {
	private maxCacheSize: number;
	private warningThreshold = 0.8; // 80%

	async checkMemoryPressure(): Promise<'low' | 'medium' | 'high'> {
		const stats = preDecodeCache.getStats();
		const usage = stats.totalSize / this.maxCacheSize;

		if (usage < 0.5) return 'low';
		if (usage < this.warningThreshold) return 'medium';
		return 'high';
	}

	async adjustPreloadRange(): Promise<void> {
		const pressure = await this.checkMemoryPressure();

		switch (pressure) {
			case 'high':
				// 减少预加载范围
				renderQueue.setConfig({
					highRange: 1,
					normalRange: 1,
					lowRange: 2
				});
				// 清理远端缓存
				preDecodeCache.evictDistant(this.currentPage, 3);
				break;

			case 'medium':
				// 使用默认配置
				renderQueue.setConfig(DEFAULT_PRELOAD_CONFIG);
				break;

			case 'low':
				// 可以更激进地预加载
				renderQueue.setConfig(HIGH_END_PRELOAD_CONFIG);
				break;
		}
	}
}
```

#### 2.2.3 优化快速翻页体验

```typescript
// 新增：快速翻页检测与优化
class RapidPageTurnOptimizer {
	private lastPageTime = 0;
	private rapidTurnCount = 0;
	private readonly rapidTurnThreshold = 200; // ms

	onPageTurn(newIndex: number): void {
		const now = Date.now();
		const delta = now - this.lastPageTime;
		this.lastPageTime = now;

		if (delta < this.rapidTurnThreshold) {
			this.rapidTurnCount++;

			if (this.rapidTurnCount > 3) {
				// 快速翻页模式：
				// 1. 取消所有非当前页的加载
				renderQueue.cancelAll();

				// 2. 只加载当前页，跳过预加载
				this.loadCurrentPageOnly(newIndex);

				// 3. 暂停预解码
				preDecodeCache.pause();
			}
		} else {
			// 翻页速度正常，恢复正常预加载
			if (this.rapidTurnCount > 0) {
				this.rapidTurnCount = 0;
				preDecodeCache.resume();
				renderQueue.setCurrentPage(newIndex);
			}
		}
	}

	private async loadCurrentPageOnly(index: number): Promise<void> {
		// 仅加载当前页，使用最高优先级
		const url = await imagePool.get(index);
		if (url) {
			await preDecodeCache.preDecodeAndCache(index, url.url);
		}
	}
}
```

### 2.3 性能配置建议

```typescript
// 根据压缩包大小自动调整配置
interface PerformanceProfile {
	name: string;
	archiveSizeRange: [number, number]; // [minPages, maxPages]
	preloadConfig: PreloadConfig;
	cacheMemoryMB: number;
	preExtractEnabled: boolean;
}

const PROFILES: PerformanceProfile[] = [
	{
		name: 'small',
		archiveSizeRange: [0, 100],
		preloadConfig: HIGH_END_PRELOAD_CONFIG,
		cacheMemoryMB: 200,
		preExtractEnabled: false
	},
	{
		name: 'medium',
		archiveSizeRange: [100, 500],
		preloadConfig: DEFAULT_PRELOAD_CONFIG,
		cacheMemoryMB: 300,
		preExtractEnabled: false
	},
	{
		name: 'large',
		archiveSizeRange: [500, 2000],
		preloadConfig: LOW_END_PRELOAD_CONFIG,
		cacheMemoryMB: 400,
		preExtractEnabled: true
	},
	{
		name: 'huge',
		archiveSizeRange: [2000, Infinity],
		preloadConfig: {
			highRange: 1,
			normalRange: 2,
			lowRange: 3,
			highDelay: 100,
			normalDelay: 300,
			lowDelay: 500
		},
		cacheMemoryMB: 500,
		preExtractEnabled: true
	}
];
```

---

## 3. 实施优先级

### Phase 1: 快速见效 ✅ 已完成

1. ✅ **距离感知缓存淘汰** - 修改 `lru_image_cache.rs`
   - 添加 `page_index` 字段到缓存条目
   - 实现 `evict_by_distance(origin, direction)` 方法
   - 翻页反方向页面优先删除
   - 添加页面锁定机制 (`lock_page` / `unlock_page`)
2. ✅ **Solid 压缩包预展开** - 新增 `solid_pre_extractor.rs`
   - 检测 Solid 7z/CB7 压缩包
   - 后台异步展开到临时目录
   - 混合解压策略：小文件→内存，大文件→临时文件
   - 支持取消/暂停/恢复

3. ✅ **快速翻页检测** - 修改 `renderQueue.ts`
   - 检测连续快速翻页（间隔 < 200ms，连续 3 次）
   - 快速翻页模式：仅加载当前页，跳过预加载
   - 停止翻页后 500ms 自动恢复正常预加载
   - 添加翻页方向感知的智能预加载

### Phase 2: 核心优化

4. **优先级任务调度** - 新增 `job_scheduler.rs`
5. **Solid 压缩包预展开** - 新增 `solid_pre_extractor.rs`

### Phase 3: 精细调优

6. **性能配置文件** - 根据压缩包大小自动选择配置
7. **监控面板** - 添加性能监控 UI

---

## 4. 参考文件

NeeView 核心文件：

- `BookPageLoader.cs` - 页面加载器
- `BookMemoryService.cs` - 内存管理
- `MemoryPool.cs` - 内存池
- `ArchivePreExtractor.cs` - 压缩包预展开
- `SevenZipHybridExtractor.cs` - 混合解压策略
- `JobScheduler.cs` - 任务调度
- `PerformanceConfig.cs` - 性能配置

NeoView 当前实现：

- `archive_prefetcher.rs` - 当前预取器
- `image_cache.rs` - 图像缓存
- `renderQueue.ts` - 渲染队列
- `preDecodeCache.svelte.ts` - 预解码缓存
