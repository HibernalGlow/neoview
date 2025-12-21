/**
 * Base64 解码管理器
 * 
 * 使用 fast-base64 (WebAssembly + SIMD) 进行高速解码
 * 比原生 atob 快 10-30 倍，比 fetch + data URL 快 2-5 倍
 */

import { toBytes } from 'fast-base64';

/**
 * 解码 Base64 字符串为 ArrayBuffer
 * 使用 WebAssembly + SIMD 加速，性能最优
 */
export async function decodeBase64(base64: string, _mimeType?: string): Promise<ArrayBuffer> {
	const bytes = await toBytes(base64);
	return bytes.buffer;
}

/**
 * 解码 Base64 字符串为 Blob
 */
export async function decodeBase64ToBlob(base64: string, mimeType = 'application/octet-stream'): Promise<Blob> {
	const bytes = await toBytes(base64);
	return new Blob([bytes], { type: mimeType });
}

/**
 * 同步解码（回退方案，使用原生 atob）
 * 仅在 WASM 不可用时使用
 */
export function decodeBase64Sync(base64: string): ArrayBuffer {
	const binaryString = atob(base64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes.buffer;
}

// 兼容旧 API
export const base64DecoderManager = {
	decode: decodeBase64,
	decodeSync2: decodeBase64Sync,
	destroy: () => { /* no-op for fast-base64 */ }
};
