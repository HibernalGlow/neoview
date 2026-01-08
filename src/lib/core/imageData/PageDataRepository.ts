/**
 * PageDataRepository - 统一的页面数据仓库
 * 
 * 参考 NeeView 的 PageContent + MemoryPool 和 OpenComic 的 sizesCache 设计
 * 
 * 核心目标：
 * 1. 零重复 IPC：同一图片只从后端获取一次
 * 2. 零重复解码：尺寸等元信息随 Blob 一同缓存
 * 3. 请求合并：多个组件同时请求同一图片时，只执行一次加载
 * 4. 单一数据源：所有组件从同一个仓库获取数据
 */

export interface PageData {
  /** 页面索引 */
  pageIndex: number;
  /** Blob 数据 */
  blob: Blob;
  /** Object URL */
  url: string;
  /** 图片尺寸（与 Blob 一同缓存，避免重复解码） */
  dimensions: { width: number; height: number } | null;
  /** ImageBitmap（预解码，避免渲染时解码） */
  bitmap?: ImageBitmap;
  /** 数据大小 */
  size: number;
  /** 最后访问时间 */
  lastAccessed: number;
  /** 加载状态 */
  state: 'loading' | 'ready' | 'error';
  /** 错误信息 */
  error?: string;
}

export interface PageDataOptions {
  /** 最大缓存大小（字节） */
  maxCacheSizeBytes?: number;
  /** 是否预解码为 ImageBitmap */
  preDecode?: boolean;
  /** 预解码并发数 */
  preDecodeConcurrency?: number;
}

const DEFAULT_OPTIONS: Required<PageDataOptions> = {
  maxCacheSizeBytes: 500 * 1024 * 1024, // 500MB
  preDecode: true,
  preDecodeConcurrency: 2,
};

/**
 * 统一的页面数据仓库
 */
export class PageDataRepository {
  private cache = new Map<number, PageData>();
  private pendingRequests = new Map<number, Promise<PageData>>();
  private options: Required<PageDataOptions>;
  private currentSize = 0;
  private bookPath: string | null = null;
  
  // 预解码队列
  private decodeQueue: number[] = [];
  private decodingCount = 0;

