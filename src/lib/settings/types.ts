/**
 * NeoView 设置类型定义
 * 从 settingsManager.ts 提取
 */

export type ZoomMode = 'fit' | 'fill' | 'fitWidth' | 'fitHeight' | 'original' | 'fitLeftAlign' | 'fitRightAlign';
export type ReadingDirection = 'left-to-right' | 'right-to-left';
export type TailOverflowBehavior =
  | 'doNothing'
  | 'stayOnLastPage'
  | 'nextBook'
  | 'loopTopBottom'
  | 'seamlessLoop';

export type BookSettingSelectMode = 'default' | 'continue' | 'restoreOrDefault' | 'restoreOrContinue';

export type AutoRotateMode = 'none' | 'left' | 'right' | 'horizontalLeft' | 'horizontalRight' | 'forcedLeft' | 'forcedRight';

/** 渲染器模式：standard = 标准模式（CurrentFrameLayer） */
export type RendererMode = 'standard';

/** 宽页拉伸模式：双页模式下不同尺寸图片的对齐方式 */
export type WidePageStretch = 'none' | 'uniformHeight' | 'uniformWidth';

export interface NeoViewSettings {
  system: {
    language: string;
    hardwareAcceleration: boolean;
    temporaryDirectory: string;
    thumbnailDirectory: string;
    /** 排除路径列表（不扫描这些路径的元数据） */
    excludedPaths?: string[];
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
    hoverScrollSpeed: number; // 悬停滚动倍率 (0.5-5.0)
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
    backgroundMode: 'solid' | 'auto' | 'ambient';
    /** 流光溢彩设置 */
    ambient?: {
      /** 动画速度（秒） */
      speed: number;
      /** 模糊程度（px） */
      blur: number;
      /** 透明度 (0-1) */
      opacity: number;
      /** 样式：gentle 柔和 | vibrant 鲜艳 | dynamic 动感 */
      style: 'gentle' | 'vibrant' | 'dynamic';
    };
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
      /** 宽页拉伸模式（双页模式下的对齐方式） */
      widePageStretch: WidePageStretch;
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
      enableBoundaryToast: boolean;
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
    /** 边栏浮动控制器设置 */
    sidebarControl?: {
      enabled: boolean;
      position: { x: number; y: number };
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
    /** 设置界面透明度 0-100 */
    settingsOpacity: number;
    /** 设置界面模糊程度 0-20 */
    settingsBlur: number;
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
    /** 页面列表是否跟随底部进度条跳转 */
    pageListFollowProgress: boolean;
    /** 进度条荧光闪烁效果（避免画面完全静止） */
    progressBarGlow: boolean;
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
  /** 字幕设置 */
  subtitle?: {
    fontSize: number; // em 单位
    color: string;
    bgOpacity: number; // 0-1
    bottom: number; // 底部距离百分比
  };
  // 兼容旧版扁平化字段
  subtitleFontSize?: number;
  subtitleColor?: string;
  subtitleBgOpacity?: number;
  subtitleBottom?: number;
}
