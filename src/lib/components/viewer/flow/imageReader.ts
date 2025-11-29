/**
 * 图片读取模块
 * 负责从文件系统或压缩包读取图片数据
 * 
 * 【优化】
 * 1. 文件系统图片：使用 convertFileSrc (asset://) 直接访问，绕过 IPC
 * 2. 压缩包图片：批量预解压到临时目录，后续直接用 asset:// 访问
 */

import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { bookStore } from '$lib/stores/book.svelte';
import { createImageTraceId, logImageTrace } from '$lib/utils/imageTrace';

export interface ReadResult {
	blob: Blob;
	traceId: string;
}

// 预解压目录缓存：archivePath -> extractedDir
const extractedDirCache = new Map<string, string>();
// 正在解压中的 Promise 缓存
const extractingPromises = new Map<string, Promise<string>>();

/**
 * 【新增】预解压压缩包到临时目录
 * 在切换到压缩包书籍时调用
 */
export async function preExtractArchive(archivePath: string): Promise<string | null> {
	// 已有缓存
	if (extractedDirCache.has(archivePath)) {
		return extractedDirCache.get(archivePath)!;
	}
	
	// 正在解压中
	if (extractingPromises.has(archivePath)) {
		return extractingPromises.get(archivePath)!;
	}
	
	// 开始批量解压
	const promise = invoke<string>('batch_extract_archive', { archivePath })
		.then(dir => {
			extractedDirCache.set(archivePath, dir);
			extractingPromises.delete(archivePath);
			console.log('📦 预解压完成:', archivePath, '->', dir);
			return dir;
		})
		.catch(err => {
			extractingPromises.delete(archivePath);
			console.warn('⚠️ 预解压失败:', archivePath, err);
			return null;
		});
	
	extractingPromises.set(archivePath, promise as Promise<string>);
	return promise;
}

/**
 * 清除预解压缓存（切换书籍时调用）
 */
export function clearExtractCache(): void {
	extractedDirCache.clear();
	// 不清除正在解压的 Promise，让它们完成
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
		// 【关键优化】压缩包：使用预解压目录
		const extractedDir = extractedDirCache.get(currentBook.path);
		
		if (extractedDir) {
			// 使用预解压的文件（文件名格式：00000.ext, 00001.ext, ...）
			try {
				// 获取文件扩展名
				const ext = pageInfo.path.split('.').pop() || 'jpg';
				const tempPath = `${extractedDir}/${String(pageIndex).padStart(5, '0')}.${ext}`;
				
				logImageTrace(traceId, 'using pre-extracted file', { tempPath });
				
				const assetUrl = convertFileSrc(tempPath);
				const response = await fetch(assetUrl);
				if (!response.ok) {
					throw new Error(`Asset fetch failed: ${response.status}`);
				}
				blob = await response.blob();
			} catch (error) {
				// 预解压文件访问失败，回退到单文件解压
				logImageTrace(traceId, 'pre-extracted file failed, fallback', { error });
				blob = await extractSingleImage(currentBook.path, pageInfo.path, traceId, pageIndex);
			}
		} else {
			// 没有预解压目录，使用单文件解压（同时触发后台预解压）
			preExtractArchive(currentBook.path); // 异步触发预解压
			blob = await extractSingleImage(currentBook.path, pageInfo.path, traceId, pageIndex);
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
 * 单文件解压（回退方案）
 */
async function extractSingleImage(archivePath: string, filePath: string, traceId: string, pageIndex: number): Promise<Blob> {
	try {
		const tempPath = await invoke<string>('extract_image_to_temp', {
			archivePath,
			filePath,
			traceId,
			pageIndex
		});
		
		logImageTrace(traceId, 'extracted to temp', { tempPath });
		
		const assetUrl = convertFileSrc(tempPath);
		const response = await fetch(assetUrl);
		if (!response.ok) {
			throw new Error(`Asset fetch failed: ${response.status}`);
		}
		return await response.blob();
	} catch (error) {
		// 最终回退到 IPC
		logImageTrace(traceId, 'extract failed, fallback to IPC', { error });
		const { loadImageFromArchiveAsBlob } = await import('$lib/api/filesystem');
		const result = await loadImageFromArchiveAsBlob(archivePath, filePath, {
			traceId,
			pageIndex
		});
		return result.blob;
	}
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
