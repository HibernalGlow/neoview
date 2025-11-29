/**
 * Image Worker - 图片加载和解码 Worker
 * 在独立线程中处理图片，避免阻塞主线程
 */

// Worker 消息类型
export interface WorkerRequest {
	id: string;
	type: 'decode';
	data: ArrayBuffer;
}

export interface WorkerResponse {
	id: string;
	type: 'decoded' | 'error';
	bitmap?: ImageBitmap;
	error?: string;
}

// Worker 代码（内联）
const workerCode = `
self.onmessage = async (e) => {
	const { id, type, data } = e.data;
	
	if (type === 'decode') {
		try {
			const blob = new Blob([data]);
			const bitmap = await createImageBitmap(blob);
			self.postMessage({ id, type: 'decoded', bitmap }, [bitmap]);
		} catch (error) {
			self.postMessage({ id, type: 'error', error: error.message });
		}
	}
};
`;

// Worker 管理器
class ImageWorkerManager {
	private worker: Worker | null = null;
	private pendingRequests = new Map<string, {
		resolve: (bitmap: ImageBitmap) => void;
		reject: (error: Error) => void;
	}>();
	private requestId = 0;

	constructor() {
		this.initWorker();
	}

	private initWorker(): void {
		if (typeof Worker === 'undefined') return;

		const blob = new Blob([workerCode], { type: 'application/javascript' });
		const url = URL.createObjectURL(blob);
		this.worker = new Worker(url);
		URL.revokeObjectURL(url);

		this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
			const { id, type, bitmap, error } = e.data;
			const pending = this.pendingRequests.get(id);
			if (!pending) return;

			this.pendingRequests.delete(id);
			if (type === 'decoded' && bitmap) {
				pending.resolve(bitmap);
			} else {
				pending.reject(new Error(error || 'Unknown error'));
			}
		};

		this.worker.onerror = (e) => {
			console.error('Image Worker error:', e);
		};
	}

	/**
	 * 在 Worker 中解码图片
	 */
	async decode(data: ArrayBuffer): Promise<ImageBitmap> {
		if (!this.worker) {
			// Fallback: 在主线程解码
			const blob = new Blob([data]);
			return createImageBitmap(blob);
		}

		const id = `req-${++this.requestId}`;
		return new Promise((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject });
			this.worker!.postMessage({ id, type: 'decode', data }, [data]);
		});
	}

	/**
	 * 取消所有待处理请求
	 */
	cancelAll(): void {
		for (const [id, pending] of this.pendingRequests) {
			pending.reject(new Error('Cancelled'));
		}
		this.pendingRequests.clear();
	}

	/**
	 * 销毁 Worker
	 */
	destroy(): void {
		this.cancelAll();
		this.worker?.terminate();
		this.worker = null;
	}
}

// 单例
let instance: ImageWorkerManager | null = null;

export function getImageWorker(): ImageWorkerManager {
	if (!instance) {
		instance = new ImageWorkerManager();
	}
	return instance;
}

export function resetImageWorker(): void {
	instance?.destroy();
	instance = null;
}
