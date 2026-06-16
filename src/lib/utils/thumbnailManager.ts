/**
 * Thumbnail Manager - 兼容层
 * 
 * 此文件为兼容层，将旧的 API 转发到统一缩略图系统
 * 所有旧代码仍然可以导入此模块
 */

import {
  unifiedThumbnailStore,
  generateThumbKey,
  getThumbnailUrl,
  type ThumbnailSource,
  type ThumbnailRequest,
} from '$lib/stores/unifiedThumbnailStore.svelte';
import { isPathExcluded } from '$lib/stores/excludedPaths.svelte';

// ============================================
// 辅助函数：从路径构造 ThumbnailSource + key
// ============================================

/** 从文件路径构造 file 类型的 ThumbnailSource */
function fileSourceFromPath(path: string): ThumbnailSource {
  return { kind: 'file', path, fileSize: 0, modified: 0 };
}

/** 从路径生成缩略图缓存键 */
function keyFromPath(path: string): string {
  return generateThumbKey(fileSourceFromPath(path), 256);
}

// 带排除路径过滤的请求
function requestVisibleThumbnails(paths: string[], currentPath: string): void {
  // 过滤掉排除路径
  const filteredPaths = paths.filter(p => !isPathExcluded(p));
  if (filteredPaths.length > 0) {
    const items: ThumbnailRequest[] = filteredPaths.map(p => ({
      key: keyFromPath(p),
      source: fileSourceFromPath(p),
      maxSize: 256,
    }));
    unifiedThumbnailStore.requestThumbnails(items, currentPath, 'visible');
  }
}

// 重新导出统一 API
export {
  unifiedThumbnailStore,
  requestVisibleThumbnails,
  getThumbnailUrl,
  generateThumbKey,
};

// 兼容旧导出：cancelThumbnailRequests -> cancelContext
export const cancelThumbnailRequests = unifiedThumbnailStore.cancelContext.bind(unifiedThumbnailStore);

// 兼容旧导出：hasThumbnail（key-based）
export function hasThumbnail(path: string): boolean {
  return unifiedThumbnailStore.hasThumbnail(keyFromPath(path));
}

// 兼容旧导出：getCacheStats -> getStats
export function getCacheStats() {
  return Promise.resolve(unifiedThumbnailStore.getStats());
}

// 兼容旧导出：clearCache
export function clearCache(_scope?: string) {
  unifiedThumbnailStore.clear();
  return Promise.resolve();
}

// 兼容旧导出：preloadDirectory -> requestThumbnails with background lane
export function preloadDirectory(path: string, _depth: number): Promise<void> {
  // 旧 API 按目录路径预加载，新 API 需要具体的文件列表
  // 这里仅记录日志，实际预加载由 FolderDataLoader 处理
  console.log('[thumbnailManager] 兼容层: preloadDirectory() -> 由 FolderDataLoader 处理');
  return Promise.resolve();
}

// 兼容旧导出：cleanup -> destroy
export function cleanup(): void {
  unifiedThumbnailStore.destroy();
}

// 兼容旧导出：useThumbnails（旧 hook，新系统不需要）
export function useThumbnails(_paths: string[]): Map<string, string> {
  console.warn('[thumbnailManager] 兼容层: useThumbnails() 已弃用');
  return new Map();
}

// 兼容旧导出：reloadThumbnail -> clear + re-request
export async function reloadThumbnail(path: string, currentPath: string): Promise<void> {
  const key = keyFromPath(path);
  // 清除该条目后重新请求
  unifiedThumbnailStore.clear();
  const items: ThumbnailRequest[] = [{
    key,
    source: fileSourceFromPath(path),
    maxSize: 256,
  }];
  await unifiedThumbnailStore.requestThumbnails(items, currentPath, 'visible');
}

// 兼容旧导出：initThumbnailServiceV3 -> unifiedThumbnailStore.init
export async function initThumbnailServiceV3(_thumbnailPath: string, _size: number): Promise<void> {
  await unifiedThumbnailStore.init();
}

