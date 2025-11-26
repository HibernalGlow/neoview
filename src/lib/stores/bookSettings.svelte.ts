import { writable } from 'svelte/store';
import type { ReadingDirection } from '$lib/settings/settingsManager';

export interface PerBookSettings {
  readingDirection?: ReadingDirection;
  doublePageView?: boolean;
  horizontalBook?: boolean;
  favorite?: boolean;
  rating?: number; // 1-5
}

interface BookSettingsState {
  entries: Record<string, PerBookSettings>;
}

const STORAGE_KEY = 'neoview-book-settings';

function loadFromStorage(): Record<string, PerBookSettings> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PerBookSettings>;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (err) {
    console.error('[bookSettings] 加载失败:', err);
  }
  return {};
}

function saveToStorage(entries: Record<string, PerBookSettings>) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.error('[bookSettings] 保存失败:', err);
  }
}

const { subscribe, update } = writable<BookSettingsState>({
  entries: loadFromStorage()
});

export const bookSettingsStore = {
  subscribe,
  get(path: string): PerBookSettings | undefined {
    let value: PerBookSettings | undefined;
    const unsubscribe = subscribe((state) => {
      value = state.entries[path];
    });
    unsubscribe();
    return value;
  },
  updateFor(path: string, partial: Partial<PerBookSettings>) {
    update((state) => {
      const prev = state.entries[path] ?? {};
      const nextEntry: PerBookSettings = { ...prev, ...partial };
      const nextEntries: Record<string, PerBookSettings> = {
        ...state.entries,
        [path]: nextEntry
      };
      saveToStorage(nextEntries);
      return { ...state, entries: nextEntries };
    });
  }
};
