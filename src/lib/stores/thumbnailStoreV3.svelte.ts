import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { SvelteMap } from 'svelte/reactivity';
import { fileBrowserStore } from './fileBrowser.svelte';
import { getThumbUrl } from '$lib/api/imageProtocol';

// 缩略图缓存 (path -> blob URL) - 使用 SvelteMap 响应式状态以支持动态刷新
const thumbnails = new SvelteMap<string, string>();
const THUMBNAIL_CACHE_LIMIT = 512; // 内存 LRU 上限，防止无限增长

function revokeIfObjectUrl(url: string) {
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    URL.revokeObjectURL(url);
  }
}

function setThumbnailWithEviction(path: string, url: string) {
  const existing = thumbnails.get(path);
  if (existing && existing !== url) {
    revokeIfObjectUrl(existing);
  }

  // 通过重新 set 维持 LRU 顺序
  thumbnails.delete(path);
  thumbnails.set(path, url);

  // 超过容量则淘汰最早的条目
  while (thumbnails.size > THUMBNAIL_CACHE_LIMIT) {
    const first = thumbnails.keys().next().value as string | undefined;
    if (!first) break;
    const oldUrl = thumbnails.get(first);
    if (oldUrl) revokeIfObjectUrl(oldUrl);
    thumbnails.delete(first);
    fileBrowserStore.removeThumbnail(toRelativeKey(first));
  }
}

// 路径转换：统一使用正斜杠作为 key
function toRelativeKey(path: string): string {
  return path.replace(/\\/g, '/');
}

// 是否已初始化
let initialized = $state(false);

// 事件监听器
let unlistenThumbnailReady: UnlistenFn | null = null;
let unlistenThumbnailBatchReady: UnlistenFn | null = null;

// 节流相关 - 使用 Set 优化 O(1) 查找
// eslint-disable-next-line -- 非响应式内部状态，普通 Set 比 SvelteSet 更高效
const pendingPathsSet = new Set<string>();
const pendingPathsOrder: string[] = []; // 保持顺序
const throttleState = { dir: '', timer: null as ReturnType<typeof setTimeout> | null };
const THROTTLE_MS = 8; // 8ms 节流（更快响应）
const MAX_BATCH_SIZE = 64; // 单次发送上限，避免一次塞入过多路径
const MAX_QUEUE_SIZE = 512; // 队列上限，滚动快时丢弃最早的低优先级请求
// 单次调度内发送批次数上限（0 表示不限，直到队列清空）。
// 为避免卡住 UI，我们仍按批次顺序发送，每批 await invoke，剩余批次继续循环。
const MAX_SYNC_DISPATCHES = 0;

// 动态预加载相关（根据停留时间指数扩展）
const prefetchState = {
  lastDir: '',
  stayStartTime: 0,
  currentPrefetchCount: 20, // 初始预取数量
};

// 缩略图就绪事件 payload
interface ThumbnailReadyPayload {
  path: string;
  blob?: number[]; // Vec<u8> 转为 number[]
}

// 批量缩略图就绪事件 payload
interface ThumbnailBatchReadyPayload {
  items: ThumbnailReadyPayload[];
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

    // 处理单个缩略图的公共函数
    const processThumbnail = (path: string, blob?: number[]) => {
      // 优先使用自定义协议 URL，避免 IPC 传输大二进制数据和 Blob URL 内存开销
      const thumbUrl = getThumbUrl(path);
      
      // 如果后端传了 blob（例如为了即时显示或某些特殊情况），可以暂存
      // 但为了极致内存优化，我们优先鼓励使用协议 URL。
      // 注意：协议 URL 不需要 revoke，因为它指向后端的统一入口。
      const finalUrl = (blob && blob.length > 0) 
        ? URL.createObjectURL(new Blob([new Uint8Array(blob)], { type: 'image/webp' }))
        : thumbUrl;

      // 存储到本地缓存（带 LRU + revoke）
      setThumbnailWithEviction(path, finalUrl);

      // 同步到 fileBrowserStore（供 FileItemCard 使用）
      const key = toRelativeKey(path);
      fileBrowserStore.addThumbnail(key, finalUrl);
    };

