/**
 * 图片读取模块
 * 负责从文件系统或压缩包读取图片数据
 * 
 * 【三模式支持】
 * 1. Protocol 模式：neoview:// 自定义协议（最快，绕过 IPC 序列化）
 * 2. IPC 模式：二进制 IPC + Blob（内存缓存）
 * 3. Tempfile 模式：解压到临时文件 + asset:// 协议
 * 
 * 【优化】
 * - 并行预加载 ±5 页到后端缓存
 * - Web Worker 解码避免阻塞主线程
 * - Custom Protocol 绕过 invoke 序列化开销
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import { invoke } from '@tauri-apps/api/core';
import { bookStore } from '$lib/stores/book.svelte';
import { loadModeStore } from '$lib/stores/loadModeStore.svelte';
import { infoPanelStore, type LatencyTrace } from '$lib/stores/infoPanel.svelte';
import { pipelineLatencyStore } from '$lib/stores/pipelineLatency.svelte';
import { createImageTraceId, logImageTrace } from '$lib/utils/imageTrace';
import * as pm from '$lib/api/pageManager';
import { registerBookPath, getArchiveImageUrl, preloadArchiveImages } from '$lib/api/imageProtocol';

// Tempfile 模式缓存（URL -> blob）
const tempfileCache = new Map<string, { url: string; blob: Blob }>();
const TEMPFILE_CACHE_LIMIT = 100;

export interface ReadResult {
	blob: Blob;
	traceId: string;
}

// 预加载状态跟踪
let lastPreloadedPage = -1;
const PRELOAD_RANGE = 5; // ±5 页

// PageManager 书籍同步状态（避免重复检查）
let lastSyncedBookPath: string | null = null;

// Custom Protocol 书籍哈希缓存
let currentBookHash: string | null = null;
let currentBookPathForHash: string | null = null;

// 是否启用 Custom Protocol 模式
// 注意：Custom Protocol 在开发模式 (http://localhost) 下不可用
// 生产环境 (tauri://localhost 或 https://tauri.localhost) 下可用
const isProductionMode = !window.location.href.startsWith('http://localhost');
let useProtocolMode = isProductionMode; // 仅生产环境启用

// 预解压相关（可选优化，保留接口兼容）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function preExtractArchive(_archivePath: string): Promise<string | null> {
	// 简化：不再预解压到文件，直接使用内存方案
	return null;
}

export function clearExtractCache(): void {
	// 重置预加载状态
	lastPreloadedPage = -1;
	// 重置 PageManager 同步状态
	lastSyncedBookPath = null;
	// 重置 Custom Protocol 缓存
	currentBookHash = null;
	currentBookPathForHash = null;
}

/**
 * 设置是否使用 Custom Protocol 模式
 */
export function setProtocolMode(enabled: boolean): void {
	useProtocolMode = enabled;
}

/**
 * 获取当前书籍的 Protocol 哈希
 * 缓存哈希避免重复 IPC 调用
 */
async function getBookHash(bookPath: string): Promise<string> {
	if (currentBookPathForHash === bookPath && currentBookHash) {
		return currentBookHash;
	}
	currentBookHash = await registerBookPath(bookPath);
	currentBookPathForHash = bookPath;
	return currentBookHash;
}

/**
 * 【优化】触发并行预加载邻近页面
 * 异步执行，不阻塞当前加载
 * 【新增】支持 Custom Protocol 预加载（利用浏览器缓存）
 */
