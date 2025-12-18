/**
 * SystemCapabilities - 系统能力检测
 * 
 * 检测系统资源并计算推荐的性能配置
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

import { invoke } from '$lib/api/adapter';

export interface SystemCapabilities {
  totalMemoryMB: number;
  availableMemoryMB: number;
  cpuCores: number;
  isLowEndDevice: boolean;
  recommendedPreloadCount: number;
  recommendedCacheSizeMB: number;
  recommendedThumbnailBatchSize: number;
  recommendedMaxConcurrent: number;
}

export interface AdaptiveConfig {
  preloadAhead: number;
  preloadBehind: number;
  maxCacheSizeMB: number;
  thumbnailBatchSize: number;
  maxConcurrentLoads: number;
  maxConcurrentThumbnails: number;
  enableBackgroundDecode: boolean;
  lowPriorityDelayMs: number;
}

// 默认配置（中等设备）
const DEFAULT_CONFIG: AdaptiveConfig = {
  preloadAhead: 3,
  preloadBehind: 1,
  maxCacheSizeMB: 512,
  thumbnailBatchSize: 10,
  maxConcurrentLoads: 3,
  maxConcurrentThumbnails: 4,
  enableBackgroundDecode: true,
  lowPriorityDelayMs: 100,
};

// 低端设备配置
const LOW_END_CONFIG: AdaptiveConfig = {
  preloadAhead: 2,
  preloadBehind: 1,
  maxCacheSizeMB: 256,
  thumbnailBatchSize: 5,
  maxConcurrentLoads: 2,
  maxConcurrentThumbnails: 2,
  enableBackgroundDecode: true,
  lowPriorityDelayMs: 200,
};

// 高端设备配置
const HIGH_END_CONFIG: AdaptiveConfig = {
  preloadAhead: 5,
  preloadBehind: 2,
  maxCacheSizeMB: 1024,
  thumbnailBatchSize: 15,
  maxConcurrentLoads: 4,
  maxConcurrentThumbnails: 6,
  enableBackgroundDecode: true,
  lowPriorityDelayMs: 50,
};

let cachedCapabilities: SystemCapabilities | null = null;
let cachedConfig: AdaptiveConfig | null = null;

/**
 * 检测系统能力
 */
export async function detectSystemCapabilities(): Promise<SystemCapabilities> {
  if (cachedCapabilities) {
    return cachedCapabilities;
  }

  let totalMemoryMB = 4096; // 默认 4GB
  let availableMemoryMB = 2048;
  let cpuCores = 4;

  // 尝试从 Tauri 获取系统信息
  try {
    const sysInfo = await invoke<{
      total_memory: number;
      available_memory: number;
      cpu_cores: number;
    }>('get_system_info');
    
    totalMemoryMB = Math.round(sysInfo.total_memory / 1048576);
    availableMemoryMB = Math.round(sysInfo.available_memory / 1048576);
    cpuCores = sysInfo.cpu_cores;
  } catch {
    // 回退到浏览器 API
    if (typeof navigator !== 'undefined') {
      cpuCores = navigator.hardwareConcurrency || 4;
      
      // 尝试从 performance.memory 获取内存信息
      if (typeof performance !== 'undefined' && (performance as any).memory) {
        const memory = (performance as any).memory;
        totalMemoryMB = Math.round(memory.jsHeapSizeLimit / 1048576);
        availableMemoryMB = Math.round((memory.jsHeapSizeLimit - memory.usedJSHeapSize) / 1048576);
      }
    }
  }

  // 判断是否为低端设备
  const isLowEndDevice = totalMemoryMB < 4096 || cpuCores < 4;
  const isHighEndDevice = totalMemoryMB >= 16384 && cpuCores >= 8;

  // 计算推荐配置
  let recommendedPreloadCount: number;
  let recommendedCacheSizeMB: number;
  let recommendedThumbnailBatchSize: number;
  let recommendedMaxConcurrent: number;

  if (isLowEndDevice) {
    recommendedPreloadCount = 2;
    recommendedCacheSizeMB = Math.min(256, Math.round(totalMemoryMB * 0.1));
    recommendedThumbnailBatchSize = 5;
    recommendedMaxConcurrent = 2;
  } else if (isHighEndDevice) {
    recommendedPreloadCount = 5;
    recommendedCacheSizeMB = Math.min(1024, Math.round(totalMemoryMB * 0.15));
    recommendedThumbnailBatchSize = 15;
    recommendedMaxConcurrent = Math.min(6, cpuCores);
  } else {
    recommendedPreloadCount = 3;
    recommendedCacheSizeMB = Math.min(512, Math.round(totalMemoryMB * 0.12));
    recommendedThumbnailBatchSize = 10;
    recommendedMaxConcurrent = Math.min(4, cpuCores);
  }

  cachedCapabilities = {
    totalMemoryMB,
    availableMemoryMB,
    cpuCores,
    isLowEndDevice,
    recommendedPreloadCount,
    recommendedCacheSizeMB,
    recommendedThumbnailBatchSize,
    recommendedMaxConcurrent,
  };

  console.log('🖥️ [SystemCapabilities] Detected:', cachedCapabilities);
  return cachedCapabilities;
}

/**
 * 获取自适应配置
 */
export async function getAdaptiveConfig(): Promise<AdaptiveConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const capabilities = await detectSystemCapabilities();

  if (capabilities.isLowEndDevice) {
    cachedConfig = { ...LOW_END_CONFIG };
  } else if (capabilities.totalMemoryMB >= 16384 && capabilities.cpuCores >= 8) {
    cachedConfig = { ...HIGH_END_CONFIG };
  } else {
    cachedConfig = { ...DEFAULT_CONFIG };
  }

  // 根据实际资源微调
  cachedConfig.maxCacheSizeMB = capabilities.recommendedCacheSizeMB;
  cachedConfig.preloadAhead = capabilities.recommendedPreloadCount;
  cachedConfig.thumbnailBatchSize = capabilities.recommendedThumbnailBatchSize;
  cachedConfig.maxConcurrentLoads = capabilities.recommendedMaxConcurrent;

  console.log('⚙️ [SystemCapabilities] Adaptive config:', cachedConfig);
  return cachedConfig;
}

/**
 * 检查是否处于内存压力状态
 */
export async function isUnderMemoryPressure(): Promise<boolean> {
  const capabilities = await detectSystemCapabilities();
  
  // 可用内存低于总内存的 10%
  const threshold = capabilities.totalMemoryMB * 0.1;
  return capabilities.availableMemoryMB < threshold;
}

/**
 * 获取当前内存使用情况
 */
export function getCurrentMemoryUsage(): { usedMB: number; limitMB: number } | null {
  if (typeof performance === 'undefined') return null;
  
  const memory = (performance as any).memory;
  if (!memory) return null;

  return {
    usedMB: Math.round(memory.usedJSHeapSize / 1048576),
    limitMB: Math.round(memory.jsHeapSizeLimit / 1048576),
  };
}

/**
 * 清除缓存的能力检测结果（用于重新检测）
 */
export function clearCapabilitiesCache(): void {
  cachedCapabilities = null;
  cachedConfig = null;
}

/**
 * 监听内存压力事件（如果支持）
 */
export function onMemoryPressure(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  // 定期检查内存使用
  const intervalId = setInterval(async () => {
    const underPressure = await isUnderMemoryPressure();
    if (underPressure) {
      console.warn('⚠️ [SystemCapabilities] Memory pressure detected');
      callback();
    }
  }, 10000); // 每 10 秒检查一次

  return () => clearInterval(intervalId);
}
