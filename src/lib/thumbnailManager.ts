import { get, writable } from 'svelte/store';
import { listen } from '@tauri-apps/api/event';
import { 
  getArchiveFirstImageBlob, 
  getBlobContent, 
  releaseBlob,
  cleanupExpiredBlobs,
  enqueueArchivePreload, 
  generateArchiveThumbnailAsync, 
  setForegroundSource 
} from './api/archive';

interface ThumbnailEntry {
  path: string;
  url: string;
  isBlob: boolean;
  isLoading: boolean;
  blobKey?: string;
}

// Blob 生命周期管理
class BlobLifecycle {
  private refCounts = new Map<string, number>();
  
  touch(blobKey: string) {
    const current = this.refCounts.get(blobKey) || 0;
    this.refCounts.set(blobKey, current + 1);
  }
  
  release(blobKey: string) {
    const current = this.refCounts.get(blobKey) || 0;
    if (current <= 1) {
      this.refCounts.delete(blobKey);
      // 通知后端释放
      releaseBlob(blobKey).catch(err => {
        console.warn('释放 blob 失败:', err);
      });
    } else {
      this.refCounts.set(blobKey, current - 1);
    }
  }
  
  cleanup() {
    // 清理所有引用
    this.refCounts.clear();
  }
}

// 创建缩略图存储
function createThumbnailStore() {
  const { subscribe, set, update } = writable<Map<string, ThumbnailEntry>>(new Map());

  return {
    subscribe,
    
    // 更新缩略图
    update(path: string, url: string, isBlob = false, blobKey?: string) {
      update(store => {
        const newStore = new Map(store);
        const entry = newStore.get(path);
        if (entry) {
          // 如果有旧的 blob，释放引用
          if (entry.blobKey && entry.blobKey !== blobKey) {
            blobLifecycle.release(entry.blobKey);
          }
        }
        newStore.set(path, { path, url, isBlob, isLoading: false, blobKey });
        return newStore;
      });
    },
    
    // 标记加载中
    setLoading(path: string) {
      update(store => {
        const entry = newStore.get(path);
        if (entry) {
          entry.isLoading = true;
        } else {
          newStore.set(path, { path, url: '', isBlob: false, isLoading: true });
        }
        return newStore;
      });
    },
    
    // 获取缩略图
    get(path: string): ThumbnailEntry | undefined {
      let entry: ThumbnailEntry | undefined;
      subscribe(store => {
        entry = store.get(path);
      })();
      return entry;
    }
  };
}

export const thumbnailStore = createThumbnailStore();
const blobLifecycle = new BlobLifecycle();

// 加载压缩包缩略图的主函数
export async function loadArchiveThumbnail(entryPath: string): Promise<void> {
  // 检查是否已有缓存
  const cached = thumbnailStore.get(entryPath);
  if (cached && !cached.isLoading) {
    return;
  }

  // 标记为加载中
  thumbnailStore.setLoading(entryPath);

  try {
    // 1. 快速获取首图 blob（立即显示）
    const blobUrl = await getArchiveFirstImageBlob(entryPath);
    const blobKey = blobUrl.startsWith('blob:') ? blobUrl : undefined;
    
    // 增加 blob 引用
    if (blobKey) {
      blobLifecycle.touch(blobKey);
    }
    
    thumbnailStore.update(entryPath, blobUrl, true, blobKey);
    
    // 2. 后台异步生成 WebP 缩略图
    enqueueArchivePreload(entryPath).catch(err => {
      console.warn('预取任务失败:', err);
    });
    
    // 3. 提交缩略图生成任务
    generateArchiveThumbnailAsync(entryPath)
      .then(result => {
        if (result !== 'generating') {
          // 如果生成了 WebP，释放 blob 引用
          if (blobKey) {
            blobLifecycle.release(blobKey);
          }
          thumbnailStore.update(entryPath, result, false);
        }
      })
      .catch(err => {
        console.warn('缩略图生成失败:', err);
      });
      
  } catch (error) {
    console.error('加载缩略图失败:', error);
    thumbnailStore.update(entryPath, '', false);
  }
}

// 批量预加载目录下的压缩包缩略图
export async function preloadArchiveThumbnails(archivePaths: string[]): Promise<void> {
  const promises = archivePaths.map(path => enqueueArchivePreload(path));
  await Promise.allSettled(promises);
}

// 设置前台源目录
export async function setForegroundDirectory(dirPath: string): Promise<void> {
  await setForegroundSource(dirPath);
}

// 监听缩略图事件
export function setupThumbnailEventListener(): () => void {
  // 首图就绪事件（立即显示）
  const unlisten1 = listen<{ archivePath: string; blob: string }>('thumbnail:firstImageReady', (event) => {
    const { archivePath, blob } = event.payload;
    const blobKey = blob.startsWith('blob:') ? blob : undefined;
    
    // 增加 blob 引用
    if (blobKey) {
      blobLifecycle.touch(blobKey);
    }
    
    thumbnailStore.update(archivePath, blob, true, blobKey);
  });
  
  // 缩略图更新事件（WebP 完成）
  const unlisten2 = listen<{ archivePath: string; webpUrl: string; blobUrl: string }>('thumbnail:updated', (event) => {
    const { archivePath, webpUrl, blobUrl } = event.payload;
    
    // 释放旧 blob 引用
    if (blobUrl) {
      const blobKey = blobUrl.startsWith('blob:') ? blobUrl : undefined;
      if (blobKey) {
        blobLifecycle.release(blobKey);
      }
    }
    
    thumbnailStore.update(archivePath, webpUrl, false);
  });
  
  // 返回清理函数
  return () => {
    unlisten1();
    unlisten2();
  };
}

// 清理过期 blob
export async function cleanupBlobs(): Promise<number> {
  const removed = await cleanupExpiredBlobs();
  return removed;
}

// 获取 blob 统计
export async function getBlobStatistics() {
  return await getBlobStats();
}

// 清理所有 blob 引用
export function cleanupAllBlobs() {
  blobLifecycle.cleanup();
}