/**
 * VideoPlayer 工具函数模块
 * 包含格式化、帧预览缓存等纯函数
 */

// ============ 时间格式化 ============

/**
 * 格式化秒数为时间字符串 (m:ss)
 */
export function formatTime(seconds: number): string {
	if (!isFinite(seconds)) return '0:00';
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============ 帧预览缓存 ============

const MAX_CACHE_SIZE = 30;
const CACHE_PRECISION = 1; // 秒级精度

// 帧缓存 Map
const frameCache = new Map<number, string>();
let tempVideoElement: HTMLVideoElement | null = null;

/**
 * 获取缓存 key（按精度取整）
 */
export function getCacheKey(time: number): number {
	return Math.round(time / CACHE_PRECISION) * CACHE_PRECISION;
}

/**
 * 从缓存获取帧
 */
export function getCachedFrame(time: number): string | undefined {
	const cacheKey = getCacheKey(time);
	return frameCache.get(cacheKey);
}

/**
 * 缓存帧数据
 */
export function cacheFrame(time: number, dataUrl: string): void {
	const cacheKey = getCacheKey(time);
	// 控制缓存大小
	if (frameCache.size >= MAX_CACHE_SIZE) {
		const firstKey = frameCache.keys().next().value;
		if (firstKey !== undefined) frameCache.delete(firstKey);
	}
	frameCache.set(cacheKey, dataUrl);
}

/**
 * 清理帧缓存
 */
export function clearFrameCache(): void {
	frameCache.clear();
	if (tempVideoElement) {
		tempVideoElement.src = '';
		tempVideoElement = null;
	}
}

/**
 * 获取或创建临时视频元素（用于帧预览）
 */
export function getTempVideoElement(videoUrl: string): HTMLVideoElement {
	if (!tempVideoElement) {
		tempVideoElement = document.createElement('video');
		tempVideoElement.crossOrigin = 'anonymous';
		tempVideoElement.muted = true;
		tempVideoElement.preload = 'metadata';
	}
	
	// 如果 src 变了才更新
	if (tempVideoElement.src !== videoUrl) {
		tempVideoElement.src = videoUrl;
	}
	
	return tempVideoElement;
}

// ============ 播放速率计算 ============

/**
 * 限制播放速率在允许范围内
 */
export function clampPlaybackRate(rate: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, rate));
}

// ============ 滤镜 ============

/**
 * 生成 CSS 滤镜字符串
 */
export function buildFilterStyle(brightness: number, contrast: number, saturate: number): string {
	return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)`;
}
