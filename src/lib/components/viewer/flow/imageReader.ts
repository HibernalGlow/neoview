/**
 * 图片读取模块
 * 负责从文件系统或压缩包读取图片数据
 * 
 * 【纯内存方案】
 * 1. 文件系统图片：使用 asset:// 协议（浏览器自动缓存）
 * 2. 压缩包图片：使用二进制 IPC（无 JSON 序列化开销）
 * 3. 所有数据加载后存入 BlobCache，后续直接从内存读取
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import { bookStore } from '$lib/stores/book.svelte';
import { createImageTraceId, logImageTrace } from '$lib/utils/imageTrace';

export interface ReadResult {
	blob: Blob;
	traceId: string;
}

// 预解压相关（可选优化，保留接口兼容）
export async function preExtractArchive(_archivePath: string): Promise<string | null> {
	// 简化：不再预解压到文件，直接使用内存方案
	return null;
}

export function clearExtractCache(): void {
	// 无需清理
}

/**
 * 读取页面图片为 Blob
 * 【纯内存方案】优先使用最快的方式获取数据到内存
 */
export async function readPageBlob(pageIndex: number): Promise<ReadResult> {
	const currentBook = bookStore.currentBook;
	const pageInfo = currentBook?.pages[pageIndex];

	if (!pageInfo || !currentBook) {
		throw new Error(`页面 ${pageIndex} 不存在`);
	}

	const traceId = createImageTraceId(currentBook.type ?? 'fs', pageIndex);
	logImageTrace(traceId, 'readPageBlob start', {
		pageIndex,
		path: pageInfo.path,
		bookType: currentBook.type
	});

	let blob: Blob;

	if (currentBook.type === 'archive') {
		// 压缩包：使用二进制 IPC（最快的首次加载）
		const { loadImageFromArchiveAsBlob } = await import('$lib/api/filesystem');
		const result = await loadImageFromArchiveAsBlob(currentBook.path, pageInfo.path, {
			traceId,
			pageIndex
		});
		blob = result.blob;
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

	return { blob, traceId };
}

/**
 * 获取图片尺寸
 */
export async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
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
 * 创建缩略图 DataURL
 */
export async function createThumbnailDataURL(blob: Blob, height: number = 120): Promise<string> {
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
