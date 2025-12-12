/**
 * Performance Services - 性能服务集成
 * 
 * 整合所有性能优化服务，提供统一的初始化和管理接口
 * 
 * Requirements: All
 */

import { perfMonitor } from '$lib/utils/perfMonitor';
import { detectSystemCapabilities, getAdaptiveConfig, onMemoryPressure } from '$lib/utils/systemCapabilities';
import { imagePool } from './imagePool';
import { preloader } from './preloader';
import { thumbnailManager } from './thumbnailManager';
import { ipcBatcher } from './ipcBatcher';

export interface PerformanceServicesConfig {
  enablePerfMonitor: boolean;
  enableFrameRateMonitor: boolean;
  enableMemoryPressureHandler: boolean;
}

const DEFAULT_CONFIG: PerformanceServicesConfig = {
  enablePerfMonitor: true,
  enableFrameRateMonitor: false, // 默认关闭，因为会消耗资源
  enableMemoryPressureHandler: true,
};

let initialized = false;
let memoryPressureCleanup: (() => void) | null = null;

/**
 * 初始化所有性能服务
 */
export async function initPerformanceServices(
  config: Partial<PerformanceServicesConfig> = {}
): Promise<void> {
  if (initialized) {
    console.log('⚡ [PerformanceServices] Already initialized');
    return;
  }

  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  console.log('⚡ [PerformanceServices] Initializing...');

  // 检测系统能力
  const capabilities = await detectSystemCapabilities();
  console.log('🖥️ [PerformanceServices] System capabilities:', capabilities);

  // 获取自适应配置
  const adaptiveConfig = await getAdaptiveConfig();
  console.log('⚙️ [PerformanceServices] Adaptive config:', adaptiveConfig);

  // 初始化各服务
  await Promise.all([
    imagePool.init(),
    preloader.init(),
    thumbnailManager.init(),
  ]);

  // 启用性能监控
  if (finalConfig.enablePerfMonitor) {
    perfMonitor.setEnabled(true);
    
    if (finalConfig.enableFrameRateMonitor) {
      perfMonitor.startFrameRateMonitor();
    }

    // 定期记录内存使用
    setInterval(() => {
      perfMonitor.recordMemoryUsage();
    }, 5000);
  }

  // 设置内存压力处理
  if (finalConfig.enableMemoryPressureHandler) {
    memoryPressureCleanup = onMemoryPressure(() => {
      handleGlobalMemoryPressure();
    });
  }

  initialized = true;
  console.log('✅ [PerformanceServices] Initialized successfully');
}

/**
 * 处理全局内存压力
 */
function handleGlobalMemoryPressure(): void {
  console.warn('⚠️ [PerformanceServices] Global memory pressure detected');

  // 清理各服务的缓存
  imagePool.evict();
  thumbnailManager.clearCache();
  preloader.clear();

  // 记录事件
  perfMonitor.recordMemoryUsage();
}

/**
 * 获取所有服务的统计信息
 */
export function getPerformanceStats(): {
  perfMonitor: ReturnType<typeof perfMonitor.getStats>;
  imagePool: ReturnType<typeof imagePool.getStats>;
  thumbnailManager: ReturnType<typeof thumbnailManager.getStats>;
  preloader: ReturnType<typeof preloader.getStatus>;
  ipcBatcher: ReturnType<typeof ipcBatcher.getStats>;
} {
  return {
    perfMonitor: perfMonitor.getStats(),
    imagePool: imagePool.getStats(),
    thumbnailManager: thumbnailManager.getStats(),
    preloader: preloader.getStatus(),
    ipcBatcher: ipcBatcher.getStats(),
  };
}

/**
 * 获取性能警告
 */
export function getPerformanceWarnings(): ReturnType<typeof perfMonitor.checkThresholds> {
  return perfMonitor.checkThresholds();
}

/**
 * 获取优化建议
 */
export function getOptimizationSuggestions(): string[] {
  return perfMonitor.getSuggestions();
}

/**
 * 清理所有缓存
 */
export function clearAllCaches(): void {
  imagePool.evict();
  thumbnailManager.clearCache();
  preloader.clear();
  console.log('🧹 [PerformanceServices] All caches cleared');
}

/**
 * 销毁所有服务
 */
export function destroyPerformanceServices(): void {
  if (!initialized) return;

  perfMonitor.stopFrameRateMonitor();
  perfMonitor.clear();
  imagePool.destroy();
  thumbnailManager.destroy();
  preloader.clear();
  ipcBatcher.cancelAll();

  if (memoryPressureCleanup) {
    memoryPressureCleanup();
    memoryPressureCleanup = null;
  }

  initialized = false;
  console.log('🛑 [PerformanceServices] Destroyed');
}

// 导出各服务的单例
export { perfMonitor, imagePool, preloader, thumbnailManager, ipcBatcher };
