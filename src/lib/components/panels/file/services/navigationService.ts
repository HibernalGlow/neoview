import type { FsItem } from '$lib/types';
import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
import { fileBrowserService, navigationHistory } from './fileBrowserService';
import { getThumbnailQueue } from './thumbnailQueueService';
import { itemIsDirectory, itemIsImage, toRelativeKey } from '$lib/utils/thumbnailManager';
import { sortFsItems, type SortConfig } from './sortService';

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
  fileBrowserStore.clearThumbnails();
  thumbnailQueue.clear();
  fileBrowserStore.setArchiveView(false);
  fileBrowserStore.setSelectedIndex(-1);
  fileBrowserStore.setCurrentPath(path);

  options.clearSelection?.();

  try {
    const loadedItems = await fileBrowserService.browseDirectory(path);
    const sortedItems = sortFsItems(loadedItems, options.sortConfig);
    fileBrowserStore.setItems(sortedItems);
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
      thumbnailQueue.enqueueItems([item], { priority: 'high', source: currentPath });
    } else {
      (async () => {
        try {
          if (await fileBrowserService.isSupportedArchive(item.path)) {
            thumbnailQueue.enqueueItems([item], { priority: 'high', source: currentPath });
          }
        } catch (error) {
          console.debug('Archive check failed for', item.path, error);
        }
      })();
    }
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
