/**
 * 历史记录管理 Store
 */

import { writable } from 'svelte/store';

export interface HistoryEntry {
  id: string;
  path: string;
  name: string;
  timestamp: number;
  currentPage: number;
  totalPages: number;
  thumbnail?: string;
}

const STORAGE_KEY = 'neoview-history';
const MAX_HISTORY_SIZE = 100; // 最多保存 100 条历史记录

// 从 localStorage 加载历史记录
function loadHistory(): HistoryEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.map((h: any) => ({
        ...h,
        timestamp: h.timestamp || Date.now()
      }));
    }
  } catch (err) {
    console.error('Failed to load history:', err);
  }
  return [];
}

// 创建 writable store
const { subscribe, set, update } = writable<HistoryEntry[]>(loadHistory());

// 保存历史记录到 localStorage
function saveToStorage(history: HistoryEntry[]) {
  try {
    // 只保存最近的 MAX_HISTORY_SIZE 条
    const toSave = history.slice(0, MAX_HISTORY_SIZE);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (err) {
    console.error('Failed to save history:', err);
  }
}

export const historyStore = {
  subscribe,
  
  /**
   * 添加历史记录（如果已存在则更新）
   */
  add(path: string, name: string, currentPage: number = 0, totalPages: number = 0, thumbnail?: string) {
    update(history => {
      // 检查是否已存在相同路径的历史记录
      const existingIndex = history.findIndex(h => h.path === path);
      
      const entry: HistoryEntry = {
        id: existingIndex >= 0 ? history[existingIndex].id : crypto.randomUUID(),
        path,
        name,
        timestamp: Date.now(),
        currentPage,
        totalPages,
        thumbnail
      };
      
      let newHistory: HistoryEntry[];
      if (existingIndex >= 0) {
        // 更新现有记录
        newHistory = [...history];
        newHistory[existingIndex] = entry;
        // 移到最前面（最近访问）
        newHistory = [entry, ...newHistory.filter((_, i) => i !== existingIndex)];
      } else {
        // 添加新记录
        newHistory = [entry, ...history];
      }
      
      saveToStorage(newHistory);
      return newHistory;
    });
  },
  
  /**
   * 移除历史记录
   */
  remove(id: string) {
    update(history => {
      const newHistory = history.filter(h => h.id !== id);
      saveToStorage(newHistory);
      return newHistory;
    });
  },
  
  /**
   * 清空所有历史记录
   */
  clear() {
    const newHistory: HistoryEntry[] = [];
    set(newHistory);
    saveToStorage(newHistory);
  },
  
  /**
   * 获取所有历史记录
   */
  getAll(): HistoryEntry[] {
    let history: HistoryEntry[] = [];
    subscribe(value => history = value)();
    return history;
  },
  
  /**
   * 根据路径查找历史记录
   */
  findByPath(path: string): HistoryEntry | undefined {
    const history = this.getAll();
    return history.find(h => h.path === path);
  }
};

































