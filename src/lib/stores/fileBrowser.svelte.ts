/**
 * File Browser Store
 * 文件浏览器全局状态管理
 */

import { writable } from 'svelte/store';
import { toAssetUrl } from '$lib/utils/assetProxy';
import type { FsItem } from '$lib/types';
import { FileSystemAPI } from '$lib/api';
import { isVideoFile } from '$lib/utils/videoUtils';
import { ratingCache, getSortableRating } from '$lib/services/ratingCache';
import { getDefaultRating } from '$lib/stores/emm/storage';

export type SortField = 'name' | 'modified' | 'size' | 'type' | 'path' | 'random' | 'rating';
export type SortOrder = 'asc' | 'desc';
export type DeleteStrategy = 'trash' | 'permanent';
export type CheckModeClickBehavior = 'open' | 'select';

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
  // 穿透模式下显示内部压缩包信息: 'none' | 'penetrate' | 'always'
  // none: 不显示, penetrate: 仅穿透模式显示, always: 始终显示
  penetrateShowInnerFile: 'none' | 'penetrate' | 'always';
  // 显示内部文件数量: 'single' | 'all'
  // single: 仅显示单个文件夹内的单压缩包, all: 显示所有内部压缩包
  penetrateInnerFileCount: 'single' | 'all';
  // 穿透层数：自动穿透嵌套单子文件夹的最大层数（默认3层）
  penetrateMaxDepth: number;
  // 纯媒体文件夹点击直接打开
  penetratePureMediaFolderOpen: boolean;
  // 文件夹预览网格模式（显示前4张图片的2x2预览）
  folderPreviewGrid: boolean;
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
  scrollPositions: Record<string, number>; // 保存文件列表的滚动位置
  // 勾选模式下点击卡片的行为: 'open' = 打开项目, 'select' = 选中/取消选中
  checkModeClickBehavior: CheckModeClickBehavior;
  // 双击空白处的行为: 'none' = 无操作, 'goUp' = 返回上级, 'goBack' = 后退
  doubleClickEmptyAction: 'none' | 'goUp' | 'goBack';
  // 单击空白处的行为: 'none' = 无操作, 'goUp' = 返回上级, 'goBack' = 后退
  singleClickEmptyAction: 'none' | 'goUp' | 'goBack';
  // 是否在空白区域显示返回按钮提示
  showEmptyAreaBackButton: boolean;
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

// ============ 随机排序种子缓存 ============
// 为每个目录路径缓存随机种子，确保返回上级后随机顺序不变
const randomSeedCache = new Map<string, number>();
const MAX_SEED_CACHE_SIZE = 100;

/**
 * 获取或创建目录的随机种子
 */
function getRandomSeedForPath(path: string): number {
  const normalizedPath = path.replace(/\\/g, '/').toLowerCase();
  
  if (randomSeedCache.has(normalizedPath)) {
    return randomSeedCache.get(normalizedPath)!;
  }
  
  // 生成新种子
  const seed = Math.random() * 2147483647 | 0;
  
  // 缓存大小限制，删除最早的
  if (randomSeedCache.size >= MAX_SEED_CACHE_SIZE) {
    const firstKey = randomSeedCache.keys().next().value;
    if (firstKey) randomSeedCache.delete(firstKey);
  }
  
  randomSeedCache.set(normalizedPath, seed);
  return seed;
}

/**
 * 清除目录的随机种子（用于强制重新随机）
 */
export function clearRandomSeedForPath(path: string): void {
  const normalizedPath = path.replace(/\\/g, '/').toLowerCase();
  randomSeedCache.delete(normalizedPath);
}

/**
 * 使用种子的伪随机数生成器 (Mulberry32)
 */
function seededRandom(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * 使用种子的 Fisher-Yates 洗牌算法
 */
function seededShuffle<T>(items: T[], seed: number): T[] {
  const shuffled = [...items];
  const random = seededRandom(seed);
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled;
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

// ============ 持久化设置 ============
const EMPTY_CLICK_SETTINGS_KEY = 'neoview-empty-click-settings';

interface EmptyClickSettings {
  doubleClickEmptyAction: 'none' | 'goUp' | 'goBack';
  singleClickEmptyAction: 'none' | 'goUp' | 'goBack';
  showEmptyAreaBackButton: boolean;
}

function loadEmptyClickSettings(): Partial<EmptyClickSettings> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const saved = localStorage.getItem(EMPTY_CLICK_SETTINGS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('[FileBrowserStore] 加载空白点击设置失败:', e);
  }
  return {};
}

function saveEmptyClickSettings(settings: EmptyClickSettings) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    localStorage.setItem(EMPTY_CLICK_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('[FileBrowserStore] 保存空白点击设置失败:', e);
  }
}

