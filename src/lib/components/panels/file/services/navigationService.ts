import type { FsItem } from '$lib/types';
import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
import { fileBrowserService, navigationHistory } from './fileBrowserService';
import { getThumbnailQueue } from './thumbnailQueueService';
import { itemIsDirectory, itemIsImage, toRelativeKey, setActivePath } from '$lib/utils/thumbnailManager';
import { sortFsItems, type SortConfig } from './sortService';

// 归档检测缓存
const archiveCheckCache = new Map<string, { result: boolean; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

const thumbnailQueue = getThumbnailQueue((path, url) => fileBrowserStore.addThumbnail(path, url));

export type NavigationOptions = {
  sortConfig: SortConfig;
  clearSelection?: () => void;
  thumbnails?: Map<string, string>;
};

export type NavigationContext = NavigationOptions & {
  currentPath: string;
  currentArchivePath: string;
  isArchiveView: boolean;
};

export async function loadDirectory(path: string, options: NavigationOptions) {
  await loadDirectoryWithoutHistory(path, options);
  navigationHistory.push(path);
}

export async function goBackInHistory(options: NavigationOptions) {
  const path = navigationHistory.back();
  if (path) {
    await loadDirectoryWithoutHistory(path, options);
  }
}

export async function goForwardInHistory(options: NavigationOptions) {
  const path = navigationHistory.forward();
  if (path) {
    await loadDirectoryWithoutHistory(path, options);
  }
}

export async function goBack(options: NavigationContext) {
  if (options.isArchiveView) {
    const parentDir = getParentDirectory(options.currentArchivePath) || options.currentPath;
    if (parentDir) {
      await loadDirectory(parentDir, options);
    }
    return;
  }

  const parentDir = getParentDirectory(options.currentPath);
  if (parentDir && !parentDir.endsWith(':')) {
    await loadDirectory(parentDir, options);
  }
}

export async function refreshDirectory(currentPath: string, options: NavigationOptions) {
  if (!currentPath) return;
  await loadDirectory(currentPath, options);
}

export function loadArchiveThumbnail(archivePath: string, filePath: string) {
  return internalLoadArchiveThumbnail(archivePath, filePath);
}

export function getParentDirectory(path: string) {
  if (!path) return '';
  const lastBackslash = path.lastIndexOf('\\');
  const lastSlash = path.lastIndexOf('/');
  const lastSeparator = Math.max(lastBackslash, lastSlash);
  if (lastSeparator <= 0) {
    return '';
  }
  return path.substring(0, lastSeparator);
}

export async function loadDirectoryWithoutHistory(path: string, options: NavigationOptions) {
  fileBrowserStore.setLoading(true);
  fileBrowserStore.setError('');
  
  // Cancel previous tasks for this path before loading new directory
  thumbnailQueue.cancelBySource(path);
  // Set active path to filter old tasks
  setActivePath(path);
  fileBrowserStore.setArchiveView(false);
  fileBrowserStore.setSelectedIndex(-1);
  fileBrowserStore.setCurrentPath(path);

  options.clearSelection?.();

  try {
    const loadedItems = await fileBrowserService.browseDirectory(path);
    const sortedItems = sortFsItems(loadedItems, options.sortConfig);
    fileBrowserStore.setItems(sortedItems);
    
    // 不要立即清空缩略图，让缓存自然过渡
    // 只清理不匹配当前目录的缓存条目
    const currentThumbnails = fileBrowserStore.getThumbnails();
    const currentPaths = new Set(sortedItems.map(item => item.path));
    
    // 移除不属于当前目录的缩略图
    for (const [thumbPath] of currentThumbnails.entries()) {
      if (!currentPaths.has(thumbPath)) {
        fileBrowserStore.removeThumbnail(thumbPath);
      }
    }
    
    enqueueThumbnails(loadedItems, path, options.thumbnails);
  } catch (err) {
    console.error('❌ Error loading directory:', err);
    fileBrowserStore.setError(String(err));
    fileBrowserStore.setItems([]);
  } finally {
    fileBrowserStore.setLoading(false);
  }
}

export async function navigateToDirectory(path: string, options: NavigationOptions) {
  if (!path) return;
  await loadDirectory(path, options);
}

export async function loadArchive(path: string, options?: NavigationOptions) {
  fileBrowserStore.setLoading(true);
  fileBrowserStore.setError('');
  fileBrowserStore.clearThumbnails();
  fileBrowserStore.setArchiveView(true, path);
  fileBrowserStore.setSelectedIndex(-1);
  options?.clearSelection?.();

  try {
    const loadedItems = await fileBrowserService.listArchiveContents(path);
    fileBrowserStore.setItems(loadedItems);
    for (const item of loadedItems) {
      if (itemIsImage(item)) {
        await loadArchiveThumbnail(path, item.path);
      }
    }
  } catch (err) {
    console.error('❌ Error loading archive:', err);
    fileBrowserStore.setError(String(err));
    fileBrowserStore.setItems([]);
  } finally {
    fileBrowserStore.setLoading(false);
  }
}

function enqueueThumbnails(items: FsItem[], currentPath: string, thumbnails?: Map<string, string>) {
  const regular: FsItem[] = [];
  
  for (const item of items) {
    try {
      const key = toRelativeKey(item.path);
      if (thumbnails?.has(key)) {
        continue;
      }
    } catch {
      // ignore invalid key
    }

    if (itemIsDirectory(item) || itemIsImage(item)) {
      regular.push(item);
    } else {
      // For potential archives, check asynchronously but don't block
      checkArchiveAsync(item, currentPath);
    }
  }
  
  // Fire-and-forget: enqueue regular items without awaiting
  if (regular.length > 0) {
    thumbnailQueue.enqueueForPath(currentPath, regular, { priority: 'high' });
  }
}

async function checkArchiveAsync(item: FsItem, currentPath: string) {
  try {
    // 检查缓存
    const cached = archiveCheckCache.get(item.path);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      if (cached.result) {
        thumbnailQueue.enqueueAdditional(currentPath, [item], { priority: 'low' });
      }
      return;
    }
    
    // 执行检测并缓存结果
    const isArchive = await fileBrowserService.isSupportedArchive(item.path);
    archiveCheckCache.set(item.path, { result: isArchive, timestamp: now });
    
    if (isArchive) {
      thumbnailQueue.enqueueAdditional(currentPath, [item], { priority: 'low' });
    }
  } catch (error) {
    console.debug('Archive check failed for', item.path, error);
  }
}

async function internalLoadArchiveThumbnail(archivePath: string, filePath: string) {
  try {
    const imageData = await fileBrowserService.loadImageFromArchive(archivePath, filePath);
    const thumbnail = await fileBrowserService.generateThumbnailFromData(imageData);
    fileBrowserStore.addThumbnail(filePath, thumbnail);
  } catch (error) {
    console.debug('Failed to load archive thumbnail:', error);
  }
}
