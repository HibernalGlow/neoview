/**
 * NeoView Page Manager API
 * 
 * 基于 NeeView 架构的新加载系统
 * 后端主导，前端只发请求
 * 
 * 特点：
 * - 后端自动管理预加载
 * - 后端自动管理缓存（距离驱逐）
 * - 前端无需管理加载状态
 */

import { invoke } from '@tauri-apps/api/core';
import { pageTransferModeStore } from '$lib/stores/pageTransferMode.svelte';
import { showToast } from '$lib/utils/toast';

// Base64 解码（仅在 base64 模式下使用）
async function decodeBase64(base64: string): Promise<ArrayBuffer> {
	const { toBytes } = await import('fast-base64');
	const bytes = await toBytes(base64);
	return toOwnedArrayBuffer(bytes);
}

function toOwnedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	if (
		bytes.buffer instanceof ArrayBuffer &&
		bytes.byteOffset === 0 &&
		bytes.byteLength === bytes.buffer.byteLength
	) {
		return bytes.buffer;
	}

	return bytes.slice().buffer;
}

function normalizeBinaryPayload(payload: Uint8Array | number[] | ArrayBuffer): Uint8Array {
	if (payload instanceof Uint8Array) {
		return payload;
	}
	if (payload instanceof ArrayBuffer) {
		return new Uint8Array(payload);
	}
	return new Uint8Array(payload);
}

/**
 * 包装 invoke 调用，失败时显示 toast
 */
async function invokeWithToast<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
	try {
		return await invoke<T>(cmd, args);
	} catch (error) {
		const mode = pageTransferModeStore.mode;
		const msg = `页面加载失败 [${mode}]: ${error}`;
		console.error(`❌ [PageManager] ${msg}`);
		showToast({ title: '页面加载失败', description: msg, variant: 'error' });
		throw error;
	}
}

async function invokePageBinary(cmd: 'pm_goto_page' | 'pm_get_page', index: number): Promise<Uint8Array> {
	const payload = await invokeWithToast<Uint8Array | number[] | ArrayBuffer>(cmd, { index });
	return normalizeBinaryPayload(payload);
}

type PageCmd = 'goto' | 'get';

/**
 * 统一传输入口：根据当前模式选择 binary 或 base64，返回原始字节。
 * 上层函数只需指定操作（goto/get）和目标格式（Blob/ArrayBuffer）。
 */
async function fetchPageData(op: PageCmd, index: number): Promise<ArrayBuffer> {
	const binaryCmd = op === 'goto' ? 'pm_goto_page' : 'pm_get_page';
	const base64Cmd = op === 'goto' ? 'pm_goto_page_base64' : 'pm_get_page_base64';

	if (pageTransferModeStore.isBinary) {
		const bytes = await invokePageBinary(binaryCmd, index);
		return toOwnedArrayBuffer(bytes);
	} else {
		const base64 = await invokeWithToast<string>(base64Cmd, { index });
		return decodeBase64(base64);
	}
}

// ===== 类型定义 =====

/** 书籍类型（参考 NeeView 设计） */
export type BookType = 
	| 'archive'      // 压缩包（ZIP/RAR/7z）
	| 'directory'    // 文件夹
	| 'singleimage'  // 单个图片文件
	| 'singlevideo'  // 单个视频文件
	| 'playlist'     // 播放列表
	| 'epub';        // EPUB 电子书

/** 书籍信息 */
export interface BookInfo {
	path: string;
	bookType: BookType;
	totalPages: number;
	currentIndex: number;
}

/** 页面内容类型 */
export type PageContentType = 
	| 'image'     // 普通图片
	| 'video'     // 视频
	| 'animated'  // 动图 (GIF/APNG/WebP动画)
	| 'archive'   // 嵌套压缩包
	| 'ebook'     // 电子书 (PDF/EPUB/XPS，用 MuPDF 渲染)
	| 'unknown';  // 未知类型

/** 页面信息 */
export interface PageInfo {
	index: number;
	innerPath: string;
	name: string;
	size: number | null;
	contentType: PageContentType;
}

/** 内存池统计 */
export interface MemoryPoolStats {
	entryCount: number;
	totalSize: number;
	maxSize: number;
	usagePercent: number;
	lockedCount: number;
}

/** 页面管理器统计 */
export interface PageManagerStats {
	memory: MemoryPoolStats;
	currentBook: string | null;
	currentIndex: number;
	totalPages: number;
	cachedPages: number[];
}

/** 页面加载结果 */
export interface PageLoadResult {
	index: number;
	size: number;
	mimeType: string;
	cacheHit: boolean;
	/** 图片宽度（如果是图片） */
	width?: number;
	/** 图片高度（如果是图片） */
	height?: number;
}