// ============================================
// 兼容旧 API
// ============================================

/**
 * 兼容旧的 thumbnailManager 对象
 * 大部分方法现在由统一缩略图系统处理
 */
export const thumbnailManager = {
  // 统一系统: 初始化由 App.svelte 调用
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async init(_thumbnailPath: string, _rootPath: string, _size: number) {
    console.log('[thumbnailManager] 兼容层: init() -> 统一系统由 App.svelte 初始化');
  },

  // 统一系统: 获取缩略图 URL
  async getThumbnail(path: string, currentPath?: string): Promise<string | null> {
    const key = keyFromPath(path);
    const url = unifiedThumbnailStore.getThumbnailUrl(key);
    if (url) return url;

    // 如果没有缓存，请求后端生成
    if (currentPath) {
      requestVisibleThumbnails([path], currentPath);
    }

    return null;
  },

  // 统一系统: 预热目录
  async warmupDirectory(path: string) {
    console.log('[thumbnailManager] 兼容层: warmupDirectory() -> 由 FolderDataLoader 处理');
  },

  // 统一系统: 清除缓存
  async clearCache() {
    console.log('[thumbnailManager] 兼容层: clearCache() -> unifiedThumbnailStore.clear()');
    unifiedThumbnailStore.clear();
  },

  // 统一系统: 取消请求
  cancelPending() {
    console.log('[thumbnailManager] 兼容层: cancelPending() 已弃用');
  },

  // 获取缓存的缩略图 URL（同步）
  getCachedThumbnail(path: string): string | null {
    return unifiedThumbnailStore.getThumbnailUrl(keyFromPath(path));
  },

  // 检查是否有缓存
  hasCachedThumbnail(path: string): boolean {
    return unifiedThumbnailStore.hasThumbnail(keyFromPath(path));
  },

  // 统一系统: 缩略图就绪回调 - 由事件系统处理
  setOnThumbnailReady: undefined,

  // 统一系统: 设置当前目录
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setCurrentDirectory(_path: string) {
    // 统一系统中目录切换由 requestThumbnails 的 contextId 参数处理
  },

  // 统一系统: 取消待处理任务
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  cancelPendingTasks(_paths: Set<string>) {
    // 统一系统中取消逻辑由后端处理
  },

  // 统一系统: 请求可见缩略图
  requestVisibleThumbnails(paths: string[], currentPath: string) {
    requestVisibleThumbnails(paths, currentPath);
  },

  // 统一系统: 预加载数据库索引
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async preloadDbIndex(_paths: string[]) {
    // 统一系统中数据库操作由后端处理
  },

  // 统一系统: 批量从数据库加载
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async batchLoadFromDb(_paths: string[]): Promise<Set<string>> {
    // 统一系统中数据库操作由后端处理
    return new Set();
  },

  // 统一系统: 批量生成
  batchGenerate(paths: string[]) {
    requestVisibleThumbnails(paths, '');
  },

  // 统一系统: 更新滚动位置
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  updateScroll(_scrollTop: number, _scrollLeft: number, _startIndex: number, _totalItems: number) {
    // 统一系统中滚动逻辑由前端 debounce 和后端队列处理
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
  // 统一系统中优先级由后端管理
  console.log('[thumbnailManager] 兼容层: bumpPriority() 已弃用');
}

// 兼容旧的 store 导出
export const thumbnailStore = {
  get(path: string) {
    return unifiedThumbnailStore.getThumbnailUrl(keyFromPath(path));
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  subscribe(_callback: (thumbnails: Map<string, string>) => void) {
    // 统一系统使用事件推送，这里提供一个空的订阅
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
  // 统一系统事件监听已在 unifiedThumbnailStore.init 中设置
  console.log('[thumbnailManager] 兼容层: setupThumbnailEventListener() 已弃用');
  return () => { };
}

// 默认导出
export default thumbnailManager;
