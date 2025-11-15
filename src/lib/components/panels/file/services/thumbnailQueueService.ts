import type { FsItem } from '$lib/types';
import {
  configureThumbnailManager,
  enqueueThumbnail,
  enqueueArchiveThumbnail,
  clearQueue,
} from '$lib/utils/thumbnailManager';

export type ThumbnailJobKind = 'folder' | 'image' | 'archive';
export type ThumbnailPriority = 'immediate' | 'high' | 'normal';

interface EnqueueOptions {
  priority?: ThumbnailPriority;
  delay?: number;
}

interface QueueTask {
  item: FsItem;
  source: string;
  priority: ThumbnailPriority;
}

class PriorityQueue {
  private queues = {
    immediate: new Map<string, QueueTask[]>(),
    high: new Map<string, QueueTask[]>(),
    normal: new Map<string, QueueTask[]>(),
  };

  enqueue(source: string, items: FsItem[], priority: ThumbnailPriority = 'normal') {
    const list = this.queues[priority].get(source) ?? [];
    const newTasks = items.map(item => ({ item, source, priority }));
    this.queues[priority].set(source, list.concat(newTasks));
  }

  bump(source: string, predicate: (task: QueueTask) => boolean) {
    for (const prio of ['normal', 'high'] as const) {
      const list = this.queues[prio].get(source);
      if (!list) continue;
      
      const toPromote = list.filter(predicate);
      if (toPromote.length) {
        this.queues[prio].set(source, list.filter(it => !predicate(it)));
        this.enqueue(source, toPromote.map(t => t.item), 'immediate');
      }
    }
  }

  takeBatch(max = 10): QueueTask[] {
    for (const prio of ['immediate', 'high', 'normal'] as const) {
      const batch: QueueTask[] = [];
      
      for (const [source, tasks] of this.queues[prio].entries()) {
        while (tasks.length && batch.length < max) {
          batch.push(tasks.shift()!);
        }
        
        if (!tasks.length) {
          this.queues[prio].delete(source);
        }
        
        if (batch.length >= max) {
          return batch;
        }
      }
      
      if (batch.length) return batch;
    }
    
    return [];
  }

  cancelBySource(source: string) {
    for (const prio of ['immediate', 'high', 'normal'] as const) {
      this.queues[prio].delete(source);
    }
  }

  clear() {
    for (const prio of ['immediate', 'high', 'normal'] as const) {
      this.queues[prio].clear();
    }
  }

  hasPendingTasks(): boolean {
    for (const prio of ['immediate', 'high', 'normal'] as const) {
      if (this.queues[prio].size > 0) return true;
    }
    return false;
  }
}

class ThumbnailExecutor {
  private running = false;
  private pq: PriorityQueue;
  private batchSize = 10;
  private idleDelay = 32;

  constructor(pq: PriorityQueue) {
    this.pq = pq;
  }

  async start() {
    if (this.running) return;
    this.running = true;

    while (this.running) {
      const batch = this.pq.takeBatch(this.batchSize);
      
      if (!batch.length) {
        await this.waitIdle(this.idleDelay);
        continue;
      }

      await Promise.allSettled(batch.map(task => this.generate(task.item)));
      await this.waitIdle(8); // immediate 批次不必等待过久
    }
  }

  stop() {
    this.running = false;
  }

  private async generate(item: FsItem) {
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
  }

  private waitIdle(delay: number): Promise<void> {
    return new Promise(resolve => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => resolve(), { timeout: delay });
      } else {
        setTimeout(resolve, delay);
      }
    });
  }
}

class ThumbnailQueueService {
  private initialized = false;
  private addThumbnail: (path: string, url: string) => void;
  private priorityQueue = new PriorityQueue();
  private executor: ThumbnailExecutor;
  private currentSource = '';

  constructor(addThumbnail: (path: string, url: string) => void) {
    this.addThumbnail = addThumbnail;
    this.executor = new ThumbnailExecutor(this.priorityQueue);
  }

  init() {
    if (this.initialized) return;

    configureThumbnailManager({
      addThumbnail: (path, url) => this.addThumbnail(path, url),
      maxConcurrentLocal: 4,
      maxConcurrentArchive: 2,
    });

    this.initialized = true;
    this.executor.start();
  }

  enqueueVisible(sourcePath: string, items: FsItem[], options: EnqueueOptions = {}) {
    this.currentSource = sourcePath;
    this.priorityQueue.enqueue(sourcePath, items, 'immediate');
  }

  enqueueBackground(sourcePath: string, items: FsItem[], options: EnqueueOptions = {}) {
    const delay = options.delay ?? 200;
    setTimeout(() => {
      if (this.currentSource === sourcePath) {
        this.priorityQueue.enqueue(sourcePath, items, options.priority ?? 'normal');
      }
    }, delay);
  }

  bumpPriority(sourcePath: string, itemPath: string, priority: ThumbnailPriority = 'immediate') {
    this.priorityQueue.bump(sourcePath, task => task.item.path === itemPath);
  }

  cancelBySource(sourcePath: string) {
    this.priorityQueue.cancelBySource(sourcePath);
  }

  clearAll() {
    this.priorityQueue.clear();
    clearQueue();
  }

  splitForEnqueue(items: FsItem[]) {
    const FIRST_SCREEN = 30;
    return {
      immediate: items.slice(0, FIRST_SCREEN),
      high: items.slice(FIRST_SCREEN, FIRST_SCREEN + 70),
      normal: items.slice(FIRST_SCREEN + 70),
    };
  }

  enqueueDirectoryThumbnails(path: string, items: FsItem[]) {
    this.cancelBySource(this.currentSource);
    
    const { immediate, high, normal } = this.splitForEnqueue(items);

    this.enqueueVisible(path, immediate);
    this.priorityQueue.enqueue(path, high, 'high');
    this.enqueueBackground(path, normal, { priority: 'normal', delay: 500 });
  }

  // 向后兼容的方法
  enqueueForPath(source: string, items: FsItem[], options: EnqueueOptions = {}) {
    const priority = options.priority === 'high' ? 'high' : 'normal';
    this.priorityQueue.enqueue(source, items, priority);
  }

  enqueueAdditional(source: string, items: FsItem[], options: EnqueueOptions = {}) {
    return this.enqueueForPath(source, items, options);
  }

  destroy() {
    this.executor.stop();
    this.clearAll();
  }
}

let instance: ThumbnailQueueService | null = null;

export function getThumbnailQueue(addThumbnail: (path: string, url: string) => void) {
  if (!instance) {
    instance = new ThumbnailQueueService(addThumbnail);
  }
  return instance;
}
