/**
 * NeoView - Image API
 * 图像加载相关的前端 API 封装
 */

import { invoke } from '@tauri-apps/api/core';

export async function loadImage(path: string): Promise<ArrayBuffer> {
	const base64 = await invoke<string>('load_image', { path });
	// 移除 data URL 前缀
	const base64Data = base64.replace(/^data:[^;]+;base64,/, '');
	const binaryString = atob(base64Data);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes.buffer;
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
