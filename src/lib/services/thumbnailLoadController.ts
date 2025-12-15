/**
 * ThumbnailLoadController
 * 
 * 缩略图加载控制器 - 参考 NeeView 的 ListBoxThumbnailLoader
 * 
 * 核心功能：
 * 1. 中央优先加载策略
 * 2. 防抖处理（100ms）
 * 3. 请求版本控制（取消旧请求）
 * 4. 批量请求合并
 * 5. 智能预加载
 */

import { thumbnailCacheStore } from '$lib/stores/thumbnailCache.svelte';
import { thumbnailService } from '$lib/services/thumbnailService';
import { bookStore } from '$lib/stores/book.svelte';

// ===========================================================================
// 类型定义
// ===========================================================================

/** 加载优先级 */
export enum LoadPriority {
	VISIBLE = 0,      // 当前可见区域
	ADJACENT = 1,     // 相邻页面 (±1)
	PRELOAD = 2,      // 预加载范围内
	BACKGROUND = 3,   // 后台预热
}

/** 加载请求 */
export interface LoadRequest {
	pageIndex: number;
	priority: LoadPriority;
	distance: number;  // 距离当前页的距离
	timestamp: number;
	version: number;   // 请求版本，用于取消
}

/** 控制器配置 */
export interface LoadControllerConfig {
	preloadRange: number;      // 预加载范围，默认 20
	debounceDelay: number;     // 防抖延迟，默认 100ms
	batchSize: number;         // 批量请求大小，默认 10
	maxConcurrent: number;     // 最大并发请求，默认 4
}

/** 控制器状态 */
interface ControllerState {
	isVisible: boolean;
	currentPageIndex: number;
	currentBookPath: string | null;
	requestVersion: number;
	pendingRequests: Set<number>;
	lastScrollTime: number;
}

// ===========================================================================
// 工具函数
// ===========================================================================

/**
 * 中央优先排序算法
 * 按距离中心的距离升序排列
 * 
 * @param indices 页面索引数组
 * @param center 中心索引
 * @returns 排序后的索引数组
 */
export function sortByCenterPriority(indices: number[], center: number): number[] {
	return [...indices].sort((a, b) => {
		const distA = Math.abs(a - center);
		const distB = Math.abs(b - center);
		if (distA !== distB) {
			return distA - distB;
		}
		// 距离相同时，优先加载前面的页面
		return a - b;
	});
}

/**
 * 计算页面的加载优先级
 */
export function calculatePriority(pageIndex: number, currentPage: number, visibleStart: number, visibleEnd: number): LoadPriority {
	// 可见区域
	if (pageIndex >= visibleStart && pageIndex <= visibleEnd) {
		return LoadPriority.VISIBLE;
	}
	// 相邻页面
	const distance = Math.abs(pageIndex - currentPage);
	if (distance <= 1) {
		return LoadPriority.ADJACENT;
	}
	// 预加载范围
	if (distance <= 20) {
		return LoadPriority.PRELOAD;
	}
	// 后台预热
	return LoadPriority.BACKGROUND;
}

// ===========================================================================
// ThumbnailLoadController 类
// ===========================================================================

class ThumbnailLoadController {
	private config: LoadControllerConfig = {
		preloadRange: 20,
		debounceDelay: 100,
		batchSize: 10,
		maxConcurrent: 4,
	};

	private state: ControllerState = {
		isVisible: false,
		currentPageIndex: 0,
		currentBookPath: null,
		requestVersion: 0,
		pendingRequests: new Set(),
		lastScrollTime: 0,
	};

	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private isInitialized = false;

	// ===========================================================================
	// 生命周期
	// ===========================================================================

	/**
	 * 初始化控制器
	 */
	async init(): Promise<void> {
		if (this.isInitialized) return;
		this.isInitialized = true;
		console.log('🎮 ThumbnailLoadController: Initialized');
	}

	/**
	 * 销毁控制器
	 */
	destroy(): void {
		this.cancelPendingRequests();
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		this.isInitialized = false;
		console.log('🎮 ThumbnailLoadController: Destroyed');
	}

	// ===========================================================================
	// 配置
	// ===========================================================================

	/**
	 * 设置预加载范围
	 */
	setPreloadRange(range: number): void {
		this.config.preloadRange = Math.max(1, Math.min(100, range));
	}

	/**
	 * 设置防抖延迟
	 */
	setDebounceDelay(ms: number): void {
		this.config.debounceDelay = Math.max(0, Math.min(500, ms));
	}

	/**
	 * 获取当前配置
	 */
	getConfig(): LoadControllerConfig {
		return { ...this.config };
	}

	// ===========================================================================
	// 事件处理
	// ===========================================================================

	/**
	 * 可见性变化处理
	 */
	onVisibilityChange(visible: boolean): void {
		this.state.isVisible = visible;
		
		if (visible) {
			// 立即开始加载（不防抖）
			this.loadThumbnailsImmediate();
		} else {
			// 隐藏时取消所有请求
			this.cancelPendingRequests();
		}
	}

