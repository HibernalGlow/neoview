/**
 * 历史记录管理 Store
 */

import { writable } from 'svelte/store';
import { pathExists } from '$lib/api/filesystem';

export interface HistoryEntry {
  id: string;
  path: string;
  name: string;
  timestamp: number;
  currentPage: number;
  totalPages: number;
  thumbnail?: string;
  videoPosition?: number;
  videoDuration?: number;
  videoCompleted?: boolean;
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

      const existing = existingIndex >= 0 ? history[existingIndex] : undefined;

      // 对已存在的记录进行合并更新，保留视频进度等扩展字段
      const entry: HistoryEntry = {
        ...existing,
        id: existing?.id ?? crypto.randomUUID(),
        path,
        name,
        timestamp: Date.now(),
        currentPage,
        totalPages,
        thumbnail: thumbnail ?? existing?.thumbnail,
        videoPosition: existing?.videoPosition,
        videoDuration: existing?.videoDuration,
        videoCompleted: existing?.videoCompleted
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
   * 根据路径查找历史记录（标准化路径比较）
   */
  findByPath(path: string): HistoryEntry | undefined {
    const history = this.getAll();
    // 标准化路径：统一斜杠方向和大小写
    const normalizePath = (p: string) => p.replace(/\\/g, '/').toLowerCase();
    const normalizedPath = normalizePath(path);
    return history.find(h => normalizePath(h.path) === normalizedPath);
  },

  /**
   * 更新历史记录的页数（不改变时间戳）
   */
  update(path: string, currentPage: number, totalPages: number) {
    update(history => {
      const existingIndex = history.findIndex(h => h.path === path);
      if (existingIndex >= 0) {
        const entry = history[existingIndex];
        // 只更新页数，保持原有时间戳
        const updatedEntry: HistoryEntry = {
          ...entry,
          currentPage,
          totalPages
        };
        const newHistory = [...history];
        newHistory[existingIndex] = updatedEntry;
        saveToStorage(newHistory);
        return newHistory;
      }
      return history;
    });
  },

  /**
   * 更新视频观看进度（基于路径），并同步到 currentPage/totalPages 以复用进度条和已读标记
   */
  updateVideoProgress(
    path: string,
    position: number,
    duration: number,
    completed: boolean,
    progressPage?: number,
    progressTotal?: number
  ) {
    update(history => {
      const existingIndex = history.findIndex(h => h.path === path);

      const scale = progressTotal && progressTotal > 0 ? progressTotal : 1000;
      const safeDuration = duration > 0 && isFinite(duration) ? duration : 0;
      const clampedPos = safeDuration > 0 ? Math.max(0, Math.min(position, safeDuration)) : 0;

      let derivedCurrentPage = progressPage ?? 0;
      let derivedTotalPages = scale;

      if (safeDuration > 0) {
        const ratio = clampedPos / safeDuration;
        derivedCurrentPage = Math.floor(ratio * scale);
      }

      if (completed) {
        derivedCurrentPage = derivedTotalPages;
      }

      // 仅在已有历史记录时更新，避免为压缩包内视频等创建新的条目
      if (existingIndex < 0) {
        return history;
      }

      const prev = history[existingIndex];
      const entry: HistoryEntry = {
        ...prev,
        currentPage: derivedCurrentPage,
        totalPages: derivedTotalPages,
        videoPosition: clampedPos,
        videoDuration: safeDuration,
        videoCompleted: completed
      };

      const newHistory = [...history];
      newHistory[existingIndex] = entry;
      const reordered = [entry, ...newHistory.filter((_, i) => i !== existingIndex)];

      saveToStorage(reordered);
      return reordered;
    });
  },

  /**
   * 清理失效的历史记录（文件/文件夹不存在）
   * 返回清理的条目数量
   */
  async cleanupInvalid(): Promise<number> {
    const history = this.getAll();
    if (history.length === 0) return 0;

    // 并发检查所有路径是否存在
    const checkResults = await Promise.all(
      history.map(async (entry) => {
        try {
          const exists = await pathExists(entry.path);
          return { entry, exists };
        } catch {
          // 检查失败时保留条目
          return { entry, exists: true };
        }
      })
    );

    // 过滤出存在的条目
    const validEntries = checkResults
      .filter(r => r.exists)
      .map(r => r.entry);

    const removedCount = history.length - validEntries.length;

    if (removedCount > 0) {
      set(validEntries);
      saveToStorage(validEntries);
      console.log(`[History] 清理了 ${removedCount} 条失效记录`);
    }

    return removedCount;
  }
};



































