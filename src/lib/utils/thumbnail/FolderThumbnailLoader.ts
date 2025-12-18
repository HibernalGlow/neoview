/**
 * 文件夹缩略图加载器
 * - 异步并发控制
 * - 池化限制防止大目录爆炸
 * - 目录切换时取消旧任务
 */

import { invoke } from '$lib/api/adapter';
import * as FileSystemAPI from '$lib/api/filesystem';
import type { FsItem } from '$lib/types';

export interface FolderThumbnailConfig {
  /** 最大并发数 */
  maxConcurrent: number;
  /** 单批处理数量 */
  batchSize: number;
  /** 批次间隔(ms) */
  batchDelay: number;
  /** 单任务超时(ms) */
  taskTimeout: number;
  /** 可见范围外的预加载数量 */
  preloadAhead: number;
}

/** 预热进度回调 */
export interface WarmupProgress {
  total: number;
  completed: number;
  failed: number;
  current: string;
}

interface FolderTask {
  folderPath: string;
  priority: number; // 0 最高
  resolve: (url: string | null) => void;
  reject: (error: Error) => void;
  aborted: boolean;
}

const DEFAULT_CONFIG: FolderThumbnailConfig = {
  maxConcurrent: 2,      // 减少并发数到2，避免 IPC 拥堵（从3降低）
  batchSize: 6,          // 减小批次到6，更快响应（从10降低）
  batchDelay: 150,       // 批次间隔 150ms，让 UI 喘息（从100ms增加）
  taskTimeout: 15000,    // 单任务 15 秒超时（文件夹扫描需要更长时间）
  preloadAhead: 5,       // 可见范围外预加载 5 个
};

export class FolderThumbnailLoader {
  private config: FolderThumbnailConfig;
  private queue: FolderTask[] = [];
  private activeCount = 0;
  private currentDirectory = '';
  private abortController: AbortController | null = null;
  
  // 缓存：已处理的文件夹
  private cache = new Map<string, string | null>();
  private processing = new Set<string>();
  
  // 回调
  private onThumbnailReady?: (folderPath: string, url: string) => void;
  
  // 预热状态
  private warmupAborted = false;
  private warmupProgress?: WarmupProgress;

