/**
 * FolderStack 排序和过滤工具函数
 */

import type { FsItem } from '$lib/types';
import { folderRatingStore } from '$lib/stores/emm/folderRating';
import { collectTagCountStore } from '$lib/stores/emm/collectTagCountStore';
import { getDefaultRating } from '$lib/stores/emm/storage';
import { bookmarkStore } from '$lib/stores/bookmark.svelte';

// ============ 随机排序种子缓存 ============
const randomSeedCache = new Map<string, number>();
const MAX_SEED_CACHE_SIZE = 100;

export function getRandomSeedForPath(path: string): number {
  const normalizedPath = path.replace(/\\/g, '/').toLowerCase();
  if (randomSeedCache.has(normalizedPath)) {
    return randomSeedCache.get(normalizedPath)!;
  }
  const seed = Math.random() * 2147483647 | 0;
  if (randomSeedCache.size >= MAX_SEED_CACHE_SIZE) {
    const firstKey = randomSeedCache.keys().next().value;
    if (firstKey) randomSeedCache.delete(firstKey);
  }
  randomSeedCache.set(normalizedPath, seed);
  return seed;
}

export function seededRandom(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const shuffled = [...items];
  const random = seededRandom(seed);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 排序函数 - skipFolderFirst 用于虚拟路径，让文件夹和文件平等排序
 * path 参数用于随机排序种子记忆
 */
export function sortItems(
  items: FsItem[], 
  field: string, 
  order: string, 
  skipFolderFirst = false, 
  path?: string
): FsItem[] {
  const isBookmarkVirtualPath = !!path && path.startsWith('virtual://bookmark');
  const pinnedPathSet = isBookmarkVirtualPath ? bookmarkStore.getPinnedPathSet() : null;
  const comparePinned = (a: FsItem, b: FsItem): number => {
    if (!pinnedPathSet) return 0;
    const aPinned = pinnedPathSet.has(a.path);
    const bPinned = pinnedPathSet.has(b.path);
    if (aPinned === bPinned) return 0;
    return aPinned ? -1 : 1;
  };

  const prioritizePinned = (sortedItems: FsItem[]): FsItem[] => {
    if (!pinnedPathSet) return sortedItems;
    return [...sortedItems].sort((a, b) => comparePinned(a, b));
  };

  // 随机排序特殊处理
  if (field === 'random') {
    const seed = path ? getRandomSeedForPath(path) : Math.random() * 2147483647 | 0;
    if (skipFolderFirst) {
      return prioritizePinned(seededShuffle(items, seed));
    }
    const folders = items.filter(item => item.isDir);
    const files = items.filter(item => !item.isDir);
    const shuffledFolders = seededShuffle(folders, seed);
    const shuffledFiles = seededShuffle(files, seed + 1);
    const result = [...shuffledFolders, ...shuffledFiles];
    return prioritizePinned(order === 'asc' ? result : result.reverse());
  }

  // rating 排序特殊处理
  if (field === 'rating') {
    const defaultRating = getDefaultRating();
    const sorted = [...items].sort((a, b) => {
      const pinnedComparison = comparePinned(a, b);
      if (pinnedComparison !== 0) return pinnedComparison;
      if (!skipFolderFirst && a.isDir !== b.isDir) {
        return a.isDir ? -1 : 1;
      }
      const ratingA = folderRatingStore.getEffectiveRating(a.path) ?? defaultRating;
      const ratingB = folderRatingStore.getEffectiveRating(b.path) ?? defaultRating;
      if (ratingA === ratingB) {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      }
      const comparison = ratingA - ratingB;
      return order === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }

  // collectTagCount 排序特殊处理
  if (field === 'collectTagCount') {
    const sorted = [...items].sort((a, b) => {
      const pinnedComparison = comparePinned(a, b);
      if (pinnedComparison !== 0) return pinnedComparison;
      if (!skipFolderFirst && a.isDir !== b.isDir) {
        return a.isDir ? -1 : 1;
      }
      const countA = collectTagCountStore.getCount(a.path);
      const countB = collectTagCountStore.getCount(b.path);
      if (countA === countB) {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      }
      const comparison = countA - countB;
      return order === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }

  const sorted = [...items].sort((a, b) => {
    const pinnedComparison = comparePinned(a, b);
    if (pinnedComparison !== 0) return pinnedComparison;

    if (!skipFolderFirst && a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1;
    }

    let comparison = 0;
    switch (field) {
      case 'name':
        comparison = a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: 'base'
        });
        break;
      case 'date':
        comparison = (a.modified || 0) - (b.modified || 0);
        break;
      case 'size':
        comparison = (a.size || 0) - (b.size || 0);
        break;
      case 'type': {
        const extA = a.name.split('.').pop()?.toLowerCase() || '';
        const extB = b.name.split('.').pop()?.toLowerCase() || '';
        comparison = extA.localeCompare(extB);
        break;
      }
    }

    return order === 'desc' ? -comparison : comparison;
  });
  return sorted;
}

/**
 * 过滤函数
 */
export function filterItems(items: FsItem[], keyword: string): FsItem[] {
  if (!keyword.trim()) return items;
  const lowerKeyword = keyword.toLowerCase();
  return items.filter((item) => item.name.toLowerCase().includes(lowerKeyword));
}
