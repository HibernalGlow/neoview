/**
 * NeoView - Book Store
 * 书籍状态管理 Store (Svelte 5 Runes)
 * 
 * 此文件现在作为兼容层，从模块化的 book/ 目录重新导出
 * 所有实现已迁移到 book/ 子目录中的各个模块
 */

// 从核心模块重新导出 bookStore 单例和类型
export { bookStore, type SwitchToastContext } from './book/core.svelte';

// 重新导出类型定义（保持向后兼容）
export type {
  BookState,
  OpenBookOptions,
  SwitchToastBookContext,
  SwitchToastPageContext,
  ContentRef,
  UpscaleCacheEntry,
  UpscaleStatus,
} from './book/types';

// 重新导出工具函数（保持向后兼容）
export {
  PAGE_WINDOW_PADDING,
  JUMP_HISTORY_LIMIT,
  formatBytesShort,
  formatBookTypeLabel,
  mapEmmToRaw,
  clampInitialPage,
} from './book/utils';

// 重新导出页面导航相关
export {
  PageNavigationManager,
  isValidPageIndex,
  clampPageIndex,
  calculatePageWindow,
  type PageNavigationState,
  type PageNavigationCallbacks,
} from './book/pageNavigation.svelte';

// 重新导出超分管理相关
export {
  UpscaleStatusManager,
  generateCacheKey,
  parseCacheKey,
  type UpscaleCacheQuery,
  type UpscaleCacheRecord,
} from './book/upscaleManagement.svelte';

// 重新导出流式加载相关
export {
  StreamingLoaderManager,
  isArchivePath,
  dispatchStreamingProgress,
  dispatchStreamingComplete,
  type StreamingState,
  type StreamingProgress,
} from './book/streamingLoader.svelte';

// 重新导出 Toast 相关
export { renderSwitchToastTemplate } from './book/toast';
