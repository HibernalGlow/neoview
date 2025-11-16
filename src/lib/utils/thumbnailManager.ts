import { FileSystemAPI } from '$lib/api';
import { toAssetUrl } from '$lib/utils/assetProxy';
import { thumbnailState } from '$lib/stores/thumbnailState';
import { thumbnailStore, setupThumbnailEventListener } from '$lib/thumbnailManager';
import { startThumbnailEventListener, stopThumbnailEventListener, isThumbnailEventListenerActive } from './thumbnailEvents';

type Priority = 'foreground' | 'immediate' | 'high' | 'normal';

type QueueTask = {
  item: any; // FsItem
  sourceId: string; // 目录路径
  priority: Priority;
};

const PRIORITY_ORDER: Priority[] = ['foreground', 'immediate', 'high', 'normal'];

class ThumbnailScheduler {
  private queues: Record<Priority, QueueTask[]> = {
    foreground: [],
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
  private currentSourceId: string | null = null;

  configure(options: {
    addThumbnail?: (path: string, url: string) => void;
    maxConcurrentLocal?: number;
    maxConcurrentArchive?: number;
  }) {
    if (options.addThumbnail) this.addThumbnailCb = options.addThumbnail;
    if (typeof options.maxConcurrentLocal === 'number') this.maxConcurrentLocal = options.maxConcurrentLocal;
    if (typeof options.maxConcurrentArchive === 'number') this.maxConcurrentArchive = options.maxConcurrentArchive;
    
    // 启动事件监听器
    this.setupEventListener();
    
    // 设置新的事件监听（blob 系统）
    setupThumbnailEventListener();
    
    this.processQueue();
  }

  private setupEventListener() {
    if (!isThumbnailEventListenerActive()) {
      startThumbnailEventListener((event) => {
        const normalizedPath = this.normalizePath(event.path);
        
        // 更新旧的状态缓存（仅保兼容，不驱动UI）
        thumbnailState.cacheThumbnail(normalizedPath, event.url);
        
        // 更新新的状态系统（主要状态源）
        const isBlob = event.url.startsWith('blob:');
        thumbnailStore.update(normalizedPath, event.url, isBlob, isBlob ? event.url : undefined);
        
        // 不再直接调用 addThumbnailCb，让UI订阅 thumbnailStore
        // if (this.addThumbnailCb) {
        //   const key = this.toRelativeKey(event.path);
        //   this.addThumbnailCb(key, event.url);
        // }
        
        // 从处理中状态移除
        this.generating.delete(normalizedPath);
        
        console.log(`📸 [Frontend] 事件更新缩略图: ${event.path}`);
      });
    }
  }

  enqueue(sourceId: string, items: any[], priority: Priority = 'normal') {
    if (!items?.length) return;

    const queue = this.queues[priority];
    let added = false;

    for (const item of items) {
      if (!item || !item.path) continue;
      const normalized = this.normalizePath(item.path);
      if (this.generating.has(normalized) || this.queuedPaths.has(normalized)) continue;

      queue.push({ item, sourceId, priority });
      this.queuedPaths.add(normalized);
      added = true;
    }

    if (added) {
      this.processQueue();
    }
  }

  cancelBySource(sourceId: string) {
    // 取消后端任务
    thumbnailState.cancelDirectoryTasks(sourceId).catch(error => {
      console.error('❌ 取消目录任务失败:', error);
    });
    
    // 取消前端队列中的任务
    for (const priority of PRIORITY_ORDER) {
      const tasks = this.queues[priority];
      if (!tasks.length) continue;
      this.queues[priority] = tasks.filter(task => {
        if (task.sourceId === sourceId) {
          this.queuedPaths.delete(this.normalizePath(task.item.path));
          return false;
        }
        return true;
      });
    }
  }

  setCurrentSource(sourceId: string) {
    if (this.currentSourceId !== sourceId) {
      // 取消旧目录的前台任务
      if (this.currentSourceId) {
        this.clearForegroundQueue();
      }
      
      this.currentSourceId = sourceId;
      console.log(`🎯 [Frontend] 设置前台源: ${sourceId}`);
      
      // 通知后端更新前台源
      this.setForegroundSource(sourceId);
    }
  }

  private clearForegroundQueue() {
    const foregroundTasks = this.queues.foreground;
    for (const task of foregroundTasks) {
      this.queuedPaths.delete(this.normalizePath(task.item.path));
    }
    this.queues.foreground = [];
  }

  private async setForegroundSource(sourceId: string) {
    try {
      await FileSystemAPI.setForegroundSource(sourceId);
    } catch (error) {
      console.error('❌ 设置前台源失败:', error);
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
      foreground: this.queues.foreground.length,
      immediate: this.queues.immediate.length,
      high: this.queues.high.length,
      normal: this.queues.normal.length,
      runningLocal: this.runningLocal,
      runningArchive: this.runningArchive,
      currentSourceId: this.currentSourceId,
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
    const normalizedPath = this.normalizePath(path);

    // 标记为处理中
    thumbnailState.markProcessing(normalizedPath);

    let thumbnail: string | null = null;
    const isArchive = this.isArchive(task);
    const isDir = itemIsDirectory(item);
    const isVideo = path.match(/\.(mp4|mkv|avi|mov|flv|webm|wmv|m4v)$/i);

    try {
      if (isArchive) {
        console.log('⚡ 首次加载压缩包，快速显示原图:', path);
        try {
          // 使用新的 blob API 获取 blob URL
          const blobUrl = await FileSystemAPI.getArchiveFirstImageBlob(path);
          if (blobUrl) {
            // 更新旧的状态系统（仅保兼容，不驱动UI）
            thumbnailState.cacheThumbnail(normalizedPath, blobUrl);
            
            // 更新新的状态系统（主要状态源）
            const blobKey = blobUrl.startsWith('blob:') ? blobUrl : undefined;
            thumbnailStore.update(normalizedPath, blobUrl, true, blobKey);
            
            // 不再直接调用 addThumbnailCb，让UI订阅 thumbnailStore
            // if (this.addThumbnailCb) {
            //   const key = this.toRelativeKey(path);
            //   this.addThumbnailCb(key, blobUrl);
            // }
            
            console.log('⚡ 快速显示原图成功:', path, 'blob URL:', blobUrl);
          }
        } catch (e) {
          console.debug('⚡ 快速获取原图失败，继续生成缩略图:', e);
        }

        // 后台异步生成压缩包缩略图（不等待）
        console.log('🔄 后台异步生成压缩包缩略图:', path);
        try {
          const result = await FileSystemAPI.generateArchiveThumbnailAsync(path);
          console.log('✅ 后台缩略图生成已入队:', path, result);
          
          // 缩略图生成完成后，将通过事件通知更新UI，不再主动获取
          console.log('✅ 缩略图生成完成，等待事件通知:', path);
        } catch (e) {
          console.error('❌ 后台生成失败:', e);
          thumbnailState.markError(normalizedPath, e as string);
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
          thumbnailState.markError(normalizedPath, e as string);
        }
      } else {
        // 对于普通文件，使用新的异步API
        thumbnail = await FileSystemAPI.generateFileThumbnail(path);
      }

      if (thumbnail) {
        const converted = toAssetUrl(thumbnail) || String(thumbnail || '');
        thumbnailState.cacheThumbnail(normalizedPath, converted);
        
        if (this.addThumbnailCb) {
          const key = this.toRelativeKey(path);
          this.addThumbnailCb(key, converted);
        }
      }
    } catch (error) {
      console.error('❌ 生成缩略图失败:', path, error);
      thumbnailState.markError(normalizedPath, error as string);
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
  const { priority = 'foreground', delay = 0 } = options;

  // 设置为当前前台源
  scheduler.setCurrentSource(sourcePath);

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
  // 直接使用新的 loadThumbnailsForItems 函数，它已经实现了压缩包优先策略
  loadThumbnailsForItems(path, items);
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

  // 设置为当前前台源
  scheduler.setCurrentSource(path);

  // 过滤出支持的项目
  const supported = items.filter(isSupportedThumbnailTarget);
  if (!supported.length) return;

  console.log(`📦 [Frontend] 加载缩略图: ${supported.length} 个支持的项目`);

  // 分离压缩包和文件夹/其他文件
  const archives: FsItem[] = [];
  const others: FsItem[] = [];
  
  for (const item of supported) {
    if (isArchiveFile(item)) {
      archives.push(item);
    } else {
      others.push(item);
    }
  }

  console.log(`📦 [Frontend] 分类: ${archives.length} 个压缩包, ${others.length} 个其他项目`);

  // 优先处理压缩包
  if (archives.length > 0) {
    const batchSize = 200;
    const archiveBatches = Math.ceil(archives.length / batchSize);

    for (let batchIndex = 0; batchIndex < archiveBatches; batchIndex++) {
      const start = batchIndex * batchSize;
      const batch = archives.slice(start, start + batchSize);
      const priority: Priority = batchIndex === 0 ? 'foreground' : batchIndex === 1 ? 'high' : 'normal';

      if (batchIndex === 0) {
        scheduler.enqueue(path, batch, priority);
        console.log(`⚡ [Frontend] 立即处理压缩包批次 ${batchIndex + 1}: ${batch.length} 个项目 (${priority})`);
      } else {
        const delay = batchIndex === 1 ? 10 : 50 * batchIndex;
        setTimeout(() => {
          scheduler.enqueue(path, batch, priority);
          console.log(`🔄 [Frontend] 处理压缩包批次 ${batchIndex + 1}: ${batch.length} 个项目 (${priority})`);
        }, delay);
      }
    }
  }

  // 压缩包处理完毕后再处理其他项目
  if (others.length > 0) {
    const batchSize = 200;
    const baseDelay = Math.ceil(archives.length / batchSize) * 60 + 100;
    for (let batchIndex = 0; batchIndex < Math.ceil(others.length / batchSize); batchIndex++) {
      const start = batchIndex * batchSize;
      const batch = others.slice(start, start + batchSize);
      setTimeout(() => {
        scheduler.enqueue(path, batch, 'normal');
        console.log(`📁 [Frontend] 处理其他项目批次 ${batchIndex + 1}: ${batch.length} 个项目`);
      }, baseDelay + 50 * batchIndex);
    }
  }
}

// 判断是否为压缩包文件
function isArchiveFile(item: FsItem): boolean {
  if (!item || !item.name || itemIsDirectory(item)) return false;
  
  const archiveExts = ['.zip', '.rar', '.7z', '.cbz', '.cbr', '.cb7'];
  const name = item.name.toLowerCase();
  const ext = name.substring(name.lastIndexOf('.'));
  
  return archiveExts.includes(ext);
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