/**
 * UpscaleHandler - 独立的超分处理模块
 * 只有在全局开关开启时才会被使用
 */

import { invoke } from '@tauri-apps/api/core';
import { bookStore } from '$lib/stores/book.svelte';
import { pyo3UpscaleManager } from '$lib/stores/upscale/PyO3UpscaleManager.svelte';
import {
	triggerAutoUpscale,
	checkUpscaleCache,
	getAutoUpscaleEnabled,
	type ImageDataWithHash
} from './preloadRuntime';
import { evaluateConditions, collectPageMetadata } from '$lib/utils/upscale/conditions';
import { loadUpscalePanelSettings } from '$lib/components/panels/UpscalePanel';

export interface UpscaleResult {
	url: string;
	blob: Blob;
	fromCache: boolean;
}

export interface UpscaleHandlerOptions {
	onUpscaleComplete?: (pageIndex: number, result: UpscaleResult) => void;
	onUpscaleStart?: (pageIndex: number) => void;
	onUpscaleError?: (pageIndex: number, error: Error) => void;
}

/**
 * 独立的超分处理器
 */
export class UpscaleHandler {
	private options: UpscaleHandlerOptions;
	private memoryCache = new Map<string, { url: string; blob: Blob }>();
	private pendingTasks = new Set<string>();
	private lastUpscalePageIndex: number | null = null;

	constructor(options: UpscaleHandlerOptions = {}) {
		this.options = options;
	}

	/**
	 * 检查全局超分开关是否开启
	 */
	async isEnabled(): Promise<boolean> {
		return getAutoUpscaleEnabled();
	}

	/**
	 * 处理页面的超分逻辑
	 * @returns 超分结果，如果应该跳过则返回 null
	 */
	async handlePageUpscale(
		pageIndex: number,
		blob: Blob,
		imageHash: string
	): Promise<UpscaleResult | null> {
		// 1. 检查全局开关
		const enabled = await this.isEnabled();
		if (!enabled) {
			return null;
		}

		// 2. 检查条件是否要求跳过
		const currentBook = bookStore.currentBook;
		const pageInfo = currentBook?.pages[pageIndex];
		const panelSettings = loadUpscalePanelSettings();

		if (panelSettings.conditionalUpscaleEnabled && pageInfo && currentBook) {
			const pageMetadata = collectPageMetadata(pageInfo, currentBook.path);
			const conditionResult = evaluateConditions(pageMetadata, panelSettings.conditionsList);
			if (conditionResult.action?.skip === true) {
				bookStore.setPageUpscaleStatus(pageIndex, 'none');
				return null;
			}
		}

		// 3. 检查内存缓存
		const memCache = this.memoryCache.get(imageHash);
		if (memCache && memCache.blob && memCache.blob.size > 0) {
			console.log('✅ 使用内存超分缓存，页码:', pageIndex + 1);
			this.applyUpscaleResult(pageIndex, memCache.url, memCache.blob, imageHash);
			return { url: memCache.url, blob: memCache.blob, fromCache: true };
		}

		// 4. 尝试从磁盘加载
		const diskResult = await this.loadFromDisk(imageHash);
		if (diskResult) {
			console.log('✅ 从磁盘加载超分结果，页码:', pageIndex + 1);
			this.applyUpscaleResult(pageIndex, diskResult.url, diskResult.blob, imageHash);
			return { ...diskResult, fromCache: true };
		}

		// 5. 执行实时超分
		this.options.onUpscaleStart?.(pageIndex);
		try {
			await triggerAutoUpscale({
				blob,
				hash: imageHash,
				pageIndex
			});
			this.lastUpscalePageIndex = pageIndex;
			// 超分结果通过事件返回，这里返回 null 表示正在处理
			return null;
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error('超分失败:', err);
			this.options.onUpscaleError?.(pageIndex, err);
			return null;
		}
	}

	/**
	 * 从磁盘加载超分结果
	 */
	private async loadFromDisk(imageHash: string): Promise<{ url: string; blob: Blob } | null> {
		try {
			// 创建一个空的 ImageDataWithHash 用于缓存检查
			const emptyBlob = new Blob([], { type: 'image/png' });
			const cacheResult = await checkUpscaleCache({
				blob: emptyBlob,
				hash: imageHash,
				pageIndex: -1
			});
			
			// checkUpscaleCache 返回 boolean，表示是否有缓存
			// 实际的缓存数据通过事件回调返回
			// 这里我们检查内存缓存
			const cached = this.memoryCache.get(imageHash);
			if (cached) {
				return cached;
			}
		} catch (error) {
			console.warn('从磁盘加载超分结果失败:', error);
		}
		return null;
	}

	/**
	 * 应用超分结果到 store
	 */
	private applyUpscaleResult(pageIndex: number, url: string, blob: Blob, hash: string): void {
		bookStore.setUpscaledImage(url);
		bookStore.setUpscaledImageBlob(blob);
		bookStore.setPageUpscaleStatus(pageIndex, 'done');
		
		// 触发事件
		window.dispatchEvent(new CustomEvent('upscale-complete', {
			detail: {
				imageData: url,
				imageBlob: blob,
				originalImageHash: hash,
				background: false,
				pageIndex
			}
		}));

		this.options.onUpscaleComplete?.(pageIndex, { url, blob, fromCache: true });
	}

	/**
	 * 取消上一页的超分任务
	 */
	async cancelPreviousUpscale(currentPageIndex: number): Promise<void> {
		if (this.lastUpscalePageIndex !== null && this.lastUpscalePageIndex !== currentPageIndex) {
			const currentBook = bookStore.currentBook;
			try {
				await invoke('cancel_upscale_jobs_for_page', {
					bookPath: currentBook?.path ?? undefined,
					pageIndex: this.lastUpscalePageIndex
				});
				console.log('已取消上一页超分任务:', this.lastUpscalePageIndex + 1);
			} catch (error) {
				console.warn('取消上一页超分任务失败:', error);
			} finally {
				this.lastUpscalePageIndex = null;
			}
		}
	}

	/**
	 * 获取内存缓存
	 */
	getMemoryCache(hash: string): { url: string; blob: Blob } | undefined {
		return this.memoryCache.get(hash);
	}

	/**
	 * 设置内存缓存
	 */
	setMemoryCache(hash: string, data: { url: string; blob: Blob }): void {
		this.memoryCache.set(hash, data);
	}

	/**
	 * 清理内存缓存
	 */
	clearMemoryCache(): void {
		for (const [, item] of this.memoryCache) {
			URL.revokeObjectURL(item.url);
		}
		this.memoryCache.clear();
	}

	/**
	 * 重置
	 */
	reset(): void {
		this.clearMemoryCache();
		this.pendingTasks.clear();
		this.lastUpscalePageIndex = null;
	}
}

// 单例
let instance: UpscaleHandler | null = null;

export function getUpscaleHandler(options?: UpscaleHandlerOptions): UpscaleHandler {
	if (!instance) {
		instance = new UpscaleHandler(options);
	}
	return instance;
}

export function resetUpscaleHandler(): void {
	if (instance) {
		instance.reset();
		instance = null;
	}
}
