/**
 * 书签管理 Store
 */

import { writable } from 'svelte/store';
import type { FsItem } from '$lib/types';
import { pathExists } from '$lib/api/filesystem';
import { historySettingsStore } from './historySettings.svelte';

export interface Bookmark {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  createdAt: Date;
  listIds: string[];
  starred?: boolean;
}

export interface BookmarkList {
  id: string;
  name: string;
  isFavorite: boolean;
  system?: boolean;
  createdAt: number;
}

export type BookmarkListFilter = string;

const STORAGE_KEY = 'neoview-bookmarks';
const STORAGE_KEY_LISTS = 'neoview-bookmark-lists-v2';
const STORAGE_KEY_ACTIVE_LIST = 'neoview-bookmark-active-list-v2';

export const BOOKMARK_LIST_IDS = {
  all: 'all',
  default: 'default',
  favorites: 'favorites'
} as const;

const SYSTEM_LISTS: BookmarkList[] = [
  {
    id: BOOKMARK_LIST_IDS.default,
    name: '默认',
    isFavorite: false,
    system: true,
    createdAt: 1
  },
  {
    id: BOOKMARK_LIST_IDS.favorites,
    name: '收藏夹',
    isFavorite: true,
    system: true,
    createdAt: 2
  }
];

function isSystemListId(id: string): boolean {
  return id === BOOKMARK_LIST_IDS.default || id === BOOKMARK_LIST_IDS.favorites;
}

function normalizeListName(name: string): string {
  return name.trim();
}

// 从 localStorage 加载书签
function loadBookmarks(): Bookmark[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Array<Partial<Bookmark> & {
        createdAt?: string | number | Date;
        type?: 'file' | 'folder';
      }>;
      return parsed
        .filter((b): b is Partial<Bookmark> & { path: string } => typeof b.path === 'string' && b.path.length > 0)
        .map((b) => {
          const path = b.path;
          const defaultName = path.split(/[\\/]/).pop() || path;
          const normalizedListIds = Array.isArray(b.listIds) && b.listIds.length > 0
            ? Array.from(new Set(b.listIds.filter((id) => typeof id === 'string' && id.length > 0)))
            : [BOOKMARK_LIST_IDS.default];

          return {
            id: typeof b.id === 'string' && b.id.length > 0 ? b.id : crypto.randomUUID(),
            name: typeof b.name === 'string' && b.name.length > 0 ? b.name : defaultName,
            path,
            type: b.type === 'folder' ? 'folder' : 'file',
            createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
            listIds: normalizedListIds,
            starred: Boolean(b.starred)
          };
        });
    }
  } catch (err) {
    console.error('Failed to load bookmarks:', err);
  }
  return [];
}

function mergeWithSystemLists(lists: BookmarkList[]): BookmarkList[] {
  const merged = [...lists];
  const existingIds = new Set(merged.map((list) => list.id));

  for (const systemList of SYSTEM_LISTS) {
    if (!existingIds.has(systemList.id)) {
      merged.push(systemList);
      continue;
    }

    const idx = merged.findIndex((list) => list.id === systemList.id);
    if (idx >= 0) {
      merged[idx] = {
        ...merged[idx],
        name: systemList.name,
        isFavorite: systemList.isFavorite,
        system: true,
        createdAt: merged[idx].createdAt || systemList.createdAt
      };
    }
  }

  return merged.sort((a, b) => {
    if (a.system && !b.system) return -1;
    if (!a.system && b.system) return 1;
    return a.createdAt - b.createdAt;
  });
}

function loadBookmarkLists(): BookmarkList[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_LISTS);
    if (stored) {
      const parsed = JSON.parse(stored) as Array<Partial<BookmarkList>>;
      const normalized = parsed
        .filter((list) => typeof list.id === 'string' && list.id.length > 0)
        .map((list) => ({
          id: String(list.id),
          name: normalizeListName(String(list.name ?? '未命名列表')),
          isFavorite: Boolean(list.isFavorite),
          system: Boolean(list.system),
          createdAt: typeof list.createdAt === 'number' ? list.createdAt : Date.now()
        }));
      return mergeWithSystemLists(normalized);
    }
  } catch (err) {
    console.error('Failed to load bookmark lists:', err);
  }

  return [...SYSTEM_LISTS];
}

