/**
 * NavigationHistory - 文件浏览导航历史管理
 * 支持前进、后退、主页功能和目录缓存
 */

import type { FsItem } from '$lib/types';
import { FileSystemAPI } from '$lib/api';

interface DirectoryCache {
  path: string;
  items: FsItem[];
  thumbnails: Map<string, string>;
  timestamp: number;
  mtime?: number; // 目录修改时间，用于验证缓存是否过期
  scrollPosition?: number; // 滚动位置
  sortField?: string; // 排序字段
  sortOrder?: 'asc' | 'desc'; // 排序顺序
  accessCount: number; // 访问次数，用于 LRU 淘汰
}

export class NavigationHistory {
  private history: string[] = [];
  private currentIndex: number = -1;
  private homepage: string = '';
  private maxHistorySize: number = 50;
  private cache = new Map<string, DirectoryCache>();
  private maxCacheSize: number = 50; // 增加缓存大小
  private cacheTimeout: number = 10 * 60 * 1000; // 10分钟缓存超时
  private currentPath: string = ''; // 当前路径，用于保护父目录缓存
  // 记录每个父目录最近一次进入的子目录路径，用于返回上一级时可选地高亮/定位
  private lastActiveChild: Map<string, string> = new Map();

  constructor(homepage: string = '') {
    this.homepage = homepage;
  }

  /**
   * 设置主页路径
   */
  setHomepage(path: string) {
    this.homepage = path;
  }

  /**
   * 获取主页路径
   */
  getHomepage(): string {
    return this.homepage;
  }

  /**
   * 记录从某个父目录进入的最后一个子目录
   */
  setLastActiveChild(parentPath: string | null | undefined, childPath: string | null | undefined) {
    if (!parentPath || !childPath) return;
    this.lastActiveChild.set(parentPath, childPath);
  }

  /**
   * 获取某个父目录最近一次进入的子目录路径
   */
  getLastActiveChild(parentPath: string | null | undefined): string | null {
    if (!parentPath) return null;
    return this.lastActiveChild.get(parentPath) ?? null;
  }

