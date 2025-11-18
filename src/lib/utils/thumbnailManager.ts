/**
 * Thumbnail Manager
 * 缩略图管理器 - 参考 NeeView 的实现
 * 支持预加载、缓存、优先级队列
 */

import { invoke } from '@tauri-apps/api/core';
import { buildImagePathKey, type ImagePathContext, getStableImageHash } from './pathHash';
import type { FsItem } from '$lib/types';
import { taskScheduler } from '$lib/core/tasks/taskScheduler';

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
   * 获取已缓存的缩略图（存在内存缓存时立即返回）
   */
  getCachedThumbnail(path: string, innerPath?: string): string | null {
    const pathKey = this.buildPathKey(path, innerPath);
    return this.cache.get(pathKey)?.dataUrl ?? null;
  }

  /**
   * 批量匹配内存缓存中的缩略图，返回映射
   */
  matchCachedThumbnails(items: FsItem[]): Map<string, string> {
    const results = new Map<string, string>();
    items.forEach((item) => {
      const cached = this.getCachedThumbnail(item.path);
      if (cached) {
        results.set(item.path, cached);
      }
    });
    return results;
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
   * 简化：只使用 key + category，减少计算
   */
	async preloadDbIndex(paths: string[]): Promise<Map<string, boolean>> {
		const results = new Map<string, boolean>();
		if (paths.length === 0) {
			return results;
		}

		const pending: Array<{ path: string; key: string; category: string }> = [];

		for (const path of paths) {
			const key = this.buildPathKey(path);
			const cached = this.dbIndexCache.get(key);
			if (cached !== undefined) {
				results.set(path, cached);
				continue;
			}
			pending.push({
				path,
				key,
				category: this.inferCategory(key)
			});
		}

		if (pending.length === 0) {
			return results;
		}

		try {
			const { invoke } = await import('@tauri-apps/api/core');
			const response = await invoke<Array<{ path: string; exists: boolean }>>('preload_thumbnail_index', {
				entries: pending.map((entry) => ({
					path: entry.key,
					category: entry.category
				}))
			});

			for (const entry of response) {
				this.dbIndexCache.set(entry.path, entry.exists);
			}

			for (const entry of pending) {
				const exists = this.dbIndexCache.get(entry.key) ?? false;
				results.set(entry.path, exists);
			}
		} catch (error) {
			console.debug('批量预加载索引失败:', error);
			for (const entry of pending) {
				this.dbIndexCache.set(entry.key, false);
				results.set(entry.path, false);
			}
		}

		return results;
	}

	private inferCategory(pathKey: string): string {
		const isFolder =
			!pathKey.includes('::') &&
			!pathKey.match(/\.(jpg|jpeg|png|gif|bmp|webp|avif|jxl|tiff|tif|zip|cbz|rar|cbr|mp4|mkv|avi|mov|flv|webm|wmv|m4v|mpg|mpeg)$/i);
		return isFolder ? 'folder' : 'file';
	}

  /**
   * 从数据库加载缩略图（返回 blob URL）
   * 简化：只使用 key + category，减少计算
   */
  private async loadFromDb(path: string, innerPath?: string, isFolder?: boolean): Promise<string | null> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const pathKey = this.buildPathKey(path, innerPath);
      
      // 确定类别
      const category = isFolder ? 'folder' : 'file';
      
      // 默认只使用 key + category 查询（减少计算，不需要 size 和 ghash）
      // 传递 0 作为 size 和 ghash（后端不使用这些值）
      // 如果是文件夹且没有记录，后端会自动查找路径下最早的文件记录并绑定
      const blobKey = await invoke<string | null>('load_thumbnail_from_db', {
        path: pathKey,
        size: 0, // 不再使用，减少计算
        ghash: 0, // 不再使用，减少计算
        category,
      });

      if (blobKey) {
        console.log(`📦 从数据库找到缩略图: ${pathKey} (category=${category}, blob key: ${blobKey})`);
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
        console.debug(`📭 数据库中没有缩略图: ${pathKey} (category=${category})`);
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
    // 判断是否为文件夹：没有 innerPath 且不是压缩包，且路径没有扩展名
    const isFolder = !innerPath && !isArchive && !path.match(/\.(jpg|jpeg|png|gif|bmp|webp|avif|jxl|tiff|tif|zip|cbz|rar|cbr|mp4|mkv|avi|mov|flv|webm|wmv|m4v|mpg|mpeg)$/i);
    
    try {
      const dbBlobUrl = await this.loadFromDb(path, innerPath, isFolder);
      if (dbBlobUrl) {
        // loadFromDb 已经返回 blobUrl，不需要再转换
        // 更新缓存和索引缓存
        this.cache.set(pathKey, {
          pathKey,
          dataUrl: dbBlobUrl,
          timestamp: Date.now(),
        });
        this.dbIndexCache.set(pathKey, true);
        // 只在调试模式下打印日志
        if (import.meta.env.DEV) {
          console.log(`✅ 从数据库加载缩略图: ${pathKey}${isFolder ? ' (文件夹)' : ''}`);
        }
        // 通知回调（重要：确保文件夹缩略图能正确显示）
        if (this.onThumbnailReady) {
          this.onThumbnailReady(path, dbBlobUrl);
        }
        return dbBlobUrl;
      }
      // 如果数据库中没有，更新索引缓存
      this.dbIndexCache.set(pathKey, false);
    } catch (error) {
      // 加载失败，继续尝试生成
      console.debug('从数据库加载缩略图失败:', pathKey, error);
      this.dbIndexCache.set(pathKey, false);
    }

    // 3. 文件夹处理：只从数据库加载，不主动生成（避免性能问题）
    // 文件夹缩略图由反向查找策略自动更新（当子文件/压缩包生成缩略图时）
    if (isFolder) {
      // 文件夹的缩略图只从数据库加载，如果数据库中没有，返回 null（不主动查找）
      return null;
    }

    // 4. 如果任务已在处理中，等待
    if (this.processingTasks.has(pathKey)) {
      // 可以返回一个占位符或等待
      return null;
    }

    // 5. 添加到任务队列
    this.enqueueTask({
      path,
      innerPath,
      isArchive,
      priority,
      timestamp: Date.now(),
    });

    // 6. 立即处理高优先级任务和当前目录任务（不等待，异步执行）
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

  private mapSchedulerPriority(priority: ThumbnailTask['priority']): 'low' | 'normal' | 'high' {
    switch (priority) {
      case 'immediate':
        return 'high';
      case 'high':
        return 'normal';
      default:
        return 'low';
    }
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

      // 检查是否为文件夹（通过检查路径是否有图片/压缩包扩展名来判断）
      // 如果是文件夹（没有扩展名且不是压缩包），不主动生成
      if (!task.isArchive && !task.innerPath) {
        const pathLower = task.path.toLowerCase();
        const hasImageExt = /\.(jpg|jpeg|png|gif|bmp|webp|avif|jxl|tiff|tif)$/.test(pathLower);
        const hasArchiveExt = /\.(zip|cbz|rar|cbr)$/.test(pathLower);
        const hasVideoExt = /\.(mp4|mkv|avi|mov|flv|webm|wmv|m4v|mpg|mpeg)$/.test(pathLower);
        
        // 如果没有图片、压缩包或视频扩展名，可能是文件夹，不主动生成
        if (!hasImageExt && !hasArchiveExt && !hasVideoExt) {
          // 文件夹缩略图会在子文件生成时自动更新
          return null;
        }
      }

      // 生成新缩略图（处理图片、压缩包和视频文件）
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

    // 使用全局任务调度器执行，统一控制并发
    tasksToProcess.forEach((task) => {
      const pathKey = this.buildPathKey(task.path, task.innerPath);
      if (this.processingTasks.has(pathKey)) return;
      this.processingTasks.add(pathKey);

      taskScheduler.enqueue({
        type: 'thumbnail-generate',
        priority: this.mapSchedulerPriority(task.priority),
        bucket: 'background',
        source: 'thumbnail-manager',
        executor: async () => {
          try {
            await this.processTask(pathKey);
          } catch (error) {
            console.error('处理缩略图任务失败:', pathKey, error);
          } finally {
            this.processingTasks.delete(pathKey);
            const index = this.taskQueue.findIndex(
              (t) => this.buildPathKey(t.path, t.innerPath) === pathKey
            );
            if (index >= 0) {
              this.taskQueue.splice(index, 1);
            }
            if (this.taskQueue.length > 0 && this.processingTasks.size < maxConcurrent) {
              setTimeout(() => this.processQueue(), 10);
            }
          }
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
   * 检查数据库中是否有缩略图记录（简化：只使用 key + category）
   */
  async checkThumbnailInDb(path: string): Promise<boolean> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const pathKey = this.buildPathKey(path);
      
      // 判断类别
      const isFolder = !pathKey.includes("::") && !pathKey.match(/\.(jpg|jpeg|png|gif|bmp|webp|avif|jxl|tiff|tif|zip|cbz|rar|cbr|mp4|mkv|avi|mov|flv|webm|wmv|m4v|mpg|mpeg)$/i);
      const category = isFolder ? 'folder' : 'file';
      
      // 检查数据库（只使用 key + category）
      const exists = await invoke<boolean>('has_thumbnail_by_key_category', {
        path: pathKey,
        category,
      });
      
      return exists;
    } catch {
      return false;
    }
  }

  /**
   * 批量扫描文件夹并自动绑定缩略图
   * 对于无记录的文件夹，查找第一个图片/压缩包，生成缩略图并绑定到文件夹
   */
  async batchScanFoldersAndBindThumbnails(
    folders: FsItem[],
    currentPath: string
  ): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    
    // 限制并发扫描数量，避免性能问题
    const maxConcurrent = 10;
    const batchSize = Math.min(folders.length, maxConcurrent);
    
    // 分批处理
    for (let i = 0; i < folders.length; i += batchSize) {
      const batch = folders.slice(i, i + batchSize);
      
      // 并行扫描一批文件夹
      await Promise.all(
        batch.map(async (folder) => {
          try {
            // 获取文件夹内容
            const items = await invoke<FsItem[]>('browse_directory', { path: folder.path });
            
            // 优先查找图片文件
            const firstImage = items.find((item) => item.isImage && !item.isDir);
            if (firstImage) {
              console.log(`🖼️ 为文件夹找到图片: ${folder.path} -> ${firstImage.path}`);
              // 生成图片缩略图（会自动反向更新父文件夹）
              await this.getThumbnail(firstImage.path, undefined, false, 'high');
              return;
            }
            
            // 如果没有图片，查找压缩包
            const firstArchive = items.find(
              (item) =>
                !item.isDir &&
                (item.name.endsWith('.zip') ||
                  item.name.endsWith('.cbz') ||
                  item.name.endsWith('.rar') ||
                  item.name.endsWith('.cbr'))
            );
            if (firstArchive) {
              console.log(`📦 为文件夹找到压缩包: ${folder.path} -> ${firstArchive.path}`);
              // 生成压缩包缩略图（会自动反向更新父文件夹）
              await this.getThumbnail(firstArchive.path, undefined, true, 'high');
              return;
            }
            
            // 如果没有图片和压缩包，查找子文件夹（最多一层，避免递归太深）
            const firstSubfolder = items.find((item) => item.isDir);
            if (firstSubfolder) {
              // 递归查找子文件夹的第一个图片/压缩包（限制深度为1）
              const subItems = await invoke<FsItem[]>('browse_directory', { path: firstSubfolder.path });
              const subImage = subItems.find((item) => item.isImage && !item.isDir);
              if (subImage) {
                console.log(`🖼️ 为文件夹找到子文件夹图片: ${folder.path} -> ${subImage.path}`);
                await this.getThumbnail(subImage.path, undefined, false, 'high');
                return;
              }
              const subArchive = subItems.find(
                (item) =>
                  !item.isDir &&
                  (item.name.endsWith('.zip') ||
                    item.name.endsWith('.cbz') ||
                    item.name.endsWith('.rar') ||
                    item.name.endsWith('.cbr'))
              );
              if (subArchive) {
                console.log(`📦 为文件夹找到子文件夹压缩包: ${folder.path} -> ${subArchive.path}`);
                await this.getThumbnail(subArchive.path, undefined, true, 'high');
                return;
              }
            }
          } catch (error) {
            console.debug(`扫描文件夹失败: ${folder.path}`, error);
          }
        })
      );
      
      // 批次之间稍微延迟，避免过载
      if (i + batchSize < folders.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`✅ 批量扫描完成: ${folders.length} 个文件夹`);
  }

  /**
   * 获取文件夹缩略图（已弃用：不再主动查找，只从数据库加载）
   * 文件夹缩略图由反向查找策略自动更新（当子文件/压缩包生成缩略图时）
   * @deprecated 文件夹缩略图现在只从数据库加载，不主动查找
   */
  async getFolderThumbnail(
    folderPath: string,
    _maxDepth?: number,
    _currentDepth?: number
  ): Promise<string | null> {
    // 只从数据库加载，不主动查找（避免超多子文件夹影响性能）
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

    // 数据库中没有记录，不主动查找（避免性能问题）
    // 文件夹缩略图会在子文件/压缩包生成缩略图时自动更新
    return null;
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