	/**
	 * 滚动事件处理（带防抖）
	 */
	onScroll(scrollLeft: number, containerWidth: number): void {
		if (!this.state.isVisible) return;
		
		this.state.lastScrollTime = Date.now();
		
		// 防抖处理
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}
		
		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null;
			this.loadThumbnailsImmediate();
		}, this.config.debounceDelay);
	}

	/**
	 * 页面变化处理
	 */
	onPageChange(pageIndex: number): void {
		if (this.state.currentPageIndex === pageIndex) return;
		
		this.state.currentPageIndex = pageIndex;
		
		if (this.state.isVisible) {
			// 页面变化时立即加载
			this.loadThumbnailsImmediate();
		}
	}

	/**
	 * 书籍变化处理
	 */
	onBookChange(bookPath: string): void {
		if (this.state.currentBookPath === bookPath) return;
		
		// 取消所有旧请求
		this.cancelPendingRequests();
		
		// 更新状态
		this.state.currentBookPath = bookPath;
		this.state.currentPageIndex = 0;
		this.state.requestVersion++;
		
		// 清空缓存
		thumbnailCacheStore.setBook(bookPath);
		
		if (this.state.isVisible) {
			// 延迟加载，让主页面先加载
			setTimeout(() => {
				this.loadThumbnailsImmediate();
			}, 100);
		}
	}

	// ===========================================================================
	// 加载控制
	// ===========================================================================

	/**
	 * 立即加载缩略图（不防抖）
	 */
	private loadThumbnailsImmediate(): void {
		const currentBook = bookStore.currentBook;
		if (!currentBook) return;
		
		const totalPages = currentBook.pages?.length || 0;
		if (totalPages === 0) return;
		
		const centerIndex = this.state.currentPageIndex;
		const preloadRange = this.config.preloadRange;
		
		// 计算需要加载的范围
		const startIndex = Math.max(0, centerIndex - preloadRange);
		const endIndex = Math.min(totalPages - 1, centerIndex + preloadRange);
		
		// 收集需要加载的索引（过滤已缓存的）
		const needLoad: number[] = [];
		for (let i = startIndex; i <= endIndex; i++) {
			if (!thumbnailCacheStore.hasThumbnail(i) && 
				!thumbnailCacheStore.isLoading(i) &&
				!thumbnailCacheStore.hasFailed(i)) {
				needLoad.push(i);
			}
		}
		
		if (needLoad.length === 0) return;
		
		// 中央优先排序
		const sorted = sortByCenterPriority(needLoad, centerIndex);
		
		// 增加请求版本
		this.state.requestVersion++;
		const currentVersion = this.state.requestVersion;
		
		// 标记为加载中
		for (const idx of sorted) {
			thumbnailCacheStore.setLoading(idx);
			this.state.pendingRequests.add(idx);
		}
		
		// 调用 thumbnailService 加载
		thumbnailService.loadThumbnails(centerIndex);
	}

	/**
	 * 加载指定范围的缩略图
	 */
	loadVisibleThumbnails(startIndex: number, endIndex: number): void {
		const currentBook = bookStore.currentBook;
		if (!currentBook) return;
		
		const totalPages = currentBook.pages?.length || 0;
		const safeStart = Math.max(0, startIndex);
		const safeEnd = Math.min(totalPages - 1, endIndex);
		
		// 收集需要加载的索引
		const needLoad: number[] = [];
		for (let i = safeStart; i <= safeEnd; i++) {
			if (!thumbnailCacheStore.hasThumbnail(i) && 
				!thumbnailCacheStore.isLoading(i)) {
				needLoad.push(i);
			}
		}
		
		if (needLoad.length === 0) return;
		
		// 中央优先排序
		const center = Math.floor((safeStart + safeEnd) / 2);
		const sorted = sortByCenterPriority(needLoad, center);
		
		// 标记为加载中
		for (const idx of sorted) {
			thumbnailCacheStore.setLoading(idx);
			this.state.pendingRequests.add(idx);
		}
		
		// 调用 thumbnailService 加载
		thumbnailService.loadThumbnails(center);
	}

	/**
	 * 取消所有待处理请求
	 */
	cancelPendingRequests(): void {
		this.state.requestVersion++;
		this.state.pendingRequests.clear();
		thumbnailService.cancelLoading();
		
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
	}

	// ===========================================================================
	// 状态查询
	// ===========================================================================

	/**
	 * 获取待处理请求数量
	 */
	getPendingCount(): number {
		return this.state.pendingRequests.size;
	}

	/**
	 * 检查是否有待处理请求
	 */
	hasPendingRequests(): boolean {
		return this.state.pendingRequests.size > 0;
	}

	/**
	 * 获取当前状态
	 */
	getState(): Readonly<ControllerState> {
		return { ...this.state };
	}
}

// ===========================================================================
// 导出单例
// ===========================================================================

export const thumbnailLoadController = new ThumbnailLoadController();

