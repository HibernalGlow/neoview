/**
 * NeoView Page Manager API
 * 
 * 基于 NeeView 架构的新加载系统
 * 全面使用 Python HTTP API
 */

import { apiGet, apiPost, PYTHON_API_BASE } from './http-bridge';
import { listen } from './window';
import type { UnlistenFn } from './window';

// ===== 类型定义 =====

/** 书籍类型 */
export type BookType = 
	| 'archive'      // 压缩包
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
	| 'animated'  // 动图
	| 'archive'   // 嵌套压缩包
	| 'ebook'     // 电子书
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

// ===== API 函数 =====

/**
 * 打开书籍
 */
export async function openBook(path: string): Promise<BookInfo> {
	console.log('📖 [PageManager] openBook:', path);
	return await apiPost<BookInfo>(`/book/open?path=${encodeURIComponent(path)}`);
}

/**
 * 关闭书籍
 */
export async function closeBook(): Promise<void> {
	console.log('📖 [PageManager] closeBook');
	await apiPost('/book/close');
}

/**
 * 获取当前书籍信息
 */
export async function getBookInfo(): Promise<BookInfo | null> {
	return await apiGet<BookInfo | null>('/book/current');
}

/**
 * 跳转到指定页面
 */
export async function gotoPage(index: number): Promise<Blob> {
	console.log('📄 [PageManager] gotoPage:', index);
	const url = `${PYTHON_API_BASE}/book/page/${index}`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to load page: ${response.status}`);
	}
	return await response.blob();
}

/**
 * 获取页面数据
 */
export async function getPage(index: number): Promise<Blob> {
	const url = `${PYTHON_API_BASE}/book/page/${index}`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to load page: ${response.status}`);
	}
	return await response.blob();
}

/**
 * 跳转到指定页面（返回原始 ArrayBuffer）
 */
export async function gotoPageRaw(index: number): Promise<ArrayBuffer> {
	const blob = await gotoPage(index);
	return await blob.arrayBuffer();
}

/**
 * 获取页面数据（返回原始 ArrayBuffer）
 */
export async function getPageRaw(index: number): Promise<ArrayBuffer> {
	const blob = await getPage(index);
	return await blob.arrayBuffer();
}

/**
 * 获取页面信息
 */
export async function getPageInfo(index: number): Promise<PageInfo> {
	return await apiGet<PageInfo>('/book/page-info', { index });
}

/**
 * 获取页面管理器统计
 */
export async function getStats(): Promise<PageManagerStats> {
	return await apiGet<PageManagerStats>('/book/stats');
}

/**
 * 获取内存池统计
 */
export async function getMemoryStats(): Promise<MemoryPoolStats> {
	return await apiGet<MemoryPoolStats>('/book/memory-stats');
}

/**
 * 清除所有缓存
 */
