/**
 * 统一缩略图 Store V4
 *
 * 替代 thumbnailStoreV3 + thumbnailCacheStore
 * 所有缩略图请求走同一套缓存键、同一套事件、同一套生成队列
 *
 * 缓存键：thumbKey (string) -> { url, width, height, status }
 * 协议 URL：neoview://localhost/thumb?key=xxx&v=version
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { SvelteMap } from 'svelte/reactivity';
import { getThumbUrl as getProtocolThumbUrl } from '$lib/api/imageProtocol';

// ============================================================================
// 类型定义（与后端 thumbnail_service_v4::types 对齐）
// ============================================================================

/** 缩略图来源 */
export type ThumbnailSource =
	| { kind: 'file'; path: string; fileSize: number; modified: number }
	| {
			kind: 'archiveEntry';
			archivePath: string;
			innerPath: string;
			entryIndex: number;
			fileSize: number;
	  }
	| {
			kind: 'directoryCover';
			dirPath: string;
			representative: string;
			fileSize: number;
			modified: number;
	  }
	| { kind: 'bookPage'; bookPath: string; pageIndex: number; pagePath: string; fileSize: number };

/** 优先级通道 */
export type ThumbnailLane = 'visible' | 'reader-visible' | 'prefetch' | 'background';

/** 缩略图状态 */
export type ThumbnailStatus = 'pending' | 'loading' | 'ready' | 'failed';

/** 缓存条目 */
export interface ThumbnailEntry {
	url: string;
	width: number;
	height: number;
	status: ThumbnailStatus;
	urlVersion: number;
}

/** 缩略图请求项 */
export interface ThumbnailRequest {
	key: string;
	source: ThumbnailSource;
	maxSize: number;
}

/** 批量就绪事件项 */
interface ThumbnailReadyItem {
	key: string;
	urlVersion: number;
	width: number;
	height: number;
}

interface ThumbnailBatchReadyPayload {
	items: ThumbnailReadyItem[];
}

/** 请求参数 */
interface RequestThumbnailsParams {
	items: ThumbnailRequest[];
	contextId: string;
	lane: ThumbnailLane;
	centerIndex?: number;
	generation: number;
}

const IN_FLIGHT_TTL_MS = 60_000;

// ============================================================================
// 缓存键生成
// ============================================================================

/** 生成统一缓存键 */
export function generateThumbKey(source: ThumbnailSource, maxSize: number): string {
	const parts: string[] = [`${maxSize}`];

	switch (source.kind) {
		case 'file':
			parts.push('F', source.path, `${source.fileSize}`, `${source.modified}`);
			break;
		case 'archiveEntry':
			parts.push(
				'A',
				source.archivePath,
				source.innerPath,
				`${source.entryIndex}`,
				`${source.fileSize}`
			);
			break;
		case 'directoryCover':
			parts.push(
				'D',
				source.dirPath,
				source.representative,
				`${source.fileSize}`,
				`${source.modified}`
			);
			break;
		case 'bookPage':
			parts.push(
				'B',
				source.bookPath,
				`${source.pageIndex}`,
				source.pagePath,
				`${source.fileSize}`
			);
			break;
	}

	// 简单 hash（避免 crypto 依赖）
	const str = parts.join('|');
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash |= 0; // Convert to 32bit integer
	}
	return `${Math.abs(hash).toString(36)}`;
}

/** 生成协议 URL */
export function getThumbProtocolUrl(key: string, version: number): string {
	return `${getProtocolThumbUrl(key)}?v=${version}`;
}

// ============================================================================
// Store
// ============================================================================

class UnifiedThumbnailStore {
	/** 内存缓存 thumbKey -> ThumbnailEntry */
	private cache = new SvelteMap<string, ThumbnailEntry>();

	/** 正在请求的 key 集合 */
	private inFlight = new Set<string>();
	private inFlightStartedAt = new Map<string, number>();

	/** 上下文 -> 世代号 */
	private contextGenerations = new Map<string, number>();

	/** 上下文 -> 当前未完成的缩略图 key 集合 */
	private contextInflightKeys = new Map<string, Set<string>>();

	/** 事件监听器 */
	private batchUnlisten: UnlistenFn | null = null;