  constructor(config: Partial<FolderThumbnailConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 设置缩略图就绪回调
   */
  setOnThumbnailReady(callback: (folderPath: string, url: string) => void) {
    this.onThumbnailReady = callback;
  }

  /**
   * 切换当前目录（取消旧目录的任务）
   */
  setCurrentDirectory(path: string) {
    if (this.currentDirectory === path) return;
    
    console.log(`📂 文件夹缩略图加载器：切换目录 ${this.currentDirectory} → ${path}`);
    
    // 取消旧任务
    this.abortPendingTasks();
    
    this.currentDirectory = path;
    this.abortController = new AbortController();
  }

  /**
   * 取消所有待处理任务
   */
  private abortPendingTasks() {
    // 标记所有队列中的任务为取消
    for (const task of this.queue) {
      task.aborted = true;
      task.resolve(null);
    }
    this.queue = [];
    
    // 通知正在处理的任务取消
    if (this.abortController) {
      this.abortController.abort();
    }
    
    console.log(`🛑 已取消 ${this.queue.length} 个待处理的文件夹缩略图任务`);
  }

  /**
   * 批量加载文件夹缩略图（主入口）
   * @param folders 文件夹列表
   * @param currentPath 当前目录路径
   */
  async loadFolderThumbnails(folders: FsItem[], currentPath: string): Promise<void> {
    // 切换目录
    this.setCurrentDirectory(currentPath);
    
    // 过滤出需要处理的文件夹
    const needProcess = folders.filter(f => 
      f.isDir && 
      !this.cache.has(f.path) && 
      !this.processing.has(f.path)
    );
    
    if (needProcess.length === 0) {
      console.log('📭 无需处理的文件夹缩略图');
      return;
    }
    
    console.log(`📂 开始加载 ${needProcess.length} 个文件夹缩略图（并发限制: ${this.config.maxConcurrent}）`);
    
    // 分批入队
    for (let i = 0; i < needProcess.length; i += this.config.batchSize) {
      const batch = needProcess.slice(i, i + this.config.batchSize);
      
      // 批次入队
      for (const folder of batch) {
        this.enqueue(folder.path, i); // 前面的优先级更高
      }
      
      // 批次间隔，让 UI 喘息
      if (i + this.config.batchSize < needProcess.length) {
        await this.delay(this.config.batchDelay);
      }
    }
  }

  /**
   * 获取单个文件夹缩略图
   */
  async getFolderThumbnail(folderPath: string): Promise<string | null> {
    // 1. 检查缓存
    if (this.cache.has(folderPath)) {
      return this.cache.get(folderPath) ?? null;
    }
    
    // 2. 检查是否正在处理
    if (this.processing.has(folderPath)) {
      return null; // 等待完成
    }
    
    // 3. 入队处理
    return new Promise((resolve, reject) => {
      this.enqueue(folderPath, 0, resolve, reject);
    });
  }

  /**
   * 入队任务
   */
  private enqueue(
    folderPath: string, 
    priority: number = 0,
    resolve: (url: string | null) => void = () => {},
    reject: (error: Error) => void = () => {}
  ) {
    // 检查是否已在队列或处理中
    if (this.processing.has(folderPath)) {
      resolve(null);
      return;
    }
    
    const existingIndex = this.queue.findIndex(t => t.folderPath === folderPath);
    if (existingIndex >= 0) {
      // 提升优先级
      if (priority < this.queue[existingIndex].priority) {
        this.queue[existingIndex].priority = priority;
      }
      resolve(null);
      return;
    }
    
    // 添加到队列
    this.queue.push({
      folderPath,
      priority,
      resolve,
      reject,
      aborted: false,
    });
    
    // 按优先级排序
    this.queue.sort((a, b) => a.priority - b.priority);
    
    // 触发处理
    this.processQueue();
  }

  /**
   * 处理队列
   */
  private async processQueue() {
    while (this.queue.length > 0 && this.activeCount < this.config.maxConcurrent) {
      const task = this.queue.shift();
      if (!task || task.aborted) continue;
      
      this.activeCount++;
      this.processing.add(task.folderPath);
      
      // 异步处理，不阻塞循环
      this.processTask(task).finally(() => {
        this.activeCount--;
        this.processing.delete(task.folderPath);
        // 继续处理队列
        this.processQueue();
      });
    }
  }

  /**
   * 处理单个任务
   */
  private async processTask(task: FolderTask): Promise<void> {
    const { folderPath, resolve } = task;
    
    try {
      // 带超时的处理
      const result = await this.withTimeout(
        this.generateFolderThumbnail(folderPath),
        this.config.taskTimeout
      );
      
      // 检查是否已取消
      if (task.aborted) {
        resolve(null);
        return;
      }
      
      // 缓存结果
      this.cache.set(folderPath, result);
      
      // 通知回调
      if (result && this.onThumbnailReady) {
        this.onThumbnailReady(folderPath, result);
      }
      
      resolve(result);
    } catch (error) {
      console.debug(`⚠️ 文件夹缩略图生成失败: ${folderPath}`, error);
      this.cache.set(folderPath, null); // 标记为失败
      resolve(null);
    }
  }

  /**
   * 生成文件夹缩略图
   */
  private async generateFolderThumbnail(folderPath: string): Promise<string | null> {
    try {
      // 1. 先尝试从数据库加载
      const dbResult = await invoke<string | null>('load_thumbnail_from_db', {
        path: folderPath,
        size: 0,
        ghash: 0,
        category: 'folder',
      });
      
      if (dbResult) {
        // 获取 blob 数据
        const blobData = await invoke<number[] | null>('get_thumbnail_blob_data', {
          blobKey: dbResult,
        });
        
        if (blobData && blobData.length > 0) {
          const blob = new Blob([new Uint8Array(blobData)], { type: 'image/webp' });
          return URL.createObjectURL(blob);
        }
      }
      
      // 2. 数据库没有，扫描文件夹内容
      const items = await FileSystemAPI.browseDirectory(folderPath);
      
      // 3. 按优先级查找封面
      // 优先级：cover.* > folder.* > thumb.* > 第一张图 > 第一个压缩包
      const coverPatterns = [/^cover\./i, /^folder\./i, /^thumb\./i];
      
      for (const pattern of coverPatterns) {
        const cover = items.find(item => 
          item.isImage && pattern.test(item.name || '')
        );
        if (cover) {
          return this.generateFromFile(folderPath, cover.path, false);
        }
      }
      
      // 4. 查找第一张图片
      const firstImage = items.find(item => item.isImage && !item.isDir);
      if (firstImage) {
        return this.generateFromFile(folderPath, firstImage.path, false);
      }
      
      // 5. 查找第一个压缩包
      const firstArchive = items.find(item => 
        !item.isDir && 
        /\.(zip|cbz|rar|cbr)$/i.test(item.name || '')
      );
      if (firstArchive) {
        return this.generateFromFile(folderPath, firstArchive.path, true);
      }
      
      return null;
    } catch (error) {
      console.debug(`文件夹缩略图生成错误: ${folderPath}`, error);
      return null;
    }
  }

  /**
   * 从文件生成缩略图并绑定到文件夹
   */
  private async generateFromFile(
    folderPath: string, 
    filePath: string, 
    isArchive: boolean
  ): Promise<string | null> {
    try {
      // 调用后端生成缩略图
      const command = isArchive ? 'generate_archive_thumbnail_new' : 'generate_file_thumbnail_new';
      const blobKey = await invoke<string>(command, {
        [isArchive ? 'archivePath' : 'filePath']: filePath,
      });
      
      if (!blobKey) return null;
      
      // 获取 blob 数据
      const blobData = await invoke<number[] | null>('get_thumbnail_blob_data', {
        blobKey,
      });
      
      if (!blobData || blobData.length === 0) return null;
      
      // 保存为文件夹缩略图
      await invoke('save_folder_thumbnail', {
        folderPath,
        thumbnailData: blobData,
      }).catch(() => {
        // 忽略保存失败
      });
      
      // 创建 blob URL
      const blob = new Blob([new Uint8Array(blobData)], { type: 'image/webp' });
      return URL.createObjectURL(blob);
    } catch (error) {
      console.debug(`从文件生成缩略图失败: ${filePath}`, error);
      return null;
    }
  }

  /**
   * 带超时的 Promise
   */
  private async withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), timeout)
      ),
    ]);
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 清除缓存
   */
  clearCache() {
    // 释放所有 blob URL
    for (const url of this.cache.values()) {
      if (url?.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    }
    this.cache.clear();
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      activeCount: this.activeCount,
      cacheSize: this.cache.size,
      currentDirectory: this.currentDirectory,
      warmupProgress: this.warmupProgress,
    };
  }

  /**
   * 【可见范围优化】只加载可见区域 + 预加载附近
   * @param folders 所有文件夹
   * @param visibleStart 可见起始索引
   * @param visibleEnd 可见结束索引
   * @param currentPath 当前目录路径
   */
  async loadVisibleFolders(
    folders: FsItem[], 
    visibleStart: number, 
    visibleEnd: number,
    currentPath: string
  ): Promise<void> {
    this.setCurrentDirectory(currentPath);
    
    const preload = this.config.preloadAhead;
    const start = Math.max(0, visibleStart - preload);
    const end = Math.min(folders.length, visibleEnd + preload);
    
    // 只处理可见范围 + 预加载区域
    const visibleFolders = folders.slice(start, end).filter(f => f.isDir);
    
    // 优先级：越靠近可见区域优先级越高
    const needProcess = visibleFolders.filter(f => 
      !this.cache.has(f.path) && !this.processing.has(f.path)
    );
    
    if (needProcess.length === 0) return;
    
    console.log(`📂 可见范围加载 [${start}-${end}]：${needProcess.length} 个文件夹`);
    
    // 按距离可见中心排序（中心优先）
    const center = (visibleStart + visibleEnd) / 2;
    const sorted = [...needProcess].sort((a, b) => {
      const idxA = folders.indexOf(a);
      const idxB = folders.indexOf(b);
      return Math.abs(idxA - center) - Math.abs(idxB - center);
    });
    
    for (let i = 0; i < sorted.length; i++) {
      const folder = sorted[i];
      this.enqueue(folder.path, i);
    }
  }

  /**
   * 【递归预热】预热指定路径下的所有文件夹和文件缩略图
   * @param rootPath 根路径
   * @param onProgress 进度回调
   * @param maxDepth 最大递归深度
   */
  async warmupRecursive(
    rootPath: string,
    onProgress?: (progress: WarmupProgress) => void,
    maxDepth = 3
  ): Promise<WarmupProgress> {
    this.warmupAborted = false;
    this.warmupProgress = {
      total: 0,
      completed: 0,
      failed: 0,
      current: rootPath,
    };
    
    // 收集所有需要预热的路径
    const allPaths: { path: string; isDir: boolean; depth: number }[] = [];
    await this.collectPaths(rootPath, allPaths, 0, maxDepth);
    
    this.warmupProgress.total = allPaths.length;
    onProgress?.(this.warmupProgress);
    
    console.log(`🔥 开始递归预热：${rootPath}（共 ${allPaths.length} 项，深度 ${maxDepth}）`);
    
    // 分批处理
    for (let i = 0; i < allPaths.length; i += this.config.batchSize) {
      if (this.warmupAborted) {
        console.log('🛑 预热已取消');
        break;
      }
      
      const batch = allPaths.slice(i, i + this.config.batchSize);
      
      // 并行处理当前批次
      await Promise.allSettled(batch.map(async item => {
        if (this.warmupAborted) return;
        
        this.warmupProgress!.current = item.path;
        onProgress?.(this.warmupProgress!);
        
        try {
          if (item.isDir) {
            await this.generateFolderThumbnail(item.path);
          } else {
            // 普通文件交给 thumbnailManager
            // 这里只处理文件夹
          }
          this.warmupProgress!.completed++;
        } catch {
          this.warmupProgress!.failed++;
        }
        
        onProgress?.(this.warmupProgress!);
      }));
      
      // 批次间隔
      if (i + this.config.batchSize < allPaths.length && !this.warmupAborted) {
        await this.delay(this.config.batchDelay);
      }
    }
    
    console.log(`✅ 预热完成：${this.warmupProgress.completed}/${this.warmupProgress.total}（失败 ${this.warmupProgress.failed}）`);
    
    const result = { ...this.warmupProgress };
    this.warmupProgress = undefined;
    return result;
  }

  /**
   * 递归收集路径
   */
  private async collectPaths(
    path: string, 
    result: { path: string; isDir: boolean; depth: number }[],
    depth: number,
    maxDepth: number
  ): Promise<void> {
    if (this.warmupAborted || depth > maxDepth) return;
    
    try {
      const items = await FileSystemAPI.browseDirectory(path);
      
      for (const item of items) {
        if (this.warmupAborted) return;
        
        if (item.isDir) {
          result.push({ path: item.path, isDir: true, depth });
          // 递归子目录
          await this.collectPaths(item.path, result, depth + 1, maxDepth);
        }
      }
    } catch (error) {
      console.debug(`收集路径失败: ${path}`, error);
    }
  }

  /**
   * 取消预热
   */
  cancelWarmup() {
    this.warmupAborted = true;
    console.log('🛑 预热取消请求已发送');
  }

  /**
   * 是否正在预热
   */
  isWarming(): boolean {
    return this.warmupProgress !== undefined && !this.warmupAborted;
  }
}

// 单例导出
export const folderThumbnailLoader = new FolderThumbnailLoader();
