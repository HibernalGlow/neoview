/**
 * 图片读取模块
 * 负责从文件系统或压缩包读取图片数据
 */

import { loadImage } from '$lib/api/fs';
import { loadImageFromArchive } from '$lib/api/filesystem';
import { bookStore } from '$lib/stores/book.svelte';
import { createImageTraceId, logImageTrace } from '$lib/utils/imageTrace';

export interface ReadResult {
	blob: Blob;
	traceId: string;
}

/**
 * 读取页面图片为 Blob
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

	let base64Data: string;

	if (currentBook.type === 'archive') {
		base64Data = await loadImageFromArchive(currentBook.path, pageInfo.path, {
			traceId,
			pageIndex
		});
	} else {
		base64Data = await loadImage(pageInfo.path, {
			traceId,
			pageIndex,
			bookPath: currentBook.path
		});
	}

	logImageTrace(traceId, 'readPageBlob fetch blob url');

	// 将 base64 转换为 Blob
	const response = await fetch(base64Data);
	const blob = await response.blob();

	logImageTrace(traceId, 'readPageBlob blob decoded', { size: blob.size });

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