	/** 是否已初始化 */
	private initialized = false;

	/** 批量写入 RAF ID */
	private batchRafId = 0;

	/** 待写入的批量数据 */
	private pendingBatch: ThumbnailReadyItem[] = [];

	// ===========================================================================
	// 初始化
	// ===========================================================================

	async init(): Promise<void> {
		if (this.initialized) return;

		try {
			this.batchUnlisten = await listen<ThumbnailReadyItem[] | ThumbnailBatchReadyPayload>(
				'thumbnail-batch-ready',
				(event) => {
					const payload = event.payload;
					this.handleBatchReady(Array.isArray(payload) ? payload : payload.items);
				}
			);
			this.initialized = true;
		} catch (err) {
			console.error('[UnifiedThumb] init failed:', err);
		}
	}

	destroy(): void {
		if (this.batchUnlisten) {
			this.batchUnlisten();
			this.batchUnlisten = null;
		}
		if (this.batchRafId) {
			cancelAnimationFrame(this.batchRafId);
			this.batchRafId = 0;
		}
		this.cache.clear();
		this.inFlight.clear();
		this.inFlightStartedAt.clear();
		this.contextGenerations.clear();
		this.contextInflightKeys.clear();
		this.initialized = false;
	}

	// ===========================================================================
	// 缓存操作
	// ===========================================================================

	/** 获取缩略图 URL（同步，仅内存） */
	getThumbnailUrl(key: string): string | null {
		const entry = this.cache.get(key);
		if (!entry || entry.status !== 'ready') return null;
		return entry.url;
	}

	/** 获取缩略图条目 */
	getEntry(key: string): ThumbnailEntry | null {
		return this.cache.get(key) ?? null;
	}

	/** 是否有缓存 */
	hasThumbnail(key: string): boolean {
		const entry = this.cache.get(key);
		return !!entry && entry.status === 'ready';
	}

	/** 是否正在加载 */
	isLoading(key: string): boolean {
		return this.isInFlight(key);
	}

	private rememberContextKeys(contextId: string, keys: string[]): void {
		if (keys.length === 0) return;
		let contextKeys = this.contextInflightKeys.get(contextId);
		if (!contextKeys) {
			contextKeys = new Set<string>();
			this.contextInflightKeys.set(contextId, contextKeys);
		}
		for (const key of keys) {
			contextKeys.add(key);
		}
	}

	private isInFlight(key: string): boolean {
		if (!this.inFlight.has(key)) return false;
		const startedAt = this.inFlightStartedAt.get(key) ?? 0;
		if (Date.now() - startedAt <= IN_FLIGHT_TTL_MS) {
			return true;
		}

		this.releaseInFlightKey(key);
		const entry = this.cache.get(key);
		if (entry && entry.status === 'loading') {
			entry.status = 'failed';
		}
		return false;
	}

	private releaseInFlightKey(key: string): void {
		this.inFlight.delete(key);
		this.inFlightStartedAt.delete(key);
		for (const [contextId, keys] of this.contextInflightKeys) {
			keys.delete(key);
			if (keys.size === 0) {
				this.contextInflightKeys.delete(contextId);
			}
		}
	}

	private hasContextConsumer(key: string): boolean {
		for (const keys of this.contextInflightKeys.values()) {
			if (keys.has(key)) return true;
		}
		return false;
	}

	// ===========================================================================
	// 请求
	// ===========================================================================