  constructor(options: PageDataOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 设置当前书籍路径（切书时调用）
   */
  setBook(bookPath: string): void {
    if (this.bookPath !== bookPath) {
      this.clear();
      this.bookPath = bookPath;
    }
  }

  /**
   * 获取页面数据（核心方法）
   * 
   * 特点：
   * 1. 请求合并：同一页面的多个请求会复用同一个 Promise
   * 2. 数据完整：返回的 PageData 包含 blob、url、dimensions 等所有信息
   * 3. 预解码：异步生成 ImageBitmap，加速渲染
   */
  async getPage(
    pageIndex: number,
    loader: () => Promise<Blob>,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<PageData> {
    // 1. 检查缓存
    if (this.cache.has(pageIndex)) {
      const data = this.cache.get(pageIndex)!;
      data.lastAccessed = Date.now();
      return data;
    }

    // 2. 检查是否正在加载（请求合并）
    if (this.pendingRequests.has(pageIndex)) {
      return this.pendingRequests.get(pageIndex)!;
    }

    // 3. 创建加载任务
    const loadPromise = this.loadPage(pageIndex, loader);
    this.pendingRequests.set(pageIndex, loadPromise);

    try {
      const data = await loadPromise;
      
      // 高优先级请求立即预解码
      if (priority === 'high' && this.options.preDecode && !data.bitmap) {
        this.scheduleDecode(pageIndex, true);
      }
      
      return data;
    } finally {
      this.pendingRequests.delete(pageIndex);
    }
  }

  /**
   * 检查是否有缓存
   */
  has(pageIndex: number): boolean {
    return this.cache.has(pageIndex);
  }

  /**
   * 获取已缓存的数据（同步，不触发加载）
   */
  getCached(pageIndex: number): PageData | undefined {
    const data = this.cache.get(pageIndex);
    if (data) {
      data.lastAccessed = Date.now();
    }
    return data;
  }

  /**
   * 手动设置页面数据（用于外部预加载结果）
   */
  setPageData(
    pageIndex: number,
    blob: Blob,
    dimensions?: { width: number; height: number } | null
  ): PageData {
    // 如果已存在，先删除
    if (this.cache.has(pageIndex)) {
      this.removePage(pageIndex);
    }

    const url = URL.createObjectURL(blob);
    const data: PageData = {
      pageIndex,
      blob,
      url,
      dimensions: dimensions ?? null,
      size: blob.size,
      lastAccessed: Date.now(),
      state: 'ready',
    };

    this.cache.set(pageIndex, data);
    this.currentSize += blob.size;
    this.enforceLimit();

    // 如果没有尺寸，异步获取
    if (!dimensions && this.options.preDecode) {
      this.scheduleDecode(pageIndex, false);
    }

    return data;
  }

  /**
   * 更新页面尺寸（避免重复解码）
   */
  setDimensions(pageIndex: number, dimensions: { width: number; height: number } | null): void {
    const data = this.cache.get(pageIndex);
    if (data) {
      data.dimensions = dimensions;
    }
  }

  /**
   * 设置 ImageBitmap
   */
  setBitmap(pageIndex: number, bitmap: ImageBitmap): void {
    const data = this.cache.get(pageIndex);
    if (data) {
      // 关闭旧的 bitmap
      if (data.bitmap) {
        data.bitmap.close();
      }
      data.bitmap = bitmap;
    }
  }

  /**
   * 获取缓存统计
   */
  getStats(): { count: number; sizeBytes: number; sizeMB: number; pendingCount: number } {
    return {
      count: this.cache.size,
      sizeBytes: this.currentSize,
      sizeMB: Math.round(this.currentSize / 1024 / 1024 * 100) / 100,
      pendingCount: this.pendingRequests.size,
    };
  }

  /**
   * 清空缓存
   */
  clear(): void {
    for (const [, data] of this.cache) {
      URL.revokeObjectURL(data.url);
      if (data.bitmap) {
        data.bitmap.close();
      }
    }
    this.cache.clear();
    this.pendingRequests.clear();
    this.decodeQueue = [];
    this.currentSize = 0;
    this.bookPath = null;
  }

  // ==================== 私有方法 ====================

  private async loadPage(
    pageIndex: number,
    loader: () => Promise<Blob>
  ): Promise<PageData> {
    const data: PageData = {
      pageIndex,
      blob: new Blob(),
      url: '',
      dimensions: null,
      size: 0,
      lastAccessed: Date.now(),
      state: 'loading',
    };

    try {
      const blob = await loader();
      const url = URL.createObjectURL(blob);

      data.blob = blob;
      data.url = url;
      data.size = blob.size;
      data.state = 'ready';

      this.cache.set(pageIndex, data);
      this.currentSize += blob.size;
      this.enforceLimit();

      // 预解码获取尺寸和 ImageBitmap
      if (this.options.preDecode) {
        this.scheduleDecode(pageIndex, false);
      }

      return data;
    } catch (error) {
      data.state = 'error';
      data.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private removePage(pageIndex: number): void {
    const data = this.cache.get(pageIndex);
    if (data) {
      URL.revokeObjectURL(data.url);
      if (data.bitmap) {
        data.bitmap.close();
      }
      this.currentSize -= data.size;
      this.cache.delete(pageIndex);
    }
  }

  private enforceLimit(): void {
    if (this.currentSize <= this.options.maxCacheSizeBytes) {
      return;
    }

    // LRU 淘汰
    const targetSize = Math.floor(this.options.maxCacheSizeBytes * 0.8);
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    for (const [pageIndex] of entries) {
      if (this.currentSize <= targetSize) break;
      this.removePage(pageIndex);
    }
  }

  /**
   * 调度预解码
   */
  private scheduleDecode(pageIndex: number, immediate: boolean): void {
    if (!this.cache.has(pageIndex)) return;
    
    if (immediate) {
      this.doDecode(pageIndex);
    } else {
      if (!this.decodeQueue.includes(pageIndex)) {
        this.decodeQueue.push(pageIndex);
      }
      this.processDecodeQueue();
    }
  }

  private async processDecodeQueue(): Promise<void> {
    while (
      this.decodingCount < this.options.preDecodeConcurrency &&
      this.decodeQueue.length > 0
    ) {
      const pageIndex = this.decodeQueue.shift()!;
      if (this.cache.has(pageIndex)) {
        this.decodingCount++;
        this.doDecode(pageIndex).finally(() => {
          this.decodingCount--;
          this.processDecodeQueue();
        });
      }
    }
  }

  private async doDecode(pageIndex: number): Promise<void> {
    const data = this.cache.get(pageIndex);
    if (!data || data.bitmap) return;

    try {
      const bitmap = await createImageBitmap(data.blob);
      
      // 更新数据
      if (this.cache.has(pageIndex)) {
        const current = this.cache.get(pageIndex)!;
        
        // 设置尺寸（如果尚未设置）
        if (!current.dimensions) {
          current.dimensions = {
            width: bitmap.width,
            height: bitmap.height,
          };
        }
        
        // 设置 bitmap
        current.bitmap = bitmap;
      } else {
        // 页面已被清除，释放 bitmap
        bitmap.close();
      }
    } catch (error) {
      console.warn(`预解码页面 ${pageIndex} 失败:`, error);
    }
  }
}

// 单例
let instance: PageDataRepository | null = null;

export function getPageDataRepository(options?: PageDataOptions): PageDataRepository {
  if (!instance) {
    instance = new PageDataRepository(options);
  }
  return instance;
}

export function resetPageDataRepository(): void {
  if (instance) {
    instance.clear();
    instance = null;
  }
}
