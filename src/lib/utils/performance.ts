/**
 * 性能监控和优化工具
 */

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics = new Map<string, number[]>();
  private observers: PerformanceObserver[] = [];

  private constructor() {
    this.setupObservers();
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * 记录性能指标
   */
  recordMetric(name: string, value: number) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const values = this.metrics.get(name)!;
    values.push(value);
    
    // 只保留最近100个值
    if (values.length > 100) {
      values.shift();
    }
  }

  /**
   * 测量函数执行时间
   */
  async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const startTime = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - startTime;
      this.recordMetric(`${name}_duration`, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordMetric(`${name}_error_duration`, duration);
      throw error;
    }
  }

  /**
   * 测量同步函数执行时间
   */
  measure<T>(name: string, fn: () => T): T {
    const startTime = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - startTime;
      this.recordMetric(`${name}_duration`, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordMetric(`${name}_error_duration`, duration);
      throw error;
    }
  }

  /**
   * 获取指标统计
   */
  getMetricStats(name: string) {
    const values = this.metrics.get(name) || [];
    if (values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    
    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / values.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      recent: values.slice(-10)
    };
  }

  /**
   * 获取所有指标
   */
  getAllMetrics() {
    const result: Record<string, any> = {};
    for (const [name] of this.metrics) {
      result[name] = this.getMetricStats(name);
    }
    return result;
  }

  /**
   * 设置性能观察器
   */
  private setupObservers() {
    // 观察长任务
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'longtask') {
              this.recordMetric('longtask_duration', entry.duration);
              console.warn('⚠️ Long task detected:', entry.duration, 'ms');
            }
          }
        });
        observer.observe({ entryTypes: ['longtask'] });
        this.observers.push(observer);
      } catch (e) {
        console.debug('Long task observer not supported:', e);
      }
    }
  }

  /**
   * 清理观察器
   */
  cleanup() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: number | null = null;
  
  return (...args: Parameters<T>) => {
    const now = Date.now();
    
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    } else {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        fn(...args);
      }, delay - (now - lastCall));
    }
  };
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: number | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

/**
 * 使用 requestIdleCallback 调度任务（SSR安全）
 */
export function scheduleIdleTask(
  fn: () => void,
  timeout: number = 5000
): void {
  // SSR容错：检查是否在浏览器环境
  if (typeof window === 'undefined') {
    // 服务器端直接执行
    setTimeout(fn, 0);
    return;
  }

  if ('requestIdleCallback' in window) {
    requestIdleCallback(
      () => fn(),
      { timeout }
    );
  } else {
    // 降级到 setTimeout
    setTimeout(fn, 1);
  }
}

/**
 * 批量处理函数
 */
export function createBatchProcessor<T>(
  processor: (items: T[]) => void,
  batchSize: number = 10,
  delay: number = 16
) {
  let batch: T[] = [];
  let timeoutId: number | null = null;
  
  return {
    add(item: T) {
      batch.push(item);
      
      if (batch.length >= batchSize) {
        flush();
      } else if (!timeoutId) {
        timeoutId = setTimeout(flush, delay);
      }
    },
    
    flush() {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      if (batch.length > 0) {
        const itemsToProcess = batch;
        batch = [];
        processor(itemsToProcess);
      }
    }
  };
  
  function flush() {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    
    if (batch.length > 0) {
      const itemsToProcess = batch;
      batch = [];
      processor(itemsToProcess);
    }
  }
}

/**
 * 内存使用监控（SSR安全）
 */
export function getMemoryUsage() {
  // SSR容错：检查是否在浏览器环境
  if (typeof window === 'undefined' || typeof performance === 'undefined') {
    return null;
  }

  if ('memory' in performance) {
    const memory = (performance as any).memory;
    return {
      used: Math.round(memory.usedJSHeapSize / 1048576), // MB
      total: Math.round(memory.totalJSHeapSize / 1048576), // MB
      limit: Math.round(memory.jsHeapSizeLimit / 1048576) // MB
    };
  }
  return null;
}

/**
 * 检查是否为低性能设备（SSR安全）
 */
export function isLowPerformanceDevice(): boolean {
  // SSR容错：检查是否在浏览器环境
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return true; // 保守假设为低性能设备
  }
  
  // 基于硬件并发数和内存判断
  const hardwareConcurrency = navigator.hardwareConcurrency || 4;
  const memory = getMemoryUsage();
  
  return (
    hardwareConcurrency <= 2 ||
    (memory && memory.limit <= 1024) // 1GB 或更少
  );
}

/**
 * 自适应性能配置
 */
export function getAdaptivePerformanceConfig() {
  const isLowPerf = isLowPerformanceDevice();
  
  return {
    // 虚拟滚动配置
    virtualScroll: {
      overscan: isLowPerf ? 3 : 5,
      throttleDelay: isLowPerf ? 32 : 16,
      batchSize: isLowPerf ? 20 : 50
    },
    
    // 缩略图队列配置
    thumbnailQueue: {
      maxConcurrentLocal: isLowPerf ? 2 : 4,
      maxConcurrentArchive: isLowPerf ? 1 : 2,
      batchSize: isLowPerf ? 5 : 10
    },
    
    // 缓存配置
    cache: {
      maxSize: isLowPerf ? 10 : 20,
      timeout: isLowPerf ? 3 * 60 * 1000 : 5 * 60 * 1000 // 3分钟 vs 5分钟
    }
  };
}