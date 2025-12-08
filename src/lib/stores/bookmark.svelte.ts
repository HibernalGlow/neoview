/**
 * 书签管理 Store
 */

import { writable } from 'svelte/store';
import type { FsItem } from '$lib/types';

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
        const newBookmarks = [...bookmarks, bookmark];
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
   * 检查路径是否已收藏
   */
  has(path: string): boolean {
    const bookmarks = this.getAll();
    return bookmarks.some(b => b.path === path);
  },

  /**
   * 按路径移除书签
   */
  removeByPath(path: string) {
    update(bookmarks => {
      const newBookmarks = bookmarks.filter(b => b.path !== path);
      saveToStorage(newBookmarks);
      return newBookmarks;
    });
  },

  /**
   * 清空所有书签
   */
  clear() {
    const newBookmarks: Bookmark[] = [];
    set(newBookmarks);
    saveToStorage(newBookmarks);
  }
};