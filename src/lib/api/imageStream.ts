/**
 * 图片流式加载 API
 * 
 * 使用 Tauri Channel 实现大图片的流式传输
 * 边接收边解码，减少首字节延迟
 */

import { invoke, Channel } from '@tauri-apps/api/core';
import { toBytes } from 'fast-base64';

// ===== 类型定义 =====

/** 流式传输块 */
interface StreamChunk {
	type: 'chunk';
	index: number;
	total: number;
	data: string; // Base64
	size: number;
}

/** 传输完成 */
interface StreamComplete {
	type: 'complete';
	totalBytes: number;
	elapsedMs: number;
}

/** 传输错误 */
interface StreamError {
	type: 'error';
	message: string;
}

/** 流输出类型 */
type ImageStreamOutput = StreamChunk | StreamComplete | StreamError;

/** 流式加载选项 */
export interface StreamLoadOptions {
	/** 进度回调 */
	onProgress?: (loaded: number, total: number) => void;
	/** 首块回调（用于渐进式显示） */
	onFirstChunk?: (partialBlob: Blob) => void;
}

/** 流式加载结果 */
export interface StreamLoadResult {
	blob: Blob;
	totalBytes: number;
	elapsedMs: number;
}

// ===== 流式加载函数 =====

/**
 * 流式加载压缩包图片
 * 
 * 对于大文件，边接收边解码，实现渐进式加载
 * 首块数据可以立即显示，提升用户体验
 */
export async function streamImageFromArchive(
	archivePath: string,
	filePath: string,
	options: StreamLoadOptions = {}
): Promise<StreamLoadResult> {
	return new Promise((resolve, reject) => {
		const chunks: Uint8Array[] = [];
		let totalChunks = 0;
		let receivedChunks = 0;
		let totalBytes = 0;

		// 创建 Channel 接收流数据
		const channel = new Channel<ImageStreamOutput>();

		channel.onmessage = async (output) => {
			if (output.type === 'chunk') {
				try {
					// 使用 fast-base64 解码
					const bytes = await toBytes(output.data);
					chunks[output.index] = bytes;
					receivedChunks++;
					totalChunks = output.total;

					// 进度回调
					if (options.onProgress) {
						const loaded = chunks.reduce((sum, c) => sum + (c?.length || 0), 0);
						options.onProgress(loaded, totalBytes || loaded * totalChunks / receivedChunks);
					}

					// 首块回调（用于渐进式显示）
					if (output.index === 0 && options.onFirstChunk) {
						const mimeType = getMimeTypeFromPath(filePath);
						const partialBlob = new Blob([bytes], { type: mimeType });
						options.onFirstChunk(partialBlob);
					}
				} catch (e) {
					console.error('[ImageStream] 解码块失败:', e);
				}
			} else if (output.type === 'complete') {
				// 合并所有块
				const allBytes = new Uint8Array(
					chunks.reduce((sum, c) => sum + (c?.length || 0), 0)
				);
				let offset = 0;
				for (const chunk of chunks) {
					if (chunk) {
						allBytes.set(chunk, offset);
						offset += chunk.length;
					}
				}

				const mimeType = getMimeTypeFromPath(filePath);
				const blob = new Blob([allBytes], { type: mimeType });

				resolve({
					blob,
					totalBytes: output.totalBytes,
					elapsedMs: output.elapsedMs,
				});
			} else if (output.type === 'error') {
				reject(new Error(output.message));
			}
		};

		// 调用后端命令
		invoke('stream_image_from_archive', {
			archivePath,
			filePath,
			channel,
		}).catch(reject);
	});
}

/**
 * 根据文件扩展名获取 MIME type
 */
function getMimeTypeFromPath(filePath: string): string {
	const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
	const mimeTypes: Record<string, string> = {
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		gif: 'image/gif',
		webp: 'image/webp',
		avif: 'image/avif',
		bmp: 'image/bmp',
		ico: 'image/x-icon',
		tiff: 'image/tiff',
		tif: 'image/tiff',
		svg: 'image/svg+xml',
		jxl: 'image/png', // JXL 在后端已转换为 PNG
	};
	return mimeTypes[ext] || 'image/jpeg';
}

/**
 * 检查是否应该使用流式传输
 */
export async function shouldUseStream(size: number): Promise<boolean> {
	return invoke<boolean>('should_use_stream', { size });
}
