/**
 * Minimal Settings Manager for NeoView
 * 提供：获取/更新/重置/导入/导出/订阅 功能，持久化到 localStorage
 */

export type ZoomMode = 'fit' | 'fill' | 'fitWidth' | 'fitHeight' | 'original';
export type ReadingDirection = 'left-to-right' | 'right-to-left';
export type TailOverflowBehavior =
  | 'doNothing'
  | 'stayOnLastPage'
  | 'nextBook'
  | 'loopTopBottom'
  | 'seamlessLoop';

export type BookSettingSelectMode = 'default' | 'continue' | 'restoreOrDefault' | 'restoreOrContinue';

export type AutoRotateMode = 'none' | 'left' | 'right' | 'horizontalLeft' | 'horizontalRight' | 'forcedLeft' | 'forcedRight';

/** 渲染器模式：standard = 标准单图替换，stack = 层叠预加载 */
export type RendererMode = 'standard' | 'stack';

export interface NeoViewSettings {
  system: {
    language: string;
    hardwareAcceleration: boolean;
    temporaryDirectory: string;
    thumbnailDirectory: string;
  };
  startup: {
    openLastFile: boolean;
    minimizeToTray: boolean;
    openLastFolder: boolean;
  };
  archive: {
    allowFileOperations: boolean;
    confirmBeforeDelete: boolean;
  };
  performance: {
    cacheMemorySize: number; // MB
    preLoadSize: number; // number of items
    multiThreadedRendering: boolean;
    maxThreads: number;
  };
  image: {
    supportedFormats: string[];
    preloadCount: number;
    enableSuperResolution: boolean;
    superResolutionModel: string | null;
    currentImageUpscaleEnabled: boolean;
    autoPlayAnimatedImages: boolean;
    longImageScrollMode: 'page' | 'continuous';
    hoverScrollEnabled: boolean;
    videoMinPlaybackRate: number;
    videoMaxPlaybackRate: number;
    videoPlaybackRateStep: number;
    videoFormats: string[];
  };
  view: {
    defaultZoomMode: ZoomMode;
    showGrid: boolean;
    showInfoBar: boolean;
    showBookSwitchToast: boolean;
    backgroundColor: string;
    backgroundMode: 'solid' | 'auto';
    mouseCursor: {
      autoHide: boolean;
      hideDelay: number; // seconds
      showMovementThreshold: number; // pixels
      showOnButtonClick: boolean;
    };
    pageLayout: {
      splitHorizontalPages: boolean;
      treatHorizontalAsDoublePage: boolean;
      singleFirstPageMode: BookSettingSelectMode;
      singleLastPageMode: BookSettingSelectMode;
    };
    autoRotate: {
      mode: AutoRotateMode;
    };
    infoOverlay: {
      enabled: boolean;
      opacity: number; // 0.0 - 1.0
      showBorder: boolean;
      width?: number; // px, undefined = auto
      height?: number; // px, undefined = auto
    };
    notification?: {
      messageStyle: 'none' | 'normal' | 'normalIconOnly' | 'tiny' | 'tinyIconOnly';
      durationMs: number;
      maxVisible: number;
      placeholders?: {
        fileOperations?: boolean;
        taskProgress?: boolean;
        performanceTips?: boolean;
        systemMessages?: boolean;
      };
    };
    switchToast?: {
      enableBook: boolean;
      enablePage: boolean;
      showBookPath: boolean;
      showBookPageProgress: boolean;
      showBookType: boolean;
      showPageIndex: boolean;
      showPageSize: boolean;
      showPageDimensions: boolean;
      bookTitleTemplate?: string;
      bookDescriptionTemplate?: string;
      pageTitleTemplate?: string;
      pageDescriptionTemplate?: string;
    };
    /** 渲染器设置 */
    renderer?: {
      /** 渲染模式：standard = 标准，stack = 层叠预加载（更流畅） */
      mode: RendererMode;
      /** 是否使用 ViewerJS 增强模式 */
      useViewerJS?: boolean;
    };
  };
  book: {
    autoPageTurnInterval: number;
    preloadPages: number;
    rememberProgress: boolean;
    doublePageView: boolean;
    readingDirection: ReadingDirection;
    tailOverflowBehavior: TailOverflowBehavior;
  };
  theme: {
    theme: 'system' | 'light' | 'dark';
    fontSize: 'small' | 'medium' | 'large';
    uiScale: number;
    /** 自定义字体设置 */
    customFont: {
      /** 是否启用自定义字体覆盖主题字体 */
      enabled: boolean;
      /** 主字体列表（按优先级排序） */
      fontFamilies: string[];
      /** UI 字体（按钮、标签等） */
      uiFontFamilies: string[];
      /** 代码/等宽字体 */
      monoFontFamilies: string[];
    };
  };
  panels: {
    leftSidebarVisible: boolean;
    rightSidebarVisible: boolean;
    bottomPanelVisible: boolean;
    autoHideToolbar: boolean;
    /** 侧边栏/面板透明度 0-100 */
    sidebarOpacity: number;
    /** 顶部工具栏透明度 0-100 */
    topToolbarOpacity: number;
    /** 底部缩略图栏透明度 0-100 */
    bottomBarOpacity: number;
    /** 侧边栏模糊程度 0-20 */
    sidebarBlur: number;
    /** 顶部工具栏模糊程度 0-20 */
    topToolbarBlur: number;
    /** 底部缩略图栏模糊程度 0-20 */
    bottomBarBlur: number;
    hoverAreas: {
      topTriggerHeight: number;
      bottomTriggerHeight: number;
      leftTriggerWidth: number;
      rightTriggerWidth: number;
    };
    autoHideTiming: {
      showDelaySec: number;
      hideDelaySec: number;
    };
  };
  bindings: {
    mouse: {
      leftClick: string;
      rightClick: string;
      wheelUp: string;
      wheelDown: string;
    };
    keyboard: {
      space: string;
      arrowLeft: string;
      arrowRight: string;
      escape: string;
    };
  };
  history: {
    enabled: boolean;
    maxHistorySize: number;
    rememberLastFile: boolean;
    autoCleanupDays: number;
  };
  slideshow: {
    defaultInterval: number;
    loop: boolean;
    random: boolean;
    fadeTransition: boolean;
  };
}

