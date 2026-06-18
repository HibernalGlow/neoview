/**
 * MetadataService - 统一文件元数据服务
 * 提供单一入口获取所有类型文件的元数据
 * 支持 LRU 缓存、前后端元数据复用、自动同步到 infoPanelStore
 */

import { invoke } from '@tauri-apps/api/core';
import { LRUCache } from '$lib/utils/lruCache';
import {
	type ImageMetadata,
	type MetadataRequest,
	generateCacheKey,
	extractFileName,
	extractFormat
} from '$lib/types/metadata';
import { infoPanelStore, type ViewerImageInfo } from '$lib/stores/infoPanel.svelte';
import type { Page } from '$lib/types/book';

// 缓存配置
const CACHE_MAX_SIZE = 1000;

// 请求 ID 用于处理竞态条件
let currentRequestId = 0;

class MetadataServiceImpl {
	private cache: LRUCache<string, ImageMetadata>;
	private pendingRequests: Map<string, Promise<ImageMetadata | null>>;
	private currentPageKey: string | null = null;
	private latestRequestId: number = 0;

	constructor() {
		this.cache = new LRUCache<string, ImageMetadata>(CACHE_MAX_SIZE);
		this.pendingRequests = new Map();
	}

	/**
	 * 获取元数据（优先使用缓存）
	 */
	async getMetadata(request: MetadataRequest): Promise<ImageMetadata | null> {
		const cacheKey = generateCacheKey(request.path, request.innerPath);

		// 1. 检查缓存
		const cached = this.cache.get(cacheKey);
		if (cached) {
			console.log(`📋 [MetadataService] 缓存命中: ${cacheKey}`);
			return cached;
		}

		// 2. 检查是否有正在进行的请求
		const pending = this.pendingRequests.get(cacheKey);
		if (pending) {
			console.log(`📋 [MetadataService] 复用进行中的请求: ${cacheKey}`);
			return pending;
		}

		// 3. 发起新请求
		const requestPromise = this.fetchMetadata(request, cacheKey);
		this.pendingRequests.set(cacheKey, requestPromise);

		try {
			const result = await requestPromise;
			return result;
		} finally {
			this.pendingRequests.delete(cacheKey);
		}
	}

	/**
	 * 从后端获取元数据
	 */
	private async fetchMetadata(
		request: MetadataRequest,
		cacheKey: string
	): Promise<ImageMetadata | null> {
		try {
			console.log(`📋 [MetadataService] 请求后端元数据: ${cacheKey}`);

			const response = await invoke<{
				path: string;
				innerPath?: string;
				name: string;
				size?: number;
				createdAt?: string;
				modifiedAt?: string;
				width?: number;
				height?: number;
				format?: string;
				colorDepth?: string;
				extra?: Record<string, unknown>;
			}>('get_image_metadata', {
				path: request.path,
				innerPath: request.innerPath
			});

			const metadata: ImageMetadata = {
				path: response.path,
				innerPath: response.innerPath,
				name: response.name || extractFileName(request.innerPath || request.path),
				size: response.size,
				createdAt: response.createdAt,
				modifiedAt: response.modifiedAt,
				width: response.width,
				height: response.height,
				format: response.format || extractFormat(response.name || ''),
				colorDepth: response.colorDepth,
				extra: response.extra
			};

			// 缓存结果
			this.cache.set(cacheKey, metadata);
			console.log(`📋 [MetadataService] 元数据已缓存: ${cacheKey}`);

			return metadata;
		} catch (error) {
			console.warn(`📋 [MetadataService] 获取元数据失败: ${cacheKey}`, error);
			return null;
		}
	}

	/**
	 * 从 Page 对象更新缓存（复用已有元数据）
	 */
	updateFromPage(page: Page, bookPath: string): void {
		const cacheKey = generateCacheKey(bookPath, page.innerPath);

		// 构建元数据
		const metadata: ImageMetadata = {
			path: page.path,
			innerPath: page.innerPath,
			name: page.name || extractFileName(page.innerPath || page.path),
			size: page.size,
			width: page.width,
			height: page.height,
			modifiedAt: page.modified ? new Date(page.modified * 1000).toISOString() : undefined,
			format: extractFormat(page.name || '')
		};

		// 更新缓存
		this.cache.set(cacheKey, metadata);
		console.log(`📋 [MetadataService] 从 Page 更新缓存: ${cacheKey}`);
	}

