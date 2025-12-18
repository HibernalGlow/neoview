/**
 * 图片读取模块
 * 负责从文件系统或压缩包读取图片数据
 * 
 * 【HTTP 方案】
 * 统一通过 Python HTTP API 获取图片 blob
 * 不再依赖 Tauri IPC
 */

import { getFileUrl as convertFileSrc, getArchiveFileUrl as convertArchiveFileSrc } from '$lib/api/http-bridge';
import { bookStore } from '$lib/stores/book.svelte';
import { loadModeStore } from '$lib/stores/loadModeStore.svelte';
import { infoPanelStore, type LatencyTrace } from '$lib/stores/infoPanel.svelte';
import { pipelineLatencyStore } from '$lib/stores/pipelineLatency.svelte';
import { createImageTraceId, logImageTrace } from '$lib/utils/imageTrace';
import { PYTHON_API_BASE } from '$lib/api/config';

export interface ReadResult {
	blob: Blob;
	traceId: string;
}

// 预加载状态跟踪
let lastPreloadedPage = -1;
const PRELOAD_RANGE = 5;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function preExtractArchive(_archivePath: string): Promise<string | null> {
	return null;
}

export function clearExtractCache(): void {
	lastPreloadedPage = -1;
}

/**
 * 触发并行预加载邻近页面
 */
async function triggerParallelPreload(currentPage: number): Promise<void> {
	const currentBook = bookStore.currentBook;
	if (!currentBook || currentBook.type !== 'archive') return;
	
	if (Math.abs(currentPage - lastPreloadedPage) < 3) return;
	lastPreloadedPage = currentPage;
	
	const totalPages = currentBook.pages.length;
	const startPage = Math.max(0, currentPage - PRELOAD_RANGE);
	const endPage = Math.min(totalPages - 1, currentPage + PRELOAD_RANGE);
	
	const pagePaths: string[] = [];
	for (let i = startPage; i <= endPage; i++) {
		if (i !== currentPage && currentBook.pages[i]) {
			pagePaths.push(currentBook.pages[i].path);
		}
	}
	
	if (pagePaths.length === 0) return;
	
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
	updateLatencyTrace?: boolean;
}

/**
 * 读取页面图片为 Blob
 * 统一通过 HTTP API 获取
 */
export async function readPageBlob(pageIndex: number, options: ReadPageOptions = {}): Promise<ReadResult> {
	const { updateLatencyTrace = true } = options;
	const startTime = performance.now();
	const currentBook = bookStore.currentBook;
	
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

	const loadStart = performance.now();
	let url: string;

	if (currentBook.type === 'archive') {
		// 压缩包：通过 HTTP API 提取
		url = convertArchiveFileSrc(currentBook.path, pageInfo.path);
	} else if (currentBook.type === 'epub') {
		// EPUB：通过专门的 EPUB API
		url = `${PYTHON_API_BASE}/epub/page?path=${encodeURIComponent(currentBook.path)}&page=${encodeURIComponent(pageInfo.path)}`;
	} else {
		// 文件系统：通过 HTTP API 获取
		url = convertFileSrc(pageInfo.path);
	}

	logImageTrace(traceId, 'fetching from HTTP API', { url });
	
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`图片加载失败: ${response.status}`);
	}
	const blob = await response.blob();
	
	const loadMs = performance.now() - loadStart;
	const totalMs = performance.now() - startTime;
	
	logImageTrace(traceId, 'readPageBlob complete', { size: blob.size, loadMs, totalMs });

	if (updateLatencyTrace) {
		const latencyTrace: LatencyTrace = {
			dataSource: 'http',
			renderMode: loadModeStore.isImgMode ? 'img' : 'canvas',
			loadMs,
			totalMs,
			cacheHit: false,
			dataSize: blob.size,
			traceId
		};
		infoPanelStore.setLatencyTrace(latencyTrace);
	}

	// 触发并行预加载
	triggerParallelPreload(pageIndex);

	return { blob, traceId };
}

/**
 * 获取图片尺寸
 */
export async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
	try {
		const { decodeImageInWorker } = await import('$lib/workers/imageDecoderManager');
		const result = await decodeImageInWorker(blob);
		result.bitmap.close();
		return { width: result.width, height: result.height };
	} catch {
		// Worker 失败，回退到主线程
	}

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
 * 预解码图片到 ImageBitmap
 */
export async function preDecodeImage(blob: Blob): Promise<ImageBitmap | null> {
	try {
		const { decodeImageInWorker } = await import('$lib/workers/imageDecoderManager');
		const result = await decodeImageInWorker(blob);
		return result.bitmap;
	} catch {
		try {
			return await createImageBitmap(blob);
		} catch {
			return null;
		}
	}
}

/**
 * V2 版本 - 使用 PageManager（兼容接口）
 */
export async function readPageBlobV2(
	pageIndex: number, 
	options: ReadPageOptions & { isCurrentPage?: boolean } = {}
): Promise<ReadResult> {
	const { updateLatencyTrace = true, isCurrentPage = true } = options;
	const startTime = performance.now();
	const traceId = createImageTraceId('pm', pageIndex);
	
	logImageTrace(traceId, 'readPageBlobV2 start', { pageIndex, isCurrentPage });
	
	const currentBook = bookStore.currentBook;
	if (!currentBook) {
		throw new Error('没有打开的书籍');
	}
	
	const pageInfo = currentBook.pages[pageIndex];
	if (!pageInfo) {
		throw new Error(`页面 ${pageIndex} 不存在`);
	}

	const loadStart = performance.now();
	let url: string;

	if (currentBook.type === 'archive') {
		url = convertArchiveFileSrc(currentBook.path, pageInfo.path);
	} else {
		url = convertFileSrc(pageInfo.path);
	}

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`图片加载失败: ${response.status}`);
	}
	const blob = await response.blob();
	
	const loadMs = performance.now() - loadStart;
	const totalMs = performance.now() - startTime;
	
	logImageTrace(traceId, 'readPageBlobV2 complete', { size: blob.size, loadMs, totalMs });
	
	// 记录到 pipelineLatencyStore
	pipelineLatencyStore.record({
		timestamp: Date.now(),
		pageIndex,
		traceId,
		bookSyncMs: 0,
		backendLoadMs: loadMs,
		ipcTransferMs: loadMs,
		blobCreateMs: 0,
		totalMs,
		dataSize: blob.size,
		cacheHit: false,
		isCurrentPage,
		source: isCurrentPage ? 'current' : 'preload'
	});
	
	if (updateLatencyTrace) {
		const latencyTrace: LatencyTrace = {
			dataSource: 'http',
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
}

/**
 * 创建缩略图 DataURL
 */
export async function createThumbnailDataURL(blob: Blob, height: number = 120): Promise<string> {
	if (blob.size < 100 * 1024) {
		return new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = () => reject(new Error('Failed to read blob'));
			reader.readAsDataURL(blob);
		});
	}

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
