/**
 * NeoView - Settings Types
 * 应用设置相关的 TypeScript 类型定义
 */

export type ThemeMode = 'light' | 'dark' | 'system';

export type Language = 'en' | 'zh-CN' | 'ja' | 'ko';

export interface ViewerSettings {
  /** 背景颜色 */
  backgroundColor: string;
  /** 是否显示网格 */
  showGrid: boolean;
  /** 缩放模式 */
  zoomMode: 'fitWidth' | 'fitHeight' | 'fitScreen' | 'original' | 'custom';
  /** 自定义缩放比例 */
  customZoom: number;
  /** 平滑缩放 */
  smoothZoom: boolean;
  /** 是否允许放大超过原始大小 */
  allowZoomBeyondOriginal: boolean;
}

export interface UISettings {
  /** 主题模式 */
  theme: ThemeMode;
  /** 语言 */
  language: Language;
  /** 是否全屏 */
  fullscreen: boolean;
  /** 是否显示标题栏 */
  showTitleBar: boolean;
  /** 是否显示状态栏 */
  showStatusBar: boolean;
  /** 是否显示侧边栏 */
  showSidebar: boolean;
  /** 侧边栏宽度 */
  sidebarWidth: number;
  /** 侧边栏位置 */
  sidebarPosition: 'left' | 'right';
}

export interface PerformanceSettings {
  /** 缓存大小 (MB) */
  cacheSize: number;
  /** 预加载页面数 */
  preloadPages: number;
  /** 是否启用硬件加速 */
  hardwareAcceleration: boolean;
  /** 最大并发加载数 */
  maxConcurrentLoads: number;
}

export interface KeyboardShortcut {
  /** 命令ID */
  command: string;
  /** 按键组合 */
  keys: string;
  /** 描述 */
  description: string;
}

export interface AppSettings {
  /** 查看器设置 */
  viewer: ViewerSettings;
  /** UI设置 */
  ui: UISettings;
  /** 性能设置 */
  performance: PerformanceSettings;
  /** 键盘快捷键 */
  shortcuts: KeyboardShortcut[];
  /** 窗口位置 */
  windowPosition?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
