/**
 * 缩略图持久化适配器
 * 
 * 将缩略图缓存接入全局缓存管理器，支持：
 * - 跨会话持久化（IndexedDB）
 * - 按时间过期
 * - 跨书籍缓存
 */

import { globalCacheManager } from './globalCacheManager';

// ============================================================================
// 类型定义
// ============================================================================

export interface PersistedThumbnail {
	/** Base64 编码的图片数据（不含前缀） */
	data: string;
	/** MIME 类型 */
	mimeType: string;
	/** 原始宽度 */
	width: number;
	/** 原始高度 */
	height: number;
	/** 创建时间戳 */
	createdAt: number;
}

// ============================================================================
// 缓存配置
// ============================================================================

const THUMBNAIL_CACHE_CONFIG = {
	name: 'thumbnail-persistence',
	maxSize: 200 * 1024 * 1024, // 200MB
	maxItems: 5000,
	ttl: 7 * 24 * 60 * 60 * 1000, // 7天过期
	persistent: true,
	storeName: 'thumbnails',
};

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 生成缩略图缓存键
 * 使用 bookPath + pageIndex 作为复合键
 */
export function makeThumbnailKey(bookPath: string, pageIndex: number): string {
	// 使用简单的哈希避免路径中的特殊字符问题
	return `${hashPath(bookPath)}:${pageIndex}`;
}

/**
 * 简单路径哈希
 */
function hashPath(path: string): string {
	let hash = 0;
	for (let i = 0; i < path.length; i++) {
		const char = path.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash).toString(36);
}

/**
 * Blob URL 转 Base64
 */
async function blobUrlToBase64(blobUrl: string): Promise<{ data: string; mimeType: string } | null> {
	try {
		const response = await fetch(blobUrl);
		const blob = await response.blob();
		
		return new Promise((resolve) => {
			const reader = new FileReader();
			reader.onloadend = () => {
				const result = reader.result as string;
				// 移除 data:image/xxx;base64, 前缀
				const base64 = result.split(',')[1];
				resolve({ data: base64, mimeType: blob.type || 'image/jpeg' });
			};
			reader.onerror = () => resolve(null);
			reader.readAsDataURL(blob);
		});
	} catch {
		return null;
	}
}

/**
 * Base64 转 Blob URL
 */
function base64ToBlobUrl(data: string, mimeType: string): string {
	try {
		const binary = atob(data);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		const blob = new Blob([bytes], { type: mimeType });
		return URL.createObjectURL(blob);
	} catch {
		return '';
	}
}

// ============================================================================
// 持久化缩略图缓存
// ============================================================================

class ThumbnailPersistenceAdapter {
	private cache = globalCacheManager.getNamespace<PersistedThumbnail>(THUMBNAIL_CACHE_CONFIG);
	private urlCache = new Map<string, string>(); // 内存中的 Blob URL 缓存

	/**
	 * 保存缩略图（从 Blob URL）
	 */
	async saveThumbnail(
		bookPath: string,
		pageIndex: number,
		blobUrl: string,
		width: number,
		height: number
	): Promise<boolean> {
		const key = makeThumbnailKey(bookPath, pageIndex);
		
		// 转换为 Base64 以便持久化
		const base64Data = await blobUrlToBase64(blobUrl);
		if (!base64Data) {
			console.debug('[ThumbnailPersistence] 转换失败:', key);
			return false;
		}

		const entry: PersistedThumbnail = {
			data: base64Data.data,
			mimeType: base64Data.mimeType,
			width,
			height,
			createdAt: Date.now(),
		};

		// 估算大小（Base64 约为原始大小的 1.37 倍）
		const size = Math.ceil(base64Data.data.length * 1.37);
		
		try {
			await this.cache.set(key, entry, size);
			this.urlCache.set(key, blobUrl);
			return true;
		} catch (e) {
			console.debug('[ThumbnailPersistence] 保存失败:', e);
			return false;
		}
	}

	/**
	 * 获取缩略图 URL
	 * 优先从内存缓存获取，否则从持久化存储恢复
	 */
	async getThumbnailUrl(bookPath: string, pageIndex: number): Promise<string | null> {
		const key = makeThumbnailKey(bookPath, pageIndex);

		// 1. 检查内存 URL 缓存
		const cachedUrl = this.urlCache.get(key);
		if (cachedUrl) {
			return cachedUrl;
		}

		// 2. 从持久化存储恢复
		const entry = await this.cache.get(key);
		if (!entry) {
			return null;
		}

		// 3. 转换为 Blob URL
		const url = base64ToBlobUrl(entry.data, entry.mimeType);
		if (url) {
			this.urlCache.set(key, url);
		}
		return url || null;
	}

	/**
	 * 同步获取（仅内存缓存）
	 */
	getThumbnailUrlSync(bookPath: string, pageIndex: number): string | null {
		const key = makeThumbnailKey(bookPath, pageIndex);
		return this.urlCache.get(key) || null;
	}

	/**
	 * 检查是否有缓存
	 */
	hasThumbnail(bookPath: string, pageIndex: number): boolean {
		const key = makeThumbnailKey(bookPath, pageIndex);
		return this.urlCache.has(key) || this.cache.has(key);
	}

	/**
	 * 批量预热（从持久化存储恢复到内存）
	 */
	async warmupBook(bookPath: string, pageIndices: number[]): Promise<number> {
		let loaded = 0;
		
		for (const pageIndex of pageIndices) {
			const key = makeThumbnailKey(bookPath, pageIndex);
			if (this.urlCache.has(key)) continue;

			const entry = await this.cache.get(key);
			if (entry) {
				const url = base64ToBlobUrl(entry.data, entry.mimeType);
				if (url) {
					this.urlCache.set(key, url);
					loaded++;
				}
			}
		}

		return loaded;
	}

	/**
	 * 清除指定书籍的缓存
	 */
	clearBook(bookPath: string): void {
		const prefix = hashPath(bookPath);
		
		// 清除内存缓存
		for (const [key, url] of this.urlCache) {
			if (key.startsWith(prefix + ':')) {
				URL.revokeObjectURL(url);
				this.urlCache.delete(key);
			}
		}
		
		// 持久化缓存不清除，下次打开还能用
	}

	/**
	 * 清除所有内存中的 Blob URL
	 */
	clearMemoryUrls(): void {
		for (const url of this.urlCache.values()) {
			URL.revokeObjectURL(url);
		}
		this.urlCache.clear();
	}

	/**
	 * 获取统计信息
	 */
	getStats(): { memory: number; persistent: number } {
		const cacheStats = this.cache.getStats();
		return {
			memory: this.urlCache.size,
			persistent: cacheStats.items,
		};
	}
}

// ============================================================================
// 单例导出
// ============================================================================

export const thumbnailPersistence = new ThumbnailPersistenceAdapter();

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 保存缩略图到持久化存储
 */
export async function persistThumbnail(
	bookPath: string,
	pageIndex: number,
	blobUrl: string,
	width: number,
	height: number
): Promise<boolean> {
	return thumbnailPersistence.saveThumbnail(bookPath, pageIndex, blobUrl, width, height);
}

/**
 * 从持久化存储获取缩略图 URL
 */
export async function getPersistedThumbnailUrl(
	bookPath: string,
	pageIndex: number
): Promise<string | null> {
	return thumbnailPersistence.getThumbnailUrl(bookPath, pageIndex);
}

/**
 * 检查是否有持久化的缩略图
 */
export function hasPersistedThumbnail(bookPath: string, pageIndex: number): boolean {
	return thumbnailPersistence.hasThumbnail(bookPath, pageIndex);
}
