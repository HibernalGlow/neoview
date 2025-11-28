# NeoView 图像加载系统重构指南

## 参考 NeeView 架构的 Tauri 实现方案

---

## 一、核心问题分析

根据 `bug.log` 分析，当前系统存在以下问题：

| 问题 | 原因 | 影响 |
|------|------|------|
| 页面切换 effect 触发 4 次 | Svelte 响应式系统过度触发 | 重复执行加载逻辑 |
| 缓存命中后又重新加载 | 缓存 key 不一致 | 18 页全部重新从 zip 读取 |
| 缩略图请求全部失败 | blobCache 未初始化 | 15 次无效异步操作 |
| 预加载执行 2 轮 | 缺乏去重机制 | 重复 I/O 操作 |
| 视图模式互相干扰 | 缺乏统一的页面抽象层 | 状态混乱 |

---

## 二、NeeView 核心架构解析

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      PageFrameBox (视图层)                       │
│  - 管理所有 PageFrameContainer                                   │
│  - 处理变换（缩放、平移、旋转）                                    │
│  - 响应用户交互                                                   │
├─────────────────────────────────────────────────────────────────┤
│                  PageFrameContainer (容器层)                     │
│  - 包含一个 PageFrameContent                                     │
│  - 管理容器的布局和变换                                           │
│  - 支持动画过渡                                                   │
├─────────────────────────────────────────────────────────────────┤
│                  PageFrameContent (内容层)                       │
│  - 包含一个 PageFrame                                            │
│  - 管理 ViewContent 列表                                         │
│  - 处理内容的渲染和更新                                           │
├─────────────────────────────────────────────────────────────────┤
│                     PageFrame (帧层)                             │
│  - 包含 1-2 个 PageFrameElement                                  │
│  - 定义帧的范围 (PageRange)                                       │
│  - 计算帧的尺寸和布局                                             │
├─────────────────────────────────────────────────────────────────┤
│                  PageFrameElement (元素层)                       │
│  - 对应一个 Page 的一部分                                         │
│  - 支持页面分割 (Part 0/1)                                        │
│  - 包含缩放和裁剪信息                                             │
├─────────────────────────────────────────────────────────────────┤
│                       Page (页面层)                              │
│  - 物理页面，对应一个文件                                         │
│  - 包含 PageContent (内容) 和 Thumbnail (缩略图)                  │
│  - 管理加载状态                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 关键概念

#### PagePosition (页面位置)
```typescript
interface PagePosition {
  index: number;  // 页面索引 (0-based)
  part: 0 | 1;    // 页面部分 (0=左半/前半, 1=右半/后半)
}
```

#### PageRange (页面范围)
```typescript
interface PageRange {
  min: PagePosition;  // 范围起始
  max: PagePosition;  // 范围结束
  
  // 计算属性
  partSize: number;   // 部分数量 (1-4)
  pageSize: number;   // 页面数量 (1-2)
}
```

#### PageFrame (页面帧)
```typescript
interface PageFrame {
  elements: PageFrameElement[];  // 1-2 个元素
  frameRange: PageRange;         // 帧覆盖的范围
  direction: 1 | -1;             // 阅读方向
  size: Size;                    // 帧尺寸
  terminal: PageTerminal;        // 是否为首/尾帧
}
```

### 2.3 智能分割横向页面

NeeView 的核心功能之一是**智能分割横向页面**：

```
原始页面列表:        虚拟页面列表 (单页模式 + 分割横向):
┌─────────────┐     ┌───────┬───────┐
│   Page 0    │     │ 0-L   │ 0-R   │  ← 横向页面分割为两部分
│  (横向)     │     │(part0)│(part1)│
└─────────────┘     └───────┴───────┘
┌─────────────┐     ┌─────────────┐
│   Page 1    │     │   Page 1    │  ← 纵向页面保持不变
│  (纵向)     │     │             │
└─────────────┘     └─────────────┘
┌─────────────┐     ┌───────┬───────┐
│   Page 2    │     │ 2-L   │ 2-R   │  ← 横向页面分割为两部分
│  (横向)     │     │(part0)│(part1)│
└─────────────┘     └───────┴───────┘

物理页数: 3          虚拟页数: 5
```

