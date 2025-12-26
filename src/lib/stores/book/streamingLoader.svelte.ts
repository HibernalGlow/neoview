/**
 * Book Store - 流式加载模块
 * 负责压缩包的流式扫描和增量加载
 */

import type { UnlistenFn } from '@tauri-apps/api/event';

/** 流式扫描状态 */
export interface StreamingState {
  /** 是否正在流式加载 */
  isStreaming: boolean;
  /** 已扫描的页面数 */
  scannedCount: number;
  /** 预估总页数 */
  estimatedTotal: number | null;
  /** 取消监听函数 */
  unlisten: UnlistenFn | null;
}

/** 流式扫描进度 */
export interface StreamingProgress {
  scanned: number;
  total: number | null;
}

/** 流式加载管理器 */
export class StreamingLoaderManager {
  private state = $state<StreamingState>({
    isStreaming: false,
    scannedCount: 0,
    estimatedTotal: null,
    unlisten: null,
  });

  /** 是否正在流式加载 */
  get isStreaming(): boolean {
    return this.state.isStreaming;
  }

  /** 流式加载进度 */
  get progress(): StreamingProgress {
    return {
      scanned: this.state.scannedCount,
      total: this.state.estimatedTotal,
    };
  }

  /** 开始流式扫描 */
  startStreaming(): void {
    this.state.isStreaming = true;
    this.state.scannedCount = 0;
    this.state.estimatedTotal = null;
  }

  /** 更新扫描进度 */
  updateProgress(scannedCount: number, estimatedTotal?: number | null): void {
    this.state.scannedCount = scannedCount;
    if (estimatedTotal !== undefined) {
      this.state.estimatedTotal = estimatedTotal;
    }
  }

  /** 完成流式扫描 */
  completeStreaming(totalCount: number): void {
    this.state.isStreaming = false;
    this.state.scannedCount = totalCount;
    this.state.estimatedTotal = totalCount;
    this.state.unlisten = null;
  }

  /** 设置取消监听函数 */
  setUnlisten(unlisten: UnlistenFn | null): void {
    this.state.unlisten = unlisten;
  }

  /** 取消流式扫描 */
  async cancel(): Promise<void> {
    if (this.state.unlisten) {
      this.state.unlisten();
      this.state.unlisten = null;
    }

    if (this.state.isStreaming) {
      try {
        const { cancelStreamingScan } = await import('$lib/api/streaming');
        await cancelStreamingScan();
      } catch (err) {
        console.warn('取消流式扫描失败:', err);
      }
      this.state.isStreaming = false;
    }
  }

  /** 重置状态 */
  reset(): void {
    this.state.isStreaming = false;
    this.state.scannedCount = 0;
    this.state.estimatedTotal = null;
    this.state.unlisten = null;
  }
}

// ==================== 工具函数 ====================

/** 检测路径是否为压缩包 */
export function isArchivePath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return ['zip', 'rar', '7z', 'cbz', 'cbr', 'cb7'].includes(ext);
}

/** 触发流式扫描进度事件 */
export function dispatchStreamingProgress(scannedCount: number, entries: unknown[]): void {
  window.dispatchEvent(new CustomEvent('streaming-scan-progress', {
    detail: { scannedCount, entries }
  }));
}

/** 触发流式扫描完成事件 */
export function dispatchStreamingComplete(totalCount: number): void {
  window.dispatchEvent(new CustomEvent('streaming-scan-complete', {
    detail: { totalCount }
  }));
}
