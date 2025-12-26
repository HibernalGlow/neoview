/**
 * 文件系统 API 类型定义
 * 包含所有共享的接口和类型
 */

import type { FsItem } from '$lib/types';

// ===== 目录快照相关类型 =====

/**
 * 目录快照
 */
export interface DirectorySnapshot {
  items: FsItem[];
  mtime?: number;
  cached: boolean;
}

/**
 * 批量目录快照结果
 */
export interface BatchDirectorySnapshotResult {
  path: string;
  snapshot: DirectorySnapshot | null;
  error: string | null;
}

/**
 * 子文件夹项（轻量级，专用于 FolderTree）
 */
export interface SubfolderItem {
  path: string;
  name: string;
  /** 是否有子目录（用于显示展开箭头） */
  hasChildren: boolean;
}

// ===== 回收站相关类型 =====

/**
 * 回收站项目信息
 */
export interface TrashItem {
  /** 原始文件名 */
  name: string;
  /** 原始路径 */
  originalPath: string;
  /** 删除时间（Unix 时间戳，秒） */
  deletedAt: number;
  /** 是否为目录 */
  isDir: boolean;
}

// ===== 压缩包相关类型 =====

/**
 * 从压缩包加载图片的选项
 */
export interface LoadImageFromArchiveOptions {
  traceId?: string;
  pageIndex?: number;
}

/**
 * 预加载结果
 */
export interface PreloadResult {
  total: number;
  success: number;
  failed: number;
  totalBytes: number;
  errors: string[] | null;
}

// ===== 流式操作相关类型 =====

/**
 * 目录批次数据
 */
export interface DirectoryBatch {
  items: FsItem[];
  batchIndex: number;
}

/**
 * 流进度信息
 */
export interface StreamProgress {
  loaded: number;
  estimatedTotal?: number;
  elapsedMs: number;
}

/**
 * 流错误信息（非致命）
 */
export interface StreamError {
  message: string;
  path?: string;
  skippedCount: number;
}

/**
 * 流完成信号
 */
export interface StreamComplete {
  totalItems: number;
  skippedItems: number;
  elapsedMs: number;
  fromCache: boolean;
}

/**
 * 流式输出类型
 */
export type DirectoryStreamOutput =
  | { type: 'Batch'; data: DirectoryBatch }
  | { type: 'Progress'; data: StreamProgress }
  | { type: 'Error'; data: StreamError }
  | { type: 'Complete'; data: StreamComplete };

/**
 * 搜索流输出类型
 */
export type SearchStreamOutput =
  | { type: 'Batch'; data: DirectoryBatch }
  | { type: 'Progress'; data: StreamProgress }
  | { type: 'Error'; data: StreamError }
  | { type: 'Complete'; data: StreamComplete };

/**
 * 流配置选项
 */
export interface StreamOptions {
  batchSize?: number;
  skipHidden?: boolean;
  sortBy?: string;
  sortOrder?: string;
}

/**
 * 流句柄
 */
export interface StreamHandle {
  streamId: string;
  cancel: () => Promise<void>;
}

/**
 * 流式目录加载回调
 */
export interface StreamCallbacks {
  onBatch?: (batch: DirectoryBatch) => void;
  onProgress?: (progress: StreamProgress) => void;
  onError?: (error: StreamError) => void;
  onComplete?: (complete: StreamComplete) => void;
}
