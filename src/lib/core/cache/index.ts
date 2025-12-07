/**
 * 缓存模块统一导出
 */

// 全局缓存管理器
export {
	globalCacheManager,
	createMemoryCache,
	createPersistentNamespace,
	createTTLCache,
	// 预定义缓存命名空间
	thumbnailCache,
	folderMetaCache,
	ratingCacheNs,
	imageBlobCache,
	directoryTreeCacheNs,
	// 类型
	type CacheNamespaceConfig,
	type GlobalCacheStats,
	type NamespaceStats,
	type CacheEntryMeta,
} from './globalCacheManager';

// 持久化缓存
export {
	PersistentCache,
	createPersistentCache,
	deleteCacheDatabase,
	estimateStorageUsage,
	type PersistentCacheConfig,
} from './persistentCache';

// 旧的缓存服务（保持兼容）
export { CacheService, blobCache, type CacheStats } from './cacheService';

// 生命周期管理
export {
	initializeCacheSystem,
	teardownCacheSystem,
	getCacheStatsSummary,
	clearAllCaches,
	triggerCleanup,
} from './cacheLifecycle';

// 缩略图持久化
export {
	thumbnailPersistence,
	persistThumbnail,
	getPersistedThumbnailUrl,
	hasPersistedThumbnail,
	makeThumbnailKey,
	type PersistedThumbnail,
} from './thumbnailPersistence';
