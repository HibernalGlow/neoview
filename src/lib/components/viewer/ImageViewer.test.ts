/**
 * ImageViewer 集成测试
 * 测试性能配置变化和预加载工作流程
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { settingsManager, performanceSettings } from '$lib/settings/settingsManager';
import ImageViewer from '../ImageViewer.svelte';

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

vi.mock('$lib/stores', () => ({
	zoomLevel: { value: 1 },
	zoomIn: vi.fn(),
	zoomOut: vi.fn(),
	resetZoom: vi.fn(),
	rotationAngle: { value: 0 },
	viewMode: { value: 'single' }
}));

vi.mock('$lib/stores/keyboard.svelte', () => ({
	keyBindings: {},
	generateKeyCombo: vi.fn(),
	findCommandByKeys: vi.fn()
}));

vi.mock('$lib/stores/keybindings.svelte', () => ({
	keyBindingsStore: {
		findActionByMouseWheel: vi.fn(),
		findActionByKeyCombo: vi.fn()
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

vi.mock('$lib/api/fs', () => ({
	loadImage: vi.fn()
}));

vi.mock('$lib/api/filesystem', () => ({
	loadImageFromArchive: vi.fn()
}));

vi.mock('@tauri-apps/api/core', () => ({
	invoke: vi.fn()
}));

describe('ImageViewer 集成测试', () => {
	let mockBook: any;
	let mockPage: any;

	beforeEach(() => {
		// 重置所有mock
		vi.clearAllMocks();

		// 设置测试数据
		mockBook = {
			path: '/test/book.zip',
			type: 'archive',
			pages: [
				{ path: 'page1.jpg' },
				{ path: 'page2.jpg' },
				{ path: 'page3.jpg' }
			]
		};

		mockPage = {
			path: 'page1.jpg'
		};

		// 重置性能设置为默认值
		settingsManager.updateNestedSettings('performance', {
			preLoadSize: 3,
			maxThreads: 2
		});
	});

	it('应该正确初始化性能配置', () => {
		const { component } = render(ImageViewer);

		// 验证性能配置是否正确初始化
		expect(component.performancePreloadPages).toBe(3);
		expect(component.performanceMaxThreads).toBe(2);
	});

	it('应该在性能配置变化时更新本地状态', async () => {
		const { component } = render(ImageViewer);

		// 初始状态
		expect(component.performancePreloadPages).toBe(3);
		expect(component.performanceMaxThreads).toBe(2);

		// 更新性能配置
		settingsManager.updateNestedSettings('performance', {
			preLoadSize: 5,
			maxThreads: 4
		});

		// 等待状态更新
		await waitFor(() => {
			expect(component.performancePreloadPages).toBe(5);
			expect(component.performanceMaxThreads).toBe(4);
		});
	});

	it('应该在组件卸载时清理监听器', async () => {
		const { component, unmount } = render(ImageViewer);

		// 添加一个监听器来验证清理
		const removeListenerSpy = vi.spyOn(performanceSettings, 'removeListener');

		// 卸载组件
		unmount();

		// 验证removeListener被调用
		expect(removeListenerSpy).toHaveBeenCalled();
	});

	it('应该使用性能配置创建preloadWorker', () => {
		const { component } = render(ImageViewer);

		// 验证preloadWorker是否使用正确的并发数
		const worker = component.preloadWorker;
		expect(worker).toBeDefined();

		// 通过调用notifyIdle来测试并发数
		const concurrencySpy = vi.fn().mockReturnValue(2);
		worker.options.concurrency = concurrencySpy;

		worker.notifyIdle();
		expect(concurrencySpy).toHaveBeenCalled();
	});

	it('应该在翻页时触发预加载', async () => {
		const { component } = render(ImageViewer);

		// Mock loadImageFromArchive返回图片数据
		const { loadImageFromArchive } = await import('$lib/api/filesystem');
		vi.mocked(loadImageFromArchive).mockResolvedValue('data:image/jpeg;base64,test');

		// Mock invoke返回hash
		const { invoke } = await import('@tauri-apps/api/core');
		vi.mocked(invoke).mockResolvedValue('test-hash');

		// 设置当前书籍和页面
		const { bookStore } = await import('$lib/stores/book.svelte');
		bookStore.currentBook = mockBook;
		bookStore.currentPage = mockPage;
		bookStore.currentPageIndex = 0;
		bookStore.totalPages = 3;

		// 等待图片加载完成
		await waitFor(() => {
			expect(loadImageFromArchive).toHaveBeenCalledWith(mockBook.path, mockPage.path);
		});

		// 验证preloadWorker是否被调用
		const worker = component.preloadWorker;
		expect(worker.pending()).toBeGreaterThan(0);
	});

	it('应该根据preLoadSize限制预加载数量', async () => {
		// 设置较小的预加载数量
		settingsManager.updateNestedSettings('performance', {
			preLoadSize: 1
		});

		const { component } = render(ImageViewer);

		// Mock loadImageFromArchive返回图片数据
		const { loadImageFromArchive } = await import('$lib/api/filesystem');
		vi.mocked(loadImageFromArchive).mockResolvedValue('data:image/jpeg;base64,test');

		// Mock invoke返回hash
		const { invoke } = await import('@tauri-apps/api/core');
		vi.mocked(invoke).mockResolvedValue('test-hash');

		// 设置当前书籍和页面
		const { bookStore } = await import('$lib/stores/book.svelte');
		bookStore.currentBook = mockBook;
		bookStore.currentPage = mockPage;
		bookStore.currentPageIndex = 0;
		bookStore.totalPages = 3;

		// 等待图片加载完成
		await waitFor(() => {
			expect(loadImageFromArchive).toHaveBeenCalledWith(mockBook.path, mockPage.path);
		});

		// 验证预加载数量不超过preLoadSize
		const worker = component.preloadWorker;
		expect(worker.pending()).toBeLessThanOrEqual(1);
	});

	it('应该根据maxThreads限制并发数', async () => {
		// 设置较小的并发数
		settingsManager.updateNestedSettings('performance', {
			maxThreads: 1
		});

		const { component } = render(ImageViewer);

		// 验证preloadWorker的并发数
		const worker = component.preloadWorker;
		const concurrency = worker.options.concurrency();
		expect(concurrency).toBe(1);
	});

	it('应该正确处理预加载任务成功', async () => {
		const { component } = render(ImageViewer);

		// 创建一个测试任务
		const testTask = {
			data: 'test-data',
			hash: 'test-hash',
			pageIndex: 1
		};

		// Mock成功的结果
		const testResult = {
			upscaledImageData: 'data:image/webp;base64,test-result',
			upscaledImageBlob: new Blob(['test-result'], { type: 'image/webp' })
		};

		// 手动触发成功回调
		component.preloadWorker.options.onTaskSuccess(testTask, testResult);

		// 验证结果是否正确写入缓存
		expect(component.preloadMemoryCache.has('test-hash')).toBe(true);
		const cached = component.preloadMemoryCache.get('test-hash');
		expect(cached?.url).toBe(testResult.upscaledImageData);
		expect(cached?.blob).toBe(testResult.upscaledImageBlob);

		// 验证预超分进度是否更新
		expect(component.preUpscaledPages.has(1)).toBe(true);
	});

	it('应该正确处理预加载任务失败', async () => {
		const { component } = render(ImageViewer);

		// 创建一个测试任务
		const testTask = {
			data: 'test-data',
			hash: 'test-hash',
			pageIndex: 1
		};

		const testError = new Error('Test error');

		// 手动触发失败回调
		component.preloadWorker.options.onTaskFailure(testTask, testError);

		// 验证错误处理（这里主要是确保不会抛出异常）
		expect(component.preloadMemoryCache.has('test-hash')).toBe(false);
		expect(component.preUpscaledPages.has(1)).toBe(false);
	});

	it('应该在书籍切换时清理缓存', async () => {
		const { component } = render(ImageViewer);

		// 添加一些测试数据到缓存
		component.preloadMemoryCache.set('test-hash', {
			url: 'test-url',
			blob: new Blob(['test'])
		});
		component.preUpscaledPages.add(1);

		// 切换书籍
		const { bookStore } = await import('$lib/stores/book.svelte');
		bookStore.currentBook = mockBook;

		// 等待清理完成
		await waitFor(() => {
			expect(component.preloadMemoryCache.size).toBe(0);
			expect(component.preUpscaledPages.size).toBe(0);
		});
	});

	it('应该正确处理鼠标滚轮事件', async () => {
		const { component, container } = render(ImageViewer);

		// Mock keyBindingsStore.findActionByMouseWheel
		const { keyBindingsStore } = await import('$lib/stores/keybindings.svelte');
		const mockFindAction = vi.fn().mockReturnValue('nextPage');
		keyBindingsStore.findActionByMouseWheel = mockFindAction;

		// Mock bookStore.nextPage
		const { bookStore } = await import('$lib/stores/book.svelte');
		const mockNextPage = vi.fn();
		bookStore.nextPage = mockNextPage;

		// 触发滚轮事件
		const wheelEvent = new WheelEvent('wheel', { deltaY: 1 });
		fireEvent(container.querySelector('.image-viewer-container')!, wheelEvent);

		// 验证行为
		expect(mockFindAction).toHaveBeenCalledWith('down');
		expect(mockNextPage).toHaveBeenCalled();
	});

	it('应该正确处理键盘事件', async () => {
		const { component } = render(ImageViewer);

		// Mock 组合键生成
		const { generateKeyCombo } = await import('$lib/stores/keyboard.svelte');
		const mockGenerateKeyCombo = vi.fn().mockReturnValue('space');
		generateKeyCombo.mockImplementation(mockGenerateKeyCombo);

		// Mock 统一 keybindings 动作查找
		const { keyBindingsStore } = await import('$lib/stores/keybindings.svelte');
		const mockFindActionByKeyCombo = vi.fn().mockReturnValue('nextPage');
		keyBindingsStore.findActionByKeyCombo = mockFindActionByKeyCombo;

		// Mock bookStore.nextPage
		const { bookStore } = await import('$lib/stores/book.svelte');
		const mockNextPage = vi.fn();
		bookStore.nextPage = mockNextPage;

		// 触发键盘事件
		const keyboardEvent = new KeyboardEvent('keydown', { code: 'Space' });
		fireEvent(window, keyboardEvent);

		// 验证行为
		expect(mockGenerateKeyCombo).toHaveBeenCalledWith(keyboardEvent);
		expect(mockFindActionByKeyCombo).toHaveBeenCalledWith('space');
		expect(mockNextPage).toHaveBeenCalled();
	});
});