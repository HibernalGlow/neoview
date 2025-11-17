/**
 * NeoView - Image API
 * 图像加载相关的前端 API 封装
 */

import { invoke } from '@tauri-apps/api/core';
import type { FsItem } from '$lib/types';

export async function loadImage(path: string): Promise<string> {
	const binaryData = await invoke<number[]>('load_image', { path });
	const blob = new Blob([new Uint8Array(binaryData)]);
	return URL.createObjectURL(blob);
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
