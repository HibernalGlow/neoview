/**
 * 缩略图队列管理器
 * 限制同时处理的缩略图数量，避免过多的并发请求
 */

import { settingsManager } from '$lib/settings/settingsManager';

class ThumbnailQueue {
  private queue: Array<{task: () => Promise<void>, itemName: string, itemType: 'folder' | 'archive'}> = [];
  private processing = 0;
  private maxConcurrent = 10; // 最多同时处理10个缩略图
  private enableLogging = true; // 启用日志记录

  constructor() {
    // 从设置中初始化配置
    this.updateSettings();
    // 监听设置变化
    settingsManager.addListener(() => {
      this.updateSettings();
    });
  }

  private updateSettings() {
    const settings = settingsManager.getSettings();
    this.maxConcurrent = settings.thumbnails.maxConcurrentTasks;
    this.enableLogging = settings.thumbnails.enableLogging;
  }

  async add(task: () => Promise<void>, itemName?: string, itemType?: 'folder' | 'archive') {
    return new Promise<void>((resolve, reject) => {
      const queueItem = {
        task: async () => {
          try {
            if (this.enableLogging && itemName) {
              console.log(`📸 开始处理${itemType === 'folder' ? '文件夹' : '压缩包'}缩略图: ${itemName}`);
            }
            await task();
            if (this.enableLogging && itemName) {
              console.log(`✅ 完成处理${itemType === 'folder' ? '文件夹' : '压缩包'}缩略图: ${itemName}`);
            }
            resolve();
          } catch (error) {
            if (this.enableLogging && itemName) {
              console.error(`❌ 处理${itemType === 'folder' ? '文件夹' : '压缩包'}缩略图失败: ${itemName}`, error);
            }
            reject(error);
          }
        },
        itemName: itemName || 'unknown',
        itemType: itemType || 'folder'
      };

      this.queue.push(queueItem);
      this.process();
    });
  }

  private async process() {
    if (this.processing >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.processing++;
    const queueItem = this.queue.shift()!;

    try {
      await queueItem.task();
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
      maxConcurrent: this.maxConcurrent,
      queuedItems: this.queue.map(item => ({
        name: item.itemName,
        type: item.itemType
      }))
    };
  }

  // 启用/禁用日志记录
  setLogging(enabled: boolean) {
    this.enableLogging = enabled;
  }

  // 获取缓存目录
  getCacheDirectory(): string {
    const settings = settingsManager.getSettings();
    return settings.thumbnails.cacheDirectory;
  }
}

// 全局缩略图队列实例
export const thumbnailQueue = new ThumbnailQueue();