async function triggerParallelPreload(currentPage: number): Promise<void> {
	const currentBook = bookStore.currentBook;
	if (!currentBook || currentBook.type !== 'archive') return;
	
	// 避免频繁触发
	if (Math.abs(currentPage - lastPreloadedPage) < 3) return;
	lastPreloadedPage = currentPage;
	
	// 计算需要预加载的页面范围
	const totalPages = currentBook.pages.length;
	const startPage = Math.max(0, currentPage - PRELOAD_RANGE);
	const endPage = Math.min(totalPages - 1, currentPage + PRELOAD_RANGE);
	
	// 【优化】如果启用 Protocol 模式，使用浏览器预加载
	if (useProtocolMode) {
		try {
			const bookHash = await getBookHash(currentBook.path);
			const preloadCount = endPage - startPage;
			preloadArchiveImages(bookHash, startPage, preloadCount);
		} catch (err) {
			console.warn('Protocol 预加载失败:', err);
		}
		return;
	}
	
	// 回退：使用后端预加载
	const pagePaths: string[] = [];
	for (let i = startPage; i <= endPage; i++) {
		if (i !== currentPage && currentBook.pages[i]) {
			pagePaths.push(currentBook.pages[i].path);
		}
	}
	
	if (pagePaths.length === 0) return;
	
	// 异步预加载，不等待结果
	try {
		const { preloadArchivePages } = await import('$lib/api/filesystem');
		preloadArchivePages(currentBook.path, pagePaths).catch(err => {
			console.warn('预加载失败:', err);
		});
	} catch (err) {
		console.warn('导入预加载模块失败:', err);
	}
}

export interface ReadPageOptions {
	/** 是否更新延迟追踪显示（仅当前页需要） */
	updateLatencyTrace?: boolean;
}

/**
 * 读取页面图片为 Blob
 * 【纯内存方案】优先使用最快的方式获取数据到内存
 * 【追踪】记录链路延迟到 infoPanelStore（仅当前页）
 */
