/**
 * 图片读取模块
 * 负责从文件系统或压缩包读取图片数据
 * 
 * 【双模式支持】
 * 1. IPC 模式：二进制 IPC + Blob（内存缓存）
 * 2. Tempfile 模式：解压到临时文件 + asset:// 协议
 * 
 * 【优化】
 * - 并行预加载 ±5 页到后端缓存
 * - Web Worker 解码避免阻塞主线程
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import { invoke } from '@tauri-apps/api/core';
import { bookStore } from '$lib/stores/book.svelte';
import { loadModeStore } from '$lib/stores/loadModeStore.svelte';
import { createImageTraceId, logImageTrace } from '$lib/utils/imageTrace';

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

// 预解压相关（可选优化，保留接口兼容）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function preExtractArchive(_archivePath: string): Promise<string | null> {
	// 简化：不再预解压到文件，直接使用内存方案
	return null;
}

export function clearExtractCache(): void {
	// 重置预加载状态
	lastPreloadedPage = -1;
}

/**
 * 【优化】触发并行预加载邻近页面
 * 异步执行，不阻塞当前加载
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

/**
 * 读取页面图片为 Blob
 * 【纯内存方案】优先使用最快的方式获取数据到内存
 */
export async function readPageBlob(pageIndex: number): Promise<ReadResult> {
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

	if (currentBook.type === 'archive') {
		const cacheKey = `${currentBook.path}::${pageInfo.path}`;
		
		// 检查 Tempfile 缓存
		const cached = tempfileCache.get(cacheKey);
		if (cached) {
			logImageTrace(traceId, 'tempfile cache hit', { cacheKey });
			blob = cached.blob;
		} else if (loadModeStore.isTempfileMode) {
			// Tempfile 模式：解压到临时文件 + asset:// 协议
			logImageTrace(traceId, 'using tempfile mode');
			
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
			const { loadImageFromArchiveAsBlob } = await import('$lib/api/filesystem');
			const result = await loadImageFromArchiveAsBlob(currentBook.path, pageInfo.path, {
				traceId,
				pageIndex
			});
			blob = result.blob;
		}
	} else {
		// 文件系统：使用 asset:// 协议
		const assetUrl = convertFileSrc(pageInfo.path);
		logImageTrace(traceId, 'using asset protocol', { assetUrl });
		
		const response = await fetch(assetUrl);
		if (!response.ok) {
			throw new Error(`Asset fetch failed: ${response.status}`);
		}
		blob = await response.blob();
	}

	logImageTrace(traceId, 'readPageBlob blob ready', { size: blob.size });

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
