/**
 * PreloadPipeline - 预加载流水线
 * 
 * 核心功能：
 * 1. 优先级队列管理预加载任务
 * 2. 并发控制
 * 3. 取消机制
 * 4. 与超分系统集成
 * 
 * 参考 NeeView 的 BookPageLoader
 */

import type {
  PreloadTask,
  PreloadConfig,
  LoadStatus,
  VirtualPage,
} from './types';
import { defaultPreloadConfig } from './types';
import type { VirtualPageList } from './virtualPageList';

// ============================================================================
// 类型定义
// ============================================================================

export interface PreloadResult {
  taskId: string;
  virtualIndex: number;
  type: PreloadTask['type'];
  success: boolean;
  data?: Blob;
  error?: Error;
}

export interface PreloadPipelineEvents {
  onTaskStart?: (task: PreloadTask) => void;
  onTaskComplete?: (result: PreloadResult) => void;
  onTaskError?: (task: PreloadTask, error: Error) => void;
  onQueueChange?: (queueSize: number) => void;
  onFocusChange?: (focusIndex: number) => void;
}

export interface ImageLoadFunction {
  (virtualPage: VirtualPage, signal: AbortSignal): Promise<Blob>;
}

export interface ThumbnailLoadFunction {
  (virtualPage: VirtualPage, signal: AbortSignal): Promise<Blob>;
}

export interface UpscaleFunction {
  (virtualPage: VirtualPage, imageBlob: Blob, signal: AbortSignal): Promise<Blob>;
}

// ============================================================================
// PreloadPipeline
// ============================================================================

export class PreloadPipeline {
  private _config: PreloadConfig;
  private _virtualPageList: VirtualPageList | null = null;
  private _events: PreloadPipelineEvents = {};

  // 任务队列
  private _taskQueue: Map<string, PreloadTask> = new Map();
  private _runningTasks: Set<string> = new Set();

  // 当前焦点位置
  private _focusIndex: number = 0;

  // 加载函数
  private _loadImage: ImageLoadFunction | null = null;
  private _loadThumbnail: ThumbnailLoadFunction | null = null;
  private _upscaleImage: UpscaleFunction | null = null;

  // 结果缓存
  private _imageCache: Map<string, Blob> = new Map();
  private _thumbnailCache: Map<string, Blob> = new Map();
  private _upscaleCache: Map<string, Blob> = new Map();

  // 处理标志
  private _isProcessing: boolean = false;
  private _isPaused: boolean = false;

  constructor(config: Partial<PreloadConfig> = {}) {
    this._config = { ...defaultPreloadConfig, ...config };
  }

  // ============================================================================
  // 配置
  // ============================================================================

  get config(): PreloadConfig {
    return { ...this._config };
  }

  setConfig(config: Partial<PreloadConfig>): void {
    this._config = { ...this._config, ...config };
  }

  setVirtualPageList(list: VirtualPageList): void {
    this._virtualPageList = list;
  }

  setEvents(events: PreloadPipelineEvents): void {
    this._events = events;
  }

  setLoadFunctions(
    loadImage: ImageLoadFunction,
    loadThumbnail: ThumbnailLoadFunction,
    upscaleImage?: UpscaleFunction
  ): void {
    this._loadImage = loadImage;
    this._loadThumbnail = loadThumbnail;
    this._upscaleImage = upscaleImage ?? null;
  }

  // ============================================================================
  // 焦点管理
  // ============================================================================

  get focusIndex(): number {
    return this._focusIndex;
  }

  /**
   * 设置焦点位置，重新计算预加载任务
   */
  setFocus(virtualIndex: number): void {
    if (this._focusIndex === virtualIndex) return;

    this._focusIndex = virtualIndex;
    this._events.onFocusChange?.(virtualIndex);
    this.recalculateTasks();
  }

  // ============================================================================
  // 暂停/恢复
  // ============================================================================

  pause(): void {
    this._isPaused = true;
  }

