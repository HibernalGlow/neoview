/**
 * BottomThumbnailBar 工具函数模块
 * 窗口范围计算和缩略图尺寸逻辑
 */

// 常量
export const LOCAL_MIN_THUMBNAILS = 6;
export const ARCHIVE_MIN_THUMBNAILS = 3;
export const PRELOAD_RANGE = 20;
export const THUMBNAIL_DEBOUNCE_MS = 100;

// ============ 窗口范围计算 ============

/**
 * 获取最小可见缩略图数量
 */
export function getMinVisibleThumbnails(bookType?: string): number {
	return bookType === 'archive' ? ARCHIVE_MIN_THUMBNAILS : LOCAL_MIN_THUMBNAILS;
}

/**
 * 确保窗口范围满足最小跨度要求
 */
export function ensureMinimumSpan(
	start: number,
	end: number,
	totalPages: number,
	targetLength: number
): { start: number; end: number } {
	let newStart = start;
	let newEnd = end;
	const currentSpan = newEnd - newStart + 1;
	if (currentSpan >= targetLength) {
		return { start: newStart, end: newEnd };
	}

	let deficit = targetLength - currentSpan;
	while (deficit > 0 && (newStart > 0 || newEnd < totalPages - 1)) {
		if (newStart > 0) {
			newStart -= 1;
			deficit -= 1;
		}
		if (deficit > 0 && newEnd < totalPages - 1) {
			newEnd += 1;
			deficit -= 1;
		}
	}

	return { start: newStart, end: newEnd };
}

// ============ 窗口徽章逻辑 ============

export interface PageWindow {
	center: number;
	forward: number[];
	backward: number[];
	stale?: boolean;
}

/**
 * 获取窗口徽章标签
 */
export function getWindowBadgeLabel(index: number, windowState: PageWindow | null): string | null {
	if (!windowState || windowState.stale) return null;
	if (index === windowState.center) return 'C';
	if (windowState.forward.includes(index)) return '+';
	if (windowState.backward.includes(index)) return '-';
	return null;
}

/**
 * 获取窗口徽章 CSS 类名
 */
export function getWindowBadgeClass(index: number, windowState: PageWindow | null): string {
	if (!windowState || windowState.stale) return '';
	if (index === windowState.center) return 'bg-primary/80';
	if (windowState.forward.includes(index)) return 'bg-accent/80';
	if (windowState.backward.includes(index)) return 'bg-secondary/80';
	return '';
}

// ============ 缩略图尺寸计算 ============

export interface ThumbnailDimensions {
	width: number;
	height: number;
}

/**
 * 根据原始尺寸和容器高度计算缩略图显示尺寸
 */
export function calculateThumbnailDimensions(
	originalWidth: number | undefined,
	originalHeight: number | undefined,
	barHeight: number
): ThumbnailDimensions {
	const maxHeight = barHeight - 40; // 留出边距
	
	if (!originalWidth || !originalHeight) {
		// 默认尺寸
		return { width: maxHeight * 0.7, height: maxHeight };
	}
	
	const aspectRatio = originalWidth / originalHeight;
	let height = maxHeight;
	let width = height * aspectRatio;
	
	// 限制最大宽度
	const maxWidth = maxHeight * 2;
	if (width > maxWidth) {
		width = maxWidth;
		height = width / aspectRatio;
	}
	
	return { width, height };
}

// ============ 进度计算 ============

/**
 * 计算阅读进度百分比
 */
export function calculateReadingProgress(currentIndex: number, totalPages: number): number {
	if (totalPages <= 1) return 100;
	return ((currentIndex + 1) / totalPages) * 100;
}