export async function readPageBlob(pageIndex: number, options: ReadPageOptions = {}): Promise<ReadResult> {
	const { updateLatencyTrace = true } = options;
	const startTime = performance.now();
	const currentBook = bookStore.currentBook;
	
	// 【关键】详细验证，防止切书后加载不存在的页面
	if (!currentBook) {
		throw new Error(`页面 ${pageIndex} 不存在: 没有打开的书籍`);
	}
	if (pageIndex < 0 || pageIndex >= currentBook.pages.length) {
		throw new Error(`页面 ${pageIndex} 不存在: 索引越界 (总页数: ${currentBook.pages.length})`);
	}
	const pageInfo = currentBook.pages[pageIndex];
	if (!pageInfo) {
		throw new Error(`页面 ${pageIndex} 不存在: 页面信息为空`);
	}

	const traceId = createImageTraceId(currentBook.type ?? 'fs', pageIndex);
	logImageTrace(traceId, 'readPageBlob start', {
		pageIndex,
		path: pageInfo.path,
		bookType: currentBook.type
	});

	let blob: Blob;
	let cacheHit = false;
	let loadMs = 0;

	if (currentBook.type === 'archive') {
		const cacheKey = `${currentBook.path}::${pageInfo.path}`;
		
		// 检查 Tempfile 缓存
		const cached = tempfileCache.get(cacheKey);
		if (cached) {
			logImageTrace(traceId, 'tempfile cache hit', { cacheKey });
			blob = cached.blob;
			cacheHit = true;
		} else if (useProtocolMode && !loadModeStore.isTempfileMode) {
			// 【优化】Protocol 模式：使用 neoview:// 自定义协议（绕过 IPC 序列化）
			logImageTrace(traceId, 'using protocol mode');
			const loadStart = performance.now();
			
			try {
				const bookHash = await getBookHash(currentBook.path);
				const protocolUrl = getArchiveImageUrl(bookHash, pageIndex);
				logImageTrace(traceId, 'protocol url', { protocolUrl });
				
				const response = await fetch(protocolUrl);
				if (!response.ok) {
					throw new Error(`Protocol fetch failed: ${response.status}`);
				}
				blob = await response.blob();
				loadMs = performance.now() - loadStart;
			} catch (err) {
				// Protocol 失败，回退到 IPC 模式
				console.warn('Protocol 模式失败，回退到 IPC:', err);
				logImageTrace(traceId, 'protocol fallback to ipc', { error: String(err) });
				const { loadImageFromArchiveAsBlob } = await import('$lib/api/filesystem');
				const result = await loadImageFromArchiveAsBlob(currentBook.path, pageInfo.path, {
					traceId,
					pageIndex
				});
				blob = result.blob;
				loadMs = performance.now() - loadStart;
			}
		} else if (loadModeStore.isTempfileMode) {
			// Tempfile 模式：解压到临时文件 + asset:// 协议
			logImageTrace(traceId, 'using tempfile mode');
			const loadStart = performance.now();
			
			const tempPath = await invoke<string>('extract_image_to_temp', {
				archivePath: currentBook.path,
				filePath: pageInfo.path,
				traceId,
				pageIndex
			});
			
			const assetUrl = convertFileSrc(tempPath);
			logImageTrace(traceId, 'tempfile asset url', { assetUrl });
			
			const response = await fetch(assetUrl);
			if (!response.ok) {
				throw new Error(`Tempfile fetch failed: ${response.status}`);
			}
			blob = await response.blob();
			loadMs = performance.now() - loadStart;
			
			// 存入缓存
			if (tempfileCache.size >= TEMPFILE_CACHE_LIMIT) {
				// 简单 LRU：删除最早的
				const firstKey = tempfileCache.keys().next().value;
				if (firstKey) tempfileCache.delete(firstKey);
			}
			tempfileCache.set(cacheKey, { url: assetUrl, blob });
		} else {
			// IPC 模式：使用二进制 IPC（最快的首次加载）
			logImageTrace(traceId, 'using ipc mode');
			const loadStart = performance.now();
			const { loadImageFromArchiveAsBlob } = await import('$lib/api/filesystem');
			const result = await loadImageFromArchiveAsBlob(currentBook.path, pageInfo.path, {
				traceId,
				pageIndex
			});
			blob = result.blob;
			loadMs = performance.now() - loadStart;
		}
	} else if (currentBook.type === 'epub') {
		// EPUB：使用 IPC 加载（内部图片不能直接用 asset://）
		logImageTrace(traceId, 'using ipc mode for epub');
		const loadStart = performance.now();
		const { loadImage } = await import('$lib/api/filesystem');
		const data = await loadImage(pageInfo.path, { traceId, pageIndex });
		blob = new Blob([data]);
		loadMs = performance.now() - loadStart;
	} else {
		// 文件系统：使用 asset:// 协议
		const assetUrl = convertFileSrc(pageInfo.path);
		logImageTrace(traceId, 'using asset protocol', { assetUrl });
		const loadStart = performance.now();
		
		const response = await fetch(assetUrl);
		if (!response.ok) {
			throw new Error(`Asset fetch failed: ${response.status}`);
		}
		blob = await response.blob();
		loadMs = performance.now() - loadStart;
	}

	const totalMs = performance.now() - startTime;
	logImageTrace(traceId, 'readPageBlob blob ready', { size: blob.size, loadMs, totalMs });

	// 更新链路延迟追踪（仅当前页，避免预加载干扰显示）
	if (updateLatencyTrace) {
		const latencyTrace: LatencyTrace = {
			dataSource: loadModeStore.isTempfileMode ? 'tempfile' : 'blob',
			renderMode: loadModeStore.isImgMode ? 'img' : 'canvas',
			loadMs,
			totalMs,
			cacheHit,
			dataSize: blob.size,
			traceId
		};
		infoPanelStore.setLatencyTrace(latencyTrace);
	}

	// 【优化】触发并行预加载（异步，不阻塞当前加载）
	triggerParallelPreload(pageIndex);

	return { blob, traceId };
}

/**
 * 获取图片尺寸
 * 【优化】优先使用 Web Worker 解码，避免阻塞主线程
 */
