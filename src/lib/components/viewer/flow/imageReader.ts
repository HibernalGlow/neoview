/**
 * 图片读取模块
 * 负责从文件系统或压缩包读取图片数据
 * 
 * 【优化】直接返回 Blob，避免 URL -> fetch -> Blob 的重复转换
 */

import { loadImageAsBlob } from '$lib/api/fs';
import { loadImageFromArchiveAsBlob } from '$lib/api/filesystem';
import { bookStore } from '$lib/stores/book.svelte';
import { createImageTraceId, logImageTrace } from '$lib/utils/imageTrace';

export interface ReadResult {
	blob: Blob;
	traceId: string;
}

/**
 * 读取页面图片为 Blob
 * 【优化】直接从后端获取 Blob，无需二次转换
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

	let result: { blob: Blob; traceId: string };

	if (currentBook.type === 'archive') {
		// 压缩包：直接获取 Blob
		result = await loadImageFromArchiveAsBlob(currentBook.path, pageInfo.path, {
			traceId,
			pageIndex
		});
	} else {
		// 文件系统：直接获取 Blob
		result = await loadImageAsBlob(pageInfo.path, {
			traceId,
			pageIndex,
			bookPath: currentBook.path
		});
	}

	logImageTrace(traceId, 'readPageBlob blob ready', { size: result.blob.size });

	return result;
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
