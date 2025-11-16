/**
 * Thumbnail Manager
 * 缩略图管理器 - 参考 NeeView 的实现
 * 支持预加载、缓存、优先级队列
 */

import { invoke } from '@tauri-apps/api/core';
import { buildImagePathKey, type ImagePathContext, getStableImageHash } from './pathHash';
import type { FsItem } from '$lib/types';

export interface ThumbnailConfig {
  maxConcurrentLocal: number;
  maxConcurrentArchive: number;
  thumbnailSize: number;
}

export interface ThumbnailTask {
  path: string;
  innerPath?: string;
  isArchive: boolean;
  priority: 'immediate' | 'high' | 'normal';
  timestamp: number;
}

export interface ThumbnailCache {
  pathKey: string;
  dataUrl: string;
  timestamp: number;
}

class ThumbnailManager {
  private config: ThumbnailConfig = {
    // 根据 CPU 核心数动态调整（前端使用 navigator.hardwareConcurrency）
    maxConcurrentLocal: Math.max(8, (navigator.hardwareConcurrency || 4) * 2),
    maxConcurrentArchive: Math.max(3, Math.floor((navigator.hardwareConcurrency || 4) / 2)),
    thumbnailSize: 256,
  };

  // 任务队列（按优先级排序）
  private taskQueue: ThumbnailTask[] = [];
  private processingTasks = new Set<string>();
  private cache = new Map<string, ThumbnailCache>();
  private dbIndexCache = new Map<string, boolean>(); // 预加载的数据库索引缓存

  // 当前目录路径（用于优先级判断）
  private currentDirectory: string = '';

  // 回调函数
  private onThumbnailReady?: (path: string, dataUrl: string) => void;

  constructor() {
    // 初始化缩略图管理器
    this.init();
  }

