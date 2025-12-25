/**
 * 颜色滤镜状态管理
 * 管理图像滤镜设置，支持上色和基础滤镜
 */

import { writable, get } from 'svelte/store';
import {
  type FilterSettings,
  type ColorPoint,
  defaultFilterSettings,
  colorPresets,
  generateSvgFilter,
  generateCssFilter,
  getActiveColors,
} from '$lib/utils/colorFilters';

// 滤镜 ID（用于 SVG filter 引用）
const FILTER_ID = 'neoview-colorize-filter';

// 存储 key
const STORAGE_KEY = 'neoview-filter-settings';

/**
 * 从 localStorage 加载设置
 */
function loadSettings(): FilterSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...defaultFilterSettings, ...parsed };
    }
  } catch (err) {
    console.error('❌ 加载滤镜设置失败:', err);
  }
  return { ...defaultFilterSettings };
}

/**
 * 保存设置到 localStorage
 */
function saveSettings(settings: FilterSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('❌ 保存滤镜设置失败:', err);
  }
}

// 创建 store
const { subscribe, set, update } = writable<FilterSettings>(loadSettings());

// SVG 滤镜元素引用
let svgFilterElement: HTMLDivElement | null = null;

/**
 * 更新 SVG 滤镜定义
 */
function updateSvgFilter(settings: FilterSettings): void {
  if (!settings.colorizeEnabled) {
    // 移除 SVG 滤镜
    if (svgFilterElement) {
      svgFilterElement.remove();
      svgFilterElement = null;
    }
    return;
  }

  const colors = getActiveColors(settings);
  const svgHtml = generateSvgFilter(FILTER_ID, colors);

  if (!svgFilterElement) {
    svgFilterElement = document.createElement('div');
    svgFilterElement.id = 'neoview-svg-filters';
    document.body.appendChild(svgFilterElement);
  }

  svgFilterElement.innerHTML = svgHtml;
}

/**
 * 滤镜 Store
 */
export const filterStore = {
  subscribe,

  /** 获取滤镜 ID */
  getFilterId: () => FILTER_ID,

  /** 获取当前 CSS filter 字符串 */
  getCssFilter: (): string => {
    const settings = get({ subscribe });
    return generateCssFilter(settings, settings.colorizeEnabled ? FILTER_ID : undefined);
  },

  /** 检查滤镜是否启用 */
  isEnabled: (): boolean => {
    const settings = get({ subscribe });
    return settings.colorizeEnabled ||
      settings.brightness !== 100 ||
      settings.contrast !== 100 ||
      settings.saturation !== 100 ||
      settings.sepia !== 0 ||
      settings.hueRotate !== 0 ||
      settings.invert ||
      settings.negative;
  },

  /** 启用/禁用上色 */
  setColorizeEnabled: (enabled: boolean): void => {
    update(s => {
      const newSettings = { ...s, colorizeEnabled: enabled };
      saveSettings(newSettings);
      updateSvgFilter(newSettings);
      return newSettings;
    });
  },

  /** 设置上色预设 */
  setColorizePreset: (preset: string): void => {
    update(s => {
      const newSettings = { ...s, colorizePreset: preset, customColors: [] };
      saveSettings(newSettings);
      updateSvgFilter(newSettings);
      return newSettings;
    });
  },

  /** 设置自定义颜色 */
  setCustomColors: (colors: ColorPoint[]): void => {
    update(s => {
      const newSettings = { ...s, customColors: colors };
      saveSettings(newSettings);
      updateSvgFilter(newSettings);
      return newSettings;
    });
  },

  /** 设置亮度 */
  setBrightness: (value: number): void => {
    update(s => {
      const newSettings = { ...s, brightness: value };
      saveSettings(newSettings);
      return newSettings;
    });
  },

  /** 设置对比度 */
  setContrast: (value: number): void => {
    update(s => {
      const newSettings = { ...s, contrast: value };
      saveSettings(newSettings);
      return newSettings;
    });
  },

  /** 设置饱和度 */
  setSaturation: (value: number): void => {
    update(s => {
      const newSettings = { ...s, saturation: value };
      saveSettings(newSettings);
      return newSettings;
    });
  },

  /** 设置褐色 */
  setSepia: (value: number): void => {
    update(s => {
      const newSettings = { ...s, sepia: value };
      saveSettings(newSettings);
      return newSettings;
    });
  },

  /** 设置色相旋转 */
  setHueRotate: (value: number): void => {
    update(s => {
      const newSettings = { ...s, hueRotate: value };
      saveSettings(newSettings);
      return newSettings;
    });
  },

  /** 设置反色 */
  setInvert: (enabled: boolean): void => {
    update(s => {
      const newSettings = { ...s, invert: enabled };
      saveSettings(newSettings);
      return newSettings;
    });
  },

  /** 设置负片 */
  setNegative: (enabled: boolean): void => {
    update(s => {
      const newSettings = { ...s, negative: enabled };
      saveSettings(newSettings);
      return newSettings;
    });
  },

  /** 重置所有滤镜 */
  reset: (): void => {
    const newSettings = { ...defaultFilterSettings };
    set(newSettings);
    saveSettings(newSettings);
    updateSvgFilter(newSettings);
  },

  /** 初始化（页面加载时调用） */
  init: (): void => {
    const settings = get({ subscribe });
    updateSvgFilter(settings);
  },
};

// 导出类型
export type { FilterSettings, ColorPoint };
export { colorPresets, defaultFilterSettings };
