/**
 * Thumbnail Store V3
 * 缩略图存储 - 复刻 NeeView 架构
 * 
 * 前端极简设计：
 * 1. 通知后端可见区域
 * 2. 接收 blob 并显示
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { fileBrowserStore } from './fileBrowser.svelte';

// 缩略图缓存 (path -> blob URL)
const thumbnails = $state<Map<string, string>>(new Map());

// 路径转换：统一使用正斜杠作为 key
function toRelativeKey(path: string): string {
  return path.replace(/\\/g, '/');
}

// 是否已初始化
let initialized = $state(false);

// 事件监听器
let unlistenThumbnailReady: UnlistenFn | null = null;

// 节流相关
const pendingPaths: string[] = [];
const throttleState = { dir: '', timer: null as ReturnType<typeof setTimeout> | null };
const THROTTLE_MS = 50; // 50ms 节流

// 缩略图就绪事件 payload
interface ThumbnailReadyPayload {
  path: string;
  blob: number[]; // Vec<u8> 转为 number[]
}

// 缓存统计
export interface CacheStats {
  memoryCount: number;
  memoryBytes: number;
  databaseCount: number;
  databaseBytes: number;
  queueLength: number;
  activeWorkers: number;
}

/**
 * 初始化缩略图服务
 */
export async function initThumbnailServiceV3(
  thumbnailPath: string,
  size: number = 256
): Promise<void> {
  if (initialized) return;

  try {
    // 初始化后端服务
    await invoke('init_thumbnail_service_v3', {
      thumbnailPath,
      size,
    });

    // 监听缩略图就绪事件
    unlistenThumbnailReady = await listen<ThumbnailReadyPayload>(
      'thumbnail-ready',
      (event) => {
        const { path, blob } = event.payload;

        // 转换为 Blob URL
        const blobUrl = URL.createObjectURL(
          new Blob([new Uint8Array(blob)], { type: 'image/webp' })
        );

        // 存储到本地缓存
        thumbnails.set(path, blobUrl);

        // 同步到 fileBrowserStore（供 FileItemCard 使用）
        const key = toRelativeKey(path);
        fileBrowserStore.addThumbnail(key, blobUrl);
      }
    );

    initialized = true;
    console.log('✅ ThumbnailStoreV3 initialized');
  } catch (error) {
    console.error('❌ ThumbnailStoreV3 initialization failed:', error);
    throw error;
  }
}

/**
 * 请求可见区域缩略图（核心方法，带节流）
 * @param paths 可见区域的路径列表（已按优先级排序）
 * @param currentDir 当前目录
 */
export async function requestVisibleThumbnails(
  paths: string[],
  currentDir: string
): Promise<void> {
  if (!initialized) {
    console.warn('⚠️ ThumbnailStoreV3 not initialized');
    return;
  }

  // 过滤已缓存的路径
  const uncachedPaths = paths.filter((p) => !thumbnails.has(p));

  if (uncachedPaths.length === 0) return;

  // 如果目录变化，清空待处理列表
  if (throttleState.dir !== currentDir) {
    pendingPaths.length = 0;
    throttleState.dir = currentDir;
  }

  // 合并到待处理列表（去重）
  for (const p of uncachedPaths) {
    if (!pendingPaths.includes(p)) {
      pendingPaths.push(p);
    }
  }

  // 节流：清除之前的定时器，设置新的
  if (throttleState.timer) {
    clearTimeout(throttleState.timer);
  }

  throttleState.timer = setTimeout(async () => {
    if (pendingPaths.length === 0) return;

    // 复制并清空待处理列表
    const pathsToRequest = [...pendingPaths];
    pendingPaths.length = 0;

    try {
      await invoke('request_visible_thumbnails_v3', {
        paths: pathsToRequest,
        currentDir: throttleState.dir,
      });
    } catch (error) {
      console.error('❌ requestVisibleThumbnails failed:', error);
    }
  }, THROTTLE_MS);
}

/**
 * 取消指定目录的请求
 */