	/** 请求缩略图 */
	async requestThumbnails(
		items: ThumbnailRequest[],
		contextId: string,
		lane: ThumbnailLane = 'visible',
		centerIndex?: number
	): Promise<void> {
		if (items.length === 0) return;

		// 记录当前 context 对未完成 key 的关注；即使 key 已由其他 context 发起，
		// 也不能让旧 context 取消时误伤这个消费者。
		const pendingItems = items.filter((item) => {
			if (this.hasThumbnail(item.key)) return false;
			return true;
		});
		// 只对全局未在途的 key 发起后端请求
		const needRequest = pendingItems.filter((item) => !this.isInFlight(item.key));
		this.rememberContextKeys(
			contextId,
			pendingItems.map((item) => item.key)
		);

		if (needRequest.length === 0) return;

		// 标记为加载中
		for (const item of needRequest) {
			this.inFlight.add(item.key);
			this.inFlightStartedAt.set(item.key, Date.now());
			const entry = this.cache.get(item.key);
			if (!entry) {
				this.cache.set(item.key, {
					url: '',
					width: 0,
					height: 0,
					status: 'loading',
					urlVersion: 0
				});
			} else if (entry.status !== 'ready') {
				entry.status = 'loading';
			}
		}

		// 获取/递增世代号
		const generation = (this.contextGenerations.get(contextId) ?? 0) + 1;
		this.contextGenerations.set(contextId, generation);

		try {
			await invoke('thumb_v4_request', {
				params: {
					items: needRequest,
					contextId,
					lane,
					centerIndex: centerIndex ?? null,
					generation
				}
			});
		} catch (err) {
			console.error('[UnifiedThumb] request failed:', err);
			// 回滚加载状态
			for (const item of needRequest) {
				this.releaseInFlightKey(item.key);
				const entry = this.cache.get(item.key);
				if (entry && entry.status === 'loading') {
					entry.status = 'failed';
				}
			}
		}
	}

	/** 取消上下文 */
	async cancelContext(contextId: string): Promise<void> {
		const contextKeys = this.contextInflightKeys.get(contextId);
		this.contextInflightKeys.delete(contextId);
		if (contextKeys) {
			for (const key of contextKeys) {
				if (this.hasContextConsumer(key)) continue;
				this.releaseInFlightKey(key);
				const entry = this.cache.get(key);
				if (entry && entry.status === 'loading') {
					entry.status = 'failed';
				}
			}
		}

		const generation = (this.contextGenerations.get(contextId) ?? 0) + 1;
		this.contextGenerations.set(contextId, generation);

		try {
			await invoke('thumb_v4_cancel_context', { contextId, generation });
		} catch (err) {
			console.warn('[UnifiedThumb] cancel failed:', err);
		}
	}

	// ===========================================================================
	// 事件处理
	// ===========================================================================

	private handleBatchReady(items: ThumbnailReadyItem[]): void {
		// 使用 RAF 合并写入，避免每张图触发响应式刷新
		const validItems = items.filter((item) => item?.key);
		if (validItems.length === 0) return;

		this.pendingBatch.push(...validItems);

		if (!this.batchRafId) {
			this.batchRafId = requestAnimationFrame(() => {
				this.flushBatch();
				this.batchRafId = 0;
			});
		}
	}

	private flushBatch(): void {
		const items = this.pendingBatch;
		this.pendingBatch = [];

		for (const item of items) {
			this.releaseInFlightKey(item.key);

			const url = getThumbProtocolUrl(item.key, item.urlVersion);
			this.cache.set(item.key, {
				url,
				width: item.width,
				height: item.height,
				status: 'ready',
				urlVersion: item.urlVersion
			});
		}
	}

	// ===========================================================================
	// 清理
	// ===========================================================================

	/** 清空缓存 */
	clear(): void {
		if (this.batchRafId) {
			cancelAnimationFrame(this.batchRafId);
			this.batchRafId = 0;
		}
		this.pendingBatch = [];
		this.cache.clear();
		this.inFlight.clear();
		this.inFlightStartedAt.clear();
		this.contextGenerations.clear();
		this.contextInflightKeys.clear();
	}

	/** 获取统计 */
	getStats(): { cached: number; loading: number; total: number } {
		let cached = 0;
		let loading = 0;
		for (const [, entry] of this.cache) {
			if (entry.status === 'ready') cached++;
			else if (entry.status === 'loading') loading++;
		}
		return { cached, loading, total: this.cache.size };
	}
}

// 导出单例
export const unifiedThumbnailStore = new UnifiedThumbnailStore();

// 便捷函数（兼容旧 API）
export function getThumbnailUrl(key: string): string | null {
	return unifiedThumbnailStore.getThumbnailUrl(key);
}

export function requestVisibleThumbnails(
	items: ThumbnailRequest[],
	contextId: string,
	centerIndex?: number
): Promise<void> {
	return unifiedThumbnailStore.requestThumbnails(items, contextId, 'visible', centerIndex);
}
