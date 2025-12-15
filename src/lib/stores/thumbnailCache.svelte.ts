/**
 * Thumbnail Cache Store
 * 全局缩略图缓存 - 统一管理所有组件的缩略图数据
 * 
 * 集成持久化支持：缩略图会自动保存到 IndexedDB，下次打开应用可以快速恢复
 * 
 * 优化功能：
 * - LRU 淘汰机制（内存上限 100MB）
 * - 内存使用追踪
 * - 批量操作优化
 */

import { thumbnailPersistence } from '$lib/core/cache';

// ===========================================================================
// 配置常量
// ===========================================================================

/** 默认内存上限 100MB */
const DEFAULT_MEMORY_LIMIT = 100 * 1024 * 1024;

/** 估算 data URL 的字节大小（base64 编码约为原始大小的 1.37 倍） */
function estimateDataUrlSize(url: string): number {
	if (!url) return 0;
	// data URL 格式: data:image/webp;base64,xxxxx
	// 实际数据从逗号后开始
	const commaIndex = url.indexOf(',');
	if (commaIndex === -1) return url.length;
	const base64Data = url.substring(commaIndex + 1);
	// base64 解码后的实际大小约为 base64 长度的 3/4
	return Math.ceil(base64Data.length * 0.75);
}

// ===========================================================================
// 类型定义
// ===========================================================================

interface ThumbnailEntry {
	url: string;
	width: number;
	height: number;
	timestamp: number;
	/** 估算的字节大小，用于内存管理 */
	size: number;
}

interface ThumbnailCacheState {
	/** 当前书籍路径 */
	bookPath: string | null;
	/** 缩略图缓存 Map<pageIndex, ThumbnailEntry> */
	thumbnails: Map<number, ThumbnailEntry>;
	/** 正在加载的页面索引 */
	loadingIndices: Set<number>;
	/** 加载失败的页面索引 */
	failedIndices: Set<number>;
}

type ThumbnailListener = (pageIndex: number, entry: ThumbnailEntry) => void;

class ThumbnailCacheStore {
	private state: ThumbnailCacheState = {
		bookPath: null,
		thumbnails: new Map(),
		loadingIndices: new Set(),
		failedIndices: new Set()
	};

	private listeners = new Set<() => void>();
	private thumbnailListeners = new Set<ThumbnailListener>();
	
	/** 内存上限（字节） */
	private memoryLimit = DEFAULT_MEMORY_LIMIT;
	
	/** 当前内存使用量（字节） */
	private memoryUsage = 0;
	
	/** LRU 访问顺序（最近访问的在末尾） */
	private accessOrder: number[] = [];

	/**
	 * 订阅状态变化
	 */
	subscribe(callback: () => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	/**
	 * 订阅单个缩略图就绪事件
	 */
	addThumbnailListener(listener: ThumbnailListener): () => void {
		this.thumbnailListeners.add(listener);
		return () => this.thumbnailListeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch (e) {
				console.error('ThumbnailCacheStore listener error:', e);
			}
		}
	}

	private notifyThumbnail(pageIndex: number, entry: ThumbnailEntry): void {
		for (const listener of this.thumbnailListeners) {
			try {
				listener(pageIndex, entry);
			} catch (e) {
				console.error('ThumbnailCacheStore thumbnail listener error:', e);
			}
		}
	}

	/**
	 * 切换书籍时重置缓存
	 */
	setBook(bookPath: string | null): void {
		if (this.state.bookPath === bookPath) return;
		
		this.state = {
			bookPath,
			thumbnails: new Map(),
			loadingIndices: new Set(),
			failedIndices: new Set()
		};
		this.notify();
	}

	/**
	 * 获取当前书籍路径
	 */
	getBookPath(): string | null {
		return this.state.bookPath;
	}

	/**
	 * 获取缩略图（同步，仅内存）
	 * 会更新 LRU 访问顺序
	 */
	getThumbnail(pageIndex: number): ThumbnailEntry | null {
		const entry = this.state.thumbnails.get(pageIndex);
		if (entry) {
			// 更新 LRU 访问顺序
			this.updateAccessOrder(pageIndex);
			// 更新时间戳
			entry.timestamp = Date.now();
		}
		return entry ?? null;
	}
	