---

## 三、NeoView 重构方案

### 3.1 新架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        Rust Backend                              │
├─────────────────────────────────────────────────────────────────┤
│  BookSource        │ 管理压缩包/文件夹的物理页面列表              │
│  PageLoader        │ 异步加载页面内容，支持优先级队列              │
│  ThumbnailCache    │ 缩略图缓存 (SQLite + 内存)                   │
│  ImageDecoder      │ 图像解码 (支持 AVIF, WebP, JXL 等)           │
│  UpscaleEngine     │ 超分引擎 (PyO3 + RealCUGAN/ESRGAN)           │
└─────────────────────────────────────────────────────────────────┘
                              ↕ IPC (Tauri Commands)
┌─────────────────────────────────────────────────────────────────┐
│                      TypeScript Frontend                         │
├─────────────────────────────────────────────────────────────────┤
│  BookStore         │ 书籍状态管理 (Svelte 5 Runes)                │
│  VirtualPageList   │ 虚拟页面列表 (支持分割、排序、过滤)           │
│  PageFrameManager  │ 页面帧管理 (单页/双页/全景模式)               │
│  PreloadPipeline   │ 预加载流水线 (图像 + 超分 + 缩略图)           │
│  ViewerController  │ 视图控制器 (缩放、平移、旋转)                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 核心模块设计

#### 3.2.1 VirtualPageList (虚拟页面列表)

这是解决"智能分割横向页面"的核心模块：

```typescript
// src/lib/core/virtualPageList.ts

export interface PhysicalPage {
  index: number;           // 物理索引
  path: string;            // 文件路径 (压缩包内路径或文件系统路径)
  size: Size;              // 原始尺寸
  aspectRatio: number;     // 宽高比
  isLandscape: boolean;    // 是否横向
  lastModified: number;    // 最后修改时间
  fileSize: number;        // 文件大小
}

export interface VirtualPage {
  virtualIndex: number;    // 虚拟索引
  physicalPage: PhysicalPage;
  part: 0 | 1;             // 页面部分
  cropRect?: Rect;         // 裁剪区域 (分割时使用)
}

export interface VirtualPageListConfig {
  // 分割设置
  divideLandscape: boolean;      // 是否分割横向页面
  divideThreshold: number;       // 分割阈值 (宽高比 > 此值才分割, 默认 1.0)
  
  // 显示设置
  pageMode: 'single' | 'wide';   // 单页/双页模式
  readOrder: 'ltr' | 'rtl';      // 阅读方向
  
  // 特殊页面处理
  singleFirstPage: boolean;      // 首页单独显示
  singleLastPage: boolean;       // 尾页单独显示
  supportWidePage: boolean;      // 横向页面视为双页
}

export class VirtualPageList {
  private physicalPages: PhysicalPage[] = [];
  private virtualPages: VirtualPage[] = [];
  private config: VirtualPageListConfig;
  
  // 从物理页面列表构建虚拟页面列表
  rebuild(): void {
    this.virtualPages = [];
    let virtualIndex = 0;
    
    for (const physical of this.physicalPages) {
      if (this.shouldDivide(physical)) {
        // 分割横向页面
        const [leftCrop, rightCrop] = this.calculateCropRects(physical);
        
        // 根据阅读方向决定顺序
        const parts = this.config.readOrder === 'rtl' 
          ? [{ part: 1, crop: rightCrop }, { part: 0, crop: leftCrop }]
          : [{ part: 0, crop: leftCrop }, { part: 1, crop: rightCrop }];
        
        for (const { part, crop } of parts) {
          this.virtualPages.push({
            virtualIndex: virtualIndex++,
            physicalPage: physical,
            part: part as 0 | 1,
            cropRect: crop,
          });
        }
      } else {
        // 不分割
        this.virtualPages.push({
          virtualIndex: virtualIndex++,
          physicalPage: physical,
          part: 0,
        });
      }
    }
  }
  
  private shouldDivide(page: PhysicalPage): boolean {
    if (!this.config.divideLandscape) return false;
    if (this.config.pageMode !== 'single') return false;
    return page.aspectRatio > this.config.divideThreshold;
  }
  
  private calculateCropRects(page: PhysicalPage): [Rect, Rect] {
    const halfWidth = page.size.width / 2;
    return [
      { x: 0, y: 0, width: halfWidth, height: page.size.height },
      { x: halfWidth, y: 0, width: halfWidth, height: page.size.height },
    ];
  }
  
  // 获取虚拟页面总数
  get length(): number {
    return this.virtualPages.length;
  }
  
  // 根据虚拟索引获取虚拟页面
  getVirtualPage(virtualIndex: number): VirtualPage | null {
    return this.virtualPages[virtualIndex] ?? null;
  }
  
  // 根据物理索引获取所有对应的虚拟页面
  getVirtualPagesForPhysical(physicalIndex: number): VirtualPage[] {
    return this.virtualPages.filter(v => v.physicalPage.index === physicalIndex);
  }
  
  // 虚拟索引转物理索引
  toPhysicalIndex(virtualIndex: number): number {
    return this.virtualPages[virtualIndex]?.physicalPage.index ?? -1;
  }
}
```