  resume(): void {
    this._isPaused = false;
    this.processQueue();
  }

  get isPaused(): boolean {
    return this._isPaused;
  }

  // ============================================================================
  // 任务管理
  // ============================================================================

  /**
   * 重新计算预加载任务
   */
  private recalculateTasks(): void {
    if (!this._virtualPageList) return;

    const totalPages = this._virtualPageList.length;
    if (totalPages === 0) return;

    // 计算需要预加载的范围
    const start = Math.max(0, this._focusIndex - this._config.preloadBehind);
    const end = Math.min(totalPages - 1, this._focusIndex + this._config.preloadAhead);

    // 收集需要保留的任务 ID
    const keepTaskIds = new Set<string>();

    // 添加新任务
    for (let i = start; i <= end; i++) {
      const priority = Math.abs(i - this._focusIndex);

      // 图像加载任务
      const imageTaskId = this.ensureTask(i, 'image', priority);
      if (imageTaskId) keepTaskIds.add(imageTaskId);

      // 缩略图任务 (优先级稍低)
      const thumbTaskId = this.ensureTask(i, 'thumbnail', priority + 50);
      if (thumbTaskId) keepTaskIds.add(thumbTaskId);

      // 超分任务 (优先级最低)
      if (this._config.autoUpscale) {
        const upscaleTaskId = this.ensureTask(i, 'upscale', priority + 100);
        if (upscaleTaskId) keepTaskIds.add(upscaleTaskId);
      }
    }

    // 取消不在范围内的任务
    for (const [taskId] of this._taskQueue) {
      if (!keepTaskIds.has(taskId)) {
        this.cancelTask(taskId);
      }
    }

    // 触发队列处理
    this.processQueue();
  }

  /**
   * 确保任务存在
   */
  private ensureTask(
    virtualIndex: number,
    type: PreloadTask['type'],
    priority: number
  ): string | null {
    const id = `${type}-${virtualIndex}`;

    // 检查缓存
    if (this.hasCache(virtualIndex, type)) {
      return null;
    }

    // 检查是否已存在
    if (this._taskQueue.has(id)) {
      const task = this._taskQueue.get(id)!;
      // 更新优先级 (取较小值)
      task.priority = Math.min(task.priority, priority);
      return id;
    }

    // 创建新任务
    const task: PreloadTask = {
      id,
      type,
      virtualIndex,
      priority,
      status: 'pending',
      createdAt: Date.now(),
    };

    this._taskQueue.set(id, task);
    this._events.onQueueChange?.(this._taskQueue.size);

    return id;
  }

  /**
   * 取消任务
   */
  cancelTask(id: string): void {
    const task = this._taskQueue.get(id);
    if (!task) return;

    if (task.status === 'loading' && task.abortController) {
      task.abortController.abort();
    }

    this._taskQueue.delete(id);
    this._runningTasks.delete(id);
    this._events.onQueueChange?.(this._taskQueue.size);
  }

  /**
   * 取消所有任务
   */
  cancelAll(): void {
    for (const [, task] of this._taskQueue) {
      if (task.status === 'loading' && task.abortController) {
        task.abortController.abort();
      }
    }

    this._taskQueue.clear();
    this._runningTasks.clear();
    this._events.onQueueChange?.(0);
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this._imageCache.clear();
    this._thumbnailCache.clear();
    this._upscaleCache.clear();
  }

  // ============================================================================
  // 缓存管理
  // ============================================================================

  /**
   * 检查是否有缓存
   */
  hasCache(virtualIndex: number, type: PreloadTask['type']): boolean {
    const key = `${virtualIndex}`;
    switch (type) {
      case 'image':
        return this._imageCache.has(key);
      case 'thumbnail':
        return this._thumbnailCache.has(key);
      case 'upscale':
        return this._upscaleCache.has(key);
    }
  }

