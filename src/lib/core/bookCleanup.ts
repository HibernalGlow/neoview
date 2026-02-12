/**
 * Book Cleanup - 集中式书籍资源清理
 *
 * 在切换书籍或关闭阅读器时，统一清理所有内存缓存和 Object URL，
 * 防止跨书籍的内存泄漏。
 *
 * 涉及清理的缓存系统：
 * 1. ImageLoaderCore (BlobCache) — 页面图片 Blob + Object URLs + ImageBitmap
 * 2. thumbnailPersistence.urlCache — 持久化缩略图的内存 Object URLs
 * 3. imagePool — 图像池 Object URLs + Blobs
 * 4. tempfileCache (imageReader) — 临时文件 Blob 缓存
 * 5. thumbnailCacheStore — 缩略图 URL 缓存
 */

import { switchToNextInstance } from '$lib/components/viewer/flow/imageLoaderCore';
import { clearTempfileCache } from '$lib/components/viewer/flow/imageReader';
import { thumbnailPersistence } from '$lib/core/cache';
import { imagePool } from '$lib/services/imagePool';
import { thumbnailCacheStore } from '$lib/stores/thumbnailCache.svelte';

/**
 * 清理当前书籍占用的所有内存资源
 *
 * 在以下场景调用：
 * - BookStore.openBook() 打开新书前
 * - BookStore.closeViewer() 关闭阅读器时
 */
export function cleanupBookResources(): void {
	const startTime = performance.now();

	// 1. ImageLoaderCore: 切换实例池，旧实例异步清理 BlobCache（revoke URLs + close bitmaps）
	try {
		switchToNextInstance();
	} catch (e) {
		console.warn('🧹 [BookCleanup] ImageLoaderCore cleanup failed:', e);
	}

	// 2. 缩略图持久化适配器: 释放从 IndexedDB 恢复到内存的 Object URLs
	try {
		thumbnailPersistence.clearMemoryUrls();
	} catch (e) {
		console.warn('🧹 [BookCleanup] thumbnailPersistence cleanup failed:', e);
	}

	// 3. 图像池: 释放所有 Object URLs + Blobs
	try {
		imagePool.evict();
	} catch (e) {
		console.warn('🧹 [BookCleanup] imagePool cleanup failed:', e);
	}

	// 4. 临时文件缓存: 清空 imageReader 的 tempfileCache
	try {
		clearTempfileCache();
	} catch (e) {
		console.warn('🧹 [BookCleanup] tempfileCache cleanup failed:', e);
	}

	// 5. 缩略图缓存: 清空并释放 blob: URLs
	try {
		thumbnailCacheStore.clear();
	} catch (e) {
		console.warn('🧹 [BookCleanup] thumbnailCacheStore cleanup failed:', e);
	}

	const elapsed = Math.round(performance.now() - startTime);
	console.log(`🧹 [BookCleanup] 资源清理完成 (${elapsed}ms)`);
}
