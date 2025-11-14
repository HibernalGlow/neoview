// thumbnailQueueService.ts - 缩略图队列服务
import { enqueueThumbnail, enqueueArchiveThumbnail, getQueueStats, clearQueue } from '$lib/utils/thumbnailManager';

export interface ThumbnailJob {
  path: string;
  kind: 'folder' | 'image' | 'archive';
  priority: 'high' | 'normal';
  source: string;
  metadata?: {
    size?: number;
    modified?: number;
  };
}

export interface ThumbnailQueueOptions {
  onThumbnail?: (path: string, url: string) => void;
  onStatsUpdate?: (stats: any) => void;
  onError?: (path: string, error: Error) => void;
}

export class ThumbnailQueueService {
  private queues = {
    high: [] as ThumbnailJob[],
    normal: [] as ThumbnailJob[],
  };
  
  private inFlight = new Map<string, ThumbnailJob>();
  private completed = new Set<string>();
  private options: ThumbnailQueueOptions;
  
  constructor(options: ThumbnailQueueOptions = {}) {
    this.options = options;
    
    // 配置缩略图管理器
    configureThumbnailManager({
      addThumbnail: (path: string, url: string) => {
        this.completed.add(path);
        this.inFlight.delete(path);
        this.options.onThumbnail?.(path, url);
        this.schedule(); // 继续调度
      },
      maxConcurrentLocal: 4,
      maxConcurrentArchive: 2,
    });
  }
  
  /**
   * 调度器 - 核心逻辑
   */
  private schedule() {
    const stats = getQueueStats();
    
    // 检查是否还能启动新任务
    while (this.canStartMore()) {
      // 优先处理高优先级队列
      let job = this.queues.high.shift();
      if (!job) {
        // 没有高优先级任务，处理普通任务
        job = this.queues.normal.shift();
      }
      
      if (!job) break; // 没有任务了
      
      // 检查是否已经完成或正在执行
      if (this.completed.has(job.path) || this.inFlight.has(job.path)) {
        continue;
      }
      
      this.inFlight.set(job.path, job);
      this.dispatch(job);
    }
    
    // 触发统计更新回调
    if (this.options.onStatsUpdate) {
      this.options.onStatsUpdate({
        ...stats,
        queueStatus: this.getQueueStatus()
      });
    }
  }
  
  /**
   * 检查是否可以启动更多任务
   */
  private canStartMore(): boolean {
    const stats = getQueueStats();
    const totalInFlight = stats.generatingLocal + stats.generatingArchive;
    const maxTotal = stats.maxLocal + stats.maxArchive;
    return totalInFlight < maxTotal;
  }
  
  /**
   * 分发任务到缩略图管理器
   */
  private dispatch(job: ThumbnailJob) {
    console.log(`🚀 [ThumbnailQueue] 开始任务: ${job.path} (${job.kind}, ${job.priority})`);
    
    try {
      switch (job.kind) {
        case 'folder':
          enqueueThumbnail(job.path, true);
          break;
        case 'image':
          enqueueThumbnail(job.path, false);
          break;
        case 'archive':
          enqueueArchiveThumbnail(job.path, true); // 生成根缩略图
          break;
      }
    } catch (error) {
      console.error(`❌ [ThumbnailQueue] 任务失败: ${job.path}`, error);
      this.options.onError?.(job.path, error as Error);
      
      // 清理并继续调度
      this.inFlight.delete(job.path);
      this.schedule();
    }
  }
  
  /**
   * 批量入队
   */
  enqueueMany(jobs: ThumbnailJob[]) {
    console.log(`📥 [ThumbnailQueue] 批量入队: ${jobs.length} 项`);
    
    // 根据优先级分配到不同队列
    for (const job of jobs) {
      const bucket = job.priority === 'high' ? this.queues.high : this.queues.normal;
      bucket.push(job);
    }
    
    // 立即尝试调度
    this.schedule();
  }
  
  /**
   * 单个入队
   */
  enqueue(job: ThumbnailJob) {
    this.enqueueMany([job]);
  }
  
