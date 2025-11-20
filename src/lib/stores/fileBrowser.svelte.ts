/**
 * File Browser Store
 * 文件浏览器全局状态管理
 */

import { writable } from 'svelte/store';
import { toAssetUrl } from '$lib/utils/assetProxy';
import type { FsItem } from '$lib/types';

export type SortField = 'name' | 'modified' | 'size' | 'type' | 'path';
export type SortOrder = 'asc' | 'desc';

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
}

const archiveExtensions = ['.zip', '.cbz', '.rar', '.cbr', '.7z'];
const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.flv', '.webm', '.wmv', '.m4v', '.mpg', '.mpeg'];

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

function isArchiveFile(path: string): boolean {
  const lower = path.toLowerCase();
  return archiveExtensions.some((ext) => lower.endsWith(ext)) || lower.endsWith('.pdf');
}

function isVideoFile(path: string): boolean {
  const lower = path.toLowerCase();
  return videoExtensions.some(ext => lower.endsWith(ext));
}

function isBookCandidate(item: FsItem): boolean {
  return isArchiveFile(item.path) || isVideoFile(item.path);
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
  sortOrder: 'asc'
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

  return {
    subscribe,
    getState: () => currentState,
    setCurrentPath: (path: string) => update(state => ({ ...state, currentPath: path })),
    setItems: (items: FsItem[]) => update(state => ({ ...state, items })),
    setLoading: (loading: boolean) => update(state => ({ ...state, loading })),
    setError: (error: string) => update(state => ({ ...state, error })),
    setArchiveView: (isArchive: boolean, archivePath: string = '') =>
      update(state => ({ ...state, isArchiveView: isArchive, currentArchivePath: archivePath })),
    setSelectedIndex: (index: number) => update(state => ({ ...state, selectedIndex: index })),
    setSort: (field: SortField, order: SortOrder) => update(state => ({ ...state, sortField: field, sortOrder: order })),
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
      const bookItems = currentState.items.filter(isBookCandidate);
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
        const newThumbnails = new Map(state.thumbnails);
        // 统一通过 asset 转换中转，避免存入 raw file:// URL 导致前端无法显示
        try {
          const url = toAssetUrl(thumbnail) || thumbnail;
          console.log('fileBrowserStore.addThumbnail:', { key: path, raw: thumbnail, converted: url });
          newThumbnails.set(path, url as string);
        } catch (e) {
          console.debug('addThumbnail: toAssetUrl failed, storing raw thumbnail', e);
          newThumbnails.set(path, thumbnail);
        }
        return { ...state, thumbnails: newThumbnails };
      }),
    setThumbnails: (thumbnails: Map<string, string>) =>
      update(state => ({ ...state, thumbnails: new Map(thumbnails) })),
    clearThumbnails: () => update(state => ({ ...state, thumbnails: new Map() })),
    reset: () => set(initialState)
  };
}

export const fileBrowserStore = createFileBrowserStore();
