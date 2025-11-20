/**
 * Incremental Batch Loader
 * 增量批量加载器 - 支持流式批量加载，边查询边显示
 */

export interface BatchLoadOptions {
  batchSize: number; // 每批加载的数量
  streamDelay: number; // 流式加载延迟（毫秒）
  maxConcurrent: number; // 最大并发数
}

export interface BatchLoadItem {
  id: string;
  path: string;
  priority?: number;
}

export interface BatchLoadResult<T> {
  id: string;
  path: string;
  data?: T;
  error?: Error;
}

export type BatchLoadCallback<T> = (result: BatchLoadResult<T>) => void;
export type BatchLoadExecutor<T> = (items: BatchLoadItem[]) => Promise<Map<string, T>>;

/**
 * 增量批量加载器
 * 支持流式加载，边查询边显示，减少首屏等待时间
 */
export class IncrementalBatchLoader<T> {
  private options: BatchLoadOptions;
  private executor: BatchLoadExecutor<T>;
  private callback?: BatchLoadCallback<T>;
  private pendingItems: BatchLoadItem[] = [];
  private processing = false;
  private cancelled = false;

  constructor(
    executor: BatchLoadExecutor<T>,
    options: Partial<BatchLoadOptions> = {}
  ) {
    this.executor = executor;
    this.options = {
      batchSize: options.batchSize ?? 50,
      streamDelay: options.streamDelay ?? 50,
      maxConcurrent: options.maxConcurrent ?? 5,
    };
  }

  /**
   * 设置结果回调
   */
  setCallback(callback: BatchLoadCallback<T>): void {
    this.callback = callback;
  }

  /**
   * 添加要加载的项目
   */
  addItems(items: BatchLoadItem[]): void {
    // 按优先级排序
    items.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    
    // 去重
    const existingIds = new Set(this.pendingItems.map(item => item.id));
    const newItems = items.filter(item => !existingIds.has(item.id));
    
    this.pendingItems.push(...newItems);
  }

  /**
   * 开始增量加载
   */
  async start(): Promise<void> {
    if (this.processing || this.cancelled) {
      return;
    }

    this.processing = true;
    this.cancelled = false;

    try {
      // 分批处理
      const batches: BatchLoadItem[][] = [];
      for (let i = 0; i < this.pendingItems.length; i += this.options.batchSize) {
        batches.push(this.pendingItems.slice(i, i + this.options.batchSize));
      }

      // 流式加载：每批之间延迟，让用户看到进度
      for (let i = 0; i < batches.length; i++) {
        if (this.cancelled) {
          break;
        }

        const batch = batches[i];
        
        // 并发加载当前批次
        await this.loadBatch(batch);

        // 如果不是最后一批，延迟一下让用户看到进度
        if (i < batches.length - 1 && this.options.streamDelay > 0) {
          await this.delay(this.options.streamDelay);
        }
      }
    } finally {
      this.processing = false;
      this.pendingItems = [];
    }
  }

  /**
   * 加载单个批次
   */
  private async loadBatch(batch: BatchLoadItem[]): Promise<void> {
    try {
      // 执行批量加载
      const results = await this.executor(batch);

      // 通知回调
      for (const item of batch) {
        const data = results.get(item.id);
        if (this.callback) {
          this.callback({
            id: item.id,
            path: item.path,
            data,
            error: data === undefined ? new Error('No data returned') : undefined,
          });
        }
      }
    } catch (error) {
      // 批量加载失败，通知所有项目
      for (const item of batch) {
        if (this.callback) {
          this.callback({
            id: item.id,
            path: item.path,
            error: error instanceof Error ? error : new Error('Batch load failed'),
          });
        }
      }
    }
  }

  /**
   * 取消加载
   */
  cancel(): void {
    this.cancelled = true;
    this.pendingItems = [];
  }

  /**
   * 检查是否正在处理
   */
  isProcessing(): boolean {
    return this.processing;
  }

  /**
   * 获取待处理数量
   */
  getPendingCount(): number {
    return this.pendingItems.length;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 创建流式批量加载器
 */
export function createIncrementalBatchLoader<T>(
  executor: BatchLoadExecutor<T>,
  options?: Partial<BatchLoadOptions>
): IncrementalBatchLoader<T> {
  return new IncrementalBatchLoader(executor, options);
}

