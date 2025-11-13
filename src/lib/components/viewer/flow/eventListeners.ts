/**
 * Event Listeners Hook
 * 封装ImageViewer相关的事件监听器
 */

import type { BookStore } from '$lib/stores/book.svelte';

export interface EventListenersOptions {
	bookStore: BookStore;
	onUpscaleComplete?: (detail: any) => void;
	onUpscaleSaved?: (detail: any) => void;
	onRequestCurrentImageData?: (detail: any) => void;
	onResetPreUpscaleProgress?: () => void;
	onComparisonModeChanged?: (detail: any) => void;
	onProgressBarStateChange?: (detail: any) => void;
	onCheckPreloadCache?: (detail: any) => void;
	onCacheHit?: (detail: any) => void;
}

export function createEventListeners(options: EventListenersOptions) {
	const {
		bookStore,
		onUpscaleComplete,
		onUpscaleSaved,
		onRequestCurrentImageData,
		onResetPreUpscaleProgress,
		onComparisonModeChanged,
		onProgressBarStateChange,
		onCheckPreloadCache,
		onCacheHit
	} = options;

	const handleUpscaleComplete = async (e: CustomEvent) => {
		const { imageData: upscaledImageData, imageBlob, originalImageHash } = e.detail;
		if (!upscaledImageData || !originalImageHash) return;

		try {
			if (imageBlob) {
				bookStore.setUpscaledImageBlob(imageBlob);
			}
			
			// 调用外部回调
			onUpscaleComplete?.(e.detail);
		} catch (error) {
			console.error('处理超分完成事件失败:', error);
		}
	};

	const handleUpscaleSaved = async (e: CustomEvent) => {
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

	const handleRequestCurrentImageData = (e: CustomEvent) => {
		console.log('ImageViewer: 收到图片数据请求');
		const { callback } = e.detail;
		
		// 延迟检查，确保图片数据已加载
		setTimeout(() => {
			// 调用外部回调处理实际的数据返回
			onRequestCurrentImageData?.(e.detail);
		}, 100);
	};

	const handleResetPreUpscaleProgress = () => {
		onResetPreUpscaleProgress?.();
	};

	const handleComparisonModeChanged = (e: CustomEvent) => {
		onComparisonModeChanged?.(e.detail);
	};

	const handleProgressBarState = (e: CustomEvent) => {
		onProgressBarStateChange?.(e.detail);
	};

	const handleCheckPreloadCache = (e: CustomEvent) => {
		onCheckPreloadCache?.(e.detail);
	};

	const handleCacheHit = (e: CustomEvent) => {
		onCacheHit?.(e.detail);
	};

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
	};

	return {
		registerEventListeners,
		cleanupEventListeners
	};
}