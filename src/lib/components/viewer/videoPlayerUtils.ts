/**
 * videoPlayerUtils.ts
 * VideoPlayer 组件的工具函数和常量
 */

// ==================== 常量 ====================

/** 帧缓存精度（秒） */
export const CACHE_PRECISION = 0.5;

/** 最大缓存帧数 */
export const MAX_CACHE_SIZE = 100;

/** 缩略图宽度 */
export const PREVIEW_WIDTH = 160;

// ==================== 时间格式化 ====================

/**
 * 格式化时间（秒 -> m:ss）
 */
export function formatTime(seconds: number): string {
	if (!isFinite(seconds)) return '0:00';
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 格式化时长（秒 -> mm:ss 或 h:mm:ss）
 */
export function formatDuration(seconds: number): string {
	if (!isFinite(seconds)) return '0:00';
	const hours = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);
	if (hours > 0) {
		return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	}
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ==================== 帧缓存管理 ====================

/**
 * 获取缓存键（按精度取整）
 */
export function getCacheKey(time: number): number {
	return Math.round(time / CACHE_PRECISION) * CACHE_PRECISION;
}

/**
 * 帧缓存管理器
 */
export class FrameCacheManager {
	private cache = new Map<number, string>();
	private tempVideoElement: HTMLVideoElement | null = null;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private isGenerating = false;

	/**
	 * 获取缓存的帧
	 */
	getCachedFrame(time: number): string | undefined {
		const key = getCacheKey(time);
		return this.cache.get(key);
	}

	/**
	 * 存储帧到缓存
	 */
	storeFrame(time: number, dataUrl: string): void {
		const key = getCacheKey(time);
		// 控制缓存大小
		if (this.cache.size >= MAX_CACHE_SIZE) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey !== undefined) this.cache.delete(firstKey);
		}
		this.cache.set(key, dataUrl);
	}

	/**
	 * 生成预览帧（带防抖和缓存）
	 */
	generatePreviewFrame(
		time: number,
		videoUrl: string,
		previewCanvas: HTMLCanvasElement,
		onGenerated?: (dataUrl: string) => void
	): void {
		// 检查缓存
		const cached = this.getCachedFrame(time);
		if (cached) {
			this.drawFromDataUrl(cached, previewCanvas);
			return;
		}

		// 防抖
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			if (this.isGenerating) return;
			this.isGenerating = true;

			// 复用或创建临时 video 元素
			if (!this.tempVideoElement) {
				this.tempVideoElement = document.createElement('video');
				this.tempVideoElement.crossOrigin = 'anonymous';
				this.tempVideoElement.muted = true;
				this.tempVideoElement.preload = 'metadata';
			}

			// 如果 src 变了才更新
			if (this.tempVideoElement.src !== videoUrl) {
				this.tempVideoElement.src = videoUrl;
			}

			const handleSeeked = () => {
				try {
					const ctx = previewCanvas.getContext('2d');
					if (ctx && this.tempVideoElement) {
						// 计算缩略图尺寸，保持宽高比
						const videoRatio = this.tempVideoElement.videoWidth / this.tempVideoElement.videoHeight;
						const canvasWidth = PREVIEW_WIDTH;
						const canvasHeight = Math.round(canvasWidth / videoRatio);
						previewCanvas.width = canvasWidth;
						previewCanvas.height = canvasHeight;
						ctx.drawImage(this.tempVideoElement, 0, 0, canvasWidth, canvasHeight);

						// 存入缓存
						try {
							const dataUrl = previewCanvas.toDataURL('image/jpeg', 0.7);
							this.storeFrame(time, dataUrl);
							onGenerated?.(dataUrl);
						} catch (e) {
							// 跨域视频可能无法 toDataURL，忽略缓存
						}
					}
				} catch (err) {
					console.warn('生成预览帧失败:', err);
				} finally {
					this.isGenerating = false;
					this.tempVideoElement?.removeEventListener('seeked', handleSeeked);
				}
			};

			this.tempVideoElement.addEventListener('seeked', handleSeeked, { once: true });
			this.tempVideoElement.addEventListener('error', () => {
				this.isGenerating = false;
			}, { once: true });

			this.tempVideoElement.currentTime = time;
		}, 30); // 30ms 防抖
	}

	/**
	 * 从 dataUrl 绘制到 canvas
	 */
	private drawFromDataUrl(dataUrl: string, canvas: HTMLCanvasElement): void {
		const img = new Image();
		img.onload = () => {
			const ctx = canvas.getContext('2d');
			if (ctx) {
				canvas.width = img.width;
				canvas.height = img.height;
				ctx.drawImage(img, 0, 0);
			}
		};
		img.src = dataUrl;
	}

	/**
	 * 清理缓存
	 */
	clear(): void {
		this.cache.clear();
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		if (this.tempVideoElement) {
			this.tempVideoElement.src = '';
			this.tempVideoElement = null;
		}
		this.isGenerating = false;
	}
}

// ==================== 截图功能 ====================

/**
 * 捕获视频截图
 */
export async function captureVideoScreenshot(
	videoElement: HTMLVideoElement,
	currentTime: number
): Promise<Blob | null> {
	const canvas = document.createElement('canvas');
	canvas.width = videoElement.videoWidth;
	canvas.height = videoElement.videoHeight;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	ctx.drawImage(videoElement, 0, 0);

	return new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/png')
	);
}

/**
 * 下载截图
 */
export function downloadScreenshot(blob: Blob, currentTime: number): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `screenshot_${formatTime(currentTime).replace(':', '-')}.png`;
	a.click();
	URL.revokeObjectURL(url);
}
