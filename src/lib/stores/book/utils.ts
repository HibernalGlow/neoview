/**
 * Book Store - 工具函数
 */

import type { EMMMetadata } from '$lib/api/emm';

// ==================== 常量 ====================

export const PAGE_WINDOW_PADDING = 8;
export const JUMP_HISTORY_LIMIT = 20;

/**
 * 格式化字节大小（简短格式）
 */
export function formatBytesShort(bytes?: number): string | null {
  if (bytes === undefined || bytes === null) return null;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

/**
 * 格式化书籍类型标签
 */
export function formatBookTypeLabel(type?: string): string | null {
  if (!type) return null;
  switch (type.toLowerCase()) {
    case 'folder':
      return '文件夹';
    case 'archive':
      return '压缩包';
    case 'pdf':
      return 'PDF';
    case 'media':
      return '媒体';
    default:
      return type;
  }
}

/**
 * 映射 EMM 元数据到原始格式
 */
export function mapEmmToRaw(emm: EMMMetadata): Record<string, unknown> {
  // 使用展开运算符复制所有属性
  const raw: Record<string, unknown> = { ...emm };
  // 转换 snake_case 为 camelCase 常用字段
  if ('cover_path' in emm) raw.coverPath = emm.cover_path;
  if ('page_count' in emm) raw.pageCount = emm.page_count;
  if ('bundle_size' in emm) raw.bundleSize = emm.bundle_size;
  if ('translated_title' in emm) raw.translatedTitle = emm.translated_title;
  return raw;
}

/**
 * 计算页面窗口状态
 */
export function computePageWindowState(
  currentIndex: number,
  totalPages: number,
  radius: number
): { startIndex: number; endIndex: number; windowSize: number } {
  const windowSize = radius * 2 + 1;
  let startIndex = Math.max(0, currentIndex - radius);
  let endIndex = Math.min(totalPages - 1, currentIndex + radius);

  // 调整窗口以保持大小
  if (endIndex - startIndex + 1 < windowSize) {
    if (startIndex === 0) {
      endIndex = Math.min(totalPages - 1, windowSize - 1);
    } else if (endIndex === totalPages - 1) {
      startIndex = Math.max(0, totalPages - windowSize);
    }
  }

  return { startIndex, endIndex, windowSize };
}

/**
 * 限制初始页码到有效范围
 */
export function clampInitialPage(totalPages: number, requested?: number): number {
  if (totalPages <= 0) return 0;
  if (requested === undefined || requested === null || Number.isNaN(requested)) {
    return 0;
  }
  const safeValue = Math.trunc(requested);
  const maxIndex = Math.max(totalPages - 1, 0);
  return Math.min(Math.max(safeValue, 0), maxIndex);
}