	/**
	 * 更新 LRU 访问顺序
	 */
	private updateAccessOrder(pageIndex: number): void {
		const idx = this.accessOrder.indexOf(pageIndex);
		if (idx !== -1) {
			this.accessOrder.splice(idx, 1);
		}
		this.accessOrder.push(pageIndex);
	}

	/**
	 * 获取缩略图（异步，会尝试从持久化存储恢复）
	 */
	async getThumbnailAsync(pageIndex: number): Promise<ThumbnailEntry | null> {
		// 1. 先检查内存
		const cached = this.state.thumbnails.get(pageIndex);
		if (cached) return cached;

		// 2. 尝试从持久化存储恢复
		if (!this.state.bookPath) return null;
		
		const url = await thumbnailPersistence.getThumbnailUrl(this.state.bookPath, pageIndex);
		if (!url) return null;

		// 创建条目（宽高使用默认值，实际显示时会自适应）
		const entry: ThumbnailEntry = {
			url,
			width: 0,
			height: 0,
			timestamp: Date.now()
		};
		
		this.state.thumbnails.set(pageIndex, entry);
		return entry;
	}

	/**
	 * 检查是否有缩略图
	 */
	hasThumbnail(pageIndex: number): boolean {
		return this.state.thumbnails.has(pageIndex);
	}

	/**
	 * 设置缩略图
	 * 会自动检查内存限制并触发 LRU 淘汰
	 */
	setThumbnail(pageIndex: number, url: string, width: number, height: number): void {
		// 估算大小
		const size = estimateDataUrlSize(url);
		
		// 如果已存在，先减去旧的大小
		const existing = this.state.thumbnails.get(pageIndex);
		if (existing) {
			this.memoryUsage -= existing.size;
		}
		
		const entry: ThumbnailEntry = {
			url,
			width,
			height,
			timestamp: Date.now(),
			size
		};
		
		this.state.thumbnails.set(pageIndex, entry);
		this.state.loadingIndices.delete(pageIndex);
		this.state.failedIndices.delete(pageIndex);
		
		// 更新内存使用量和 LRU 顺序
		this.memoryUsage += size;
		this.updateAccessOrder(pageIndex);
		
		// 检查内存限制，触发 LRU 淘汰
		if (this.memoryUsage > this.memoryLimit) {
			this.evictLRU(this.memoryLimit * 0.8); // 淘汰到 80%
		}
		
		// 异步持久化（不阻塞 UI）
		if (this.state.bookPath) {
			thumbnailPersistence.saveThumbnail(
				this.state.bookPath,
				pageIndex,
				url,
				width,
				height
			).catch(() => {
				// 持久化失败不影响正常使用
			});
		}
		
		// 通知单个缩略图就绪
		this.notifyThumbnail(pageIndex, entry);
		this.notify();
	}

	/**
	 * 批量设置缩略图
	 * 优化：减少通知次数，批量处理内存管理
	 */
	setThumbnails(entries: Array<{ pageIndex: number; url: string; width: number; height: number }>): void {
		const now = Date.now();
		
		for (const { pageIndex, url, width, height } of entries) {
			const size = estimateDataUrlSize(url);
			
			// 如果已存在，先减去旧的大小
			const existing = this.state.thumbnails.get(pageIndex);
			if (existing) {
				this.memoryUsage -= existing.size;
			}
			
			const entry: ThumbnailEntry = {
				url,
				width,
				height,
				timestamp: now,
				size
			};
			
			this.state.thumbnails.set(pageIndex, entry);
			this.state.loadingIndices.delete(pageIndex);
			this.state.failedIndices.delete(pageIndex);
			
			// 更新内存使用量和 LRU 顺序
			this.memoryUsage += size;
			this.updateAccessOrder(pageIndex);
			
			this.notifyThumbnail(pageIndex, entry);
		}
		
		// 批量处理后检查内存限制
		if (this.memoryUsage > this.memoryLimit) {
			this.evictLRU(this.memoryLimit * 0.8);
		}
		
		this.notify();
	}
	
