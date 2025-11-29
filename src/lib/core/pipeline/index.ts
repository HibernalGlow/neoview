/**
 * 图片管道模块 - 主入口
 * 
 * 架构设计参考 NeeView，实现模块化的图片加载系统
 * 
 * 模块结构：
 * - types: 核心类型定义
 * - job: 作业引擎系统 (JobEngine, JobScheduler, JobWorker)
 * - cache: 多层缓存管理 (MemoryCache, BlobCache, CacheManager)
 * - source: 数据源策略 (SourceStrategy)
 * - preload: 预加载管理 (PreloadManager)
 * - upscale: 超分服务 (UpscaleService)
 * - ImagePipeline: 总控制器
 */

// 类型导出
export * from './types';

// 作业系统
export { 
	JobScheduler, 
	JobWorker, 
	JobEngine, 
	getJobEngine, 
	PageContentJobCommand,
	type JobClient,
	type SchedulerConfig,
	type WorkerConfig,
	type WorkerState,
	type EngineConfig,
	type EngineState
} from './job';

// 缓存系统
export {
	MemoryCache,
	createMemoryCache,
	BlobCache,
	createBlobCache,
	CacheManager,
	getCacheManager,
	type CacheEvent,
	type CacheEventType,
	type CacheEventListener,
	type BlobCacheConfig,
	type CacheManagerConfig,
	type CacheManagerStats
} from './cache';

// 数据源
export {
	type SourceType,
	type LoadOptions,
	type ISourceStrategy,
	FileSystemSourceStrategy,
	ArchiveSourceStrategy,
	SourceStrategyFactory,
	loadPageData
} from './source';

// 预加载
export {
	PreloadManager,
	createPreloadManager,
	type PreloadConfig,
	type PreloadContext,
	type PreloadEvent,
	type PreloadEventListener
} from './preload';

// 超分服务
export {
	UpscaleService,
	getUpscaleService,
	type UpscaleServiceConfig,
	type UpscaleCallback,
	type UpscaleEvent,
	type UpscaleEventListener
} from './upscale';

// 图片管道
export {
	ImagePipeline,
	getImagePipeline,
	type PipelineState,
	type PageLoadOptions
} from './ImagePipeline';

// 适配器（兼容旧接口）
export {
	PipelineAdapter,
	getPipelineAdapter,
	ImageLoaderCompat,
	type AdapterConfig,
	type AdapterCallbacks
} from './adapter';
