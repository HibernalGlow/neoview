import { FileSystemAPI } from '$lib/api';
import { toAssetUrl } from '$lib/utils/assetProxy';
import { thumbnailState } from '$lib/stores/thumbnailState';
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
    
    this.processQueue();
  }

  private setupEventListener() {
    if (!isThumbnailEventListenerActive()) {
      startThumbnailEventListener((event) => {
        const normalizedPath = this.normalizePath(event.path);
        
        // 更新状态缓存
        thumbnailState.cacheThumbnail(normalizedPath, event.url);
        
        // 调用回调更新UI
        if (this.addThumbnailCb) {
          const key = this.toRelativeKey(event.path);
          this.addThumbnailCb(key, event.url);
        }
        
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
          const blobUrl = await FileSystemAPI.getArchiveFirstImageQuick(path);
          if (blobUrl) {
            // 缓存临时缩略图
            thumbnailState.cacheThumbnail(normalizedPath, blobUrl);
            
            if (this.addThumbnailCb) {
              const key = this.toRelativeKey(path);
              this.addThumbnailCb(key, blobUrl);
            }
            
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
  if (!items?.length) return;

  // 设置为当前前台源
  scheduler.setCurrentSource(path);

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

  // 第一批次：前台处理（首屏可见）
  scheduler.enqueue(path, supportedItems.slice(0, FIRST_BATCH), 'foreground');
  console.log(`⚡ [Frontend] 第一批次: ${Math.min(FIRST_BATCH, supportedItems.length)} 个项目 (foreground)`);

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

  // 设置为当前前台源
  scheduler.setCurrentSource(path);

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

  // 立即处理第一批（前台）
  if (batches[0]) {
    scheduler.enqueue(path, batches[0], 'foreground');
    console.log(`⚡ [Frontend] 立即处理第一批: ${batches[0].length} 个项目 (foreground)`);
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