const defaultSettings: NeoViewSettings = {
  system: {
    language: 'zh-CN',
    hardwareAcceleration: true,
    temporaryDirectory: '',
    thumbnailDirectory: 'D\\temp\\neoview'
  },
  startup: {
    openLastFile: true,
    minimizeToTray: false,
    openLastFolder: true
  },
  archive: {
    allowFileOperations: true,
    confirmBeforeDelete: true
  },
  performance: {
    cacheMemorySize: 512,
    preLoadSize: 3,
    multiThreadedRendering: true,
    maxThreads: 2
  },
  image: {
    supportedFormats: ['jpg', 'png', 'webp', 'avif', 'jxl'],
    preloadCount: 2,
    enableSuperResolution: false,
    superResolutionModel: null,
    currentImageUpscaleEnabled: false,
    autoPlayAnimatedImages: true,
    longImageScrollMode: 'continuous',
    hoverScrollEnabled: false,
    videoMinPlaybackRate: 0.25,
    videoMaxPlaybackRate: 16,
    videoPlaybackRateStep: 0.25,
    videoFormats: [
      'mp4',
      'm4v',
      'mov',
      'nov',
      'webm',
      'ogg',
      'ogv',
      '3gp',
      '3g2',
      'mkv',
      'avi',
      'flv',
      'wmv'
    ]
  },
  view: {
    defaultZoomMode: 'fit',
    showGrid: false,
    showInfoBar: true,
    showBookSwitchToast: false,
    backgroundColor: '#000000',
    backgroundMode: 'solid',
    mouseCursor: {
      autoHide: true,
      hideDelay: 1.0,
      showMovementThreshold: 26,
      showOnButtonClick: true
    },
    pageLayout: {
      splitHorizontalPages: false,
      treatHorizontalAsDoublePage: false,
      singleFirstPageMode: 'restoreOrDefault',
      singleLastPageMode: 'restoreOrDefault'
    },
    autoRotate: {
      mode: 'none'
    },
    infoOverlay: {
      enabled: false,
      opacity: 0.85,
      showBorder: false
    },
    notification: {
      messageStyle: 'normal',
      durationMs: 3000,
      maxVisible: 3
    },
    switchToast: {
      enableBook: false,
      enablePage: false,
      showBookPath: true,
      showBookPageProgress: true,
      showBookType: false,
      showPageIndex: true,
      showPageSize: false,
      showPageDimensions: true,
      bookTitleTemplate: '已切换到 {{book.displayName}}（第 {{book.currentPageDisplay}} / {{book.totalPages}} 页）',
      bookDescriptionTemplate: '路径：{{book.path}}',
      pageTitleTemplate: '第 {{page.indexDisplay}} / {{book.totalPages}} 页',
      pageDescriptionTemplate: '{{page.dimensionsFormatted}}  {{page.sizeFormatted}}'
    },
    renderer: {
      mode: 'stack', // 默认使用层叠模式，更流畅
      useViewerJS: false // ViewerJS 增强模式默认关闭
    }
  },
  book: {
    autoPageTurnInterval: 3,
    preloadPages: 2,
    rememberProgress: true,
    doublePageView: false,
    readingDirection: 'left-to-right' as 'left-to-right' | 'right-to-left',
    tailOverflowBehavior: 'stayOnLastPage'
  },
  theme: {
    theme: 'system',
    fontSize: 'medium',
    uiScale: 1.0,
    customFont: {
      enabled: false,
      fontFamilies: [],
      uiFontFamilies: [],
      monoFontFamilies: []
    }
  },
  panels: {
    leftSidebarVisible: true,
    rightSidebarVisible: false,
    bottomPanelVisible: false,
    autoHideToolbar: true,
    sidebarOpacity: 85,
    topToolbarOpacity: 85,
    bottomBarOpacity: 85,
    sidebarBlur: 12,
    topToolbarBlur: 12,
    bottomBarBlur: 12,
    hoverAreas: {
      topTriggerHeight: 32,
      bottomTriggerHeight: 32,
      leftTriggerWidth: 32,
      rightTriggerWidth: 32
    },
    autoHideTiming: {
      showDelaySec: 0.0,
      hideDelaySec: 0.0
    }
  },
  bindings: {
    mouse: {
      leftClick: 'next',
      rightClick: 'contextMenu',
      wheelUp: 'prev',
      wheelDown: 'next'
    },
    keyboard: {
      space: 'next',
      arrowLeft: 'prev',
      arrowRight: 'next',
      escape: 'close'
    }
  },
  history: {
    enabled: true,
    maxHistorySize: 100,
    rememberLastFile: true,
    autoCleanupDays: 30
  },
  slideshow: {
    defaultInterval: 5,
    loop: false,
    random: false,
    fadeTransition: true
  }
};

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

type AnyObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(target: AnyObject, source?: AnyObject): AnyObject {
  if (!source) {
    return target;
  }

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      target[key] = value.slice();
      continue;
    }

    if (isPlainObject(value)) {
      const current = isPlainObject(target[key]) ? (target[key] as Record<string, unknown>) : {};
      target[key] = deepMerge({ ...current }, value as Record<string, unknown>);
      continue;
    }

    target[key] = value;
  }

  return target;
}

function mergeWithDefaults(overrides?: Partial<NeoViewSettings>): NeoViewSettings {
  const clone = deepClone(defaultSettings);
  if (!overrides) return clone;
  return deepMerge(clone as unknown as AnyObject, overrides as unknown as AnyObject) as unknown as NeoViewSettings;
}

function reviveSettings(raw: NeoViewSettings): NeoViewSettings {
  return {
    ...raw,
    archive: {
      ...defaultSettings.archive,
      ...raw.archive
    }
  };
}

export class SettingsManager {
  private static instance: SettingsManager;
  private settings: NeoViewSettings = { ...defaultSettings };
  private listeners: Set<(s: NeoViewSettings) => void> = new Set();

  private constructor() {
    this.loadSettings();

    // 在多窗口环境下，同步 localStorage 中的设置到当前 SettingsManager
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event: StorageEvent) => {
        if (event.key !== 'neoview-settings' || !event.newValue) return;
        try {
          const parsed = JSON.parse(event.newValue) as Partial<NeoViewSettings>;
          this.settings = mergeWithDefaults(parsed);
          this.notifyListeners();
        } catch (err) {
          console.error('❌ 同步设置失败 (storage event):', err);
        }
      });
    }
  }

  static getInstance() {
    if (!SettingsManager.instance) SettingsManager.instance = new SettingsManager();
    return SettingsManager.instance;
  }

  getSettings(): NeoViewSettings {
    return JSON.parse(JSON.stringify(this.settings));
  }

  updateSettings(updates: Partial<NeoViewSettings>) {
    this.settings = reviveSettings({ ...this.settings, ...updates } as NeoViewSettings);
    this.saveSettings();
    this.notifyListeners();
  }

  updateNestedSettings<K extends keyof NeoViewSettings>(category: K, updates: Partial<NeoViewSettings[K]>) {
    console.log('📝 updateNestedSettings 调用:', {
      category,
      updates,
      before: this.settings[category]
    });
    
    this.settings[category] = { ...this.settings[category], ...updates } as NeoViewSettings[K];
    
    console.log('✅ updateNestedSettings 完成:', {
      category,
      after: this.settings[category]
    });
    
    this.saveSettings();
    this.notifyListeners();
  }

  resetToDefaults() {
    this.settings = { ...defaultSettings };
    this.saveSettings();
    this.notifyListeners();
  }

  exportSettings(): string {
    return JSON.stringify({ format: 'NeoView/1.0', exportTime: new Date().toISOString(), config: this.settings }, null, 2);
  }

  importSettings(json: string): boolean {
    try {
      const data = JSON.parse(json);
      let cfg: Partial<NeoViewSettings> | null = null;
      if (data.format && data.config) {
        cfg = data.config;
      } else {
        // try direct object
        cfg = data;
      }
      // Basic validation: must have system and view
      if (!cfg || !cfg.system || !cfg.view) throw new Error('配置格式不完整');
      
      this.settings = mergeWithDefaults(cfg);
      this.normalizeSettings();
      
      this.saveSettings();
      this.notifyListeners();
      return true;
    } catch (err) {
      console.error('importSettings error', err);
      return false;
    }
  }

  addListener(callback: (s: NeoViewSettings) => void) {
    this.listeners.add(callback);
  }

  removeListener(cb: (s: NeoViewSettings) => void) {
    this.listeners.delete(cb);
  }

  private notifyListeners() {
    const snapshot = this.getSettings();
    this.listeners.forEach((l) => l(snapshot));
  }

  private normalizeSettings() {
    this.normalizePerformanceSettings();
    this.normalizeBookSettings();
    this.normalizeViewSettings();
  }

  private normalizePerformanceSettings() {
    const perf = this.settings.performance;
    if (!perf) return;
    const { cacheMemorySize, preLoadSize, multiThreadedRendering, maxThreads } = perf;
    this.settings.performance = {
      cacheMemorySize: cacheMemorySize ?? defaultSettings.performance.cacheMemorySize,
      preLoadSize: preLoadSize ?? defaultSettings.performance.preLoadSize,
      multiThreadedRendering:
        multiThreadedRendering ?? defaultSettings.performance.multiThreadedRendering,
      maxThreads: maxThreads ?? defaultSettings.performance.maxThreads
    };
  }

  private normalizeBookSettings() {
    const allowed: TailOverflowBehavior[] = ['doNothing', 'stayOnLastPage', 'nextBook', 'loopTopBottom', 'seamlessLoop'];
    const behavior = this.settings.book?.tailOverflowBehavior;
    if (!allowed.includes(behavior)) {
      this.settings.book.tailOverflowBehavior = 'stayOnLastPage';
    }
  }

  private normalizeViewSettings() {
    if (!this.settings.view) {
      this.settings.view = { ...defaultSettings.view };
      return;
    }

    const layout = this.settings.view.pageLayout ?? defaultSettings.view.pageLayout;
    this.settings.view.pageLayout = {
      splitHorizontalPages: layout.splitHorizontalPages ?? defaultSettings.view.pageLayout.splitHorizontalPages,
      treatHorizontalAsDoublePage:
        layout.treatHorizontalAsDoublePage ?? defaultSettings.view.pageLayout.treatHorizontalAsDoublePage,
      singleFirstPageMode: layout.singleFirstPageMode ?? defaultSettings.view.pageLayout.singleFirstPageMode,
      singleLastPageMode: layout.singleLastPageMode ?? defaultSettings.view.pageLayout.singleLastPageMode
    };

    if (!this.settings.view.notification) {
      const def = defaultSettings.view.notification!;
      this.settings.view.notification = {
        messageStyle: def.messageStyle,
        durationMs: def.durationMs,
        maxVisible: def.maxVisible
      };
    }
  }

  private loadSettings() {
    try {
      const raw = localStorage.getItem('neoview-settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        this.settings = mergeWithDefaults(parsed);
        this.normalizeSettings();
        console.log('📂 从 localStorage 加载设置:', {
          enableSuperResolution: this.settings.image.enableSuperResolution
        });
      } else {
        console.log('📂 localStorage 中没有设置，使用默认值');
      }
    } catch (err) {
      console.error('❌ loadSettings failed:', err);
      this.settings = mergeWithDefaults();
    }
  }

  private saveSettings() {
    try {
      const settingsStr = JSON.stringify(this.settings);
      console.log('💾 保存设置到 localStorage:', {
        size: settingsStr.length,
        enableSuperResolution: this.settings.image.enableSuperResolution
      });
      localStorage.setItem('neoview-settings', settingsStr);
      console.log('✅ 设置保存成功');
    } catch (err) {
      console.error('❌ saveSettings failed:', err);
    }
  }

}

