/**
 * File Browser Store
 * 文件浏览器全局状态管理
 */

import { writable } from 'svelte/store';
import { toAssetUrl } from '$lib/utils/assetProxy';
import type { FsItem } from '$lib/types';
import { FileSystemAPI } from '$lib/api';
import { isVideoFile } from '$lib/utils/videoUtils';

export type SortField = 'name' | 'modified' | 'size' | 'type' | 'path' | 'random';
export type SortOrder = 'asc' | 'desc';
export type DeleteStrategy = 'trash' | 'permanent';

interface FileBrowserState {
  currentPath: string;
  items: FsItem[];
  loading: boolean;
  error: string;
  isArchiveView: boolean;
  currentArchivePath: string;
  selectedIndex: number;
  thumbnails: Map<string, string>;
  sortField: SortField;
  sortOrder: SortOrder;
  scrollToSelectedToken: number;
  scrollTargetIndex: number;
  isCheckMode: boolean;
  isDeleteMode: boolean;
  // 持久化的 UI 模式开关
  isPenetrateMode: boolean;
  showSearchBar: boolean;
  showMigrationBar: boolean;
  showMigrationManager: boolean;
  showFolderTree: boolean;
  visibleItems: FsItem[];
  useVisibleItemsOverride: boolean;
  deleteStrategy: DeleteStrategy;
  inlineTreeMode: boolean;
  inlineTreeState: Record<string, {
    expanded: boolean;
    loading: boolean;
    children: FsItem[];
    error?: string;
  }>;
  inlineTreeRootPath: string;
  inlineTreeScrollTops: Record<string, number>;
}

const archiveExtensions = ['.zip', '.cbz', '.rar', '.cbr', '.7z'];

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

function isArchiveFile(path: string): boolean {
  const lower = path.toLowerCase();
  return archiveExtensions.some((ext) => lower.endsWith(ext)) || lower.endsWith('.pdf');
}

function isBookCandidate(item: FsItem): boolean {
  return isArchiveFile(item.path) || isVideoFile(item.path);
}

