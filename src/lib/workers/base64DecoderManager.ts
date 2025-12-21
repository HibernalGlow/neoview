/**
 * Base64 解码管理器
 * 
 * 管理 Web Worker 进行 Base64 解码，避免阻塞主线程
 * 对于大数据（>100KB）性能提升明显
 */

interface PendingDecode {
	resolve: (result: ArrayBuffer) => void;
	reject: (error: Error) => void;
}

interface DecodeResponse {
	id: string;
	success: boolean;
	data?: ArrayBuffer;
	error?: string;
}

// 阈值：超过此大小使用 Worker 解码
const WORKER_THRESHOLD = 100 * 1024; // 100KB（base64 长度）

class Base64DecoderManager {
	private worker: Worker | null = null;
	private pending = new Map<string, PendingDecode>();
	private idCounter = 0;
	private initPromise: Promise<void> | null = null;
	private initFailed = false;

	/**
	 * 初始化 Worker
	 */
	private async init(): Promise<void> {
		if (this.worker) return;
		if (this.initFailed) throw new Error('Worker init failed');

		if (!this.initPromise) {
			this.initPromise = new Promise((resolve, reject) => {
				try {
					this.worker = new Worker(
						new URL('./base64Decoder.worker.ts', import.meta.url),
						{ type: 'module' }
					);

					this.worker.onmessage = (event: MessageEvent<DecodeResponse>) => {
						const { id, success, data, error } = event.data;
						const pending = this.pending.get(id);
						if (pending) {
							this.pending.delete(id);
							if (success && data) {
								pending.resolve(data);
							} else {
								pending.reject(new Error(error || 'Unknown decode error'));
							}
						}
					};

					this.worker.onerror = (error) => {
						console.error('[Base64Decoder] Worker error:', error);
					};

					resolve();
				} catch (error) {
					this.initFailed = true;
					console.warn('[Base64Decoder] Failed to create Worker:', error);
					reject(error);
				}
			});
		}

		return this.initPromise;
	}

	/**
	 * 在 Worker 中解码 Base64
	 */
	private async decodeInWorker(base64: string, mimeType?: string): Promise<ArrayBuffer> {
		await this.init();

		if (!this.worker) {
			throw new Error('Worker not available');
		}

		const id = `b64-${++this.idCounter}`;

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				if (this.pending.has(id)) {
					this.pending.delete(id);
					// 超时回退到主线程
					this.decodeInMainThread(base64, mimeType).then(resolve).catch(reject);
				}
			}, 10000); // 10秒超时

			this.pending.set(id, {
				resolve: (result) => {
					clearTimeout(timeout);
					resolve(result);
				},
				reject: (error) => {
					clearTimeout(timeout);
					reject(error);
				},
			});

			this.worker!.postMessage({ id, base64, mimeType });
		});
	}

	/**
	 * 主线程解码（使用 fetch + data URL）
	 */
	private async decodeInMainThread(base64: string, mimeType = 'application/octet-stream'): Promise<ArrayBuffer> {
		const response = await fetch(`data:${mimeType};base64,${base64}`);
		return response.arrayBuffer();
	}

	/**
	 * 同步解码（小数据用）
	 */
	private decodeSync(base64: string): ArrayBuffer {
		const binaryString = atob(base64);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return bytes.buffer;
	}

	/**
	 * 解码 Base64 字符串
	 * 自动选择最优策略：
	 * - 小数据（<100KB）：主线程异步解码
	 * - 大数据（>=100KB）：Worker 解码
	 */
	async decode(base64: string, mimeType?: string): Promise<ArrayBuffer> {
		// 小数据直接在主线程解码（避免 Worker 通信开销）
		if (base64.length < WORKER_THRESHOLD) {
			return this.decodeInMainThread(base64, mimeType);
		}

		// 大数据尝试使用 Worker
		try {
			return await this.decodeInWorker(base64, mimeType);
		} catch {
			// Worker 失败，回退到主线程
			return this.decodeInMainThread(base64, mimeType);
		}
	}

	/**
	 * 同步解码（仅用于必须同步的场景）
	 */
	decodeSync2(base64: string): ArrayBuffer {
		return this.decodeSync(base64);
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
		this.initFailed = false;
	}
}

// 单例
export const base64DecoderManager = new Base64DecoderManager();

/**
 * 便捷函数：解码 Base64 字符串为 ArrayBuffer
 * 自动选择最优解码策略
 */
export async function decodeBase64(base64: string, mimeType?: string): Promise<ArrayBuffer> {
	return base64DecoderManager.decode(base64, mimeType);
}

/**
 * 便捷函数：解码 Base64 字符串为 Blob
 */
export async function decodeBase64ToBlob(base64: string, mimeType = 'application/octet-stream'): Promise<Blob> {
	const buffer = await base64DecoderManager.decode(base64, mimeType);
	return new Blob([buffer], { type: mimeType });
}