  /**
   * 初始化缩略图管理器
   */
  private async init() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('init_thumbnail_manager', {
        thumbnailPath: await this.getThumbnailPath(),
        rootPath: '',
        size: this.config.thumbnailSize,
      });
      console.log('✅ 缩略图管理器初始化成功');
    } catch (error) {
      console.error('❌ 缩略图管理器初始化失败:', error);
    }
  }

  /**
   * 获取缩略图存储路径
   */
  private async getThumbnailPath(): Promise<string> {
    // 使用应用数据目录
    try {
      const { appDataDir } = await import('@tauri-apps/api/path');
      const dataDir = await appDataDir();
      return dataDir;
    } catch {
      return './thumbnails';
    }
  }

  /**
   * 设置配置
   */
  setConfig(config: Partial<ThumbnailConfig>) {
    this.config = { ...this.config, ...config };
  }

  /**
   * 设置当前目录（用于优先级判断）
   */
  setCurrentDirectory(path: string) {
    this.currentDirectory = path;
    // 提升当前目录任务的优先级
    this.bumpCurrentDirectoryPriority();
  }

  /**
   * 提升当前目录任务的优先级
   */
  private bumpCurrentDirectoryPriority() {
    this.taskQueue.forEach((task) => {
      if (task.path.startsWith(this.currentDirectory)) {
        task.priority = 'immediate';
      }
    });
    this.taskQueue.sort((a, b) => {
      const priorityOrder = { immediate: 0, high: 1, normal: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * 设置缩略图就绪回调
   */
  setOnThumbnailReady(callback: (path: string, dataUrl: string) => void) {
    this.onThumbnailReady = callback;
  }

  /**
   * 构建路径键（用于缓存和数据库）
   */
  private buildPathKey(path: string, innerPath?: string): string {
    if (innerPath) {
      return `${path}::${innerPath}`;
    }
    return path;
  }

  /**
   * 生成哈希值（用于数据库查询）
   */
  private async generateHash(pathKey: string, size: number): Promise<number> {
    // 使用 pathHash.ts 的逻辑生成哈希
    const hash = await getStableImageHash(pathKey);
    // 转换为 i32（取前8位字符的哈希值，然后取模避免溢出）
    const hashNum = parseInt(hash.substring(0, 8), 16) % 2147483647; // i32 max
    return hashNum;
  }

  /**
   * 预加载数据库索引（批量检查哪些路径有缓存）
   */
  async preloadDbIndex(paths: string[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    const { invoke } = await import('@tauri-apps/api/core');
    
    // 批量检查（可以优化为一次查询）
    await Promise.all(
      paths.map(async (path) => {
        const pathKey = this.buildPathKey(path);
        const cached = this.dbIndexCache.get(pathKey);
        if (cached !== undefined) {
          results.set(path, cached);
          return;
        }

        try {
          // 获取文件大小
          const metadata = await invoke<{ size: number }>('get_file_info', { path });
          const size = metadata.size || 0;
          const ghash = await this.generateHash(pathKey, size);

          // 检查数据库
          const exists = await invoke<boolean>('has_thumbnail', {
            path: pathKey,
            size,
            ghash,
          });

          this.dbIndexCache.set(pathKey, exists);
          results.set(path, exists);
        } catch (error) {
          console.debug('预加载索引失败:', path, error);
          results.set(path, false);
        }
      })
    );

    return results;
  }

  /**
   * 从数据库加载缩略图（返回 blob URL）
   */
  private async loadFromDb(path: string, innerPath?: string): Promise<string | null> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const pathKey = this.buildPathKey(path, innerPath);
      
      // 获取文件大小
      const metadata = await invoke<{ size: number }>('get_file_info', { path });
      const size = metadata.size || 0;
      const ghash = await this.generateHash(pathKey, size);

      // 从数据库加载（返回 blob key）
      const blobKey = await invoke<string | null>('load_thumbnail_from_db', {
        path: pathKey,
        size,
        ghash,
      });

      if (blobKey) {
        // 获取 blob 数据并创建 Blob URL
        const blobData = await invoke<number[] | null>('get_thumbnail_blob_data', {
          blobKey,
        });

        if (blobData) {
          // 转换为 Uint8Array
          const uint8Array = new Uint8Array(blobData);
          const blob = new Blob([uint8Array], { type: 'image/webp' });
          const blobUrl = URL.createObjectURL(blob);

          // 更新缓存
          this.cache.set(pathKey, {
            pathKey,
            dataUrl: blobUrl,
            timestamp: Date.now(),
          });
          return blobUrl;
        }
      }
    } catch (error) {
      console.debug('从数据库加载缩略图失败:', path, error);
    }

    return null;
  }

  /**
   * 生成缩略图（第一次生成，返回 blob URL）
   */
  private async generateThumbnail(
    path: string,
    innerPath?: string,
    isArchive: boolean = false
  ): Promise<string | null> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const pathKey = this.buildPathKey(path, innerPath);
      
      // 调用后端生成缩略图（返回 blob key）
      const blobKey = isArchive
        ? await invoke<string>('generate_archive_thumbnail_new', { archivePath: path })
        : await invoke<string>('generate_file_thumbnail_new', { filePath: path });

      if (blobKey) {
        // 获取 blob 数据并创建 Blob URL
        const blobData = await invoke<number[] | null>('get_thumbnail_blob_data', {
          blobKey,
        });

        if (blobData) {
          // 转换为 Uint8Array 并创建 Blob URL
          const uint8Array = new Uint8Array(blobData);
          const blob = new Blob([uint8Array], { type: 'image/webp' });
          const blobUrl = URL.createObjectURL(blob);

          // 更新缓存
          this.cache.set(pathKey, {
            pathKey,
            dataUrl: blobUrl,
            timestamp: Date.now(),
          });

          // 通知回调
          if (this.onThumbnailReady) {
            this.onThumbnailReady(path, blobUrl);
          }

          return blobUrl;
        }
      }
    } catch (error) {
      console.error('生成缩略图失败:', path, error);
    }

    return null;
  }

  /**
   * 获取缩略图（优先从缓存/数据库加载，否则生成）
   */
  async getThumbnail(
    path: string,
    innerPath?: string,
    isArchive: boolean = false,
    priority: 'immediate' | 'high' | 'normal' = 'normal'
  ): Promise<string | null> {
    const pathKey = this.buildPathKey(path, innerPath);

    // 1. 检查内存缓存
    const cached = this.cache.get(pathKey);
    if (cached) {
      return cached.dataUrl;
    }

    // 2. 检查数据库索引缓存
    const hasDbCache = this.dbIndexCache.get(pathKey);
    if (hasDbCache === true) {
      // 从数据库加载（返回 blob key，需要转换为 blob URL）
      const dbBlobKey = await this.loadFromDb(path, innerPath);
      if (dbBlobKey) {
        const blobUrl = await this.blobKeyToUrl(dbBlobKey);
        if (blobUrl) {
          // 更新缓存
          this.cache.set(pathKey, {
            pathKey,
            dataUrl: blobUrl,
            timestamp: Date.now(),
          });
          return blobUrl;
        }
      }
    }

    // 3. 如果任务已在处理中，等待
    if (this.processingTasks.has(pathKey)) {
      // 可以返回一个占位符或等待
      return null;
    }

    // 4. 添加到任务队列
    this.enqueueTask({
      path,
      innerPath,
      isArchive,
      priority,
      timestamp: Date.now(),
    });

    // 5. 立即处理高优先级任务
    if (priority === 'immediate') {
      return this.processTask(pathKey);
    }

    return null;
  }

  /**
   * 入队任务
   */
  private enqueueTask(task: ThumbnailTask) {
    // 检查是否已存在
    const existingIndex = this.taskQueue.findIndex(
      (t) => t.path === task.path && t.innerPath === task.innerPath
    );

    if (existingIndex >= 0) {
      // 更新优先级（如果更高）
      const existing = this.taskQueue[existingIndex];
      const priorityOrder = { immediate: 0, high: 1, normal: 2 };
      if (priorityOrder[task.priority] < priorityOrder[existing.priority]) {
        existing.priority = task.priority;
        this.taskQueue.sort(
          (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
        );
      }
    } else {
      // 添加新任务
      this.taskQueue.push(task);
      this.taskQueue.sort(
        (a, b) => {
          const priorityOrder = { immediate: 0, high: 1, normal: 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
      );
    }

    // 开始处理队列
    this.processQueue();
  }

  /**
   * 处理任务（优化版本，真正异步）
   */
  private async processTask(pathKey: string): Promise<string | null> {
    const task = this.taskQueue.find(
      (t) => this.buildPathKey(t.path, t.innerPath) === pathKey
    );

    if (!task) {
      return null;
    }

    try {
      // 先尝试从数据库加载
      const dbThumbnail = await this.loadFromDb(task.path, task.innerPath);
      if (dbThumbnail) {
        // 转换为 blob URL
        const blobUrl = await this.blobKeyToUrl(dbThumbnail);
        if (blobUrl) {
          // 更新缓存
          this.cache.set(pathKey, {
            pathKey,
            dataUrl: blobUrl,
            timestamp: Date.now(),
          });
          // 通知回调
          if (this.onThumbnailReady) {
            this.onThumbnailReady(task.path, blobUrl);
          }
          return blobUrl;
        }
      }

      // 生成新缩略图
      const blobKey = await this.generateThumbnail(task.path, task.innerPath, task.isArchive);
      if (blobKey) {
        // 转换为 blob URL
        const blobUrl = await this.blobKeyToUrl(blobKey);
        if (blobUrl) {
          // 更新缓存
          this.cache.set(pathKey, {
            pathKey,
            dataUrl: blobUrl,
            timestamp: Date.now(),
          });
          // 通知回调
          if (this.onThumbnailReady) {
            this.onThumbnailReady(task.path, blobUrl);
          }
          return blobUrl;
        }
      }
    } catch (error) {
      console.error('处理缩略图任务失败:', pathKey, error);
    }

    return null;
  }

  /**
   * 将 blob key 转换为 blob URL
   */
  private async blobKeyToUrl(blobKey: string): Promise<string | null> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const blobData = await invoke<number[] | null>('get_thumbnail_blob_data', { blobKey });
      
      if (blobData && blobData.length > 0) {
        // 转换为 Uint8Array
        const uint8Array = new Uint8Array(blobData);
        // 创建 Blob
        const blob = new Blob([uint8Array], { type: 'image/webp' });
        // 创建 Blob URL
        const blobUrl = URL.createObjectURL(blob);
        return blobUrl;
      }
    } catch (error) {
      console.error('获取 blob 数据失败:', blobKey, error);
    }
    
    return null;
  }

  /**
   * 处理队列（优化并发性能）
   */
  private async processQueue() {
    const maxConcurrent = this.config.maxConcurrentLocal;
    const currentProcessing = this.processingTasks.size;

    if (currentProcessing >= maxConcurrent) {
      // 如果已达到最大并发，延迟重试
      setTimeout(() => this.processQueue(), 50);
      return;
    }

    // 获取待处理的任务（按优先级排序）
    const tasksToProcess = this.taskQueue
      .filter(
        (task) =>
          !this.processingTasks.has(this.buildPathKey(task.path, task.innerPath))
      )
      .slice(0, maxConcurrent - currentProcessing);

    if (tasksToProcess.length === 0) {
      return;
    }

    // 真正并行处理 - 不等待，让任务在后台执行
    tasksToProcess.forEach((task) => {
      const pathKey = this.buildPathKey(task.path, task.innerPath);
      // 立即标记为处理中，避免重复
      this.processingTasks.add(pathKey);
      
      // 异步执行，不阻塞
      this.processTask(pathKey).catch((error) => {
        console.error('处理缩略图任务失败:', pathKey, error);
      }).finally(() => {
        this.processingTasks.delete(pathKey);
        // 从队列中移除
        const index = this.taskQueue.findIndex(
          (t) => this.buildPathKey(t.path, t.innerPath) === pathKey
        );
        if (index >= 0) {
          this.taskQueue.splice(index, 1);
        }
        // 继续处理队列
        if (this.taskQueue.length > 0) {
          setTimeout(() => this.processQueue(), 10);
        }
      });
    });
  }

  /**
   * 批量预加载缩略图（用于当前目录）
   */
  async preloadThumbnails(
    items: FsItem[],
    currentPath: string,
    priority: 'immediate' | 'high' | 'normal' = 'immediate'
  ) {
    // 预加载数据库索引
    const paths = items
      .filter((item) => item.isImage || item.isDir)
      .map((item) => item.path);

    await this.preloadDbIndex(paths);

    // 为每个项目获取缩略图
    items.forEach((item) => {
      if (item.isImage) {
        this.getThumbnail(item.path, undefined, false, priority);
      } else if (item.isDir) {
        // 文件夹：使用子路径下第一个条目的缩略图
        // 这里需要先获取子目录的第一个条目
        // 暂时入队，后续会处理
        this.getThumbnail(item.path, undefined, false, priority);
      }
    });
  }

  /**
   * 获取文件夹缩略图（使用子路径下第一个条目的缩略图，异步且不阻塞）
   */
  async getFolderThumbnail(folderPath: string): Promise<string | null> {
    try {
      // 先检查是否有缓存的文件夹缩略图
      const pathKey = this.buildPathKey(folderPath);
      const cached = this.cache.get(pathKey);
      if (cached) {
        return cached.dataUrl;
      }

      // 异步获取文件夹内容，不阻塞
      const { invoke } = await import('@tauri-apps/api/core');
      
      // 使用 requestIdleCallback 或 setTimeout 延迟加载，避免阻塞 UI
      return new Promise((resolve) => {
        // 延迟执行，确保不阻塞当前操作
        setTimeout(async () => {
          try {
            const items = await invoke<FsItem[]>('browse_directory', { path: folderPath });
            
            // 优先查找图片文件
            const firstImage = items.find((item) => item.isImage && !item.isDir);

            if (firstImage) {
              // 使用第一个图片的缩略图（异步，不阻塞）
              const thumbnail = await this.getThumbnail(firstImage.path, undefined, false, 'high');
              if (thumbnail) {
                // 缓存文件夹缩略图
                this.cache.set(pathKey, {
                  pathKey,
                  dataUrl: thumbnail,
                  timestamp: Date.now(),
                });
                resolve(thumbnail);
                return;
              }
            }

            // 如果没有图片，尝试查找压缩包
            const firstArchive = items.find(
              (item) =>
                !item.isDir &&
                (item.name.endsWith('.zip') ||
                  item.name.endsWith('.cbz') ||
                  item.name.endsWith('.rar') ||
                  item.name.endsWith('.cbr'))
            );

            if (firstArchive) {
              const thumbnail = await this.getThumbnail(firstArchive.path, undefined, true, 'high');
              if (thumbnail) {
                this.cache.set(pathKey, {
                  pathKey,
                  dataUrl: thumbnail,
                  timestamp: Date.now(),
                });
                resolve(thumbnail);
                return;
              }
            }

            // 如果没有图片和压缩包，尝试查找子文件夹（限制深度）
            const firstSubfolder = items.find((item) => item.isDir);
            if (firstSubfolder) {
              // 异步递归查找，不阻塞
              const subThumbnail = await this.getFolderThumbnail(firstSubfolder.path);
              if (subThumbnail) {
                this.cache.set(pathKey, {
                  pathKey,
                  dataUrl: subThumbnail,
                  timestamp: Date.now(),
                });
                resolve(subThumbnail);
                return;
              }
            }
            
            resolve(null);
          } catch (error) {
            console.debug('获取文件夹缩略图失败:', folderPath, error);
            resolve(null);
          }
        }, 0); // 使用 setTimeout(0) 延迟到下一个事件循环
      });
    } catch (error) {
      console.debug('获取文件夹缩略图失败:', folderPath, error);
      return null;
    }
  }

  /**
   * 取消指定路径的任务
   */
  cancelByPath(path: string) {
    this.taskQueue = this.taskQueue.filter((task) => task.path !== path);
    this.processingTasks.delete(path);
  }

  /**
   * 清空缓存
   */
  clearCache() {
    this.cache.clear();
    this.dbIndexCache.clear();
  }
}

// 单例
export const thumbnailManager = new ThumbnailManager();

