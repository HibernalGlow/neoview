/**
 * BookStore2 - 基于新架构的书籍状态管理
 * 
 * 使用 Svelte 5 Runes 风格的响应式状态
 * 集成 BookManager 提供完整的书籍操作
 */

import { writable, derived, get } from 'svelte/store';
import { BookManager } from '../core/bookManager';
import type { BookManagerEvents } from '../core/bookManager';
import type { 
  VirtualPage, 
  PageFrame, 
  PhysicalPage,
  ViewState,
} from '../core/types';
import { ViewerController } from '../core/viewerController';
import type { ViewerControllerEvents } from '../core/viewerController';

// ============================================================================
// 类型定义
// ============================================================================

export interface BookStoreState {
  // 书籍信息
  isOpen: boolean;
  bookPath: string;
  bookName: string;
  isArchive: boolean;
  
  // 页面信息
  physicalPageCount: number;
  virtualPageCount: number;
  currentIndex: number;
  currentFrame: PageFrame | null;
  
  // 视图状态
  viewState: ViewState;
  
  // 加载状态
  isLoading: boolean;
  loadProgress: number;
  
  // 设置
  divideLandscape: boolean;
  autoRotate: boolean;
  pageMode: 'single' | 'wide';
  readOrder: 'ltr' | 'rtl';
  sortMode: string;
}

// ============================================================================
// 初始状态
// ============================================================================

const initialState: BookStoreState = {
  isOpen: false,
  bookPath: '',
  bookName: '',
  isArchive: false,
  physicalPageCount: 0,
  virtualPageCount: 0,
  currentIndex: 0,
  currentFrame: null,
  viewState: {
    mode: 'normal',
    scale: 1,
    rotation: 0,
    offset: { x: 0, y: 0 },
    panoramaOffset: 0,
    loupeCenter: { x: 0, y: 0 },
    loupeScale: 2,
  },
  isLoading: false,
  loadProgress: 0,
  divideLandscape: false,
  autoRotate: false,
  pageMode: 'single',
  readOrder: 'rtl',
  sortMode: 'entry',
};

// ============================================================================
// Store 创建
// ============================================================================