// ===== API 函数 =====

/**
 * 打开书籍
 * 
 * 后端自动：
 * - 扫描书籍内容
 * - 初始化缓存
 * - 取消旧书籍的加载任务
 */
export async function openBook(path: string): Promise<BookInfo> {
	console.log('📖 [PageManager] openBook:', path);
	return invoke<BookInfo>('pm_open_book', { path });
}

/**
 * 关闭书籍
 */
export async function closeBook(): Promise<void> {
	console.log('📖 [PageManager] closeBook');
	return invoke('pm_close_book');
}

/**
 * 获取当前书籍信息
 */
export async function getBookInfo(): Promise<BookInfo | null> {
	return invoke<BookInfo | null>('pm_get_book_info');
}

/**
 * 跳转到指定页面
 * 
 * 后端自动：
 * - 检查缓存
 * - 加载页面
 * - 提交预加载任务
 * 
 * 根据 pageTransferModeStore 选择传输模式：
 * - binary: 直接二进制传输（更快）
 * - base64: Base64 编码传输（兼容性好）
 * 
 * @returns Blob 数据
 */
export async function gotoPage(index: number): Promise<Blob> {
	console.log('📄 [PageManager] gotoPage:', index);
	return new Blob([await fetchPageData('goto', index)]);
}

/**
 * 获取页面数据（不改变当前页）
 * 
 * @returns Blob 数据
 */
export async function getPage(index: number): Promise<Blob> {
	return new Blob([await fetchPageData('get', index)]);
}

/**
 * 跳转到指定页面（返回原始 ArrayBuffer，用于延迟追踪）
 */
export async function gotoPageRaw(index: number): Promise<ArrayBuffer> {
	return fetchPageData('goto', index);
}

/**
 * 获取页面数据（返回原始 ArrayBuffer，用于延迟追踪）
 */
export async function getPageRaw(index: number): Promise<ArrayBuffer> {
	return fetchPageData('get', index);
}

/**
 * 获取页面信息（元数据）
 */
export async function getPageInfo(index: number): Promise<PageInfo> {
	return invoke<PageInfo>('pm_get_page_info', { index });
}

/**
 * 获取页面管理器统计
 */
export async function updatePageDimensions(
	pageIndex: number,
	width: number,
	height: number
): Promise<boolean> {
	return invoke<boolean>('pm_update_page_dimensions', { pageIndex, width, height });
}

export async function getStats(): Promise<PageManagerStats> {
	return invoke<PageManagerStats>('pm_get_stats');
}

/**
 * 获取内存池统计
 */
export async function getMemoryStats(): Promise<MemoryPoolStats> {
	return invoke<MemoryPoolStats>('pm_get_memory_stats');
}

/**
 * 清除所有缓存
 */
export async function clearCache(): Promise<void> {
	console.log('🧹 [PageManager] clearCache');
	return invoke('pm_clear_cache');
}

// ===== 视频相关 =====

/** 临时文件统计 */
export interface TempFileStats {
	fileCount: number;
	totalSize: number;
	tempDir: string;
}

/**
 * 获取视频文件路径
 * 
 * 对于压缩包内的视频，后端会自动提取到临时文件
 * 返回的路径可以用 convertFileSrc() 转换为可用的 URL
 */
export async function getVideoPath(index: number): Promise<string> {
	console.log('🎬 [PageManager] getVideoPath:', index);
	return invoke<string>('pm_get_video_path', { index });
}

/**
 * 获取临时文件统计
 */
export async function getTempStats(): Promise<TempFileStats> {
	return invoke<TempFileStats>('pm_get_temp_stats');
}

/**
 * 获取大文件阈值（MB）
 */
export async function getLargeFileThreshold(): Promise<number> {
	return invoke<number>('pm_get_large_file_threshold');
}

/**
 * 设置大文件阈值（MB）
 * 
 * 超过此阈值的文件会自动使用临时文件而非内存缓存
 * 默认值: 800 MB
 */
export async function setLargeFileThreshold(thresholdMb: number): Promise<void> {
	console.log('⚙️ [PageManager] setLargeFileThreshold:', thresholdMb, 'MB');
	return invoke('pm_set_large_file_threshold', { thresholdMb });
}

// ===== 缩略图 =====

/**
 * 缩略图就绪事件数据
 */
export interface ThumbnailReadyEvent {
	index: number;
	data: string; // data:image/webp;base64,...
	width: number;
	height: number;
}

/**
 * 缩略图批量就绪事件数据
 */
