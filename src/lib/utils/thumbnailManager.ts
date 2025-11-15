import { FileSystemAPI } from '$lib/api';
import { toAssetUrl } from '$lib/utils/assetProxy';

type Priority = 'immediate' | 'high' | 'normal';

type QueueTask = {
  item: any; // FsItem
  source: string;
  priority: Priority;
  epoch: number;
};

class ThumbnailPriorityQueue {
  private queues = {
    immediate: new Map<string, QueueTask[]>(),
    high: new Map<string, QueueTask[]>(),
    normal: new Map<string, QueueTask[]>(),
  };

  enqueue(source: string, items: any[], priority: Priority = 'normal', epoch: number = 0) {
    const list = this.queues[priority].get(source) ?? [];
    const tasks = items.map(item => ({ item, source, priority, epoch }));
    this.queues[priority].set(source, list.concat(tasks));
  }

  // 提升指定任务的优先级
  bump(source: string, predicate: (task: QueueTask) => boolean) {
    for (const prio of ['normal', 'high'] as Priority[]) {
      const list = this.queues[prio].get(source);
      if (!list) continue;
      
      const toPromote = list.filter(predicate);
      if (toPromote.length) {
        this.queues[prio].set(source, list.filter(it => !predicate(it)));
        this.enqueue(source, toPromote.map(t => t.item), 'immediate', toPromote[0].epoch);
      }
    }
  }

  // 取消指定源的所有任务
  cancelBySource(source: string) {
    this.queues.immediate.delete(source);
    this.queues.high.delete(source);
    this.queues.normal.delete(source);
  }

  // 清空所有任务
  clearAll() {
    this.queues.immediate.clear();
    this.queues.high.clear();
    this.queues.normal.clear();
  }

  // 取出一批任务进行处理 - 增大批次以提高吞吐量
  takeBatch(max: number = 64): QueueTask[] {
    const batch: QueueTask[] = [];
    
    for (const prio of ['immediate', 'high', 'normal'] as Priority[]) {
      for (const [source, tasks] of this.queues[prio]) {
        while (tasks.length && batch.length < max) {
          const task = tasks.shift()!;
          batch.push(task);
        }
        
        if (!tasks.length) {
          this.queues[prio].delete(source);
        }
        
        if (batch.length >= max) {
          return batch;
        }
      }
      
      if (batch.length > 0) {
        return batch;
      }
    }
    
    return batch;
  }

  // 获取队列统计信息
  getStats() {
    return {
      immediate: Array.from(this.queues.immediate.values()).reduce((sum, tasks) => sum + tasks.length, 0),
      high: Array.from(this.queues.high.values()).reduce((sum, tasks) => sum + tasks.length, 0),
      normal: Array.from(this.queues.normal.values()).reduce((sum, tasks) => sum + tasks.length, 0),
    };
  }
}

class ThumbnailExecutor {
  private running = false;
  private currentEpoch = 0;
  private generating = new Map<string, { epoch: number; isArchive: boolean }>();
  private maxConcurrentLocal = 16;
  private maxConcurrentArchive = 8;
  private addThumbnailCb: ((path: string, url: string) => void) | null = null;

  constructor(private queue: ThumbnailPriorityQueue) {}

  configure(options: { 
    addThumbnail?: (path: string, url: string) => void; 
    maxConcurrentLocal?: number; 
    maxConcurrentArchive?: number; 
  }) {
    if (options.addThumbnail) this.addThumbnailCb = options.addThumbnail;
    if (typeof options.maxConcurrentLocal === 'number') this.maxConcurrentLocal = options.maxConcurrentLocal;
    if (typeof options.maxConcurrentArchive === 'number') this.maxConcurrentArchive = options.maxConcurrentArchive;
  }

  async start() {
    if (this.running) return;
    this.running = true;

    while (this.running) {
      // 每次只取一个任务
      const singleBatch = this.queue.takeBatch(1);
      
      if (!singleBatch.length) {
        await this.waitIdle(1);
        continue;
      }

      const task = singleBatch[0];
      const isArchive = this.isArchiveTask(task);
      
      // 检查对应类型的并发限制
      const currentGenerating = Array.from(this.generating.entries());
      const generatingCount = currentGenerating.filter(([, info]) => 
        info.epoch === this.currentEpoch && info.isArchive === isArchive
      ).length;
      
      const maxConcurrent = isArchive ? this.maxConcurrentArchive : this.maxConcurrentLocal;
      
      // 如果已达到并发限制，将任务放回队列稍后处理
      if (generatingCount >= maxConcurrent) {
        this.queue.enqueue(task.source, [task.item], task.priority, task.epoch);
        await this.waitIdle(1); // 短暂等待后重试
        continue;
      }

      // 立即处理单个任务
      this.generateThumbnail(task).catch(e => {
        console.error('缩略图生成失败:', task.item.path, e);
      });
      
      // 不等待，立即处理下一个任务
    }
  }