#### 3.2.2 PageFrameManager (页面帧管理器)

```typescript
// src/lib/core/pageFrameManager.ts

export interface PageFrameConfig {
  framePageSize: 1 | 2;          // 帧内页面数 (1=单页, 2=双页)
  supportWidePage: boolean;       // 横向页面视为双页
  singleFirstPage: boolean;       // 首页单独显示
  singleLastPage: boolean;        // 尾页单独显示
  insertDummyPage: boolean;       // 插入空白页
  readOrder: 'ltr' | 'rtl';       // 阅读方向
}

export interface PageFrameElement {
  virtualPage: VirtualPage;
  scale: number;                  // 元素缩放
  offset: Point;                  // 元素偏移
  isDummy: boolean;               // 是否为空白页
}

export interface PageFrame {
  id: string;                     // 唯一标识
  elements: PageFrameElement[];   // 1-2 个元素
  range: PageRange;               // 覆盖的虚拟页面范围
  direction: 1 | -1;              // 创建方向
  size: Size;                     // 帧尺寸
  isFirst: boolean;               // 是否为首帧
  isLast: boolean;                // 是否为尾帧
}

export class PageFrameManager {
  private virtualPageList: VirtualPageList;
  private config: PageFrameConfig;
  private frameCache: Map<string, PageFrame> = new Map();
  
  // 创建页面帧
  createFrame(position: PagePosition, direction: 1 | -1): PageFrame | null {
    const cacheKey = `${position.index}-${position.part}-${direction}`;
    
    // 检查缓存
    if (this.frameCache.has(cacheKey)) {
      return this.frameCache.get(cacheKey)!;
    }
    
    const frame = this.buildFrame(position, direction);
    if (frame) {
      this.frameCache.set(cacheKey, frame);
    }
    return frame;
  }
  
  private buildFrame(position: PagePosition, direction: 1 | -1): PageFrame | null {
    const virtualPage = this.virtualPageList.getVirtualPage(position.index);
    if (!virtualPage) return null;
    
    const element1 = this.createElement(virtualPage);
    
    // 单页模式
    if (this.config.framePageSize === 1) {
      return this.createSingleFrame(element1, position, direction);
    }
    
    // 双页模式
    // 检查是否为横向页面 (视为双页)
    if (this.config.supportWidePage && virtualPage.physicalPage.isLandscape) {
      return this.createSingleFrame(element1, position, direction);
    }
    
    // 检查首页/尾页单独显示
    if (this.config.singleFirstPage && position.index === 0) {
      return this.createSingleFrame(element1, position, direction);
    }
    if (this.config.singleLastPage && position.index === this.virtualPageList.length - 1) {
      return this.createSingleFrame(element1, position, direction);
    }
    
    // 尝试获取第二页
    const nextIndex = position.index + direction;
    const virtualPage2 = this.virtualPageList.getVirtualPage(nextIndex);
    
    if (!virtualPage2) {
      // 没有第二页，可能插入空白页
      if (this.config.insertDummyPage) {
        return this.createWideFrameWithDummy(element1, position, direction);
      }
      return this.createSingleFrame(element1, position, direction);
    }
    
    // 第二页也是横向，不合并
    if (this.config.supportWidePage && virtualPage2.physicalPage.isLandscape) {
      return this.createSingleFrame(element1, position, direction);
    }
    
    // 创建双页帧
    const element2 = this.createElement(virtualPage2);
    return this.createWideFrame(element1, element2, position, direction);
  }
  
  // ... 其他方法
}
```

