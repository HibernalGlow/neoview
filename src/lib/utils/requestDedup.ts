/**
 * 前端请求去重器
 * 防止快速翻页时发送重复请求
 */

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
  private pending = new Map<string, { timestamp: number; requestId: number }>();
  private nextId = 0;
  private stats = { totalRequests: 0, deduplicated: 0 };
  private timeout: number;

  /**
   * @param timeout 请求超时时间（毫秒），超过此时间的请求会被清理
   */
  constructor(timeout: number = 30000) {
    this.timeout = timeout;
  }

  /**
   * 尝试获取处理权
   * @returns requestId 如果可以处理，null 如果应跳过
   */
  tryAcquire(key: string): number | null {
    this.stats.totalRequests++;
    const now = Date.now();

    // 清理过期请求
    this.cleanupExpired(now);

    // 检查是否已有相同请求
    const existing = this.pending.get(key);
    if (existing && now - existing.timestamp < this.timeout) {
      this.stats.deduplicated++;
      console.debug(`🔄 请求去重: key=${key}`);
      return null;
    }

    // 分配新的请求 ID
    const requestId = ++this.nextId;
    this.pending.set(key, { timestamp: now, requestId });
    return requestId;
  }

  /**
   * 标记请求完成
   */
  release(key: string): void {
    this.pending.delete(key);
  }

  /**
   * 标记请求完成（验证 ID）
   */
  releaseWithId(key: string, requestId: number): void {
    const existing = this.pending.get(key);
    if (existing && existing.requestId === requestId) {
      this.pending.delete(key);
    }
  }

  /**
   * 检查请求是否活跃
   */
  isActive(key: string): boolean {
    return this.pending.has(key);
  }

  /**
   * 获取统计
   */
  getStats(): DeduplicatorStats {
    return {
      ...this.stats,
      activeRequests: this.pending.size,
    };
  }

  /**
   * 清除所有
   */
  clear(): void {
    this.pending.clear();
  }

  /**
   * 清理过期请求
   */
  private cleanupExpired(now: number): void {
    for (const [key, state] of this.pending.entries()) {
      if (now - state.timestamp > this.timeout) {
        this.pending.delete(key);
      }
    }
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
