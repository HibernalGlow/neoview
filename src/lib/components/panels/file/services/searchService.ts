import type { FsItem } from '$lib/types';
import { fileBrowserService } from './fileBrowserService';

export type SearchHistoryEntry = { query: string; timestamp: number };
export type SearchSettings = {
  includeSubfolders: boolean;
  showHistoryOnFocus: boolean;
};

const HISTORY_STORAGE_KEY = 'neoview-search-history';
const MAX_HISTORY = 20;

function persistHistory(history: SearchHistoryEntry[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (err) {
    console.warn('保存搜索历史失败:', err);
  }
}

export function loadSearchHistoryEntries(): SearchHistoryEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) {
      if (parsed.length > 0 && typeof parsed[0] === 'string') {
        return (parsed as string[]).map(query => ({ query, timestamp: Date.now() - 86400000 }));
      }
      return parsed as SearchHistoryEntry[];
    }
  } catch (err) {
    console.warn('加载搜索历史失败:', err);
  }
  return [];
}

export function addSearchHistoryEntry(history: SearchHistoryEntry[], query: string): SearchHistoryEntry[] {
  const trimmed = query.trim();
  if (!trimmed) return history;
  const filtered = history.filter(item => item.query !== trimmed);
  const updated = [{ query: trimmed, timestamp: Date.now() }, ...filtered].slice(0, MAX_HISTORY);
  persistHistory(updated);
  return updated;
}

export function removeSearchHistoryEntry(history: SearchHistoryEntry[], entry: SearchHistoryEntry): SearchHistoryEntry[] {
  const updated = history.filter(item => !(item.query === entry.query && item.timestamp === entry.timestamp));
  persistHistory(updated);
  return updated;
}

export function clearSearchHistoryEntries(): SearchHistoryEntry[] {
  persistHistory([]);
  return [];
}

export async function searchFilesInPath(
  currentPath: string,
  query: string,
  settings: SearchSettings,
  options: { maxResults?: number } = {}
): Promise<FsItem[]> {
  const searchOptions = {
    includeSubfolders: settings.includeSubfolders,
    maxResults: options.maxResults ?? 100,
  };
  return fileBrowserService.searchFiles(currentPath, query, searchOptions);
}
