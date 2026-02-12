/**
 * Thumbnail Cache Store
 * 全局缩略图缓存 - 统一管理所有组件的缩略图数据
 *
 * 集成持久化支持：缩略图会自动保存到 IndexedDB，下次打开应用可以快速恢复
 *
 * 简化版本：移除复杂的 LRU 淘汰机制，依赖切书时自动清空
 */

import { thumbnailPersistence } from '$lib/core/cache';

// ===========================================================================
// 类型定义
// ===========================================================================

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

		// 释放旧书籍的 blob: Object URLs，防止内存泄漏
		this.revokeAllBlobUrls();

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
	 */
	getThumbnail(pageIndex: number): ThumbnailEntry | null {
		return this.state.thumbnails.get(pageIndex) ?? null;
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
	 */
	setThumbnail(pageIndex: number, url: string, width: number, height: number): void {
		// 释放旧的 blob: URL（如果存在且不同）
		const existing = this.state.thumbnails.get(pageIndex);
		if (existing && existing.url !== url && existing.url.startsWith('blob:')) {
			URL.revokeObjectURL(existing.url);
		}

		const entry: ThumbnailEntry = {
			url,
			width,
			height,
			timestamp: Date.now()
		};

		this.state.thumbnails.set(pageIndex, entry);
		this.state.loadingIndices.delete(pageIndex);
		this.state.failedIndices.delete(pageIndex);

		// 异步持久化（不阻塞 UI）
		if (this.state.bookPath) {
			thumbnailPersistence
				.saveThumbnail(this.state.bookPath, pageIndex, url, width, height)
				.catch(() => {
					// 持久化失败不影响正常使用
				});
		}

		// 通知单个缩略图就绪
		this.notifyThumbnail(pageIndex, entry);
		this.notify();
	}

	/**
	 * 批量设置缩略图
	 */
	setThumbnails(
		entries: Array<{ pageIndex: number; url: string; width: number; height: number }>
	): void {
		const now = Date.now();

		for (const { pageIndex, url, width, height } of entries) {
			const entry: ThumbnailEntry = {
				url,
				width,
				height,
				timestamp: now
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
		// 释放所有 blob: Object URLs，防止内存泄漏
		this.revokeAllBlobUrls();

		this.state = {
			bookPath: this.state.bookPath,
			thumbnails: new Map(),
			loadingIndices: new Set(),
			failedIndices: new Set()
		};
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
	/**
	 * 释放所有 blob: Object URLs
	 * 只释放 blob: 协议的 URL，data: URL 和其他 URL 无需释放
	 */
	private revokeAllBlobUrls(): void {
		let revoked = 0;
		for (const [, entry] of this.state.thumbnails) {
			if (entry.url.startsWith('blob:')) {
				URL.revokeObjectURL(entry.url);
				revoked++;
			}
		}
		if (revoked > 0) {
			console.log(`🧹 [ThumbnailCache] 释放了 ${revoked} 个 blob URL`);
		}
	}
}

// 导出单例
export const thumbnailCacheStore = new ThumbnailCacheStore();

// 导出类型
export type { ThumbnailEntry, ThumbnailCacheState };
