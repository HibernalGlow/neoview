import { onMount, onDestroy } from 'svelte';
import { FileSystemAPI } from '$lib/api';

interface ProcessorMetrics {
  running_scan: number;
  running_extract: number;
  running_local: number;
  scan_queue_length: number;
  extract_queue_length: number;
  recent_durations: number[];
  error_counts: Record<string, number>;
}

export function createThumbnailMonitor() {
  let metrics: ProcessorMetrics = {
    running_scan: 0,
    running_extract: 0,
    running_local: 0,
    scan_queue_length: 0,
    extract_queue_length: 0,
    recent_durations: [],
    error_counts: {}
  };
  
  let interval: number | null = null;
  let subscribers: Array<(metrics: ProcessorMetrics) => void> = [];
  
  const subscribe = (callback: (metrics: ProcessorMetrics) => void) => {
    subscribers.push(callback);
    callback(metrics); // 立即发送当前状态
    
    // 返回取消订阅函数
    return () => {
      const index = subscribers.indexOf(callback);
      if (index > -1) {
        subscribers.splice(index, 1);
      }
    };
  };
  
  const startMonitoring = (intervalMs: number = 1000) => {
    // 只在开发模式下启动监控
    if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
      console.log('🔒 [ThumbnailMonitor] 生产环境，跳过监控启动');
      return;
    }
    
    if (interval) return; // 已经在监控中
    
    console.log('🚀 [ThumbnailMonitor] 启动监控面板');
    interval = setInterval(async () => {
      try {
        const response = await FileSystemAPI.getThumbnailMetrics();
        metrics = response as ProcessorMetrics;
        
        // 通知所有订阅者
        subscribers.forEach(callback => callback(metrics));
        
        // 输出到控制台（便于调试）
        const p95 = calculateP95(metrics.recent_durations);
        const totalRunning = metrics.running_scan + metrics.running_extract + metrics.running_local;
        const totalQueued = metrics.scan_queue_length + metrics.extract_queue_length;
        
        console.log(`📊 [ThumbnailMonitor] 运行:${totalRunning} 扫描:${metrics.running_scan}/${metrics.scan_queue_length} 提取:${metrics.running_extract}/${metrics.extract_queue_length} 本地:${metrics.running_local} 队列:${totalQueued} P95:${p95}ms`);
        
        // 如果有错误，输出错误统计
        const errorCount = Object.values(metrics.error_counts).reduce((a, b) => a + b, 0);
        if (errorCount > 0) {
          console.warn(`⚠️ [ThumbnailMonitor] 错误统计:`, metrics.error_counts);
        }
        
        // 健康检查
        const isHealthy = metrics.running_extract >= 1 && p95 < 400;
        if (!isHealthy) {
          console.warn(`🚨 [ThumbnailMonitor] 处理器状态不健康: 运行:${totalRunning} P95:${p95}ms 错误:${errorCount}`);
        }
      } catch (error) {
        console.error('❌ [ThumbnailMonitor] 获取指标失败:', error);
      }
    }, intervalMs);
  };
  
  const stopMonitoring = () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  };
  
  const calculateP95 = (durations: number[]): number => {
    if (durations.length === 0) return 0;
    
    const sorted = [...durations].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.95);
    return sorted[index] || 0;
  };
  
  onMount(() => {
    // 组件挂载时自动开始监控
    startMonitoring();
  });
  
  onDestroy(() => {
    // 组件卸载时停止监控
    stopMonitoring();
  });
  
  return {
    subscribe,
    startMonitoring,
    stopMonitoring,
    get metrics(): ProcessorMetrics {
      return metrics;
    },
    get p95(): number {
      return calculateP95(metrics.recent_durations);
    },
    get totalErrors(): number {
      return Object.values(metrics.error_counts).reduce((a, b) => a + b, 0);
    },
    get isHealthy(): boolean {
      return metrics.running_scan < 10 && metrics.running_extract < 20 && this.p95 < 500;
    }
  };
}