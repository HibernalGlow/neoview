/**
 * NeoView - FS API (原 Image API)
 * 图像加载相关的前端 API 封装
 * 全面使用 Python HTTP API
 */

import { PYTHON_API_BASE } from './config';
import { apiGet } from './http-bridge';
import type { FsItem } from '$lib/types';
import { createImageTraceId, logImageTrace } from '$lib/utils/imageTrace';

export interface LoadImageOptions {
	traceId?: string;
	pageIndex?: number;
	bookPath?: string;
}

/**
 * 加载图片为 Object URL
 */
export async function loadImage(path: string, options: LoadImageOptions = {}): Promise<string> {
	const { blob } = await loadImageAsBlob(path, options);
	return URL.createObjectURL(blob);
}

/**
 * 加载图片为 Blob
 */
export async function loadImageAsBlob(path: string, options: LoadImageOptions = {}): Promise<{ blob: Blob; traceId: string }> {
	const traceId = options.traceId ?? createImageTraceId('fs', options.pageIndex);
	logImageTrace(traceId, 'loading image via HTTP API', { path, pageIndex: options.pageIndex, bookPath: options.bookPath });

	const url = `${PYTHON_API_BASE}/file?path=${encodeURIComponent(path)}`;
	const response = await fetch(url);
	
	if (!response.ok) {
		throw new Error(`Image loading failed: ${response.status}`);
	}
	
	const blob = await response.blob();
	logImageTrace(traceId, 'blob fetched', { size: blob.size });

	return { blob, traceId };
}

export async function getImageDimensions(path: string): Promise<[number, number]> {
	const result = await apiGet<{ width: number; height: number }>('/dimensions', { path });
	return [result.width, result.height];
}

export async function generateThumbnail(
	path: string,
	maxWidth: number,
	maxHeight: number
): Promise<string> {
	// 返回缩略图 URL
	return `${PYTHON_API_BASE}/thumbnail?path=${encodeURIComponent(path)}&max_size=${Math.max(maxWidth, maxHeight)}`;
}

export async function getFileMetadata(path: string): Promise<FsItem> {
	return await apiGet<FsItem>('/file/info', { path });
}
