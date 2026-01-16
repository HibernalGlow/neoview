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
        createdAt: new Date(b.createdAt)
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
   * 添加书签
   */
  add(item: FsItem) {
    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      name: item.name,
      path: item.path,
      type: item.isDir ? 'folder' : 'file',
      createdAt: new Date()
    };

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