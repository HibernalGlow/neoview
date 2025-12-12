/**
 * PerfMonitor - 性能监控器
 * 
 * 跟踪和报告性能指标，支持阈值告警和优化建议
 * 
 * Requirements: 7.1, 7.2, 7.3
 */

export interface PerfMetrics {
  imageLoadTime: number[];
  ipcLatency: number[];
  frameRate: number[];
  memoryUsage: number[];
  thumbnailLoadTime: number[];
  archiveExtractTime: number[];
}

export interface PerfThresholds {
  maxImageLoadTime: number;
  maxIpcLatency: number;
  minFrameRate: number;
  maxMemoryUsageMB: number;
  maxThumbnailLoadTime: number;
  maxArchiveExtractTime: number;
}

export interface PerfStats {
  avgImageLoadTime: number;
  p95ImageLoadTime: number;
  avgIpcLatency: number;
  p95IpcLatency: number;
  avgFrameRate: number;
  minFrameRate: number;
  currentMemoryUsageMB: number;
  peakMemoryUsageMB: number;
  avgThumbnailLoadTime: number;
  avgArchiveExtractTime: number;
}

export interface PerfWarning {
  metric: keyof PerfMetrics;
  value: number;
  threshold: number;
  message: string;
  timestamp: number;
}

const DEFAULT_THRESHOLDS: PerfThresholds = {
  maxImageLoadTime: 1000,      // 1秒
  maxIpcLatency: 100,          // 100ms
  minFrameRate: 30,            // 30fps
  maxMemoryUsageMB: 1024,      // 1GB
  maxThumbnailLoadTime: 500,   // 500ms
  maxArchiveExtractTime: 2000, // 2秒
};

const MAX_SAMPLES = 100;

class PerfMonitorImpl {
  private metrics: PerfMetrics = {
    imageLoadTime: [],
    ipcLatency: [],
    frameRate: [],
    memoryUsage: [],
    thumbnailLoadTime: [],
    archiveExtractTime: [],
  };

  private thresholds: PerfThresholds = { ...DEFAULT_THRESHOLDS };
  private warnings: PerfWarning[] = [];
  private peakMemoryUsageMB: number = 0;
  private enabled: boolean = true;
  private frameRateMonitorId: number | null = null;
  private lastFrameTime: number = 0;

  /**
   * 记录性能指标
   */
  record(metric: keyof PerfMetrics, value: number): void {
    if (!this.enabled) return;

    const samples = this.metrics[metric];
    samples.push(value);

    // 保持样本数量在限制内
    if (samples.length > MAX_SAMPLES) {
      samples.shift();
    }

    // 更新峰值内存
    if (metric === 'memoryUsage' && value > this.peakMemoryUsageMB) {
      this.peakMemoryUsageMB = value;
    }

    // 检查阈值
    this.checkThreshold(metric, value);
  }

  /**
   * 检查单个指标是否超过阈值
   */
  private checkThreshold(metric: keyof PerfMetrics, value: number): void {
    let exceeded = false;
    let threshold = 0;
    let message = '';

    switch (metric) {
      case 'imageLoadTime':
        threshold = this.thresholds.maxImageLoadTime;
        exceeded = value > threshold;
        message = `图像加载时间 ${value.toFixed(0)}ms 超过阈值 ${threshold}ms`;
        break;
      case 'ipcLatency':
        threshold = this.thresholds.maxIpcLatency;
        exceeded = value > threshold;
        message = `IPC 延迟 ${value.toFixed(0)}ms 超过阈值 ${threshold}ms`;
        break;
      case 'frameRate':
        threshold = this.thresholds.minFrameRate;
        exceeded = value < threshold;
        message = `帧率 ${value.toFixed(0)}fps 低于阈值 ${threshold}fps`;
        break;
      case 'memoryUsage':
        threshold = this.thresholds.maxMemoryUsageMB;
        exceeded = value > threshold;
        message = `内存使用 ${value.toFixed(0)}MB 超过阈值 ${threshold}MB`;
        break;
      case 'thumbnailLoadTime':
        threshold = this.thresholds.maxThumbnailLoadTime;
        exceeded = value > threshold;
        message = `缩略图加载时间 ${value.toFixed(0)}ms 超过阈值 ${threshold}ms`;
        break;
      case 'archiveExtractTime':
        threshold = this.thresholds.maxArchiveExtractTime;
        exceeded = value > threshold;
        message = `压缩包提取时间 ${value.toFixed(0)}ms 超过阈值 ${threshold}ms`;
        break;
    }

    if (exceeded) {
      const warning: PerfWarning = {
        metric,
        value,
        threshold,
        message,
        timestamp: Date.now(),
      };
      this.warnings.push(warning);
      console.warn(`⚠️ [PerfMonitor] ${message}`);

      // 保持警告数量在限制内
      if (this.warnings.length > 50) {
        this.warnings.shift();
      }
    }
  }

