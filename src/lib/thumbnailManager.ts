import { get, writable } from 'svelte/store';
import { listen } from '@tauri-apps/api/event';
import { getArchiveFirstImageBlob, enqueueArchivePreload, generateArchiveThumbnailAsync, setForegroundSource } from './api/archive';

interface ThumbnailEntry {
  path: string;
  url: string;
  isBlob: boolean;
  isLoading: boolean;
}

// 创建缩略图存储
function createThumbnailStore() {
  const { subscribe, set, update } = writable<Map<string, ThumbnailEntry>>(new Map());

  return {
    subscribe,
    
    // 更新缩略图
    update(path: string, url: string, isBlob = false) {
      update(store => {
        const newStore = new Map(store);
        newStore.set(path, { path, url, isBlob, isLoading: false });
        return newStore;
      });
    },
    
    // 标记加载中
    setLoading(path: string) {
      update(store => {
        const newStore = new Map(store);
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
    const quickUrl = await getArchiveFirstImageBlob(entryPath);
    thumbnailStore.update(entryPath, quickUrl, true);
    
    // 2. 后台异步生成 WebP 缩略图
    enqueueArchivePreload(entryPath).catch(err => {
      console.warn('预取任务失败:', err);
    });
    
    // 3. 提交缩略图生成任务
    generateArchiveThumbnailAsync(entryPath)
      .then(result => {
        if (result !== 'generating') {
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

// 监听缩略图就绪事件
export function setupThumbnailEventListener(): () => void {
  const unlisten = listen<{ path: string; url: string }>('thumbnail-ready', (event) => {
    const { path, url } = event.payload;
    thumbnailStore.update(path, url, false);
  });
  
  return unlisten;
}