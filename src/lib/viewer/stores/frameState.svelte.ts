/**
 * 帧状态管理
 */
import { SvelteMap } from 'svelte/reactivity';
import type { Frame, FrameImage, LayoutMode, ReadingDirection } from '../types/frame';
import { emptyFrame, createFrame, createFrameImage } from '../types/frame';

/** 帧缓存 */
interface FrameCache {
  /** 当前帧 */
  current: Frame;
  /** 上一帧 */
  prev: Frame;
  /** 下一帧 */
  next: Frame;
  /** 超分帧 */
  upscaled: Frame;
  /** 预加载帧映射 (索引 -> 帧) */
  preloaded: SvelteMap<number, Frame>;
}

/** 帧状态 */
interface FrameState {
  /** 帧缓存 */
  cache: FrameCache;
  /** 当前索引 */
  currentIndex: number;
  /** 布局模式 */
  layout: LayoutMode;
  /** 阅读方向 */
  direction: ReadingDirection;
  /** 是否横向分割 */
  divideLandscape: boolean;
  /** 分割状态 (用于横向图分割翻页) */
  splitState: 'left' | 'right' | null;
}

/** 默认帧缓存 */
const defaultCache: FrameCache = {
  current: { ...emptyFrame },
  prev: { ...emptyFrame },
  next: { ...emptyFrame },
  upscaled: { ...emptyFrame },
  preloaded: new SvelteMap(),
};

/** 默认帧状态 */
const defaultState: FrameState = {
  cache: { ...defaultCache },
  currentIndex: 0,
  layout: 'single',
  direction: 'ltr',
  divideLandscape: false,
  splitState: null,
};

/** 创建帧状态管理器 */
export function createFrameState() {
  let state = $state<FrameState>({
    ...defaultState,
    cache: {
      current: { ...emptyFrame },
      prev: { ...emptyFrame },
      next: { ...emptyFrame },
      upscaled: { ...emptyFrame },
      preloaded: new SvelteMap(),
    },
  });

  return {
    // === Getters ===
    get currentFrame() { return state.cache.current; },
    get prevFrame() { return state.cache.prev; },
    get nextFrame() { return state.cache.next; },
    get upscaledFrame() { return state.cache.upscaled; },
    get preloadedFrames() { return state.cache.preloaded; },
    get currentIndex() { return state.currentIndex; },
    get layout() { return state.layout; },
    get direction() { return state.direction; },
    get divideLandscape() { return state.divideLandscape; },
    get splitState() { return state.splitState; },
    get state() { return state; },

    // === Setters ===
    setCurrentFrame(frame: Frame) {
      state.cache.current = frame;
    },

    setPrevFrame(frame: Frame) {
      state.cache.prev = frame;
    },

    setNextFrame(frame: Frame) {
      state.cache.next = frame;
    },

    setUpscaledFrame(frame: Frame) {
      state.cache.upscaled = frame;
    },

    setPreloadedFrame(index: number, frame: Frame) {
      state.cache.preloaded.set(index, frame);
    },

    removePreloadedFrame(index: number) {
      state.cache.preloaded.delete(index);
    },

    clearPreloadedFrames() {
      state.cache.preloaded.clear();
    },

    setCurrentIndex(index: number) {
      state.currentIndex = index;
    },

    setLayout(layout: LayoutMode) {
      state.layout = layout;
    },

    setDirection(direction: ReadingDirection) {
      state.direction = direction;
    },

    setDivideLandscape(enabled: boolean) {
      state.divideLandscape = enabled;
    },

    setSplitState(split: 'left' | 'right' | null) {
      state.splitState = split;
    },

    // === Actions ===
    /** 更新当前帧图像 */
    updateCurrentFrameImage(
      url: string,
      physicalIndex: number,
      virtualIndex: number,
      options: Partial<Omit<FrameImage, 'url' | 'physicalIndex' | 'virtualIndex'>> = {}
    ) {
      const image = createFrameImage(url, physicalIndex, virtualIndex, options);
      state.cache.current = createFrame(
        `frame-${virtualIndex}`,
        [image],
        state.layout,
        state.direction
      );
    },

    /** 更新双页帧图像 */
    updateDoubleFrameImages(
      images: Array<{
        url: string;
        physicalIndex: number;
        virtualIndex: number;
        options?: Partial<Omit<FrameImage, 'url' | 'physicalIndex' | 'virtualIndex'>>;
      }>
    ) {
      const frameImages = images.map(img =>
        createFrameImage(img.url, img.physicalIndex, img.virtualIndex, img.options || {})
      );
      state.cache.current = createFrame(
        `frame-double-${images[0]?.virtualIndex ?? 0}`,
        frameImages,
        'double',
        state.direction
      );
    },

    /** 更新超分帧 */
    updateUpscaledImage(url: string, physicalIndex: number, virtualIndex: number) {
      const image = createFrameImage(url, physicalIndex, virtualIndex, { loaded: true });
      state.cache.upscaled = createFrame(
        `upscaled-${virtualIndex}`,
        [image],
        state.layout,
        state.direction
      );
    },

    /** 清除超分帧 */
    clearUpscaledFrame() {
      state.cache.upscaled = { ...emptyFrame };
    },

    /** 处理翻页 - 考虑分割状态 */
    handleNextPage(isCurrentLandscape: boolean, isNextLandscape: boolean): 'split' | 'navigate' {
      if (state.divideLandscape && isCurrentLandscape) {
        if (state.splitState === 'left') {
          state.splitState = 'right';
          return 'split';
        }
      }
      state.splitState = state.divideLandscape && isNextLandscape ? 'left' : null;
      return 'navigate';
    },

    /** 处理上一页 - 考虑分割状态 */
    handlePrevPage(isCurrentLandscape: boolean, isPrevLandscape: boolean): 'split' | 'navigate' {
      if (state.divideLandscape && isCurrentLandscape) {
        if (state.splitState === 'right') {
          state.splitState = 'left';
          return 'split';
        }
      }
      state.splitState = state.divideLandscape && isPrevLandscape ? 'right' : null;
      return 'navigate';
    },

    /** 切换帧 (用于翻页动画) */
    swapFrames(direction: 'next' | 'prev') {
      if (direction === 'next') {
        state.cache.prev = state.cache.current;
        state.cache.current = state.cache.next;
        state.cache.next = { ...emptyFrame };
      } else {
        state.cache.next = state.cache.current;
        state.cache.current = state.cache.prev;
        state.cache.prev = { ...emptyFrame };
      }
      state.cache.upscaled = { ...emptyFrame };
    },

    /** 重置状态 */
    reset() {
      state = {
        ...defaultState,
        cache: {
          current: { ...emptyFrame },
          prev: { ...emptyFrame },
          next: { ...emptyFrame },
          upscaled: { ...emptyFrame },
          preloaded: new SvelteMap(),
        },
      };
    },
  };
}

/** 全局帧状态实例 */
export const frameState = createFrameState();
