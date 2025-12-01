/**
 * Thumbnail Cache Store
 * 全局缩略图缓存 - 统一管理所有组件的缩略图数据
 */

interface ThumbnailEntry {
	url: string;
	width: number;
	height: number;
	timestamp: number;
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
	 * 获取缩略图
	 */
	getThumbnail(pageIndex: number): ThumbnailEntry | null {
		return this.state.thumbnails.get(pageIndex) ?? null;
	}

	/**
	 * 检查是否有缩略图
	 */
	hasThumbnail(pageIndex: number): boolean {
		return this.state.thumbnails.has(pageIndex);
	}

	/**
	 * 设置缩略图
	 */
	setThumbnail(pageIndex: number, url: string, width: number, height: number): void {
		const entry: ThumbnailEntry = {
			url,
			width,
			height,
			timestamp: Date.now()
		};
		this.state.thumbnails.set(pageIndex, entry);
		this.state.loadingIndices.delete(pageIndex);
		this.state.failedIndices.delete(pageIndex);
		
		// 通知单个缩略图就绪
		this.notifyThumbnail(pageIndex, entry);
		this.notify();
	}

	/**
	 * 批量设置缩略图
	 */
	setThumbnails(entries: Array<{ pageIndex: number; url: string; width: number; height: number }>): void {
		for (const { pageIndex, url, width, height } of entries) {
			const entry: ThumbnailEntry = {
				url,
				width,
				height,
				timestamp: Date.now()
			};
			this.state.thumbnails.set(pageIndex, entry);
			this.state.loadingIndices.delete(pageIndex);
			this.state.failedIndices.delete(pageIndex);
			this.notifyThumbnail(pageIndex, entry);
		}
		this.notify();
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
	getStats(): { cached: number; loading: number; failed: number } {
		return {
			cached: this.state.thumbnails.size,
			loading: this.state.loadingIndices.size,
			failed: this.state.failedIndices.size
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
		this.notify();
	}
}

// 导出单例
export const thumbnailCacheStore = new ThumbnailCacheStore();

// 导出类型
export type { ThumbnailEntry, ThumbnailCacheState };
