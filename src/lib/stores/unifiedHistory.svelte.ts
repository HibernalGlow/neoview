/**
 * NeoView - Unified History Store
 * 统一历史记录管理 (Svelte 5 Runes)
 */

import { writable, get } from 'svelte/store';
import type {
  UnifiedHistoryEntry,
  ContentRef,
  VideoProgress,
  ContentType,
} from '$lib/types/content';
import { extractName, refToString } from '$lib/types/content';
import { historySettingsStore } from './historySettings.svelte';

// ==================== 常量 ====================

const STORAGE_KEY = 'neoview-unified-history';
const OLD_STORAGE_KEY = 'neoview-history';

// ==================== 旧格式迁移 ====================

interface OldHistoryEntry {
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

function migrateOldEntry(old: OldHistoryEntry): UnifiedHistoryEntry {
  const videoProgress: VideoProgress | undefined = 
    old.videoPosition !== undefined && old.videoDuration !== undefined
      ? {
          position: old.videoPosition,
          duration: old.videoDuration,
          completed: old.videoCompleted ?? false,
        }
      : undefined;

  return {
    id: old.id,
    pathStack: [{ path: old.path }],
    currentIndex: old.currentPage,
    displayName: old.name,
    thumbnail: old.thumbnail,
    timestamp: old.timestamp,
    videoProgress,
    totalItems: old.totalPages,
  };
}

// ==================== 加载和保存 ====================

function loadHistory(): UnifiedHistoryEntry[] {
  try {
    // 尝试加载新格式
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }

    // 尝试迁移旧格式
    const oldStored = localStorage.getItem(OLD_STORAGE_KEY);
    if (oldStored) {
      const oldEntries: OldHistoryEntry[] = JSON.parse(oldStored);
      const migrated = oldEntries.map(migrateOldEntry);
      
      // 保存新格式
      saveToStorage(migrated);
      
      // 可选：删除旧数据
      // localStorage.removeItem(OLD_STORAGE_KEY);
      
      console.log(`[History] Migrated ${migrated.length} entries from old format`);
      return migrated;
    }
  } catch (err) {
    console.error('Failed to load history:', err);
  }
  return [];
}

function saveToStorage(history: UnifiedHistoryEntry[]) {
  try {
    const limit = historySettingsStore.maxHistorySize;
    const toSave = limit > 0 ? history.slice(0, limit) : history;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    console.log('💾 [UnifiedHistory] Saved', toSave.length, 'entries to localStorage');
  } catch (err) {
    console.error('Failed to save history:', err);
  }
}

// ==================== Store ====================

const { subscribe, set, update } = writable<UnifiedHistoryEntry[]>(loadHistory());

