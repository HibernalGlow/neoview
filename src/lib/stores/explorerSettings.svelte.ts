/**
 * Explorer Settings Store
 * 资源管理器设置全局状态管理
 * 参考 spacedrive 的 useExplorerSettings
 */

import { writable } from 'svelte/store';
import type { SortConfig } from '$lib/components/panels/file/services/sortService';

export type ViewLayout = 'list' | 'grid' | 'media';
export type IconSize = 'sm' | 'md' | 'lg';

export interface ExplorerSettings {
  // 布局设置
  layout: ViewLayout;
  iconSize: IconSize;
  showHiddenFiles: boolean;
  showPreview: boolean;
  
  // 排序设置
  sortConfig: SortConfig;
  
  // 列表设置
  listColumns: {
    name: boolean;
    size: boolean;
    modified: boolean;
    type: boolean;
  };
  
  // 缩略图设置
  thumbnailSize: number;
  thumbnailQuality: 'low' | 'medium' | 'high';
  
  // 导航设置
  showSidebar: boolean;
  sidebarWidth: number;
  
  // 性能设置
  lazyLoadThreshold: number;
  preloadCount: number;
}

const defaultSettings: ExplorerSettings = {
  layout: 'list',
  iconSize: 'md',
  showHiddenFiles: false,
  showPreview: true,
  sortConfig: {
    field: 'name',
    direction: 'asc'
  },
  listColumns: {
    name: true,
    size: true,
    modified: true,
    type: false
  },
  thumbnailSize: 128,
  thumbnailQuality: 'medium',
  showSidebar: true,
  sidebarWidth: 240,
  lazyLoadThreshold: 100,
  preloadCount: 20
};

// 从 localStorage 加载设置
function loadSettings(): ExplorerSettings {
  try {
    const saved = localStorage.getItem('neoview-explorer-settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...defaultSettings, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load explorer settings:', e);
  }
  return defaultSettings;
}

// 保存设置到 localStorage
function saveSettings(settings: ExplorerSettings) {
  try {
    localStorage.setItem('neoview-explorer-settings', JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save explorer settings:', e);
  }
}

function createExplorerSettingsStore() {
  const { subscribe, set, update } = writable<ExplorerSettings>(loadSettings());
  
  // 防抖保存
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;
  const debouncedSave = (settings: ExplorerSettings) => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveSettings(settings), 300);
  };

  return {
    subscribe,
    
    // 更新单个设置
    updateSetting: <K extends keyof ExplorerSettings>(key: K, value: ExplorerSettings[K]) => {
      update(settings => {
        const newSettings = { ...settings, [key]: value };
        debouncedSave(newSettings);
        return newSettings;
      });
    },
    
    // 批量更新设置
    updateSettings: (updates: Partial<ExplorerSettings>) => {
      update(settings => {
        const newSettings = { ...settings, ...updates };
        debouncedSave(newSettings);
        return newSettings;
      });
    },
    
    // 重置到默认设置
    reset: () => {
      set(defaultSettings);
      saveSettings(defaultSettings);
    },
    
    // 获取当前设置（同步）
    getSettings: () => {
      let current = defaultSettings;
      subscribe(settings => current = settings)();
      return current;
    }
  };
}

export const explorerSettingsStore = createExplorerSettingsStore();

// 辅助函数：计算缩略图尺寸
export function getThumbnailDimensions(settings: ExplorerSettings) {
  const baseSize = settings.thumbnailSize;
  return {
    width: baseSize,
    height: baseSize,
    // 网格模式下添加间距
    gridWidth: settings.layout === 'grid' ? baseSize + 8 : baseSize,
    gridHeight: settings.layout === 'grid' ? baseSize + 24 : baseSize
  };
}

// 辅助函数：判断是否应该显示缩略图
export function shouldShowThumbnail(settings: ExplorerSettings, item: any) {
  if (!settings.showPreview) return false;
  
  switch (settings.layout) {
    case 'list':
      return settings.iconSize !== 'sm';
    case 'grid':
    case 'media':
      return true;
    default:
      return false;
  }
}