export async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
	// 优先尝试 Worker 解码
	try {
		const { decodeImageInWorker } = await import('$lib/workers/imageDecoderManager');
		const result = await decodeImageInWorker(blob);
		result.bitmap.close(); // 释放 ImageBitmap
		return { width: result.width, height: result.height };
	} catch {
		// Worker 失败，回退到主线程
	}

	// 回退：使用 Image 元素
	return new Promise((resolve) => {
		const url = URL.createObjectURL(blob);
		const img = new Image();
		img.onload = () => {
			const result = { width: img.naturalWidth, height: img.naturalHeight };
			URL.revokeObjectURL(url);
			resolve(result);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			resolve(null);
		};
		img.src = url;
	});
}

/**
 * 【优化】预解码图片到 ImageBitmap
 * 在 Worker 中解码，返回 ImageBitmap 可直接用于 Canvas
 */
export async function preDecodeImage(blob: Blob): Promise<ImageBitmap | null> {
	try {
		const { decodeImageInWorker } = await import('$lib/workers/imageDecoderManager');
		const result = await decodeImageInWorker(blob);
		return result.bitmap;
	} catch {
		// Worker 失败，尝试主线程
		try {
			return await createImageBitmap(blob);
		} catch {
			return null;
		}
	}
}

/**
 * 【新系统】使用 PageManager 读取页面
 * 【优化】优先使用 Custom Protocol (neoview://)，绕过 IPC 序列化开销
 * 回退到 PageManager IPC 模式
 * 
 * @param isCurrentPage 是否是当前页（true=gotoPage触发预加载，false=getPage不触发）
 */
export async function readPageBlobV2(
	pageIndex: number,
	options: ReadPageOptions & { isCurrentPage?: boolean } = {}
): Promise<ReadResult> {
	const { updateLatencyTrace = true, isCurrentPage = true } = options;
	const startTime = performance.now();
	const traceId = createImageTraceId('pm', pageIndex);

	logImageTrace(traceId, 'readPageBlobV2 start', { pageIndex, isCurrentPage, useProtocolMode });

	try {
		const currentBook = bookStore.currentBook;
		if (!currentBook) {
			throw new Error('没有打开的书籍');
		}

		let blob: Blob;
		let bookSyncMs = 0;
		let loadMs = 0;
		let dataSource: 'protocol' | 'ipc' = 'ipc';

		// 【优化】压缩包优先使用 Custom Protocol 模式
		if (useProtocolMode && currentBook.type === 'archive') {
			logImageTrace(traceId, 'trying protocol mode');
			const loadStart = performance.now();

			try {
				const bookHash = await getBookHash(currentBook.path);
				const protocolUrl = getArchiveImageUrl(bookHash, pageIndex);
				logImageTrace(traceId, 'protocol url', { protocolUrl });

				const response = await fetch(protocolUrl);
				if (!response.ok) {
					throw new Error(`Protocol fetch failed: ${response.status}`);
				}
				blob = await response.blob();
				loadMs = performance.now() - loadStart;
				dataSource = 'protocol';
				logImageTrace(traceId, 'protocol success', { loadMs, size: blob.size });
			} catch (err) {
				// Protocol 失败，回退到 PageManager IPC
				console.warn('Protocol 模式失败，回退到 PageManager IPC:', err);
				logImageTrace(traceId, 'protocol fallback to pm', { error: String(err) });
				const result = await loadViaPageManager(pageIndex, isCurrentPage, traceId);
				blob = result.blob;
				bookSyncMs = result.bookSyncMs;
				loadMs = result.loadMs;
			}
		} else {
			// 非压缩包或禁用 Protocol，使用 PageManager IPC
			const result = await loadViaPageManager(pageIndex, isCurrentPage, traceId);
			blob = result.blob;
			bookSyncMs = result.bookSyncMs;
			loadMs = result.loadMs;
		}

		const totalMs = performance.now() - startTime;

		logImageTrace(traceId, 'readPageBlobV2 complete', {
			size: blob.size,
			bookSyncMs,
			loadMs,
			totalMs,
			dataSource
		});

		// 记录到 pipelineLatencyStore
		pipelineLatencyStore.record({
			timestamp: Date.now(),
			pageIndex,
			traceId,
			bookSyncMs,
			backendLoadMs: loadMs,
			ipcTransferMs: dataSource === 'ipc' ? loadMs : 0,
			blobCreateMs: 0,
			totalMs,
			dataSize: blob.size,
			cacheHit: false,
			isCurrentPage,
			source: isCurrentPage ? 'current' : 'preload'
		});

		// 【优化】Protocol 模式使用浏览器预加载，IPC 模式触发后端预加载
		if (isCurrentPage) {
			if (useProtocolMode && currentBook.type === 'archive') {
				triggerParallelPreload(pageIndex);
			} else {
				invoke('pm_trigger_preload').catch(() => {});
			}
		}

		// 更新延迟追踪（兼容旧系统）
		if (updateLatencyTrace) {
			const latencyTrace: LatencyTrace = {
				dataSource: dataSource === 'protocol' ? 'protocol' : 'blob',
				renderMode: loadModeStore.isImgMode ? 'img' : 'canvas',
				loadMs,
				totalMs,
				cacheHit: false,
				dataSize: blob.size,
				traceId
			};
			infoPanelStore.setLatencyTrace(latencyTrace);
		}

		return { blob, traceId };
	} catch (error) {
		logImageTrace(traceId, 'readPageBlobV2 error', { error: String(error) });
		throw error;
	}
}

