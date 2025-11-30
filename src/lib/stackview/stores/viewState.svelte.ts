/**
 * StackView 视图状态管理
 * 分离页面模式和全景模式，支持独立切换
 */

// ============================================================================
// 类型定义
// ============================================================================

/** 页面模式：单页或双页 */
export type PageMode = 'single' | 'double';

/** 滚动模式：普通（单帧）或全景（多帧滚动） */
export type ScrollMode = 'normal' | 'panorama';

/** 布局方向 */
export type Orientation = 'horizontal' | 'vertical';

/** 阅读方向 */
export type Direction = 'ltr' | 'rtl';

/** 视图状态 */
export interface ViewState {
  /** 页面模式 */
  pageMode: PageMode;
  /** 滚动模式 */
  scrollMode: ScrollMode;
  /** 布局方向 */
  orientation: Orientation;
  /** 阅读方向 */
  direction: Direction;
}

/** 帧单元：包含一个或两个页面 */
export interface FrameUnit {
  /** 帧 ID */
  id: string;
  /** 主图片 URL */
  primaryUrl: string;
  /** 主图片页面索引 */
  primaryIndex: number;
  /** 副图片 URL（双页模式） */
  secondaryUrl?: string;
  /** 副图片页面索引 */
  secondaryIndex?: number;
}

// ============================================================================
// 创建视图状态 Store
// ============================================================================

export function createViewState() {
  const state = $state<ViewState>({
    pageMode: 'single',
    scrollMode: 'normal',
    orientation: 'horizontal',
    direction: 'ltr',
  });
  
  function setPageMode(mode: PageMode) {
    state.pageMode = mode;
  }
  
  function setScrollMode(mode: ScrollMode) {
    state.scrollMode = mode;
  }
  
  function setOrientation(orientation: Orientation) {
    state.orientation = orientation;
  }
  
  function setDirection(direction: Direction) {
    state.direction = direction;
  }
  
  function togglePageMode() {
    state.pageMode = state.pageMode === 'single' ? 'double' : 'single';
  }
  
  function toggleScrollMode() {
    state.scrollMode = state.scrollMode === 'normal' ? 'panorama' : 'normal';
  }
  
  function toggleOrientation() {
    state.orientation = state.orientation === 'horizontal' ? 'vertical' : 'horizontal';
  }
  
  // 计算每次翻页的步进
  function getPageStep(): number {
    return state.pageMode === 'double' ? 2 : 1;
  }
  
  // 判断是否全景模式
  function isPanorama(): boolean {
    return state.scrollMode === 'panorama';
  }
  
  // 判断是否双页模式
  function isDoublePage(): boolean {
    return state.pageMode === 'double';
  }
  
  return {
    get state() { return state; },
    setPageMode,
    setScrollMode,
    setOrientation,
    setDirection,
    togglePageMode,
    toggleScrollMode,
    toggleOrientation,
    getPageStep,
    isPanorama,
    isDoublePage,
  };
}

// 单例
let viewState: ReturnType<typeof createViewState> | null = null;

export function getViewState() {
  if (!viewState) {
    viewState = createViewState();
  }
  return viewState;
}
