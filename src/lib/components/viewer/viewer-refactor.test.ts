/**
 * 模块化重构验证测试
 * 验证事件桥接和新模块的集成
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPreloadManager } from '../flow/preloadManager';
import { createEventListeners } from '../flow/eventListeners';
import { performUpscale, checkUpscaleCache, triggerAutoUpscale } from '../flow/preloadRuntime';
import { bookStore } from '$lib/stores/book.svelte';

// Mock 外部依赖
vi.mock('$lib/stores/book.svelte', () => ({
	bookStore: {
		currentBook: null,
		currentPage: null,
		currentPageIndex: 0,
		totalPages: 0,
		currentPageUpscaled: false,
		upscaledImageData: null,
		upscaledImageBlob: null,
		setCurrentImage: vi.fn(),
		setUpscaledImage: vi.fn(),
		setUpscaledImageBlob: vi.fn(),
		nextPage: vi.fn(),
		previousPage: vi.fn(),
		navigateToPage: vi.fn(),
		closeBook: vi.fn(),
		canNextPage: false,
		canPreviousPage: false
	}
}));

vi.mock('$lib/settings/settingsManager', () => ({
	settingsManager: {
		getSettings: vi.fn(() => ({
			image: { enableSuperResolution: true },
			performance: { preLoadSize: 3, maxThreads: 2 }
		})),
		addListener: vi.fn(),
		removeListener: vi.fn(),
		updateNestedSettings: vi.fn()
	},
	performanceSettings: {
		preLoadSize: 3,
		maxThreads: 2,
		addListener: vi.fn(),
		removeListener: vi.fn()
	}
}));

vi.mock('$lib/stores/upscale/PyO3UpscaleManager.svelte', () => ({
	pyo3UpscaleManager: {
		upscaleImageMemory: vi.fn(),
		saveUpscaleCache: vi.fn()
	}
}));

vi.mock('$lib/stores/upscale/upscaleState.svelte', () => ({
	upscaleState: {
			isUpscaling: false,
			progress: 0,
			currentTask: null,
			error: null
		}
	}));

vi.mock('@tauri-apps/api/core', () => ({
	invoke: vi.fn()
}));

describe('模块化重构验证', () => {
	let preloadManager: ReturnType<typeof createPreloadManager>;
	let eventListeners: ReturnType<typeof createEventListeners>;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('应该能够创建预加载管理器', () => {
		preloadManager = createPreloadManager({
			onImageLoaded: vi.fn(),
			onPreloadProgress: vi.fn(),
			onError: vi.fn(),
			onLoadingStateChange: vi.fn()
		});

		expect(preloadManager).toBeDefined();
		expect(typeof preloadManager.initialize).toBe('function');
		expect(typeof preloadManager.cleanup).toBe('function');
	});

	it('应该能够创建事件监听器', () => {
		eventListeners = createEventListeners({
			bookStore,
			onUpscaleComplete: vi.fn(),
			onUpscaleSaved: vi.fn(),
			onRequestCurrentImageData: vi.fn(),
			onResetPreUpscaleProgress: vi.fn(),
			onComparisonModeChanged: vi.fn(),
			onProgressBarStateChange: vi.fn(),
			onCheckPreloadCache: vi.fn(),
			onCacheHit: vi.fn()
		});

		expect(eventListeners).toBeDefined();
		expect(typeof eventListeners.registerEventListeners).toBe('function');
		expect(typeof eventListeners.cleanupEventListeners).toBe('function');
	});

	it('应该能够调用preloadRuntime模块的函数', async () => {
		const mockImageData = 'data:image/jpeg;base64,test';
		const mockImageHash = 'test-hash';

		// 测试checkUpscaleCache
		const cacheResult = await checkUpscaleCache({ data: mockImageData, hash: mockImageHash });
		expect(typeof cacheResult).toBe('boolean');

		// 测试getImageDataWithHash
		const hashResult = await getImageDataWithHash(mockImageData);
		expect(hashResult).toEqual({
			data: mockImageData,
			hash: expect.any(String)
		});

		// 测试getGlobalUpscaleEnabled
		const enabledResult = await performUpscale({ data: mockImageData, hash: mockImageHash });
		expect(enabledResult).toBeDefined();
	});

	it('应该能够正确初始化和清理管理器', () => {
		const mockOnImageLoaded = vi.fn();
		const mockOnLoadingStateChange = vi.fn();

		preloadManager = createPreloadManager({
			onImageLoaded: mockOnImageLoaded,
			onLoadingStateChange: mockOnLoadingStateChange
		});

		// 模拟初始化
		preloadManager.initialize();
		
		// 验证初始化完成
		expect(mockOnImageLoaded).not.toHaveBeenCalled();
		expect(mockOnLoadingStateChange).not.toHaveBeenCalled();

		// 模拟清理
		preloadManager.cleanup();
		
		// 验证清理完成
		expect(mockOnImageLoaded).not.toHaveBeenCalled();
		expect(mockOnLoadingStateChange).not.toHaveBeenCalled();
	});

	it('应该能够正确处理事件桥接', () => {
		const mockOnUpscaleComplete = vi.fn();
		const mockOnCacheHit = vi.fn();

		eventListeners = createEventListeners({
			bookStore,
			onUpscaleComplete: mockOnUpscaleComplete,
			onCacheHit: mockOnCacheHit
		});

		// 注册事件监听器
		eventListeners.registerEventListeners();

		// 模拟触发缓存命中事件
		const cacheEvent = new CustomEvent('cache-hit', {
			detail: {
				imageHash: 'test-hash',
				url: 'test-url',
				blob: new Blob(['test']),
				preview: true
			}
		});
		
		window.dispatchEvent(cacheEvent);

		// 验证事件处理
		expect(mockOnCacheHit).toHaveBeenCalledWith({
			imageHash: 'test-hash',
			url: 'test-url',
			blob: expect.any(Blob),
			preview: true
		});

		// 清理事件监听器
		eventListeners.cleanupEventListeners();
	});

	it('应该能够正确集成所有模块', async () => {
		const mockOnImageLoaded = vi.fn();
		const mockOnPreloadProgress = vi.fn();
		const mockOnError = vi.fn();
		const mockOnLoadingStateChange = vi.fn();

		// 创建预加载管理器
		preloadManager = createPreloadManager({
			onImageLoaded: mockOnImageLoaded,
			onPreloadProgress: mockOnPreloadProgress,
			onError: mockOnError,
			onLoadingStateChange: mockOnLoadingStateChange
		});

		// 初始化
		preloadManager.initialize();

		// 验证性能配置获取
		const config = preloadManager.getPerformanceConfig();
		expect(config).toEqual({
			preloadPages: 3,
			maxThreads: 2
		});

		// 验证预超分进度获取
		const progress = preloadManager.getPreUpscaleProgress();
		expect(progress).toEqual({
			progress: 0,
			total: 0,
			pages: expect.any(Set)
		});

		// 验证加载状态获取
		const loadingState = preloadManager.getLoadingState();
		expect(loadingState).toEqual({
			loading: false,
			visible: false
		});

		// 清理
		preloadManager.cleanup();
	});
});