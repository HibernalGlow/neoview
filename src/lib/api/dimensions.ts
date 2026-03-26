/**
 * 页面尺寸扫描 API
 */

import { invoke } from '@tauri-apps/api/core';
import type { Page } from '$lib/types';

/** 扫描结果 */
export interface ScanResult {
  scannedCount: number;
  cachedCount: number;
  failedCount: number;
  durationMs: number;
}

/**
 * 开始扫描书籍中所有页面的尺寸
 */
export async function startDimensionScan(
  bookPath: string,
  bookType: string,
  pages: Page[]
): Promise<ScanResult> {
  return await invoke<ScanResult>('start_dimension_scan', {
    bookPath,
    bookType,
    pages,
  });
}

/**
 * 取消当前扫描
 */
export async function cancelDimensionScan(): Promise<void> {
  await invoke('cancel_dimension_scan');
}

/**
 * 获取缓存的页面尺寸
 */
export async function getCachedDimensions(
  stableHash: string,
  modified?: number | null
): Promise<[number, number] | null> {
  return await invoke<[number, number] | null>('get_cached_dimensions', {
    stableHash,
    modified: modified ?? null,
  });
}
