/**
 * ImageDecoder - 高性能图片解码模块
 * 使用 OffscreenCanvas 在 Worker 中解码，避免阻塞主线程
 */

// Worker 解码池
let decoderWorker: Worker | null = null;
let pendingDecodes = new Map<string, { resolve: (result: DecodedImage) => void; reject: (error: Error) => void }>();
let decodeId = 0;

export interface DecodedImage {
	imageBitmap: ImageBitmap;
	width: number;
	height: number;
	originalSize: number;
}

export interface DecodeOptions {
	maxWidth?: number;
	maxHeight?: number;
	quality?: 'low' | 'medium' | 'high';
}

/**
 * 获取或创建解码 Worker
 */
function getDecoderWorker(): Worker {
	if (!decoderWorker) {
		const workerCode = `
			self.onmessage = async (e) => {
				const { id, blob, options } = e.data;
				try {
					// 使用 createImageBitmap 在 Worker 中解码
					const bitmap = await createImageBitmap(blob, {
						resizeQuality: options?.quality || 'medium',
						premultiplyAlpha: 'none'
					});
					
					self.postMessage({
						id,
						success: true,
						width: bitmap.width,
						height: bitmap.height,
						originalSize: blob.size
					}, [bitmap]); // Transfer bitmap
				} catch (error) {
					self.postMessage({
						id,
						success: false,
						error: error.message
					});
				}
			};
		`;
		const blob = new Blob([workerCode], { type: 'application/javascript' });
		decoderWorker = new Worker(URL.createObjectURL(blob));
		
		decoderWorker.onmessage = (e) => {
			const { id, success, error, width, height, originalSize } = e.data;
			const pending = pendingDecodes.get(id);
			if (pending) {
				pendingDecodes.delete(id);
				if (success) {
					// 从 transferable 中获取 ImageBitmap
					const bitmap = e.data as unknown as ImageBitmap;
					pending.resolve({
						imageBitmap: bitmap,
						width,
						height,
						originalSize
					});
				} else {
					pending.reject(new Error(error));
				}
			}
		};
	}
	return decoderWorker;
}

/**
 * 在 Worker 中解码图片（不阻塞主线程）
 */
export async function decodeImageInWorker(blob: Blob, options?: DecodeOptions): Promise<DecodedImage> {
	// 如果 Worker 不可用，回退到主线程
	if (typeof Worker === 'undefined') {
		return decodeImageMainThread(blob, options);
	}

	const id = `decode-${++decodeId}`;
	const worker = getDecoderWorker();

	return new Promise((resolve, reject) => {
		pendingDecodes.set(id, { resolve, reject });
		worker.postMessage({ id, blob, options });
		
		// 超时处理
		setTimeout(() => {
			if (pendingDecodes.has(id)) {
				pendingDecodes.delete(id);
				reject(new Error('Decode timeout'));
			}
		}, 30000); // 30 秒超时
	});
}

/**
 * 主线程解码（回退方案）
 */
export async function decodeImageMainThread(blob: Blob, options?: DecodeOptions): Promise<DecodedImage> {
	const bitmap = await createImageBitmap(blob, {
		resizeQuality: options?.quality || 'medium',
		premultiplyAlpha: 'none'
	});

	return {
		imageBitmap: bitmap,
		width: bitmap.width,
		height: bitmap.height,
		originalSize: blob.size
	};
}

/**
 * 快速获取图片尺寸（不完全解码）
 */
export async function getImageDimensionsFast(blob: Blob): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(blob);
		const img = new Image();
		
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve({ width: img.naturalWidth, height: img.naturalHeight });
		};
		
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Failed to get image dimensions'));
		};
		
		// 只需要获取尺寸，不需要完整解码
		img.decoding = 'async';
		img.src = url;
	});
}

/**
 * 预解码多张图片（批量处理）
 */
export async function batchDecodeImages(
	blobs: Array<{ pageIndex: number; blob: Blob }>,
	options?: DecodeOptions
): Promise<Map<number, DecodedImage>> {
	const results = new Map<number, DecodedImage>();
	
	// 并行解码（限制并发数）
	const concurrency = navigator.hardwareConcurrency || 4;
	const chunks: Array<Array<{ pageIndex: number; blob: Blob }>> = [];
	
	for (let i = 0; i < blobs.length; i += concurrency) {
		chunks.push(blobs.slice(i, i + concurrency));
	}
	
	for (const chunk of chunks) {
		const promises = chunk.map(async ({ pageIndex, blob }) => {
			try {
				const decoded = await decodeImageInWorker(blob, options);
				return { pageIndex, decoded };
			} catch (error) {
				console.warn(`Failed to decode page ${pageIndex}:`, error);
				return null;
			}
		});
		
		const chunkResults = await Promise.all(promises);
		for (const result of chunkResults) {
			if (result) {
				results.set(result.pageIndex, result.decoded);
			}
		}
	}
	
	return results;
}

/**
 * 清理解码器资源
 */
export function cleanupDecoder(): void {
	if (decoderWorker) {
		decoderWorker.terminate();
		decoderWorker = null;
	}
	pendingDecodes.clear();
}