export const unifiedHistoryStore = {
  subscribe,

  /**
   * 添加或更新历史记录
   */
  add(
    pathStack: ContentRef[],
    currentIndex: number,
    totalItems: number,
    options: {
      displayName?: string;
      thumbnail?: string;
      videoProgress?: VideoProgress;
      contentType?: ContentType;
      currentFilePath?: string;
    } = {}
  ) {
    console.log('📝 [UnifiedHistory] add() called:', { pathStack, currentIndex, totalItems, options });
    if (!pathStack || pathStack.length === 0) {
      console.warn('⚠️ [UnifiedHistory] Empty pathStack, skipping add');
      return;
    }
    update(history => {
      // 生成唯一键
      const key = pathStack.map(refToString).join('>>');
      
      // 检查是否已存在
      const existingIndex = history.findIndex(h => 
        h.pathStack.map(refToString).join('>>') === key
      );

      const existing = existingIndex >= 0 ? history[existingIndex] : undefined;

      const entry: UnifiedHistoryEntry = {
        id: existing?.id ?? crypto.randomUUID(),
        pathStack,
        currentIndex,
        currentFilePath: options.currentFilePath ?? existing?.currentFilePath,
        displayName: options.displayName ?? existing?.displayName ?? extractName(pathStack[pathStack.length - 1]?.path ?? ''),
        thumbnail: options.thumbnail ?? existing?.thumbnail,
        timestamp: Date.now(),
        videoProgress: options.videoProgress ?? existing?.videoProgress,
        totalItems,
        contentType: options.contentType ?? existing?.contentType,
      };

      let newHistory: UnifiedHistoryEntry[];
      if (existingIndex >= 0) {
        newHistory = [...history];
        newHistory[existingIndex] = entry;
        // 移到最前面
        newHistory = [entry, ...newHistory.filter((_, i) => i !== existingIndex)];
      } else {
        newHistory = [entry, ...history];
      }

      saveToStorage(newHistory);
      return newHistory;
    });
  },

  /**
   * 更新索引（不改变时间戳顺序）
   */
  updateIndex(pathStack: ContentRef[], currentIndex: number, totalItems: number, currentFilePath?: string) {
    update(history => {
      const key = pathStack.map(refToString).join('>>');
      const existingIndex = history.findIndex(h => 
        h.pathStack.map(refToString).join('>>') === key
      );

      if (existingIndex >= 0) {
        const newHistory = [...history];
        newHistory[existingIndex] = {
          ...newHistory[existingIndex],
          currentIndex,
          totalItems,
          currentFilePath: currentFilePath ?? newHistory[existingIndex].currentFilePath,
        };
        saveToStorage(newHistory);
        return newHistory;
      }
      return history;
    });
  },

  /**
   * 更新视频进度
   */
  updateVideoProgress(
    pathStack: ContentRef[],
    position: number,
    duration: number,
    completed: boolean
  ) {
    update(history => {
      const key = pathStack.map(refToString).join('>>');
      const existingIndex = history.findIndex(h => 
        h.pathStack.map(refToString).join('>>') === key
      );

      if (existingIndex < 0) return history;

      const entry = history[existingIndex];
      const scale = 1000;
      const safeDuration = duration > 0 && isFinite(duration) ? duration : 0;
      const clampedPos = safeDuration > 0 ? Math.max(0, Math.min(position, safeDuration)) : 0;

      let derivedCurrentIndex = 0;
      if (safeDuration > 0) {
        derivedCurrentIndex = Math.floor((clampedPos / safeDuration) * scale);
      }
      if (completed) {
        derivedCurrentIndex = scale;
      }

      const updatedEntry: UnifiedHistoryEntry = {
        ...entry,
        currentIndex: derivedCurrentIndex,
        totalItems: scale,
        videoProgress: {
          position: clampedPos,
          duration: safeDuration,
          completed,
        },
      };

      const newHistory = [...history];
      newHistory[existingIndex] = updatedEntry;
      
      // 移到最前面
      const reordered = [updatedEntry, ...newHistory.filter((_, i) => i !== existingIndex)];
      
      saveToStorage(reordered);
      return reordered;
    });
  },

  /**
   * 根据路径栈查找
   */
  findByPathStack(pathStack: ContentRef[]): UnifiedHistoryEntry | undefined {
    const history = get({ subscribe });
    const key = pathStack.map(refToString).join('>>');
    return history.find(h => h.pathStack.map(refToString).join('>>') === key);
  },

  /**
   * 根据单个路径查找（兼容旧逻辑）
   * 支持单文件模式：会检查 pathStack 中所有路径
   */
  findByPath(path: string): UnifiedHistoryEntry | undefined {
    const history = get({ subscribe });
    const normalizePath = (p: string) => p.replace(/\\/g, '/').toLowerCase();
    const normalizedPath = normalizePath(path);
    
    return history.find(h => {
      // 检查 pathStack 中的所有路径
      return h.pathStack.some(ref => normalizePath(ref.path) === normalizedPath);
    });
  },

  /**
   * 移除
   */
  remove(id: string) {
    update(history => {
      const newHistory = history.filter(h => h.id !== id);
      saveToStorage(newHistory);
      return newHistory;
    });
  },

  /**
   * 清空
   */
  clear() {
    set([]);
    saveToStorage([]);
  },

  /**
   * 获取所有
   */
  getAll(): UnifiedHistoryEntry[] {
    return get({ subscribe });
  },

  /**
   * 清理失效记录
   */
  async cleanupInvalid(): Promise<number> {
    const { pathExists } = await import('$lib/api/filesystem');
    const history = get({ subscribe });
    if (history.length === 0) return 0;

    const checkResults = await Promise.all(
      history.map(async (entry) => {
        try {
          const firstRef = entry.pathStack[0];
          if (!firstRef) return { entry, exists: false };
          const exists = await pathExists(firstRef.path);
          return { entry, exists };
        } catch {
          return { entry, exists: true };
        }
      })
    );

    const validEntries = checkResults
      .filter(r => r.exists)
      .map(r => r.entry);

    const removedCount = history.length - validEntries.length;

    if (removedCount > 0) {
      set(validEntries);
      saveToStorage(validEntries);
      console.log(`[History] Cleaned ${removedCount} invalid entries`);
    }

    return removedCount;
  },
};

// 导出类型
export type { UnifiedHistoryEntry };
