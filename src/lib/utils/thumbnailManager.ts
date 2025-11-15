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

  // 取出一批任务进行处理
  takeBatch(max: number = 10): QueueTask[] {
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
  private maxConcurrentLocal = 32;   // 增加到32个并发（充分利用Worker）
  private maxConcurrentArchive = 16; // 增加到16个并发
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
      const batch = this.queue.takeBatch();
      
      if (!batch.length) {
        await this.waitIdle(32);
        continue;
      }

      // 按类型分组处理
      const archiveTasks = batch.filter(task => this.isArchiveTask(task));
      const localTasks = batch.filter(task => !this.isArchiveTask(task));

      // 检查并发限制
      const currentGenerating = Array.from(this.generating.entries());
      const generatingLocal = currentGenerating.filter(([, info]) => 
        info.epoch === this.currentEpoch && !info.isArchive
      ).length;
      const generatingArchive = currentGenerating.filter(([, info]) => 
        info.epoch === this.currentEpoch && info.isArchive
      ).length;

      // 处理本地任务
      const localToProcess = localTasks.slice(0, Math.max(0, this.maxConcurrentLocal - generatingLocal));
      // 处理压缩包任务
      const archiveToProcess = archiveTasks.slice(0, Math.max(0, this.maxConcurrentArchive - generatingArchive));

      // 将无法处理的任务重新放回队列
      const deferredTasks = [
        ...localTasks.slice(localToProcess.length),
        ...archiveTasks.slice(archiveToProcess.length)
      ];
      
      if (deferredTasks.length > 0) {
        for (const task of deferredTasks) {
          this.queue.enqueue(task.source, [task.item], task.priority, task.epoch);
        }
      }

      // 处理选中的任务
      const tasksToProcess = [...localToProcess, ...archiveToProcess];
      
      if (tasksToProcess.length > 0) {
        await Promise.allSettled(
          tasksToProcess.map(task => this.generateThumbnail(task))
        );
      }

      // immediate 批次不必等待过久
      const hasImmediate = batch.some(task => task.priority === 'immediate');
      await this.waitIdle(hasImmediate ? 8 : 16);
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

  getStats() {
    return this.queue.getStats();
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
        console.log(' 生成压缩包缩略图:', path);
        thumbnail = await FileSystemAPI.generateArchiveThumbnailRoot(path);
      } else if (isDir) {
        console.log(' 生成文件夹缩略图:', path);
        thumbnail = await FileSystemAPI.generateFolderThumbnail(path);
      } else if (isVideo) {
        console.log(' 生成视频缩略图:', path);
        try {
          thumbnail = await FileSystemAPI.generateVideoThumbnail(path);
        } catch (e) {
          console.debug('视频缩略图生成失败，跳过:', e);
        }
      } else {
        console.log(' 生成文件缩略图:', path);
        thumbnail = await FileSystemAPI.generateFileThumbnail(path);
      }

      // 在调用回调之前检查任务 epoch 是否仍然有效
      if (thumbnail && this.addThumbnailCb && epoch === this.currentEpoch) {
        let converted = toAssetUrl(thumbnail) || String(thumbnail || '');
        
        // 如果是blob URL ID，需要通过Tauri命令获取二进制数据
        if (converted.startsWith('blob:')) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const binaryData = await invoke<number[]>('load_thumbnail_async', { filePath: path });
            const blob = new Blob([new Uint8Array(binaryData)]);
            converted = URL.createObjectURL(blob);
            console.log(' blob URL已转换:', { key: path, blobUrl: converted });
          } catch (e) {
            console.warn(' 无法转换blob URL，使用原始值:', e);
          }
        }
        
        const key = this.toRelativeKey(path);
        console.log(' 缩略图生成成功:', { key, raw: thumbnail, converted });
        this.addThumbnailCb(key, converted);
      } else if (thumbnail && epoch !== this.currentEpoch) {
        console.log(' 任务结果已过期:', { path, epoch, current: this.currentEpoch });
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
  
  if (delay > 0) {
    setTimeout(() => {
      priorityQueue.enqueue(sourcePath, items, priority, executor['currentEpoch']);
    }, delay);
  } else {
    priorityQueue.enqueue(sourcePath, items, priority, executor['currentEpoch']);
  }
  
  // 确保执行器在运行
  if (!executor['running']) {
    executor.start();
  }
}

export function enqueueBackground(sourcePath: string, items: any[], options: { priority?: Priority; delay?: number } = {}) {
  const { priority = 'normal', delay = 200 } = options;
  
  setTimeout(() => {
    priorityQueue.enqueue(sourcePath, items, priority, executor['currentEpoch']);
    
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
  // 优化策略：最大化immediate优先级，快速加载当前屏幕
  const FIRST_SCREEN = 200;     // 增加到 200 个立即加载（用最多线程）
  const SECOND_SCREEN = 100;    // 高优先级 100 个
  
  return {
    immediate: items.slice(0, FIRST_SCREEN),
    high: items.slice(FIRST_SCREEN, FIRST_SCREEN + SECOND_SCREEN),
    normal: items.slice(FIRST_SCREEN + SECOND_SCREEN),
  };
}

// 记录当前正在加载的目录
let currentLoadingPath: string | null = null;

export function enqueueDirectoryThumbnails(path: string, items: any[]) {
  // 如果切换了目录，取消上一个目录的所有任务
  if (currentLoadingPath && currentLoadingPath !== path) {
    console.log('🔄 切换目录，取消上一个目录的任务:', currentLoadingPath);
    cancelBySource(currentLoadingPath);
  }
  
  currentLoadingPath = path;
  
  const { immediate, high, normal } = splitForEnqueue(items);

  // 立即入队第一屏 - 用最高优先级和最多线程
  enqueueVisible(path, immediate, { priority: 'immediate' });
  
  // 高优先级无延迟入队
  enqueueVisible(path, high, { priority: 'high' });
  
  // 普通优先级降低延迟，加快整体加载速度
  enqueueBackground(path, normal, { priority: 'normal', delay: 50 });
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