function loadActiveListId(lists: BookmarkList[]): BookmarkListFilter {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_LIST);
    if (saved === BOOKMARK_LIST_IDS.all) return saved;
    if (saved && lists.some((list) => list.id === saved)) return saved;
  } catch (err) {
    console.error('Failed to load active bookmark list:', err);
  }
  return BOOKMARK_LIST_IDS.all;
}

// 创建 writable store
const {
  subscribe,
  set,
  update
} = writable<Bookmark[]>(loadBookmarks());

const {
  subscribe: subscribeLists,
  set: setLists,
  update: updateLists
} = writable<BookmarkList[]>(loadBookmarkLists());

const initialLists = loadBookmarkLists();
const {
  subscribe: subscribeActiveList,
  set: setActiveList
} = writable<BookmarkListFilter>(loadActiveListId(initialLists));

let currentBookmarks: Bookmark[] = [];
let normalizedPathIndex = new Set<string>();
let currentLists: BookmarkList[] = initialLists;
let currentActiveListId: BookmarkListFilter = loadActiveListId(initialLists);

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

function sanitizeListIds(listIds: string[] | undefined): string[] {
  const source = Array.isArray(listIds) ? listIds : [];
  const existing = new Set(currentLists.map((list) => list.id));
  const sanitized = source
    .map((id) => String(id))
    .filter((id) => existing.has(id));

  if (sanitized.length === 0) {
    return [BOOKMARK_LIST_IDS.default];
  }

  return Array.from(new Set(sanitized));
}

function rebuildIndexes(bookmarks: Bookmark[]) {
  currentBookmarks = bookmarks;
  normalizedPathIndex = new Set(bookmarks.map((bookmark) => normalizePath(bookmark.path)));
}

subscribe((bookmarks) => {
  const normalized = bookmarks.map((bookmark) => ({
    ...bookmark,
    listIds: sanitizeListIds(bookmark.listIds),
    starred: Boolean(bookmark.starred)
  }));
  rebuildIndexes(normalized);
});

subscribeLists((lists) => {
  currentLists = mergeWithSystemLists(lists);
  saveListsToStorage(currentLists);
});

subscribeActiveList((listId) => {
  if (listId === BOOKMARK_LIST_IDS.all || currentLists.some((list) => list.id === listId)) {
    currentActiveListId = listId;
  } else {
    currentActiveListId = BOOKMARK_LIST_IDS.all;
  }
  saveActiveListToStorage(currentActiveListId);
});

// 保存书签到 localStorage
function saveToStorage(bookmarks: Bookmark[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch (err) {
    console.error('Failed to save bookmarks:', err);
  }
}

function saveListsToStorage(lists: BookmarkList[]) {
  try {
    localStorage.setItem(STORAGE_KEY_LISTS, JSON.stringify(lists));
  } catch (err) {
    console.error('Failed to save bookmark lists:', err);
  }
}

function saveActiveListToStorage(listId: BookmarkListFilter) {
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_LIST, listId);
  } catch (err) {
    console.error('Failed to save active bookmark list:', err);
  }
}

function ensureLimit(bookmarks: Bookmark[]): Bookmark[] {
  const limit = historySettingsStore.maxBookmarkSize;
  if (limit > 0 && bookmarks.length > limit) {
    return bookmarks.slice(bookmarks.length - limit);
  }
  return bookmarks;
}

function upsertBookmark(
  bookmarks: Bookmark[],
  item: FsItem,
  listIds: string[]
): Bookmark[] {
  const targetListIds = sanitizeListIds(listIds);
  const existingIndex = bookmarks.findIndex((bookmark) => normalizePath(bookmark.path) === normalizePath(item.path));

  if (existingIndex >= 0) {
    const existing = bookmarks[existingIndex];
    const mergedListIds = Array.from(new Set([...(existing.listIds ?? []), ...targetListIds]));
    const merged: Bookmark = {
      ...existing,
      name: item.name || existing.name,
      type: item.isDir ? 'folder' : 'file',
      listIds: sanitizeListIds(mergedListIds),
      starred: Boolean(existing.starred) || mergedListIds.includes(BOOKMARK_LIST_IDS.favorites)
    };
    const next = [...bookmarks];
    next[existingIndex] = merged;
    return next;
  }

  const created: Bookmark = {
    id: crypto.randomUUID(),
    name: item.name,
    path: item.path,
    type: item.isDir ? 'folder' : 'file',
    createdAt: new Date(),
    listIds: targetListIds,
    starred: targetListIds.includes(BOOKMARK_LIST_IDS.favorites)
  };

  return [...bookmarks, created];
}