/**
 * 【内部】通过 PageManager IPC 加载页面
 */
async function loadViaPageManager(
	pageIndex: number,
	isCurrentPage: boolean,
	traceId: string
): Promise<{ blob: Blob; bookSyncMs: number; loadMs: number }> {
	const currentBook = bookStore.currentBook;
	if (!currentBook) {
		throw new Error('没有打开的书籍');
	}

	// 书籍同步计时
	let bookSyncMs = 0;
	if (lastSyncedBookPath !== currentBook.path) {
		const syncStart = performance.now();
		logImageTrace(traceId, 'syncing PageManager book', { path: currentBook.path });
		await pm.openBook(currentBook.path);
		lastSyncedBookPath = currentBook.path;
		bookSyncMs = performance.now() - syncStart;
	}

	// IPC 调用计时
	const ipcStart = performance.now();
	const buffer = isCurrentPage ? await pm.gotoPageRaw(pageIndex) : await pm.getPageRaw(pageIndex);
	const loadMs = performance.now() - ipcStart;

	const blob = new Blob([buffer]);
	return { blob, bookSyncMs, loadMs };
}

/**
 * 创建缩略图 DataURL
 * 如果 blob 已经是小图片（< 100KB），直接转换为 data URL，无需 canvas 重绘
 * 后端已返回正确尺寸的 webp 缩略图
 */
export async function createThumbnailDataURL(blob: Blob, height: number = 120): Promise<string> {
	// 小于 100KB 的图片直接转换为 data URL（后端返回的 webp 缩略图通常很小）
	if (blob.size < 100 * 1024) {
		return new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = () => reject(new Error('Failed to read blob'));
			reader.readAsDataURL(blob);
		});
	}

	// 大图片才需要 canvas 缩放
	const imageUrl = URL.createObjectURL(blob);
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d')!;

	return new Promise<string>((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			const scale = height / img.naturalHeight;
			canvas.width = img.naturalWidth * scale;
			canvas.height = height;
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			URL.revokeObjectURL(imageUrl);
			resolve(canvas.toDataURL('image/jpeg', 0.85));
		};
		img.onerror = (error) => {
			URL.revokeObjectURL(imageUrl);
			reject(error);
		};
		img.src = imageUrl;
	});
}
