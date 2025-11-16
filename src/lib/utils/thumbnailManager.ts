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
    // 拉满CPU性能，参考 NeeView 的处理方式，提高两倍性能
    maxConcurrentLocal: Math.max(64, (navigator.hardwareConcurrency || 4) * 16), // 16倍核心数，最少64，拉满速度（提高2倍）
    maxConcurrentArchive: Math.max(32, (navigator.hardwareConcurrency || 4) * 8), // 8倍核心数，最少32（提高2倍）
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

  // 任务上限管理（参考 NeeView，拉满速度，提高两倍性能）
  private readonly MAX_QUEUE_SIZE = 20000; // 最大队列大小（增加到20000，提高2倍）
  private readonly MAX_PROCESSING = 400; // 最大并发处理数（增加到400，拉满CPU，提高2倍）

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
      const thumbnailPath = await this.getThumbnailPath();
      const dbPath = `${thumbnailPath}/thumbnails.db`;
      console.log(`📁 缩略图数据库路径: ${dbPath}`);
      await invoke('init_thumbnail_manager', {
        thumbnailPath,
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
    // 强制使用 D:\temp\neoview
    return 'D:\\temp\\neoview';
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
    const oldPath = this.currentDirectory;
    this.currentDirectory = path;
    
    // 如果切换了目录，取消旧目录的任务，优先处理新目录的任务
    if (oldPath !== path && oldPath) {
      // 取消旧目录的任务（不在当前目录的任务）
      const beforeCount = this.taskQueue.length;
      this.taskQueue = this.taskQueue.filter(task => task.path.startsWith(path));
      const afterCount = this.taskQueue.length;
      if (beforeCount !== afterCount) {
        console.log(`🗑️ 取消 ${beforeCount - afterCount} 个旧目录任务`);
      }
      
      // 取消旧目录的处理中任务（通过路径匹配）
      const processingToRemove: string[] = [];
      for (const taskKey of this.processingTasks) {
        // 从 taskKey 中找到对应的任务，检查路径
        const task = this.taskQueue.find(t => this.buildPathKey(t.path, t.innerPath) === taskKey);
        if (!task || !task.path.startsWith(path)) {
          processingToRemove.push(taskKey);
        }
      }
      processingToRemove.forEach(key => this.processingTasks.delete(key));
      if (processingToRemove.length > 0) {
        console.log(`🗑️ 取消 ${processingToRemove.length} 个处理中的旧目录任务`);
      }
      
      this.bumpCurrentDirectoryPriority();
      // 立即处理队列，不要等待
      setTimeout(() => this.processQueue(), 0);
    }
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
   * 使用 getStableImageHash 保持一致性
   */
  private async generateHash(pathKey: string, size: number): Promise<number> {
    // 使用统一的哈希函数
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
        console.log(`📦 从数据库找到缩略图: ${pathKey} (blob key: ${blobKey})`);
        // 获取 blob 数据并创建 Blob URL
        const blobData = await invoke<number[] | null>('get_thumbnail_blob_data', {
          blobKey,
        });

        if (blobData && blobData.length > 0) {
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
          console.log(`✅ 成功从数据库加载缩略图: ${pathKey} (${blobData.length} bytes)`);
          return blobUrl;
        } else {
          console.warn(`⚠️ 从数据库获取的 blob 数据为空: ${pathKey}`);
        }
      } else {
        console.debug(`📭 数据库中没有缩略图: ${pathKey}`);
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
      // 权限错误静默处理，其他错误才打印
      const errorMsg = String(error);
      if (!errorMsg.includes('权限被拒绝') && !errorMsg.includes('Permission denied')) {
        console.error('生成缩略图失败:', path, error);
      }
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

    // 2. 尝试从数据库加载（不依赖索引缓存，直接尝试）
    // 这样可以立即显示已缓存的缩略图，不需要等待索引预加载
    try {
      const dbBlobUrl = await this.loadFromDb(path, innerPath);
      if (dbBlobUrl) {
        // loadFromDb 已经返回 blobUrl，不需要再转换
        // 更新缓存和索引缓存
        this.cache.set(pathKey, {
          pathKey,
          dataUrl: dbBlobUrl,
          timestamp: Date.now(),
        });
        this.dbIndexCache.set(pathKey, true);
        console.log(`✅ 从数据库加载缩略图: ${pathKey}`);
        return dbBlobUrl;
      }
      // 如果数据库中没有，更新索引缓存
      this.dbIndexCache.set(pathKey, false);
    } catch (error) {
      // 加载失败，继续尝试生成
      console.debug('从数据库加载缩略图失败:', pathKey, error);
      this.dbIndexCache.set(pathKey, false);
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

    // 5. 立即处理高优先级任务和当前目录任务（不等待，异步执行）
    if (priority === 'immediate' || path.startsWith(this.currentDirectory)) {
      // 立即触发队列处理，确保 immediate 和当前目录任务优先
      setTimeout(() => this.processQueue(), 0);
      // 异步处理，不阻塞
      this.processTask(pathKey).catch(err => {
        console.error('处理 immediate 任务失败:', pathKey, err);
      });
    }

    return null;
  }

  /**
   * 入队任务（带上限管理和当前目录优先）
   */
  private enqueueTask(task: ThumbnailTask) {
    // 检查队列上限
    if (this.taskQueue.length >= this.MAX_QUEUE_SIZE) {
      // 优先移除非当前目录的低优先级任务
      const priorityOrder = { immediate: 0, high: 1, normal: 2 };
      
      // 先移除非当前目录的 normal 优先级任务
      const toRemove = this.taskQueue.filter(t => 
        t.priority === 'normal' && 
        !t.path.startsWith(this.currentDirectory)
      );
      
      if (toRemove.length > 0) {
        // 移除这些任务
        this.taskQueue = this.taskQueue.filter(t => !toRemove.includes(t));
        console.warn(`缩略图队列已满，移除 ${toRemove.length} 个非当前目录的低优先级任务`);
      } else {
        // 如果没有可移除的，移除最低优先级的任务
        this.taskQueue.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
        this.taskQueue = this.taskQueue.slice(0, this.MAX_QUEUE_SIZE - 1);
        console.warn('缩略图队列已满，移除低优先级任务');
      }
    }

    // 检查是否已存在
    const existingIndex = this.taskQueue.findIndex(
      (t) => t.path === task.path && t.innerPath === task.innerPath
    );

    if (existingIndex >= 0) {
      // 更新优先级（如果更高，或者属于当前目录）
      const existing = this.taskQueue[existingIndex];
      const priorityOrder = { immediate: 0, high: 1, normal: 2 };
      const isCurrentDir = task.path.startsWith(this.currentDirectory);
      const existingIsCurrentDir = existing.path.startsWith(this.currentDirectory);
      
      // 如果新任务属于当前目录而旧任务不是，提升优先级
      if (isCurrentDir && !existingIsCurrentDir) {
        existing.priority = task.priority;
        existing.path = task.path; // 更新路径
      } else if (priorityOrder[task.priority] < priorityOrder[existing.priority]) {
        existing.priority = task.priority;
      }
      
      this.taskQueue.sort(
        (a, b) => {
          const priorityOrder = { immediate: 0, high: 1, normal: 2 };
          const aIsCurrent = a.path.startsWith(this.currentDirectory);
          const bIsCurrent = b.path.startsWith(this.currentDirectory);
          
          // 当前目录优先
          if (aIsCurrent && !bIsCurrent) return -1;
          if (!aIsCurrent && bIsCurrent) return 1;
          
          // 然后按优先级
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
      );
    } else {
      // 添加新任务
      this.taskQueue.push(task);
      this.taskQueue.sort(
        (a, b) => {
          const priorityOrder = { immediate: 0, high: 1, normal: 2 };
          const aIsCurrent = a.path.startsWith(this.currentDirectory);
          const bIsCurrent = b.path.startsWith(this.currentDirectory);
          
          // 当前目录优先
          if (aIsCurrent && !bIsCurrent) return -1;
          if (!aIsCurrent && bIsCurrent) return 1;
          
          // 然后按优先级
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
      );
    }

    // 开始处理队列（异步，不阻塞）
    setTimeout(() => this.processQueue(), 0);
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
        // loadFromDb 已经返回 blobUrl，不需要再转换
        // 更新缓存
        this.cache.set(pathKey, {
          pathKey,
          dataUrl: dbThumbnail,
          timestamp: Date.now(),
        });
        // 通知回调
        if (this.onThumbnailReady) {
          this.onThumbnailReady(task.path, dbThumbnail);
        }
        return dbThumbnail;
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
   * 处理队列（优化并发性能，带上限管理，优先处理当前目录）
   */
  private async processQueue() {
    const maxConcurrent = Math.min(this.config.maxConcurrentLocal, this.MAX_PROCESSING);
    const currentProcessing = this.processingTasks.size;

    if (currentProcessing >= maxConcurrent) {
      // 如果已达到最大并发，延迟重试
      setTimeout(() => this.processQueue(), 50);
      return;
    }

    // 重新排序队列，确保当前目录和 immediate 优先级任务在前
    this.taskQueue.sort((a, b) => {
      const priorityOrder = { immediate: 0, high: 1, normal: 2 };
      const aIsCurrent = a.path.startsWith(this.currentDirectory);
      const bIsCurrent = b.path.startsWith(this.currentDirectory);
      
      // 当前目录优先
      if (aIsCurrent && !bIsCurrent) return -1;
      if (!aIsCurrent && bIsCurrent) return 1;
      
      // 然后按优先级
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // 获取待处理的任务（优先当前目录和 immediate）
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
        // 继续处理队列（异步，不阻塞）
        if (this.taskQueue.length > 0 && this.processingTasks.size < maxConcurrent) {
          setTimeout(() => this.processQueue(), 10);
        }
      });
    });
  }

  /**
   * 批量预加载缩略图（用于当前目录，带上限管理）
   */
  async preloadThumbnails(
    items: FsItem[],
    currentPath: string,
    priority: 'immediate' | 'high' | 'normal' = 'immediate'
  ) {
    // 限制预加载数量，避免一次性加载太多
    const maxPreload = 200;
    const itemsToPreload = items.slice(0, maxPreload);
    
    // 预加载数据库索引（异步，不阻塞）
    const paths = itemsToPreload
      .filter((item) => item.isImage || item.isDir)
      .map((item) => item.path);

    // 异步预加载索引，不等待
    this.preloadDbIndex(paths).catch(err => {
      console.debug('预加载数据库索引失败:', err);
    });

    // 为每个项目获取缩略图（异步，不阻塞）
    itemsToPreload.forEach((item) => {
      if (item.isImage) {
        this.getThumbnail(item.path, undefined, false, priority);
      } else if (item.isDir) {
        // 文件夹：使用子路径下第一个条目的缩略图
        this.getThumbnail(item.path, undefined, false, priority);
      }
    });
    
    if (items.length > maxPreload) {
      console.log(`⚠️ 项目数量过多 (${items.length})，仅预加载前 ${maxPreload} 个`);
    }
  }

  /**
   * 获取文件夹缩略图（使用子路径下第一个条目的缩略图，立即加载，跟随虚拟列表）
   */
  async getFolderThumbnail(folderPath: string): Promise<string | null> {
    try {
      // 先检查是否有缓存的文件夹缩略图
      const pathKey = this.buildPathKey(folderPath);
      const cached = this.cache.get(pathKey);
      if (cached) {
        return cached.dataUrl;
      }

      // 尝试从数据库加载文件夹缩略图
      const dbThumbnail = await this.loadFromDb(folderPath);
      if (dbThumbnail) {
        this.cache.set(pathKey, {
          pathKey,
          dataUrl: dbThumbnail,
          timestamp: Date.now(),
        });
        return dbThumbnail;
      }

      // 立即获取文件夹内容（不延迟，跟随虚拟列表）
      const { invoke } = await import('@tauri-apps/api/core');
      
      try {
        const items = await invoke<FsItem[]>('browse_directory', { path: folderPath });
        
        // 优先查找图片文件
        const firstImage = items.find((item) => item.isImage && !item.isDir);

        if (firstImage) {
          // 使用第一个图片的缩略图（immediate 优先级，立即加载）
          const thumbnail = await this.getThumbnail(firstImage.path, undefined, false, 'immediate');
          if (thumbnail) {
            // 缓存文件夹缩略图，并保存到数据库（使用文件夹路径作为 key）
            this.cache.set(pathKey, {
              pathKey,
              dataUrl: thumbnail,
              timestamp: Date.now(),
            });
            // 注意：这里不保存到数据库，因为文件夹缩略图应该使用子项的缩略图
            return thumbnail;
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
          const thumbnail = await this.getThumbnail(firstArchive.path, undefined, true, 'immediate');
          if (thumbnail) {
            this.cache.set(pathKey, {
              pathKey,
              dataUrl: thumbnail,
              timestamp: Date.now(),
            });
            return thumbnail;
          }
        }

        // 如果没有图片和压缩包，尝试查找子文件夹（限制深度为1，避免递归过深）
        const firstSubfolder = items.find((item) => item.isDir);
        if (firstSubfolder) {
          // 递归查找，但限制深度
          const subThumbnail = await this.getFolderThumbnail(firstSubfolder.path);
          if (subThumbnail) {
            this.cache.set(pathKey, {
              pathKey,
              dataUrl: subThumbnail,
              timestamp: Date.now(),
            });
            return subThumbnail;
          }
        }
        
        return null;
      } catch (error) {
        console.debug('获取文件夹缩略图失败:', folderPath, error);
        return null;
      }
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

