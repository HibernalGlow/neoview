/**
 * StackViewer 状态管理
 */
import type { Transform } from '../types/transform';
import type { LayoutMode, ReadingDirection } from '../types/frame';
import { defaultTransform, resetTransform } from '../types/transform';

/** 查看器状态 */
interface ViewerState {
  /** 是否打开 */
  isOpen: boolean;
  /** 当前布局模式 */
  layout: LayoutMode;
  /** 阅读方向 */
  direction: ReadingDirection;
  /** 当前页索引 */
  currentIndex: number;
  /** 总页数 */
  totalPages: number;
  /** 变换状态 */
  transform: Transform;
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 是否为视频模式 */
  isVideoMode: boolean;
  /** 是否启用横向分割 */
  divideLandscape: boolean;
  /** 是否启用自动旋转 */
  autoRotate: boolean;
  /** 背景颜色 */
  backgroundColor: string;
  /** 是否显示信息层 */
  showInfo: boolean;
  /** 是否显示进度条 */
  showProgress: boolean;
}

/** 默认状态 */
const defaultState: ViewerState = {
  isOpen: false,
  layout: 'single',
  direction: 'ltr',
  currentIndex: 0,
  totalPages: 0,
  transform: { ...defaultTransform },
  loading: false,
  error: null,
  isVideoMode: false,
  divideLandscape: false,
  autoRotate: false,
  backgroundColor: '#000000',
  showInfo: true,
  showProgress: true,
};

/** 创建查看器状态管理器 */
export function createViewerState() {
  let state = $state<ViewerState>({ ...defaultState });

  return {
    // === Getters ===
    get isOpen() { return state.isOpen; },
    get layout() { return state.layout; },
    get direction() { return state.direction; },
    get currentIndex() { return state.currentIndex; },
    get totalPages() { return state.totalPages; },
    get transform() { return state.transform; },
    get loading() { return state.loading; },
    get error() { return state.error; },
    get isVideoMode() { return state.isVideoMode; },
    get divideLandscape() { return state.divideLandscape; },
    get autoRotate() { return state.autoRotate; },
    get backgroundColor() { return state.backgroundColor; },
    get showInfo() { return state.showInfo; },
    get showProgress() { return state.showProgress; },
    get state() { return state; },

    // === Setters ===
    setOpen(isOpen: boolean) {
      state.isOpen = isOpen;
    },

    setLayout(layout: LayoutMode) {
      state.layout = layout;
    },

    setDirection(direction: ReadingDirection) {
      state.direction = direction;
    },

    setCurrentIndex(index: number) {
      state.currentIndex = Math.max(0, Math.min(index, state.totalPages - 1));
    },

    setTotalPages(total: number) {
      state.totalPages = total;
      if (state.currentIndex >= total) {
        state.currentIndex = Math.max(0, total - 1);
      }
    },

    setTransform(transform: Partial<Transform>) {
      state.transform = { ...state.transform, ...transform };
    },

    resetTransform() {
      state.transform = resetTransform();
    },

    setLoading(loading: boolean) {
      state.loading = loading;
    },

    setError(error: string | null) {
      state.error = error;
    },

    setVideoMode(isVideoMode: boolean) {
      state.isVideoMode = isVideoMode;
    },

    setDivideLandscape(enabled: boolean) {
      state.divideLandscape = enabled;
    },

    setAutoRotate(enabled: boolean) {
      state.autoRotate = enabled;
    },

    setBackgroundColor(color: string) {
      state.backgroundColor = color;
    },

    setShowInfo(show: boolean) {
      state.showInfo = show;
    },

    setShowProgress(show: boolean) {
      state.showProgress = show;
    },

    // === Actions ===
    /** 下一页 */
    nextPage(): boolean {
      if (state.currentIndex < state.totalPages - 1) {
        state.currentIndex++;
        return true;
      }
      return false;
    },

    /** 上一页 */
    prevPage(): boolean {
      if (state.currentIndex > 0) {
        state.currentIndex--;
        return true;
      }
      return false;
    },

    /** 跳转到指定页 */
    goToPage(index: number): boolean {
      if (index >= 0 && index < state.totalPages) {
        state.currentIndex = index;
        return true;
      }
      return false;
    },

    /** 缩放 */
    zoom(factor: number) {
      const newScale = Math.max(0.1, Math.min(10, state.transform.scale * factor));
      state.transform = { ...state.transform, scale: newScale };
    },

    /** 设置缩放 */
    setScale(scale: number) {
      state.transform = { ...state.transform, scale: Math.max(0.1, Math.min(10, scale)) };
    },

    /** 平移 */
    pan(deltaX: number, deltaY: number) {
      state.transform = {
        ...state.transform,
        offsetX: state.transform.offsetX + deltaX,
        offsetY: state.transform.offsetY + deltaY,
      };
    },

    /** 旋转 */
    rotate(angle: 90 | -90) {
      const newRotation = ((state.transform.rotation + angle + 360) % 360) as 0 | 90 | 180 | 270;
      state.transform = { ...state.transform, rotation: newRotation };
    },

    /** 重置状态 */
    reset() {
      state = { ...defaultState };
    },
  };
}

/** 全局查看器状态实例 */
export const viewerState = createViewerState();