#### 3.2.3 PreloadPipeline (预加载流水线)

```typescript
// src/lib/core/preloadPipeline.ts

export interface PreloadTask {
  id: string;
  type: 'image' | 'thumbnail' | 'upscale';
  virtualIndex: number;
  priority: number;           // 优先级 (越小越高)
  status: 'pending' | 'loading' | 'done' | 'error';
  abortController?: AbortController;
}

export interface PreloadConfig {
  // 预加载范围
  preloadAhead: number;       // 向前预加载页数 (默认 3)
  preloadBehind: number;      // 向后预加载页数 (默认 1)
  
  // 并发控制
  maxConcurrentImages: number;     // 最大图像并发 (默认 4)
  maxConcurrentThumbnails: number; // 最大缩略图并发 (默认 8)
  maxConcurrentUpscale: number;    // 最大超分并发 (默认 1)
  
  // 超分设置
  autoUpscale: boolean;       // 自动超分
  upscaleModel: string;       // 超分模型
}

export class PreloadPipeline {
  private config: PreloadConfig;
  private taskQueue: Map<string, PreloadTask> = new Map();
  private runningTasks: Set<string> = new Set();
  
  // 当前焦点位置
  private focusIndex: number = 0;
  
  // 更新焦点位置，重新计算预加载任务
  setFocus(virtualIndex: number): void {
    if (this.focusIndex === virtualIndex) return;
    
    this.focusIndex = virtualIndex;
    this.recalculateTasks();
  }
  
  private recalculateTasks(): void {
    // 计算需要预加载的范围
    const start = Math.max(0, this.focusIndex - this.config.preloadBehind);
    const end = this.focusIndex + this.config.preloadAhead;
    
    // 取消不在范围内的任务
    for (const [id, task] of this.taskQueue) {
      if (task.virtualIndex < start || task.virtualIndex > end) {
        this.cancelTask(id);
      }
    }
    
    // 添加新任务
    for (let i = start; i <= end; i++) {
      const priority = Math.abs(i - this.focusIndex);
      this.ensureTask(i, 'image', priority);
      
      if (this.config.autoUpscale) {
        this.ensureTask(i, 'upscale', priority + 100); // 超分优先级较低
      }
    }
    
    // 触发任务执行
    this.processQueue();
  }
  
  private ensureTask(virtualIndex: number, type: PreloadTask['type'], priority: number): void {
    const id = `${type}-${virtualIndex}`;
    
    if (this.taskQueue.has(id)) {
      // 更新优先级
      const task = this.taskQueue.get(id)!;
      task.priority = Math.min(task.priority, priority);
      return;
    }
    
    this.taskQueue.set(id, {
      id,
      type,
      virtualIndex,
      priority,
      status: 'pending',
    });
  }
  
  private async processQueue(): Promise<void> {
    // 按优先级排序
    const pending = Array.from(this.taskQueue.values())
      .filter(t => t.status === 'pending')
      .sort((a, b) => a.priority - b.priority);
    
    for (const task of pending) {
      if (!this.canStartTask(task.type)) continue;
      
      this.startTask(task);
    }
  }
  
  private canStartTask(type: PreloadTask['type']): boolean {
    const running = Array.from(this.taskQueue.values())
      .filter(t => t.status === 'loading' && t.type === type);
    
    const limit = {
      image: this.config.maxConcurrentImages,
      thumbnail: this.config.maxConcurrentThumbnails,
      upscale: this.config.maxConcurrentUpscale,
    }[type];
    
    return running.length < limit;
  }
  
  private async startTask(task: PreloadTask): Promise<void> {
    task.status = 'loading';
    task.abortController = new AbortController();
    this.runningTasks.add(task.id);
    
    try {
      switch (task.type) {
        case 'image':
          await this.loadImage(task);
          break;
        case 'thumbnail':
          await this.loadThumbnail(task);
          break;
        case 'upscale':
          await this.upscaleImage(task);
          break;
      }
      task.status = 'done';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // 被取消，移除任务
        this.taskQueue.delete(task.id);
      } else {
        task.status = 'error';
        console.error(`Task ${task.id} failed:`, error);
      }
    } finally {
      this.runningTasks.delete(task.id);
      this.processQueue(); // 继续处理队列
    }
  }
  
  private cancelTask(id: string): void {
    const task = this.taskQueue.get(id);
    if (!task) return;
    
    if (task.status === 'loading' && task.abortController) {
      task.abortController.abort();
    }
    
    this.taskQueue.delete(id);
  }
  
  // ... 具体加载方法
}
```

