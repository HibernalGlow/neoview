/**
 * Stack 渲染器状态监控
 * 用于监控 StackViewer 的三层栈状态和翻页变化
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface SlotInfo {
  position: 'prev' | 'current' | 'next';
  pageIndex: number | null;
  url: string | null;
  loaded: boolean;
  dimensions: { width: number; height: number } | null;
}

export interface StackMonitorInfo {
  /** 是否启用层叠模式 */
  enabled: boolean;
  /** 当前页索引 */
  currentPageIndex: number;
  /** 总页数 */
  totalPages: number;
  /** 三个槽位的状态 */
  slots: {
    prev: SlotInfo;
    current: SlotInfo;
    next: SlotInfo;
  };
  /** 翻页历史 */
  navigationHistory: Array<{
    timestamp: number;
    direction: 'forward' | 'backward' | 'jump';
    fromPage: number;
    toPage: number;
  }>;
  /** 预加载命中率 */
  preloadHitRate: number;
  /** 翻页总次数 */
  totalNavigations: number;
  /** 预加载命中次数 */
  preloadHits: number;
}

// ============================================================================
// 默认值
// ============================================================================

function createEmptySlot(position: 'prev' | 'current' | 'next'): SlotInfo {
  return {
    position,
    pageIndex: null,
    url: null,
    loaded: false,
    dimensions: null,
  };
}

function createInitialInfo(): StackMonitorInfo {
  return {
    enabled: false,
    currentPageIndex: 0,
    totalPages: 0,
    slots: {
      prev: createEmptySlot('prev'),
      current: createEmptySlot('current'),
      next: createEmptySlot('next'),
    },
    navigationHistory: [],
    preloadHitRate: 0,
    totalNavigations: 0,
    preloadHits: 0,
  };
}

// ============================================================================
// 响应式状态
// ============================================================================

let _info = $state<StackMonitorInfo>(createInitialInfo());
let _monitorEnabled = $state(false);
let _lastUpdate = $state(0);
let _updateCount = $state(0);

// 计算更新频率
const _updateFrequency = $derived.by(() => {
  const now = Date.now();
  const elapsed = (now - _lastUpdate) / 1000;
  if (elapsed <= 0) return 0;
  return _updateCount / Math.max(elapsed, 1);
});

// ============================================================================
// 导出的响应式对象
// ============================================================================

export const stackMonitor = {
  get info() { return _info; },
  get enabled() { return _monitorEnabled; },
  get updateFrequency() { return _updateFrequency; },
};

// ============================================================================
// 更新函数
// ============================================================================

/**
 * 启用/禁用监控
 */
export function setStackMonitorEnabled(enabled: boolean): void {
  _monitorEnabled = enabled;
  if (enabled) {
    _lastUpdate = Date.now();
    _updateCount = 0;
  }
}

/**
 * 更新 Stack 状态
 */
export function updateStackState(info: Partial<StackMonitorInfo>): void {
  if (!_monitorEnabled) return;
  
  _info = {
    ..._info,
    ...info,
  };
  _updateCount++;
}

/**
 * 更新槽位状态
 */
export function updateSlotState(
  position: 'prev' | 'current' | 'next',
  slot: Partial<SlotInfo>
): void {
  if (!_monitorEnabled) return;
  
  _info.slots[position] = {
    ..._info.slots[position],
    ...slot,
  };
  _updateCount++;
}

/**
 * 记录翻页事件
 */
export function recordNavigation(
  direction: 'forward' | 'backward' | 'jump',
  fromPage: number,
  toPage: number,
  wasPreloaded: boolean
): void {
  if (!_monitorEnabled) return;
  
  _info.totalNavigations++;
  if (wasPreloaded) {
    _info.preloadHits++;
  }
  _info.preloadHitRate = _info.totalNavigations > 0 
    ? (_info.preloadHits / _info.totalNavigations) * 100 
    : 0;
  
  // 添加到历史记录（保留最近 20 条）
  _info.navigationHistory = [
    {
      timestamp: Date.now(),
      direction,
      fromPage,
      toPage,
    },
    ..._info.navigationHistory.slice(0, 19),
  ];
  
  _updateCount++;
}

/**
 * 重置统计
 */
export function resetStackStats(): void {
  _info = createInitialInfo();
  _info.enabled = _monitorEnabled;
  _updateCount = 0;
  _lastUpdate = Date.now();
}