export async function cancelThumbnailRequests(dir: string): Promise<void> {
  if (!initialized) return;

  try {
    await invoke('cancel_thumbnail_requests_v3', { dir });
  } catch (error) {
    console.error('❌ cancelThumbnailRequests failed:', error);
  }
}

/**
 * 获取缩略图 URL（同步，从本地缓存）
 */
export function getThumbnailUrl(path: string): string | undefined {
  return thumbnails.get(path);
}

/**
 * 检查是否有缓存
 */
export function hasThumbnail(path: string): boolean {
  return thumbnails.has(path);
}

/**
 * 获取缓存统计
 */
export async function getCacheStats(): Promise<CacheStats | null> {
  if (!initialized) return null;

  try {
    return await invoke<CacheStats>('get_thumbnail_cache_stats_v3');
  } catch (error) {
    console.error('❌ getCacheStats failed:', error);
    return null;
  }
}

/**
 * 清除缓存
 */
export async function clearCache(
  scope: 'all' | 'memory' | 'database' = 'all'
): Promise<void> {
  if (!initialized) return;

  try {
    await invoke('clear_thumbnail_cache_v3', { scope });

    // 清除本地 blob URL
    if (scope === 'all' || scope === 'memory') {
      for (const url of thumbnails.values()) {
        URL.revokeObjectURL(url);
      }
      thumbnails.clear();
    }
  } catch (error) {
    console.error('❌ clearCache failed:', error);
  }
}

/**
 * 预加载目录
 */
export async function preloadDirectory(
  dir: string,
  depth: number = 1
): Promise<void> {
  if (!initialized) return;

  try {
    await invoke('preload_directory_thumbnails_v3', { dir, depth });
  } catch (error) {
    console.error('❌ preloadDirectory failed:', error);
  }
}

/**
 * 请求可见区域缩略图（带预取）
 * @param visiblePaths 当前可见的路径
 * @param allPaths 完整路径列表（用于预取）
 * @param currentDir 当前目录
 * @param prefetchCount 预取数量（可见区域前后各取多少）
 */
export async function requestVisibleThumbnailsWithPrefetch(
  visiblePaths: string[],
  allPaths: string[],
  currentDir: string,
  prefetchCount: number = 20
): Promise<void> {
  if (!initialized || visiblePaths.length === 0) return;

  // 找到可见区域在完整列表中的位置
  const firstVisibleIndex = allPaths.indexOf(visiblePaths[0]);
  const lastVisibleIndex = allPaths.indexOf(visiblePaths[visiblePaths.length - 1]);

  if (firstVisibleIndex === -1 || lastVisibleIndex === -1) {
    // 找不到位置，只请求可见的
    return requestVisibleThumbnails(visiblePaths, currentDir);
  }

  // 计算预取范围
  const prefetchStart = Math.max(0, firstVisibleIndex - prefetchCount);
  const prefetchEnd = Math.min(allPaths.length, lastVisibleIndex + prefetchCount + 1);

  // 合并可见路径和预取路径（可见优先）
  const prefetchPaths = allPaths.slice(prefetchStart, prefetchEnd);
  const pathsToRequest = [
    ...visiblePaths,
    ...prefetchPaths.filter((p) => !visiblePaths.includes(p)),
  ];

  return requestVisibleThumbnails(pathsToRequest, currentDir);
}

/**
 * 清理（组件卸载时调用）
 */
export function cleanup(): void {
  // 取消事件监听
  if (unlistenThumbnailReady) {
    unlistenThumbnailReady();
    unlistenThumbnailReady = null;
  }

  // 清除所有 blob URL
  for (const url of thumbnails.values()) {
    URL.revokeObjectURL(url);
  }
  thumbnails.clear();

  initialized = false;
  console.log('🛑 ThumbnailStoreV3 cleaned up');
}

/**
 * 导出响应式状态（用于 Svelte 组件）
 */
export function useThumbnails() {
  return {
    get thumbnails() {
      return thumbnails;
    },
    get initialized() {
      return initialized;
    },
    getThumbnailUrl,
    hasThumbnail,
  };
}