#### 3.2.4 ViewerController (视图控制器)

```typescript
// src/lib/core/viewerController.ts

export type ViewMode = 'normal' | 'panorama' | 'loupe';

export interface ViewState {
  mode: ViewMode;
  
  // 变换状态
  scale: number;
  rotation: number;
  offset: Point;
  
  // 全景模式状态
  panoramaOffset: number;
  
  // 放大镜模式状态
  loupeCenter: Point;
  loupeScale: number;
}

export interface ViewerConfig {
  // 缩放设置
  minScale: number;           // 最小缩放 (默认 0.1)
  maxScale: number;           // 最大缩放 (默认 10)
  scaleStep: number;          // 缩放步进 (默认 0.1)
  
  // 适应模式
  fitMode: 'contain' | 'cover' | 'width' | 'height' | 'none';
  
  // 动画设置
  animationDuration: number;  // 动画时长 (ms)
  animationEasing: string;    // 缓动函数
}

export class ViewerController {
  private state: ViewState;
  private config: ViewerConfig;
  private containerSize: Size;
  private contentSize: Size;
  
  // 状态变化回调
  onStateChange?: (state: ViewState) => void;
  
  // 设置视图模式
  setMode(mode: ViewMode): void {
    if (this.state.mode === mode) return;
    
    // 退出当前模式
    this.exitMode(this.state.mode);
    
    // 进入新模式
    this.state.mode = mode;
    this.enterMode(mode);
    
    this.notifyChange();
  }
  
  private exitMode(mode: ViewMode): void {
    switch (mode) {
      case 'panorama':
        this.state.panoramaOffset = 0;
        break;
      case 'loupe':
        this.state.loupeCenter = { x: 0, y: 0 };
        this.state.loupeScale = 1;
        break;
    }
  }
  
  private enterMode(mode: ViewMode): void {
    switch (mode) {
      case 'normal':
        this.fitToContainer();
        break;
      case 'panorama':
        this.state.scale = this.calculatePanoramaScale();
        break;
      case 'loupe':
        this.state.loupeScale = 2;
        break;
    }
  }
  
  // 适应容器
  fitToContainer(): void {
    switch (this.config.fitMode) {
      case 'contain':
        this.state.scale = Math.min(
          this.containerSize.width / this.contentSize.width,
          this.containerSize.height / this.contentSize.height
        );
        break;
      case 'cover':
        this.state.scale = Math.max(
          this.containerSize.width / this.contentSize.width,
          this.containerSize.height / this.contentSize.height
        );
        break;
      case 'width':
        this.state.scale = this.containerSize.width / this.contentSize.width;
        break;
      case 'height':
        this.state.scale = this.containerSize.height / this.contentSize.height;
        break;
      case 'none':
        this.state.scale = 1;
        break;
    }
    
    this.state.offset = { x: 0, y: 0 };
    this.notifyChange();
  }
  
  // 缩放
  zoom(delta: number, center?: Point): void {
    const newScale = Math.max(
      this.config.minScale,
      Math.min(this.config.maxScale, this.state.scale * (1 + delta * this.config.scaleStep))
    );
    
    if (center) {
      // 以指定点为中心缩放
      const ratio = newScale / this.state.scale;
      this.state.offset = {
        x: center.x - (center.x - this.state.offset.x) * ratio,
        y: center.y - (center.y - this.state.offset.y) * ratio,
      };
    }
    
    this.state.scale = newScale;
    this.notifyChange();
  }
  
  // 平移
  pan(delta: Point): void {
    this.state.offset = {
      x: this.state.offset.x + delta.x,
      y: this.state.offset.y + delta.y,
    };
    this.notifyChange();
  }
  
  // 旋转
  rotate(angle: number): void {
    this.state.rotation = (this.state.rotation + angle) % 360;
    this.notifyChange();
  }
  
  // 全景模式滚动
  panoramaScroll(delta: number): void {
    if (this.state.mode !== 'panorama') return;
    
    const maxOffset = this.contentSize.height * this.state.scale - this.containerSize.height;
    this.state.panoramaOffset = Math.max(0, Math.min(maxOffset, this.state.panoramaOffset + delta));
    this.notifyChange();
  }
  
  // 放大镜移动
  loupeMove(center: Point): void {
    if (this.state.mode !== 'loupe') return;
    
    this.state.loupeCenter = center;
    this.notifyChange();
  }
  
  private notifyChange(): void {
    this.onStateChange?.(this.state);
  }
}
```

