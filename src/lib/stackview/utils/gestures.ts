/**
 * StackView 手势处理模块
 * 处理滚轮、键盘、触摸等手势
 */

import { zoomIn, zoomOut, resetZoom, setZoomLevel } from '$lib/stores';
import { keyBindingsStore } from '$lib/stores/keybindings.svelte';
import { settingsManager } from '$lib/settings/settingsManager';
import { showToast } from '$lib/utils/toast';

// 调试模式：显示操作 toast
let debugMode = true;

function showActionToast(action: string) {
  if (debugMode) {
    showToast({ title: `[StackView] ${action}`, variant: 'info', duration: 800 });
  }
}

export function setGestureDebugMode(enabled: boolean) {
  debugMode = enabled;
}

// ============================================================================
// 类型定义
// ============================================================================

export interface GestureConfig {
  onNextPage?: () => void;
  onPrevPage?: () => void;
  onPageLeft?: () => void;
  onPageRight?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  onToggleFullscreen?: () => void;
}

export interface WheelHandler {
  handleWheel: (e: WheelEvent) => void;
  destroy: () => void;
}

// ============================================================================
// 滚轮处理
// ============================================================================

/**
 * 创建滚轮处理器
 */
export function createWheelHandler(config: GestureConfig): WheelHandler {
  function handleWheel(e: WheelEvent) {
    // 不在输入框时响应
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.getAttribute('contenteditable') === 'true'
    ) {
      return;
    }

    const direction = e.deltaY < 0 ? 'up' : 'down';
    const action = keyBindingsStore.findActionByMouseWheel(direction);
    
    if (action) {
      e.preventDefault();
      const settings = settingsManager.getSettings();
      const readingDirection = settings.book.readingDirection;
      
      switch (action) {
        case 'nextPage':
          showActionToast('滚轮: 下一页');
          config.onNextPage?.();
          break;
        case 'prevPage':
          showActionToast('滚轮: 上一页');
          config.onPrevPage?.();
          break;
        case 'pageLeft':
          showActionToast('滚轮: 向左翻页');
          if (readingDirection === 'right-to-left') {
            config.onPageRight?.();
          } else {
            config.onPageLeft?.();
          }
          break;
        case 'pageRight':
          showActionToast('滚轮: 向右翻页');
          if (readingDirection === 'right-to-left') {
            config.onPageLeft?.();
          } else {
            config.onPageRight?.();
          }
          break;
        case 'zoomIn':
          showActionToast('滚轮: 放大');
          if (config.onZoomIn) config.onZoomIn(); else zoomIn();
          break;
        case 'zoomOut':
          showActionToast('滚轮: 缩小');
          if (config.onZoomOut) config.onZoomOut(); else zoomOut();
          break;
      }
    }
  }
  
  return {
    handleWheel,
    destroy: () => {},
  };
}

// ============================================================================
// 键盘处理
// ============================================================================

export interface KeyboardHandler {
  handleKeydown: (e: KeyboardEvent) => void;
  destroy: () => void;
}

/**
 * 创建键盘处理器
 */
export function createKeyboardHandler(config: GestureConfig): KeyboardHandler {
  function handleKeydown(e: KeyboardEvent) {
    // 忽略输入框中的按键
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.getAttribute('contenteditable') === 'true'
    ) {
      return;
    }

    const action = keyBindingsStore.findActionByKeyCombo(e);
    
    if (action) {
      e.preventDefault();
      const settings = settingsManager.getSettings();
      const readingDirection = settings.book.readingDirection;
      
      switch (action) {
        case 'nextPage':
          showActionToast('键盘: 下一页');
          config.onNextPage?.();
          break;
        case 'prevPage':
          showActionToast('键盘: 上一页');
          config.onPrevPage?.();
          break;
        case 'pageLeft':
          showActionToast('键盘: 向左翻页');
          if (readingDirection === 'right-to-left') {
            config.onPageRight?.();
          } else {
            config.onPageLeft?.();
          }
          break;
        case 'pageRight':
          showActionToast('键盘: 向右翻页');
          if (readingDirection === 'right-to-left') {
            config.onPageLeft?.();
          } else {
            config.onPageRight?.();
          }
          break;
        case 'zoomIn':
          showActionToast('键盘: 放大');
          if (config.onZoomIn) config.onZoomIn(); else zoomIn();
          break;
        case 'zoomOut':
          showActionToast('键盘: 缩小');
          if (config.onZoomOut) config.onZoomOut(); else zoomOut();
          break;
        case 'resetZoom':
          showActionToast('键盘: 重置缩放');
          if (config.onResetZoom) config.onResetZoom(); else resetZoom();
          break;
        case 'toggleFullscreen':
          showActionToast('键盘: 切换全屏');
          config.onToggleFullscreen?.();
          break;
      }
    }
  }
  
  return {
    handleKeydown,
    destroy: () => {},
  };
}

// ============================================================================
// 缩放处理
// ============================================================================

export interface ZoomHandler {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setZoom: (level: number) => void;
  zoomToFit: (containerSize: { width: number; height: number }, imageSize: { width: number; height: number }) => void;
}

/**
 * 创建缩放处理器
 */
export function createZoomHandler(): ZoomHandler {
  return {
    zoomIn: () => zoomIn(),
    zoomOut: () => zoomOut(),
    resetZoom: () => resetZoom(),
    setZoom: (level: number) => setZoomLevel(level),
    zoomToFit: (containerSize, imageSize) => {
      if (!containerSize.width || !containerSize.height || !imageSize.width || !imageSize.height) {
        return;
      }
      
      const scaleX = containerSize.width / imageSize.width;
      const scaleY = containerSize.height / imageSize.height;
      const scale = Math.min(scaleX, scaleY, 1); // 不超过 100%
      
      setZoomLevel(scale);
    },
  };
}

// ============================================================================
// 组合处理器
// ============================================================================

export interface GestureManager {
  wheelHandler: WheelHandler;
  keyboardHandler: KeyboardHandler;
  zoomHandler: ZoomHandler;
  attachTo: (element: HTMLElement) => void;
  destroy: () => void;
}

/**
 * 创建完整的手势管理器
 */
export function createGestureManager(config: GestureConfig): GestureManager {
  const wheelHandler = createWheelHandler(config);
  const keyboardHandler = createKeyboardHandler(config);
  const zoomHandler = createZoomHandler();
  
  let attachedElement: HTMLElement | null = null;
  
  function attachTo(element: HTMLElement) {
    if (attachedElement) {
      destroy();
    }
    
    attachedElement = element;
    element.addEventListener('wheel', wheelHandler.handleWheel, { passive: false });
    element.addEventListener('keydown', keyboardHandler.handleKeydown);
  }
  
  function destroy() {
    if (attachedElement) {
      attachedElement.removeEventListener('wheel', wheelHandler.handleWheel);
      attachedElement.removeEventListener('keydown', keyboardHandler.handleKeydown);
      attachedElement = null;
    }
  }
  
  return {
    wheelHandler,
    keyboardHandler,
    zoomHandler,
    attachTo,
    destroy,
  };
}
