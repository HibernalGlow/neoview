/**
 * Loader 模块化架构导出
 * 
 * 新架构模块：
 * - blobCache.ts: Blob 缓存管理（LRU 淘汰）
 * - loadQueue.ts: 优先级队列和并发控制
 * - imageReader.ts: 图片读取（文件系统/压缩包）
 * - imageLoaderCore.ts: 核心加载器（协调上述模块）
 */

// 缓存模块
export {
	BlobCache,
	getBlobCache,
	resetBlobCache,
	type BlobCacheItem,
	type BlobCacheConfig
} from './blobCache';

// 队列模块
export { LoadPriority, getLoadQueue, resetLoadQueue } from './loadQueue';
export type { LoadQueueManager } from './loadQueue';

// 读取模块
export {
	readPageBlob,
	getImageDimensions,
	createThumbnailDataURL,
	type ReadResult,
	type ReadPageOptions
} from './imageReader';

// 核心加载器
export {
	ImageLoaderCore,
	getImageLoaderCore,
	resetImageLoaderCore,
	type ImageLoaderCoreOptions,
	type LoadResult
} from './imageLoaderCore';