export async function clearCache(): Promise<void> {
	console.log('🧹 [PageManager] clearCache');
	await apiPost('/book/clear-cache');
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
 */
export async function getVideoPath(index: number): Promise<string> {
	console.log('🎬 [PageManager] getVideoPath:', index);
	return await apiGet<string>('/book/video-path', { index });
}

/**
 * 获取临时文件统计
 */
export async function getTempStats(): Promise<TempFileStats> {
	return await apiGet<TempFileStats>('/book/temp-stats');
}

/**
 * 获取大文件阈值（MB）
 */
export async function getLargeFileThreshold(): Promise<number> {
	return await apiGet<number>('/book/large-file-threshold');
}

/**
 * 设置大文件阈值（MB）
 */
export async function setLargeFileThreshold(thresholdMb: number): Promise<void> {
	console.log('⚙️ [PageManager] setLargeFileThreshold:', thresholdMb, 'MB');
	await apiPost('/book/large-file-threshold', { threshold_mb: thresholdMb });
}

// ===== 缩略图 =====

/**
 * 缩略图就绪事件数据
 */
export interface ThumbnailReadyEvent {
	index: number;
	data: string;
	width: number;
	height: number;
}

/**
 * 预加载缩略图
 */
export async function preloadThumbnails(
	indices: number[],
	centerIndex: number,
	maxSize: number = 256
): Promise<number[]> {
	return await apiPost<number[]>('/thumbnail/preload-pages', { indices, center_index: centerIndex, max_size: maxSize });
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

// ===== PageFrame API =====

/** 宽页拉伸模式 */
export type WidePageStretch = 'none' | 'uniformHeight' | 'uniformWidth';

/** 页面帧元素信息 */
export interface PageFrameElementInfo {
	pageIndex: number;
	part: number;
	cropRect?: { x: number; y: number; width: number; height: number };
	isLandscape: boolean;
	isDummy: boolean;
	scale: number;
	width: number;
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
	widePageStretch: WidePageStretch;
}

/**
 * 更新 PageFrame 上下文配置
 */
export async function updatePageFrameContext(updates: {
	pageMode?: string;
	readOrder?: string;
	dividePage?: boolean;
	widePage?: boolean;
	singleFirst?: boolean;
	singleLast?: boolean;
	divideRate?: number;
	canvasWidth?: number;
	canvasHeight?: number;
	widePageStretch?: WidePageStretch;
}): Promise<void> {
	await apiPost('/page-frame/context', updates);
}

/**
 * 获取 PageFrame 上下文
 */
export async function getPageFrameContext(): Promise<PageFrameContext> {
	return await apiGet<PageFrameContext>('/page-frame/context');
}

/**
 * 构建指定位置的帧
 */
export async function buildFrame(index: number, part?: number): Promise<PageFrameInfo | null> {
	return await apiPost<PageFrameInfo | null>('/page-frame/build', { index, part });
}

/**
 * 获取下一帧位置
 */
export async function getNextFramePosition(index: number, part?: number): Promise<[number, number] | null> {
	return await apiGet<[number, number] | null>('/page-frame/next-position', { index, part });
}

/**
 * 获取上一帧位置
 */
export async function getPrevFramePosition(index: number, part?: number): Promise<[number, number] | null> {
	return await apiGet<[number, number] | null>('/page-frame/prev-position', { index, part });
}

/**
 * 获取总虚拟页数
 */
export async function getTotalVirtualPages(): Promise<number> {
	return await apiGet<number>('/page-frame/total-virtual-pages');
}

/**
 * 检查页面是否分割
 */
export async function isPageSplit(index: number): Promise<boolean> {
	return await apiGet<boolean>('/page-frame/is-page-split', { index });
}

/**
 * 从虚拟索引获取位置
 */
export async function positionFromVirtual(virtualIndex: number): Promise<[number, number]> {
	return await apiGet<[number, number]>('/page-frame/position-from-virtual', { virtual_index: virtualIndex });
}

/**
 * 获取包含指定页面的帧位置
 */
export async function framePositionForIndex(pageIndex: number): Promise<[number, number]> {
	return await apiGet<[number, number]>('/page-frame/frame-position-for-index', { page_index: pageIndex });
}

// ===== 事件监听 =====

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
 */
export async function subscribeEvents(listeners: PageManagerListeners): Promise<() => void> {
	await unsubscribeEvents();

	if (listeners.onPageLoaded) {
		const callback = listeners.onPageLoaded;
		unlistenFns.pageLoaded = await listen<PageLoadedEvent>('page_loaded', (event) => {
			callback(event.payload);
		});
	}

	if (listeners.onPageUnloaded) {
		const callback = listeners.onPageUnloaded;
		unlistenFns.pageUnloaded = await listen<PageUnloadedEvent>('page_unloaded', (event) => {
			callback(event.payload);
		});
	}

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
	start: () => Promise<void>;
	stop: () => void;
	triggerCleanup: () => Promise<void>;
}

/**
 * 创建内存压力处理器
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
					onPressure?.(event);
					if (event.percent >= cleanupThreshold) {
						console.warn(`⚠️ [MemoryPressure] ${event.percent}% >= ${cleanupThreshold}%，触发清理`);
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