---

## 四、Rust 后端设计

### 4.1 PageLoader (页面加载器)

```rust
// src-tauri/src/core/page_loader.rs

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock, Semaphore};
use priority_queue::PriorityQueue;

#[derive(Clone, Debug)]
pub struct LoadRequest {
    pub book_path: String,
    pub page_path: String,
    pub page_index: usize,
    pub priority: i32,  // 越小优先级越高
    pub request_id: String,
}

#[derive(Clone, Debug)]
pub struct LoadResult {
    pub request_id: String,
    pub page_index: usize,
    pub data: Vec<u8>,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
}

pub struct PageLoader {
    // 请求队列
    queue: Arc<RwLock<PriorityQueue<LoadRequest, i32>>>,
    
    // 并发控制
    semaphore: Arc<Semaphore>,
    
    // 缓存
    cache: Arc<RwLock<HashMap<String, LoadResult>>>,
    
    // 结果通道
    result_tx: mpsc::Sender<LoadResult>,
    
    // 取消信号
    cancel_tokens: Arc<RwLock<HashMap<String, tokio::sync::oneshot::Sender<()>>>>,
}

impl PageLoader {
    pub fn new(max_concurrent: usize) -> (Self, mpsc::Receiver<LoadResult>) {
        let (result_tx, result_rx) = mpsc::channel(100);
        
        let loader = Self {
            queue: Arc::new(RwLock::new(PriorityQueue::new())),
            semaphore: Arc::new(Semaphore::new(max_concurrent)),
            cache: Arc::new(RwLock::new(HashMap::new())),
            result_tx,
            cancel_tokens: Arc::new(RwLock::new(HashMap::new())),
        };
        
        (loader, result_rx)
    }
    
    /// 提交加载请求
    pub async fn submit(&self, request: LoadRequest) {
        // 检查缓存
        {
            let cache = self.cache.read().await;
            if cache.contains_key(&request.request_id) {
                return;
            }
        }
        
        // 加入队列
        let priority = -request.priority; // PriorityQueue 是最大堆
        let mut queue = self.queue.write().await;
        queue.push(request, priority);
        
        // 触发处理
        self.process_queue().await;
    }
    
    /// 取消请求
    pub async fn cancel(&self, request_id: &str) {
        let mut tokens = self.cancel_tokens.write().await;
        if let Some(tx) = tokens.remove(request_id) {
            let _ = tx.send(());
        }
    }
    
    /// 清空队列
    pub async fn clear(&self) {
        let mut queue = self.queue.write().await;
        queue.clear();
        
        let mut tokens = self.cancel_tokens.write().await;
        for (_, tx) in tokens.drain() {
            let _ = tx.send(());
        }
    }
    
    /// 更新优先级
    pub async fn update_priority(&self, request_id: &str, new_priority: i32) {
        let mut queue = self.queue.write().await;
        // PriorityQueue 不支持直接更新，需要重建
        let items: Vec<_> = queue.drain().collect();
        for (mut req, _) in items {
            if req.request_id == request_id {
                req.priority = new_priority;
            }
            queue.push(req.clone(), -req.priority);
        }
    }
    
    async fn process_queue(&self) {
        let queue = self.queue.clone();
        let semaphore = self.semaphore.clone();
        let cache = self.cache.clone();
        let result_tx = self.result_tx.clone();
        let cancel_tokens = self.cancel_tokens.clone();
        
        tokio::spawn(async move {
            loop {
                // 获取许可
                let permit = semaphore.acquire().await.unwrap();
                
                // 获取下一个请求
                let request = {
                    let mut queue = queue.write().await;
                    queue.pop().map(|(req, _)| req)
                };
                
                let Some(request) = request else {
                    drop(permit);
                    break;
                };
                
                // 创建取消通道
                let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel();
                {
                    let mut tokens = cancel_tokens.write().await;
                    tokens.insert(request.request_id.clone(), cancel_tx);
                }
                
                // 执行加载
                let result = tokio::select! {
                    result = Self::load_page(&request) => result,
                    _ = cancel_rx => {
                        drop(permit);
                        continue;
                    }
                };
                
                // 移除取消令牌
                {
                    let mut tokens = cancel_tokens.write().await;
                    tokens.remove(&request.request_id);
                }
                
                if let Ok(result) = result {
                    // 存入缓存
                    {
                        let mut cache = cache.write().await;
                        cache.insert(request.request_id.clone(), result.clone());
                    }
                    
                    // 发送结果
                    let _ = result_tx.send(result).await;
                }
                
                drop(permit);
            }
        });
    }
    
    async fn load_page(request: &LoadRequest) -> Result<LoadResult, Box<dyn std::error::Error + Send + Sync>> {
        // 实际加载逻辑
        // ...
        todo!()
    }
}
```

