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
  };
  image: {
    supportedFormats: string[];
    preloadCount: number;
    enableSuperResolution: boolean;
    superResolutionModel: string | null;
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
    multiThreadedRendering: true
  },
  image: {
    supportedFormats: ['jpg', 'png', 'webp', 'avif', 'jxl'],
    preloadCount: 2,
    enableSuperResolution: false,
    superResolutionModel: null
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
    this.settings[category] = { ...this.settings[category], ...updates } as NeoViewSettings[K];
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
      let cfg: any = null;
      if (data.format && data.config) {
        cfg = data.config;
      } else {
        // try direct object
        cfg = data;
      }
      // Basic validation: must have system and view
      if (!cfg || !cfg.system || !cfg.view) throw new Error('配置格式不完整');
      // merge with defaults to ensure fields exist
      this.settings = { ...defaultSettings, ...cfg } as NeoViewSettings;
      this.saveSettings();
      this.notifyListeners();
      return true;
    } catch (err) {
      console.error('importSettings error', err);
      return false;
    }
  }

  addListener(cb: (s: NeoViewSettings) => void) {
    this.listeners.add(cb);
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
      }
    } catch (err) {
      console.warn('loadSettings failed', err);
      this.settings = { ...defaultSettings };
    }
  }

  private saveSettings() {
    try {
      localStorage.setItem('neoview-settings', JSON.stringify(this.settings));
    } catch (err) {
      console.warn('saveSettings failed', err);
    }
  }
}

export const settingsManager = SettingsManager.getInstance();
