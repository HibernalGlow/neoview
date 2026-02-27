/**
 * NeoView - File Index API
 * 文件索引相关的 API 接口
 */

import { invoke } from '@tauri-apps/api/core';
import type { FsItem } from '$lib/types';

export interface IndexStats {
  totalFiles: number;
  totalDirs: number;
  totalImages: number;
  lastUpdated: number;
  indexedPaths: string[];
}

/**
 * 初始化文件索引
 */
export async function initializeFileIndex(): Promise<void> {
  return invoke('initialize_file_index');
}

/**
 * 构建文件索引
 * @param path 要索引的路径
 * @param recursive 是否递归索引子目录
 */
export async function buildFileIndex(path: string, recursive: boolean = true): Promise<void> {
  return invoke('build_file_index', { path, recursive });
}

/**
 * 获取索引统计信息
 */
export async function getIndexStats(): Promise<IndexStats> {
  return invoke('get_index_stats');
}

/**
 * 清除文件索引
 */
export async function clearFileIndex(): Promise<void> {
  return invoke('clear_file_index');
}

/**
 * 搜索索引中的文件和文件夹
 * @param query 搜索查询字符串
 * @param maxResults 最大结果数量
 * @param options 搜索选项
 */
export async function searchInIndex(
  query: string,
  maxResults: number = 100,
  options?: SearchInIndexOptions
): Promise<FsItem[]> {
  return invoke('search_in_index', { query, maxResults, options });
}

/**
 * 搜索选项
 */
export interface SearchInIndexOptions {
  /** 是否包含子文件夹 */
  includeSubfolders?: boolean;
  /** 是否只搜索图片文件 */
  imagesOnly?: boolean;
  /** 是否只搜索文件夹 */
  foldersOnly?: boolean;
  /** 文件大小过滤（最小字节数） */
  minSize?: number;
  /** 文件大小过滤（最大字节数） */
  maxSize?: number;
  /** 修改时间过滤（开始时间戳） */
  modifiedAfter?: number;
  /** 修改时间过滤（结束时间戳） */
  modifiedBefore?: number;
}

/**
 * 获取索引中的文件路径列表
 * @param path 父路径（可选）
 * @param recursive 是否递归获取子目录
 */
export async function getIndexedPaths(
  path?: string,
  recursive: boolean = false
): Promise<string[]> {
  return invoke('get_indexed_paths', { path, recursive });
}

/**
 * 检查路径是否已被索引
 * @param path 要检查的路径
 */
export async function isPathIndexed(path: string): Promise<boolean> {
  return invoke('is_path_indexed', { path });
}

/**
 * 获取索引进度
 */
export async function getIndexProgress(): Promise<IndexProgress> {
  return invoke('get_index_progress');
}

/**
 * 索引进度信息
 */
export interface IndexProgress {
  currentPath: string;
  processedFiles: number;
  totalFiles: number;
  isRunning: boolean;
}