  /**
   * 提升优先级
   */
  setHighPriority(path: string) {
    console.log(`⬆️ [ThumbnailQueue] 提升优先级: ${path}`);
    
    // 从普通队列中移除
    const normalIndex = this.queues.normal.findIndex(job => job.path === path);
    if (normalIndex !== -1) {
      const [job] = this.queues.normal.splice(normalIndex, 1);
      job.priority = 'high';
      this.queues.high.unshift(job); // 插入到高优先级队列前面
      this.schedule();
      return;
    }
    
    // 如果任务正在执行，标记为高优先级
    if (this.inFlight.has(path)) {
      const job = this.inFlight.get(path)!;
      job.priority = 'high';
      console.log(`📍 [ThumbnailQueue] 任务已在执行，标记为高优先级: ${path}`);
    }
  }
  
  /**
   * 取消指定路径的任务
   */
  cancel(path: string) {
    console.log(`❌ [ThumbnailQueue] 取消任务: ${path}`);
    
    // 从队列中移除
    this.queues.high = this.queues.high.filter(job => job.path !== path);
    this.queues.normal = this.queues.normal.filter(job => job.path !== path);
    
    // 如果正在执行，无法取消（依赖缩略图管理器的实现）
    if (this.inFlight.has(path)) {
      console.log(`⚠️ [ThumbnailQueue] 任务正在执行，无法取消: ${path}`);
    }
  }
  
  /**
   * 清空所有队列
   */
  clear() {
    console.log('🛑 [ThumbnailQueue] 清空所有队列');
    this.queues.high = [];
    this.queues.normal = [];
    clearQueue();
    this.inFlight.clear();
  }
  
  /**
   * 清理已完成的记录
   */
  cleanup() {
    if (this.completed.size > 1000) {
      this.completed.clear();
      console.log('🧹 [ThumbnailQueue] 清理完成记录');
    }
  }
  
  /**
   * 获取队列状态
   */
  getQueueStatus() {
    return {
      high: this.queues.high.length,
      normal: this.queues.normal.length,
      inFlight: this.inFlight.size,
      completed: this.completed.size,
      stats: getQueueStats()
    };
  }
  
  /**
   * 暂停队列（停止调度新任务）
   */
  pause() {
    console.log('⏸️ [ThumbnailQueue] 暂停队列');
    // 可以通过设置标志位实现
  }
  
  /**
   * 恢复队列
   */
  resume() {
    console.log('▶️ [ThumbnailQueue] 恢复队列');
    this.schedule();
  }
  
  /**
   * 预加载文件夹的缩略图
   */
  async preloadFolder(path: string, options: { priority?: 'high' | 'normal' } = {}) {
    try {
      const items = await import('$lib/api/filesystem').then(api => 
        api.FileSystemAPI.browseDirectory(path)
      );
      
      const jobs: ThumbnailJob[] = items
        .filter(item => item.is_image || item.is_dir)
        .map(item => ({
          path: item.path,
          kind: item.is_dir ? 'folder' as const : 'image' as const,
          priority: options.priority || 'normal',
          source: path,
          metadata: {
            size: item.size,
            modified: item.modified
          }
        }));
      
      this.enqueueMany(jobs);
    } catch (error) {
      console.error(`❌ [ThumbnailQueue] 预加载失败: ${path}`, error);
      this.options.onError?.(path, error as Error);
    }
  }
}

// 单例实例
let instance: ThumbnailQueueService | null = null;

export const thumbnailQueueService = {
  /**
   * 初始化服务
   */
  init(options: ThumbnailQueueOptions = {}): ThumbnailQueueService {
    if (!instance) {
      instance = new ThumbnailQueueService(options);
    }
    return instance;
  },
  
  /**
   * 获取实例
   */
  getInstance(): ThumbnailQueueService {
    if (!instance) {
      throw new Error('ThumbnailQueueService 未初始化，请先调用 init()');
    }
    return instance;
  },
  
  /**
   * 重置实例
   */
  reset() {
    instance = null;
  }
};