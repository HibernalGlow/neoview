/**
 * VisibleThumbnailLoader
 * 可见项目缩略图加载器
 * 
 * 参考 NeeView 的 ThumbnailList.RequestThumbnail 和 ThumbnailListView.LoadThumbnails
 * 
 * 核心策略：
 * 1. 中央优先：可见区域内，越靠近中央的项目优先加载
 * 2. 方向感知：根据滚动方向预加载前方内容
 * 3. 即时取消：离开可见区域的任务立即取消
 * 4. 智能防抖：过滤快速滚动，避免无效请求
 */

import type { FsItem } from '$lib/types';
import { thumbnailManager } from '../thumbnailManager';
import { isVideoFile } from '../videoUtils';

interface VisibleRange {
  start: number;
  end: number;
}

interface LoadItem {
  item: FsItem;
  index: number;
  distanceToCenter: number;
  directionBonus: number;
}

export class VisibleThumbnailLoader {
  private lastVisibleRange: VisibleRange = { start: 0, end: 0 };
  private lastScrollDirection = 0; // -1=up, 0=none, 1=down
  private lastScrollTime = 0;
  private pendingCancelIndices = new Set<number>();
  private currentPath = '';
  
  // 配置
  private readonly MARGIN = 2; // 预加载边距（上下各2个项目）
  private readonly SCROLL_VELOCITY_THRESHOLD = 5; // 快速滚动阈值（像素/ms）
  
  // 缓存检查回调（由外部注入，用于优化）
  private hasCacheCallback?: (path: string) => boolean;
  
  // 是否启用本地缓存过滤（设为 false 则交给 thumbnailManager 处理）
  private useLocalCacheFilter = false;
  
  /**
   * 设置缓存检查回调
   */
  setHasCacheCallback(callback: (path: string) => boolean) {
    this.hasCacheCallback = callback;
  }
  
  /**
   * 检查是否需要加载缩略图
   */
  private needsThumbnail(item: FsItem): boolean {
    // 文件夹、图片、视频、压缩包需要缩略图
    if (item.isDir || item.isImage || isVideoFile(item.path)) return true;
    
    const name = item.name?.toLowerCase() || '';
    return name.endsWith('.zip') || name.endsWith('.cbz') ||
           name.endsWith('.rar') || name.endsWith('.cbr') ||
           name.endsWith('.7z') || name.endsWith('.cb7');
  }
  
  /**
   * 检查是否已有缓存
   * 注意：为避免双重过滤问题，默认不进行本地缓存检查
   * thumbnailManager.requestVisibleThumbnails 会进行统一的缓存检查
   */
  private hasCache(path: string): boolean {
    // 如果禁用本地缓存过滤，始终返回 false（交给 thumbnailManager 处理）
    if (!this.useLocalCacheFilter) {
      return false;
    }
    
    if (this.hasCacheCallback) {
      return this.hasCacheCallback(path);
    }
    // 默认使用 thumbnailManager 的缓存检查
    return thumbnailManager.getCachedThumbnail(path) !== null;
  }
  
  /**
   * 处理可见范围变化
   * 参考 NeeView 的 ThumbnailListView.LoadThumbnails
   * 
   * @param items 所有项目列表
   * @param visibleStart 可见区域起始索引
   * @param visibleEnd 可见区域结束索引
   * @param scrollDirection 滚动方向 (-1=上, 0=无, 1=下)
   * @param currentPath 当前目录路径
   */
  handleVisibleRangeChange(
    items: FsItem[],
    visibleStart: number,
    visibleEnd: number,
    scrollDirection: number,
    currentPath: string
  ): void {
    if (items.length === 0) return;
    
    // 更新当前路径
    if (this.currentPath !== currentPath) {
      this.currentPath = currentPath;
      this.lastVisibleRange = { start: 0, end: 0 };
      thumbnailManager.setCurrentDirectory(currentPath);
    }
    
    // 1. 取消离开可见区域的任务（关键优化）
    this.cancelOutOfViewTasks(items, visibleStart, visibleEnd);
    
    // 2. 计算可见中心
    const center = Math.floor((visibleStart + visibleEnd) / 2);
    
    // 3. 构建优先级排序的加载列表
    const rangeStart = Math.max(0, visibleStart - this.MARGIN);
    const rangeEnd = Math.min(items.length - 1, visibleEnd + this.MARGIN);
    
    const itemsToLoad = this.buildLoadList(
      items,
      rangeStart,
      rangeEnd,
      center,
      scrollDirection
    );
    
    if (itemsToLoad.length === 0) {
      this.updateState(visibleStart, visibleEnd, scrollDirection);
      return;
    }
    
    // 4. 按优先级排序（中央优先 + 方向加成）
    itemsToLoad.sort((a, b) => {
      // 首先按距离中心排序
      const distDiff = a.distanceToCenter - b.distanceToCenter;
      if (distDiff !== 0) return distDiff;
      // 距离相同时，按方向加成排序
      return a.directionBonus - b.directionBonus;
    });
    
    // 5. 批量请求缩略图
    const paths = itemsToLoad.map(i => i.item.path);
    this.requestThumbnails(paths);
    
    // 6. 更新状态
    this.updateState(visibleStart, visibleEnd, scrollDirection);
  }
  
