/**
 * NeoView - Image API
 * 图像加载相关的前端 API 封装
 */

import { invoke } from '@tauri-apps/api/core';

export async function loadImage(path: string): Promise<string> {
	return await invoke<string>('load_image', { path });
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
