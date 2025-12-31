/**
 * 翻页性能监控器
 * 用于诊断和跟踪翻页性能问题，特别是内存泄露
 */

interface PageFlipStats {
  /** 总翻页次数 */
  totalFlips: number;
  /** 最近100次翻页的平均耗时（毫秒） */
  averageFlipTime: number;
  /** 最慢的翻页耗时（毫秒） */
  maxFlipTime: number;
  /** 当前内存使用（MB，仅支持的浏览器） */
  memoryUsageMB: number | null;
  /** 活跃的定时器数量（估计） */
  activeTimers: number;
  /** 最后一次翻页时间 */
  lastFlipTime: Date | null;
}

class PageFlipMonitor {
  private flipCount = 0;
  private flipTimes: number[] = [];
  private maxFlipTimeValue = 0;
  private lastFlipStart: number | null = null;
  private activeTimerSet = new Set<number>();
  
  // 配置
  private readonly MAX_SAMPLES = 100;
  private readonly ENABLE_LOGGING = false; // 改为 true 启用详细日志
  
  /**
   * 开始记录一次翻页
   */
  startFlip(): void {
    this.lastFlipStart = performance.now();
  }
  
  /**
   * 结束记录一次翻页
   */
  endFlip(): void {
    if (this.lastFlipStart === null) return;
    
    const duration = performance.now() - this.lastFlipStart;
    this.flipCount++;
    this.flipTimes.push(duration);
    
    // 保持最近100次的记录
    if (this.flipTimes.length > this.MAX_SAMPLES) {
      this.flipTimes.shift();
    }
    
    // 更新最大值
    if (duration > this.maxFlipTimeValue) {
      this.maxFlipTimeValue = duration;
    }
    
    // 记录异常慢的翻页
    if (duration > 200) {
      console.warn(`⚠️ 翻页耗时过长: ${duration.toFixed(1)}ms (第 ${this.flipCount} 次)`);
    } else if (this.ENABLE_LOGGING) {
      console.log(`📖 翻页完成: ${duration.toFixed(1)}ms (第 ${this.flipCount} 次)`);
    }
    
    this.lastFlipStart = null;
  }
  
  /**
   * 注册一个定时器（用于跟踪泄露）
   */
  registerTimer(id: number): void {
    this.activeTimerSet.add(id);
  }
  
  /**
   * 取消注册一个定时器
   */
  unregisterTimer(id: number): void {
    this.activeTimerSet.delete(id);
  }
  
  /**
   * 获取统计信息
   */
  getStats(): PageFlipStats {
    const average = this.flipTimes.length > 0
      ? this.flipTimes.reduce((a, b) => a + b, 0) / this.flipTimes.length
      : 0;
    
    const memoryUsageMB = this.getMemoryUsage();
    
    return {
      totalFlips: this.flipCount,
      averageFlipTime: average,
      maxFlipTime: this.maxFlipTimeValue,
      memoryUsageMB,
      activeTimers: this.activeTimerSet.size,
      lastFlipTime: this.lastFlipStart !== null ? new Date() : null,
    };
  }
  
  /**
   * 获取内存使用量（仅Chrome支持）
   */
  private getMemoryUsage(): number | null {
    if ('memory' in performance && (performance as any).memory) {
      const mem = (performance as any).memory;
      return mem.usedJSHeapSize / (1024 * 1024); // 转换为 MB
    }
    return null;
  }
  
  /**
   * 打印统计信息到控制台
   */
  printStats(): void {
    const stats = this.getStats();
    console.group('📊 翻页性能统计');
    console.log(`总翻页次数: ${stats.totalFlips}`);
    console.log(`平均耗时: ${stats.averageFlipTime.toFixed(1)}ms`);
    console.log(`最大耗时: ${stats.maxFlipTime.toFixed(1)}ms`);
    if (stats.memoryUsageMB !== null) {
      console.log(`内存使用: ${stats.memoryUsageMB.toFixed(1)}MB`);
    }
    console.log(`活跃定时器: ${stats.activeTimers}`);
    console.groupEnd();
  }
  
  /**
   * 重置统计
   */
  reset(): void {
    this.flipCount = 0;
    this.flipTimes = [];
    this.maxFlipTimeValue = 0;
    this.lastFlipStart = null;
    this.activeTimerSet.clear();
    console.log('🔄 翻页监控已重置');
  }
  
  /**
   * 启动自动报告（每N次翻页后自动打印）
   */
  enableAutoReport(interval = 50): () => void {
    let lastReportedCount = 0;
    
    const checkAndReport = () => {
      if (this.flipCount - lastReportedCount >= interval) {
        this.printStats();
        lastReportedCount = this.flipCount;
      }
    };
    
    const intervalId = setInterval(checkAndReport, 5000); // 每5秒检查一次
    
    return () => clearInterval(intervalId);
  }
}

// 单例导出
export const pageFlipMonitor = new PageFlipMonitor();

// 开发模式下暴露到全局，方便调试
if (import.meta.env.DEV) {
  (window as any).__pageFlipMonitor = pageFlipMonitor;
  console.log('💡 翻页监控器已挂载到 window.__pageFlipMonitor');
  console.log('   使用 window.__pageFlipMonitor.printStats() 查看统计');
  console.log('   使用 window.__pageFlipMonitor.reset() 重置统计');
}