function getFavoriteListIds(): Set<string> {
  return new Set(currentLists.filter((list) => list.isFavorite).map((list) => list.id));
}

function isBookmarkInActiveList(bookmark: Bookmark, listId: BookmarkListFilter): boolean {
  if (listId === BOOKMARK_LIST_IDS.all) return true;

  const bookmarkListIds = new Set(bookmark.listIds ?? []);
  if (bookmarkListIds.has(listId)) return true;

  if (listId === BOOKMARK_LIST_IDS.favorites) {
    if (bookmark.starred) return true;
    const favoriteListIds = getFavoriteListIds();
    for (const id of bookmarkListIds) {
      if (favoriteListIds.has(id)) return true;
    }
  }

  return false;
}

function normalizeListTitleForDisplay(name: string): string {
  const trimmed = normalizeListName(name);
  return trimmed || '未命名列表';
}

function nextUniqueListName(baseName: string): string {
  const normalized = normalizeListTitleForDisplay(baseName);
  const lowerSet = new Set(currentLists.map((list) => list.name.toLowerCase()));
  if (!lowerSet.has(normalized.toLowerCase())) {
    return normalized;
  }

  let index = 2;
  while (index < 1000) {
    const candidate = `${normalized} ${index}`;
    if (!lowerSet.has(candidate.toLowerCase())) {
      return candidate;
    }
    index += 1;
  }
  return `${normalized} ${Date.now()}`;
}

