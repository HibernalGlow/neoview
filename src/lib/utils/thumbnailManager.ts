import { FileSystemAPI } from '$lib/api';
import { toAssetUrl } from '$lib/utils/assetProxy';

type Priority = 'immediate' | 'high' | 'normal';

type QueueTask = {
  item: any; // FsItem
  source: string;
  priority: Priority;
};

const PRIORITY_ORDER: Priority[] = ['immediate', 'high', 'normal'];

class ThumbnailScheduler {
  private queues: Record<Priority, QueueTask[]> = {
    immediate: [],
    high: [],
    normal: [],
  };
  private queuedPaths = new Set<string>();
  private generating = new Map<string, 'archive' | 'local'>();
  private runningLocal = 0;
  private runningArchive = 0;
  private maxConcurrentLocal = 16;
  private maxConcurrentArchive = 8;
  private addThumbnailCb: ((path: string, url: string) => void) | null = null;
  private processing = false;

  configure(options: {
    addThumbnail?: (path: string, url: string) => void;
    maxConcurrentLocal?: number;
    maxConcurrentArchive?: number;
  }) {
    if (options.addThumbnail) this.addThumbnailCb = options.addThumbnail;
    if (typeof options.maxConcurrentLocal === 'number') this.maxConcurrentLocal = options.maxConcurrentLocal;
    if (typeof options.maxConcurrentArchive === 'number') this.maxConcurrentArchive = options.maxConcurrentArchive;
    this.processQueue();
  }

  enqueue(source: string, items: any[], priority: Priority = 'normal') {
    if (!items?.length) return;

    const queue = this.queues[priority];
    let added = false;

    for (const item of items) {
      if (!item || !item.path) continue;
      const normalized = this.normalizePath(item.path);
      if (this.generating.has(normalized) || this.queuedPaths.has(normalized)) continue;

      queue.push({ item, source, priority });
      this.queuedPaths.add(normalized);
      added = true;
    }

    if (added) {
      this.processQueue();
    }
  }

  cancelBySource(source: string) {
    for (const priority of PRIORITY_ORDER) {
      const tasks = this.queues[priority];
      if (!tasks.length) continue;
      this.queues[priority] = tasks.filter(task => {
        if (task.source === source) {
          this.queuedPaths.delete(this.normalizePath(task.item.path));
          return false;
        }
        return true;
      });
    }
  }

  clearAll() {
    for (const priority of PRIORITY_ORDER) {
      this.queues[priority] = [];
    }
    this.queuedPaths.clear();
  }

  isGenerating(path: string) {
    return this.generating.has(this.normalizePath(path));
  }

  getStats() {
    return {
      immediate: this.queues.immediate.length,
      high: this.queues.high.length,
      normal: this.queues.normal.length,
      runningLocal: this.runningLocal,
      runningArchive: this.runningArchive,
    };
  }

  private processQueue() {
    if (this.processing) return;
    this.processing = true;
    queueMicrotask(() => {
      this.drainQueues();
      this.processing = false;
    });
  }

  private drainQueues() {
    while (true) {
      const nextTask = this.pickRunnableTask();
      if (!nextTask) break;
      this.startTask(nextTask);
    }
  }

  private pickRunnableTask(): QueueTask | null {
    for (const priority of PRIORITY_ORDER) {
      const queue = this.queues[priority];
      for (let i = 0; i < queue.length; i++) {
        const task = queue[i];
        if (this.canRun(task)) {
          queue.splice(i, 1);
          this.queuedPaths.delete(this.normalizePath(task.item.path));
          return task;
        }
      }
    }
    return null;
  }

  private canRun(task: QueueTask) {
    const isArchive = this.isArchive(task);
    const limit = isArchive ? this.maxConcurrentArchive : this.maxConcurrentLocal;
    const running = isArchive ? this.runningArchive : this.runningLocal;
    return running < limit;
  }

  private startTask(task: QueueTask) {
    const isArchive = this.isArchive(task);
    const normalized = this.normalizePath(task.item.path);

    if (isArchive) this.runningArchive++;
    else this.runningLocal++;

    this.generating.set(normalized, isArchive ? 'archive' : 'local');

    this.generateThumbnail(task)
      .catch((e) => {
        console.error('缩略图生成失败:', task.item?.path, e);
      })
      .finally(() => {
        this.generating.delete(normalized);
        if (isArchive) this.runningArchive--;
        else this.runningLocal--;
        this.processQueue();
      });
  }

  private async generateThumbnail(task: QueueTask) {
    const { item } = task;
    const path = item.path;

    let thumbnail: string | null = null;
    const isArchive = this.isArchive(task);
    const isDir = itemIsDirectory(item);
    const isVideo = path.match(/\.(mp4|mkv|avi|mov|flv|webm|wmv)$/i);

    if (isArchive) {
      console.log('首次加载压缩包，快速显示原图:', path);
      try {
        const blobUrl = await FileSystemAPI.getArchiveFirstImageQuick(path);
        if (blobUrl && this.addThumbnailCb) {
          const key = this.toRelativeKey(path);
          this.addThumbnailCb(key, blobUrl);
        }
      } catch (e) {
        console.debug('快速获取原图失败，继续生成缩略图:', e);
      }

      console.log('后台异步生成压缩包缩略图:', path);
      try {
        await FileSystemAPI.generateArchiveThumbnailAsync(path);
      } catch (e) {
        console.error('后台生成失败:', e);
      }
      return;
    }

    if (isDir) {
      thumbnail = await FileSystemAPI.generateFolderThumbnail(path);
    } else if (isVideo) {
      try {
        thumbnail = await FileSystemAPI.generateVideoThumbnail(path);
      } catch (e) {
        console.debug('视频缩略图生成失败，跳过:', e);
      }
    } else {
      thumbnail = await FileSystemAPI.generateFileThumbnail(path);
    }

    if (thumbnail && this.addThumbnailCb) {
      const converted = toAssetUrl(thumbnail) || String(thumbnail || '');
      const key = this.toRelativeKey(path);
      this.addThumbnailCb(key, converted);
    }
  }

