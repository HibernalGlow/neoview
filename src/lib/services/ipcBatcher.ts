/**
 * IpcBatcher - IPC 请求批处理器
 * 
 * 支持请求批处理、重试机制和流式传输
 * 
 * Requirements: 4.2, 4.4
 */

import { invoke } from '$lib/api/adapter';
import { perfMonitor } from '$lib/utils/perfMonitor';

export interface BatchRequest {
  id: string;
  command: string;
  args: Record<string, unknown>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

export interface IpcBatcherConfig {
  batchWindowMs: number;      // 批处理窗口时间
  maxBatchSize: number;       // 最大批次大小
  maxRetries: number;         // 最大重试次数
  retryDelays: number[];      // 重试延迟（指数退避）
  smallRequestThreshold: number; // 小请求阈值（字节）
}

const DEFAULT_CONFIG: IpcBatcherConfig = {
  batchWindowMs: 50,
  maxBatchSize: 10,
  maxRetries: 3,
  retryDelays: [50, 100, 200],
  smallRequestThreshold: 1024,
};

class IpcBatcherImpl {
  private config: IpcBatcherConfig = { ...DEFAULT_CONFIG };
  private pendingRequests: Map<string, BatchRequest> = new Map();
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private requestCounter: number = 0;

  /**
   * 设置配置
   */
  setConfig(config: Partial<IpcBatcherConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 发送请求（支持批处理和重试）
   */
  async invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    const startTime = performance.now();
    
    try {
      const result = await this.invokeWithRetry<T>(command, args);
      const latency = performance.now() - startTime;
      perfMonitor.record('ipcLatency', latency);
      return result;
    } catch (error) {
      const latency = performance.now() - startTime;
      perfMonitor.record('ipcLatency', latency);
      throw error;
    }
  }

  /**
   * 带重试的调用
   */
  private async invokeWithRetry<T>(
    command: string,
    args: Record<string, unknown>,
    retryCount: number = 0
  ): Promise<T> {
    try {
      return await invoke<T>(command, args);
    } catch (error) {
      const isRetryable = this.isRetryableError(error);
      
      if (isRetryable && retryCount < this.config.maxRetries) {
        const delay = this.config.retryDelays[retryCount] || this.config.retryDelays[this.config.retryDelays.length - 1];
        console.warn(`[IpcBatcher] Retry ${retryCount + 1}/${this.config.maxRetries} for ${command} after ${delay}ms`);
        
        await this.sleep(delay);
        return this.invokeWithRetry<T>(command, args, retryCount + 1);
      }
      
      throw error;
    }
  }

  /**
   * 批量请求（将多个小请求合并）
   */
  async batchInvoke<T>(
    requests: Array<{ command: string; args: Record<string, unknown> }>
  ): Promise<T[]> {
    // 如果只有一个请求，直接调用
    if (requests.length === 1) {
      const result = await this.invoke<T>(requests[0].command, requests[0].args);
      return [result];
    }

    // 并行执行所有请求
    const promises = requests.map(req => this.invoke<T>(req.command, req.args));
    return Promise.all(promises);
  }

  /**
   * 排队请求（用于批处理）
   */
  queueRequest<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = `req_${++this.requestCounter}`;
      const request: BatchRequest = {
        id,
        command,
        args,
        resolve: resolve as (value: unknown) => void,
        reject,
        timestamp: Date.now(),
      };

      this.pendingRequests.set(id, request);
      this.scheduleBatchProcessing();
    });
  }

  /**
   * 调度批处理
   */
  private scheduleBatchProcessing(): void {
    if (this.batchTimer) return;

    // 如果达到最大批次大小，立即处理
    if (this.pendingRequests.size >= this.config.maxBatchSize) {
      this.processBatch();
      return;
    }

    // 否则等待批处理窗口
    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;
      this.processBatch();
    }, this.config.batchWindowMs);
  }

  /**
   * 处理批次
   */
  private async processBatch(): Promise<void> {
    if (this.pendingRequests.size === 0) return;

    // 按命令分组
    const byCommand = new Map<string, BatchRequest[]>();
    for (const request of this.pendingRequests.values()) {
      const existing = byCommand.get(request.command) || [];
      existing.push(request);
      byCommand.set(request.command, existing);
    }

    this.pendingRequests.clear();

    // 并行处理每个命令组
    const promises: Promise<void>[] = [];
    for (const [command, requests] of byCommand) {
      promises.push(this.processCommandBatch(command, requests));
    }

    await Promise.all(promises);
  }

  /**
   * 处理单个命令的批次
   */
  private async processCommandBatch(command: string, requests: BatchRequest[]): Promise<void> {
    // 尝试使用批量命令（如果存在）
    const batchCommand = `batch_${command}`;
    
    try {
      // 尝试批量调用
      const argsArray = requests.map(r => r.args);
      const results = await this.invoke<unknown[]>(batchCommand, { requests: argsArray });
      
      // 分发结果
      for (let i = 0; i < requests.length; i++) {
        requests[i].resolve(results[i]);
      }
    } catch {
      // 批量命令不存在，回退到单独调用
      for (const request of requests) {
        try {
          const result = await this.invoke(request.command, request.args);
          request.resolve(result);
        } catch (error) {
          request.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
  }

  /**
   * 检查是否为可重试的错误
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('failed to fetch') ||
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('connection')
      );
    }
    return false;
  }

  /**
   * 睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 取消所有待处理请求
   */
  cancelAll(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    for (const request of this.pendingRequests.values()) {
      request.reject(new Error('Request cancelled'));
    }
    this.pendingRequests.clear();
  }

  /**
   * 获取统计
   */
  getStats(): { pendingCount: number } {
    return {
      pendingCount: this.pendingRequests.size,
    };
  }
}

// 单例导出
export const ipcBatcher = new IpcBatcherImpl();
