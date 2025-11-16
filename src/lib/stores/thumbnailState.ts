import { writable, derived } from 'svelte/store';
import { createThumbnailMonitor } from './thumbnailMonitor';
import { FileSystemAPI } from '$lib/api';

interface ThumbnailState {
  // 缩略图缓存
  cache: Map<string, string>;
  // 正在处理的任务
  processing: Set<string>;
  // 错误的任务
  errors: Map<string, string>;
  // 最后更新时间
  lastUpdate: number;
}

function createThumbnailState() {
  const state = writable<ThumbnailState>({
    cache: new Map(),
    processing: new Set(),
    errors: new Map(),
    lastUpdate: Date.now()
  });

  // 创建监控器
  const monitor = createThumbnailMonitor();
  
  // 订阅监控器更新
  let unsubscribe: (() => void) | null = null;
  
  // 派生计算属性
  const processingCount = derived(
    state,
    $state => $state.processing.size
  );
  
  const errorCount = derived(
    state,
    $state => $state.errors.size
  );
  
  const cacheCount = derived(
    state,
    $state => $state.cache.size
  );
  
  // 缓存缩略图
  const cacheThumbnail = (path: string, url: string) => {
    state.update($state => {
      const newCache = new Map($state.cache);
      newCache.set(path, url);
      
      const newProcessing = new Set($state.processing);
      newProcessing.delete(path);
      
      const newErrors = new Map($state.errors);
      newErrors.delete(path);
      
      return {
        ...$state,
        cache: newCache,
        processing: newProcessing,
        errors: newErrors,
        lastUpdate: Date.now()
      };
    });
  };
  
  // 标记任务开始处理
  const markProcessing = (path: string) => {
    state.update($state => {
      const newProcessing = new Set($state.processing);
      newProcessing.add(path);
      
      const newErrors = new Map($state.errors);
      newErrors.delete(path);
      
      return {
        ...$state,
        processing: newProcessing,
        errors: newErrors,
        lastUpdate: Date.now()
      };
    });
  };
  
  // 标记任务出错
  const markError = (path: string, error: string) => {
    state.update($state => {
      const newProcessing = new Set($state.processing);
      newProcessing.delete(path);
      
      const newErrors = new Map($state.errors);
      newErrors.set(path, error);
      
      return {
        ...$state,
        processing: newProcessing,
        errors: newErrors,
        lastUpdate: Date.now()
      };
    });
  };
  
  // 取消目录下的所有任务
  const cancelDirectoryTasks = async (dirPath: string) => {
    try {
      const cancelledCount = await FileSystemAPI.cancelFolderTasks(dirPath);
      console.log(`🚫 [ThumbnailState] 取消目录任务: ${dirPath}, 取消了 ${cancelledCount} 个任务`);
      
      // 从状态中移除该目录下的所有任务
      state.update($state => {
        const newProcessing = new Set($state.processing);
        const newErrors = new Map($state.errors);
        
        // 清理该目录下的处理状态
        for (const path of newProcessing) {
          if (path.startsWith(dirPath)) {
            newProcessing.delete(path);
          }
        }
        
        // 清理该目录下的错误状态
        for (const [path, _] of newErrors) {
          if (path.startsWith(dirPath)) {
            newErrors.delete(path);
          }
        }
        
        return {
          ...$state,
          processing: newProcessing,
          errors: newErrors,
          lastUpdate: Date.now()
        };
      });
      
      return cancelledCount;
    } catch (error) {
      console.error('❌ [ThumbnailState] 取消目录任务失败:', error);
      throw error;
    }
  };
  
  // 取消单个任务
  const cancelTask = async (path: string) => {
    try {
      const success = await FileSystemAPI.cancelThumbnailTask(path);
      if (success) {
        state.update($state => {
          const newProcessing = new Set($state.processing);
          newProcessing.delete(path);
          
          const newErrors = new Map($state.errors);
          newErrors.delete(path);
          
          return {
            ...$state,
            processing: newProcessing,
            errors: newErrors,
            lastUpdate: Date.now()
          };
        });
      }
      return success;
    } catch (error) {
      console.error('❌ [ThumbnailState] 取消任务失败:', error);
      throw error;
    }
  };
  
  // 清空所有状态
  const clearAll = () => {
    state.update(() => ({
      cache: new Map(),
      processing: new Set(),
      errors: new Map(),
      lastUpdate: Date.now()
    }));
  };
  
  // 刷新缩略图（重新生成）
  const refreshThumbnail = async (path: string) => {
    try {
      markProcessing(path);
      
      // 根据文件类型选择合适的生成方法
      let thumbnailUrl: string;
      
      if (path.toLowerCase().endsWith('.zip') || 
          path.toLowerCase().endsWith('.cbz') || 
          path.toLowerCase().endsWith('.rar') || 
          path.toLowerCase().endsWith('.cbr')) {
        // 压缩文件
        thumbnailUrl = await FileSystemAPI.generateArchiveThumbnailRoot(path);
      } else {
        // 普通文件
        thumbnailUrl = await FileSystemAPI.generateFileThumbnail(path);
      }
      
      cacheThumbnail(path, thumbnailUrl);
      return thumbnailUrl;
    } catch (error) {
      markError(path, error as string);
      throw error;
    }
  };
  
  // 批量刷新目录下的缩略图
  const refreshDirectory = async (dirPath: string) => {
    try {
      // 先取消现有任务
      await cancelDirectoryTasks(dirPath);
      
      // 获取目录内容
      const items = await FileSystemAPI.browseDirectory(dirPath);
      
      // 过滤出支持缩略图的文件
      const supportedFiles = items.filter(item => {
        if (item.is_dir) return true;
        
        const name = item.name.toLowerCase();
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.avif', '.jxl'];
        const archiveExts = ['.zip', '.rar', '.7z', '.cbz', '.cbr', '.cb7'];
        const ext = name.substring(name.lastIndexOf('.'));
        
        return imageExts.includes(ext) || archiveExts.includes(ext);
      });
      
      // 标记所有文件为处理中
      supportedFiles.forEach(item => {
        markProcessing(item.path);
      });
      
      // 批量生成缩略图
      const results = await Promise.allSettled(
        supportedFiles.map(item => refreshThumbnail(item.path))
      );
      
      // 统计结果
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      console.log(`📊 [ThumbnailState] 批量刷新完成: ${dirPath}, 成功: ${successful}, 失败: ${failed}`);
      
      return { successful, failed };
    } catch (error) {
      console.error('❌ [ThumbnailState] 批量刷新失败:', error);
      throw error;
    }
  };
  
  // 启动监控
  const startMonitoring = () => {
    if (unsubscribe) return;
    
    unsubscribe = monitor.subscribe((metrics) => {
      // 可以在这里处理监控数据，比如更新UI显示
      if (!monitor.isHealthy) {
        console.warn('⚠️ [ThumbnailState] 处理器状态不健康:', {
          running: metrics.running_scan + metrics.running_extract,
          p95: monitor.p95,
          errors: monitor.totalErrors
        });
      }
    });
  };
  
  // 停止监控
  const stopMonitoring = () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };
  
  return {
    // 状态
    state,
    processingCount,
    errorCount,
    cacheCount,
    
    // 监控器
    monitor,
    
    // 操作方法
    cacheThumbnail,
    markProcessing,
    markError,
    cancelDirectoryTasks,
    cancelTask,
    clearAll,
    refreshThumbnail,
    refreshDirectory,
    startMonitoring,
    stopMonitoring
  };
}

// 导出单例
export const thumbnailState = createThumbnailState();