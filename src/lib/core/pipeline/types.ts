/**
 * 图片管道核心类型定义
 * 参考 NeeView 架构设计
 */

// ==================== 基础类型 ====================

/** 页面内容状态 */
export enum PageContentState {
	None = 'none',           // 未加载
	Loading = 'loading',     // 加载中
	View = 'view',           // 当前显示
	Ahead = 'ahead',         // 预加载
	Cached = 'cached',       // 已缓存
	Error = 'error'          // 加载失败
}

/** 超分状态 */
export enum UpscaleState {
	None = 'none',           // 未超分
	Pending = 'pending',     // 等待超分
	Processing = 'processing', // 超分中
	Completed = 'completed', // 已完成
	Cached = 'cached',       // 磁盘缓存
	Failed = 'failed',       // 失败
	Skipped = 'skipped'      // 跳过
}

/** 作业优先级 */
export enum JobPriority {
	Critical = 100,   // 当前页面
	High = 80,        // 相邻页面
	Normal = 50,      // 预加载页面
	Low = 20,         // 后台任务
	Idle = 0          // 空闲任务
}

/** 作业类别 */
export enum JobCategory {
	PageView = 'page-view',       // 当前页面加载
	PageAhead = 'page-ahead',     // 预加载
	Thumbnail = 'thumbnail',       // 缩略图
	Upscale = 'upscale',          // 超分
	CacheMaintenance = 'cache'    // 缓存维护
}

/** 作业状态 */
export enum JobStatus {
	Pending = 'pending',
	Running = 'running',
	Completed = 'completed',
	Failed = 'failed',
	Cancelled = 'cancelled'
}

// ==================== 数据结构 ====================

/** 图片尺寸 */
export interface ImageSize {
	width: number;
	height: number;
}

/** 图片信息 */
export interface PictureInfo {
	size: ImageSize;
	format: string;
	fileSize: number;
	hash?: string;
	colorSpace?: string;
	bitDepth?: number;
}

/** 页面信息 */
export interface PageInfo {
	index: number;
	path: string;
	name: string;
	archivePath?: string;
	size?: ImageSize;
	fileSize?: number;
	hash?: string;
}

/** 页面数据源 */
export interface PageDataSource {
	data: Blob | null;
	dataUrl: string | null;
	objectUrl: string | null;
	dataSize: number;
	pictureInfo: PictureInfo | null;
	errorMessage: string | null;
}

/** 视图源数据 */
export interface ViewSourceData {
	pageIndex: number;
	source: PageDataSource;
	upscaleData?: PageDataSource;
	state: PageContentState;
	upscaleState: UpscaleState;
	lastAccessed: number;
	memorySize: number;
}

/** 页面范围 */
export interface PageRange {
	min: number;
	max: number;
	isEmpty(): boolean;
	contains(index: number): boolean;
	next(direction: number): number;
}

/** 书籍上下文 */
export interface BookContext {
	path: string;
	type: 'folder' | 'archive';
	pages: PageInfo[];
	totalPages: number;
	getCurrentPage(index: number): PageInfo | null;
	containsIndex(index: number): boolean;
}

// ==================== 作业系统类型 ====================

/** 作业命令接口 */
export interface IJobCommand {
	execute(): Promise<void>;
	cancel(): void;
}

/** 作业定义 */
export interface JobDefinition {
	id: string;
	category: JobCategory;
	priority: JobPriority;
	pageIndex?: number;
	bookPath?: string;
	command: IJobCommand;
	createdAt: number;
}

/** 作业结果 */
export interface JobResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
	duration: number;
}

/** 作业订单 */
export interface JobOrder {
	definition: JobDefinition;
	priority: JobPriority;
}

/** 作业源 */
export interface JobSource {
	id: string;
	definition: JobDefinition;
	status: JobStatus;
	progress: number;
	result?: JobResult;
	startedAt?: number;
	completedAt?: number;
}

// ==================== 缓存类型 ====================

/** 缓存项基类 */
export interface CacheItem<T> {
	key: string;
	data: T;
	size: number;
	lastAccessed: number;
	createdAt: number;
	expiresAt?: number;
}

/** Blob 缓存项 */
export interface BlobCacheItem extends CacheItem<Blob> {
	objectUrl: string;
	pageIndex: number;
}

/** 缩略图缓存项 */
export interface ThumbnailCacheItem extends CacheItem<string> {
	pageIndex: number;
	height: number;
}