	/**
	 * 更新图像尺寸
	 */
	updateDimensions(path: string, width: number, height: number, innerPath?: string): void {
		const cacheKey = generateCacheKey(path, innerPath);
		const existing = this.cache.get(cacheKey);

		if (existing) {
			existing.width = width;
			existing.height = height;
			this.cache.set(cacheKey, existing);
			console.log(`📋 [MetadataService] 更新尺寸: ${cacheKey} -> ${width}x${height}`);
		} else {
			// 创建新条目
			const metadata: ImageMetadata = {
				path,
				innerPath,
				name: extractFileName(innerPath || path),
				width,
				height,
				format: extractFormat(extractFileName(innerPath || path))
			};
			this.cache.set(cacheKey, metadata);
			console.log(`📋 [MetadataService] 创建尺寸缓存: ${cacheKey} -> ${width}x${height}`);
		}

		// 如果是当前页面，同步到 infoPanelStore
		if (cacheKey === this.currentPageKey) {
			this.syncToInfoPanel(cacheKey);
		}
	}

	/**
	 * 同步当前页面元数据到 infoPanelStore
	 */
	async syncCurrentPageMetadata(
		path: string,
		innerPath?: string,
		pageIndex?: number
	): Promise<void> {
		const requestId = ++currentRequestId;
		this.latestRequestId = requestId;

		const cacheKey = generateCacheKey(path, innerPath);
		this.currentPageKey = cacheKey;

		// 先尝试从缓存获取
		let metadata = this.cache.get(cacheKey);

		if (!metadata) {
			// 从后端获取
			metadata = (await this.getMetadata({ path, innerPath, pageIndex })) ?? undefined;
		}

		// 检查是否仍是最新请求（处理竞态条件）
		if (requestId !== this.latestRequestId) {
			console.log(`📋 [MetadataService] 请求已过期，跳过同步: ${cacheKey}`);
			return;
		}

		this.syncToInfoPanel(cacheKey);
	}

	/**
	 * 同步缓存到 infoPanelStore
	 */
	private syncToInfoPanel(cacheKey: string): void {
		const metadata = this.cache.get(cacheKey);

		if (!metadata) {
			console.log(`📋 [MetadataService] 无元数据可同步: ${cacheKey}`);
			return;
		}

		// 转换为 ViewerImageInfo 格式
		const imageInfo: ViewerImageInfo = {
			path: metadata.path,
			name: metadata.name,
			format: metadata.format,
			width: metadata.width,
			height: metadata.height,
			fileSize: metadata.size,
			colorDepth: metadata.colorDepth,
			createdAt: metadata.createdAt,
			modifiedAt: metadata.modifiedAt,
			isVideo: metadata.isVideo,
			duration: metadata.duration,
			videoCodec: metadata.videoCodec,
			audioCodec: metadata.audioCodec,
			frameRate: metadata.frameRate,
			bitrate: metadata.bitrate
		};

		infoPanelStore.setImageInfo(imageInfo);
		console.log(`📋 [MetadataService] 已同步到 infoPanelStore: ${metadata.name}`);
	}

	/**
	 * 清理缓存
	 */
	clearCache(): void {
		this.cache.clear();
		this.pendingRequests.clear();
		this.currentPageKey = null;
		console.log('📋 [MetadataService] 缓存已清空');
	}

	/**
	 * 获取缓存统计
	 */
	getCacheStats(): { size: number; hits: number; misses: number; hitRate: number } {
		return this.cache.getStats();
	}

	/**
	 * 检查缓存是否存在
	 */
	hasCache(path: string, innerPath?: string): boolean {
		const cacheKey = generateCacheKey(path, innerPath);
		return this.cache.has(cacheKey);
	}

	/**
	 * 获取缓存的元数据（不触发请求）
	 */
	getCached(path: string, innerPath?: string): ImageMetadata | undefined {
		const cacheKey = generateCacheKey(path, innerPath);
		return this.cache.get(cacheKey);
	}
}

// 导出单例
export const metadataService = new MetadataServiceImpl();
