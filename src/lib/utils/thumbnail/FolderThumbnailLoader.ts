/**
 * 文件夹缩略图加载器
 * - 异步并发控制
 * - 池化限制防止大目录爆炸
 * - 目录切换时取消旧任务
 */

import { invoke } from '@tauri-apps/api/core';
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
}

interface FolderTask {
  folderPath: string;
  priority: number; // 0 最高
  resolve: (url: string | null) => void;
  reject: (error: Error) => void;
  aborted: boolean;
}

const DEFAULT_CONFIG: FolderThumbnailConfig = {
  maxConcurrent: 5,      // 最多同时处理 5 个文件夹
  batchSize: 20,         // 每批处理 20 个
  batchDelay: 50,        // 批次间隔 50ms
  taskTimeout: 10000,    // 单任务 10 秒超时
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
    };
  }
}

// 单例导出
export const folderThumbnailLoader = new FolderThumbnailLoader();
