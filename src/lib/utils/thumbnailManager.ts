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
  private maxConcurrentLocal = 32;  // 提高本地文件并发数
  private maxConcurrentArchive = 16; // 提高压缩包并发数
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
      console.log('⚡ 首次加载压缩包，快速显示原图:', path);
      try {
        // 获取原图二进制数据
        const imageData = await FileSystemAPI.getArchiveFirstImageQuick(path);
        if (imageData && imageData.length > 0) {
          // 创建 Blob URL
          const blob = new Blob([imageData], { type: 'image/jpeg' });
          const blobUrl = URL.createObjectURL(blob);
          
          if (this.addThumbnailCb) {
            const key = this.toRelativeKey(path);
            this.addThumbnailCb(key, blobUrl);
          }
          
          console.log('⚡ 快速显示原图成功:', path, 'size:', imageData.length);
        }
      } catch (e) {
        console.debug('⚡ 快速获取原图失败，继续生成缩略图:', e);
      }

      // 后台异步生成压缩包缩略图（不等待）
      console.log('🔄 后台异步生成压缩包缩略图:', path);
      try {
        const result = await FileSystemAPI.generateArchiveThumbnailAsync(path);
        console.log('✅ 后台缩略图生成完成:', path, result);
        
        // 缩略图生成完成后，重新获取并更新显示
        if (this.addThumbnailCb) {
          try {
            const thumbnailUrl = await FileSystemAPI.generateArchiveThumbnailRoot(path);
            const key = this.toRelativeKey(path);
            this.addThumbnailCb(key, thumbnailUrl);
            console.log('✅ 更新为正式缩略图:', path);
          } catch (e) {
            console.debug('更新缩略图失败:', e);
          }
        }
      } catch (e) {
        console.error('❌ 后台生成失败:', e);
      }
      return;
    }

    if (isDir) {
      // 对于文件夹，直接使用后端API（因为前端调度器已经过滤了文件类型）
      thumbnail = await FileSystemAPI.generateFolderThumbnail(path);
    } else if (isVideo) {
      try {
        thumbnail = await FileSystemAPI.generateVideoThumbnail(path);
      } catch (e) {
        console.debug('视频缩略图生成失败，跳过:', e);
      }
    } else {
      // 对于普通文件，使用新的异步API
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

// 定义FsItem类型
interface FsItem {
  name: string;
  path: string;
  isDir: boolean;
  is_dir?: boolean;
  isImage?: boolean;
  is_image?: boolean;
  size?: number;
  modified?: string | number;
  created?: string | number;
  [key: string]: any;
}

// 新的队列API
export function enqueueVisible(sourcePath: string, items: FsItem[], options: { priority?: Priority; delay?: number } = {}) {
  const { priority = 'immediate', delay = 0 } = options;

  const run = () => scheduler.enqueue(sourcePath, items, priority);
  if (delay > 0) setTimeout(run, delay);
  else run();
}

export function enqueueBackground(sourcePath: string, items: FsItem[], options: { priority?: Priority; delay?: number } = {}) {
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

export function enqueueDirectoryThumbnails(path: string, items: FsItem[]) {
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

  // 优化批量任务调度：分批次处理，保持高并发
  const FIRST_BATCH = 200;    // 首屏立即处理
  const SECOND_BATCH = 200;   // 第二批次高优先级
  const THIRD_BATCH = 200;    // 第三批次普通优先级

  console.log(`📦 [Frontend] 批量调度: 总计 ${supportedItems.length} 个项目，分 3 批次处理`);

  // 第一批次：立即处理（首屏可见）
  scheduler.enqueue(path, supportedItems.slice(0, FIRST_BATCH), 'immediate');
  console.log(`⚡ [Frontend] 第一批次: ${Math.min(FIRST_BATCH, supportedItems.length)} 个项目 (immediate)`);

  // 第二批次：高优先级（即将可见）
  if (supportedItems.length > FIRST_BATCH) {
    scheduler.enqueue(path, supportedItems.slice(FIRST_BATCH, FIRST_BATCH + SECOND_BATCH), 'high');
    console.log(`🚀 [Frontend] 第二批次: ${Math.min(SECOND_BATCH, supportedItems.length - FIRST_BATCH)} 个项目 (high)`);
  }

  // 第三批次：普通优先级（后台处理）
  if (supportedItems.length > FIRST_BATCH + SECOND_BATCH) {
    const rest = supportedItems.slice(FIRST_BATCH + SECOND_BATCH);
    setTimeout(() => {
      scheduler.enqueue(path, rest, 'normal');
      console.log(`🔄 [Frontend] 第三批次: ${rest.length} 个项目 (normal)`);
    }, 50); // 短暂延迟确保前两批优先处理
  }
}

// 新增：判断是否为支持的缩略图目标
export function isSupportedThumbnailTarget(item: FsItem): boolean {
  const name = item?.name || '';
  const isDir = itemIsDirectory(item);
  
  // 支持的图片扩展名
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.avif', '.jxl', '.tiff', '.tif'];
  // 支持的压缩包扩展名
  const archiveExts = ['.zip', '.rar', '.7z', '.cbz', '.cbr', '.cb7'];
  // 支持的视频扩展名
  const videoExts = ['.mp4', '.mkv', '.avi', '.mov', 'webm', '.flv', '.wmv', '.m4v'];
  
  const ext = name.toLowerCase().substring(name.lastIndexOf('.'));
  
  // 文件夹或支持的文件类型
  return isDir || imageExts.includes(ext) || archiveExts.includes(ext) || videoExts.includes(ext);
}

// 新增：批量喂任务保持高并发
export function loadThumbnailsForItems(path: string, items: FsItem[]) {
  if (!items?.length) return;

  // 过滤出支持的项目
  const supported = items.filter(isSupportedThumbnailTarget);
  if (!supported.length) return;

  console.log(`📦 [Frontend] 加载缩略图: ${supported.length} 个支持的项目`);

  // 分批处理策略
  const batchSize = 200;
  const batches: FsItem[][] = [];
  
  for (let i = 0; i < supported.length; i += batchSize) {
    batches.push(supported.slice(i, i + batchSize));
  }

  // 立即处理第一批
  if (batches[0]) {
    scheduler.enqueue(path, batches[0], 'immediate');
    console.log(`⚡ [Frontend] 立即处理第一批: ${batches[0].length} 个项目`);
  }

  // 延迟处理第二批
  if (batches[1]) {
    setTimeout(() => {
      scheduler.enqueue(path, batches[1], 'high');
      console.log(`🚀 [Frontend] 延迟处理第二批: ${batches[1].length} 个项目`);
    }, 10);
  }

  // 后台处理剩余批次
  for (let i = 2; i < batches.length; i++) {
    setTimeout(() => {
      scheduler.enqueue(path, batches[i], 'normal');
      console.log(`🔄 [Frontend] 后台处理第${i+1}批: ${batches[i].length} 个项目`);
    }, 50 * i);
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