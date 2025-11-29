/**
 * StackView 图片加载器
 * 
 * 独立的图片加载模块，不依赖旧的 NeoImageLoader
 * 直接从 bookStore2 获取图片数据
 */

import { writable, get } from 'svelte/store';
import { bookStore2 } from '$lib/stores/bookStore2';

// ============================================================================
// 类型定义
// ============================================================================

export interface ImageCacheEntry {
  url: string;
  physicalIndex: number;
  width?: number;
  height?: number;
  lastAccessed: number;
}

// ============================================================================
// 图片 URL 缓存
// ============================================================================

const urlCache = writable<Map<number, ImageCacheEntry>>(new Map());

/**
 * 获取或创建图片 URL
 */
export async function getImageUrl(physicalIndex: number): Promise<string | null> {
  const cache = get(urlCache);
  const cached = cache.get(physicalIndex);
  
  if (cached) {
    // 更新访问时间
    cached.lastAccessed = Date.now();
    return cached.url;
  }
  
  // 从 bookStore2 请求图片
  const blob = await bookStore2.requestImage(physicalIndex);
  if (!blob) {
    return null;
  }
  
  const url = URL.createObjectURL(blob);
  
  urlCache.update(c => {
    c.set(physicalIndex, {
      url,
      physicalIndex,
      lastAccessed: Date.now(),
    });
    return c;
  });
  
  return url;
}

/**
 * 更新图片尺寸信息
 */
export function updateImageSize(physicalIndex: number, width: number, height: number): void {
  urlCache.update(c => {
    const entry = c.get(physicalIndex);
    if (entry) {
      entry.width = width;
      entry.height = height;
    }
    return c;
  });
  
  // 同步更新到 bookStore2
  bookStore2.updatePhysicalPageSize(physicalIndex, width, height);
}

/**
 * 清除缓存
 */
export function clearImageCache(): void {
  const cache = get(urlCache);
  for (const entry of cache.values()) {
    URL.revokeObjectURL(entry.url);
  }
  urlCache.set(new Map());
}

/**
 * 清理过期缓存（保留最近访问的 N 个）
 */
export function cleanupCache(keepCount: number = 10): void {
  urlCache.update(cache => {
    if (cache.size <= keepCount) return cache;
    
    const entries = Array.from(cache.entries());
    entries.sort(([, a], [, b]) => b.lastAccessed - a.lastAccessed);
    
    const toRemove = entries.slice(keepCount);
    for (const [index, entry] of toRemove) {
      URL.revokeObjectURL(entry.url);
      cache.delete(index);
    }
    
    return cache;
  });
}

/**
 * 导出 URL 缓存 store（只读）
 */
export const imageUrlCache = {
  subscribe: urlCache.subscribe,
};
