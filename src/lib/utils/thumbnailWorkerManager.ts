/**
 * Thumbnail Worker Manager
 * 缩略图 Worker 管理器 - 管理 WebWorker 实例和处理缩略图任务
 */

export interface ThumbnailProcessTask {
  id: string;
  blobData: Uint8Array;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export interface ThumbnailProcessResult {
  id: string;
  dataUrl?: string;
  error?: string;
}

export type ThumbnailProcessCallback = (result: ThumbnailProcessResult) => void;

/**
 * 缩略图 Worker 管理器
 */
export class ThumbnailWorkerManager {
  private worker: Worker | null = null;
  private callbacks = new Map<string, ThumbnailProcessCallback>();
  private pendingTasks = new Map<string, ThumbnailProcessTask>();
  private isInitialized = false;

  /**
   * 初始化 Worker
   */
  async initialize(): Promise<void> {
    if (this.isInitialized && this.worker) {
      return;
    }

    try {
      // 创建 Worker
      // 注意：在生产环境中，需要使用编译后的 Worker 文件路径
      const workerUrl = import.meta.env.DEV
        ? new URL('../workers/thumbnailWorker.ts', import.meta.url)
        : new URL('../workers/thumbnailWorker.js', import.meta.url);
      
      this.worker = new Worker(workerUrl, { type: 'module' });

      // 监听 Worker 消息
      this.worker.onmessage = (e: MessageEvent) => {
        const { type, id, dataUrl, error, progress, total } = e.data;

        switch (type) {
          case 'success':
            if (id && this.callbacks.has(id)) {
              const callback = this.callbacks.get(id)!;
              callback({ id, dataUrl });
              this.callbacks.delete(id);
              this.pendingTasks.delete(id);
            }
            break;

          case 'error':
            if (id && this.callbacks.has(id)) {
              const callback = this.callbacks.get(id)!;
              callback({ id, error });
              this.callbacks.delete(id);
              this.pendingTasks.delete(id);
            }
            break;

          case 'progress':
            // 可以在这里处理进度更新
            if (import.meta.env.DEV) {
              console.log(`缩略图处理进度: ${progress}/${total}`);
            }
            break;
        }
      };

      // 监听 Worker 错误
      this.worker.onerror = (error) => {
        console.error('Thumbnail Worker 错误:', error);
        // 错误时通知所有待处理的任务
        for (const [id, callback] of this.callbacks.entries()) {
          callback({ id, error: 'Worker error' });
        }
        this.callbacks.clear();
        this.pendingTasks.clear();
      };

      this.isInitialized = true;
    } catch (error) {
      console.error('初始化 Thumbnail Worker 失败:', error);
      // 如果 Worker 初始化失败，回退到主线程处理
      this.worker = null;
    }
  }

  /**
   * 处理单个缩略图
   */
  async processThumbnail(
    task: ThumbnailProcessTask,
    callback: ThumbnailProcessCallback
  ): Promise<void> {
    // 如果 Worker 未初始化，尝试初始化
    if (!this.isInitialized) {
      await this.initialize();
    }

    // 如果 Worker 不可用，回退到主线程处理
    if (!this.worker) {
      await this.processThumbnailMainThread(task, callback);
      return;
    }

    // 保存回调和任务
    this.callbacks.set(task.id, callback);
    this.pendingTasks.set(task.id, task);

    // 发送任务到 Worker
    this.worker.postMessage({
      type: 'process',
      id: task.id,
      data: {
        blobData: task.blobData,
        maxWidth: task.maxWidth,
        maxHeight: task.maxHeight,
        quality: task.quality,
      },
    });
  }

  /**
   * 批量处理缩略图
   */
  async processBatchThumbnails(
    tasks: ThumbnailProcessTask[],
    callback: ThumbnailProcessCallback
  ): Promise<void> {
    // 如果 Worker 未初始化，尝试初始化
    if (!this.isInitialized) {
      await this.initialize();
    }

    // 如果 Worker 不可用，回退到主线程处理
    if (!this.worker) {
      for (const task of tasks) {
        await this.processThumbnailMainThread(task, callback);
      }
      return;
    }

    // 保存所有回调
    for (const task of tasks) {
      this.callbacks.set(task.id, callback);
      this.pendingTasks.set(task.id, task);
    }

    // 发送批量任务到 Worker
    this.worker.postMessage({
      type: 'batch-process',
      items: tasks.map(task => ({
        id: task.id,
        blobData: task.blobData,
        maxWidth: task.maxWidth,
        maxHeight: task.maxHeight,
        quality: task.quality,
      })),
    });
  }

  /**
   * 主线程处理（回退方案）
   */
  private async processThumbnailMainThread(
    task: ThumbnailProcessTask,
    callback: ThumbnailProcessCallback
  ): Promise<void> {
    try {
      const { blobData, maxWidth = 256, maxHeight = 256, quality = 0.85 } = task;

      // 创建 Blob 并加载为 Image
      const blob = new Blob([blobData], { type: 'image/webp' });
      const imageUrl = URL.createObjectURL(blob);

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = imageUrl;
      });

      URL.revokeObjectURL(imageUrl);

      // 计算缩放后的尺寸
      const { width, height } = this.calculateThumbnailSize(
        img.width,
        img.height,
        maxWidth,
        maxHeight
      );

      // 创建 Canvas 并绘制缩略图
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      ctx.drawImage(img, 0, 0, width, height);

      // 转换为 Data URL
      const dataUrl = canvas.toDataURL('image/jpeg', quality);

      callback({ id: task.id, dataUrl });
    } catch (error) {
      callback({
        id: task.id,
        error: error instanceof Error ? error.message : 'Processing failed',
      });
    }
  }

  /**
   * 计算缩略图尺寸
   */
  private calculateThumbnailSize(
    originalWidth: number,
    originalHeight: number,
    maxWidth: number,
    maxHeight: number
  ): { width: number; height: number } {
    const aspectRatio = originalWidth / originalHeight;

    let width = maxWidth;
    let height = maxHeight;

    if (originalWidth > originalHeight) {
      // 横向图片
      height = maxWidth / aspectRatio;
      if (height > maxHeight) {
        height = maxHeight;
        width = maxHeight * aspectRatio;
      }
    } else {
      // 纵向图片
      width = maxHeight * aspectRatio;
      if (width > maxWidth) {
        width = maxWidth;
        height = maxWidth / aspectRatio;
      }
    }

    return {
      width: Math.round(width),
      height: Math.round(height),
    };
  }

  /**
   * 取消任务
   */
  cancelTask(id: string): void {
    this.callbacks.delete(id);
    this.pendingTasks.delete(id);

    if (this.worker) {
      this.worker.postMessage({
        type: 'cancel',
        id,
      });
    }
  }

  /**
   * 清理所有任务
   */
  clear(): void {
    this.callbacks.clear();
    this.pendingTasks.clear();
  }

  /**
   * 销毁 Worker
   */
  destroy(): void {
    this.clear();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
  }
}

// 单例
export const thumbnailWorkerManager = new ThumbnailWorkerManager();

