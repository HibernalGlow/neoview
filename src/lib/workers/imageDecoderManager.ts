/**
 * Image Decoder Manager
 * 管理 Web Worker 池进行图片解码
 */

interface PendingDecode {
	resolve: (result: DecodeResult) => void;
	reject: (error: Error) => void;
}

export interface DecodeResult {
	bitmap: ImageBitmap;
	width: number;
	height: number;
}

class ImageDecoderManager {
	private worker: Worker | null = null;
	private pending = new Map<string, PendingDecode>();
	private idCounter = 0;
	private initPromise: Promise<void> | null = null;

	/**
	 * 初始化 Worker
	 */
	private async init(): Promise<void> {
		if (this.worker) return;
		if (this.initPromise) return this.initPromise;

		this.initPromise = new Promise((resolve, reject) => {
			try {
				// 使用 Vite 的 Worker 导入语法
				this.worker = new Worker(
					new URL('./imageDecoder.worker.ts', import.meta.url),
					{ type: 'module' }
				);

				this.worker.onmessage = (event) => {
					const { id, success, bitmap, width, height, error } = event.data;
					const pending = this.pending.get(id);
					if (!pending) return;

					this.pending.delete(id);

					if (success && bitmap) {
						pending.resolve({ bitmap, width, height });
					} else {
						pending.reject(new Error(error || 'Unknown decode error'));
					}
				};

				this.worker.onerror = (error) => {
					console.error('ImageDecoder Worker error:', error);
				};

				resolve();
			} catch (error) {
				console.warn('Failed to create ImageDecoder Worker:', error);
				reject(error);
			}
		});

		return this.initPromise;
	}

	/**
	 * 在 Worker 中解码图片
	 * 如果 Worker 不可用，回退到主线程
	 */
	async decode(blob: Blob): Promise<DecodeResult> {
		try {
			await this.init();
		} catch {
			// Worker 初始化失败，使用主线程解码
			return this.decodeInMainThread(blob);
		}

		if (!this.worker) {
			return this.decodeInMainThread(blob);
		}

		const id = `decode-${++this.idCounter}`;

		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });

			// 设置超时
			const timeout = setTimeout(() => {
				if (this.pending.has(id)) {
					this.pending.delete(id);
					// 超时后使用主线程解码
					this.decodeInMainThread(blob).then(resolve).catch(reject);
				}
			}, 5000);

			// 发送到 Worker
			this.worker!.postMessage({ id, blob });

			// 清除超时（在 resolve/reject 后）
			const originalResolve = this.pending.get(id)?.resolve;
			const originalReject = this.pending.get(id)?.reject;
			if (originalResolve && originalReject) {
				this.pending.set(id, {
					resolve: (result) => {
						clearTimeout(timeout);
						originalResolve(result);
					},
					reject: (error) => {
						clearTimeout(timeout);
						originalReject(error);
					}
				});
			}
		});
	}

	/**
	 * 主线程解码（回退方案）
	 */
	private async decodeInMainThread(blob: Blob): Promise<DecodeResult> {
		const bitmap = await createImageBitmap(blob);
		return {
			bitmap,
			width: bitmap.width,
			height: bitmap.height
		};
	}

	/**
	 * 销毁 Worker
	 */
	destroy(): void {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
		this.pending.clear();
		this.initPromise = null;
	}
}

// 单例
export const imageDecoderManager = new ImageDecoderManager();

/**
 * 便捷函数：在 Worker 中解码图片
 */
export async function decodeImageInWorker(blob: Blob): Promise<DecodeResult> {
	return imageDecoderManager.decode(blob);
}