### 4.2 Tauri Commands

```rust
// src-tauri/src/commands/page_commands.rs

use tauri::State;
use crate::core::page_loader::{PageLoader, LoadRequest};

#[tauri::command]
pub async fn load_page(
    loader: State<'_, PageLoader>,
    book_path: String,
    page_path: String,
    page_index: usize,
    priority: i32,
) -> Result<String, String> {
    let request_id = format!("{}:{}:{}", book_path, page_path, page_index);
    
    loader.submit(LoadRequest {
        book_path,
        page_path,
        page_index,
        priority,
        request_id: request_id.clone(),
    }).await;
    
    Ok(request_id)
}

#[tauri::command]
pub async fn cancel_page_load(
    loader: State<'_, PageLoader>,
    request_id: String,
) -> Result<(), String> {
    loader.cancel(&request_id).await;
    Ok(())
}

#[tauri::command]
pub async fn update_load_priority(
    loader: State<'_, PageLoader>,
    request_id: String,
    priority: i32,
) -> Result<(), String> {
    loader.update_priority(&request_id, priority).await;
    Ok(())
}

#[tauri::command]
pub async fn clear_load_queue(
    loader: State<'_, PageLoader>,
) -> Result<(), String> {
    loader.clear().await;
    Ok(())
}
```

