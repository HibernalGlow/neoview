/**
 * Image Decoder Manager
 * 管理 Web Worker 池进行图片解码
 * 
 * 【性能优化】
 * - 使用 Worker 池（默认 4 个）并行解码
 * - 支持大图片自动缩放解码，减少内存和解码时间
 * - 轮询分配任务，避免单 Worker 过载
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

export interface DecodeOptions {
	/** 最大宽度（超过则缩放） */
	maxWidth?: number;
	/** 最大高度（超过则缩放） */
	maxHeight?: number;
}

// Worker 池大小（根据 CPU 核心数动态调整）
const WORKER_POOL_SIZE = Math.min(navigator.hardwareConcurrency || 4, 6);

class ImageDecoderManager {
	private workers: Worker[] = [];
	private pending = new Map<string, PendingDecode>();
	private idCounter = 0;
	private initPromise: Promise<void> | null = null;
	// 轮询索引，用于分配任务到不同 Worker
	private roundRobinIndex = 0;
	// 每个 Worker 的当前任务数
	private workerLoad: number[] = [];

	/**
	 * 初始化 Worker 池
	 */
	private async init(): Promise<void> {
		if (this.workers.length > 0) return;
		if (this.initPromise) return this.initPromise;

		this.initPromise = new Promise((resolve, reject) => {
			try {
				for (let i = 0; i < WORKER_POOL_SIZE; i++) {
					const worker = new Worker(
						new URL('./imageDecoder.worker.ts', import.meta.url),
						{ type: 'module' }
					);

					worker.onmessage = (event) => {
						const { id, success, bitmap, width, height, error, workerIndex } = event.data;
						const pending = this.pending.get(id);
						if (!pending) return;

						this.pending.delete(id);
						// 减少对应 Worker 的负载计数
						if (typeof workerIndex === 'number' && this.workerLoad[workerIndex] > 0) {
							this.workerLoad[workerIndex]--;
						}

						if (success && bitmap) {
							pending.resolve({ bitmap, width, height });
						} else {
							pending.reject(new Error(error || 'Unknown decode error'));
						}
					};

					worker.onerror = (error) => {
						console.error(`ImageDecoder Worker ${i} error:`, error);
					};

					this.workers.push(worker);
					this.workerLoad.push(0);
				}

				console.log(`🖼️ ImageDecoder Worker 池已初始化: ${WORKER_POOL_SIZE} 个 Worker`);
				resolve();
			} catch (error) {
				console.warn('Failed to create ImageDecoder Worker pool:', error);
				reject(error);
			}
		});

		return this.initPromise;
	}

	/**
	 * 选择负载最低的 Worker
	 */
	private selectWorker(): number {
		// 找到负载最低的 Worker
		let minLoad = Infinity;
		let minIndex = 0;
		for (let i = 0; i < this.workerLoad.length; i++) {
			if (this.workerLoad[i] < minLoad) {
				minLoad = this.workerLoad[i];
				minIndex = i;
			}
		}
		return minIndex;
	}

	/**
	 * 在 Worker 中解码图片
	 * 如果 Worker 不可用，回退到主线程
	 */
	async decode(blob: Blob, options: DecodeOptions = {}): Promise<DecodeResult> {
		try {
			await this.init();
		} catch {
			// Worker 初始化失败，使用主线程解码
			return this.decodeInMainThread(blob, options);
		}

		if (this.workers.length === 0) {
			return this.decodeInMainThread(blob, options);
		}

		const id = `decode-${++this.idCounter}`;
		const workerIndex = this.selectWorker();
		const worker = this.workers[workerIndex];

		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.workerLoad[workerIndex]++;

			// 设置超时（大图片可能需要更长时间）
			const timeout = setTimeout(() => {
				if (this.pending.has(id)) {
					this.pending.delete(id);
					this.workerLoad[workerIndex]--;
					// 超时后使用主线程解码
					this.decodeInMainThread(blob, options).then(resolve).catch(reject);
				}
			}, 10000); // 10 秒超时

			// 发送到 Worker
			worker.postMessage({ 
				id, 
				blob, 
				workerIndex,
				maxWidth: options.maxWidth,
				maxHeight: options.maxHeight
			});

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
	 * 支持大图片缩放
	 */
	private async decodeInMainThread(blob: Blob, options: DecodeOptions = {}): Promise<DecodeResult> {
		const { maxWidth, maxHeight } = options;
		
		// 如果指定了最大尺寸，使用缩放解码
		if (maxWidth || maxHeight) {
			const bitmap = await createImageBitmap(blob, {
				resizeWidth: maxWidth,
				resizeHeight: maxHeight,
				resizeQuality: 'medium'
			});
			return {
				bitmap,
				width: bitmap.width,
				height: bitmap.height
			};
		}
		
		const bitmap = await createImageBitmap(blob);
		return {
			bitmap,
			width: bitmap.width,
			height: bitmap.height
		};
	}

	/**
	 * 获取 Worker 池状态
	 */
	getStatus(): { poolSize: number; loads: number[]; pendingCount: number } {
		return {
			poolSize: this.workers.length,
			loads: [...this.workerLoad],
			pendingCount: this.pending.size
		};
	}

	/**
	 * 销毁 Worker 池
	 */
	destroy(): void {
		for (const worker of this.workers) {
			worker.terminate();
		}
		this.workers = [];
		this.workerLoad = [];
		this.pending.clear();
		this.initPromise = null;
	}
}

// 单例
export const imageDecoderManager = new ImageDecoderManager();

/**
 * 便捷函数：在 Worker 中解码图片
 */
export async function decodeImageInWorker(blob: Blob, options: DecodeOptions = {}): Promise<DecodeResult> {
	return imageDecoderManager.decode(blob, options);
}

/**
 * 获取解码器状态（用于调试）
 */
export function getDecoderStatus() {
	return imageDecoderManager.getStatus();
}
