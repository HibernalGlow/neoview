/**
 * 页面尺寸扫描事件监听器
 * 监听后端的尺寸扫描进度和完成事件，更新 bookStore
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { bookStore } from './book.svelte';

/** 尺寸更新条目 */
interface DimensionUpdate {
  pageIndex: number;
  width: number;
  height: number;
}

/** 扫描进度事件 */
interface DimensionScanProgress {
  bookPath: string;
  updates: DimensionUpdate[];
  progress: number;
  scanId?: number;
}

/** 扫描完成事件 */
interface DimensionScanComplete {
  bookPath: string;
  scannedCount: number;
  cachedCount: number;
  failedCount: number;
  durationMs: number;
  scanId?: number;
}

let progressUnlisten: UnlistenFn | null = null;
let completeUnlisten: UnlistenFn | null = null;
const latestScanIdByBookPath = new Map<string, number>();

function shouldIgnoreStaleScanEvent(bookPath: string, scanId?: number): boolean {
  if (scanId === undefined) {
    return false;
  }

  const latestScanId = latestScanIdByBookPath.get(bookPath);
  if (latestScanId !== undefined && scanId < latestScanId) {
    return true;
  }

  if (latestScanId === undefined || scanId > latestScanId) {
    latestScanIdByBookPath.set(bookPath, scanId);
  }

  return false;
}

/**
 * 初始化尺寸扫描事件监听
 */
export async function initDimensionScanListener(): Promise<void> {
  // 清理旧的监听器
  await cleanupDimensionScanListener();

  // 监听扫描进度事件
  progressUnlisten = await listen<DimensionScanProgress>(
    'dimension-scan-progress',
    (event) => {
      const { bookPath, updates, progress, scanId } = event.payload;
      
      // 确保是当前书籍的更新
      if (bookStore.currentBook?.path !== bookPath) {
        return;
      }

      // 过滤旧扫描代际事件，避免无效批量更新
      if (shouldIgnoreStaleScanEvent(bookPath, scanId)) {
        return;
      }

      // 批量更新页面尺寸
      if (updates.length > 0) {
        bookStore.updatePageDimensionsBatch(updates);
        console.log(`📐 尺寸扫描进度: ${Math.round(progress * 100)}% (${updates.length} 页更新)`);
      }
    }
  );

  // 监听扫描完成事件
  completeUnlisten = await listen<DimensionScanComplete>(
    'dimension-scan-complete',
    (event) => {
      const { bookPath, scannedCount, cachedCount, failedCount, durationMs, scanId } = event.payload;
      
      // 确保是当前书籍的更新
      if (bookStore.currentBook?.path !== bookPath) {
        return;
      }

      // 过滤旧扫描代际事件，避免过期完成事件扰动状态
      if (shouldIgnoreStaleScanEvent(bookPath, scanId)) {
        return;
      }

      console.log(
        `✅ 尺寸扫描完成: scanned=${scannedCount}, cached=${cachedCount}, failed=${failedCount}, duration=${durationMs}ms`
      );
    }
  );

  console.log('📐 尺寸扫描事件监听器已初始化');
}

/**
 * 清理尺寸扫描事件监听
 */
export async function cleanupDimensionScanListener(): Promise<void> {
  if (progressUnlisten) {
    progressUnlisten();
    progressUnlisten = null;
  }
  if (completeUnlisten) {
    completeUnlisten();
    completeUnlisten = null;
  }
  latestScanIdByBookPath.clear();
}
