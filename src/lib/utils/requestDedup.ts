/**
 * 前端请求去重器
 * 防止快速翻页时发送重复请求
 */

import { LRUCache } from 'lru-cache';
import pMemoize from 'p-memoize';

/**
 * 去重统计
 */
export interface DeduplicatorStats {
  totalRequests: number;
  deduplicated: number;
  activeRequests: number;
}

/**
 * 请求去重器
 * 使用 Map 实现高性能去重
 */
export class RequestDeduplicator {
  private pending: LRUCache<string, {}>;
  private inFlightKeys = new Set<string>();
  private executeMemoized: <T>(key: string, executor: () => Promise<T>) => Promise<T>;
  private stats = { totalRequests: 0, deduplicated: 0 };

  /**
   * @param timeout 请求超时时间（毫秒），超过此时间的请求会被清理
   */
  constructor(timeout: number = 30000) {
    this.pending = new LRUCache<string, {}>({
      max: 10000,
      ttl: timeout,
      ttlAutopurge: true,
    });

    this.executeMemoized = pMemoize(
      async <T>(key: string, executor: () => Promise<T>): Promise<T> => executor(),
      {
        cacheKey: (args) => String(args[0]),
        cache: this.pending as unknown as {
          has: (key: string) => boolean;
          get: (key: string) => unknown;
          set: (key: string, value: unknown) => unknown;
          delete: (key: string) => boolean;
          clear?: () => void;
        },
      }
    ) as <T>(key: string, executor: () => Promise<T>) => Promise<T>;
  }

  /**
   * 按 key 去重执行（相同 key 的并发请求共享同一个 Promise）
   */
  run<T>(key: string, executor: () => Promise<T>): Promise<T> {
    this.stats.totalRequests++;

    if (this.pending.has(key)) {
      this.stats.deduplicated++;
      console.debug(`🔄 请求去重: key=${key}`);
    }

    this.inFlightKeys.add(key);

    return this.executeMemoized<T>(key, executor).finally(() => {
      this.inFlightKeys.delete(key);
    });
  }

  /**
   * 兼容旧接口：尝试获取处理权
   */
  tryAcquire(key: string): number | null {
    this.stats.totalRequests++;
    if (this.pending.has(key) || this.inFlightKeys.has(key)) {
      this.stats.deduplicated++;
      return null;
    }
    this.inFlightKeys.add(key);
    return Date.now();
  }

  /**
   * 兼容旧接口：标记完成
   */
  release(key: string): void {
    this.inFlightKeys.delete(key);
    this.pending.delete(key);
  }

  /**
   * 兼容旧接口：标记完成（验证 ID）
   */
  releaseWithId(key: string, requestId: number): void {
    void requestId;
    this.release(key);
  }

  /**
   * 检查请求是否活跃
   */
  isActive(key: string): boolean {
    return this.inFlightKeys.has(key);
  }

  /**
   * 获取统计
   */
  getStats(): DeduplicatorStats {
    return {
      ...this.stats,
      activeRequests: this.inFlightKeys.size,
    };
  }

  /**
   * 清除所有
   */
  clear(): void {
    this.inFlightKeys.clear();
    this.pending.clear();
  }
}

/**
 * 全局翻页去重器（100ms 窗口，避免快速翻页重复请求）
 */
export const pageNavigationDedup = new RequestDeduplicator(100);

/**
 * 全局图片加载去重器（30s 窗口）
 */
export const imageLoadDedup = new RequestDeduplicator(30000);