  /**
   * 添加新路径到历史记录
   */
  push(path: string) {
    // 如果当前不在历史记录末尾，删除后面的记录
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // 如果新路径与当前路径相同，不添加
    if (this.history[this.currentIndex] === path) {
      return;
    }

    this.history.push(path);
    this.currentIndex = this.history.length - 1;

    // 限制历史记录大小
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
      this.currentIndex = this.history.length - 1;
    }
  }

  /**
   * 后退
   */
  back(): string | null {
    if (this.canGoBack()) {
      this.currentIndex--;
      return this.history[this.currentIndex];
    }
    return null;
  }

  /**
   * 前进
   */
  forward(): string | null {
    if (this.canGoForward()) {
      this.currentIndex++;
      return this.history[this.currentIndex];
    }
    return null;
  }

  /**
   * 能否后退
   */
  canGoBack(): boolean {
    return this.currentIndex > 0;
  }

  /**
   * 能否前进
   */
  canGoForward(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * 获取当前路径
   */
  getCurrentPath(): string | null {
    return this.history[this.currentIndex] || null;
  }

  /**
   * 清空历史记录
   */
  clear() {
    this.history = [];
    this.currentIndex = -1;
  }

  /**
   * 获取所有历史记录
   */
  getHistory(): string[] {
    return [...this.history];
  }

  /**
   * 设置当前路径（用于保护父目录缓存）
   */
  setCurrentPath(path: string) {
    this.currentPath = path;
  }

  /**
   * 缓存目录数据（带排序状态和滚动位置）
   */
  cacheDirectory(
    path: string, 
    items: FsItem[], 
    thumbnails: Map<string, string>, 
    mtime?: number,
    sortField?: string,
    sortOrder?: 'asc' | 'desc',
    scrollPosition?: number
  ) {
    // 更新已存在的缓存
    const existing = this.cache.get(path);
    if (existing) {
      existing.items = [...items];
      existing.thumbnails = new Map(thumbnails);
      existing.timestamp = Date.now();
      existing.mtime = mtime;
      existing.accessCount++;
      if (sortField !== undefined) existing.sortField = sortField;
      if (sortOrder !== undefined) existing.sortOrder = sortOrder;
      if (scrollPosition !== undefined) existing.scrollPosition = scrollPosition;
      console.log(`📁 更新缓存: ${path}, 项目数: ${items.length}, 访问次数: ${existing.accessCount}`);
      return;
    }

    // 限制缓存大小 - 使用智能淘汰策略
    if (this.cache.size >= this.maxCacheSize) {
      this.evictCache();
    }

    this.cache.set(path, {
      path,
      items: [...items],
      thumbnails: new Map(thumbnails),
      timestamp: Date.now(),
      mtime,
      sortField,
      sortOrder,
      scrollPosition,
      accessCount: 1
    });

    console.log(`📁 缓存目录: ${path}, 项目数: ${items.length}, 缩略图数: ${thumbnails.size}`);
  }

  /**
   * 智能缓存淘汰策略
   * 优先保留：父目录、最近访问、访问次数多的
   */
  private evictCache() {
    const parentPaths = this.getAncestorPaths(this.currentPath);
    const now = Date.now();
    
    // 计算每个缓存项的优先级分数（分数越低越容易被淘汰）
    const scores: Array<{ path: string; score: number }> = [];
    
    for (const [path, cache] of this.cache.entries()) {
      let score = 0;
      
      // 父目录路径：高优先级保护
      if (parentPaths.includes(path)) {
        score += 1000;
      }
      
      // 最近访问时间（越近分数越高）
      const age = now - cache.timestamp;
      score += Math.max(0, 100 - age / 60000); // 每分钟减1分
      
      // 访问次数
      score += cache.accessCount * 10;
      
      scores.push({ path, score });
    }
    
    // 按分数排序，删除分数最低的
    scores.sort((a, b) => a.score - b.score);
    
    // 删除分数最低的缓存项
    const toDelete = scores.slice(0, Math.max(1, Math.floor(this.maxCacheSize * 0.1)));
    for (const { path } of toDelete) {
      this.cache.delete(path);
      console.log(`🗑️ 淘汰缓存: ${path}`);
    }
  }

  /**
   * 获取路径的所有祖先路径
   */
  private getAncestorPaths(path: string): string[] {
    if (!path) return [];
    const ancestors: string[] = [];
    let current = path.replace(/\\/g, '/');
    
    while (true) {
      const lastSlash = current.lastIndexOf('/');
      if (lastSlash <= 0) break;
      current = current.substring(0, lastSlash);
      ancestors.push(current);
      // 也添加 Windows 风格路径
      ancestors.push(current.replace(/\//g, '\\'));
    }
    
    return ancestors;
  }

  /**
   * 更新缓存的滚动位置
   */
  updateScrollPosition(path: string, scrollPosition: number) {
    const cached = this.cache.get(path);
    if (cached) {
      cached.scrollPosition = scrollPosition;
    }
  }

  /**
   * 更新缓存的排序状态
   */
  updateSortState(path: string, sortField: string, sortOrder: 'asc' | 'desc') {
    const cached = this.cache.get(path);
    if (cached) {
      cached.sortField = sortField;
      cached.sortOrder = sortOrder;
    }
  }

  /**
   * 更新目录缓存中的单个缩略图
   */
  updateCachedThumbnail(path: string, key: string, dataUrl: string) {
    const cached = this.cache.get(path);
    if (!cached) return;
    cached.thumbnails.set(key, dataUrl);
    cached.timestamp = Date.now();
  }

  /**
   * 获取缓存的目录数据
   */
  getCachedDirectory(path: string): DirectoryCache | null {
    const cached = this.cache.get(path);
    if (!cached) return null;

    // 检查缓存是否过期
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      console.log(`⏰ 缓存过期: ${path}`);
      this.cache.delete(path);
      return null;
    }

    console.log(`📋 使用缓存: ${path}, 项目数: ${cached.items.length}, 缩略图数: ${cached.thumbnails.size}`);
    return {
      ...cached,
      items: [...cached.items], // 返回深拷贝
      thumbnails: new Map(cached.thumbnails)
    };
  }

  /**
   * 验证缓存是否仍然有效
   */
  async validateCache(path: string): Promise<boolean> {
    const cached = this.cache.get(path);
    if (!cached) return false;

    try {
      // 检查目录是否存在
      const exists = await FileSystemAPI.pathExists(path);
      if (!exists) {
        this.cache.delete(path);
        return false;
      }

      // 如果有mtime，检查目录是否被修改
      if (cached.mtime) {
        const currentMtime = await this.getDirectoryMtime(path);
        if (currentMtime !== cached.mtime) {
          console.log(`📝 目录已修改: ${path}`);
          this.cache.delete(path);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error(`❌ 验证缓存失败: ${path}`, error);
      this.cache.delete(path);
      return false;
    }
  }

  /**
   * 获取目录修改时间
   */
  private async getDirectoryMtime(path: string): Promise<number | undefined> {
    try {
      const fileInfo = await FileSystemAPI.getFileMetadata(path);
      return fileInfo.modified ? new Date(fileInfo.modified).getTime() : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 清除指定路径的缓存
   */
  clearCache(path?: string) {
    if (path) {
      this.cache.delete(path);
      console.log(`🗑️ 清除缓存: ${path}`);
    } else {
      this.cache.clear();
      console.log(`🗑️ 清除所有缓存`);
    }
  }

  /**
   * 清理过期缓存
   */
  cleanupExpiredCache() {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, cache] of this.cache.entries()) {
      if (now - cache.timestamp > this.cacheTimeout) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => {
      this.cache.delete(key);
      console.log(`🧹 清理过期缓存: ${key}`);
    });

    return expiredKeys.length;
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats() {
    const stats = {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      entries: [] as Array<{
        path: string;
        itemCount: number;
        thumbnailCount: number;
        age: number;
      }>
    };

    for (const [path, cache] of this.cache.entries()) {
      stats.entries.push({
        path,
        itemCount: cache.items.length,
        thumbnailCount: cache.thumbnails.size,
        age: Date.now() - cache.timestamp
      });
    }

    return stats;
  }

  /**
   * 预缓存相邻目录（可选的性能优化）
   */
  async prefetchAdjacentPaths(currentPath: string): Promise<void> {
    // 获取父目录和子目录路径
    const parentPath = this.getParentPath(currentPath);
    const adjacentPaths = [parentPath];

    // 异步预加载，但不等待结果
    adjacentPaths.forEach(async (path) => {
      if (path && !this.cache.has(path)) {
        try {
          console.log(`🚀 预加载目录: ${path}`);
          const items = await FileSystemAPI.browseDirectory(path);
          this.cacheDirectory(path, items, new Map());
        } catch (error) {
          console.debug(`预加载失败: ${path}`, error);
        }
      }
    });
  }

  /**
   * 获取父目录路径
   */
  private getParentPath(path: string): string | null {
    const normalized = path.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash > 0 ? normalized.substring(0, lastSlash) : null;
  }
}