/**
 * Event Listeners Hook
 * 封装ImageViewer相关的事件监听器
 */

import { bookStore as globalBookStore } from '$lib/stores/book.svelte';

type BookStore = typeof globalBookStore;

export interface EventListenersOptions {
	bookStore?: BookStore;
	onUpscaleComplete?: (detail: any) => void;
	onUpscaleSaved?: (detail: any) => void;
	onRequestCurrentImageData?: (detail: any) => void;
	onResetPreUpscaleProgress?: () => void;
	onComparisonModeChanged?: (detail: any) => void;
	onProgressBarStateChange?: (detail: any) => void;
	onCheckPreloadCache?: (detail: any) => void;
	onCacheHit?: (detail: any) => void;
	onUpscaleStart?: () => void;
}

export function createEventListeners(options: EventListenersOptions) {
	const {
		bookStore = globalBookStore,
		onUpscaleComplete,
		onUpscaleSaved,
		onRequestCurrentImageData,
		onResetPreUpscaleProgress,
		onComparisonModeChanged,
		onProgressBarStateChange,
		onCheckPreloadCache,
		onCacheHit,
		onUpscaleStart
	} = options;

	const handleUpscaleComplete = async (event: Event) => {
		const e = event as CustomEvent;
		const { imageData: upscaledImageData, imageBlob, originalImageHash, background, pageIndex } = e.detail;
		if (!upscaledImageData || !originalImageHash) return;

		try {
			const targetIndex = typeof pageIndex === 'number' ? pageIndex : bookStore.currentPageIndex;
			const isCurrentPage = targetIndex === bookStore.currentPageIndex;

			// 仅在当前页时才更新全局 upscaled Blob，避免其他页面覆盖当前显示
			if (imageBlob && isCurrentPage) {
				bookStore.setUpscaledImageBlob(imageBlob);
			}
			
			// 调用外部回调
			onUpscaleComplete?.(e.detail);
		} catch (error) {
			console.error('处理超分完成事件失败:', error);
		}
	};

	const handleUpscaleSaved = async (event: Event) => {
		const e = event as CustomEvent;
		try {
			const { finalHash, savePath } = e.detail || {};
			if (finalHash && savePath) {
				console.log('后台超分已保存，已更新 hashPathIndex:', finalHash, savePath);
			}
			
			// 调用外部回调
			onUpscaleSaved?.(e.detail);
		} catch (err) {
			console.error('处理 upscale-saved 事件失败:', err);
		}
	};

	const handleRequestCurrentImageData = (event: Event) => {
		const e = event as CustomEvent;
		console.log('ImageViewer: 收到图片数据请求');
		// 直接调用外部回调，不再添加额外的延迟
		onRequestCurrentImageData?.(e.detail);
	};

	const handleResetPreUpscaleProgress = () => {
		onResetPreUpscaleProgress?.();
	};

	const handleComparisonModeChanged = (event: Event) => {
		const e = event as CustomEvent;
		onComparisonModeChanged?.(e.detail);
	};

	const handleProgressBarState = (event: Event) => {
		const e = event as CustomEvent;
		onProgressBarStateChange?.(e.detail);
	};

	const handleCheckPreloadCache = (event: Event) => {
		const e = event as CustomEvent;
		onCheckPreloadCache?.(e.detail);
	};

	const handleCacheHit = (event: Event) => {
		const e = event as CustomEvent;
		onCacheHit?.(e.detail);
	};

	// 用于保存超分开始事件的处理器，以便后续清理
	let handleUpscaleStart: (() => void) | null = null;

	// 注册所有事件监听器
	const registerEventListeners = () => {
		window.addEventListener('upscale-complete', handleUpscaleComplete as EventListener);
		window.addEventListener('upscale-saved', handleUpscaleSaved as EventListener);
		window.addEventListener('request-current-image-data', handleRequestCurrentImageData as EventListener);
		window.addEventListener('reset-pre-upscale-progress', handleResetPreUpscaleProgress as EventListener);
		window.addEventListener('comparison-mode-changed', handleComparisonModeChanged as EventListener);
		window.addEventListener('progressBarStateChange', handleProgressBarState as EventListener);
		window.addEventListener('check-preload-cache', handleCheckPreloadCache as EventListener);
		window.addEventListener('cache-hit', handleCacheHit as EventListener);
		
		// 监听超分开始事件
		if (onUpscaleStart) {
			handleUpscaleStart = () => {
				onUpscaleStart();
			};
			window.addEventListener('upscale-start', handleUpscaleStart as EventListener);
		}
	};

	// 清理所有事件监听器
	const cleanupEventListeners = () => {
		window.removeEventListener('upscale-complete', handleUpscaleComplete as EventListener);
		window.removeEventListener('upscale-saved', handleUpscaleSaved as EventListener);
		window.removeEventListener('request-current-image-data', handleRequestCurrentImageData as EventListener);
		window.removeEventListener('reset-pre-upscale-progress', handleResetPreUpscaleProgress as EventListener);
		window.removeEventListener('comparison-mode-changed', handleComparisonModeChanged as EventListener);
		window.removeEventListener('progressBarStateChange', handleProgressBarState as EventListener);
		window.removeEventListener('check-preload-cache', handleCheckPreloadCache as EventListener);
		window.removeEventListener('cache-hit', handleCacheHit as EventListener);
		
		// 清理超分开始事件监听器
		if (handleUpscaleStart) {
			window.removeEventListener('upscale-start', handleUpscaleStart as EventListener);
			handleUpscaleStart = null;
		}
	};

	return {
		registerEventListeners,
		cleanupEventListeners
	};
}