function createBookStore() {
  // 核心状态
  const state = writable<BookStoreState>(initialState);
  
  // 管理器实例
  let bookManager: BookManager | null = null;
  let viewerController: ViewerController | null = null;
  
  // 初始化管理器
  function initManagers() {
    if (bookManager) return;
    
    bookManager = new BookManager({
      virtualPageList: {
        divideLandscape: get(state).divideLandscape,
        pageMode: get(state).pageMode,
        readOrder: get(state).readOrder,
      },
      pageFrame: {
        framePageSize: get(state).pageMode === 'single' ? 1 : 2,
        readOrder: get(state).readOrder,
      },
    });
    
    viewerController = new ViewerController();
    
    // 设置事件
    const bookEvents: BookManagerEvents = {
      onBookOpen: (info) => {
        state.update(s => ({
          ...s,
          isOpen: true,
          bookPath: info.path,
          bookName: info.name,
          isArchive: info.isArchive,
          physicalPageCount: info.physicalPageCount,
          virtualPageCount: info.virtualPageCount,
          currentIndex: info.currentIndex,
          currentFrame: info.currentFrame,
          isLoading: false,
        }));
      },
      onBookClose: () => {
        state.update(s => ({
          ...s,
          ...initialState,
        }));
      },
      onPageChange: (index, frame) => {
        state.update(s => ({
          ...s,
          currentIndex: index,
          currentFrame: frame,
        }));
      },
      onPagesRebuilt: () => {
        if (!bookManager) return;
        const info = bookManager.getBookInfo();
        state.update(s => ({
          ...s,
          physicalPageCount: info.physicalPageCount,
          virtualPageCount: info.virtualPageCount,
          currentIndex: info.currentIndex,
          currentFrame: info.currentFrame,
        }));
      },
      onLoadProgress: (loaded, total) => {
        state.update(s => ({
          ...s,
          loadProgress: total > 0 ? loaded / total : 0,
        }));
      },
    };
    
    const viewerEvents: ViewerControllerEvents = {
      onStateChange: (viewState) => {
        state.update(s => ({
          ...s,
          viewState,
        }));
      },
    };
    
    bookManager.setEvents(bookEvents);
    viewerController.setEvents(viewerEvents);
  }
  
  // ============================================================================
  // 公共 API
  // ============================================================================
  
  return {
    subscribe: state.subscribe,
    
    /**
     * 设置加载函数
     */
    setLoadFunctions: (
      loadImage: (virtualPage: VirtualPage, signal: AbortSignal) => Promise<Blob>,
      loadThumbnail: (virtualPage: VirtualPage, signal: AbortSignal) => Promise<Blob>,
      upscaleImage?: (virtualPage: VirtualPage, imageBlob: Blob, signal: AbortSignal) => Promise<Blob>
    ) => {
      initManagers();
      bookManager!.setLoadFunctions(loadImage, loadThumbnail, upscaleImage);
    },
    
    /**
     * 打开书籍
     */
    openBook: async (
      path: string,
      files: Array<{
        path: string;
        name: string;
        size: number;
        lastModified: number;
        width?: number;
        height?: number;
      }>,
      options?: {
        isArchive?: boolean;
        startIndex?: number;
      }
    ) => {
      initManagers();
      state.update(s => ({ ...s, isLoading: true }));
      
      try {
        await bookManager!.openBook(path, files, options);
      } catch (error) {
        state.update(s => ({ ...s, isLoading: false }));
        throw error;
      }
    },
    
    /**
     * 关闭书籍
     */
    closeBook: () => {
      bookManager?.closeBook();
    },
    
    /**
     * 下一页
     */
    nextPage: (): boolean => {
      return bookManager?.nextPage() ?? false;
    },
    
    /**
     * 上一页
     */
    prevPage: (): boolean => {
      return bookManager?.prevPage() ?? false;
    },
    
    /**
     * 跳转到指定页
     */
    goToPage: (index: number) => {
      bookManager?.goToPage(index);
    },
    
    /**
     * 跳转到首页
     */
    goToFirst: () => {
      bookManager?.goToFirst();
    },
    
    /**
     * 跳转到末页
     */
    goToLast: () => {
      bookManager?.goToLast();
    },
    
    /**
     * 下一个文件夹
     */
    nextFolder: (): boolean => {
      return bookManager?.nextFolder() ?? false;
    },
    
    /**
     * 上一个文件夹
     */
    prevFolder: (): boolean => {
      return bookManager?.prevFolder() ?? false;
    },
    
    // ============================================================================
    // 设置
    // ============================================================================
    
    /**
     * 设置分割横向页面
     */
    setDivideLandscape: (enabled: boolean) => {
      state.update(s => ({ ...s, divideLandscape: enabled }));
      bookManager?.setDivideLandscape(enabled);
    },
    
    /**
     * 设置自动旋转横向页面
     */
    setAutoRotate: (enabled: boolean) => {
      state.update(s => ({ ...s, autoRotate: enabled }));
      bookManager?.setAutoRotate(enabled);
    },
    
    /**
     * 设置页面模式
     */
    setPageMode: (mode: 'single' | 'wide') => {
      state.update(s => ({ ...s, pageMode: mode }));
      bookManager?.setPageMode(mode);
    },
    
    /**
     * 设置阅读方向
     */
    setReadOrder: (order: 'ltr' | 'rtl') => {
      state.update(s => ({ ...s, readOrder: order }));
      bookManager?.setReadOrder(order);
    },
    
    /**
     * 设置排序模式
     */
    setSortMode: (mode: string) => {
      state.update(s => ({ ...s, sortMode: mode }));
      bookManager?.setSortMode(mode as 'entry' | 'entryDesc' | 'fileName' | 'fileNameDesc' | 'timestamp' | 'timestampDesc' | 'size' | 'sizeDesc' | 'random');
    },
    
    /**
     * 更新物理页面尺寸
     * 当异步加载图片后获取到真实尺寸时调用
     */
    updatePageSize: (physicalIndex: number, width: number, height: number) => {
      bookManager?.updatePageSize(physicalIndex, width, height);
    },
    
    /**
     * 批量更新物理页面尺寸
     */
    updatePageSizes: (updates: Array<{ index: number; width: number; height: number }>) => {
      bookManager?.updatePageSizes(updates);
    },
    
    // ============================================================================
    // 视图控制
    // ============================================================================
    
    /**
     * 设置容器尺寸
     */
    setContainerSize: (width: number, height: number) => {
      viewerController?.setContainerSize({ width, height });
    },
    
    /**
     * 设置内容尺寸
     */
    setContentSize: (width: number, height: number) => {
      viewerController?.setContentSize({ width, height });
    },
    
    /**
     * 缩放
     */
    zoom: (delta: number, centerX?: number, centerY?: number) => {
      const center = centerX !== undefined && centerY !== undefined
        ? { x: centerX, y: centerY }
        : undefined;
      viewerController?.zoom(delta, center);
    },
    
    /**
     * 缩放到指定比例
     */
    zoomTo: (scale: number) => {
      viewerController?.zoomTo(scale);
    },
    
    /**
     * 重置缩放
     */
    resetZoom: () => {
      viewerController?.resetZoom();
    },
    
    /**
     * 平移
     */
    pan: (deltaX: number, deltaY: number) => {
      viewerController?.pan({ x: deltaX, y: deltaY });
    },
    
    /**
     * 旋转
     */
    rotate: (angle: number) => {
      viewerController?.rotate(angle);
    },
    
    /**
     * 重置旋转
     */
    resetRotation: () => {
      viewerController?.resetRotation();
    },
    
    /**
     * 适应容器
     */
    fitToContainer: () => {
      viewerController?.fitToContainer();
    },
    
    /**
     * 设置视图模式
     */
    setViewMode: (mode: 'normal' | 'panorama' | 'loupe') => {
      viewerController?.setMode(mode);
    },
    
    /**
     * 全景滚动
     */
    panoramaScroll: (delta: number) => {
      viewerController?.panoramaScroll(delta);
    },
    
    /**
     * 放大镜移动
     */
    loupeMove: (x: number, y: number) => {
      viewerController?.loupeMove({ x, y });
    },
    
    /**
     * 开始拖拽
     */
    startDrag: (x: number, y: number) => {
      viewerController?.startDrag({ x, y });
    },
    
    /**
     * 拖拽中
     */
    drag: (x: number, y: number) => {
      viewerController?.drag({ x, y });
    },
    
    /**
     * 结束拖拽
     */
    endDrag: () => {
      viewerController?.endDrag();
    },
    
    // ============================================================================
    // 数据访问
    // ============================================================================
    
    /**
     * 获取虚拟页面
     */
    getVirtualPage: (index: number): VirtualPage | null => {
      return bookManager?.getVirtualPage(index) ?? null;
    },
    
    /**
     * 获取物理页面
     */
    getPhysicalPage: (index: number): PhysicalPage | null => {
      return bookManager?.getPhysicalPage(index) ?? null;
    },
    
    /**
     * 获取所有虚拟页面
     */
    getAllVirtualPages: (): VirtualPage[] => {
      return bookManager?.getAllVirtualPages() ?? [];
    },
    
    /**
     * 获取范围内的虚拟页面
     */
    getVirtualPagesInRange: (start: number, end: number): VirtualPage[] => {
      return bookManager?.getVirtualPagesInRange(start, end) ?? [];
    },
    
    /**
     * 获取图像缓存
     */
    getImageCache: (virtualIndex: number): Blob | null => {
      return bookManager?.getImageCache(virtualIndex) ?? null;
    },
    
    /**
     * 获取缩略图缓存
     */
    getThumbnailCache: (virtualIndex: number): Blob | null => {
      return bookManager?.getThumbnailCache(virtualIndex) ?? null;
    },
    
    /**
     * 请求加载图像
     */
    requestImage: async (virtualIndex: number): Promise<Blob | null> => {
      return bookManager?.requestImage(virtualIndex) ?? null;
    },
    
    /**
     * 请求加载缩略图
     */
    requestThumbnail: async (virtualIndex: number): Promise<Blob | null> => {
      return bookManager?.requestThumbnail(virtualIndex) ?? null;
    },
    
    // ============================================================================
    // 预加载控制
    // ============================================================================
    
    /**
     * 暂停预加载
     */
    pausePreload: () => {
      bookManager?.pausePreload();
    },
    
    /**
     * 恢复预加载
     */
    resumePreload: () => {
      bookManager?.resumePreload();
    },
    
    /**
     * 清空预加载缓存
     */
    clearPreloadCache: () => {
      bookManager?.clearPreloadCache();
    },
    
    // ============================================================================
    // 销毁
    // ============================================================================
    
    /**
     * 销毁
     */
    destroy: () => {
      bookManager?.destroy();
      viewerController?.destroy();
      bookManager = null;
      viewerController = null;
    },
  };
}

// ============================================================================
// 导出单例
// ============================================================================

export const bookStore2 = createBookStore();

// ============================================================================
// 派生 Store
// ============================================================================

/**
 * 当前页面信息
 */
export const currentPageInfo = derived(bookStore2, ($state) => {
  if (!$state.isOpen || !$state.currentFrame) {
    return null;
  }
  
  return {
    index: $state.currentIndex,
    total: $state.virtualPageCount,
    physicalTotal: $state.physicalPageCount,
    frame: $state.currentFrame,
    displayText: `${$state.currentIndex + 1} / ${$state.virtualPageCount}`,
  };
});

/**
 * 视图变换 CSS
 */
export const viewTransformCSS = derived(bookStore2, ($state) => {
  const { scale, rotation, offset } = $state.viewState;
  return `transform: translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg);`;
});

/**
 * 是否可以翻页
 */
export const canNavigate = derived(bookStore2, ($state) => {
  return {
    canPrev: $state.isOpen && $state.currentIndex > 0,
    canNext: $state.isOpen && $state.currentIndex < $state.virtualPageCount - 1,
  };
});