	/**
	 * LRU 淘汰机制
	 * 淘汰最久未访问的缩略图，直到内存使用量低于目标值
	 * @param targetBytes 目标内存使用量
	 */
	evictLRU(targetBytes: number): void {
		let evictedCount = 0;
		
		while (this.memoryUsage > targetBytes && this.accessOrder.length > 0) {
			// 获取最久未访问的页面索引
			const oldestIndex = this.accessOrder.shift();
			if (oldestIndex === undefined) break;
			
			const entry = this.state.thumbnails.get(oldestIndex);
			if (entry) {
				this.memoryUsage -= entry.size;
				this.state.thumbnails.delete(oldestIndex);
				evictedCount++;
			}
		}
		
		if (evictedCount > 0) {
			console.debug(`🗑️ ThumbnailCache: Evicted ${evictedCount} thumbnails, memory: ${(this.memoryUsage / 1024 / 1024).toFixed(2)}MB`);
		}
	}
	
	/**
	 * 获取当前内存使用量（字节）
	 */
	getMemoryUsage(): number {
		return this.memoryUsage;
	}
	
	/**
	 * 设置内存上限
	 * @param bytes 内存上限（字节）
	 */
	setMemoryLimit(bytes: number): void {
		this.memoryLimit = Math.max(10 * 1024 * 1024, bytes); // 最小 10MB
		
		// 如果当前使用量超过新限制，触发淘汰
		if (this.memoryUsage > this.memoryLimit) {
			this.evictLRU(this.memoryLimit * 0.8);
		}
	}

	/**
	 * 标记为加载中
	 */
	setLoading(pageIndex: number): void {
		if (this.state.thumbnails.has(pageIndex)) return; // 已有缓存则跳过
		this.state.loadingIndices.add(pageIndex);
	}

	/**
	 * 检查是否正在加载
	 */
	isLoading(pageIndex: number): boolean {
		return this.state.loadingIndices.has(pageIndex);
	}

	/**
	 * 标记为加载失败
	 */
	setFailed(pageIndex: number): void {
		this.state.loadingIndices.delete(pageIndex);
		this.state.failedIndices.add(pageIndex);
	}

	/**
	 * 检查是否加载失败
	 */
	hasFailed(pageIndex: number): boolean {
		return this.state.failedIndices.has(pageIndex);
	}

	/**
	 * 清除失败标记（允许重试）
	 */
	clearFailed(pageIndex: number): void {
		this.state.failedIndices.delete(pageIndex);
	}

	/**
	 * 获取所有缩略图
	 */
	getAllThumbnails(): Map<number, ThumbnailEntry> {
		return new Map(this.state.thumbnails);
	}

	/**
	 * 获取缓存统计
	 */
	getStats(): { cached: number; loading: number; failed: number; memoryUsage: number; memoryLimit: number } {
		return {
			cached: this.state.thumbnails.size,
			loading: this.state.loadingIndices.size,
			failed: this.state.failedIndices.size,
			memoryUsage: this.memoryUsage,
			memoryLimit: this.memoryLimit
		};
	}

	/**
	 * 清空所有缓存
	 */
	clear(): void {
		this.state = {
			bookPath: this.state.bookPath,
			thumbnails: new Map(),
			loadingIndices: new Set(),
			failedIndices: new Set()
		};
		this.memoryUsage = 0;
		this.accessOrder = [];
		this.notify();
	}

	/**
	 * 从持久化存储预热缩略图（批量恢复）
	 * @param pageIndices 需要预热的页面索引
	 * @returns 成功恢复的数量
	 */
	async warmupFromPersistence(pageIndices: number[]): Promise<number> {
		if (!this.state.bookPath) return 0;

		const loaded = await thumbnailPersistence.warmupBook(this.state.bookPath, pageIndices);
		
		if (loaded > 0) {
			// 批量从持久化恢复到内存
			for (const pageIndex of pageIndices) {
				if (this.state.thumbnails.has(pageIndex)) continue;
				
				const url = thumbnailPersistence.getThumbnailUrlSync(this.state.bookPath!, pageIndex);
				if (url) {
					this.state.thumbnails.set(pageIndex, {
						url,
						width: 0,
						height: 0,
						timestamp: Date.now()
					});
				}
			}
			this.notify();
		}

		return loaded;
	}

	/**
	 * 检查持久化存储中是否有缩略图
	 */
	hasPersistedThumbnail(pageIndex: number): boolean {
		if (!this.state.bookPath) return false;
		return thumbnailPersistence.hasThumbnail(this.state.bookPath, pageIndex);
	}
}

// 导出单例
export const thumbnailCacheStore = new ThumbnailCacheStore();

// 导出类型
export type { ThumbnailEntry, ThumbnailCacheState };
