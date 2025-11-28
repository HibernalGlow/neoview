/**
 * BookBridge - 新旧系统桥接层
 * 
 * 提供新系统 (bookStore2) 与旧系统 (bookStore) 之间的兼容接口
 * 允许渐进式迁移，两个系统可以共存
 */

import type { BookInfo, Page } from '$lib/types';

// ============================================================================
// 类型转换
// ============================================================================

/**
 * 将旧系统的 BookInfo 转换为新系统需要的文件列表格式
 */
export function bookInfoToFileList(book: BookInfo): Array<{
  path: string;
  name: string;
  size: number;
  lastModified: number;
  width?: number;
  height?: number;
}> {
  return book.pages.map((page) => ({
    path: page.path,
    name: page.name,
    size: page.size ?? 0,
    lastModified: 0,
    width: page.width,
    height: page.height,
  }));
}

/**
 * 将旧系统的 Page 转换为新系统的 PhysicalPage 格式
 */
export function pageToPhysicalPageData(page: Page, index: number): {
  index: number;
  path: string;
  name: string;
  size: number;
  width: number;
  height: number;
  aspectRatio: number;
  isLandscape: boolean;
} {
  const width = page.width ?? 0;
  const height = page.height ?? 0;
  const aspectRatio = height > 0 ? width / height : 1;
  
  return {
    index,
    path: page.path,
    name: page.name,
    size: page.size ?? 0,
    width,
    height,
    aspectRatio,
    isLandscape: aspectRatio > 1,
  };
}