function shuffleItems<T>(input: T[]): T[] {
  const list = [...input];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function getParentDirectory(path: string): string | null {
  if (!path) {
    return null;
  }
  const lastBackslash = path.lastIndexOf('\\');
  const lastSlash = path.lastIndexOf('/');
  const separatorIndex = Math.max(lastBackslash, lastSlash);
  if (separatorIndex <= 0) {
    return null;
  }
  return path.slice(0, separatorIndex);
}

const initialState: FileBrowserState = {
  currentPath: '',
  items: [],
  loading: false,
  error: '',
  isArchiveView: false,
  currentArchivePath: '',
  selectedIndex: -1,
  thumbnails: new Map(),
  sortField: 'name',
  sortOrder: 'asc',
  scrollToSelectedToken: 0,
  scrollTargetIndex: -1,
  isCheckMode: false,
  isDeleteMode: false,
  isPenetrateMode: false,
  showSearchBar: false,
  showMigrationBar: false,
  showMigrationManager: false,
  showFolderTree: false,
  visibleItems: [],
  useVisibleItemsOverride: false,
  deleteStrategy: 'trash',
  inlineTreeMode: false,
  inlineTreeState: {},
  inlineTreeRootPath: '',
  inlineTreeScrollTops: {}
};

/**
 * 获取文件类型用于排序
 */
function getItemType(item: FsItem): string {
  if (item.isDir) return '0_folder';
  if (item.name.endsWith('.zip') || item.name.endsWith('.cbz') ||
    item.name.endsWith('.rar') || item.name.endsWith('.cbr')) return '1_archive';
  if (item.isImage) return '2_image';
  return '3_file';
}

export function sortItems(items: FsItem[], field: SortField, order: SortOrder): FsItem[] {
  if (field === 'random') {
    const folders = items.filter(item => item.isDir);
    const nonFolders = items.filter(item => !item.isDir);
    const randomized = [...shuffleItems(folders), ...shuffleItems(nonFolders)];
    return order === 'asc' ? randomized : randomized.reverse();
  }

  return [...items].sort((a, b) => {
    // 文件夹始终在前面
    if (a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1;
    }

    let comparison = 0;

    switch (field) {
      case 'path':
        comparison = a.path.localeCompare(b.path, undefined, { numeric: true });
        break;
      case 'name':
        comparison = a.name.localeCompare(b.name, undefined, { numeric: true });
        break;
      case 'modified':
        comparison = (a.modified || 0) - (b.modified || 0);
        break;
      case 'size':
        comparison = a.size - b.size;
        break;
      case 'type':
        comparison = getItemType(a).localeCompare(getItemType(b));
        if (comparison === 0) {
          comparison = a.name.localeCompare(b.name);
        }
        break;
    }

    return order === 'asc' ? comparison : -comparison;
  });
}

function createFileBrowserStore() {
  const { subscribe, set, update } = writable<FileBrowserState>(initialState);
  let currentState = initialState;

  subscribe(state => {
    currentState = state;
  });

  let pendingNavigation: Promise<void> | null = null;

  return {
    subscribe,
    getState: () => currentState,
    setCurrentPath: (path: string) => update(state => ({ ...state, currentPath: path })),
    setItems: (items: FsItem[]) => update(state => ({
      ...state,
      items,
      visibleItems: state.useVisibleItemsOverride ? state.visibleItems : items
    })),
    setLoading: (loading: boolean) => update(state => ({ ...state, loading })),
    setError: (error: string) => update(state => ({ ...state, error })),
    setArchiveView: (isArchive: boolean, archivePath: string = '') =>
      update(state => ({ ...state, isArchiveView: isArchive, currentArchivePath: archivePath })),
    setSelectedIndex: (index: number) => update(state => ({ ...state, selectedIndex: index })),
    setCheckMode: (value: boolean) => update(state => ({ ...state, isCheckMode: value })),
    setDeleteMode: (value: boolean) => update(state => ({ ...state, isDeleteMode: value })),
    setDeleteStrategy: (value: DeleteStrategy) => update(state => ({ ...state, deleteStrategy: value })),
    setPenetrateMode: (value: boolean) => update(state => ({ ...state, isPenetrateMode: value })),
    setShowSearchBar: (value: boolean) => update(state => ({ ...state, showSearchBar: value })),
    setShowMigrationBar: (value: boolean) => update(state => ({ ...state, showMigrationBar: value })),
    setShowMigrationManager: (value: boolean) => update(state => ({ ...state, showMigrationManager: value })),
    setShowFolderTree: (value: boolean) => update(state => ({ ...state, showFolderTree: value })),
    setInlineTreeMode: (value: boolean) => update(state => ({ ...state, inlineTreeMode: value })),
    setInlineTreeState: (value: FileBrowserState['inlineTreeState']) =>
      update(state => ({ ...state, inlineTreeState: value })),
    setInlineTreeRootPath: (value: string) =>
      update(state => ({ ...state, inlineTreeRootPath: value })),
    setInlineTreeScrollTops: (value: FileBrowserState['inlineTreeScrollTops']) =>
      update(state => ({ ...state, inlineTreeScrollTops: value })),
    setSort: (field: SortField, order: SortOrder) => update(state => ({ ...state, sortField: field, sortOrder: order })),
    setVisibleItems: (items: FsItem[]) => update(state => ({
      ...state,
      visibleItems: items,
      useVisibleItemsOverride: true
    })),
    clearVisibleItemsOverride: () => update(state => ({
      ...state,
      useVisibleItemsOverride: false,
      visibleItems: state.items
    })),
    requestScrollToSelected: (indexOverride?: number) =>
      update(state => ({
        ...state,
        scrollTargetIndex: typeof indexOverride === 'number' ? indexOverride : state.selectedIndex,
        scrollToSelectedToken: state.scrollToSelectedToken + 1
      })),
    navigateToPath: async (targetPath: string | null | undefined, selectIndex?: number) => {
      if (!targetPath) return;

      if (pendingNavigation) {
        try {
          await pendingNavigation;
        } catch (err) {
          console.debug('Previous navigation failed:', err);
        } finally {
          pendingNavigation = null;
        }
      }

      const task = (async () => {
        const parentPath = getParentDirectory(targetPath) ?? targetPath;

        update(state => ({
          ...state,
          loading: true,
          error: '',
          isArchiveView: false,
          currentArchivePath: '',
          currentPath: parentPath,
          selectedIndex: -1
        }));

        try {
          const snapshot = await FileSystemAPI.loadDirectorySnapshot(parentPath);
          const sortedItems = sortItems(
            snapshot.items,
            currentState.sortField,
            currentState.sortOrder
          );

          update(state => ({
            ...state,
            items: sortedItems,
            thumbnails: new Map(),
            loading: false
          }));

          const normalizedTarget = normalizePath(targetPath);
          const targetIndex = sortedItems.findIndex((item) => normalizePath(item.path) === normalizedTarget);
          if (targetIndex >= 0) {
            update(state => ({
              ...state,
              selectedIndex: targetIndex,
              scrollTargetIndex: targetIndex,
              scrollToSelectedToken: state.scrollToSelectedToken + 1
            }));
          }
          if (selectIndex !== undefined) {
            update(state => ({
              ...state,
              selectedIndex: selectIndex,
              scrollTargetIndex: selectIndex,
              scrollToSelectedToken: state.scrollToSelectedToken + 1
            }));
          }
        } catch (err) {
          console.error('navigateToPath failed:', err);
          update(state => ({ ...state, error: String(err), loading: false }));
          throw err;
        }
      })();

      pendingNavigation = task;
      try {
        await task;
      } finally {
        if (pendingNavigation === task) {
          pendingNavigation = null;
        }
      }
    },
    selectPath: (path: string | null | undefined) => update(state => {
      if (!path) return state;
      const normalized = normalizePath(path);
      const index = state.items.findIndex(item => normalizePath(item.path) === normalized);
      if (index === -1 || index === state.selectedIndex) {
        return state;
      }
      return { ...state, selectedIndex: index };
    }),
    findAdjacentBookPath: (currentBookPath: string | null, direction: 'next' | 'previous'): string | null => {
      const sourceItems = currentState.useVisibleItemsOverride ? currentState.visibleItems : currentState.items;
      const bookItems = sourceItems.filter(isBookCandidate);
      if (bookItems.length === 0) return null;

      const normalizedCurrent = currentBookPath ? normalizePath(currentBookPath) : null;
      const findIndexByPath = (path: string | null) => {
        if (!path) return -1;
        return bookItems.findIndex(item => normalizePath(item.path) === path);
      };

      let currentIndex = findIndexByPath(normalizedCurrent);

      if (currentIndex === -1 && currentState.selectedIndex >= 0) {
        const selectedItem = currentState.items[currentState.selectedIndex];
        if (selectedItem) {
          currentIndex = findIndexByPath(normalizePath(selectedItem.path));
        }
      }

      if (currentIndex === -1) {
        currentIndex = direction === 'next' ? -1 : bookItems.length;
      }

      const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
      if (targetIndex < 0 || targetIndex >= bookItems.length) {
        return null;
      }
      return bookItems[targetIndex].path;
    },
    addThumbnail: (path: string, thumbnail: string) =>
      update(state => {
        let normalized: string;
        try {
          normalized = (toAssetUrl(thumbnail) || thumbnail) as string;
        } catch (e) {
          console.debug('addThumbnail: toAssetUrl failed, storing raw thumbnail', e);
          normalized = thumbnail;
        }

        const current = state.thumbnails.get(path);
        if (current === normalized) {
          // 缩略图未变化，避免触发无意义的 store 更新/日志
          return state;
        }

        const newThumbnails = new Map(state.thumbnails);
        newThumbnails.set(path, normalized);
        console.log('fileBrowserStore.addThumbnail:', { key: path, raw: thumbnail, converted: normalized });
        return { ...state, thumbnails: newThumbnails };
      }),
    setThumbnails: (thumbnails: Map<string, string>) =>
      update(state => ({ ...state, thumbnails: new Map(thumbnails) })),
    clearThumbnails: () => update(state => ({ ...state, thumbnails: new Map() })),
    reset: () => set(initialState)
  };
}

export const fileBrowserStore = createFileBrowserStore();
