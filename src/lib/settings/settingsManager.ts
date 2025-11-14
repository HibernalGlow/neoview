/**
 * Minimal Settings Manager for NeoView
 * 提供：获取/更新/重置/导入/导出/订阅 功能，持久化到 localStorage
 */

export type ZoomMode = 'fit' | 'fitWidth' | 'fitHeight' | 'original';

export interface NeoViewSettings {
  system: {
    language: string;
    hardwareAcceleration: boolean;
    temporaryDirectory: string;
  };
  startup: {
    openLastFile: boolean;
    minimizeToTray: boolean;
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
    useCachedFirst: boolean;
  };
  view: {
    defaultZoomMode: ZoomMode;
    showGrid: boolean;
    showInfoBar: boolean;
    backgroundColor: string;
    mouseCursor: {
      autoHide: boolean;
      hideDelay: number; // seconds
      showMovementThreshold: number; // pixels
      showOnButtonClick: boolean;
    };
  };
  book: {
    autoPageTurnInterval: number;
    preloadPages: number;
    rememberProgress: boolean;
    doublePageView: boolean;
  };
  theme: {
    theme: 'system' | 'light' | 'dark';
    fontSize: 'small' | 'medium' | 'large';
    uiScale: number;
  };
  panels: {
    leftSidebarVisible: boolean;
    rightSidebarVisible: boolean;
    bottomPanelVisible: boolean;
    autoHideToolbar: boolean;
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
    temporaryDirectory: ''
  },
  startup: {
    openLastFile: true,
    minimizeToTray: false
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
    useCachedFirst: true
  },
  view: {
    defaultZoomMode: 'fit',
    showGrid: false,
    showInfoBar: true,
    backgroundColor: '#000000',
    mouseCursor: {
      autoHide: true,
      hideDelay: 1.0,
      showMovementThreshold: 26,
      showOnButtonClick: true
    }
  },
  book: {
    autoPageTurnInterval: 3,
    preloadPages: 2,
    rememberProgress: true,
    doublePageView: false
  },
  theme: {
    theme: 'system',
    fontSize: 'medium',
    uiScale: 1.0
  },
  panels: {
    leftSidebarVisible: true,
    rightSidebarVisible: false,
    bottomPanelVisible: false,
    autoHideToolbar: true
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

export class SettingsManager {
  private static instance: SettingsManager;
  private settings: NeoViewSettings = { ...defaultSettings };
  private listeners: Set<(s: NeoViewSettings) => void> = new Set();

  private constructor() {
    this.loadSettings();
  }

  static getInstance() {
    if (!SettingsManager.instance) SettingsManager.instance = new SettingsManager();
    return SettingsManager.instance;
  }

  getSettings(): NeoViewSettings {
    return JSON.parse(JSON.stringify(this.settings));
  }

  updateSettings(updates: Partial<NeoViewSettings>) {
    this.settings = { ...this.settings, ...updates } as NeoViewSettings;
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
      
      // 深合并 image 子对象，确保新字段不会被覆盖
      const mergedImage = {
        ...defaultSettings.image,
        ...cfg.image,
        // 显式补齐新字段，确保导入旧配置时不会丢失
        currentImageUpscaleEnabled: cfg.image?.currentImageUpscaleEnabled ?? defaultSettings.image.currentImageUpscaleEnabled,
        useCachedFirst: cfg.image?.useCachedFirst ?? defaultSettings.image.useCachedFirst
      };
      
      // 合并其他设置
      this.settings = {
        ...defaultSettings,
        ...cfg,
        image: mergedImage
      } as NeoViewSettings;
      
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

  private loadSettings() {
    try {
      const raw = localStorage.getItem('neoview-settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        this.settings = { ...defaultSettings, ...parsed };
        console.log('📂 从 localStorage 加载设置:', {
          enableSuperResolution: this.settings.image.enableSuperResolution
        });
      } else {
        console.log('📂 localStorage 中没有设置，使用默认值');
      }
    } catch (err) {
      console.error('❌ loadSettings failed:', err);
      this.settings = { ...defaultSettings };
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
