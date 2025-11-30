/**
 * Rating 缓存管理器 - 使用 rating_data JSON 字段
 */

import { invoke } from '@tauri-apps/api/core';

export interface RatingData {
	value: number;
	source: 'emm' | 'manual' | 'calculated';
	timestamp: number;
	childCount?: number;
}

export interface RatingInfo {
	rating?: number;
	source?: string;
	effectiveRating?: number;
}

interface CacheEntry {
	rating: RatingInfo;
	timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 5000;

function parseRatingData(json: string | null | undefined): RatingData | null {
	if (!json) return null;
	try {
		return JSON.parse(json) as RatingData;
	} catch {
		return null;
	}
}

function ratingDataToInfo(data: RatingData | null): RatingInfo {
	if (!data) return {};
	return {
		rating: data.value,
		source: data.source,
		effectiveRating: data.value
	};
}

class RatingCache {
	private cache = new Map<string, CacheEntry>();
	private accessOrder: string[] = [];

	async getRating(pathKey: string): Promise<RatingInfo> {
		const cached = this.cache.get(pathKey);
		if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
			return cached.rating;
		}

		try {
			const json = await invoke<string | null>('get_rating_data', { path: pathKey });
			const data = parseRatingData(json);
			const ratingInfo = ratingDataToInfo(data);
			this.setCache(pathKey, ratingInfo);
			return ratingInfo;
		} catch (e) {
			console.debug('[RatingCache] 获取失败:', e);
		}

		const emptyInfo: RatingInfo = {};
		this.setCache(pathKey, emptyInfo);
		return emptyInfo;
	}

	async batchGetRatings(pathKeys: string[]): Promise<Map<string, RatingInfo>> {
		const result = new Map<string, RatingInfo>();
		const uncachedKeys: string[] = [];

		for (const key of pathKeys) {
			const cached = this.cache.get(key);
			if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
				result.set(key, cached.rating);
			} else {
				uncachedKeys.push(key);
			}
		}

		if (uncachedKeys.length === 0) return result;

		try {
			const dbData = await invoke<Record<string, string | null>>('batch_get_rating_data', { paths: uncachedKeys });
			for (const key of uncachedKeys) {
				const json = dbData[key];
				const data = parseRatingData(json);
				const ratingInfo = ratingDataToInfo(data);
				result.set(key, ratingInfo);
				this.setCache(key, ratingInfo);
			}
		} catch (e) {
			console.error('[RatingCache] 批量获取失败:', e);
			for (const key of uncachedKeys) {
				if (!result.has(key)) {
					result.set(key, {});
					this.setCache(key, {});
				}
			}
		}

		return result;
	}

	async updateManualRating(pathKey: string, rating: number): Promise<boolean> {
		try {
			const ratingData: RatingData = { value: rating, source: 'manual', timestamp: Date.now() };
			await invoke('update_rating_data', { path: pathKey, ratingData: JSON.stringify(ratingData) });
			this.setCache(pathKey, { rating, source: 'manual', effectiveRating: rating });
			return true;
		} catch (e) {
			console.error('[RatingCache] 更新失败:', e);
			return false;
		}
	}

	clearCache() {
		this.cache.clear();
		this.accessOrder = [];
	}

	invalidate(pathKey: string) {
		this.cache.delete(pathKey);
		this.accessOrder = this.accessOrder.filter(k => k !== pathKey);
	}

	invalidateByPrefix(prefix: string) {
		for (const key of this.cache.keys()) {
			if (key.startsWith(prefix)) this.cache.delete(key);
		}
		this.accessOrder = this.accessOrder.filter(k => !k.startsWith(prefix));
	}

	/**
	 * 同步获取评分（仅从缓存，不发起网络请求）
	 */
	getRatingSync(pathKey: string): RatingInfo | null {
		const cached = this.cache.get(pathKey);
		if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
			return cached.rating;
		}
		return null;
	}

	private setCache(pathKey: string, rating: RatingInfo) {
		if (this.cache.size >= MAX_CACHE_SIZE && !this.cache.has(pathKey)) {
			const oldest = this.accessOrder.shift();
			if (oldest) this.cache.delete(oldest);
		}
		this.cache.set(pathKey, { rating, timestamp: Date.now() });
		const idx = this.accessOrder.indexOf(pathKey);
		if (idx !== -1) this.accessOrder.splice(idx, 1);
		this.accessOrder.push(pathKey);
	}
}

export const ratingCache = new RatingCache();

export function getSortableRating(info: RatingInfo, defaultValue = 0): number {
	return info.effectiveRating ?? defaultValue;
}

export async function compareByRating(pathA: string, pathB: string, ascending = false): Promise<number> {
	const ratings = await ratingCache.batchGetRatings([pathA, pathB]);
	const ratingA = getSortableRating(ratings.get(pathA) || {});
	const ratingB = getSortableRating(ratings.get(pathB) || {});
	const diff = ratingA - ratingB;
	return ascending ? diff : -diff;
}
