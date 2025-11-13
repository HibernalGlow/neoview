/**
 * UpscaleCacheManager Store
 * 超分缓存管理系统 - 适配 PyO3 内存中超分
 */

import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';

// 缓存项接口
export interface CacheItem {
	id: string;
	imageHash: string;
	imagePath: string;
	model: string;
	scale: number;
	upscaledData?: Uint8Array;
	upscaledBlob?: Blob;
	upscaledUrl?: string;
	createdAt: number;
	accessedAt: number;
	size: number; // 字节
	hits: number; // 访问次数
}

// 缓存统计
export interface CacheStats {
	totalItems: number;
	totalSize: number;
	hitRate: number;
	oldestItem?: CacheItem;
	newestItem?: CacheItem;
}

// 缓存状态
export interface CacheState {
	items: Map<string, CacheItem>;
	totalSize: number;
	maxSize: number; // 最大缓存大小（字节）
	stats: CacheStats;
	lastCleanup: number;
}

// 初始状态
const initialState: CacheState = {
	items: new Map(),
	totalSize: 0,
	maxSize: 500 * 1024 * 1024, // 500MB 默认
	stats: {
		totalItems: 0,
		totalSize: 0,
		hitRate: 0
	},
	lastCleanup: Date.now()
};

// 主 Store
export const upscaleCacheState = writable<CacheState>(initialState);

// 派生 Store - 缓存统计
export const cacheStats = derived(
	upscaleCacheState,
	$state => $state.stats
);

// 派生 Store - 缓存使用率
export const cacheUsagePercent = derived(
	upscaleCacheState,
	$state => ($state.totalSize / $state.maxSize) * 100
);

/**
 * 生成缓存键
 */
export function generateCacheKey(imageHash: string, model: string, scale: number): string {
	return `${imageHash}_${model}_${scale}`;
}

/**
 * 添加缓存项
 */
export function addCacheItem(
	imageHash: string,
	imagePath: string,
	model: string,
	scale: number,
	upscaledData: Uint8Array,
	upscaledBlob?: Blob,
	upscaledUrl?: string
) {
	upscaleCacheState.update(state => {
		const key = generateCacheKey(imageHash, model, scale);
		const now = Date.now();
		
		// 如果已存在，先删除旧项
		if (state.items.has(key)) {
			const oldItem = state.items.get(key)!;
			state.totalSize -= oldItem.size;
		}

		const item: CacheItem = {
			id: key,
			imageHash,
			imagePath,
			model,
			scale,
			upscaledData,
			upscaledBlob,
			upscaledUrl,
			createdAt: now,
			accessedAt: now,
			size: upscaledData.length,
			hits: 0
		};

		state.items.set(key, item);
		state.totalSize += item.size;

		// 更新统计
		updateStats(state);

		// 检查是否需要清理
		if (state.totalSize > state.maxSize) {
			cleanupLRU(state);
		}

		console.log(`[CacheManager] 添加缓存: ${key}, 大小: ${item.size}, 总大小: ${state.totalSize}`);

		return state;
	});
}

/**
 * 获取缓存项
 */
export function getCacheItem(imageHash: string, model: string, scale: number): CacheItem | undefined {
	let result: CacheItem | undefined;

	upscaleCacheState.update(state => {
		const key = generateCacheKey(imageHash, model, scale);
		const item = state.items.get(key);

		if (item) {
			// 更新访问时间和访问次数
			item.accessedAt = Date.now();
			item.hits++;
			result = item;

			// 重新插入以更新 LRU 顺序
			state.items.delete(key);
			state.items.set(key, item);

			updateStats(state);
		}

		return state;
	});

	return result;
}

/**
 * 检查缓存是否存在
 */
export function hasCacheItem(imageHash: string, model: string, scale: number): boolean {
	let result = false;

	upscaleCacheState.subscribe(state => {
		const key = generateCacheKey(imageHash, model, scale);
		result = state.items.has(key);
	})();

	return result;
}

/**
 * 删除缓存项
 */
export function removeCacheItem(imageHash: string, model: string, scale: number) {
	upscaleCacheState.update(state => {
		const key = generateCacheKey(imageHash, model, scale);
		const item = state.items.get(key);

		if (item) {
			state.totalSize -= item.size;
			state.items.delete(key);

			// 释放 Blob URL
			if (item.upscaledUrl) {
				URL.revokeObjectURL(item.upscaledUrl);
			}

			updateStats(state);
			console.log(`[CacheManager] 删除缓存: ${key}`);
		}

		return state;
	});
}