export interface ThumbnailBatchReadyEvent {
	items: ThumbnailReadyEvent[];
}

const CACHE_STATUS_CHUNK_SIZE = 2048;

/**
 * 预加载缩略图（异步，结果通过事件推送）
 * 
 * 接受需要生成的页面索引列表，生成后通过 "thumbnail-ready" 事件推送
 * 后端会按照与 centerIndex 的距离排序，距离近的优先生成（中央优先策略）
 * 前端负责过滤已缓存的页面，避免重复生成
 * 
 * @param indices 需要生成缩略图的页面索引列表
 * @param centerIndex 当前页面索引（用于优先级排序）
 * @param maxSize 缩略图最大尺寸（默认 256）
 * @returns 开始预加载的页面索引列表
 */
export async function preloadThumbnails(
	indices: number[],
	centerIndex: number,
	maxSize: number = 256
): Promise<number[]> {
	return invoke<number[]>('pm_preload_thumbnails', { indices, centerIndex, maxSize });
}

/**
 * 【性能优化】查询页面缓存状态
 * 
 * 返回指定范围内每个页面是否在后端缓存中
 * 前端可用于智能预加载决策，避免重复请求已缓存的页面
 * 
 * @param startPage 起始页面索引
 * @param count 查询页数
 * @returns 布尔数组，表示每个页面是否已缓存
 */
export async function getCacheStatus(startPage: number, count: number): Promise<boolean[]> {
	if (count <= 0) return [];

	const statuses: boolean[] = [];
	let offset = 0;

	while (offset < count) {
		const chunkCount = Math.min(CACHE_STATUS_CHUNK_SIZE, count - offset);
		const chunkStart = startPage + offset;
		const chunk = await invoke<boolean[]>('pm_get_cache_status', {
			startPage: chunkStart,
			count: chunkCount
		});
		statuses.push(...chunk);
		offset += chunkCount;
	}

	return statuses;
}

/**
 * 【性能优化】获取指定范围内未缓存的页面索引
 * 
 * 便捷方法，直接返回需要预加载的页面
 */
export async function getUncachedPages(startPage: number, count: number): Promise<number[]> {
	const statuses = await getCacheStatus(startPage, count);
	return statuses
		.map((cached, i) => cached ? null : startPage + i)
		.filter((p): p is number => p !== null);
}

// ===== 工具函数 =====

/**
 * 格式化内存大小
 */
export function formatMemorySize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * 创建 Object URL 从 Blob
 */
export function createObjectURL(blob: Blob): string {
	return URL.createObjectURL(blob);
}

/**
 * 释放 Object URL
 */
export function revokeObjectURL(url: string): void {
	URL.revokeObjectURL(url);
}

// ===== PageFrame API (已迁移到前端本地计算) =====
// 这些类型定义保留以兼容现有代码，但 API 函数已移除
// 请使用 pageFrameStore 进行布局计算

/** 宽页拉伸模式 */
export type WidePageStretch = 'none' | 'uniformHeight' | 'uniformWidth';

/** 页面帧元素信息 */
export interface PageFrameElementInfo {
	pageIndex: number;
	part: number;
	cropRect?: { x: number; y: number; width: number; height: number };
	isLandscape: boolean;
	isDummy: boolean;
	/** 内容缩放比例（用于双页对齐） */
	scale: number;
	/** 显示宽度 */
	width: number;
	/** 显示高度 */
	height: number;
}

/** 页面帧信息 */
export interface PageFrameInfo {
	elements: PageFrameElementInfo[];
	frameRange: {
		minIndex: number;
		minPart: number;
		maxIndex: number;
		maxPart: number;
	};
	size: { width: number; height: number };
	angle: number;
	scale: number;
	startIndex: number;
	endIndex: number;
}

/** 页面帧上下文 */
export interface PageFrameContext {
	pageMode: 'single' | 'double';
	readOrder: 'ltr' | 'rtl';
	isSupportedDividePage: boolean;
	isSupportedWidePage: boolean;
	isSupportedSingleFirst: boolean;
	isSupportedSingleLast: boolean;
	dividePageRate: number;
	autoRotate: 'none' | 'left' | 'right' | 'auto';
	stretchMode: string;
	canvasSize: { width: number; height: number };
	/** 宽页拉伸模式（双页模式下的对齐方式） */
	widePageStretch: WidePageStretch;
}