const savedEmptyClickSettings = loadEmptyClickSettings();

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
  penetrateShowInnerFile: 'penetrate',
  penetrateInnerFileCount: 'single',
  penetrateMaxDepth: 3,
  penetratePureMediaFolderOpen: true,
  folderPreviewGrid: true,
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
  inlineTreeScrollTops: {},
  scrollPositions: {},
  checkModeClickBehavior: 'open',
  doubleClickEmptyAction: savedEmptyClickSettings.doubleClickEmptyAction ?? 'goUp',
  singleClickEmptyAction: savedEmptyClickSettings.singleClickEmptyAction ?? 'none',
  showEmptyAreaBackButton: savedEmptyClickSettings.showEmptyAreaBackButton ?? false
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

export function sortItems(items: FsItem[], field: SortField, order: SortOrder, path?: string): FsItem[] {
  // 随机排序特殊处理 - 使用基于路径的种子确保结果可重复
  if (field === 'random') {
    const seed = path ? getRandomSeedForPath(path) : Math.random() * 2147483647 | 0;
    const folders = items.filter(item => item.isDir);
    const nonFolders = items.filter(item => !item.isDir);
    const shuffledFolders = seededShuffle(folders, seed);
    const shuffledFiles = seededShuffle(nonFolders, seed + 1); // 文件用不同种子
    const result = [...shuffledFolders, ...shuffledFiles];
    return order === 'asc' ? result : result.reverse();
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
      case 'rating': {
        // 评分排序：从 ratingCache 获取评分
        const defRating = getDefaultRating();
        const rInfoA = ratingCache.getRatingSync(a.path);
        const rInfoB = ratingCache.getRatingSync(b.path);
        const rA = getSortableRating(rInfoA ?? {}, defRating);
        const rB = getSortableRating(rInfoB ?? {}, defRating);
        comparison = rA - rB;
        break;
      }
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
    setPenetrateShowInnerFile: (value: 'none' | 'penetrate' | 'always') => update(state => ({ ...state, penetrateShowInnerFile: value })),
    setPenetrateInnerFileCount: (value: 'single' | 'all') => update(state => ({ ...state, penetrateInnerFileCount: value })),
    setPenetrateMaxDepth: (value: number) => update(state => ({ ...state, penetrateMaxDepth: value })),
    setPenetratePureMediaFolderOpen: (value: boolean) => update(state => ({ ...state, penetratePureMediaFolderOpen: value })),
    setFolderPreviewGrid: (value: boolean) => update(state => ({ ...state, folderPreviewGrid: value })),
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
    setCheckModeClickBehavior: (value: CheckModeClickBehavior) => update(state => ({ ...state, checkModeClickBehavior: value })),
    setDoubleClickEmptyAction: (value: 'none' | 'goUp' | 'goBack') => update(state => {
      const newState = { ...state, doubleClickEmptyAction: value };
      saveEmptyClickSettings({
        doubleClickEmptyAction: value,
        singleClickEmptyAction: state.singleClickEmptyAction,
        showEmptyAreaBackButton: state.showEmptyAreaBackButton
      });
      return newState;
    }),
    setSingleClickEmptyAction: (value: 'none' | 'goUp' | 'goBack') => update(state => {
      const newState = { ...state, singleClickEmptyAction: value };
      saveEmptyClickSettings({
        doubleClickEmptyAction: state.doubleClickEmptyAction,
        singleClickEmptyAction: value,
        showEmptyAreaBackButton: state.showEmptyAreaBackButton
      });
      return newState;
    }),
    setShowEmptyAreaBackButton: (value: boolean) => update(state => {
      const newState = { ...state, showEmptyAreaBackButton: value };
      saveEmptyClickSettings({
        doubleClickEmptyAction: state.doubleClickEmptyAction,
        singleClickEmptyAction: state.singleClickEmptyAction,
        showEmptyAreaBackButton: value
      });
      return newState;
    }),
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
          // 传入 parentPath 以支持随机排序种子记忆
          const sortedItems = sortItems(
            snapshot.items,
            currentState.sortField,
            currentState.sortOrder,
            parentPath
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
        // blob URL 和 data URL 直接使用，不需要转换
        const normalized = thumbnail.startsWith('blob:') || thumbnail.startsWith('data:')
          ? thumbnail
          : (toAssetUrl(thumbnail) || thumbnail) as string;

        const current = state.thumbnails.get(path);
        if (current === normalized) {
          return state;
        }

        const newThumbnails = new Map(state.thumbnails);
        newThumbnails.set(path, normalized);
        return { ...state, thumbnails: newThumbnails };
      }),
    removeThumbnail: (path: string) =>
      update(state => {
        if (!state.thumbnails.has(path)) {
          return state;
        }
        const newThumbnails = new Map(state.thumbnails);
        newThumbnails.delete(path);
        return { ...state, thumbnails: newThumbnails };
      }),
    setThumbnails: (thumbnails: Map<string, string>) =>
      update(state => ({ ...state, thumbnails: new Map(thumbnails) })),
    clearThumbnails: () => update(state => ({ ...state, thumbnails: new Map() })),
    reset: () => set(initialState)
  };
}

export const fileBrowserStore = createFileBrowserStore();