  /**
   * 构建需要加载的项目列表
   * 参考 NeeView 的 ThumbnailList.RequestThumbnail 中央优先排序
   */
  private buildLoadList(
    items: FsItem[],
    rangeStart: number,
    rangeEnd: number,
    center: number,
    scrollDirection: number
  ): LoadItem[] {
    const result: LoadItem[] = [];
    
    for (let i = rangeStart; i <= rangeEnd; i++) {
      const item = items[i];
      
      // 跳过不需要缩略图的项目
      if (!this.needsThumbnail(item)) continue;
      
      // 跳过已有缓存的项目
      if (this.hasCache(item.path)) continue;
      
      // 计算距离中心的距离
      const distanceToCenter = Math.abs(i - center);
      
      // 计算方向加成
      // 滚动方向前方的项目优先级更高（负值表示更高优先级）
      let directionBonus = 0;
      if (scrollDirection > 0) {
        // 向下滚动：下方项目优先
        directionBonus = i > center ? -1 : 1;
      } else if (scrollDirection < 0) {
        // 向上滚动：上方项目优先
        directionBonus = i < center ? -1 : 1;
      }
      
      result.push({
        item,
        index: i,
        distanceToCenter,
        directionBonus
      });
    }
    
    return result;
  }
  
  /**
   * 取消离开可见区域的任务
   * 参考 NeeView 的 JobClient.CancelOrder
   * 
   * 注意：只取消距离可见区域较远的任务，避免过于激进
   */
  private cancelOutOfViewTasks(
    items: FsItem[],
    visibleStart: number,
    visibleEnd: number
  ): void {
    const { start: oldStart, end: oldEnd } = this.lastVisibleRange;
    
    // 如果是首次，不需要取消
    if (oldStart === 0 && oldEnd === 0) return;
    
    // 如果范围未变化，不需要取消
    if (oldStart === visibleStart && oldEnd === visibleEnd) return;
    
    // 计算扩展范围（加大边距，避免过于激进的取消）
    const cancelMargin = this.MARGIN * 2; // 取消边距是预加载边距的两倍
    const extendedStart = visibleStart - cancelMargin;
    const extendedEnd = visibleEnd + cancelMargin;
    
    // 找出离开扩展可见区域的索引对应的路径
    const pathsToCancel = new Set<string>();
    
    for (let i = oldStart; i <= oldEnd; i++) {
      if (i < extendedStart || i > extendedEnd) {
        // 这个索引已远离可见区域
        if (i >= 0 && i < items.length) {
          pathsToCancel.add(items[i].path);
        }
      }
    }
    
    // 通知 thumbnailManager 取消这些任务
    if (pathsToCancel.size > 0) {
      thumbnailManager.cancelPendingTasks(pathsToCancel);
    }
  }
  
  /**
   * 请求缩略图加载
   */
  private requestThumbnails(paths: string[]): void {
    if (paths.length === 0) return;
    
    if (import.meta.env.DEV) {
      console.debug(`📂 VisibleThumbnailLoader: 请求 ${paths.length} 个缩略图`);
    }
    
    // 使用 thumbnailManager 的可见项目加载方法
    thumbnailManager.requestVisibleThumbnails(paths, this.currentPath);
  }
  
  /**
   * 更新内部状态
   */
  private updateState(
    visibleStart: number,
    visibleEnd: number,
    scrollDirection: number
  ): void {
    this.lastVisibleRange = { start: visibleStart, end: visibleEnd };
    this.lastScrollDirection = scrollDirection;
    this.lastScrollTime = Date.now();
  }
  
  /**
   * 检测滚动方向和速度
   */
  detectScrollDirection(
    currentScrollTop: number,
    lastScrollTop: number,
    deltaTime: number
  ): { direction: number; isRapid: boolean } {
    const delta = currentScrollTop - lastScrollTop;
    const velocity = deltaTime > 0 ? Math.abs(delta) / deltaTime : 0;
    
    return {
      direction: delta > 0 ? 1 : delta < 0 ? -1 : 0,
      isRapid: velocity > this.SCROLL_VELOCITY_THRESHOLD
    };
  }
  
  /**
   * 重置状态（目录切换时调用）
   */
  reset(): void {
    this.lastVisibleRange = { start: 0, end: 0 };
    this.lastScrollDirection = 0;
    this.lastScrollTime = 0;
    this.pendingCancelIndices.clear();
    this.currentPath = '';
  }
  
  /**
   * 获取当前状态（用于调试）
   */
  getState() {
    return {
      lastVisibleRange: { ...this.lastVisibleRange },
      lastScrollDirection: this.lastScrollDirection,
      currentPath: this.currentPath
    };
  }
}

// 导出单例
export const visibleThumbnailLoader = new VisibleThumbnailLoader();
