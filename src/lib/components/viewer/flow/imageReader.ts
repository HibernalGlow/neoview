/**
 * 图片读取模块
 * 负责从文件系统或压缩包读取图片数据
 * 
 * 【优化】
 * 1. 文件系统图片：使用 convertFileSrc (asset://) 直接访问，绕过 IPC
 * 2. 压缩包图片：解压到临时文件后使用 asset:// 协议访问
 */

import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { bookStore } from '$lib/stores/book.svelte';
import { createImageTraceId, logImageTrace } from '$lib/utils/imageTrace';

export interface ReadResult {
	blob: Blob;
	traceId: string;
}

/**
 * 读取页面图片为 Blob
 * 【优化】统一使用 asset:// 协议直接访问
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
		// 【关键优化】压缩包：解压到临时文件，然后用 asset:// 访问
		try {
			const tempPath = await invoke<string>('extract_image_to_temp', {
				archivePath: currentBook.path,
				filePath: pageInfo.path,
				traceId,
				pageIndex
			});
			
			logImageTrace(traceId, 'extracted to temp', { tempPath });
			
			const assetUrl = convertFileSrc(tempPath);
			const response = await fetch(assetUrl);
			if (!response.ok) {
				throw new Error(`Asset fetch failed: ${response.status}`);
			}
			blob = await response.blob();
		} catch (error) {
			// 回退到旧方式
			logImageTrace(traceId, 'extract failed, fallback to IPC', { error });
			const { loadImageFromArchiveAsBlob } = await import('$lib/api/filesystem');
			const result = await loadImageFromArchiveAsBlob(currentBook.path, pageInfo.path, {
				traceId,
				pageIndex
			});
			blob = result.blob;
		}
	} else {
		// 【关键优化】文件系统：使用 asset:// 协议直接获取，绕过 IPC 序列化
		try {
			const assetUrl = convertFileSrc(pageInfo.path);
			logImageTrace(traceId, 'using asset protocol', { assetUrl });
			
			const response = await fetch(assetUrl);
			if (!response.ok) {
				throw new Error(`Asset fetch failed: ${response.status}`);
			}
			blob = await response.blob();
		} catch (error) {
			// 回退到 IPC 方式
			logImageTrace(traceId, 'asset protocol failed, fallback to IPC', { error });
			const { loadImageAsBlob } = await import('$lib/api/fs');
			const result = await loadImageAsBlob(pageInfo.path, {
				traceId,
				pageIndex,
				bookPath: currentBook.path
			});
			blob = result.blob;
		}
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
