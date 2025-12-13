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
 * 将 base64 字符串解码为 ArrayBuffer（回退方案）
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binaryString = atob(base64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes.buffer;
}

/**
 * 安全获取页面数据，优先使用二进制 IPC，失败时回退到 base64
 */
async function safeGetPageBuffer(command: string, index: number): Promise<ArrayBuffer> {
	try {
		// 优先使用二进制 IPC（性能更好）
		const buffer = await invoke<ArrayBuffer>(command, { index });
		// 验证返回的是有效的 ArrayBuffer
		if (buffer instanceof ArrayBuffer && buffer.byteLength > 0) {
			return buffer;
		}
		throw new Error('Invalid ArrayBuffer response');
	} catch (err) {
		// 回退到 base64 版本（兼容性更好）
		console.warn(`⚠️ 二进制 IPC 失败，回退到 base64: ${command}`, err);
		const base64 = await invoke<string>(`${command}_base64`, { index });
		return base64ToArrayBuffer(base64);
	}
}

/**
 * 跳转到指定页面（优先二进制 IPC，失败回退 base64）
 * 
 * 后端自动：
 * - 检查缓存
 * - 加载页面
 * - 提交预加载任务
 * 
 * @returns Blob 数据
 */
export async function gotoPage(index: number): Promise<Blob> {
	console.log('📄 [PageManager] gotoPage:', index);
	const buffer = await safeGetPageBuffer('pm_goto_page', index);
	return new Blob([buffer]);
}

/**
 * 获取页面数据（不改变当前页，优先二进制 IPC，失败回退 base64）
 * 
 * @returns Blob 数据
 */
export async function getPage(index: number): Promise<Blob> {
	const buffer = await safeGetPageBuffer('pm_get_page', index);
	return new Blob([buffer]);
}

/**
 * 跳转到指定页面（返回原始 ArrayBuffer，用于延迟追踪）
 */
export async function gotoPageRaw(index: number): Promise<ArrayBuffer> {
	return safeGetPageBuffer('pm_goto_page', index);
}

/**
 * 获取页面数据（返回原始 ArrayBuffer，用于延迟追踪）
 */
export async function getPageRaw(index: number): Promise<ArrayBuffer> {
	return safeGetPageBuffer('pm_get_page', index);
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
	/** 宽页拉伸模式 */
	widePageStretch?: WidePageStretch;
}): Promise<void> {
	return invoke('pf_update_context', updates);
}

/**
 * 获取 PageFrame 上下文
 */
export async function getPageFrameContext(): Promise<PageFrameContext> {
	return invoke<PageFrameContext>('pf_get_context');
}

/**
 * 构建指定位置的帧
 */
export async function buildFrame(index: number, part?: number): Promise<PageFrameInfo | null> {
	return invoke<PageFrameInfo | null>('pf_build_frame', { index, part });
}

/**
 * 获取下一帧位置
 */
export async function getNextFramePosition(index: number, part?: number): Promise<[number, number] | null> {
	return invoke<[number, number] | null>('pf_next_position', { index, part });
}

/**
 * 获取上一帧位置
 */
export async function getPrevFramePosition(index: number, part?: number): Promise<[number, number] | null> {
	return invoke<[number, number] | null>('pf_prev_position', { index, part });
}

/**
 * 获取总虚拟页数
 */
export async function getTotalVirtualPages(): Promise<number> {
	return invoke<number>('pf_total_virtual_pages');
}

/**
 * 检查页面是否分割
 */
export async function isPageSplit(index: number): Promise<boolean> {
	return invoke<boolean>('pf_is_page_split', { index });
}

/**
 * 从虚拟索引获取位置
 */
export async function positionFromVirtual(virtualIndex: number): Promise<[number, number]> {
	return invoke<[number, number]>('pf_position_from_virtual', { virtualIndex });
}

/**
 * 获取包含指定页面的帧位置
 */
export async function framePositionForIndex(pageIndex: number): Promise<[number, number]> {
	return invoke<[number, number]>('pf_frame_position_for_index', { pageIndex });
}


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

const unlistenFns: UnlistenFns = {};

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
