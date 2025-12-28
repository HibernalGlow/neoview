/**
 * thumbnailBarUtils.ts
 * BottomThumbnailBar 工具函数和常量
 */

import type { PageWindowState } from '$lib/core/state/appState';

// ==================== 常量 ====================

/** 本地模式最小可见缩略图数 */
export const LOCAL_MIN_THUMBNAILS = 6;

/** 归档模式最小可见缩略图数 */
export const ARCHIVE_MIN_THUMBNAILS = 3;

/** 缩略图加载防抖时间（毫秒） */
export const THUMBNAIL_DEBOUNCE_MS = 100;

/** 预加载范围 */
export const PRELOAD_RANGE = 20;

// ==================== 工具函数 ====================

/**
 * 确保最小跨度
 * 如果当前范围不足目标长度，向两侧扩展
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

/**
 * 获取窗口标记标签
 * C = 中心，+ = 前进，- = 后退
 */
export function windowBadgeLabel(
	index: number,
	windowState: PageWindowState | null | undefined
): string | null {
	if (!windowState || windowState.stale) return null;
	if (index === windowState.center) return 'C';
	if (windowState.forward.includes(index)) return '+';
	if (windowState.backward.includes(index)) return '-';
	return null;
}

/**
 * 获取窗口标记 CSS 类
 */
export function windowBadgeClass(
	index: number,
	windowState: PageWindowState | null | undefined
): string {
	if (!windowState || windowState.stale) return '';
	if (index === windowState.center) return 'bg-primary/80';
	if (windowState.forward.includes(index)) return 'bg-accent/80';
	if (windowState.backward.includes(index)) return 'bg-secondary/80';
	return '';
}

/**
 * 根据书籍类型获取最小可见缩略图数
 */
export function getMinVisibleThumbnails(bookType: 'archive' | 'local' | undefined): number {
	return bookType === 'archive' ? ARCHIVE_MIN_THUMBNAILS : LOCAL_MIN_THUMBNAILS;
}

/**
 * 计算窗口范围
 * 基于 viewer 的 pageWindow 状态计算需要显示的缩略图范围
 */
export function getWindowRange(
	totalPages: number,
	windowState: PageWindowState | null | undefined,
	currentPageIndex: number,
	bottomBarHeight: number,
	bookType: 'archive' | 'local' | undefined
): { start: number; end: number } {
	const minVisible = getMinVisibleThumbnails(bookType);
	const fallbackRadius = Math.max(minVisible, Math.floor((bottomBarHeight - 40) / 60));

	if (!windowState || windowState.stale) {
		const start = Math.max(0, currentPageIndex - fallbackRadius);
		const end = Math.min(totalPages - 1, currentPageIndex + fallbackRadius);
		return ensureMinimumSpan(start, end, totalPages, minVisible);
	}

	let minIndex = windowState.center;
	let maxIndex = windowState.center;
	if (windowState.backward.length) {
		minIndex = Math.min(minIndex, ...windowState.backward);
	}
	if (windowState.forward.length) {
		maxIndex = Math.max(maxIndex, ...windowState.forward);
	}
	minIndex = Math.max(0, minIndex);
	maxIndex = Math.min(totalPages - 1, maxIndex);

	const currentSpan = maxIndex - minIndex + 1;
	if (currentSpan <= minVisible) {
		return ensureMinimumSpan(minIndex, maxIndex, totalPages, minVisible);
	}

	const center = windowState.center;
	const half = Math.floor((minVisible - 1) / 2);
	let start = Math.max(minIndex, center - half);
	let end = start + minVisible - 1;
	if (end > maxIndex) {
		end = maxIndex;
		start = Math.max(minIndex, end - minVisible + 1);
	}
	if (end >= totalPages) {
		end = totalPages - 1;
		start = Math.max(0, end - minVisible + 1);
	}

	return { start, end };
}

/**
 * 计算缩略图滚动进度
 * 考虑阅读方向
 */
export function calculateScrollProgress(
	container: HTMLElement,
	readingDirection: 'left-to-right' | 'right-to-left'
): number {
	const maxScroll = container.scrollWidth - container.clientWidth;
	const rawProgress = maxScroll > 0 ? container.scrollLeft / maxScroll : 0;
	// 右开模式下反转进度（因为缩略图列表已经反转，滚动到最右边=第1页=进度0）
	return readingDirection === 'right-to-left' ? 1 - rawProgress : rawProgress;
}
