// useThumbnailQueue.ts - 缩略图队列管理
import { configureThumbnailManager, getQueueStats, clearQueue } from '$lib/utils/thumbnailManager';
import type { FsItem } from '$lib/types';

interface ThumbnailJob {
  path: string;
  kind: 'folder' | 'image' | 'archive';
  priority: 'high' | 'normal';
  source: string;
}

interface ThumbnailQueueOptions {
  store: any; // fileBrowserStore type
  onStatsUpdate?: (stats: any) => void;
}

export function useThumbnailQueue({ store, onStatsUpdate }: ThumbnailQueueOptions) {
  // 初始化缩略图管理器
  configureThumbnailManager({
    addThumbnail: (path: string, url: string) => {
      store.addThumbnail(path, url);
    },
    maxConcurrentLocal: 4,
    maxConcurrentArchive: 2,
  });

  // 队列管理
  const queues = {
    high: [] as ThumbnailJob[],
    normal: [] as ThumbnailJob[],
  };
  
  const inFlight = new Map<string, ThumbnailJob>();
  const completed = new Set<string>();
  
  // 调度器
  function schedule() {
    const stats = getQueueStats();
    
    // 检查是否还能启动新任务
    while (canStartMore()) {
      // 优先处理高优先级队列
      let job = queues.high.shift();
      if (!job) {
        // 没有高优先级任务，处理普通任务
        job = queues.normal.shift();
      }
      
      if (!job) break; // 没有任务了
      
      // 检查是否已经完成或正在执行
      if (completed.has(job.path) || inFlight.has(job.path)) {
        continue;
      }
      
      inFlight.set(job.path, job);
      dispatch(job);
    }
    
    // 触发统计更新回调
    if (onStatsUpdate) {
      onStatsUpdate(stats);
    }
  }
  
  // 检查是否可以启动更多任务
  function canStartMore(): boolean {
    const stats = getQueueStats();
    const totalInFlight = stats.generatingLocal + stats.generatingArchive;
    const maxTotal = stats.maxLocal + stats.maxArchive;
    return totalInFlight < maxTotal;
  }
  
  // 分发任务
  function dispatch(job: ThumbnailJob) {
    console.log(`🚀 [ThumbnailQueue] 开始任务: ${job.path} (${job.kind}, ${job.priority})`);
    
    try {
      switch (job.kind) {
        case 'folder':
          import('$lib/utils/thumbnailManager').then(({ enqueueThumbnail }) => {
            enqueueThumbnail(job.path, true);
          });
          break;
        case 'image':
          import('$lib/utils/thumbnailManager').then(({ enqueueThumbnail }) => {
            enqueueThumbnail(job.path, false);
          });
          break;
        case 'archive':
          import('$lib/utils/thumbnailManager').then(({ enqueueArchiveThumbnail }) => {
            enqueueArchiveThumbnail(job.path, true); // 生成根缩略图
          });
          break;
      }
    } catch (error) {
      console.error(`❌ [ThumbnailQueue] 任务失败: ${job.path}`, error);
    } finally {
      // 任务完成后从执行中移除
      setTimeout(() => {
        inFlight.delete(job.path);
        completed.add(job.path);
        schedule(); // 继续调度下一个任务
      }, 0);
    }
  }
  
  // 批量入队
  function enqueueBatch(items: FsItem[], options: { 
    priority: 'high' | 'normal'; 
    source: string;
  }) {
    console.log(`📥 [ThumbnailQueue] 批量入队: ${items.length} 项 (${options.priority})`);
    
    const jobs: ThumbnailJob[] = items
      .filter(item => {
        // 只处理图片、文件夹和压缩包
        return item.is_image || item.is_dir || item.name.match(/\.(zip|cbz|cbr|cb7|rar|7z)$/i);
      })
      .map(item => ({
        path: item.path,
        kind: item.is_dir ? 'folder' : 
              item.name.match(/\.(zip|cbz|cbr|cb7|rar|7z)$/i) ? 'archive' : 'image',
        priority: options.priority,
        source: options.source,
      }));
    
    // 根据优先级分配到不同队列
    const bucket = options.priority === 'high' ? queues.high : queues.normal;
    bucket.push(...jobs);
    
    // 立即尝试调度
    schedule();
  }
  
  // 提升优先级
  function boostPriority(path: string) {
    console.log(`⬆️ [ThumbnailQueue] 提升优先级: ${path}`);
    
    // 从普通队列中移除
    const normalIndex = queues.normal.findIndex(job => job.path === path);
    if (normalIndex !== -1) {
      const [job] = queues.normal.splice(normalIndex, 1);
      job.priority = 'high';
      queues.high.unshift(job); // 插入到高优先级队列前面
      schedule();
      return;
    }
    
    // 如果任务正在执行，标记为高优先级（可选：可以实现抢占）
    if (inFlight.has(path)) {
      const job = inFlight.get(path)!;
      job.priority = 'high';
      console.log(`📍 [ThumbnailQueue] 任务已在执行，标记为高优先级: ${path}`);
    }
  }
  
  // 取消所有任务
  function cancelAll() {
    console.log('🛑 [ThumbnailQueue] 取消所有任务');
    queues.high = [];
    queues.normal = [];
    clearQueue();
    inFlight.clear();
  }
  
  // 清理已完成的记录（可选：定期清理以避免内存泄漏）
  function cleanup() {
    if (completed.size > 1000) {
      completed.clear();
      console.log('🧹 [ThumbnailQueue] 清理完成记录');
    }
  }
  
  // 获取队列状态
  function getQueueStatus() {
    return {
      high: queues.high.length,
      normal: queues.normal.length,
      inFlight: inFlight.size,
      completed: completed.size,
      stats: getQueueStats()
    };
  }
  
  return {
    enqueueBatch,
    boostPriority,
    cancelAll,
    cleanup,
    getQueueStatus,
    schedule
  };
}