  /**
   * 获取缓存
   */
  getCache(virtualIndex: number, type: PreloadTask['type']): Blob | null {
    const key = `${virtualIndex}`;
    switch (type) {
      case 'image':
        return this._imageCache.get(key) ?? null;
      case 'thumbnail':
        return this._thumbnailCache.get(key) ?? null;
      case 'upscale':
        return this._upscaleCache.get(key) ?? null;
    }
  }

  /**
   * 设置缓存
   */
  private setCache(virtualIndex: number, type: PreloadTask['type'], data: Blob): void {
    const key = `${virtualIndex}`;
    switch (type) {
      case 'image':
        this._imageCache.set(key, data);
        break;
      case 'thumbnail':
        this._thumbnailCache.set(key, data);
        break;
      case 'upscale':
        this._upscaleCache.set(key, data);
        break;
    }
  }

  // ============================================================================
  // 队列处理
  // ============================================================================

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    if (this._isProcessing || this._isPaused) return;
    this._isProcessing = true;

    try {
      while (true) {
        if (this._isPaused) break;

        // 获取可以启动的任务
        const tasksToStart = this.getTasksToStart();
        if (tasksToStart.length === 0) break;

        // 启动任务
        await Promise.all(tasksToStart.map(task => this.startTask(task)));
      }
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * 获取可以启动的任务
   */
  private getTasksToStart(): PreloadTask[] {
    const tasks: PreloadTask[] = [];

    // 按优先级排序的待处理任务
    const pending = Array.from(this._taskQueue.values())
      .filter(t => t.status === 'pending')
      .sort((a, b) => a.priority - b.priority);

    for (const task of pending) {
      if (!this.canStartTask(task.type)) continue;
      tasks.push(task);
    }

    return tasks;
  }

  /**
   * 检查是否可以启动任务
   */
  private canStartTask(type: PreloadTask['type']): boolean {
    const running = Array.from(this._taskQueue.values())
      .filter(t => t.status === 'loading' && t.type === type);

    const limit = {
      image: this._config.maxConcurrentImages,
      thumbnail: this._config.maxConcurrentThumbnails,
      upscale: this._config.maxConcurrentUpscale,
    }[type];

    return running.length < limit;
  }

  /**
   * 启动任务
   */
  private async startTask(task: PreloadTask): Promise<void> {
    if (!this._virtualPageList) return;

    const virtualPage = this._virtualPageList.getVirtualPage(task.virtualIndex);
    if (!virtualPage) {
      this._taskQueue.delete(task.id);
      return;
    }

    task.status = 'loading';
    task.abortController = new AbortController();
    this._runningTasks.add(task.id);

    this._events.onTaskStart?.(task);

    try {
      let data: Blob | undefined;

      switch (task.type) {
        case 'image':
          data = await this.loadImage(virtualPage, task.abortController.signal);
          break;
        case 'thumbnail':
          data = await this.loadThumbnail(virtualPage, task.abortController.signal);
          break;
        case 'upscale':
          data = await this.upscaleImage(virtualPage, task.abortController.signal);
          break;
      }

      if (data) {
        task.status = 'done';
        this.setCache(task.virtualIndex, task.type, data);

        this._events.onTaskComplete?.({
          taskId: task.id,
          virtualIndex: task.virtualIndex,
          type: task.type,
          success: true,
          data,
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // 被取消
        this._taskQueue.delete(task.id);
      } else {
        task.status = 'error';
        this._events.onTaskError?.(task, error as Error);
        this._events.onTaskComplete?.({
          taskId: task.id,
          virtualIndex: task.virtualIndex,
          type: task.type,
          success: false,
          error: error as Error,
        });
      }
    } finally {
      this._runningTasks.delete(task.id);
      
      // 继续处理队列
      if (!this._isPaused) {
        this.processQueue();
      }
    }
  }

  // ============================================================================
  // 加载方法
  // ============================================================================

  private async loadImage(virtualPage: VirtualPage, signal: AbortSignal): Promise<Blob> {
    if (!this._loadImage) {
      throw new Error('Image load function not set');
    }
    return this._loadImage(virtualPage, signal);
  }

  private async loadThumbnail(virtualPage: VirtualPage, signal: AbortSignal): Promise<Blob> {
    if (!this._loadThumbnail) {
      throw new Error('Thumbnail load function not set');
    }
    return this._loadThumbnail(virtualPage, signal);
  }

  private async upscaleImage(virtualPage: VirtualPage, signal: AbortSignal): Promise<Blob> {
    if (!this._upscaleImage) {
      throw new Error('Upscale function not set');
    }

    // 先获取原图
    let imageBlob = this.getCache(virtualPage.virtualIndex, 'image');
    if (!imageBlob) {
      imageBlob = await this.loadImage(virtualPage, signal);
      this.setCache(virtualPage.virtualIndex, 'image', imageBlob);
    }

    return this._upscaleImage(virtualPage, imageBlob, signal);
  }

  // ============================================================================
  // 状态查询
  // ============================================================================

  get queueSize(): number {
    return this._taskQueue.size;
  }

  get runningCount(): number {
    return this._runningTasks.size;
  }

  getTaskStatus(virtualIndex: number, type: PreloadTask['type']): LoadStatus {
    const id = `${type}-${virtualIndex}`;
    const task = this._taskQueue.get(id);
    
    if (!task) {
      return this.hasCache(virtualIndex, type) ? 'done' : 'idle';
    }
    
    return task.status;
  }

  /**
   * 获取所有任务状态
   */
  getAllTaskStatus(): Map<string, PreloadTask> {
    return new Map(this._taskQueue);
  }

  // ============================================================================
  // 手动请求
  // ============================================================================

  /**
   * 手动请求加载图像
   */
  async requestImage(virtualIndex: number, priority: number = 0): Promise<Blob | null> {
    // 检查缓存
    const cached = this.getCache(virtualIndex, 'image');
    if (cached) return cached;

    // 确保任务存在
    this.ensureTask(virtualIndex, 'image', priority);
    this.processQueue();

    // 等待完成
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const cached = this.getCache(virtualIndex, 'image');
        if (cached) {
          clearInterval(checkInterval);
          resolve(cached);
        }

        const status = this.getTaskStatus(virtualIndex, 'image');
        if (status === 'error' || status === 'idle') {
          clearInterval(checkInterval);
          resolve(null);
        }
      }, 50);

      // 超时
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(null);
      }, 30000);
    });
  }

  /**
   * 手动请求加载缩略图
   */
  async requestThumbnail(virtualIndex: number, priority: number = 50): Promise<Blob | null> {
    const cached = this.getCache(virtualIndex, 'thumbnail');
    if (cached) return cached;

    this.ensureTask(virtualIndex, 'thumbnail', priority);
    this.processQueue();

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const cached = this.getCache(virtualIndex, 'thumbnail');
        if (cached) {
          clearInterval(checkInterval);
          resolve(cached);
        }

        const status = this.getTaskStatus(virtualIndex, 'thumbnail');
        if (status === 'error' || status === 'idle') {
          clearInterval(checkInterval);
          resolve(null);
        }
      }, 50);

      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(null);
      }, 10000);
    });
  }

  /**
   * 手动请求超分
   */
  async requestUpscale(virtualIndex: number, priority: number = 100): Promise<Blob | null> {
    const cached = this.getCache(virtualIndex, 'upscale');
    if (cached) return cached;

    this.ensureTask(virtualIndex, 'upscale', priority);
    this.processQueue();

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const cached = this.getCache(virtualIndex, 'upscale');
        if (cached) {
          clearInterval(checkInterval);
          resolve(cached);
        }

        const status = this.getTaskStatus(virtualIndex, 'upscale');
        if (status === 'error' || status === 'idle') {
          clearInterval(checkInterval);
          resolve(null);
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(null);
      }, 120000); // 超分可能需要更长时间
    });
  }
}
