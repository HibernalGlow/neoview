import { writable } from 'svelte/store';

interface MonitorMetrics {
  running_scan: number;
  running_extract: number;
  total_processed: number;
  total_errors: number;
  avg_scan_time: number;
  avg_extract_time: number;
  p95_scan_time: number;
  p95_extract_time: number;
  memory_usage: number;
  cache_size: number;
  current_scan_limit: number;
  current_extract_limit: number;
  scan_queue_length: number;
  extract_queue_length: number;
}

interface ThumbnailMonitor {
  metrics: MonitorMetrics;
  isHealthy: boolean;
  p95: number;
  totalErrors: number;
  subscribe: (callback: (metrics: MonitorMetrics) => void) => () => void;
}

function createThumbnailMonitor(): ThumbnailMonitor {
  const metrics = writable<MonitorMetrics>({
    running_scan: 0,
    running_extract: 0,
    total_processed: 0,
    total_errors: 0,
    avg_scan_time: 0,
    avg_extract_time: 0,
    p95_scan_time: 0,
    p95_extract_time: 0,
    memory_usage: 0,
    cache_size: 0
  });

  let currentMetrics: MonitorMetrics = {
    running_scan: 0,
    running_extract: 0,
    total_processed: 0,
    total_errors: 0,
    avg_scan_time: 0,
    avg_extract_time: 0,
    p95_scan_time: 0,
    p95_extract_time: 0,
    memory_usage: 0,
    cache_size: 0,
    current_scan_limit: 4,
    current_extract_limit: 16,
    scan_queue_length: 0,
    extract_queue_length: 0
  };

  const subscribe = (callback: (metrics: MonitorMetrics) => void) => {
    return metrics.subscribe(callback);
  };

  // 计算健康状态
  const isHealthy = currentMetrics.total_errors < 10 && 
                   currentMetrics.running_scan + currentMetrics.running_extract < 50 &&
                   currentMetrics.current_scan_limit <= 16 &&
                   currentMetrics.current_extract_limit <= 64;

  // 计算P95响应时间
  const p95 = Math.max(currentMetrics.p95_scan_time, currentMetrics.p95_extract_time);

  // 总错误数
  const totalErrors = currentMetrics.total_errors;

  return {
    metrics: currentMetrics,
    isHealthy,
    p95,
    totalErrors,
    subscribe
  };
}

export { createThumbnailMonitor };
export type { ThumbnailMonitor, MonitorMetrics };