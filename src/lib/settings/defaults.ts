/**
 * NeoView 默认设置
 * 从 settingsManager.ts 提取
 */

import type { NeoViewSettings } from './types';

export const defaultSettings: NeoViewSettings = {
  system: {
    language: 'zh-CN',
    hardwareAcceleration: true,
    temporaryDirectory: '',
    thumbnailDirectory: 'D\\temp\\neoview',
    excludedPaths: []
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
    hoverScrollSpeed: 2.0, // 默认 2 倍速
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
      singleLastPageMode: 'restoreOrDefault',
      widePageStretch: 'uniformHeight'
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
      enableBoundaryToast: true,
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
      mode: 'standard', // 默认使用标准模式（CurrentFrameLayer）
      useViewerJS: false // ViewerJS 增强模式默认关闭
    },
    sidebarControl: {
      enabled: true, // 默认启用边栏浮动控制器
      position: { x: 100, y: 100 }
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
    settingsOpacity: 85,
    settingsBlur: 12,
    hoverAreas: {
      topTriggerHeight: 32,
      bottomTriggerHeight: 32,
      leftTriggerWidth: 32,
      rightTriggerWidth: 32
    },
    autoHideTiming: {
      showDelaySec: 0.0,
      hideDelaySec: 0.0
    },
    pageListFollowProgress: true,
    progressBarGlow: false
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
