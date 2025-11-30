/**
 * 视图状态管理 - 方案 B
 * 分离 pageMode 和 panoramaEnabled，支持所有组合
 */

// ============================================================================
// 类型定义
// ============================================================================

/** 页面模式：单页或双页 */
export type PageMode = 'single' | 'double';

/** 布局方向 */
export type Orientation = 'horizontal' | 'vertical';

/** 阅读方向 */
export type Direction = 'ltr' | 'rtl';

// ============================================================================
// 状态
// ============================================================================

/** 页面模式 */
let pageMode = $state<PageMode>('single');

/** 全景模式开关 */
let panoramaEnabled = $state<boolean>(false);

/** 布局方向 */
let orientation = $state<Orientation>('horizontal');

/** 阅读方向 */
let direction = $state<Direction>('ltr');

// ============================================================================
// Getters
// ============================================================================

export function getPageMode(): PageMode {
  return pageMode;
}

export function isPanoramaEnabled(): boolean {
  return panoramaEnabled;
}

export function getOrientation(): Orientation {
  return orientation;
}

export function getDirection(): Direction {
  return direction;
}

// ============================================================================
// Setters
// ============================================================================

export function setPageMode(mode: PageMode) {
  pageMode = mode;
}

export function setPanoramaEnabled(enabled: boolean) {
  panoramaEnabled = enabled;
}

export function setOrientation(o: Orientation) {
  orientation = o;
}

export function setDirection(d: Direction) {
  direction = d;
}

// ============================================================================
// Toggles
// ============================================================================

export function togglePageMode() {
  pageMode = pageMode === 'single' ? 'double' : 'single';
}

export function togglePanorama() {
  panoramaEnabled = !panoramaEnabled;
}

export function toggleOrientation() {
  orientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
}

// ============================================================================
// 计算值
// ============================================================================

/** 每次翻页的步进 */
export function getPageStep(): number {
  return pageMode === 'double' ? 2 : 1;
}

// ============================================================================
// 响应式状态对象（供组件使用）
// ============================================================================

export const viewState = {
  get pageMode() { return pageMode; },
  get panoramaEnabled() { return panoramaEnabled; },
  get orientation() { return orientation; },
  get direction() { return direction; },
  get pageStep() { return getPageStep(); },
  
  setPageMode,
  setPanoramaEnabled,
  setOrientation,
  setDirection,
  togglePageMode,
  togglePanorama,
  toggleOrientation,
};
