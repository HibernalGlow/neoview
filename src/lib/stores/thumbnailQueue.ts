/**
 * 缩略图队列管理器
 * 限制同时处理的缩略图数量，避免过多的并发请求
 */

class ThumbnailQueue {
  private queue: Array<() => Promise<void>> = [];
  private processing = 0;
  private maxConcurrent = 10; // 最多同时处理10个缩略图

  async add(task: () => Promise<void>) {
    return new Promise<void>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          await task();
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.processing >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.processing++;
    const task = this.queue.shift()!;

    try {
      await task();
    } finally {
      this.processing--;
      // 处理完一个任务后，继续处理队列中的下一个
      this.process();
    }
  }

  getStats() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      maxConcurrent: this.maxConcurrent
    };
  }
}

// 全局缩略图队列实例
export const thumbnailQueue = new ThumbnailQueue();