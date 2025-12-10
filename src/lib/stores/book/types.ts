/**
 * Book Store - 类型定义
 */

import type { BookInfo } from '$lib/types';
import type { SvelteMap } from 'svelte/reactivity';

// Re-export for convenience
export type { BookInfo };

// ==================== 内容引用 ====================

export interface ContentRef {
  path: string;
  innerPath?: string;
}

// ==================== 状态接口 ====================

export interface BookState {
  currentBook: BookInfo | null;
  loading: boolean;
  error: string;
  viewerOpen: boolean;
  upscaledImageData: string | null;
  // 【路径栈】用于精确记录当前位置（支持嵌套）
  pathStack: ContentRef[];
  // 【单文件模式】打开单个视频/图片时启用
  singleFileMode: boolean;
  originalFilePath: string | null;
}

export interface OpenBookOptions {
  /** 打开时希望跳转到的页面 */
  initialPage?: number;
  /** 跳过添加历史记录 */
  skipHistory?: boolean;
}

// ==================== Toast 上下文 ====================

export interface SwitchToastBookContext {
  name: string;
  displayName: string;
  path: string;
  type: string;
  totalPages: number;
  currentPageIndex: number;
  currentPageDisplay: number;
  progressPercent: number | null;
  emmTranslatedTitle?: string;
  emmRating?: number | null;
  emmTags?: Record<string, string[]> | undefined;
  emmRaw?: Record<string, unknown> | undefined;
}

export interface SwitchToastPageContext {
  name: string;
  displayName: string;
  path: string;
  innerPath?: string;
  index: number;
  indexDisplay: number;
  width?: number;
  height?: number;
  dimensionsFormatted?: string;
  size?: number;
  sizeFormatted?: string;
}

export interface SwitchToastContext {
  book: SwitchToastBookContext | null;
  page: SwitchToastPageContext | null;
}

// ==================== 超分缓存 ====================

export interface UpscaleCacheEntry {
  model: string;
  scale: number;
  cachePath: string;
  originalPath: string;
  innerPath?: string;
  timestamp: number;
}

export type UpscaleStatus = 'none' | 'preupscaled' | 'done' | 'failed';

export type UpscaleStatusMap = SvelteMap<number, UpscaleStatus>;
export type UpscaleCacheMap = SvelteMap<string, SvelteMap<string, UpscaleCacheEntry>>;

// 常量已移至 utils.ts