  stop() {
    this.running = false;
  }

  // 增加epoch，使旧任务失效
  bumpEpoch() {
    this.currentEpoch++;
  }

  // 清空队列并增加epoch
  clearQueue() {
    this.queue.clearAll();
    this.bumpEpoch();
  }

  // 取消指定源的任务
  cancelBySource(source: string) {
    this.queue.cancelBySource(source);
  }

  private async waitIdle(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isArchiveTask(task: QueueTask): boolean {
    const item = task.item;
    return item.name.endsWith('.zip') || 
           item.name.endsWith('.cbz') || 
           item.name.endsWith('.rar') || 
           item.name.endsWith('.cbr');
  }

  private async generateThumbnail(task: QueueTask) {
    const { item, source, epoch } = task;
    const path = item.path;

    // 检查是否已在生成中
    const generating = this.generating.get(path);
    if (generating && generating.epoch === epoch) return;

    // 标记为生成中
    this.generating.set(path, { 
      epoch, 
      isArchive: this.isArchiveTask(task) 
    });

    try {
      let thumbnail: string | null = null;
      const isArchive = this.isArchiveTask(task);
      const isDir = itemIsDirectory(item);
      const isVideo = path.match(/\.(mp4|mkv|avi|mov|flv|webm|wmv)$/i);

      if (isArchive) {
        console.log('首次加载压缩包，快速显示原图:', path);
        
        // 1. 快速获取原图，立即显示
        try {
          const blobUrl = await FileSystemAPI.getArchiveFirstImageQuick(path);
          if (blobUrl && this.addThumbnailCb && epoch === this.currentEpoch) {
            const key = this.toRelativeKey(path);
            console.log('原图已显示:', { key, blobUrl });
            this.addThumbnailCb(key, blobUrl);
          }
        } catch (e) {
          console.debug('快速获取原图失败，继续生成缩略图:', e);
        }
        
        // 2. 后台异步生成缩略图
        console.log('后台异步生成压缩包缩略图:', path);
        try {
          await FileSystemAPI.generateArchiveThumbnailAsync(path);
          console.log('缩略图已入队后台处理');
        } catch (e) {
          console.error('后台生成失败:', e);
        }
        
        return; // 不等待后台完成
      } else if (isDir) {
        console.log('生成文件夹缩略图:', path);
        thumbnail = await FileSystemAPI.generateFolderThumbnail(path);
      } else if (isVideo) {
        console.log('生成视频缩略图:', path);
        try {
          thumbnail = await FileSystemAPI.generateVideoThumbnail(path);
        } catch (e) {
          console.debug('视频缩略图生成失败，跳过:', e);
        }
      } else {
        console.log(' 生成文件缩略图:', path);
        thumbnail = await FileSystemAPI.generateFileThumbnail(path);
      }

      // 一旦生成成功，立即显示缩略图
      if (thumbnail && this.addThumbnailCb) {
        const converted = toAssetUrl(thumbnail) || String(thumbnail || '');
        const key = this.toRelativeKey(path);
        // 即使 epoch 过期也显示，因为用户可能仍然在查看
        console.log(' 缩略图生成成功，立即显示:', { key, raw: thumbnail, converted });
        this.addThumbnailCb(key, converted);
      }
    } catch (e) {
      console.error(' 缩略图生成失败:', path, e);
    } finally {
      this.generating.delete(path);
    }
  }

  private toRelativeKey(absPath: string): string {
    try {
      const root = typeof localStorage !== 'undefined' ? localStorage.getItem('neoview-thumbnail-root') : null;
      let p = String(absPath || '');
      // 统一反斜杠为正斜杠
      p = p.replace(/\\/g, '/');

      if (root) {
        let r = String(root).replace(/\\/g, '/');
        // 如果 root 没有以斜杠结尾，添加
        if (!r.endsWith('/')) r = r + '/';
        if (p.startsWith(r)) {
          let rel = p.slice(r.length);
          // 去掉开头的斜杠
          if (rel.startsWith('/')) rel = rel.slice(1);
          return rel;
        }
      }
      // 否则返回完整路径的规范化形式（用于不在 root 下的文件）
      if (p.startsWith('/')) p = p.slice(1);
      return p;
    } catch (e) {
      return absPath.replace(/\\/g, '/');
    }
  }
}

const priorityQueue = new ThumbnailPriorityQueue();
const executor = new ThumbnailExecutor(priorityQueue);

export function configureThumbnailManager(options: {
  addThumbnail?: (path: string, url: string) => void;
  maxConcurrentLocal?: number;
  maxConcurrentArchive?: number;
}) {
  executor.configure(options);
}

type FsLike = { isDir?: boolean; is_dir?: boolean; isImage?: boolean; is_image?: boolean } | null | undefined;

export function itemIsDirectory(item: FsLike): boolean {
  return Boolean(item && (item.isDir || item.is_dir));
}

export function itemIsImage(item: FsLike): boolean {
  return Boolean(item && (item.isImage || item.is_image));
}

export function toRelativeKey(absPath: string): string {
  try {
    const root = typeof localStorage !== 'undefined' ? localStorage.getItem('neoview-thumbnail-root') : null;
    let p = String(absPath || '');
    p = p.replace(/\\/g, '/');

    if (root) {
      let r = String(root).replace(/\\/g, '/');
      if (!r.endsWith('/')) r = r + '/';
      if (p.startsWith(r)) {
        let rel = p.slice(r.length);
        if (rel.startsWith('/')) rel = rel.slice(1);
        return rel;
      }
    }
    if (p.startsWith('/')) p = p.slice(1);
    return p;
  } catch (e) {
    return absPath.replace(/\\/g, '/');
  }
}

// 新的队列API
export function enqueueVisible(sourcePath: string, items: any[], options: { priority?: Priority; delay?: number } = {}) {
  const { priority = 'immediate', delay = 0 } = options;
  
  // 每个文件或文件夹独立入队，而不是批量入队
  const enqueueItems = () => {
    for (const item of items) {
      priorityQueue.enqueue(sourcePath, [item], priority, executor['currentEpoch']);
    }
  };
  
  if (delay > 0) {
    setTimeout(enqueueItems, delay);
  } else {
    enqueueItems();
  }
  
  // 确保执行器在运行
  if (!executor['running']) {
    executor.start();
  }
}

export function enqueueBackground(sourcePath: string, items: any[], options: { priority?: Priority; delay?: number } = {}) {
  const { priority = 'normal', delay = 200 } = options;
  
  setTimeout(() => {
    // 每个文件或文件夹独立入队
    for (const item of items) {
      priorityQueue.enqueue(sourcePath, [item], priority, executor['currentEpoch']);
    }
    
    // 确保执行器在运行
    if (!executor['running']) {
      executor.start();
    }
  }, delay);
}

export function bumpPriority(sourcePath: string, itemPath: string, newPriority: Priority) {
  priorityQueue.bump(sourcePath, task => task.item.path === itemPath);
}

export function cancelBySource(sourcePath: string) {
  executor.cancelBySource(sourcePath);
}

export function clearAll() {
  executor.clearQueue();
}

// 分批入队辅助函数 - 优化版本
export function splitForEnqueue(items: any[]) {
  // 优化策略：增加首屏数量，减少延迟
  const FIRST_SCREEN = 50;      // 增加到 50 个立即加载
  const SECOND_SCREEN = 100;    // 增加到 100 个高优先级
  
  return {
    immediate: items.slice(0, FIRST_SCREEN),
    high: items.slice(FIRST_SCREEN, FIRST_SCREEN + SECOND_SCREEN),
    normal: items.slice(FIRST_SCREEN + SECOND_SCREEN),
  };
}

export function enqueueDirectoryThumbnails(path: string, items: any[]) {
  // 不再分组，所有文件都独立入队
  // 前50个为最高优先级，接下来的100个为高优先级，其余为普通优先级
  const FIRST_SCREEN = 50;
  const SECOND_SCREEN = 100;
  
  // 立即入队前50个文件（最高优先级）
  for (let i = 0; i < Math.min(FIRST_SCREEN, items.length); i++) {
    priorityQueue.enqueue(path, [items[i]], 'immediate', executor['currentEpoch']);
  }
  
  // 立即入队接下来的100个文件（高优先级）
  for (let i = FIRST_SCREEN; i < Math.min(FIRST_SCREEN + SECOND_SCREEN, items.length); i++) {
    priorityQueue.enqueue(path, [items[i]], 'high', executor['currentEpoch']);
  }
  
  // 延迟入队剩余文件（普通优先级）
  if (items.length > FIRST_SCREEN + SECOND_SCREEN) {
    setTimeout(() => {
      for (let i = FIRST_SCREEN + SECOND_SCREEN; i < items.length; i++) {
        priorityQueue.enqueue(path, [items[i]], 'normal', executor['currentEpoch']);
      }
    }, 50); // 减少延迟时间
  }
  
  // 确保执行器在运行
  if (!executor['running']) {
    executor.start();
  }
}

export function clearQueue() {
  clearAll();
}

export function isGenerating(path: string) {
  return executor['generating'].has(path);
}

export function getQueueStats() {
  return executor.getStats();
}

// 启动执行器
executor.start();