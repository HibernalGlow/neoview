import type { FsItem } from '$lib/types';
import {
  configureThumbnailManager,
  enqueueThumbnail,
  enqueueArchiveThumbnail,
  clearQueue,
} from '$lib/utils/thumbnailManager';

export type ThumbnailJobKind = 'folder' | 'image' | 'archive';
export type ThumbnailPriority = 'high' | 'normal';

interface EnqueueOptions {
  priority?: ThumbnailPriority;
  source?: string;
}

interface QueueTask {
  item: FsItem;
  source: string;
  priority: ThumbnailPriority;
}

class ThumbnailQueueService {
  private initialized = false;
  private addThumbnail: (path: string, url: string) => void;
  private tasks = new Map<string, QueueTask[]>();
  private isFlushing = false;
  private batchSize = 10;
  private flushDelay = 16; // ~60fps

  constructor(addThumbnail: (path: string, url: string) => void) {
    this.addThumbnail = addThumbnail;
  }

  init() {
    if (this.initialized) return;

    configureThumbnailManager({
      addThumbnail: (path, url) => this.addThumbnail(path, url),
      maxConcurrentLocal: 4,
      maxConcurrentArchive: 2,
    });

    this.initialized = true;
  }

  enqueueForPath(source: string, items: FsItem[], options: EnqueueOptions = {}) {
    // Cancel previous tasks for this source
    this.cancelBySource(source);
    
    const list = items.map(item => ({
      item,
      source,
      priority: options.priority ?? 'normal'
    }));
    
    this.tasks.set(source, list);
    this.scheduleFlush();
  }

  cancelBySource(source: string) {
    this.tasks.delete(source);
  }

  private takeNextBatch(): QueueTask[] {
    const batch: QueueTask[] = [];
    const maxBatchSize = this.batchSize;
    
    for (const [source, tasks] of this.tasks.entries()) {
      const takeCount = Math.min(tasks.length, maxBatchSize - batch.length);
      if (takeCount > 0) {
        batch.push(...tasks.splice(0, takeCount));
        if (tasks.length === 0) {
          this.tasks.delete(source);
        }
      }
      if (batch.length >= maxBatchSize) break;
    }
    
    return batch;
  }

  private hasPendingTasks(): boolean {
    return this.tasks.size > 0;
  }

  private async flushBatch() {
    const batch = this.takeNextBatch();
    if (batch.length === 0) return;

    await Promise.allSettled(
      batch.map(async (task) => {
        const { item } = task;
        try {
          if (item.isDir) {
            enqueueThumbnail(item.path, true);
          } else if (item.isImage) {
            enqueueThumbnail(item.path, false);
          } else if (item.isArchive) {
            enqueueArchiveThumbnail(item.path);
          }
        } catch (error) {
          console.warn(`Failed to generate thumbnail for ${item.path}:`, error);
        }
      })
    );
  }

  private waitIdle(): Promise<void> {
    return new Promise(resolve => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => resolve(), { timeout: 100 });
      } else {
        setTimeout(resolve, this.flushDelay);
      }
    });
  }

  private scheduleFlush() {
    if (this.isFlushing) return;
    
    this.isFlushing = true;
    queueMicrotask(async () => {
      while (this.hasPendingTasks()) {
        await this.flushBatch();
        await this.waitIdle();
      }
      this.isFlushing = false;
    });
  }

  clear() {
    this.tasks.clear();
    clearQueue();
  }
}

let instance: ThumbnailQueueService | null = null;

export function getThumbnailQueue(addThumbnail: (path: string, url: string) => void) {
  if (!instance) {
    instance = new ThumbnailQueueService(addThumbnail);
  }
  return instance;
}