/** 超分缓存项 */
export interface UpscaleCacheItem extends CacheItem<Blob> {
	originalHash: string;
	objectUrl: string;
	modelName: string;
	scaleFactor: number;
	pageIndex?: number;
}

/** 缓存统计 */
export interface CacheStats {
	count: number;
	totalSize: number;
	hitRate: number;
	evictions: number;
}

/** 缓存配置 */
export interface CacheConfig {
	maxMemorySize: number;      // 最大内存大小 (bytes)
	maxItems: number;           // 最大条目数
	ttl: number;                // 生存时间 (ms)
	cleanupInterval: number;    // 清理间隔 (ms)
}

// ==================== 加载上下文 ====================

/** 加载上下文 */
export interface LoadContext {
	pageRange: PageRange;
	direction: 1 | -1;
	preloadLimit: number;
	priority: JobPriority;
	cancelToken: AbortController;
}

/** 加载结果 */
export interface LoadResult {
	pageIndex: number;
	source: ViewSourceData;
	duration: number;
	fromCache: boolean;
}

/** 预加载结果 */
export interface PreloadResult {
	loaded: number;
	failed: number;
	skipped: number;
	duration: number;
}

// ==================== 超分类型 ====================

/** 超分配置 */
export interface UpscaleConfig {
	modelName: string;
	scaleFactor: number;
	tileSize: number;
	noiseLevel: number;
	useTTA: boolean;
	gpuId: number;
}

/** 超分任务 */
export interface UpscaleTask {
	id: string;
	pageIndex: number;
	originalHash: string;
	config: UpscaleConfig;
	conditionId?: string;
	priority: JobPriority;
	status: UpscaleState;
	progress: number;
	inputBlob?: Blob;
	outputBlob?: Blob;
	error?: string;
}

/** 超分结果 */
export interface UpscaleResult {
	success: boolean;
	outputBlob?: Blob;
	outputUrl?: string;
	processingTime: number;
	error?: string;
}

// ==================== 事件类型 ====================

/** 页面加载事件 */
export interface PageLoadEvent {
	type: 'page-load';
	pageIndex: number;
	objectUrl: string;
	metadata?: ImageSize;
	fromCache: boolean;
}

/** 超分完成事件 */
export interface UpscaleCompleteEvent {
	type: 'upscale-complete';
	pageIndex: number;
	originalHash: string;
	outputUrl: string;
	outputBlob: Blob;
	background: boolean;
}

/** 预加载进度事件 */
export interface PreloadProgressEvent {
	type: 'preload-progress';
	loaded: number;
	total: number;
	currentIndex: number;
}

/** 错误事件 */
export interface ErrorEvent {
	type: 'error';
	source: string;
	message: string;
	pageIndex?: number;
}

/** 管道事件联合类型 */
export type PipelineEvent = 
	| PageLoadEvent 
	| UpscaleCompleteEvent 
	| PreloadProgressEvent 
	| ErrorEvent;

/** 事件监听器 */
export type PipelineEventListener<T extends PipelineEvent = PipelineEvent> = (event: T) => void;

// ==================== 配置类型 ====================

/** 管道配置 */
export interface PipelineConfig {
	preloadPages: number;        // 预加载页数
	maxWorkers: number;          // 最大工作线程数
	cacheConfig: CacheConfig;    // 缓存配置
	upscaleConfig: UpscaleConfig; // 超分配置
	autoUpscale: boolean;        // 自动超分开关
	viewMode: 'single' | 'double' | 'panorama';
}

/** 性能配置 */
export interface PerformanceConfig {
	jobWorkerSize: number;
	maxJobWorkerSize: number;
	preloadSize: number;
	memoryLimit: number;
	thumbnailHeight: number;
}

// ==================== 工具函数类型 ====================

/** 创建空的页面范围 */
export function createEmptyPageRange(): PageRange {
	return {
		min: -1,
		max: -1,
		isEmpty: () => true,
		contains: () => false,
		next: () => -1
	};
}

/** 创建页面范围 */
export function createPageRange(min: number, max: number): PageRange {
	return {
		min,
		max,
		isEmpty: () => min < 0 || max < 0 || min > max,
		contains: (index: number) => index >= min && index <= max,
		next: (direction: number) => direction > 0 ? max + 1 : min - 1
	};
}

/** 生成唯一ID */
export function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