    // 监听批量缩略图就绪事件（优化：一次处理多个）
    unlistenThumbnailBatchReady = await listen<ThumbnailBatchReadyPayload>(
      'thumbnail-batch-ready',
      (event) => {
        for (const item of event.payload.items) {
          processThumbnail(item.path, item.blob);
        }
      }
    );

    // 监听缩略图就绪事件（兼容单个）
    unlistenThumbnailReady = await listen<ThumbnailReadyPayload>(
      'thumbnail-ready',
      (event) => {
        processThumbnail(event.payload.path, event.payload.blob);
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
 * @param centerIndex 可见区域中心索引（用于优先级排序）
 */
export async function requestVisibleThumbnails(
  paths: string[],
  currentDir: string,
  centerIndex?: number
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
    pendingPathsSet.clear();
    pendingPathsOrder.length = 0;
    throttleState.dir = currentDir;
  }

  // 合并到待处理列表（使用 Set O(1) 去重），并控制队列长度
  for (const p of uncachedPaths) {
    if (pendingPathsSet.has(p)) continue;
    pendingPathsSet.add(p);
    pendingPathsOrder.push(p);

    // 超过上限则丢弃最早的低优先级项，避免滚动时队列爆炸
    while (pendingPathsOrder.length > MAX_QUEUE_SIZE) {
      const dropped = pendingPathsOrder.shift();
      if (dropped) pendingPathsSet.delete(dropped);
    }
  }

  // 定义发送请求的函数（一次可连续发送多个批次，剩余的下个 tick 再发）
  const sendRequest = async () => {
    if (pendingPathsSet.size === 0) {
      throttleState.timer = null;
      return;
    }

    let dispatches = 0;
    while (pendingPathsOrder.length > 0 && (MAX_SYNC_DISPATCHES === 0 || dispatches < MAX_SYNC_DISPATCHES)) {
      const batch: string[] = [];
      while (batch.length < MAX_BATCH_SIZE && pendingPathsOrder.length > 0) {
        const p = pendingPathsOrder.shift();
        if (!p) break;
        if (!pendingPathsSet.has(p)) continue;
        batch.push(p);
        pendingPathsSet.delete(p);
      }

      if (batch.length === 0) continue;
      dispatches += 1;

      try {
        // 计算中心索引（如果未提供，使用可见列表中心）
        const center = centerIndex ?? Math.floor(batch.length / 2);

        await invoke('request_visible_thumbnails_v3', {
          paths: batch,
          currentDir: throttleState.dir,
          centerIndex: center,
        });
      } catch (error) {
        console.error('❌ requestVisibleThumbnails failed:', error);
      }
    }

    // 还有待发送的队列，下一帧继续
    if (pendingPathsOrder.length > 0) {
      throttleState.timer = setTimeout(() => {
        throttleState.timer = null;
        void sendRequest();
      }, THROTTLE_MS);
    } else {
      throttleState.timer = null;
    }
  };

  // 若当前没有定时器，则启动调度（立即排队，下个 tick 开始发送）
  if (!throttleState.timer) {
    throttleState.timer = setTimeout(() => {
      throttleState.timer = null;
      void sendRequest();
    }, THROTTLE_MS);
  }
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
 * 重载单个文件的缩略图（删除缓存并重新请求）
 * @param path 文件路径
 * @param currentDir 当前目录（用于后端优先级）
 */
export async function reloadThumbnail(
  path: string,
  currentDir?: string
): Promise<void> {
  if (!initialized) {
    console.warn('⚠️ ThumbnailStoreV3 not initialized');
    return;
  }

  // 1. 删除本地缓存（释放 blob URL）
  const existingUrl = thumbnails.get(path);
  if (existingUrl) {
    URL.revokeObjectURL(existingUrl);
    thumbnails.delete(path);
  }

  // 2. 同步删除 fileBrowserStore 缓存
  const key = toRelativeKey(path);
  fileBrowserStore.removeThumbnail(key);

  // 3. 调用后端删除数据库缓存并立即重新生成
  try {
    await invoke('reload_thumbnail_v3', { 
      path, 
      currentDir: currentDir || '' 
    });
    console.log(`🔄 Reloading thumbnail: ${path}`);
  } catch (error) {
    console.error('❌ reloadThumbnail failed:', error);
  }
  // 后端会自动触发重新生成并通过事件推送结果
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

// ============== 数据库维护 API ==============

/**
 * 数据库维护统计
 */
export interface MaintenanceStats {
  totalEntries: number;
  folderEntries: number;
  dbSizeBytes: number;
  dbSizeMb: number;
}

/**
 * 获取数据库维护统计
 */
export async function getDbStats(): Promise<MaintenanceStats | null> {
  if (!initialized) return null;

  try {
    const stats = await invoke<{
      total_entries: number;
      folder_entries: number;
      db_size_bytes: number;
      db_size_mb: number;
    }>('get_thumbnail_db_stats_v3');

    return {
      totalEntries: stats.total_entries,
      folderEntries: stats.folder_entries,
      dbSizeBytes: stats.db_size_bytes,
      dbSizeMb: stats.db_size_mb,
    };
  } catch (error) {
    console.error('❌ getDbStats failed:', error);
    return null;
  }
}

/**
 * 清理无效路径（文件不存在的缩略图）
 */
export async function cleanupInvalidPaths(): Promise<number> {
  if (!initialized) return 0;

  try {
    return await invoke<number>('cleanup_invalid_paths_v3');
  } catch (error) {
    console.error('❌ cleanupInvalidPaths failed:', error);
    return 0;
  }
}

/**
 * 清理过期条目
 * @param days 过期天数
 * @param excludeFolders 是否排除文件夹（保留文件夹缩略图）
 */
export async function cleanupExpiredEntries(
  days: number,
  excludeFolders: boolean = true
): Promise<number> {
  if (!initialized) return 0;

  try {
    return await invoke<number>('cleanup_expired_entries_v3', {
      days,
      excludeFolders,
    });
  } catch (error) {
    console.error('❌ cleanupExpiredEntries failed:', error);
    return 0;
  }
}

/**
 * 清理指定路径前缀下的缩略图
 */
export async function cleanupByPathPrefix(pathPrefix: string): Promise<number> {
  if (!initialized) return 0;

  try {
    return await invoke<number>('cleanup_by_path_prefix_v3', { pathPrefix });
  } catch (error) {
    console.error('❌ cleanupByPathPrefix failed:', error);
    return 0;
  }
}

/**
 * 执行数据库压缩（VACUUM）
 */
export async function vacuumDb(): Promise<boolean> {
  if (!initialized) return false;

  try {
    await invoke('vacuum_thumbnail_db_v3');
    return true;
  } catch (error) {
    console.error('❌ vacuumDb failed:', error);
    return false;
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
 * 计算动态预取数量（根据停留时间指数增长）
 * 停留时间越长，预取范围越大
 */
function calculateDynamicPrefetchCount(currentDir: string): number {
  const now = Date.now();
  const MIN_PREFETCH = 20;
  const MAX_PREFETCH = 200;
  const GROWTH_INTERVAL = 2000; // 每 2 秒增长一次

  // 如果目录变化，重置
  if (prefetchState.lastDir !== currentDir) {
    prefetchState.lastDir = currentDir;
    prefetchState.stayStartTime = now;
    prefetchState.currentPrefetchCount = MIN_PREFETCH;
    return MIN_PREFETCH;
  }

  // 计算停留时间
  const stayDuration = now - prefetchState.stayStartTime;
  const growthSteps = Math.floor(stayDuration / GROWTH_INTERVAL);

  // 指数增长：每个步骤增加 50%
  if (growthSteps > 0) {
    const newCount = Math.min(
      MAX_PREFETCH,
      Math.floor(MIN_PREFETCH * Math.pow(1.5, growthSteps))
    );
    prefetchState.currentPrefetchCount = newCount;
  }

  return prefetchState.currentPrefetchCount;
}

/**
 * 请求可见区域缩略图（带动态预取）
 * 根据用户在当前目录的停留时间自动扩展预取范围
 * @param visiblePaths 当前可见的路径
 * @param allPaths 完整路径列表（用于预取）
 * @param currentDir 当前目录
 */
export async function requestVisibleThumbnailsWithPrefetch(
  visiblePaths: string[],
  allPaths: string[],
  currentDir: string
): Promise<void> {
  if (!initialized || visiblePaths.length === 0) return;

  // 动态计算预取数量
  const prefetchCount = calculateDynamicPrefetchCount(currentDir);

  // 找到可见区域在完整列表中的位置
  const firstVisibleIndex = allPaths.indexOf(visiblePaths[0]);
  const lastVisibleIndex = allPaths.indexOf(visiblePaths[visiblePaths.length - 1]);

  if (firstVisibleIndex === -1 || lastVisibleIndex === -1) {
    // 找不到位置，只请求可见的
    return requestVisibleThumbnails(visiblePaths, currentDir);
  }

  // 计算可见区域中心索引
  const centerIndex = Math.floor((firstVisibleIndex + lastVisibleIndex) / 2);

  // 计算预取范围
  const prefetchStart = Math.max(0, firstVisibleIndex - prefetchCount);
  const prefetchEnd = Math.min(allPaths.length, lastVisibleIndex + prefetchCount + 1);

  // 合并可见路径和预取路径（可见优先）
  const prefetchPaths = allPaths.slice(prefetchStart, prefetchEnd);
  const pathsToRequest = [
    ...visiblePaths,
    ...prefetchPaths.filter((p) => !visiblePaths.includes(p)),
  ];

  // 传递中心索引给后端，用于优先级排序
  return requestVisibleThumbnails(pathsToRequest, currentDir, centerIndex);
}

/**
 * 预加载整本书的所有缩略图（顺序批量发送，避免队列上限丢弃）
 * @param paths 书籍内所有页面的完整路径
 * @param currentDir 当前书籍路径（作为优先级上下文）
 * @param centerIndex 当前页面索引，用于优先级排序
 */
export async function requestAllThumbnails(
  paths: string[],
  currentDir: string,
  centerIndex?: number
): Promise<void> {
  if (!initialized) {
    console.warn('⚠️ ThumbnailStoreV3 not initialized');
    return;
  }

  // 去重并过滤已缓存的路径
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const p of paths) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    if (thumbnails.has(p)) continue;
    deduped.push(p);
  }

  if (deduped.length === 0) return;

  const effectiveCenter = centerIndex ?? Math.floor(deduped.length / 2);

  for (let i = 0; i < deduped.length; i += MAX_BATCH_SIZE) {
    const batch = deduped.slice(i, i + MAX_BATCH_SIZE);
    try {
      await invoke('request_visible_thumbnails_v3', {
        paths: batch,
        currentDir,
        centerIndex: effectiveCenter,
      });
    } catch (error) {
      console.error('❌ requestAllThumbnails failed:', error);
      break;
    }

    // 分帧发送，避免一次性塞满事件循环
    if (i + MAX_BATCH_SIZE < deduped.length) {
      await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS));
    }
  }
}

/**
 * 获取当前预取状态（用于调试）
 */
export function getPrefetchStats() {
  return {
    currentDir: prefetchState.lastDir,
    stayDuration: Date.now() - prefetchState.stayStartTime,
    prefetchCount: prefetchState.currentPrefetchCount,
  };
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
  if (unlistenThumbnailBatchReady) {
    unlistenThumbnailBatchReady();
    unlistenThumbnailBatchReady = null;
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
