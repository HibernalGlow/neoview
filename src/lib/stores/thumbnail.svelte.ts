/**
 * NeoView - Thumbnail Store
 * 缩略图管理状态
 */

import { writable } from 'svelte/store';

export interface ThumbnailIndexState {
  isIndexing: boolean;
  isPaused: boolean;
  progress: number;
  processed: number;
  total: number;
  currentFile: string;
  cacheSize: number;
  speed: number;  // 缩略图/秒
  startTime: number;
  error: string;
}

const initialState: ThumbnailIndexState = {
  isIndexing: false,
  isPaused: false,
  progress: 0,
  processed: 0,
  total: 0,
  currentFile: '',
  cacheSize: 0,
  speed: 0,
  startTime: 0,
  error: ''
};

function createThumbnailStore() {
  const { subscribe, set, update } = writable<ThumbnailIndexState>(initialState);

  return {
    subscribe,
    
    // 索引控制
    startIndexing: (total: number) => update(state => ({
      ...state,
      isIndexing: true,
      isPaused: false,
      progress: 0,
      processed: 0,
      total,
      startTime: Date.now(),
      error: ''
    })),
    
    pauseIndexing: () => update(state => ({
      ...state,
      isPaused: true
    })),
    
    resumeIndexing: () => update(state => ({
      ...state,
      isPaused: false
    })),
    
    stopIndexing: () => update(state => ({
      ...state,
      isIndexing: false,
      isPaused: false
    })),
    
    // 进度更新
    updateProgress: (processed: number, currentFile: string) => update(state => {
      const total = state.total || 1;
      const progress = Math.round((processed / total) * 100);
      const elapsed = (Date.now() - state.startTime) / 1000;
      const speed = elapsed > 0 ? processed / elapsed : 0;
      
      return {
        ...state,
        processed,
        progress,
        currentFile,
        speed: Math.round(speed * 10) / 10
      };
    }),
    
    // 缓存大小更新
    updateCacheSize: (cacheSize: number) => update(state => ({
      ...state,
      cacheSize
    })),
    
    // 错误设置
    setError: (error: string) => update(state => ({
      ...state,
      error
    })),
    
    // 重置状态
    reset: () => set(initialState)
  };
}

export const thumbnailStore = createThumbnailStore();
