/**
 * 翻页动画状态管理
 * 参考 OpenComic 的 page-transitions.js 实现
 */

import { writable, get } from 'svelte/store';

// 翻页动画类型
export type PageTransitionType = 
  | 'none'           // 无动画（即时切换）
  | 'fade'           // 淡入淡出
  | 'slide'          // 滑动
  | 'slideUp'        // 向上滑动
  | 'zoom'           // 缩放
  | 'flip';          // 翻转

// 缓动函数类型
export type EasingType = 
  | 'linear'
  | 'ease'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeOutQuad'
  | 'easeOutCubic';

// 翻页动画设置
export interface PageTransitionSettings {
  enabled: boolean;           // 是否启用动画
  type: PageTransitionType;   // 动画类型
  duration: number;           // 动画时长（毫秒）
  easing: EasingType;         // 缓动函数
}

// 默认设置
export const defaultTransitionSettings: PageTransitionSettings = {
  enabled: true,
  type: 'fade',
  duration: 200,
  easing: 'easeOutQuad',
};

// 存储 key
const STORAGE_KEY = 'neoview-page-transition-settings';

// 缓动函数 CSS 映射
export const easingCssMap: Record<EasingType, string> = {
  linear: 'linear',
  ease: 'ease',
  easeIn: 'ease-in',
  easeOut: 'ease-out',
  easeInOut: 'ease-in-out',
  easeOutQuad: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  easeOutCubic: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
};

// 动画类型名称映射（中文）
export const transitionTypeNames: Record<PageTransitionType, string> = {
  none: '无动画',
  fade: '淡入淡出',
  slide: '水平滑动',
  slideUp: '垂直滑动',
  zoom: '缩放',
  flip: '翻转',
};

// 缓动函数名称映射（中文）
export const easingNames: Record<EasingType, string> = {
  linear: '线性',
  ease: '平滑',
  easeIn: '渐入',
  easeOut: '渐出',
  easeInOut: '渐入渐出',
  easeOutQuad: '二次渐出',
  easeOutCubic: '三次渐出',
};

/**
 * 从 localStorage 加载设置
 */
function loadSettings(): PageTransitionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...defaultTransitionSettings, ...parsed };
    }
  } catch (err) {
    console.error('❌ 加载翻页动画设置失败:', err);
  }
  return { ...defaultTransitionSettings };
}

/**
 * 保存设置到 localStorage
 */
function saveSettings(settings: PageTransitionSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('❌ 保存翻页动画设置失败:', err);
  }
}

// 创建 store
const { subscribe, set, update } = writable<PageTransitionSettings>(loadSettings());

// 当前动画状态
let isAnimating = false;
let animationDirection: 'next' | 'prev' | null = null;

/**
 * 翻页动画 Store
 */
export const pageTransitionStore = {
  subscribe,

  /** 获取当前设置 */
  getSettings: (): PageTransitionSettings => get({ subscribe }),

  /** 是否正在动画中 */
  isAnimating: () => isAnimating,

  /** 获取动画方向 */
  getDirection: () => animationDirection,

  /** 启用/禁用动画 */
  setEnabled: (enabled: boolean): void => {
    update(s => {
      const newSettings = { ...s, enabled };
      saveSettings(newSettings);
      return newSettings;
    });
  },

  /** 设置动画类型 */
  setType: (type: PageTransitionType): void => {
    update(s => {
      const newSettings = { ...s, type };
      saveSettings(newSettings);
      return newSettings;
    });
  },

  /** 设置动画时长 */
  setDuration: (duration: number): void => {
    update(s => {
      const newSettings = { ...s, duration: Math.max(0, Math.min(1000, duration)) };
      saveSettings(newSettings);
      return newSettings;
    });
  },

  /** 设置缓动函数 */
  setEasing: (easing: EasingType): void => {
    update(s => {
      const newSettings = { ...s, easing };
      saveSettings(newSettings);
      return newSettings;
    });
  },

  /** 开始动画 */
  startAnimation: (direction: 'next' | 'prev'): void => {
    isAnimating = true;
    animationDirection = direction;
  },

  /** 结束动画 */
  endAnimation: (): void => {
    isAnimating = false;
    animationDirection = null;
  },

  /** 重置为默认设置 */
  reset: (): void => {
    const newSettings = { ...defaultTransitionSettings };
    set(newSettings);
    saveSettings(newSettings);
  },

  /** 生成 CSS transition 字符串 */
  getCssTransition: (): string => {
    const settings = get({ subscribe });
    if (!settings.enabled || settings.type === 'none') return 'none';
    return `${settings.duration}ms ${easingCssMap[settings.easing]}`;
  },

  /** 获取动画 CSS 类名 */
  getAnimationClass: (state: 'enter' | 'leave', direction: 'next' | 'prev'): string => {
    const settings = get({ subscribe });
    if (!settings.enabled || settings.type === 'none') return '';
    return `page-transition-${settings.type}-${state}-${direction}`;
  },
};

// 导出类型
export type { PageTransitionSettings };