export const settingsManager = SettingsManager.getInstance();

// 性能配置便捷访问器
export class PerformanceSettings {
  private manager: SettingsManager;
  private wrappedCallbacks = new Map<(preLoadSize: number, maxThreads: number) => void, (s: NeoViewSettings) => void>();
  
  constructor(manager: SettingsManager) {
    this.manager = manager;
  }

  get preLoadSize(): number {
    return this.manager.getSettings().performance.preLoadSize;
  }

  get maxThreads(): number {
    return this.manager.getSettings().performance.maxThreads;
  }

  updatePreLoadSize(value: number) {
    this.manager.updateNestedSettings('performance', { preLoadSize: value });
  }

  updateMaxThreads(value: number) {
    this.manager.updateNestedSettings('performance', { maxThreads: value });
  }

  addListener(callback: (preLoadSize: number, maxThreads: number) => void) {
    const wrappedCallback = (settings: NeoViewSettings) => {
      callback(settings.performance.preLoadSize, settings.performance.maxThreads);
    };
    
    // 保存包装后的回调引用
    this.wrappedCallbacks.set(callback, wrappedCallback);
    this.manager.addListener(wrappedCallback);
  }

  removeListener(callback: (preLoadSize: number, maxThreads: number) => void) {
    const wrappedCallback = this.wrappedCallbacks.get(callback);
    if (wrappedCallback) {
      this.manager.removeListener(wrappedCallback);
      this.wrappedCallbacks.delete(callback);
    }
  }
}

export const performanceSettings = new PerformanceSettings(settingsManager);