/**
 * LRU 清理
 */
function cleanupLRU(state: CacheState) {
	const sortedItems = Array.from(state.items.values())
		.sort((a, b) => a.accessedAt - b.accessedAt);

	let freed = 0;

	for (const item of sortedItems) {
		if (state.totalSize <= state.maxSize * 0.8) break; // 清理到 80% 以下

		state.totalSize -= item.size;
		freed += item.size;
		state.items.delete(item.id);

		// 释放 Blob URL
		if (item.upscaledUrl) {
			URL.revokeObjectURL(item.upscaledUrl);
		}
	}

	state.lastCleanup = Date.now();
	updateStats(state);

	console.log(`[CacheManager] LRU 清理完成，释放 ${freed} 字节`);
}

/**
 * 清空所有缓存
 */
export function clearAllCache() {
	upscaleCacheState.update(state => {
		// 释放所有 Blob URL
		for (const item of state.items.values()) {
			if (item.upscaledUrl) {
				URL.revokeObjectURL(item.upscaledUrl);
			}
		}

		state.items.clear();
		state.totalSize = 0;
		updateStats(state);

		console.log('[CacheManager] 已清空所有缓存');

		return state;
	});
}

/**
 * 设置最大缓存大小
 */
export function setMaxCacheSize(maxSizeMB: number) {
	upscaleCacheState.update(state => {
		state.maxSize = maxSizeMB * 1024 * 1024;

		// 如果超过新限制，进行清理
		if (state.totalSize > state.maxSize) {
			cleanupLRU(state);
		}

		console.log(`[CacheManager] 设置最大缓存大小: ${maxSizeMB} MB`);

		return state;
	});
}

/**
 * 更新统计信息
 */
function updateStats(state: CacheState) {
	const items = Array.from(state.items.values());
	let totalHits = 0;

	for (const item of items) {
		totalHits += item.hits;
	}

	const hitRate = items.length > 0 ? totalHits / items.length : 0;

	state.stats = {
		totalItems: state.items.size,
		totalSize: state.totalSize,
		hitRate,
		oldestItem: items.length > 0 ? items[0] : undefined,
		newestItem: items.length > 0 ? items[items.length - 1] : undefined
	};
}

/**
 * 获取缓存统计
 */
export function getCacheStats(): CacheStats {
	let stats: CacheStats = { totalItems: 0, totalSize: 0, hitRate: 0 };

	upscaleCacheState.subscribe(state => {
		stats = state.stats;
	})();

	return stats;
}

/**
 * 获取缓存使用率百分比
 */
export function getCacheUsagePercent(): number {
	let percent = 0;

	upscaleCacheState.subscribe(state => {
		percent = (state.totalSize / state.maxSize) * 100;
	})();

	return percent;
}

/**
 * 导出缓存统计到后端
 */
export async function syncCacheStatsToBackend() {
	try {
		const stats = getCacheStats();
		const percent = getCacheUsagePercent();

		await invoke('update_upscale_cache_stats', {
			totalItems: stats.totalItems,
			totalSize: stats.totalSize,
			usagePercent: percent
		});

		console.log('[CacheManager] 缓存统计已同步到后端');
	} catch (error) {
		console.error('[CacheManager] 同步缓存统计失败:', error);
	}
}

/**
 * 定期清理过期缓存
 */
export function startPeriodicCleanup(intervalMs: number = 60000) {
	const interval = setInterval(() => {
		upscaleCacheState.update(state => {
			const now = Date.now();
			const maxAge = 24 * 60 * 60 * 1000; // 24 小时

			let removed = 0;

			for (const [key, item] of state.items.entries()) {
				if (now - item.createdAt > maxAge) {
					state.totalSize -= item.size;
					state.items.delete(key);
					removed++;

					if (item.upscaledUrl) {
						URL.revokeObjectURL(item.upscaledUrl);
					}
				}
			}

			if (removed > 0) {
				updateStats(state);
				console.log(`[CacheManager] 定期清理: 删除 ${removed} 个过期缓存`);
			}

			return state;
		});
	}, intervalMs);

	return () => clearInterval(interval);
}
