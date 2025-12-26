/**
 * Book Store - 模块入口
 * 
 * 统一导出所有子模块的类型、工具和核心功能
 */

// 类型定义
export * from './types';

// 工具函数
export * from './utils';

// Toast 模块
export { renderSwitchToastTemplate } from './toast';

// 页面导航模块
export {
  PageNavigationManager,
  isValidPageIndex,
  clampPageIndex,
  calculatePageWindow,
  type PageNavigationState,
  type PageNavigationCallbacks,
} from './pageNavigation.svelte';

// 超分状态管理模块
export {
  UpscaleStatusManager,
  generateCacheKey,
  parseCacheKey,
  type UpscaleCacheQuery,
  type UpscaleCacheRecord,
} from './upscaleManagement.svelte';

// 流式加载模块
export {
  StreamingLoaderManager,
  isArchivePath,
  dispatchStreamingProgress,
  dispatchStreamingComplete,
  type StreamingState,
  type StreamingProgress,
} from './streamingLoader.svelte';

// 核心模块（主要导出）
export { bookStore, type SwitchToastContext } from './core.svelte';
