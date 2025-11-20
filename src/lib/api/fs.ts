/**
 * NeoView - Image API
 * 图像加载相关的前端 API 封装
 */

import { invoke } from '@tauri-apps/api/core';
import type { FsItem } from '$lib/types';
import { createImageTraceId, logImageTrace } from '$lib/utils/imageTrace';

export interface LoadImageOptions {
	traceId?: string;
	pageIndex?: number;
	bookPath?: string;
}

export async function loadImage(path: string, options: LoadImageOptions = {}): Promise<string> {
	const traceId = options.traceId ?? createImageTraceId('fs', options.pageIndex);
	logImageTrace(traceId, 'invoke load_image', { path, pageIndex: options.pageIndex, bookPath: options.bookPath });

	const binaryData = await invoke<number[]>('load_image', {
		path,
		traceId,
		pageIndex: options.pageIndex,
		bookPath: options.bookPath
	});

	logImageTrace(traceId, 'load_image resolved', { bytes: binaryData.length });

	const blob = new Blob([new Uint8Array(binaryData)]);
	const url = URL.createObjectURL(blob);

	logImageTrace(traceId, 'blob url created', { size: blob.size });

	return url;
}

export async function getImageDimensions(path: string): Promise<[number, number]> {
	return await invoke<[number, number]>('get_image_dimensions', { path });
}

export async function generateThumbnail(
	path: string,
	maxWidth: number,
	maxHeight: number
): Promise<string> {
	return await invoke<string>('generate_thumbnail', { path, maxWidth, maxHeight });
}

export async function getFileMetadata(path: string): Promise<FsItem> {
	return await invoke<FsItem>('get_file_metadata', { path });
}
