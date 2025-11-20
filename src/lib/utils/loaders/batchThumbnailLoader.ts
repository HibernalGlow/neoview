/**
 * 批量缩略图加载器
 * 支持批量加载、增量加载、优先级队列
 */

import { invoke } from '@tauri-apps/api/core';

export interface BatchLoadOptions {
  batchSize?: number;           // 批次大小
  incremental?: boolean;        // 是否增量加载
  onBatchReady?: (results: Map<string, string>) => void;  // 批次就绪回调
  priority?: 'high' | 'normal' | 'low';
}

export interface LoadResult {
  path: string;
  blobUrl: string;
}

/**
 * 批量缩略图加载器
 * 管理批量查询、增量加载、优先级调度
 */
export class BatchThumbnailLoader {
  private readonly DEFAULT_BATCH_SIZE = 50;
  private readonly INCREMENTAL_BATCH_SIZE = 10;

  /**
   * 批量加载缩略图（普通模式）
   */
  async batchLoad(paths: string[]): Promise<Map<string, string>> {
    if (paths.length === 0) {
      return new Map();
    }

    const results = new Map<string, string>();

    try {
      // 调用后端批量查询
      const response = await invoke<Array<[string, string]>>('batch_load_thumbnails_from_db', {
        paths,
      });

      // 处理响应，转换为 blob URL
      for (const [path, blobKey] of response) {
        const blobUrl = await this.blobKeyToUrl(blobKey);
        if (blobUrl) {
          results.set(path, blobUrl);
        }
      }

      if (import.meta.env.DEV && results.size > 0) {
        console.log(`✅ 批量加载 ${results.size}/${paths.length} 个缩略图`);
      }
    } catch (error) {
      console.debug('批量加载缩略图失败:', error);
    }

    return results;
  }

  /**
   * 增量批量加载（流式加载）
   * 边查询边显示，减少首屏等待
   */
  async incrementalLoad(
    paths: string[],
    onBatchReady: (results: Map<string, string>) => void
  ): Promise<void> {
    if (paths.length === 0) {
      return;
    }

    const allResults = new Map<string, string>();
    const miniB atchSize = this.INCREMENTAL_BATCH_SIZE;

    for (let i = 0; i < paths.length; i += miniBatchSize) {
      const batch = paths.slice(i, i + miniBatchSize);

      try {
        const batchResults = await this.batchLoad(batch);

        // 合并结果
        batchResults.forEach((url, path) => {
          allResults.set(path, url);
        });

        // 立即触发回调，显示这一批
        if (batchResults.size > 0) {
          onBatchReady(batchResults);
        }

        // 短暂延迟给 UI 反应时间
        if (i + miniBatchSize < paths.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      } catch (error) {
        console.debug(`增量批次 ${i} 加载失败:`, error);
      }
    }

    if (import.meta.env.DEV) {
      console.log(`✅ 增量加载完成: ${allResults.size}/${paths.length} 个缩略图`);
    }
  }

  /**
   * 智能批量加载（自动选择模式）
   */
  async smartLoad(
    paths: string[],
    options: BatchLoadOptions = {}
  ): Promise<Map<string, string>> {
    const {
      batchSize = this.DEFAULT_BATCH_SIZE,
      incremental = false,
      onBatchReady,
    } = options;

    // 增量模式
    if (incremental && onBatchReady) {
      await this.incrementalLoad(paths, onBatchReady);
      return new Map();  // 增量模式通过回调返回
    }

    // 普通批量加载（分批）
    const results = new Map<string, string>();

    for (let i = 0; i < paths.length; i += batchSize) {
      const batch = paths.slice(i, i + batchSize);
      const batchResults = await this.batchLoad(batch);

      batchResults.forEach((url, path) => {
        results.set(path, url);
      });
    }

    return results;
  }

  /**
   * 将 blob key 转换为 blob URL
   */
  private async blobKeyToUrl(blobKey: string): Promise<string | null> {
    try {
      const blobData = await invoke<number[] | null>('get_thumbnail_blob_data', {
        blobKey,
      });

      if (blobData && blobData.length > 0) {
        const uint8Array = new Uint8Array(blobData);
        const blob = new Blob([uint8Array], { type: 'image/webp' });
        return URL.createObjectURL(blob);
      }
    } catch (error) {
      console.debug('获取 blob 数据失败:', blobKey, error);
    }

    return null;
  }
}

/**
 * 单例导出
 */
export const batchThumbnailLoader = new BatchThumbnailLoader();
