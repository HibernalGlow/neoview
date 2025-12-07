/**
 * Thumbnail Manager - 兼容层
 * 
 * 此文件为兼容层，将旧的 API 转发到 V3 系统
 * 所有旧代码仍然可以导入此模块
 */

import {
  initThumbnailServiceV3,
  requestVisibleThumbnails as requestVisibleThumbnailsV3,
  cancelThumbnailRequests,
  getThumbnailUrl,
  hasThumbnail,
  getCacheStats,
  clearCache,
  preloadDirectory,
  cleanup,
  useThumbnails,
} from '$lib/stores/thumbnailStoreV3.svelte';
import { isPathExcluded } from '$lib/stores/excludedPaths.svelte';

// 带排除路径过滤的请求
function requestVisibleThumbnails(paths: string[], currentPath: string): void {
  // 过滤掉排除路径
  const filteredPaths = paths.filter(p => !isPathExcluded(p));
  if (filteredPaths.length > 0) {
    requestVisibleThumbnailsV3(filteredPaths, currentPath);
  }
}

// 重新导出 V3 API
export {
  initThumbnailServiceV3,
  requestVisibleThumbnails,
  cancelThumbnailRequests,
  getThumbnailUrl,
  hasThumbnail,
  getCacheStats,
  clearCache,
  preloadDirectory,
  cleanup,
  useThumbnails,
};

// ============================================
// 兼容旧 API
// ============================================

/**
 * 兼容旧的 thumbnailManager 对象
 * 大部分方法现在由 V3 后端处理
 */
export const thumbnailManager = {
  // V3: 初始化由 App.svelte 调用
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async init(_thumbnailPath: string, _rootPath: string, _size: number) {
    console.log('[thumbnailManager] 兼容层: init() -> V3 由 App.svelte 初始化');
    // V3 已在 App.svelte 中初始化
  },

  // V3: 获取缩略图 URL
  async getThumbnail(path: string, currentPath?: string): Promise<string | null> {
    // 直接从 V3 缓存获取
    const url = getThumbnailUrl(path);
    if (url) return url;

    // 如果没有缓存，请求后端生成
    if (currentPath) {
      requestVisibleThumbnails([path], currentPath);
    }

    return null;
  },

  // V3: 预热目录
  async warmupDirectory(path: string) {
    console.log('[thumbnailManager] 兼容层: warmupDirectory() -> V3 preloadDirectory');
    await preloadDirectory(path, 1);
  },

  // V3: 清除缓存
  async clearCache() {
    console.log('[thumbnailManager] 兼容层: clearCache() -> V3 clearCache');
    await clearCache('all');
  },

  // V3: 取消请求
  cancelPending() {
    console.log('[thumbnailManager] 兼容层: cancelPending() 已弃用');
  },

  // 获取缓存的缩略图 URL（同步）
  getCachedThumbnail(path: string): string | undefined {
    return getThumbnailUrl(path);
  },

  // 检查是否有缓存
  hasCachedThumbnail(path: string): boolean {
    return hasThumbnail(path);
  },

  // V3: 缩略图就绪回调 - 由事件系统处理
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // setOnThumbnailReady(_callback: (path: string, dataUrl: string) => void) {
  //   // V3 使用 Tauri 事件推送，回调已在 thumbnailStoreV3 中处理
  //   console.log('[thumbnailManager] 兼容层: setOnThumbnailReady() - V3 使用事件推送');
  // },
  setOnThumbnailReady: undefined,

  // V3: 设置当前目录
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setCurrentDirectory(_path: string) {
    // V3 中目录切换由 requestVisibleThumbnails 的 currentDir 参数处理
  },

  // V3: 取消待处理任务
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  cancelPendingTasks(_paths: Set<string>) {
    // V3 中取消逻辑由后端处理
  },

  // V3: 请求可见缩略图
  requestVisibleThumbnails(paths: string[], currentPath: string) {
    requestVisibleThumbnails(paths, currentPath);
  },

  // V3: 预加载数据库索引
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async preloadDbIndex(_paths: string[]) {
    // V3 中数据库操作由后端处理
  },

  // V3: 批量从数据库加载
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async batchLoadFromDb(_paths: string[]): Promise<Set<string>> {
    // V3 中数据库操作由后端处理
    return new Set();
  },

  // V3: 批量生成
  batchGenerate(paths: string[]) {
    requestVisibleThumbnails(paths, '');
  },

  // V3: 更新滚动位置
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  updateScroll(_scrollTop: number, _scrollLeft: number, _startIndex: number, _totalItems: number) {
    // V3 中滚动逻辑由前端 debounce 和后端队列处理
  },

  // 配置（保留兼容性）
  config: {
    thumbnailSize: 256,
    cacheSize: 1024,
  },
};

// 兼容旧的函数导出
export function enqueueVisible(paths: string[], currentPath: string) {
  requestVisibleThumbnails(paths, currentPath);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function bumpPriority(_path: string) {
  // V3 中优先级由后端管理
  console.log('[thumbnailManager] 兼容层: bumpPriority() 已弃用');
}

// 兼容旧的 store 导出
export const thumbnailStore = {
  get(path: string) {
    return getThumbnailUrl(path);
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  subscribe(_callback: (thumbnails: Map<string, string>) => void) {
    // V3 使用事件推送，这里提供一个空的订阅
    console.log('[thumbnailManager] 兼容层: thumbnailStore.subscribe() 已弃用');
    return () => { };
  },
};

// 兼容旧的压缩包缩略图函数
export async function loadArchiveThumbnail(path: string): Promise<string | null> {
  return thumbnailManager.getThumbnail(path);
}

export async function getArchiveFirstImageBlob(path: string): Promise<string | null> {
  return thumbnailManager.getThumbnail(path);
}

export async function generateArchiveThumbnailAsync(path: string): Promise<void> {
  requestVisibleThumbnails([path], '');
}

export function setupThumbnailEventListener(): () => void {
  // V3 事件监听已在 initThumbnailServiceV3 中设置
  console.log('[thumbnailManager] 兼容层: setupThumbnailEventListener() 已弃用');
  return () => { };
}

// 默认导出
export default thumbnailManager;
