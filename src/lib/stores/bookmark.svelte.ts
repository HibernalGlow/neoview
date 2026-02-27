/**
 * 书签管理 Store
 */

import { writable } from 'svelte/store';
import type { FsItem } from '$lib/types';
import { pathExists } from '$lib/api/filesystem';
import { historySettingsStore } from './historySettings.svelte';

interface Bookmark {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  createdAt: Date;
  pinned?: boolean;
  pinnedAt?: number;
}

const STORAGE_KEY = 'neoview-bookmarks';

// 从 localStorage 加载书签
function loadBookmarks(): Bookmark[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.map((b: any) => ({
        ...b,
        createdAt: new Date(b.createdAt),
        pinned: b.pinned === true,
        pinnedAt: typeof b.pinnedAt === 'number' ? b.pinnedAt : undefined
      }));
    }
  } catch (err) {
    console.error('Failed to load bookmarks:', err);
  }
  return [];
}

// 创建 writable store
const { subscribe, set, update } = writable<Bookmark[]>(loadBookmarks());

// 保存书签到 localStorage
function saveToStorage(bookmarks: Bookmark[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch (err) {
    console.error('Failed to save bookmarks:', err);
  }
}

export const bookmarkStore = {
  subscribe,

  /**
   * 创建书签对象
   */
  createBookmark(item: FsItem): Bookmark {
    return {
      id: crypto.randomUUID(),
      name: item.name,
      path: item.path,
      type: item.isDir ? 'folder' : 'file',
      createdAt: new Date(),
      pinned: false
    };
  },
  
  /**
   * 添加书签
   */
  add(item: FsItem) {
    const bookmark = this.createBookmark(item);

    update(bookmarks => {
      // 检查是否已存在相同路径的书签
      const exists = bookmarks.some(b => b.path === item.path);
      if (!exists) {
        let newBookmarks = [...bookmarks, bookmark];
        
        // 限制数量
        const limit = historySettingsStore.maxBookmarkSize;
        if (limit > 0 && newBookmarks.length > limit) {
          // 移除最早的书签（从头部开始，假设新书签添加到尾部）
          newBookmarks = newBookmarks.slice(newBookmarks.length - limit);
        }
        
        saveToStorage(newBookmarks);
        return newBookmarks;
      }
      return bookmarks;
    });
  },

  /**
   * 切换指定条目的置顶状态
   * 若条目不存在则会先添加并置顶
   * 返回切换后的置顶状态
   */
  togglePinned(item: FsItem): boolean {
    let nextPinned = false;

    update(bookmarks => {
      const index = bookmarks.findIndex(b => b.path === item.path);
      const now = Date.now();

      if (index === -1) {
        const bookmark = this.createBookmark(item);
        bookmark.pinned = true;
        bookmark.pinnedAt = now;
        nextPinned = true;

        let newBookmarks = [...bookmarks, bookmark];

        const limit = historySettingsStore.maxBookmarkSize;
        if (limit > 0 && newBookmarks.length > limit) {
          newBookmarks = newBookmarks.slice(newBookmarks.length - limit);
        }

        saveToStorage(newBookmarks);
        return newBookmarks;
      }

      const current = bookmarks[index];
      nextPinned = !(current.pinned ?? false);

      const updated = [...bookmarks];
      updated[index] = {
        ...current,
        pinned: nextPinned,
        pinnedAt: nextPinned ? now : undefined
      };

      saveToStorage(updated);
      return updated;
    });

    return nextPinned;
  },

  /**
   * 判断路径是否已置顶
   */
  isPinned(path: string): boolean {
    let pinned = false;
    subscribe((bookmarks) => {
      pinned = bookmarks.some(b => b.path === path && (b.pinned ?? false));
    })();
    return pinned;
  },

  /**
   * 获取所有置顶路径集合
   */
  getPinnedPathSet(): Set<string> {
    const pinned = new Set<string>();
    subscribe((bookmarks) => {
      for (const bookmark of bookmarks) {
        if (bookmark.pinned) {
          pinned.add(bookmark.path);
        }
      }
    })();
    return pinned;
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
    let bookmarks: Bookmark[] = [];
    subscribe(value => bookmarks = value)();
    return bookmarks;
  },

  /**
   * 清空所有书签
   */
  clear() {
    const newBookmarks: Bookmark[] = [];
    set(newBookmarks);
    saveToStorage(newBookmarks);
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