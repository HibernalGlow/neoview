/**
 * Utils - 工具函数
 * 
 * 提供防抖、节流、去重等常用工具
 */

// ============================================================================
// 防抖
// ============================================================================

/**
 * 防抖函数
 * @param fn 要防抖的函数
 * @param delay 延迟时间 (ms)
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (this: unknown, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn.apply(this, args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * 带立即执行的防抖函数
 */
export function debounceImmediate<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastCallTime = 0;

  return function (this: unknown, ...args: Parameters<T>) {
    const now = Date.now();

    if (now - lastCallTime >= delay) {
      // 立即执行
      fn.apply(this, args);
      lastCallTime = now;
    } else {
      // 延迟执行
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        fn.apply(this, args);
        lastCallTime = Date.now();
        timeoutId = null;
      }, delay - (now - lastCallTime));
    }
  };
}

// ============================================================================
// 节流
// ============================================================================

/**
 * 节流函数
 * @param fn 要节流的函数
 * @param limit 时间限制 (ms)
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let lastCallTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (this: unknown, ...args: Parameters<T>) {
    const now = Date.now();

    if (now - lastCallTime >= limit) {
      fn.apply(this, args);
      lastCallTime = now;
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        fn.apply(this, args);
        lastCallTime = Date.now();
        timeoutId = null;
      }, limit - (now - lastCallTime));
    }
  };
}

/**
 * 带取消功能的节流函数
 */
export function throttleWithCancel<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): {
  (...args: Parameters<T>): void;
  cancel: () => void;
} {
  let lastCallTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const throttled = function (this: unknown, ...args: Parameters<T>) {
    const now = Date.now();

    if (now - lastCallTime >= limit) {
      fn.apply(this, args);
      lastCallTime = now;
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        fn.apply(this, args);
        lastCallTime = Date.now();
        timeoutId = null;
      }, limit - (now - lastCallTime));
    }
  };

  throttled.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return throttled;
}

// ============================================================================
// 去重执行
// ============================================================================

/**
 * 创建一个只执行一次的函数
 */
export function once<T extends (...args: unknown[]) => unknown>(
  fn: T
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  let called = false;
  let result: ReturnType<T> | undefined;

  return function (this: unknown, ...args: Parameters<T>) {
    if (!called) {
      called = true;
      result = fn.apply(this, args) as ReturnType<T>;
    }
    return result;
  };
}

/**
 * 创建一个可重置的只执行一次函数
 */
export function onceResettable<T extends (...args: unknown[]) => unknown>(
  fn: T
): {
  (...args: Parameters<T>): ReturnType<T> | undefined;
  reset: () => void;
} {
  let called = false;
  let result: ReturnType<T> | undefined;

  const wrapped = function (this: unknown, ...args: Parameters<T>) {
    if (!called) {
      called = true;
      result = fn.apply(this, args) as ReturnType<T>;
    }
    return result;
  };

  wrapped.reset = () => {
    called = false;
    result = undefined;
  };

  return wrapped;
}

// ============================================================================
// 批量执行
// ============================================================================

/**
 * 批量执行函数
 * 收集多次调用，在下一帧统一执行
 */
export function batch<T>(
  fn: (items: T[]) => void
): (item: T) => void {
  let items: T[] = [];
  let scheduled = false;

  return (item: T) => {
    items.push(item);

    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(() => {
        const batch = items;
        items = [];
        scheduled = false;
        fn(batch);
      });
    }
  };
}

/**
 * 带延迟的批量执行
 */
export function batchWithDelay<T>(
  fn: (items: T[]) => void,
  delay: number
): {
  add: (item: T) => void;
  flush: () => void;
} {
  let items: T[] = [];
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (items.length > 0) {
      const batch = items;
      items = [];
      fn(batch);
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const add = (item: T) => {
    items.push(item);

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(flush, delay);
  };

  return { add, flush };
}

// ============================================================================
// 异步工具
// ============================================================================

/**
 * 延迟执行
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带超时的 Promise
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutError?: Error
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(timeoutError ?? new Error(`Timeout after ${ms}ms`));
    }, ms);

    promise
      .then(result => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * 重试函数
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delay?: number;
    backoff?: number;
    shouldRetry?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delay: initialDelay = 1000,
    backoff = 2,
    shouldRetry = () => true,
  } = options;

  let lastError: Error | undefined;
  let currentDelay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxAttempts || !shouldRetry(lastError)) {
        throw lastError;
      }

      await delay(currentDelay);
      currentDelay *= backoff;
    }
  }

  throw lastError;
}

// ============================================================================
// 数组工具
// ============================================================================

/**
 * 数组分块
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * 数组去重
 */
export function unique<T>(array: T[], keyFn?: (item: T) => unknown): T[] {
  if (keyFn) {
    const seen = new Set();
    return array.filter(item => {
      const key = keyFn(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return [...new Set(array)];
}

/**
 * 数组范围
 */
export function range(start: number, end: number, step: number = 1): number[] {
  const result: number[] = [];
  for (let i = start; i < end; i += step) {
    result.push(i);
  }
  return result;
}

// ============================================================================
// 对象工具
// ============================================================================

/**
 * 深拷贝
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as T;
  }

  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * 深度合并
 */
export function deepMerge<T extends object>(target: T, ...sources: Partial<T>[]): T {
  for (const source of sources) {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const targetValue = target[key as keyof T];
        const sourceValue = source[key as keyof T];

        if (
          sourceValue !== undefined &&
          typeof sourceValue === 'object' &&
          sourceValue !== null &&
          !Array.isArray(sourceValue) &&
          typeof targetValue === 'object' &&
          targetValue !== null &&
          !Array.isArray(targetValue)
        ) {
          target[key as keyof T] = deepMerge(
            { ...targetValue } as object,
            sourceValue as object
          ) as T[keyof T];
        } else if (sourceValue !== undefined) {
          target[key as keyof T] = sourceValue as T[keyof T];
        }
      }
    }
  }
  return target;
}

// ============================================================================
// 事件工具
// ============================================================================

/**
 * 创建事件发射器
 */
export function createEventEmitter<T extends Record<string, unknown[]>>() {
  const listeners = new Map<keyof T, Set<(...args: unknown[]) => void>>();

  return {
    on<K extends keyof T>(event: K, callback: (...args: T[K]) => void): () => void {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(callback as (...args: unknown[]) => void);

      return () => {
        listeners.get(event)?.delete(callback as (...args: unknown[]) => void);
      };
    },

    off<K extends keyof T>(event: K, callback: (...args: T[K]) => void): void {
      listeners.get(event)?.delete(callback as (...args: unknown[]) => void);
    },

    emit<K extends keyof T>(event: K, ...args: T[K]): void {
      listeners.get(event)?.forEach(callback => callback(...args));
    },

    clear(): void {
      listeners.clear();
    },
  };
}
