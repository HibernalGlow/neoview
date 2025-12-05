/**
 * 预渲染管理器
 * 管理 OffscreenCanvas Worker，提供预缩放图片功能
 */

interface RenderTask {
  resolve: (bitmap: ImageBitmap) => void;
  reject: (error: Error) => void;
}

class PreRenderManager {
  private worker: Worker | null = null;
  private pendingTasks = new Map<string, RenderTask>();
  private taskIdCounter = 0;
  private isSupported: boolean;

  constructor() {
    // 检查 OffscreenCanvas 支持
    this.isSupported = typeof OffscreenCanvas !== 'undefined';
    
    if (this.isSupported) {
      this.initWorker();
    } else {
      console.warn('OffscreenCanvas not supported, pre-render disabled');
    }
  }

  private initWorker() {
    try {
      // 使用 Vite 的 Worker 导入语法
      this.worker = new Worker(
        new URL('../workers/preRenderWorker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e: MessageEvent) => {
        const { type, id, bitmap, error } = e.data;
        const task = this.pendingTasks.get(id);
        
        if (!task) return;
        
        this.pendingTasks.delete(id);
        
        if (type === 'rendered') {
          task.resolve(bitmap);
        } else if (type === 'error') {
          task.reject(new Error(error));
        }
      };

      this.worker.onerror = (e) => {
        console.error('PreRender Worker error:', e);
      };

      console.log('✅ PreRenderManager: Worker initialized');
    } catch (err) {
      console.error('Failed to init PreRender Worker:', err);
      this.isSupported = false;
    }
  }

  /**
   * 预渲染图片到指定尺寸
   */
  async preRender(
    imageUrl: string,
    targetWidth: number,
    targetHeight: number
  ): Promise<ImageBitmap | null> {
    if (!this.isSupported || !this.worker) {
      return null;
    }

    const id = `render-${++this.taskIdCounter}`;

    return new Promise((resolve, reject) => {
      this.pendingTasks.set(id, { resolve, reject });

      this.worker!.postMessage({
        type: 'render',
        id,
        imageUrl,
        targetWidth,
        targetHeight,
      });

      // 超时处理
      setTimeout(() => {
        if (this.pendingTasks.has(id)) {
          this.pendingTasks.delete(id);
          reject(new Error('PreRender timeout'));
        }
      }, 10000);
    });
  }

  /**
   * 检查是否支持预渲染
   */
  get supported(): boolean {
    return this.isSupported;
  }

  /**
   * 销毁 Worker
   */
  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingTasks.clear();
  }
}

// 单例
export const preRenderManager = new PreRenderManager();