// NOTE: PageFrame API 函数已移除，请使用 pageFrameStore：
// - updatePageFrameContext -> pageFrameStore.updateContext()
// - getPageFrameContext -> pageFrameStore.getContext()
// - buildFrame -> pageFrameStore.buildFrame()
// - getNextFramePosition -> pageFrameStore.getNextPosition()
// - getPrevFramePosition -> pageFrameStore.getPrevPosition()
// - getTotalVirtualPages -> pageFrameStore.refreshTotalPages()
// - isPageSplit -> pageFrameStore.isPageSplit()
// - positionFromVirtual -> pageFrameStore.positionFromVirtual()
// - framePositionForIndex -> pageFrameStore.framePositionForIndex()


// ===== 事件监听 =====

import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/** 页面加载事件数据 */
export interface PageLoadedEvent {
	index: number;
	size: number;
}

/** 页面卸载事件数据 */
export interface PageUnloadedEvent {
	index: number;
}

/** 内存压力事件数据 */
export interface MemoryPressureEvent {
	current: number;
	limit: number;
	percent: number;
}

/** 事件监听器集合 */
export interface PageManagerListeners {
	onPageLoaded?: (event: PageLoadedEvent) => void;
	onPageUnloaded?: (event: PageUnloadedEvent) => void;
	onMemoryPressure?: (event: MemoryPressureEvent) => void;
}

/** 事件取消订阅函数集合 */
interface UnlistenFns {
	pageLoaded?: UnlistenFn;
	pageUnloaded?: UnlistenFn;
	memoryPressure?: UnlistenFn;
}

let unlistenFns: UnlistenFns = {};

/**
 * 订阅 PageManager 事件
 * 
 * @param listeners 事件监听器
 * @returns 取消订阅函数
 */
export async function subscribeEvents(listeners: PageManagerListeners): Promise<() => void> {
	// 先取消之前的订阅
	await unsubscribeEvents();

	// 订阅页面加载事件
	if (listeners.onPageLoaded) {
		const callback = listeners.onPageLoaded;
		unlistenFns.pageLoaded = await listen<PageLoadedEvent>('page_loaded', (event) => {
			callback(event.payload);
		});
	}

	// 订阅页面卸载事件
	if (listeners.onPageUnloaded) {
		const callback = listeners.onPageUnloaded;
		unlistenFns.pageUnloaded = await listen<PageUnloadedEvent>('page_unloaded', (event) => {
			callback(event.payload);
		});
	}

	// 订阅内存压力事件
	if (listeners.onMemoryPressure) {
		const callback = listeners.onMemoryPressure;
		unlistenFns.memoryPressure = await listen<MemoryPressureEvent>('memory_pressure', (event) => {
			console.warn('⚠️ [PageManager] 内存压力:', event.payload);
			callback(event.payload);
		});
	}

	return unsubscribeEvents;
}

/**
 * 取消所有事件订阅
 */
export async function unsubscribeEvents(): Promise<void> {
	if (unlistenFns.pageLoaded) {
		unlistenFns.pageLoaded();
		unlistenFns.pageLoaded = undefined;
	}
	if (unlistenFns.pageUnloaded) {
		unlistenFns.pageUnloaded();
		unlistenFns.pageUnloaded = undefined;
	}
	if (unlistenFns.memoryPressure) {
		unlistenFns.memoryPressure();
		unlistenFns.memoryPressure = undefined;
	}
}

// ===== 内存压力处理 =====

/** 内存压力处理器 */
export interface MemoryPressureHandler {
	/** 开始监听 */
	start: () => Promise<void>;
	/** 停止监听 */
	stop: () => void;
	/** 手动触发清理 */
	triggerCleanup: () => Promise<void>;
}

/**
 * 创建内存压力处理器
 * 
 * @param onPressure 压力回调（可选，用于 UI 提示）
 * @param cleanupThreshold 触发清理的阈值百分比（默认 80%）
 */
export function createMemoryPressureHandler(
	onPressure?: (event: MemoryPressureEvent) => void,
	cleanupThreshold: number = 80
): MemoryPressureHandler {
	let unsubscribe: (() => void) | null = null;

	return {
		async start() {
			const unsub = await subscribeEvents({
				onMemoryPressure: (event) => {
					// 通知 UI
					onPressure?.(event);

					// 如果超过阈值，触发清理
					if (event.percent >= cleanupThreshold) {
						console.warn(`⚠️ [MemoryPressure] ${event.percent}% >= ${cleanupThreshold}%，触发清理`);
						// 后端会自动处理，这里只是记录日志
					}
				}
			});
			unsubscribe = unsub;
		},

		stop() {
			if (unsubscribe) {
				unsubscribe();
				unsubscribe = null;
			}
		},

		async triggerCleanup() {
			console.log('🧹 [MemoryPressure] 手动触发缓存清理');
			await clearCache();
		}
	};
}