  /**
   * 获取统计数据
   */
  getStats(): PerfStats {
    const calcAvg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const calcP95 = (arr: number[]) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
    };
    const calcMin = (arr: number[]) => arr.length > 0 ? Math.min(...arr) : 0;

    return {
      avgImageLoadTime: calcAvg(this.metrics.imageLoadTime),
      p95ImageLoadTime: calcP95(this.metrics.imageLoadTime),
      avgIpcLatency: calcAvg(this.metrics.ipcLatency),
      p95IpcLatency: calcP95(this.metrics.ipcLatency),
      avgFrameRate: calcAvg(this.metrics.frameRate),
      minFrameRate: calcMin(this.metrics.frameRate),
      currentMemoryUsageMB: this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1] || 0,
      peakMemoryUsageMB: this.peakMemoryUsageMB,
      avgThumbnailLoadTime: calcAvg(this.metrics.thumbnailLoadTime),
      avgArchiveExtractTime: calcAvg(this.metrics.archiveExtractTime),
    };
  }

  /**
   * 检查所有阈值并返回警告
   */
  checkThresholds(): PerfWarning[] {
    return [...this.warnings];
  }

  /**
   * 获取优化建议
   */
  getSuggestions(): string[] {
    const suggestions: string[] = [];
    const stats = this.getStats();

    if (stats.avgImageLoadTime > 500) {
      suggestions.push('图像加载较慢，建议启用预加载或增加缓存大小');
    }

    if (stats.avgIpcLatency > 50) {
      suggestions.push('IPC 延迟较高，建议启用请求批处理');
    }

    if (stats.minFrameRate < 30) {
      suggestions.push('帧率较低，建议减少同时加载的图像数量');
    }

    if (stats.currentMemoryUsageMB > 800) {
      suggestions.push('内存使用较高，建议清理缓存或减少预加载数量');
    }

    if (stats.avgThumbnailLoadTime > 300) {
      suggestions.push('缩略图加载较慢，建议减少批量加载数量');
    }

    return suggestions;
  }

  /**
   * 设置阈值
   */
  setThresholds(thresholds: Partial<PerfThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * 启用/禁用监控
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopFrameRateMonitor();
    }
  }

  /**
   * 启动帧率监控
   */
  startFrameRateMonitor(): void {
    if (typeof window === 'undefined' || this.frameRateMonitorId !== null) return;

    this.lastFrameTime = performance.now();
    const measureFrame = () => {
      const now = performance.now();
      const delta = now - this.lastFrameTime;
      if (delta > 0) {
        const fps = 1000 / delta;
        this.record('frameRate', fps);
      }
      this.lastFrameTime = now;
      this.frameRateMonitorId = requestAnimationFrame(measureFrame);
    };
    this.frameRateMonitorId = requestAnimationFrame(measureFrame);
  }

  /**
   * 停止帧率监控
   */
  stopFrameRateMonitor(): void {
    if (this.frameRateMonitorId !== null) {
      cancelAnimationFrame(this.frameRateMonitorId);
      this.frameRateMonitorId = null;
    }
  }

  /**
   * 记录内存使用
   */
  recordMemoryUsage(): void {
    if (typeof performance === 'undefined') return;
    const memory = (performance as any).memory;
    if (memory) {
      const usedMB = Math.round(memory.usedJSHeapSize / 1048576);
      this.record('memoryUsage', usedMB);
    }
  }

  /**
   * 清除所有数据
   */
  clear(): void {
    this.metrics = {
      imageLoadTime: [],
      ipcLatency: [],
      frameRate: [],
      memoryUsage: [],
      thumbnailLoadTime: [],
      archiveExtractTime: [],
    };
    this.warnings = [];
    this.peakMemoryUsageMB = 0;
  }

  /**
   * 测量异步函数执行时间
   */
  async measureAsync<T>(metric: keyof PerfMetrics, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = performance.now() - start;
      this.record(metric, duration);
    }
  }
}

// 单例导出
export const perfMonitor = new PerfMonitorImpl();