export const bookmarkStore = {
  subscribe,

  subscribeLists,

  subscribeActiveList,

  /**
   * 获取所有书签列表
   */
  getLists(): BookmarkList[] {
    return currentLists;
  },

  /**
   * 获取当前活动列表 ID
   */
  getActiveListId(): BookmarkListFilter {
    return currentActiveListId;
  },

  /**
   * 设置当前活动列表 ID
   */
  setActiveListId(listId: BookmarkListFilter) {
    if (listId === BOOKMARK_LIST_IDS.all || currentLists.some((list) => list.id === listId)) {
      setActiveList(listId);
      return;
    }
    setActiveList(BOOKMARK_LIST_IDS.all);
  },

  /**
   * 创建书签列表
   */
  createList(name: string, options?: { isFavorite?: boolean }): BookmarkList {
    const normalizedName = nextUniqueListName(name);
    const newList: BookmarkList = {
      id: crypto.randomUUID(),
      name: normalizedName,
      isFavorite: Boolean(options?.isFavorite),
      createdAt: Date.now(),
      system: false
    };

    updateLists((lists) => mergeWithSystemLists([...lists, newList]));
    return newList;
  },

  /**
   * 重命名书签列表
   */
  renameList(listId: string, name: string) {
    if (isSystemListId(listId)) return;
    const nextName = normalizeListTitleForDisplay(name);
    if (!nextName) return;

    updateLists((lists) =>
      lists.map((list) =>
        list.id === listId
          ? {
              ...list,
              name: nextName
            }
          : list
      )
    );
  },

  /**
   * 删除书签列表（系统列表不可删除）
   */
  removeList(listId: string) {
    if (isSystemListId(listId)) return;

    updateLists((lists) => mergeWithSystemLists(lists.filter((list) => list.id !== listId)));

    update((bookmarks) => {
      const next = bookmarks.map((bookmark) => {
        const filtered = (bookmark.listIds ?? []).filter((id) => id !== listId);
        return {
          ...bookmark,
          listIds: sanitizeListIds(filtered)
        };
      });
      saveToStorage(next);
      return next;
    });

    if (currentActiveListId === listId) {
      setActiveList(BOOKMARK_LIST_IDS.all);
    }
  },

  /**
   * 切换列表收藏状态（系统收藏夹列表固定为 true）
   */
  toggleListFavorite(listId: string) {
    if (listId === BOOKMARK_LIST_IDS.favorites) return;
    updateLists((lists) =>
      lists.map((list) =>
        list.id === listId
          ? {
              ...list,
              isFavorite: !list.isFavorite
            }
          : list
      )
    );
  },

  /**
   * 获取当前活动列表过滤后的书签
   */
  getVisibleBookmarks(listId: BookmarkListFilter = currentActiveListId): Bookmark[] {
    return currentBookmarks.filter((bookmark) => isBookmarkInActiveList(bookmark, listId));
  },
  
  /**
   * 添加书签
   */
  add(item: FsItem, options?: { listIds?: string[] }) {
    this.addMany([item], options);
  },

  /**
   * 批量添加书签
   */
  addMany(items: FsItem[], options?: { listIds?: string[] }) {
    const listIds = sanitizeListIds(options?.listIds);
    if (!items || items.length === 0) return;

    update((bookmarks) => {
      let next = [...bookmarks];
      for (const item of items) {
        next = upsertBookmark(next, item, listIds);
      }

      next = ensureLimit(next);
      saveToStorage(next);
      return next;
    });
  },

  /**
   * 添加到指定列表（支持列表多选）
   */
  addToLists(item: FsItem, listIds: string[]) {
    this.add(item, { listIds });
  },

  /**
   * 批量添加到指定列表（支持列表多选）
   */
  addManyToLists(items: FsItem[], listIds: string[]) {
    this.addMany(items, { listIds });
  },

  /**
   * 移除书签
   */
  remove(id: string) {
    update(bookmarks => {
      const newBookmarks = bookmarks.filter(b => b.id !== id);
      saveToStorage(newBookmarks);
      return newBookmarks;
    });
  },

  /**
   * 获取所有书签
   */
  getAll(): Bookmark[] {
    return currentBookmarks;
  },

  /**
   * 按路径判断是否已收藏（O(1)）
   */
  hasPath(path: string): boolean {
    return normalizedPathIndex.has(normalizePath(path));
  },

  /**
   * 清空所有书签
   */
  clear() {
    const newBookmarks: Bookmark[] = [];
    set(newBookmarks);
    saveToStorage(newBookmarks);
    setActiveList(BOOKMARK_LIST_IDS.all);
  },

  /**
   * 按数量清理最旧的书签
   */
  clearOldest(count: number) {
    update(bookmarks => {
      if (bookmarks.length <= count) {
        saveToStorage([]);
        return [];
      }
      // 书签通常是按创建时间排序的（旧的在前或是新的在前取决于 add 方法）
      // add 方法中使用 newBookmarks = [...bookmarks, bookmark]
      // 所以最早的在数组头部
      const newBookmarks = bookmarks.slice(count);
      saveToStorage(newBookmarks);
      return newBookmarks;
    });
  },

  /**
   * 按天数清理书签
   */
  clearByDate(days: number) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    update(bookmarks => {
      const newBookmarks = bookmarks.filter(b => b.createdAt.getTime() >= cutoff);
      if (newBookmarks.length !== bookmarks.length) {
        saveToStorage(newBookmarks);
      }
      return newBookmarks;
    });
  },

  /**
   * 按文件夹路径清理书签
   */
  clearByFolder(folderPath: string) {
    const normalizePath = (p: string) => p.replace(/\\/g, '/').toLowerCase();
    const normalizedTarget = normalizePath(folderPath);
    update(bookmarks => {
      const newHistory = bookmarks.filter(b => !normalizePath(b.path).startsWith(normalizedTarget));
      if (newHistory.length !== bookmarks.length) {
        saveToStorage(newHistory);
      }
      return newHistory;
    });
  },

  /**
   * 清理失效的书签（文件/文件夹不存在）
   * 返回清理的条目数量
   */
  async cleanupInvalid(): Promise<number> {
    const bookmarks = this.getAll();
    if (bookmarks.length === 0) return 0;

    // 并发检查所有路径是否存在
    const checkResults = await Promise.all(
      bookmarks.map(async (bookmark) => {
        try {
          const exists = await pathExists(bookmark.path);
          return { bookmark, exists };
        } catch {
          // 检查失败时保留条目
          return { bookmark, exists: true };
        }
      })
    );

    // 过滤出存在的条目
    const validBookmarks = checkResults
      .filter(r => r.exists)
      .map(r => r.bookmark);

    const removedCount = bookmarks.length - validBookmarks.length;

    if (removedCount > 0) {
      set(validBookmarks);
      saveToStorage(validBookmarks);
      console.log(`[Bookmark] 清理了 ${removedCount} 条失效书签`);
    }

    return removedCount;
  }
};