---

## 五、实现步骤

### Phase 1: 核心数据结构 (1-2 天)

1. **创建类型定义**
   - `src/lib/core/types.ts` - 基础类型
   - `src/lib/core/pagePosition.ts` - PagePosition 类
   - `src/lib/core/pageRange.ts` - PageRange 类

2. **实现 VirtualPageList**
   - `src/lib/core/virtualPageList.ts`
   - 支持分割横向页面
   - 支持排序和过滤

### Phase 2: 页面帧系统 (2-3 天)

1. **实现 PageFrameManager**
   - `src/lib/core/pageFrameManager.ts`
   - 单页/双页模式
   - 首页/尾页特殊处理

2. **实现 PageFrame 组件**
   - `src/lib/components/viewer/PageFrame.svelte`
   - 支持 1-2 个元素
   - 支持裁剪显示

### Phase 3: 预加载流水线 (2-3 天)

1. **重构 PreloadPipeline**
   - `src/lib/core/preloadPipeline.ts`
   - 优先级队列
   - 并发控制
   - 取消机制

2. **集成超分系统**
   - 与现有 PyO3 超分系统集成
   - 预超分流水线

### Phase 4: 视图控制器 (1-2 天)

1. **实现 ViewerController**
   - `src/lib/core/viewerController.ts`
   - 统一的缩放/平移/旋转
   - 全景模式
   - 放大镜模式

2. **重构 ImageViewer**
   - 使用 ViewerController
   - 消除模式冲突

### Phase 5: Rust 后端优化 (2-3 天)

1. **实现 PageLoader**
   - 优先级队列
   - 并发控制
   - 缓存管理

2. **优化 IPC**
   - 批量加载
   - 流式传输

### Phase 6: 集成测试 (1-2 天)

1. **性能测试**
   - 打开大型压缩包
   - 快速翻页
   - 切换文件夹

2. **功能测试**
   - 分割横向页面
   - 双页模式
   - 超分流水线

---

## 六、性能优化要点

### 6.1 防抖与去重

```typescript
// 使用 debounce 防止重复触发
const debouncedPageChange = debounce((index: number) => {
  preloadPipeline.setFocus(index);
}, 50);

// 使用 Set 去重
const pendingRequests = new Set<string>();
```

### 6.2 缓存 Key 统一

```typescript
// 统一的缓存 key 生成
function getCacheKey(bookPath: string, pageIndex: number, part: 0 | 1): string {
  return `${bookPath}:${pageIndex}:${part}`;
}
```

### 6.3 取消机制

```typescript
// 切换书籍时取消所有加载
function onBookChange() {
  preloadPipeline.cancelAll();
  imageCache.clear();
}
```

### 6.4 内存管理

```typescript
// LRU 缓存
const imageCache = new LRUCache<string, Blob>({
  max: 50,  // 最多缓存 50 张图片
  dispose: (blob) => URL.revokeObjectURL(URL.createObjectURL(blob)),
});
```

---

## 七、迁移策略

### 7.1 渐进式迁移

1. **保持现有 API** - 新系统提供相同的接口
2. **Feature Flag** - 使用开关切换新旧系统
3. **并行运行** - 新旧系统可以同时运行进行对比

### 7.2 兼容性

- 保持现有的 `bookStore` API
- 保持现有的 `preloadManager` API
- 新增的功能通过新 API 暴露

---

## 八、总结

本重构方案的核心改进：

1. **虚拟页面列表** - 解决分割横向页面导致页数变化的问题
2. **页面帧系统** - 统一单页/双页模式的处理
3. **预加载流水线** - 优先级队列 + 并发控制 + 取消机制
4. **视图控制器** - 统一的变换管理，消除模式冲突
5. **Rust 后端优化** - 异步加载 + 缓存管理

预期效果：
- 打开文件速度提升 50%+
- 翻页响应时间 < 50ms
- 内存占用减少 30%
- 消除重复加载问题