  private isArchive(task: QueueTask) {
    const name = task.item?.name || '';
    return name.endsWith('.zip') || name.endsWith('.cbz') || name.endsWith('.rar') || name.endsWith('.cbr');
  }

  private normalizePath(path: string) {
    return String(path || '').replace(/\\/g, '/');
  }

  private toRelativeKey(absPath: string): string {
    try {
      const root = typeof localStorage !== 'undefined' ? localStorage.getItem('neoview-thumbnail-root') : null;
      let p = this.normalizePath(absPath);

      if (root) {
        let r = this.normalizePath(root);
        if (!r.endsWith('/')) r += '/';
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
}

const scheduler = new ThumbnailScheduler();

export function configureThumbnailManager(options: {
  addThumbnail?: (path: string, url: string) => void;
  maxConcurrentLocal?: number;
  maxConcurrentArchive?: number;
}) {
  scheduler.configure(options);
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

  // 过滤出支持的文件类型（图片和压缩包）
  const supportedItems = items.filter(item => {
    const name = item?.name || '';
    const isDir = itemIsDirectory(item);
    
    // 支持的图片扩展名
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.avif', '.jxl', '.tiff', '.tif'];
    // 支持的压缩包扩展名
    const archiveExts = ['.zip', '.rar', '.7z', '.cbz', '.cbr', '.cb7'];
    
    const ext = name.toLowerCase().substring(name.lastIndexOf('.'));
    
    // 文件夹或支持的文件类型
    return isDir || imageExts.includes(ext) || archiveExts.includes(ext);
  });

  const run = () => scheduler.enqueue(sourcePath, supportedItems, priority);
  if (delay > 0) setTimeout(run, delay);
  else run();
}

export function enqueueBackground(sourcePath: string, items: any[], options: { priority?: Priority; delay?: number } = {}) {
  const { priority = 'normal', delay = 200 } = options;
  
  // 过滤出支持的文件类型（图片和压缩包）
  const supportedItems = items.filter(item => {
    const name = item?.name || '';
    const isDir = itemIsDirectory(item);
    
    // 支持的图片扩展名
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.avif', '.jxl', '.tiff', '.tif'];
    // 支持的压缩包扩展名
    const archiveExts = ['.zip', '.rar', '.7z', '.cbz', '.cbr', '.cb7'];
    
    const ext = name.toLowerCase().substring(name.lastIndexOf('.'));
    
    // 文件夹或支持的文件类型
    return isDir || imageExts.includes(ext) || archiveExts.includes(ext);
  });
  
  setTimeout(() => scheduler.enqueue(sourcePath, supportedItems, priority), delay);
}

export function bumpPriority(_sourcePath: string, _itemPath: string, _newPriority: Priority) {
  // 简化后的调度不支持动态提升，界面层通过重新入队最新可见项来实现“优先当前”行为
}

export function cancelBySource(sourcePath: string) {
  scheduler.cancelBySource(sourcePath);
}

export function clearAll() {
  scheduler.clearAll();
}

export function enqueueDirectoryThumbnails(path: string, items: any[]) {
  if (!items?.length) return;

  // 过滤出支持的文件类型（图片和压缩包）
  const supportedItems = items.filter(item => {
    const name = item?.name || '';
    const isDir = itemIsDirectory(item);
    
    // 支持的图片扩展名
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.avif', '.jxl', '.tiff', '.tif'];
    // 支持的压缩包扩展名
    const archiveExts = ['.zip', '.rar', '.7z', '.cbz', '.cbr', '.cb7'];
    
    const ext = name.toLowerCase().substring(name.lastIndexOf('.'));
    
    // 文件夹或支持的文件类型
    return isDir || imageExts.includes(ext) || archiveExts.includes(ext);
  });

  const FIRST_SCREEN = 50;
  const SECOND_SCREEN = 100;

  scheduler.enqueue(path, supportedItems.slice(0, FIRST_SCREEN), 'immediate');
  scheduler.enqueue(path, supportedItems.slice(FIRST_SCREEN, FIRST_SCREEN + SECOND_SCREEN), 'high');
  const rest = supportedItems.slice(FIRST_SCREEN + SECOND_SCREEN);
  if (rest.length) {
    setTimeout(() => scheduler.enqueue(path, rest, 'normal'), 50);
  }
}

export function clearQueue() {
  scheduler.clearAll();
}

export function isGenerating(path: string) {
  return scheduler.isGenerating(path);
}

export function getQueueStats() {
  return scheduler.getStats();
}